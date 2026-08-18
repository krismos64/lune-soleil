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
import * as depotMedias from "@/repositories/media";
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

/**
 * Ce qui manque a un produit pour etre publiable, C1, C7 et C8.
 *
 * UNE LISTE ET NON UN BOOLEEN. Le parcours 3 exige que l'ecran indique LE CHAMP
 * MANQUANT : rendre « publication refusee » obligerait l'exploitante a deviner
 * laquelle des quatre conditions a echoue, sur un ecran qui porte trois blocs.
 *
 * L'ORDRE DES MOTIFS SUIT L'ORDRE DU PARCOURS 3, variante puis photos puis
 * descriptions : c'est l'ordre dans lequel le travail se fait, donc celui dans
 * lequel il faut le reprendre.
 */
export type MotifNonPubliable =
  /** C1, aucune variante non archivee : ni prix ni stock, donc rien a vendre. */
  | "AUCUNE_VARIANTE"
  /** C7 et C9, aucune photo de rang 1 : la boutique n'a rien a montrer. */
  | "AUCUN_MEDIA_PRINCIPAL"
  /** C8, au moins une photo dont le traitement a echoue ou n'est pas fini. */
  | "MEDIA_NON_TRAITE"
  /** C7, au moins une photo sans texte alternatif, exigence WCAG 2.2 AA. */
  | "TEXTE_ALTERNATIF_MANQUANT";

/** Le produit ne remplit pas les conditions de publication. */
export class ProduitNonPubliableError extends Error {
  constructor(readonly motifs: MotifNonPubliable[]) {
    super(`Publication refusee : ${motifs.join(", ")}.`);
    this.name = "ProduitNonPubliableError";
  }
}

/** La transition demandee n'a pas de sens depuis l'etat courant. */
export class TransitionProduitInvalideError extends Error {
  constructor(
    readonly statutActuel: StatutProduit,
    readonly statutVise: StatutProduit,
  ) {
    super(`Transition refusee : ${statutActuel} vers ${statutVise}.`);
    this.name = "TransitionProduitInvalideError";
  }
}

/**
 * Enumere ce qui manque, sans rien ecrire.
 *
 * SERT L'ECRAN AUTANT QUE LA PUBLICATION : l'ecran l'appelle pour afficher la
 * liste AVANT que l'exploitante ne tente de publier, ce qui lui evite un refus
 * qu'elle aurait pu voir venir. La publication la rappelle pour decider, sans
 * faire confiance a ce que l'ecran a affiche : l'etat a pu changer entre les
 * deux, et un client n'autorise rien, invariant 2.
 */
export async function motifsNonPubliable(
  client: depot.ClientBase,
  produitId: string,
): Promise<MotifNonPubliable[]> {
  const conditions = await depot.compterConditionsPublication(
    client,
    produitId,
  );
  const motifs: MotifNonPubliable[] = [];

  if (conditions.variantesVivantes === 0) {
    motifs.push("AUCUNE_VARIANTE");
  }
  if (!conditions.aMediaPrincipal || conditions.mediasTraites === 0) {
    motifs.push("AUCUN_MEDIA_PRINCIPAL");
  }
  if (conditions.mediasNonTraites > 0) {
    motifs.push("MEDIA_NON_TRAITE");
  }
  if (conditions.mediasSansTexte > 0) {
    motifs.push("TEXTE_ALTERNATIF_MANQUANT");
  }

  return motifs;
}

/**
 * Publie un produit, parcours 3 etape 7.
 *
 * LES CONDITIONS SONT RELUES DANS LA TRANSACTION, jamais reprises de l'ecran.
 * C1, C7 et C8 sont des controles APPLICATIFS de niveau 3 : aucune contrainte
 * de base ne peut les porter, elles comptent des lignes d'autres tables. Le
 * service est donc le seul endroit qui les tient, et un appel direct a la
 * Server Action doit y buter comme un clic.
 *
 * `publieA` N'EST ECRIT QU'A LA PREMIERE PUBLICATION. Le schema l'exige : un
 * produit depublie puis republie GARDE sa date d'origine, qui porte
 * l'anteriorite et le tri des nouveautes. La reecrire ferait remonter en tete
 * du catalogue un produit ancien qu'on vient de reactiver.
 *
 * PUBLIER UN PRODUIT DEJA `ACTIF` EST REFUSE plutot qu'ignore. Le silence
 * laisserait croire a un effet ; le refus dit que rien n'etait a faire.
 */
