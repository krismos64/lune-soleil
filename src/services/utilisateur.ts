/**
 * Profil d'un compte : ce qu'un client peut changer chez lui. LS-70.
 *
 * POURQUOI CE MODULE EXISTE, et il n'est pas la pour la fonctionnalite.
 * `input: false` dans la configuration Better Auth ne protege que les routes de
 * Better Auth. Une Server Action de profil qui transmettrait a Prisma un objet
 * issu d'un formulaire ecrirait `role` sans que Better Auth soit sur le chemin :
 * c'est le scenario d'elevation de privilege nomme par ADR-023 et par la regle
 * E11, rangee au niveau 3 parce qu'aucune contrainte de base ne la porte.
 *
 * L'index partiel `utilisateur_administratrice_unique` rejetterait cette
 * ecriture tant qu'un compte d'administration existe. Cette protection est un
 * EFFET DE BORD, pas une conception : elle disparait si l'index est oublie dans
 * une migration, et elle ne dit rien du cas ou aucun compte d'administration
 * n'existe encore. Elle ne remplace pas le filtrage fait ici.
 *
 * LA REGLE. Toute ecriture sur `Utilisateur` partant d'une entree non fiable
 * passe par ce module, qui construit lui-meme l'objet transmis a l'ORM au lieu
 * de repandre celui qu'il a recu.
 */
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { EntreeInvalideError, valider } from "@/lib/validation";

/**
 * REEXPORT ET NON REDEFINITION, LS-71.
 *
 * Ce module declarait sa propre classe `EntreeInvalideError` en LS-70, avant
 * que le socle n'existe. Deux classes homonymes dans deux modules sont un piege
 * silencieux : `instanceof` est FAUX entre elles, donc un appelant qui capture
 * celle du socle laisserait passer celle d'ici sans qu'aucun type ne proteste.
 *
 * Le reexport preserve les imports existants, dont ceux de
 * `tests/integration/authentification.sequential.test.ts`, tout en garantissant
 * qu'il n'existe qu'une seule classe a l'execution.
 */
export { EntreeInvalideError };

/**
 * Ce qu'un client peut modifier sur son propre profil.
 *
 * `.strict()` EST LA GARANTIE, pas une precaution de style. Sans lui, Zod
 * IGNORE SILENCIEUSEMENT les cles inconnues : un corps portant
 * `{ nom: "X", role: "ADMINISTRATRICE" }` passerait la validation, `role` serait
 * simplement absent du resultat. Ce serait sur, mais muet, et rien ne
 * distinguerait une tentative d'elevation d'une faute de frappe. `.strict()` la
 * fait echouer bruyamment, ce qu'un journal peut ensuite constater.
 *
 * `role` n'apparait pas dans ce schema, et ne doit pas y etre ajoute : le
 * passage a `ADMINISTRATRICE` ne se fait par aucune interface, c'est une
 * operation manuelle en base reservee au developpeur, ADR-023.
 */
export const schemaMiseAJourProfil = z
  .object({
    nom: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export type MiseAJourProfil = z.infer<typeof schemaMiseAJourProfil>;

/**
 * Met a jour le profil de l'appelant.
 *
 * `utilisateurId` VIENT DE LA SESSION, jamais d'un formulaire ni d'une URL,
 * invariant 2. L'appelant l'obtient par `exigerSession` de
 * `services/autorisation.ts` ; ce module ne le lit nulle part lui-meme.
 *
 * L'objet transmis a Prisma est CONSTRUIT ICI, champ par champ, a partir du
 * resultat valide. Repandre l'entree, meme validee, ferait dependre la securite
 * du schema Zod seul : une cle ajoutee au schema par inadvertance deviendrait
 * aussitot ecrivable en base.
 */
export async function mettreAJourProfil(
  utilisateurId: string,
  entree: unknown,
): Promise<void> {
  // `valider` du socle, LS-71 : meme classe d'erreur partout, et un message qui
  // nomme le champ fautif sans reproduire la valeur refusee, invariant 9.
  const donnees = valider(schemaMiseAJourProfil, entree);

  // Champ par champ, et la cle est ABSENTE quand rien n'est fourni plutot que
  // posee a `undefined` : `exactOptionalPropertyTypes` rejette la seconde
  // forme, et elle exprimerait « ne pas toucher » par la meme valeur qui
  // signifie « effacer » ailleurs. Pas de `...donnees`, jamais.
  const champs: { nom?: string } = {};

  if (donnees.nom !== undefined) {
    champs.nom = donnees.nom;
  }

  await prisma.utilisateur.update({
    where: { id: utilisateurId },
    data: champs,
  });
}
