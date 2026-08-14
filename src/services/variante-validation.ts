/**
 * Validation des entrees de variante, LS-101. Invariants 1 et 7.
 *
 * POURQUOI UN FICHIER SEPARE DU SERVICE, meme motif qu'en LS-99 et LS-100 : ces
 * schemas sont importes par les Server Actions et par des tests unitaires qui
 * tournent sans base. Les loger dans le service forcerait tout test de
 * conversion a charger Prisma, donc a exiger Docker pour verifier que
 * « 1,005 » vaut 101 centimes.
 *
 * CE QUE CES SCHEMAS NE FONT PAS. Ils ne verifient aucune existence et
 * n'autorisent rien, invariant 2 : un `produitId` bien forme ne prouve ni que le
 * produit existe, ni que l'appelant a le droit d'y toucher. L'existence vient de
 * la cle etrangere, le droit vient de la session.
 */
import { z } from "zod";

import { schemaIdentifiant } from "@/lib/validation";

/**
 * Longueur maximale d'une reference de variante.
 *
 * Aucune contrainte de longueur n'existe en base, la colonne etant en `TEXT`.
 * C'est une regle d'interface : une reference s'imprime sur une etiquette de
 * bijou, format ou trente caracteres tiennent deja difficilement.
 */
const LONGUEUR_MAX_REFERENCE = 30;

/** Longueur maximale d'un libelle de declinaison, « doré, 42 cm ». */
const LONGUEUR_MAX_LIBELLE = 80;

/** Longueur maximale des dimensions, texte libre : « 42 cm, pendentif 18 mm ». */
const LONGUEUR_MAX_DIMENSIONS = 120;

/**
 * Plafond de prix, cent mille euros en centimes.
 *
 * NI UNE REGLE METIER NI UNE CONTRAINTE DE BASE : une borne de saisie. Elle
 * arrete une virgule oubliee, « 1999 » tape pour « 19,99 », avant que le prix
 * n'atteigne le catalogue. Genereuse a dessein, aucune piece de cette boutique
 * n'en approche.
 */
const PRIX_MAX_CENTIMES = 10_000_000;

/** Plafond de quantite physique, meme role de garde-fou de saisie. */
const QUANTITE_MAX = 100_000;

/**
 * Convertit un montant saisi en euros vers des centimes entiers. Invariant 1.
 *
 * REND `null` PLUTOT QUE DE LEVER : c'est le schema Zod appelant qui formule le
 * refus, avec le message destine au champ. Une fonction pure qui leve obligerait
 * chaque appelant a l'entourer d'un `try`.
 *
 * LA CONVERSION SE FAIT PAR DECOUPAGE DE LA CHAINE : la partie entiere et la
 * partie decimale sont lues comme deux entiers, puis recombinees. Aucun nombre
 * a virgule flottante n'apparait a aucun moment.
 *
 * CE QUE CETTE FORME APPORTE, ET CE QU'ELLE N'APPORTE PAS. Il faut etre exact
 * ici, la formulation inverse ayant ete ecrite puis corrigee le 14 aout 2026.
 *
 * Un flottant binaire ne represente pas exactement la plupart des decimaux,
 * `0.07 * 100` valant 7.000000000000001 et `4.35 * 100` valant
 * 434.99999999999994. Mais **sur des montants a deux decimales au plus,
 * `Math.round(x * 100)` rend le bon resultat**, verifie exhaustivement de 0 a
 * 2000 euros : l'erreur du flottant y reste toujours inferieure au demi-centime.
 *
 * LA VRAIE PROTECTION EST DONC LE FILTRE `/^(\d+)(?:\.(\d{1,3}))?$/`, qui
 * borne l'entree a deux decimales, et non la methode de conversion. Le
 * decoupage est retenu parce qu'il ne DEPEND pas de cette borne : le jour ou
 * quelqu'un elargit le filtre a trois decimales pour un besoin de remise, la
 * multiplication commencerait a perdre un centime la ou le decoupage continue
 * de rendre un entier exact.
 *
 * Ne pas remplacer cette fonction par une multiplication en constatant que les
 * tests restent verts : ils le resteront, et la propriete perdue ne se verrait
 * qu'a la prochaine evolution du filtre.
 *
 * LA PARTIE DECIMALE EST COMPLETEE A DROITE, jamais a gauche. « 5,5 » vaut 550
 * centimes et non 55 : lire « 5 » sans le completer diviserait le prix par dix,
 * defaut qu'un test sur deux decimales seulement ne verrait jamais.
 */