export async function publierProduit(produitId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const produit = await depot.lireEtatPublication(tx, produitId);
    if (!produit) {
      // UN `throw` ET NON UN `return`, dans `$transaction` seule une exception
      // annule : un refus par retour validerait les ecritures deja faites.
      throw new ProduitIntrouvableError();
    }

    if (produit.statut === "ACTIF") {
      throw new TransitionProduitInvalideError("ACTIF", "ACTIF");
    }

    const motifs = await motifsNonPubliable(tx, produitId);
    if (motifs.length > 0) {
      throw new ProduitNonPubliableError(motifs);
    }

    await depot.ecrireStatutProduit(tx, produitId, {
      statut: "ACTIF",
      // Premiere publication seulement, voir ci-dessus.
      ...(produit.publieA === null ? { publieA: new Date() } : {}),
      // REPUBLIER EFFACE LA DATE D'ARCHIVAGE, sans quoi un produit `ACTIF`
      // porterait un `archiveA` renseigne : deux affirmations contradictoires
      // dans la meme ligne, dont la prochaine requete choisirait l'une ou
      // l'autre selon ce qu'elle filtre.
      archiveA: null,
    });
  });
}

/**
 * Archive un produit, il sort du catalogue.
 *
 * AUCUNE LIGNE DE COMMANDE N'EST TOUCHEE, C11 et invariant 3. Les lignes
 * portent une copie figee du nom et du prix : c'est ce qui rend une facture
 * opposable, et c'est le critere 5 de cette story, prouve par un test qui relit
 * une commande apres archivage.
 *
 * AUCUN MOUVEMENT DE STOCK NON PLUS. Retirer un produit du catalogue web ne
 * fait disparaitre aucune piece : elle reste vendable en main propre, C16 pour
 * les variantes, invariant 6. Ne pas « remettre le stock a zero » ici.
 */
export async function archiverProduit(produitId: string): Promise<void> {
  const produit = await depot.lireEtatPublication(prisma, produitId);
  if (!produit) {
    throw new ProduitIntrouvableError();
  }

  if (produit.statut === "ARCHIVE") {
    throw new TransitionProduitInvalideError("ARCHIVE", "ARCHIVE");
  }

  await depot.ecrireStatutProduit(prisma, produitId, {
    statut: "ARCHIVE",
    archiveA: new Date(),
    // `publieA` N'EST PAS EFFACE : il porte la date de PREMIERE publication,
    // un fait historique que l'archivage ne dement pas.
  });
}

/**
 * Les trois etats publics de disponibilite, `frontend-design.md`.
 *
 * TROIS ET PAS QUATRE, et surtout aucune quantite. « 7 en stock » exposerait le
 * niveau d'activite de la boutique sans rien apporter au client. « Derniere
 * piece » fait exception parce que c'est une information d'urgence VRAIE, et
 * c'est le cas ordinaire ici, chaque bijou etant fait main.
 */
export type EtatDisponibilite = "EN_STOCK" | "DERNIERE_PIECE" | "EPUISE";

/**
 * Derive l'etat public d'une quantite disponible.
 *
 * COTE SERVEUR, JAMAIS DANS LE NAVIGATEUR. La regle l'impose, et la raison est
 * qu'un calcul cote client obligerait a transmettre la quantite exacte pour la
 * masquer ensuite : elle serait lisible dans le HTML.
 *
 * LA QUANTITE RECUE EST DEJA NETTE DES RESERVATIONS, voir
 * `listerProduitsPublies`. Une piece reservee par un autre client, paiement en
 * cours, n'est pas disponible.
 */
