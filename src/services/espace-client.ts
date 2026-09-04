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
import { prisma } from "@/lib/prisma";
import { lireEnteteEspaceClient } from "@/repositories/utilisateur";

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
 * Les initiales de la pastille, deux lettres au plus.
 *
 * ELLE EST DISTINCTE DE CELLE DE L'ADMINISTRATION, ET CE N'EST PAS UNE
 * DUPLICATION QU'IL FAUDRAIT FACTORISER. Les deux recoivent des entrees de
 * NATURES DIFFERENTES : la barre d'administration recoit toujours la partie
 * locale d'une adresse, `stacy.menendez`, quand celle-ci recoit d'abord un vrai
 * nom saisi au profil, « Marie Dupont », et l'adresse seulement en repli.
 *
 * LA CONSEQUENCE EST DANS LE SEPARATEUR. Le commentaire de la fonction jumelle
 * dit que « le separateur n'est PAS l'espace » puisqu'une partie locale n'en
 * contient jamais ; ici l'espace est au contraire le separateur PRINCIPAL, et
 * c'est le cas le plus frequent. Les mettre en commun ferait porter a une seule
 * fonction deux justifications opposees, et la prochaine personne qui lirait
 * l'une des deux serait induite en erreur.
 *
 * Les trois autres separateurs restent couverts pour le cas de repli, une
 * adresse comme `marie.dupont` devant rendre « MD » et non « M ».
 */
export function initialesClient(nom: string): string {
  const mots = nom
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (mots.length === 0) {
    return "?";
  }

  return mots
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Le nom a afficher, avec son repli.
 *
 * LE REPLI N'EST PAS L'ADRESSE ENTIERE. Afficher `marie.dupont@example.com` en
 * tete de barre laterale la ferait deborder a 320 px, et surtout AFFICHERAIT
 * L'ADRESSE EMAIL EN PERMANENCE sur chaque ecran de l'espace client, y compris
 * par-dessus l'epaule dans un lieu public. La partie locale suffit a se
 * reconnaitre chez soi, et c'est le choix deja fait cote administration.
 */
export function nomAffichable(nom: string | null, email: string): string {
  const nomNettoye = nom?.trim() ?? "";

  if (nomNettoye.length > 0) {
    return nomNettoye;
  }

  return email.split("@")[0] ?? email;
}

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
