/**
 * Validation des entrees de media, LS-102. Invariant 7.
 *
 * POURQUOI UN FICHIER SEPARE DU SERVICE, meme motif qu'en LS-99, LS-100 et
 * LS-101 : ces schemas sont importes par les Server Actions et par des tests
 * unitaires qui tournent sans base ni disque.
 *
 * LA TAILLE ET LE TYPE SONT VALIDES ICI, CONTENU MIS A PART. Le contenu reel
 * est juge par `integrations/medias/traitement.ts`, qui lit la signature du
 * fichier : un type MIME annonce par le navigateur est une donnee non fiable,
 * et l'extension aussi.
 */
import { z } from "zod";

import { schemaIdentifiant } from "@/lib/validation";

/**
 * Taille maximale d'un fichier televerse, 25 Mo.
 *
 * MESUREE PLUTOT QUE CHOISIE AU HASARD. ADR-007 a eprouve une photographie de
 * 17,6 Mo en 24 Mpx, plus exigeante que ce qu'un telephone produit, traitee en
 * 1,9 s avec un pic de 164 Mo de memoire. 25 Mo laisse une marge sans ouvrir la
 * porte a un fichier dont le traitement immobiliserait le processus.
 *
 * LA BORNE EST AUSSI UNE PROTECTION. Sans elle, un televersement de plusieurs
 * centaines de megaoctets ferait travailler libvips sur une image gigantesque,
 * et le pic de memoire suivrait.
 */
export const TAILLE_MAX_OCTETS = 25 * 1024 * 1024;

/**
 * Longueur maximale d'un texte alternatif, C7.
 *
 * Un texte alternatif decrit ce que montre l'image a qui ne la voit pas. Au-dela
 * de 200 caracteres il cesse d'etre utile : les lecteurs d'ecran le lisent d'un
 * trait, et une description trop longue noie l'information.
 */
const LONGUEUR_MAX_TEXTE_ALTERNATIF = 200;

/**
 * Texte alternatif. OBLIGATOIRE AVANT PUBLICATION, C7, exigence WCAG 2.2 AA.
 *
 * IL RESTE FACULTATIF A L'ECRITURE, et c'est delibere : l'exploitante televerse
 * ses photographies puis les decrit, plutot que d'etre bloquee au televersement.
 * C'est la PUBLICATION qui l'exige, LS-103, et le service rend l'information
 * necessaire a ce refus.
 */
export const schemaTexteAlternatif = z
  .string("Un texte alternatif est attendu.")
  .trim()
  .max(
    LONGUEUR_MAX_TEXTE_ALTERNATIF,
    `Le texte alternatif depasse ${LONGUEUR_MAX_TEXTE_ALTERNATIF} caracteres.`,
  )
  .transform((valeur) => (valeur.length === 0 ? null : valeur));

/** Ecriture du texte alternatif d'un media. */
export const schemaTexteAlternatifMedia = z.strictObject({
  id: schemaIdentifiant,
  texteAlternatif: schemaTexteAlternatif,
});

/** Suppression d'un media. */
export const schemaSuppressionMedia = z.strictObject({
  id: schemaIdentifiant,
});

/**
 * Ordre complet des medias d'un produit, du premier rang au dernier.
 *
 * LA LISTE EST EXHAUSTIVE, meme convention qu'en LS-99 et LS-100 : le service en
 * tire les rangs 1..n, ce qui rend impossible un etat intermediaire ou deux
 * medias partagent un rang.
 *
 * LE REFUS DES DOUBLONS EST LE CONTROLE QUI COMPTE ICI PLUS QU'AILLEURS. Deux
 * fois le meme identifiant ferait ecrire deux rangs sur un media, et l'index
 * partiel `media_principal_unique` leverait au milieu de la boucle, laissant
 * l'ordre a demi ecrit : cet index n'est PAS differable, contrairement a la
 * contrainte des sections.
 */
export const schemaReordonnancementMedias = z.strictObject({
  produitId: schemaIdentifiant,
  ids: z
    .array(schemaIdentifiant)
    .min(1, "Au moins un media est attendu.")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Un media apparait deux fois dans l'ordre demande.",
    ),
});

/** Televersement : le produit vise et la taille annoncee. */
export const schemaTeleversement = z.strictObject({
  produitId: schemaIdentifiant,
  tailleOctets: z
    .int("Une taille en octets est attendue.")
    .min(1, "Le fichier est vide.")
    .max(
      TAILLE_MAX_OCTETS,
      `Le fichier depasse ${Math.round(TAILLE_MAX_OCTETS / 1024 / 1024)} Mo.`,
    ),
});
