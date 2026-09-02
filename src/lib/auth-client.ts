/**
 * Client Better Auth, cote navigateur. LS-70.
 *
 * Ce module est la SEULE porte d'entree cote client vers l'authentification.
 * Il n'existe pas de version « appel direct a /api/auth » : le client porte la
 * negociation WebAuthn, qu'aucun `fetch` ecrit a la main ne reproduit
 * correctement.
 *
 * CE QU'IL NE FAUT PAS EN ATTENDRE. Rien de ce qui vient d'ici n'autorise quoi
 * que ce soit. Une session lue dans le navigateur sert a AFFICHER, jamais a
 * decider : toute autorisation se refait cote serveur par
 * `services/autorisation.ts`, invariant 2.
 */
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [passkeyClient()],
});

/*
 * `changePassword` PASSE PAR LE CLIENT ET NON PAR UNE SERVER ACTION, LS-60, et
 * ce n'est pas un choix de style.
 *
 * `revokeOtherSessions` supprime toutes les sessions puis en recree une : le
 * cookie CHANGE. Poser ce nouveau cookie depuis une Server Action declenche un
 * re-rendu SERVEUR de la page, verifie via Context7 sur Next.js 16, et ce
 * re-rendu s'execute avec l'ANCIEN cookie encore present dans la requete :
 * `exigerSession` rend `null` et la page redirige vers la connexion.
 *
 * Mesure du 2 septembre 2026 : apres le changement, l'URL devenait
 * `/compte/connexion` alors que le cookie etait pourtant correctement remplace.
 * Le client change son mot de passe et se retrouvait dehors.
 *
 * Le chemin client pose le cookie par une reponse HTTP ordinaire, sans re-rendu
 * serveur : c'est celui que la bibliotheque prevoit.
 */
export const { changePassword, signIn, signOut, signUp, useSession } =
  authClient;
