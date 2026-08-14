/**
 * Catalogue, categories et creation de produit. LS-99, phase 2.
 *
 * CE QUE CE SERVICE PORTE : les regles C3, C24, C25 et C26, la validation Zod
 * des entrees (invariant 7) et les frontieres de transaction. Il ne lit ni
 * cookie ni `FormData`, qui restent dans l'adaptateur d'entree, et ne verifie
 * aucune autorisation : elle est faite par la Server Action ET par la page,
 * a partir de la session, invariant 2.
 *
 * LES ERREURS DE CONTRAINTE SONT TRADUITES, JAMAIS PROPAGEES. Une violation de
 * cle etrangere qui remonterait jusqu'a l'ecran afficherait
 * « produit_categorie_id_fkey » a l'administratrice. Chaque refus previsible a
 * donc sa classe d'erreur nommee, et l'ecran choisit son message.
 *
 * Codes Prisma verifies via Context7 sur la documentation Prisma 7 : `P2002`
 * unicite, `P2003` cle etrangere, `P2025` enregistrement introuvable.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutProduit } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import * as depot from "@/repositories/catalogue";
import * as depotSections from "@/repositories/sections-produit";
import {
  schemaCreationCategorie,
  schemaCreationProduit,
  schemaInformationsProduit,
  schemaRenommageCategorie,
  schemaReordonnancementCategories,
} from "@/services/catalogue-validation";
import { lignesDesSectionsParDefaut } from "@/services/sections-produit";

/** Le slug derive du nom est deja porte par une autre ligne, C3. */
export class SlugDejaPrisError extends Error {
  constructor(readonly slug: string) {
    super(`Le slug ${slug} est deja utilise.`);
    this.name = "SlugDejaPrisError";
  }
}

/** La categorie designee n'existe pas, ou n'existe plus. */
export class CategorieIntrouvableError extends Error {
  constructor() {
    super("Categorie introuvable.");
    this.name = "CategorieIntrouvableError";
  }
}

/**
 * C26, la categorie porte des produits et ne peut pas etre supprimee.
 *
 * PORTE LE NOMBRE, et c'est ce qui la distingue d'un refus generique : l'ecran
 * dit « 3 produits y sont rattaches » plutot que « suppression impossible »,
 * l'administratrice sachant alors quoi faire.
 */
export class CategorieNonVideError extends Error {
  constructor(readonly nombreProduits: number) {
    super(`Cette categorie porte ${nombreProduits} produit(s).`);
    this.name = "CategorieNonVideError";
  }
}

/**
 * L'ordre transmis ne couvre pas exactement les categories existantes.
 *
 * REFUS EXPLICITE ET NON RATTRAPAGE. Reecrire les rangs 1..n sur un
 * sous-ensemble entrerait en collision avec les rangs des categories omises, et
 * C24 leverait au COMMIT avec un message illisible.
 */
export class OrdreIncompletError extends Error {
  constructor(
    readonly attendues: number,
    readonly recues: number,
  ) {
    super(
      `Ordre incomplet : ${recues} categories transmises sur ${attendues}.`,
    );
    this.name = "OrdreIncompletError";
  }
}

/** Vrai si l'erreur est une violation de contrainte Prisma du code donne. */
function estErreurPrisma(erreur: unknown, code: string): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === code
  );
}

export type Categorie = {
  id: string;
  nom: string;
  slug: string;
  ordre: number;
};

export async function listerCategories(): Promise<depot.CategorieAvecCompte[]> {
  return depot.listerCategories(prisma);
}

/**
 * Cree une categorie au rang suivant.
 *
 * LA TRANSACTION COUVRE LA LECTURE DU RANG ET L'ECRITURE. Deux creations
 * simultanees liraient sinon le meme maximum et demanderaient le meme rang :
 * C24 en rejetterait une, ce qui est correct mais opaque. La transaction ne
 * serialise pas ces deux creations pour autant, et le cas reste possible ; il
 * est acceptable ici, l'administration ayant un seul acteur, et la contrainte
 * reste la ligne de defense.
 */
export async function creerCategorie(entree: unknown): Promise<Categorie> {
  const { nom, slug } = valider(schemaCreationCategorie, entree);

  try {
    return await prisma.$transaction(async (tx) => {
      const ordre = (await depot.rangMaximal(tx)) + 1;
      return depot.creerCategorie(tx, { nom, slug, ordre });
    });
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2002")) {
      throw new SlugDejaPrisError(slug);
    }
    throw erreur;
  }
}