export function centimesDepuisEuros(saisie: string): number | null {
  // Les espaces de milliers, y compris l'insecable que produit un clavier
  // francais, partent avant l'analyse. La virgule devient un point.
  const normalise = saisie
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(",", ".");

  // UNE LISTE D'AUTORISES ET NON D'INTERDITS. Elle ferme d'un coup la notation
  // scientifique, `Infinity`, `NaN` et le signe negatif, que `Number()`
  // accepterait tous les quatre.
  const forme = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalise);
  if (!forme) {
    return null;
  }

  const entiers = Number(forme[1]);
  // `padEnd` ET NON `padStart` : voir l'en-tete, « 5,5 » vaut 50 centimes de
  // partie decimale.
  const decimales = Number((forme[2] ?? "").padEnd(2, "0"));

  if (!Number.isSafeInteger(entiers)) {
    return null;
  }

  return entiers * 100 + decimales;
}

/**
 * Prix saisi en euros, rendu en centimes entiers.
 *
 * `transform` APRES `refine`, l'ordre comptant : refuser d'abord ce que la
 * conversion ne sait pas lire, convertir ensuite. L'inverse ferait porter au
 * `transform` un cas d'echec qu'il n'a aucun moyen de signaler proprement.
 */
const schemaPrixEuros = z
  .string("Un prix est attendu.")
  .refine(
    (saisie) => centimesDepuisEuros(saisie) !== null,
    "Le prix doit etre un montant en euros, avec au plus deux decimales.",
  )
  .transform((saisie) => centimesDepuisEuros(saisie) as number)
  .refine(
    (centimes) => centimes <= PRIX_MAX_CENTIMES,
    "Ce prix depasse la limite de saisie, verifier la virgule.",
  );

/**
 * Reference de variante, C2. NORMALISEE EN MAJUSCULES.
 *
 * Sans normalisation, `bo-essai-01` et `BO-ESSAI-01` seraient deux references
 * distinctes pour l'unicite en base, alors qu'aucun humain ne les distingue sur
 * une etiquette : la seconde saisie passerait, et deux pieces porteraient la
 * meme reference imprimee.
 *
 * ASCII SEULEMENT. Une reference s'imprime, se dicte au telephone et se saisit a
 * la main : un accent y serait une source d'erreur sans aucun gain, et la regle
 * du projet reserve l'ASCII aux identifiants techniques.
 */
const schemaReference = z
  .string("Une reference est attendue.")
  .trim()
  .min(1, "La reference ne peut pas etre vide.")
  .max(
    LONGUEUR_MAX_REFERENCE,
    `La reference depasse ${LONGUEUR_MAX_REFERENCE} caracteres.`,
  )
  .transform((valeur) => valeur.toUpperCase())
  .refine(
    (valeur) => /^[A-Z0-9-]+$/.test(valeur),
    "La reference n'accepte que des lettres non accentuees, des chiffres et des tirets.",
  );

const schemaLibelle = z
  .string("Un libellé est attendu.")
  .trim()
  .min(1, "Le libellé ne peut pas etre vide.")
  .max(
    LONGUEUR_MAX_LIBELLE,
    `Le libellé depasse ${LONGUEUR_MAX_LIBELLE} caracteres.`,
  );