export function etatDisponibilite(
  quantiteDisponible: number,
): EtatDisponibilite {
  if (quantiteDisponible <= 0) {
    return "EPUISE";
  }

  return quantiteDisponible === 1 ? "DERNIERE_PIECE" : "EN_STOCK";
}

/** Une carte du catalogue public, prete a afficher. */
export type ProduitCatalogue = {
  id: string;
  nom: string;
  slug: string;
  categorieId: string;
  categorieNom: string;
  prixCentimes: number;
  disponibilite: EtatDisponibilite;
  mediaChemin: string | null;
  mediaTexteAlternatif: string | null;
};

/** Ce que le catalogue public rend, produits et filtres disponibles. */
export type Catalogue = {
  produits: ProduitCatalogue[];
  categories: { id: string; nom: string; slug: string }[];
  /*
   * LA CATEGORIE RETENUE EST RENDUE ENTIERE, et non son seul slug. L'ecran doit
   * pouvoir la NOMMER, et il ne peut pas la retrouver dans `categories` : cette
   * liste ne porte que les categories AYANT du contenu publie, donc jamais celle
   * qu'on filtre quand elle vient d'etre vidée. Rendre le slug seul obligeait
   * l'ecran a dire « aucune piece dans cette categorie » sans jamais dire
   * laquelle, defaut releve en revue.
   */
  categorieRetenue: { id: string; nom: string; slug: string } | null;
};

/**
 * Le catalogue public, LS-104.
 *
 * LA CATEGORIE DEMANDEE EST UN SLUG ET NON UN IDENTIFIANT. L'URL est publique et
 * partageable : `?categorie=colliers` se lit, se retient et survit a une
 * reinitialisation de la base, quand un UUID ne dit rien et se perime.
 *
 * UN SLUG INCONNU NE LEVE PAS, il rend le catalogue entier sans filtre. Une URL
 * partagee apres qu'une categorie a ete renommee doit montrer la boutique, pas
 * une erreur : le visiteur n'a rien fait de mal. C'est aussi ce qui evite de
 * transformer une entree d'URL en 404 exploitable pour deviner les categories
 * existantes.
 *
 * LES CATEGORIES PROPOSEES SONT CELLES QUI PORTENT DU PUBLIE, et elles sont lues
 * meme quand un filtre s'applique : la barre de filtres doit rester complete
 * pour permettre d'en changer, sans quoi on ne pourrait plus revenir en arriere
 * qu'en effacant l'URL a la main.
 *
 * LA CATEGORIE DEMANDEE EST CHERCHEE PLUS LARGE QUE LA BARRE DE FILTRES, et un
 * test l'a impose. Une categorie dont tout le contenu vient d'etre archive ou
 * retire de la vente web sort de la liste des categories proposees : la chercher
 * parmi elles seulement la rendait « inconnue », donc ignoree, et l'ecran
 * affichait le catalogue ENTIER sans jamais dire pourquoi le filtre demande
 * n'avait pas ete applique.
 *
 * Elle est donc resolue sur les categories EXISTANTES. Une categorie reelle mais
 * vide reste retenue, ce qui permet a l'ecran d'annoncer « aucun resultat dans
 * Bagues » et de proposer d'effacer le filtre, l'etat vide exige par
 * `PROTOTYPE.md`. Seul un slug qui ne correspond a RIEN retombe sur le catalogue
 * complet.
 */
export async function lireCataloguePublic(
  slugCategorie?: string,
): Promise<Catalogue> {
  const categories = await depot.listerCategoriesPubliees(prisma);

  const categorieRetenue = slugCategorie
    ? await depot.lireCategorieParSlug(prisma, slugCategorie)
    : null;

  /*
   * LA CLE EST OMISE ET NON PASSEE A `undefined`. Le projet active
   * `exactOptionalPropertyTypes` : `{ categorieId: undefined }` n'y satisfait pas
   * `{ categorieId?: string }`, et la distinction est utile ici, « aucun filtre »
   * et « filtre sur rien » n'ayant pas le meme sens pour la requete.
   */
  const lignes = await depot.listerProduitsPublies(
    prisma,
    categorieRetenue ? { categorieId: categorieRetenue.id } : {},
  );

  return {
    produits: lignes.map((ligne) => ({
      id: ligne.id,
      nom: ligne.nom,
      slug: ligne.slug,
      categorieId: ligne.categorieId,
      categorieNom: ligne.categorieNom,
      prixCentimes: ligne.prixMinimumCentimes,
      disponibilite: etatDisponibilite(ligne.quantiteDisponible),
      mediaChemin: ligne.mediaChemin,
      mediaTexteAlternatif: ligne.mediaTexteAlternatif,
    })),
    categories,
    categorieRetenue,
  };
}

