/**
 * Ce que le GABARIT de l'espace client a besoin de savoir. LS-180.
 *
 * IL NE DECIDE D'AUCUN ACCES, ET C'EST LA PREMIERE CHOSE A SAVOIR SUR CE
 * FICHIER. Tout ce qu'il rend sert a AFFICHER un en-tete de barre laterale :
 * un nom, deux initiales, une mention de verification. Les pages gardent
 * chacune leur `exigerSession` avant tout rendu, motif pose par LS-70, et le
 * layout n'en tient pas lieu.
 *
 * POURQUOI CE SERVICE EXISTE PLUTOT QU'UN APPEL PRISMA DANS LE LAYOUT. La page
 * `/compte/profil` lit le nom par un `findUnique` direct, ecrit avant que
 * `repositories/utilisateur.ts` ne porte cette lecture : c'est une derogation
 * a la frontiere des couches que LS-158 a justement entrepris de refermer
 * ailleurs. Un layout rendu sur TOUTES les pages de l'espace client serait le
 * pire endroit ou la reproduire.
 *
 * LE NOM VIDE EST UN CAS NOMINAL, PAS UNE ANOMALIE. `Utilisateur.nom` est
 * nullable, et le schema le dit : « la route d'inscription en exige toujours
 * un, donc aucune ligne ecrite par Better Auth ne le laisse vide », mais un
 * compte cree par un autre chemin n'a rien a y mettre. L'affichage se rabat
 * alors sur la partie locale de l'adresse, jamais sur un vide.
 */
import { initialesClient, nomAffichable } from "@/lib/nom-affiche";
import { prisma } from "@/lib/prisma";
import { lireEnteteEspaceClient } from "@/repositories/utilisateur";

/*
 * LES DEUX FONCTIONS PURES VIVENT DANS `lib/nom-affiche.ts`, et ce n'est pas un
 * rangement de convenance : les importer depuis ce module tirait `lib/prisma`,
 * donc exigeait une `DATABASE_URL` pour tester un decoupage de chaine. Le test
 * unitaire l'a montre en echouant a l'import, avant meme sa premiere assertion.
 */
export { initialesClient, nomAffichable };

/** Ce que la barre laterale affiche en tete, et rien de plus. */
export type EnteteEspaceClient = {
  /** Ce qui s'affiche en gras sous la pastille. Jamais vide. */
  nomAffiche: string;
  /** Deux lettres au plus, pour la pastille. */
  initiales: string;
  /** Gouverne la seule mention « Email vérifié », aucun acces. */
  emailVerifie: boolean;
};

/**
 * Lit de quoi rendre l'en-tete de la barre, pour un compte donne.
 *
 * `utilisateurId` VIENT DE LA SESSION, jamais d'une URL ni d'un formulaire :
 * la signature n'accepte rien d'autre, et cette fonction ne sert qu'un
 * affichage de l'appelant sur ses propres donnees.
 *
 * REND `null` SI LE COMPTE EST INTROUVABLE, cas qui ne devrait pas se produire
 * puisque l'identite vient d'une session valide. L'appelant affiche alors le
 * gabarit sans en-tete plutot que d'inventer un nom : une anomalie se voit,
 * elle ne se comble pas.
 */
export async function lireEntete(
  utilisateurId: string,
  email: string,
): Promise<EnteteEspaceClient | null> {
  const compte = await lireEnteteEspaceClient(prisma, utilisateurId);

  if (!compte) {
    return null;
  }

  const nomAffiche = nomAffichable(compte.nom, email);

  return {
    nomAffiche,
    initiales: initialesClient(nomAffiche),
    emailVerifie: compte.emailVerifie,
  };
}