/**
 * Renomme une categorie. LE SLUG N'EST PAS TOUCHE.
 *
 * Le recalculer changerait l'adresse publique de la categorie et casserait tous
 * ses liens entrants, sans redirection pour les rattraper. Le schema d'entree ne
 * porte deja pas ce champ ; l'absence est redite ici parce que c'est le genre de
 * « completude » qu'une relecture ajoute de bonne foi.
 */
export async function renommerCategorie(entree: unknown): Promise<Categorie> {
  const { id, nom } = valider(schemaRenommageCategorie, entree);

  try {
    return await depot.renommerCategorie(prisma, id, nom);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new CategorieIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Reecrit l'ordre complet des categories, du rang 1 au rang n.
 *
 * POURQUOI UNE LISTE EXHAUSTIVE ET NON UN DEPLACEMENT. Reecrire tous les rangs
 * rend impossible l'etat intermediaire ou un rang manque ou se repete apres
 * l'operation. Le controle d'exhaustivite ci-dessous est ce qui garantit que la
 * liste recue decrit bien toute la boutique.
 *
 * POURQUOI UNE TRANSACTION. Les ecritures se croisent : ecrire le rang 1 sur la
 * seconde categorie entre en conflit avec la premiere, qui le porte encore.
 * C'est legitime, C24 etant DEFERRABLE INITIALLY DEFERRED donc verifiee au
 * COMMIT seulement. Hors transaction, chaque instruction serait son propre
 * COMMIT et la premiere echouerait.
 *
 * AUCUN UPSERT ICI, jamais : `ON CONFLICT` ne peut pas arbitrer sur une
 * contrainte differable, PostgreSQL le refuse explicitement.
 */
export async function reordonnerCategories(entree: unknown): Promise<void> {
  const ids = valider(schemaReordonnancementCategories, entree);

  await prisma.$transaction(async (tx) => {
    const existantes = await depot.listerCategories(tx);

    if (existantes.length !== ids.length) {
      // UN `throw` ET NON UN `return`. Dans `$transaction`, seule une exception
      // annule : un refus par retour validerait les ecritures deja faites.
      // Ici rien n'est encore ecrit, mais la regle vaut pour la suite du bloc.
      throw new OrdreIncompletError(existantes.length, ids.length);
    }

    const connues = new Set(existantes.map((c) => c.id));
    for (const id of ids) {
      if (!connues.has(id)) {
        throw new CategorieIntrouvableError();
      }
    }

    for (const [index, id] of ids.entries()) {
      await depot.ecrireRang(tx, id, index + 1);
    }
  });
}

/**
 * Supprime une categorie vide, refuse une categorie peuplee. C26.
 *
 * LE COMPTAGE PRECEDE LA SUPPRESSION pour porter un message utile, mais ce
 * n'est PAS lui qui protege : la cle etrangere en RESTRICT le fait, et le
 * `catch` sur `P2003` la rattrape. Entre le comptage et la suppression, un
 * produit peut naitre ; sans ce second filet, il partirait en erreur brute.
 */
export async function supprimerCategorie(id: string): Promise<void> {
  const existante = await depot.lireCategorie(prisma, id);

  if (!existante) {
    throw new CategorieIntrouvableError();
  }

  const nombreProduits = await depot.compterProduits(prisma, id);

  if (nombreProduits > 0) {
    throw new CategorieNonVideError(nombreProduits);
  }

  try {
    await depot.supprimerCategorie(prisma, id);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2003")) {
      // La course decrite plus haut : un produit est apparu entre-temps. Le
      // compte est relu pour que le message reste exact.
      throw new CategorieNonVideError(await depot.compterProduits(prisma, id));
    }
    if (estErreurPrisma(erreur, "P2025")) {
      throw new CategorieIntrouvableError();
    }
    throw erreur;
  }
}

export type Produit = {
  id: string;
  nom: string;
  slug: string;
  categorieId: string;
};

/**
 * Cree un produit en BROUILLON, rattache a une categorie, AVEC ses quatre
 * sections par defaut. ADR-026 decision 3, LS-100.
 *
 * LE STATUT N'EST NI PARAMETRE NI ECRIT : la valeur par defaut du schema
 * s'applique. Un produit cree `ACTIF` serait publie sans variante ni media, ce
 * que C1 et C7 interdisent ; la publication est le sujet de LS-103.
 *
 * L'EXISTENCE DE LA CATEGORIE VIENT DE LA CLE ETRANGERE, pas d'une lecture
 * prealable. Entre une verification et l'ecriture, la categorie peut disparaitre
 * : la contrainte est le seul point ou la question a une reponse certaine.
 *
 * C'EST LE SEUL ENDROIT DU DEPOT QUI ECRIT LES SECTIONS PAR DEFAUT, ADR-026
 * decision 5. Aucune autre operation ne les recree : ni l'enregistrement des
 * informations du produit, ni un changement de categorie, ni une republication.
 * Une initialisation defensive rejouee ailleurs ferait revenir vide une section
 * que l'administratrice a delibermment supprimee, elle la supprimerait a
 * nouveau, et le cycle se repeterait sans qu'elle comprenne pourquoi.
 *
 * LA TRANSACTION EST CE QUI REND LE COUPLE INDISSOCIABLE. Si les sections
 * echouaient apres l'ecriture du produit, la boutique porterait un produit sans
 * aucune section, etat qu'aucun ecran ne saurait distinguer d'une suppression
 * volontaire des quatre : ADR-026 interdisant de les recreer, elles seraient
 * perdues pour de bon.
 */
export async function creerProduit(entree: unknown): Promise<Produit> {
  const { nom, slug, categorieId } = valider(schemaCreationProduit, entree);

  try {
    return await prisma.$transaction(async (tx) => {
      const produit = await depot.creerProduit(tx, { nom, slug, categorieId });
      await depotSections.creerSections(
        tx,
        lignesDesSectionsParDefaut(produit.id),
      );
      return produit;
    });
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2003")) {
      throw new CategorieIntrouvableError();
    }
    if (estErreurPrisma(erreur, "P2002")) {
      throw new SlugDejaPrisError(slug);
    }
    throw erreur;
  }
}

