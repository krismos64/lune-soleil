/**
 * Exige une preuve d'identite recente pour enregistrer ou retirer une passkey.
 * LS-295, ADR-027 decision 3, famille `IDENTIFIANTS`.
 *
 * LE DEFAUT. Les routes de passkey de Better Auth ne gardent l'enregistrement
 * que par `freshSessionMiddleware`, soit une session de moins de vingt-quatre
 * heures, cliente comprise. Le scenario de la revue de LS-294 :
 *
 *   1. un intrus detient un cookie de session de l'administration ;
 *   2. il enregistre SON authentificateur sur le compte ;
 *   3. il se connecte avec, ce qui ouvre une session neuve ;
 *   4. `prouverIdentiteParPasskey` accepte cette session neuve comme preuve,
 *      et le remboursement s'ouvre.
 *
 * LA GARDE VIT SUR LA ROUTE HTTP, pas sur l'ecran. `addPasskey` est appele
 * depuis le navigateur vers `/api/auth/passkey/*` : une garde posee dans la page
 * ou dans une Server Action laisserait la route ouverte a quiconque l'appelle
 * directement. Critere 1.
 *
 * TROIS ROUTES. Les deux etapes de l'enregistrement, chacune gardee : garder la
 * seule premiere laisserait un defi obtenu pendant la fenetre de preuve servir
 * apres elle. Et le retrait, qu'ADR-027 range avec l'enregistrement sous
 * « changer la passkey » : retirer celle de l'exploitante est ce qu'un intrus
 * ferait pour la priver de son moyen principal. Le renommage reste libre, il ne
 * change aucun moyen d'acces.
 *
 * SANS SESSION, LA GARDE S'EFFACE : la route elle-meme repond 401, et rien n'est
 * a proteger. Elle ne remplace pas la garde de Better Auth, elle s'y ajoute.
 *
 * LA DECISION VIT DANS `services/reauthentification.ts`, ce fichier ne fait que
 * l'appliquer. Import DYNAMIQUE : ce service importe `@/lib/auth`, qui importe
 * ce hook ; un import statique formerait un cycle evalue au chargement.
 */
import { APIError, getSessionFromCtx } from "better-auth/api";

/** Les chemins gardes, tels que `ctx.path` les porte, sans le prefixe `/api/auth`. */
export const CHEMINS_PASSKEY_GARDES: ReadonlySet<string> = new Set([
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
]);

/**
 * Code d'erreur lu par l'ecran pour proposer la reauthentification. Un refus de
 * role porte un autre code : proposer de se reauthentifier a un client ne
 * l'aboutirait a rien.
 */
export const CODE_PREUVE_REQUISE = "REAUTHENTIFICATION_REQUISE";
export const CODE_ROLE_INSUFFISANT = "ROLE_INSUFFISANT";

type ContexteGarde = Parameters<typeof getSessionFromCtx>[0];

export async function exigerPreuvePourPasskey(
  ctx: ContexteGarde,
): Promise<void> {
  if (!CHEMINS_PASSKEY_GARDES.has(ctx.path)) {
    return;
  }

  const session = await getSessionFromCtx(ctx);
  if (!session?.session) {
    return;
  }

  const { deciderChangementIdentifiants } =
    await import("@/services/reauthentification");
  const decision = await deciderChangementIdentifiants(session.session.id);

  if (decision === "ROLE_INSUFFISANT") {
    throw new APIError("FORBIDDEN", {
      code: CODE_ROLE_INSUFFISANT,
      message: "Les passkeys sont réservées à l'administration.",
    });
  }

  if (decision === "PREUVE_ABSENTE") {
    throw new APIError("FORBIDDEN", {
      code: CODE_PREUVE_REQUISE,
      message: "Confirmez votre identité avant de modifier vos passkeys.",
    });
  }
}
