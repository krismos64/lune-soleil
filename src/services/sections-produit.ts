/**
 * Sections editoriales de la fiche produit, LS-100 et LS-87. ADR-026.
 *
 * CE QUE CE SERVICE PORTE : les regles C20, C22 et C23, la validation Zod des
 * entrees (invariant 7), la verification d'appartenance et les frontieres de
 * transaction. Il ne lit ni cookie ni `FormData`, qui restent dans l'adaptateur
 * d'entree, et ne verifie aucune autorisation : elle est faite par la Server
 * Action ET par la page, a partir de la session, invariant 2.
 *
 * LES QUATRE SECTIONS PAR DEFAUT NE SONT ECRITES QU'A LA CREATION D'UN PRODUIT,
 * et `SECTIONS_PAR_DEFAUT` n'est exporte que vers `catalogue.ts` pour cela.
 * Aucune fonction de ce fichier ne les recree, et c'est la decision 5 d'ADR-026,
 * pas un detail d'implementation : une initialisation defensive, du type
 * « garantir que les quatre sections existent » rejouee a chaque
 * enregistrement, ferait revenir vide une section delibermment supprimee.
 * L'administratrice la supprimerait a nouveau, sans comprendre pourquoi.
 *
 * L'IDENTIFIANT D'UNE SECTION DESIGNE, IL N'AUTORISE PAS, invariant 2. Toute
 * operation qui recoit un identifiant de section verifie son appartenance au
 * produit avant d'ecrire : sans cela, une liste de reordonnancement de la bonne
 * longueur portant une section etrangere la deplacerait chez le produit voisin.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import * as depot from "@/repositories/sections-produit";
import {
  engendrerCleSection,
  schemaAjoutSection,
  schemaModificationSection,
  schemaReordonnancementSections,
  schemaSuppressionSection,
  schemaVisibiliteSection,
} from "@/services/sections-produit-validation";

export type Section = depot.Section;

/** La section designee n'existe pas, ou n'appartient pas au produit vise. */
export class SectionIntrouvableError extends Error {
  constructor() {
    super("Section introuvable.");
    this.name = "SectionIntrouvableError";
  }
}

/** Le produit designe n'existe pas, ou n'existe plus. */
export class ProduitIntrouvableError extends Error {
  constructor() {
    super("Produit introuvable.");
    this.name = "ProduitIntrouvableError";
  }
}

/**
 * L'ordre transmis ne couvre pas exactement les sections du produit.
 *
 * REFUS EXPLICITE ET NON RATTRAPAGE, meme motif qu'en LS-99. Reecrire les rangs
 * 1..n sur un sous-ensemble entrerait en collision avec les rangs des sections
 * omises, et C22 leverait au COMMIT avec un message illisible.
 */
export class OrdreSectionsIncompletError extends Error {
  constructor(
    readonly attendues: number,
    readonly recues: number,
  ) {
    super(`Ordre incomplet : ${recues} sections transmises sur ${attendues}.`);
    this.name = "OrdreSectionsIncompletError";
  }
}

/**
 * Les QUATRE sections proposees a la creation d'un produit, ADR-026 decision 3.
 *
 * QUATRE ET NON CINQ, et c'est le sujet de LS-87. Le prototype en propose une
 * cinquieme, `dimensions`, entre `matieres` et `fabrication`. ADR-026 l'ecarte :
 * la dimension appartient a `Variante.dimensions`, elle VARIE d'une declinaison
 * a l'autre, un collier en 42 et 45 cm. Une section de texte libre au niveau du
 * produit ne peut pas porter une donnee qui depend de la variante, et le
 * prototype le demontre involontairement en affichant « Longueur selectionnee :
 * 42 cm » dans un champ qui resterait fige.
 *
 * Une section personnalisee peut porter un guide des tailles. Ce qu'elle ne
 * porte jamais, c'est la dimension structuree de la variante.
 *
 * « PROPOSEES » ET NON « IMPOSEES ». Aucune n'est protegee : l'administratrice
 * les renomme, les reordonne, les masque et les supprime comme les autres.
 */
export const SECTIONS_PAR_DEFAUT = [
  { cle: "description", titre: "Description détaillée" },
  { cle: "matieres", titre: "Matières et composants" },
  { cle: "fabrication", titre: "Fabrication" },
  { cle: "entretien", titre: "Conseils d'entretien" },
] as const;