/** Le produit designe n'existe pas, ou n'existe plus. */
export class ProduitIntrouvableError extends Error {
  constructor() {
    super("Produit introuvable.");
    this.name = "ProduitIntrouvableError";
  }
}

export type ProduitDetaille = {
  id: string;
  nom: string;
  slug: string;
  categorieId: string;
  descriptionCourte: string | null;
  /*
   * `StatutProduit` ET NON `string`. Typer en chaine laisserait l'ecran traiter
   * l'etat par un ternaire a deux branches, ou par un texte en dur : le jour ou
   * une valeur s'ajoute a l'enum, rien ne rougirait. Le piege est deja survenu
   * deux fois ici, sur un index partiel puis sur un ternaire du JSX.
   */
  statut: StatutProduit;
};

/** Un produit et ses informations generales, pour l'ecran d'edition. */
export async function lireProduit(id: string): Promise<ProduitDetaille | null> {
  return depot.lireProduit(prisma, id);
}

/**
 * Enregistre les informations generales d'un produit. LS-100.
 *
 * CETTE OPERATION NE TOUCHE AUCUNE SECTION, et c'est le point de vigilance
 * central d'ADR-026 decision 5. Le geste ordinaire de l'administratrice,
 * corriger un texte de presentation et enregistrer, ne doit RIEN recreer :
 * ajouter ici une initialisation des quatre sections ferait revenir vide celle
 * qu'elle vient de supprimer.
 *
 * LE SLUG N'EST PAS RECALCULE, meme raison que pour le renommage d'une
 * categorie : il porte l'adresse publique de la fiche, et la changer casserait
 * tous les liens entrants sans redirection. Le schema d'entree ne porte pas ce
 * champ.
 *
 * LE STATUT NON PLUS. Publier et archiver sont des transitions avec leurs
 * propres conditions, media principal et texte alternatif obligatoires : elles
 * sont le sujet de LS-103. Les laisser passer par un formulaire d'informations
 * generales contournerait ces controles.
 */
export async function enregistrerInformationsProduit(
  entree: unknown,
): Promise<void> {
  const { id, nom, descriptionCourte } = valider(
    schemaInformationsProduit,
    entree,
  );

  try {
    await depot.ecrireInformationsProduit(prisma, id, {
      nom,
      descriptionCourte,
    });
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new ProduitIntrouvableError();
    }
    throw erreur;
  }
}
