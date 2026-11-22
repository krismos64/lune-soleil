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
