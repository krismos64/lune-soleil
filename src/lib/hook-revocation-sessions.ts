/**
 * Impose cote serveur deux champs de corps que Better Auth laisse a l'appelant.
 *
 * 1. `revokeOtherSessions` au changement de mot de passe. LS-60, correction
 *    issue de la revue critique.
 * 2. `createSession` a l'enregistrement d'une passkey. LS-294, revue critique de
 *    la montee en Better Auth 1.7.
 *
 * PREMIER CHAMP. `revokeOtherSessions` fait partie du CORPS de la requete
 * `/change-password`, verifie dans le code de Better Auth : le serveur se
 * contente de le lire. Tant que le changement passait par une Server Action, le
 * service posait `true` hors de portee du client ; depuis que l'ecran appelle
 * `authClient.changePassword`, c'est devenu un champ que l'appelant choisit.
 *
 * LE SCENARIO : un intrus qui detient la session ET le mot de passe appelle
 * `POST /api/auth/change-password` avec `revokeOtherSessions: false`. Il change
 * le mot de passe et CONSERVE la session du proprietaire ouverte, ce qui retarde
 * la detection. La garantie annoncee par trois commentaires n'en etait plus une.
 *
 * SECOND CHAMP. Depuis la 1.7, `/passkey/verify-registration` accepte
 * `createSession: true` et ouvre alors une session NEUVE, verifie dans
 * `@better-auth/passkey/dist/index.mjs`. Deux gardes du projet ne voient pas ce
 * chemin : le journal des connexions, qui ne surveille que `/sign-in/email` et
 * `/passkey/verify-authentication`, et `prouverIdentiteParPasskey`, qui accepte
 * toute session de moins de soixante secondes comme preuve d'identite.
 *
 * LE SCENARIO : un intrus qui detient un cookie de session de moins de
 * vingt-quatre heures enregistre son propre authentificateur avec
 * `createSession: true`, obtient une session neuve sans trace au journal, et
 * passe aussitot la reauthentification qui garde le remboursement. Aucun ecran
 * du projet n'envoie ce champ.
 *
 * LES DEUX VALEURS SONT DONC IMPOSEES ICI, ou aucun appelant ne peut les
 * atteindre. Les champs restent acceptes dans le corps, ils sont simplement
 * ecrases : refuser la requete aurait casse le client officiel de Better Auth,
 * qui envoie le premier.
 *
 * LE HOOK NE FAIT RIEN D'AUTRE. Il ne lit aucun mot de passe, n'ecrit rien, et
 * ne peut faire echouer aucune requete : il rend un contexte modifie ou rien.
 */
import { createAuthMiddleware } from "better-auth/api";

/** Les champs imposes, par chemin, ecrits une seule fois. */
const CHAMPS_IMPOSES: Readonly<Record<string, Record<string, boolean>>> = {
  "/change-password": { revokeOtherSessions: true },
  "/passkey/verify-registration": { createSession: false },
};

export const hookRevocationSessions = createAuthMiddleware(async (ctx) => {
  // `Object.hasOwn` et non une simple lecture : le chemin vient de la requete,
  // et seules les cles propres de la table doivent pouvoir correspondre.
  if (!Object.hasOwn(CHAMPS_IMPOSES, ctx.path)) {
    return;
  }
  const champs = CHAMPS_IMPOSES[ctx.path];

  /*
   * LE CORPS EST RECOPIE ET NON MUTE : `ctx.body` est partage avec le reste de
   * la chaine, et le modifier en place ferait dependre le resultat de l'ordre
   * des hooks.
   */
  return {
    context: {
      ...ctx,
      body: {
        ...(ctx.body as Record<string, unknown>),
        ...champs,
      },
    },
  };
});
