/**
 * Retour du lien de verification d'adresse email, LS-298.
 *
 * Better Auth consomme le jeton sur `/api/auth/verify-email`, puis redirige
 * vers `callbackURL`. En cas d'echec, il ajoute `error=<code>` a cette meme
 * adresse, verifie dans sa source 1.7 (`email-verification.mjs`,
 * `redirectOnError`) : `TOKEN_EXPIRED`, `INVALID_TOKEN`, `USER_NOT_FOUND` ou
 * `INVALID_USER`. Le succes et l'echec arrivent donc sur le MEME chemin, et
 * seul le parametre `error` les distingue.
 *
 * AUCUNE DEPENDANCE : lu par une page serveur et par ses tests unitaires.
 */

/**
 * Ou le lien du message ramene apres confirmation.
 *
 * CHEMIN RELATIF ET FIXE. Better Auth le transmet au navigateur du client :
 * accepter une valeur fournie ferait de l'email de verification un vecteur de
 * redirection vers un domaine tiers, depuis un message qui inspire confiance.
 *
 * PARTAGE PAR L'INSCRIPTION ET LE RENVOI, LS-298 : l'inscription n'en passait
 * aucun, et Better Auth retombait sur `/`. Le premier lien recu ramenait donc
 * a l'accueil sans un mot, seul le lien renvoye atteignait l'accuse.
 */
export const RETOUR_APRES_VERIFICATION = "/compte?verifie=1";

/** Ce que dit l'arrivee sur l'ecran, ou `null` hors retour de verification. */
export type IssueVerification = "REUSSIE" | "EXPIREE" | "INVALIDE";

/**
 * Lit l'issue de la verification dans les parametres d'arrivee.
 *
 * UN `error` PRESENT L'EMPORTE TOUJOURS. Un compte deja verifie qui reclique un
 * lien expire arrive avec `verifie=1&error=TOKEN_EXPIRED` : l'adresse est
 * verifiee en base, et annoncer « vérifiée » cacherait que ce lien-la a echoue.
 *
 * LE SUCCES NE PROUVE RIEN PAR LUI-MEME : le parametre se tape a la main.
 * L'appelant qui connait la session le confronte a l'etat en base.
 */
export function issueVerification(parametres: {
  verifie?: string | string[];
  error?: string | string[];
}): IssueVerification | null {
  if (parametres.verifie !== "1") {
    return null;
  }

  const erreur = parametres.error;

  if (erreur === undefined) {
    return "REUSSIE";
  }

  return erreur === "TOKEN_EXPIRED" ? "EXPIREE" : "INVALIDE";
}
