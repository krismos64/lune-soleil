import type { StatutRetractation } from "@/generated/prisma/enums";

/**
 * Libelle affichable d'un statut de retractation, LS-135.
 *
 * IL VIT DANS SON PROPRE MODULE parce que DEUX composants en ont besoin : la
 * page serveur pour le badge, et le composant client pour ses messages de
 * refus. Une premiere version le gardait dans `page.tsx`, non exporte : le
 * message d'incompatibilite affichait donc `REMBOURSEMENT_EN_COURS` en
 * majuscules a l'exploitante, contournant dix lignes plus bas la regle que la
 * page appliquait au badge. Releve par `ls-frontend-revue` le 3 septembre 2026.
 *
 * IL N'IMPORTE RIEN D'AUTRE QUE LE TYPE, ce qui le rend servable au navigateur
 * sans tirer Prisma dans le paquet client, meme motif que `lib/mot-de-passe.ts`.
 *
 * LA TABLE EST EXHAUSTIVE PAR SON TYPE. `Record<string, string>` compilerait
 * sans rien garantir : une valeur ajoutee a l'enum afficherait sa forme brute,
 * sans qu'aucun controle ne rougisse. Motif « un enum ajoute casse
 * l'affichage », deja rencontre sur les messages et les commandes.
 */
export const LIBELLES_RETRACTATION: Record<StatutRetractation, string> = {
  DEPOSEE: "Déposée",
  ACCUSEE: "Accusée",
  RETOUR_ATTENDU: "Retour attendu",
  EXPEDITION_PROUVEE: "Expédition prouvée",
  REMBOURSEMENT_EN_COURS: "Remboursement en cours",
  REMBOURSEE: "Remboursée",
  REFUSEE: "Refusée",
};

/**
 * Le libelle d'un statut recu d'une Server Action, ou la valeur brute a defaut.
 *
 * LE REPLI EXISTE ICI ET NULLE PART AILLEURS. Les issues des Server Actions
 * portent `statutActuel: string` et non l'enum : le type traverse une frontiere
 * HTTP, ou aucune garantie de `tsc` ne survit. Afficher la valeur brute reste
 * preferable a masquer l'etat, l'exploitante devant savoir ou en est la demande.
 */
export function libelleStatut(statut: string): string {
  return LIBELLES_RETRACTATION[statut as StatutRetractation] ?? statut;
}
