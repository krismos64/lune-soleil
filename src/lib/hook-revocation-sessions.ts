/**
 * Force la revocation des autres sessions au changement de mot de passe.
 * LS-60, correction issue de la revue critique.
 *
 * CE QUE CE HOOK FERME. `revokeOtherSessions` fait partie du CORPS de la
 * requete `/change-password`, verifie dans le code de Better Auth : le serveur
 * se contente de le lire. Tant que le changement passait par une Server Action,
 * le service posait `true` hors de portee du client ; depuis que l'ecran appelle
 * `authClient.changePassword`, c'est devenu un champ que l'appelant choisit.
 *
 * LE SCENARIO : un intrus qui detient la session ET le mot de passe appelle
 * `POST /api/auth/change-password` avec `revokeOtherSessions: false`. Il change
 * le mot de passe et CONSERVE la session du proprietaire ouverte, ce qui retarde
 * la detection. La garantie annoncee par trois commentaires n'en etait plus une.
 *
 * LA VALEUR EST DONC IMPOSEE ICI, ou aucun appelant ne peut l'atteindre. Le
 * champ reste accepte dans le corps, il est simplement ecrase : refuser la
 * requete aurait casse le client officiel de Better Auth, qui l'envoie.
 *
 * LE HOOK NE FAIT RIEN D'AUTRE. Il ne lit aucun mot de passe, n'ecrit rien, et
 * ne peut faire echouer aucune requete : il rend un contexte modifie ou rien.
 */
import { createAuthMiddleware } from "better-auth/api";

/** Le chemin vise, ecrit une seule fois. */
const CHEMIN_CHANGEMENT_MOT_DE_PASSE = "/change-password";

export const hookRevocationSessions = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== CHEMIN_CHANGEMENT_MOT_DE_PASSE) {
    return;
  }

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
        revokeOtherSessions: true,
      },
    },
  };
});