/** Une variante telle que la fiche publique l'expose, LS-105. */
export type VarianteFiche = {
  id: string;
  libelle: string;
  dimensions: string | null;
  prixCentimes: number;
  disponibilite: EtatDisponibilite;
};

/** Une photographie de la galerie, LS-105. */
export type PhotoFiche = {
  id: string;
  chemin: string;
  texteAlternatif: string | null;
};

/** Une section editoriale affichable, LS-105. */
export type SectionFiche = {
  id: string;
  titre: string;
  contenu: string;
};

/** Ce que la fiche produit publique rend, LS-105. */
export type FicheProduit = {
  id: string;
  nom: string;
  slug: string;
  descriptionCourte: string | null;
  categorieNom: string;
  categorieSlug: string;
  variantes: VarianteFiche[];
  photos: PhotoFiche[];
  sections: SectionFiche[];
};

/**
 * La fiche produit publique, LS-105.
 *
 * REND `null` PLUTOT QUE DE LEVER, et l'ecran en fait un 404. Un slug inconnu
 * et un produit en brouillon donnent la MEME reponse : distinguer les deux
 * dirait a un visiteur quels slugs existent en brouillon, donc quels produits
 * sont en preparation.
 *
 * LES SECTIONS SONT FILTREES ICI, pas dans le composant. Deux conditions, C22
 * et C23 : une section non visible ne s'affiche pas, une section sans contenu
 * ne s'affiche pas non plus, titre compris. Le filtre vit dans le service parce
 * que c'est une regle metier, et qu'un composant qui l'oublierait laisserait un
 * titre seul suivi d'un blanc.
 *
 * `trim()` ET NON `!== ""`. Une section dont le contenu ne porte que des
 * espaces ou des retours a la ligne est vide au sens de la regle : la garder
 * afficherait son titre au-dessus d'un trou, exactement ce que C23 evite.
 *
 * L'ORDRE DES SECTIONS EST CELUI DE L'ADMINISTRATRICE, ADR-026, deja rendu par
 * `listerSections`. Ne jamais le retrier ici.
 */
export async function lireFichePublique(
  slug: string,
): Promise<FicheProduit | null> {
  const fiche = await depot.lireFicheParSlug(prisma, slug);

  if (fiche === null) {
    return null;
  }

  const [photos, sections] = await Promise.all([
    depotMedias.listerMediasPublies(prisma, fiche.id),
    depotSections.listerSections(prisma, fiche.id),
  ]);

  return {
    id: fiche.id,
    nom: fiche.nom,
    slug: fiche.slug,
    descriptionCourte: fiche.descriptionCourte,
    categorieNom: fiche.categorieNom,
    categorieSlug: fiche.categorieSlug,
    variantes: fiche.variantes.map((variante) => ({
      id: variante.id,
      libelle: variante.libelle,
      dimensions: variante.dimensions,
      prixCentimes: variante.prixCentimes,
      disponibilite: etatDisponibilite(variante.quantiteDisponible),
    })),
    photos: photos.map((photo) => ({
      id: photo.id,
      chemin: photo.chemin,
      texteAlternatif: photo.texteAlternatif,
    })),
    sections: sections
      .filter((section) => section.visible && section.contenu.trim() !== "")
      .map((section) => ({
        id: section.id,
        titre: section.titre,
        contenu: section.contenu,
      })),
  };
}