/**
 * Lignes des sections par defaut d'un produit, pretes a ecrire.
 *
 * APPELEE PAR LE SEUL CAS D'USAGE DE CREATION, `catalogue.creerProduit`, DANS
 * SA TRANSACTION. Elle n'est appelee nulle part ailleurs, et ne doit pas
 * l'etre : voir l'en-tete de ce fichier et ADR-026 decision 5.
 *
 * `contenu` VIDE, c'est l'etat normal d'une section proposee mais pas encore
 * redigee. `visible` n'est pas ecrit, la valeur par defaut du schema, vrai,
 * s'applique.
 */
export function lignesDesSectionsParDefaut(produitId: string) {
  return SECTIONS_PAR_DEFAUT.map((section, index) => ({
    produitId,
    cle: section.cle,
    titre: section.titre,
    contenu: "",
    ordre: index + 1,
  }));
}

/** Vrai si l'erreur est une violation de contrainte Prisma du code donne. */
function estErreurPrisma(erreur: unknown, code: string): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === code
  );
}

/** Sections d'un produit, dans l'ordre, masquees comprises. */
export async function listerSections(produitId: string): Promise<Section[]> {
  return depot.listerSections(prisma, produitId);
}

/**
 * Rend une cle libre pour ce produit, en suffixant si besoin.
 *
 * DEUX SECTIONS DE MEME TITRE SONT LEGITIMES, deux guides des tailles par
 * exemple, et leur cle derivee serait identique. Sans ce suffixe, l'unicite
 * `section_produit_cle_unique` rejetterait la seconde avec un message que rien
 * ne relie au formulaire.
 *
 * LA BOUCLE EST BORNEE PAR LE NOMBRE DE CLES DEJA PRISES : au pire, chacune
 * bloque un suffixe, donc `prises.size + 2` essais suffisent toujours. Une
 * boucle non bornee sur une condition d'unicite est le genre de code qui tourne
 * indefiniment le jour ou une hypothese se revele fausse.
 */
function cleLibre(base: string, prises: Set<string>): string {
  if (!prises.has(base)) {
    return base;
  }

  for (let suffixe = 2; suffixe <= prises.size + 2; suffixe += 1) {
    const candidate = `${base}-${suffixe}`;
    if (!prises.has(candidate)) {
      return candidate;
    }
  }

  // Inatteignable par construction, la borne ci-dessus couvrant tous les cas.
  // Lever plutot que rendre une cle en collision : l'ecran traduit un refus,
  // il ne saurait rien faire d'une ligne ecrite au mauvais endroit.
  throw new Error("Aucune cle de section disponible.");
}

/**
 * Ajoute une section au rang suivant. La cle est DERIVEE du titre, C20.
 *
 * LA TRANSACTION COUVRE LA LECTURE DU RANG ET DES CLES, ET L'ECRITURE. Deux
 * ajouts simultanes liraient sinon le meme maximum et demanderaient le meme
 * rang : C22 en rejetterait un au COMMIT, ce qui est correct mais opaque. Comme
 * en LS-99, la transaction ne serialise pas ces deux ajouts pour autant, et la
 * contrainte reste la ligne de defense ; le cas est acceptable, l'administration
 * ayant un seul acteur.
 */
