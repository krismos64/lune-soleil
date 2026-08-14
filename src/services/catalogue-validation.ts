/**
 * Validation des entrees du catalogue, LS-99. Invariant 7.
 *
 * POURQUOI UN FICHIER SEPARE DU SERVICE. Ces schemas sont importes par les
 * Server Actions autant que par le service, et par les tests unitaires qui
 * tournent sans base. Les loger dans `catalogue.ts` forcerait tout test de
 * validation a charger le client Prisma, donc a exiger une base pour verifier
 * qu'une chaine vide est refusee.
 *
 * CE QUE CES SCHEMAS NE FONT PAS. Ils ne verifient aucune existence et
 * n'autorisent rien, invariant 2 : un `categorieId` bien forme ne prouve ni que
 * la categorie existe, ni que l'appelant a le droit d'y toucher. L'existence
 * vient de la cle etrangere, le droit vient de la session.
 */
import { z } from "zod";

import { schemaIdentifiant } from "@/lib/validation";

/**
 * Longueur maximale d'un nom de categorie ou de produit.
 *
 * Aucune contrainte de longueur n'existe en base, les colonnes etant en `TEXT`.
 * Cette borne est donc une regle d'interface et non un reflet du schema : elle
 * evite qu'un copier-coller malheureux remplisse une carte de catalogue sur
 * trois lignes a 320 px. Generreuse a dessein, un nom de bijou tenant tres
 * largement dedans.
 */
const LONGUEUR_MAX_NOM = 120;

/**
 * Engendre un slug d'URL a partir d'un nom lisible.
 *
 * TROIS ETAPES, ET L'ORDRE COMPTE.
 *
 * 1. `normalize("NFD")` decompose les caracteres accentues en lettre de base
 *    plus diacritique, puis la classe unicode `\p{Diacritic}` retire ces
 *    derniers. C'est ce qui transforme « é » en « e » sans table de
 *    correspondance ecrite a la main.
 * 2. Tout ce qui n'est ni lettre ASCII, ni chiffre, devient un tiret. Une liste
 *    de caracteres INTERDITS serait fausse par construction : il en resterait
 *    toujours un non prevu. Une liste d'AUTORISES ferme la question.
 * 3. Les tirets multiples ou de bordure sont resorbes.
 *
 * REND UNE CHAINE VIDE quand rien n'est exploitable, et ne fabrique aucun
 * remplacement. Un slug invente ferait apparaitre une categorie que personne
 * n'a nommee ainsi ; c'est aux schemas ci-dessous de refuser l'entree.
 *
 * NE PAS L'APPELER SUR UN NOM DEJA PUBLIE. Le slug d'une categorie vivante ne
 * se recalcule jamais, sous peine de casser tous les liens entrants sans
 * redirection : le renommage ne porte donc pas ce champ.
 */
