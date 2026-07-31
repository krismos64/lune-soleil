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

export const { signIn, signOut, signUp, useSession } = authClient;
