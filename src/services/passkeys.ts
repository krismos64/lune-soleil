/**
 * Lecture des passkeys d'un compte, LS-175, ADR-021.
 *
 * CE SERVICE NE CHANGE AUCUN ETAT. L'enregistrement et le retrait passent par
 * Better Auth, `addPasskey` et `deletePasskey`, qui verifient la session
 * eux-memes : les doubler ici ecrirait une seconde regle d'autorisation a tenir
 * a jour, et c'est celle qu'on oublie qui devient le trou.
 *
 * IL NE FAIT PAS L'AUTORISATION NON PLUS, invariant 2 : la page appelle
 * `exigerAdministratrice` avant de rendre, et lui passe l'identifiant qui en
 * ressort. Un service qui lirait la session lui-meme inviterait a l'appeler
 * depuis un endroit non garde.
 *
 * L'IDENTIFIANT VIENT DE LA SESSION, JAMAIS DE L'URL : c'est ce qui fait que
 * cet ecran ne peut pas lister les passkeys d'autrui, invariant 2.
 */
import { prisma } from "@/lib/prisma";
import * as depot from "@/repositories/utilisateur";

export type PasskeyAffichable = {
  id: string;
  nom: string | null;
  creeA: Date;
};

export async function listerPasskeysDuCompte(
  utilisateurId: string,
): Promise<PasskeyAffichable[]> {
  const lignes = await depot.listerPasskeys(prisma, utilisateurId);

  /*
   * LA PROJECTION RENOMME VERS LE FRANCAIS DU PROJET. Les colonnes de `Passkey`
   * portent les noms imposes par Better Auth, `name` et `createdAt` : les
   * laisser remonter jusqu'au composant repandrait cette exception dans du code
   * qui n'a aucune raison de la connaitre.
   */
  return lignes.map((ligne) => ({
    id: ligne.id,
    nom: ligne.name,
    creeA: ligne.createdAt,
  }));
}