/**
 * Dimensions, facultatives.
 *
 * NULLABLE EN BASE, donc la chaine vide est ramenee a `null` : deux
 * representations du meme vide feraient diverger les lectures selon le chemin
 * d'ecriture emprunte.
 *
 * `null` EST ACCEPTE EN ENTREE autant que la chaine vide, l'ecran d'edition
 * rendant la valeur telle qu'il l'a lue.
 */
const schemaDimensions = z
  .union([z.string(), z.null()])
  .transform((valeur) => (valeur ?? "").trim())
  .refine(
    (valeur) => valeur.length <= LONGUEUR_MAX_DIMENSIONS,
    `Les dimensions depassent ${LONGUEUR_MAX_DIMENSIONS} caracteres.`,
  )
  .transform((valeur) => (valeur.length === 0 ? null : valeur));

/**
 * Quantite physique, C5.
 *
 * ZERO EST LEGITIME : une piece peut etre creee au catalogue avant d'etre
 * fabriquee. `int()` refuse `1.5`, et `min(0)` devance
 * `chk_variante_physique_positif` qui rendrait une erreur PostgreSQL brute.
 */
const schemaQuantite = z
  .int("Une quantité entière est attendue.")
  .min(0, "La quantité ne peut pas etre négative.")
  .max(QUANTITE_MAX, "Cette quantité depasse la limite de saisie.");

/**
 * Creation d'une variante.
 *
 * `strictObject` REFUSE LES CLES INCONNUES, et deux d'entre elles comptent :
 * `quantiteReservee` laisserait un appelant ecrire une reservation sans passer
 * par le service de reservation, ce qu'ADR-006 interdit, et `archiveeA` ferait
 * naitre une variante deja archivee.
 */
export const schemaCreationVariante = z
  .strictObject({
    produitId: schemaIdentifiant,
    reference: schemaReference,
    libelle: schemaLibelle,
    dimensions: schemaDimensions,
    prixEuros: schemaPrixEuros,
    quantitePhysique: schemaQuantite,
  })
  /*
   * LA CLE CHANGE DE NOM EN SORTIE, `prixEuros` devient `prixCentimes`.
   *
   * Le `transform` du champ convertit la VALEUR, il ne renomme pas la CLE :
   * sans cette seconde etape, le service recevrait un objet dont le champ
   * `prixEuros` porte en realite des centimes. Un nom qui ment sur son unite
   * est exactement la forme de defaut que l'invariant 1 cherche a empecher, et
   * il survivrait a toute relecture.
   */
  .transform(({ prixEuros, ...reste }) => ({
    ...reste,
    prixCentimes: prixEuros,
  }));

/**
 * Modification d'une variante.
 *
 * LA REFERENCE EST MODIFIABLE, ADR-029, 14 aout 2026. Ce n'est pas un oubli :
 * l'arbitrage l'a retenue librement modifiable, et l'ecran avertit quand la
 * variante a deja vendu, la copie figee de `LigneCommande.referenceFigee` ne
 * suivant pas, invariant 3.
 *
 * NI `produitId`, NI `quantiteReservee`, NI `archiveeA`. Deplacer une variante
 * d'un produit a l'autre changerait la fiche ou apparaissent les commandes
 * passees ; l'archivage est une operation distincte, avec son propre refus si
 * la variante l'est deja.
 */
export const schemaModificationVariante = z
  .strictObject({
    id: schemaIdentifiant,
    reference: schemaReference,
    libelle: schemaLibelle,
    dimensions: schemaDimensions,
    prixEuros: schemaPrixEuros,
    quantitePhysique: schemaQuantite,
  })
  // Meme renommage qu'a la creation, meme raison.
  .transform(({ prixEuros, ...reste }) => ({
    ...reste,
    prixCentimes: prixEuros,
  }));

/** Archivage d'une variante, C13. Elle ne se supprime jamais. */
export const schemaArchivageVariante = z.strictObject({
  id: schemaIdentifiant,
});
