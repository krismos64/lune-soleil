/**
 * Codes d'erreur de la garde des routes de passkey, LS-295.
 *
 * CE FICHIER N'IMPORTE RIEN, et ne doit jamais le faire. L'ecran des passkeys,
 * composant client, lit ces codes pour reconnaitre le refus de la garde ; les
 * servir depuis `hook-preuve-passkey.ts` ferait entrer `better-auth/api` dans le
 * paquet du navigateur. Meme raison que `mot-de-passe.ts`.
 */

/** Preuve d'identite absente ou expiree : l'ecran propose la reauthentification. */
export const CODE_PREUVE_REQUISE = "REAUTHENTIFICATION_REQUISE";

/** Session sans le role d'administration : rien a proposer. */
export const CODE_ROLE_INSUFFISANT = "ROLE_INSUFFISANT";