export async function ajouterSection(entree: unknown): Promise<Section> {
  const { produitId, titre } = valider(schemaAjoutSection, entree);

  try {
    return await prisma.$transaction(async (tx) => {
      const prises = await depot.clesExistantes(tx, produitId);
      const ordre = (await depot.rangMaximal(tx, produitId)) + 1;

      return depot.creerSection(tx, {
        produitId,
        cle: cleLibre(engendrerCleSection(titre), prises),
        titre,
        contenu: "",
        ordre,
      });
    });
  } catch (erreur) {
    // L'EXISTENCE DU PRODUIT VIENT DE LA CLE ETRANGERE, pas d'une lecture
    // prealable. Entre une verification et l'ecriture, le produit peut
    // disparaitre : la contrainte est le seul point ou la question a une
    // reponse certaine.
    if (estErreurPrisma(erreur, "P2003")) {
      throw new ProduitIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Ecrit le titre et le contenu d'une section. LA CLE N'EST PAS TOUCHEE, C20.
 *
 * Renommer « Matières et composants » en « Composants » change `titre` et laisse
 * `cle` a `matieres`. Le schema d'entree ne porte deja pas ce champ ; l'absence
 * est redite ici parce que c'est le genre de completude qu'une relecture ajoute
 * de bonne foi.
 */
export async function modifierSection(entree: unknown): Promise<void> {
  const { id, titre, contenu } = valider(schemaModificationSection, entree);

  try {
    await depot.ecrireTitreEtContenu(prisma, id, titre, contenu);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new SectionIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Masque ou reaffiche une section, C22.
 *
 * MASQUER CONSERVE LE CONTENU. C'est ce qui distingue ce geste de la
 * suppression, et l'ecran doit proposer les deux : masquer pour une section en
 * cours de redaction, supprimer quand le texte n'a plus lieu d'etre.
 */
export async function basculerVisibilite(entree: unknown): Promise<void> {
  const { id, visible } = valider(schemaVisibiliteSection, entree);

  try {
    await depot.ecrireVisibilite(prisma, id, visible);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new SectionIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Supprime une section. LA LIGNE PART, CONTENU COMPRIS, ADR-026 decision 5.
 *
 * AUCUNE CONSERVATION SILENCIEUSE d'un contenu devenu inaccessible : une ligne
 * qu'aucune interface n'affiche et qu'aucune regle ne rappelle est une donnee
 * orpheline qui reapparait des mois plus tard sans que personne sache si elle
 * est a jour. L'ecran avertit avant, et propose le masquage comme solution de
 * rechange quand l'intention est seulement de retirer la section de la fiche.
 *
 * LES RANGS RESTANTS NE SONT PAS RENUMEROTES. Un trou dans la suite, 1, 2, 4,
 * est sans consequence : l'affichage suit `ORDER BY ordre` et la contrainte ne
 * porte que sur l'unicite. Renumeroter ferait ecrire trois lignes la ou une
 * suppression suffit, avec les collisions transitoires que cela suppose.
 *
 * CETTE SUPPRESSION NE TOUCHE AUCUNE COMMANDE, et ne contredit donc pas
 * l'invariant 3 : une section est une donnee de catalogue, et `LigneCommande`
 * fige ses propres libelles au moment de la vente. Une variante, elle, ne se
 * supprime jamais, C13, parce qu'une commande la reference.
 */
export async function supprimerSection(entree: unknown): Promise<void> {
  const { id } = valider(schemaSuppressionSection, entree);

  try {
    await depot.supprimerSection(prisma, id);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new SectionIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Reecrit l'ordre complet des sections d'un produit, du rang 1 au rang n.
 *
 * POURQUOI UNE LISTE EXHAUSTIVE ET NON UN DEPLACEMENT. Reecrire tous les rangs
 * rend impossible l'etat intermediaire ou un rang manque ou se repete apres
 * l'operation. Le controle d'exhaustivite ci-dessous garantit que la liste recue
 * decrit bien toutes les sections du produit.
 *
 * POURQUOI UNE TRANSACTION. Les ecritures se croisent : ecrire le rang 1 sur la
 * deuxieme section entre en conflit avec la premiere, qui le porte encore.
 * C'est legitime, C22 etant DEFERRABLE INITIALLY DEFERRED donc verifiee au
 * COMMIT seulement. Hors transaction, chaque instruction serait son propre
 * COMMIT et la premiere echouerait.
 *
 * AUCUN UPSERT ICI, jamais : `ON CONFLICT` ne peut pas arbitrer sur une
 * contrainte differable, PostgreSQL le refuse explicitement.
 *
 * L'APPARTENANCE EST VERIFIEE SECTION PAR SECTION, invariant 2. Une liste de la
 * bonne longueur portant l'identifiant d'une section d'un autre produit
 * deplacerait cette derniere chez le voisin : le `produitId` de l'entree dit
 * quel ensemble doit etre couvert, et les identifiants recus doivent tous en
 * faire partie.
 */
export async function reordonnerSections(entree: unknown): Promise<void> {
  const { produitId, ids } = valider(schemaReordonnancementSections, entree);

  await prisma.$transaction(async (tx) => {
    const existantes = await depot.listerSections(tx, produitId);

    if (existantes.length !== ids.length) {
      // UN `throw` ET NON UN `return`. Dans `$transaction`, seule une exception
      // annule : un refus par retour validerait les ecritures deja faites.
      // Ici rien n'est encore ecrit, mais la regle vaut pour la suite du bloc.
      throw new OrdreSectionsIncompletError(existantes.length, ids.length);
    }

    const connues = new Set(existantes.map((s) => s.id));
    for (const id of ids) {
      if (!connues.has(id)) {
        throw new SectionIntrouvableError();
      }
    }

    for (const [index, id] of ids.entries()) {
      await depot.ecrireRang(tx, id, index + 1);
    }
  });
}