export function engendrerSlug(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nom lisible, borne et non vide une fois les espaces de bordure coupes.
 *
 * L'ORDRE `trim` PUIS `min(1)` EST LE POINT. Valider avant de couper laisserait
 * passer trois espaces, qui atteindraient alors `chk_categorie_nom_non_vide` et
 * rendraient une erreur PostgreSQL brute a l'administratrice.
 */
const schemaNom = z
  .string("Un nom est attendu.")
  .trim()
  .min(1, "Le nom ne peut pas etre vide.")
  .max(LONGUEUR_MAX_NOM, `Le nom depasse ${LONGUEUR_MAX_NOM} caracteres.`);

/**
 * Nom dont le slug engendre est non vide, refus formule sur le nom.
 *
 * `« 日本語 »` est un nom parfaitement valide pour un humain et ne produit
 * aucun slug : sans ce refus, la categorie s'ecrirait avec un slug vide, et la
 * seconde dans le meme cas heurterait l'unicite C3 avec un message
 * incomprehensible.
 */
const schemaNomAvecSlug = schemaNom.refine(
  (nom) => engendrerSlug(nom).length > 0,
  "Ce nom ne permet pas de construire une adresse de page, ajouter des lettres ou des chiffres.",
);

/**
 * Rang d'affichage d'une categorie, C24.
 *
 * `min(1)` reprend `chk_categorie_ordre_positif`, et `int()` refuse `1.5` que
 * PostgreSQL rejetterait de toute facon, mais plus tard et moins clairement.
 */
export const schemaRangCategorie = z
  .int("Un rang entier est attendu.")
  .min(1, "Un rang commence a 1.");

/**
 * Creation d'une categorie. Le slug est DERIVE, jamais fourni.
 *
 * Laisser l'appelant choisir son slug ouvrirait deux problemes d'un coup :
 * un slug arbitraire dans une URL publique, et une divergence entre le nom
 * affiche et l'adresse, que rien ne rattraperait ensuite.
 *
 * `strictObject` refuse les cles inconnues : un champ `ordre` glisse dans le
 * formulaire laisserait l'appelant choisir son rang, que le service calcule.
 */
export const schemaCreationCategorie = z
  .strictObject({ nom: schemaNomAvecSlug })
  .transform(({ nom }) => ({ nom, slug: engendrerSlug(nom) }));

/**
 * Renommage d'une categorie.
 *
 * AUCUN CHAMP SLUG, volontairement, et `strictObject` fait de son envoi une
 * erreur plutot qu'un champ ignore en silence. Une categorie publiee porte des
 * liens entrants : changer son adresse les casserait tous sans redirection.
 */
export const schemaRenommageCategorie = z.strictObject({
  id: schemaIdentifiant,
  nom: schemaNom,
});

/**
 * Ordre complet des categories, du premier rang au dernier.
 *
 * LA LISTE EST EXHAUSTIVE ET NON UN DEPLACEMENT UNITAIRE. Le service en tire
 * les rangs 1..n, ce qui rend impossible un etat intermediaire ou deux
 * categories partagent un rang.
 *
 * LE REFUS DES DOUBLONS EST LE CONTROLE QUI COMPTE. Deux fois le meme
 * identifiant ferait ecrire deux rangs sur une categorie et en laisserait une
 * autre a son rang d'origine : la contrainte differable C24 leverait au COMMIT,
 * avec un message que personne ne relierait au formulaire.
 */
export const schemaReordonnancementCategories = z
  .array(schemaIdentifiant)
  .min(1, "Au moins une categorie est attendue.")
  .refine(
    (ids) => new Set(ids).size === ids.length,
    "Une categorie apparait deux fois dans l'ordre demande.",
  );

/**
 * Creation d'un produit, rattache a une categorie.
 *
 * LE STATUT N'EST PAS DANS L'ENTREE, et `strictObject` en fait un refus. Un
 * produit se cree toujours en `BROUILLON` : accepter `ACTIF` publierait un
 * produit sans variante ni media, ce que C1 et C7 interdisent. La publication
 * est le sujet de LS-103, avec ses propres controles.
 */
export const schemaCreationProduit = z
  .strictObject({
    nom: schemaNomAvecSlug,
    categorieId: schemaIdentifiant,
  })
  .transform(({ nom, categorieId }) => ({
    nom,
    slug: engendrerSlug(nom),
    categorieId,
  }));

/**
 * Presentation courte d'un produit, `Produit.descriptionCourte`.
 *
 * ELLE N'EST PAS UNE SECTION, et ne le devient jamais, ADR-026 decision 1 :
 * elle alimente les cartes de catalogue en plus du haut de fiche. En faire une
 * section la rendrait supprimable, ce qui viderait le catalogue.
 *
 * NULLABLE EN BASE, donc la chaine vide est ramenee a `null` : deux
 * representations du meme vide, l'une en base et l'autre dans le formulaire,
 * feraient diverger les lectures selon le chemin d'ecriture emprunte.
 */
const LONGUEUR_MAX_PRESENTATION = 300;

const schemaPresentationCourte = z
  .string("Une présentation textuelle est attendue.")
  .trim()
  .max(
    LONGUEUR_MAX_PRESENTATION,
    `La présentation depasse ${LONGUEUR_MAX_PRESENTATION} caracteres.`,
  )
  .transform((valeur) => (valeur.length === 0 ? null : valeur));

/**
 * Informations generales d'un produit, LS-100.
 *
 * NI `slug`, NI `statut`, NI `categorieId`, et `strictObject` fait de leur envoi
 * une erreur plutot qu'un champ ignore en silence.
 *
 * Le slug porte l'adresse publique de la fiche : le recalculer casserait tous
 * les liens entrants sans redirection. Le statut a ses propres conditions de
 * transition, media principal et texte alternatif obligatoires, sujet de
 * LS-103 : le laisser passer par ce formulaire les contournerait.
 */
export const schemaInformationsProduit = z.strictObject({
  id: schemaIdentifiant,
  nom: schemaNom,
  descriptionCourte: schemaPresentationCourte,
});
