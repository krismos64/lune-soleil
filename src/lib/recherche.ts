/**
 * Le terme d'une recherche dans une liste de l'administration, refonte du
 * 22 novembre 2026.
 *
 * VALIDÉ AVEC ZOD, invariant 7 : il vient de l'adresse, donc du navigateur.
 * Une valeur qui n'est pas une chaîne, ou un paramètre répété, ne cherche rien
 * plutôt que de lever. Cent caractères suffisent à un nom, un numéro ou une
 * adresse email ; au-delà, la valeur est coupée et non refusée, une recherche
 * trop longue n'étant pas une erreur de l'exploitante.
 *
 * LE TERME N'AUTORISE RIEN, invariant 2 : il filtre une liste que la garde
 * d'administration a déjà ouverte.
 */
import { z } from "zod";

export const LONGUEUR_MAX_RECHERCHE = 100;

const schemaTermeRecherche = z
  .string()
  .transform((valeur) => valeur.trim().slice(0, LONGUEUR_MAX_RECHERCHE));

export function lireTermeRecherche(brut: unknown): string {
  const resultat = schemaTermeRecherche.safeParse(brut);
  return resultat.success ? resultat.data : "";
}

/** Nombre de mots retenus d'une recherche publique, au-delà ignorés. */
export const MOTS_MAX_RECHERCHE = 5;

/**
 * Les mots d'une recherche du catalogue public, prêts pour un `LIKE`.
 *
 * SANS ACCENT ET EN MINUSCULES, comme la colonne que `texteSansAccent` du
 * dépôt normalise : « boucle doree » trouve « Boucles dorées ». La ligature
 * `œ` devient `oe` des deux côtés, la décomposition Unicode ne la séparant pas.
 *
 * LES JOKERS SONT ÉCHAPPÉS, `%`, `_` et la barre oblique inverse : un `%`
 * saisi chercherait sinon tout le catalogue. La requête reste paramétrée,
 * invariant 7, l'échappement ne servant qu'au sens du motif.
 */
export function motsDeRecherche(terme: string): string[] {
  return terme
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .split(/\s+/)
    .filter((mot) => mot.length > 0)
    .slice(0, MOTS_MAX_RECHERCHE)
    .map((mot) => mot.replace(/[\\%_]/g, (car) => `\\${car}`));
}
