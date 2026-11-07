/**
 * Empeche un lien de verification d'adresse d'OUVRIR une session. LS-167,
 * defaut trouve par `ls-critical-reviewer` pendant LS-60.
 *
 * CE QUI A ETE MESURE. Le lien de changement d'adresse, clique SANS AUCUN
 * COOKIE, cree une session authentifiee complete, et le jeton se rejoue :
 *
 *   sessions AVANT le clic : 2
 *   sessions APRES         : 3, et le cookie du clic est utilisable
 *   rejeu du MEME lien     : 4, la table `verification` reste vide
 *
 * Le jeton est un JWT auto-porteur, valide sur sa seule signature et son
 * echeance : rien ne le consomme, donc chaque ouverture recree une session
 * pendant toute sa duree de validite.
 *
 * POURQUOI CELA COMPTE. Quiconque lit l'email UNE SEULE FOIS obtient une session
 * sur le compte, reutilisable autant de fois qu'il veut : boite partagee, poste
 * familial, transfert automatique, capture dans un journal de relais SMTP.
 *
 * LA CONTRADICTION QUE CE HOOK RESOUT. `src/lib/auth.ts` refuse
 * `autoSignInAfterVerification` avec ce motif exact : « poser ce drapeau
 * ouvrirait une session depuis un lien recu par email, donc depuis un canal
 * qu'un acces a la boite compromet ». Le drapeau est bien a `false`, et une
 * AUTRE branche ouvrait la session quand meme. Une decision de securite
 * contredite par le code qu'elle est censee gouverner est pire qu'une decision
 * absente : elle rassure a tort.
 *
 * POURQUOI LE CONTOURNEMENT PLUTOT QUE L'ADR D'ACCEPTATION, les deux directions
 * que LS-167 laissait ouvertes. Assumer aurait demande d'ecrire qu'un lien vaut
 * connexion quinze minutes, ce qui est le comportement de nombreux sites : mais
 * il aurait fallu revenir sur la decision voisine, ou l'assumer d'un cote et la
 * refuser de l'autre sans qu'aucun critere ne separe les deux cas. Le
 * contournement garde les deux chemins coherents.
 *
 * CE QUE CE HOOK NE CASSE PAS, et c'est la reserve que le ticket posait. Le
 * parcours d'inscription reste entier : la branche de verification SIMPLE
 * respecte `autoSignInAfterVerification`, verifie dans le code de Better Auth
 * 1.6, donc n'ouvre deja aucune session. Seule la branche
 * `change-email-verification` ouvrait la sienne inconditionnellement, et elle
 * ne concerne QUE le changement d'adresse, geste fait depuis un compte deja
 * connecte.
 *
 * LE CAS NOMINAL RESTE DONC CONNECTE : le client change son adresse depuis son
 * espace, sa session existe deja, et `setSessionCookie` la rafraichit sans que
 * ce hook n'intervienne. Ce qui est retire, c'est tout cookie pose pour une
 * requete qui ne portait aucune session VALIDE, forgee ou perimee comprise,
 * LS-295.
 */
/** Le chemin vise, ecrit une seule fois. */
const CHEMIN_VERIFICATION = "/verify-email";

/**
 * Vrai si la session posee par la reponse est celle, VALIDE, que la requete
 * portait deja. LS-295, correction de la revue critique.
 *
 * LA DECISION PORTAIT SUR LE NOM DU COOKIE JUSQU'AU 7 NOVEMBRE 2026, et c'etait
 * le defaut. Better Auth, lui, decide sur une session validee,
 * `getSessionFromCtx` : un cookie forge ou perime au nom exact faisait croire
 * le visiteur connecte ici, pendant que la bibliotheque creait une session
 * neuve et posait son cookie. Mesure : un `Cookie:
 * better-auth.session_token=forge` suffisait a obtenir une session sur le
 * compte depuis le lien, donc une preuve d'identite par
 * `prouverIdentiteParPasskey`, dont la regle des soixante secondes suppose ce
 * chemin ferme.
 *
 * LES DEUX INFORMATIONS VIENNENT DU CONTEXTE DE BETTER AUTH, verifie dans le
 * code de la 1.7.14 : `getSessionFromCtx` y range la session VALIDE de la
 * requete, ou `null`, et `setSessionCookie` y range la session posee,
 * `newSession`. Aucun jeton n'est lu ni journalise ici, invariant 9 : seuls les
 * identifiants de ligne sont compares.
 *
 * DEFAUT FERME : sans session valide connue, aucun cookie ne sort. La branche
 * de verification simple ne lit pas la session et ne pose aucun cookie,
 * `autoSignInAfterVerification` etant desactive : rien n'y est donc retire.
 */
function reconduitLaSessionDeLaRequete(
  context: ContexteVerification["context"],
): boolean {
  const valide = context.session?.session?.id;
  const posee = context.newSession?.session?.id;

  return typeof valide === "string" && posee === valide;
}

type SessionDuContexte = { session?: { id?: string } } | null | undefined;

type ContexteVerification = {
  path?: string | undefined;
  headers?: Headers | undefined;
  context: {
    responseHeaders?: Headers | undefined;
    session?: SessionDuContexte;
    newSession?: SessionDuContexte;
  };
};

export async function retirerSessionDeVerification(
  ctx: ContexteVerification,
): Promise<void> {
  if (ctx.path !== CHEMIN_VERIFICATION) {
    return;
  }

  if (reconduitLaSessionDeLaRequete(ctx.context)) {
    // Le client etait connecte dans ce navigateur et sa session est rafraichie
    // avec la nouvelle adresse : la lui retirer le deconnecterait au milieu de
    // son propre parcours, reserve de LS-167.
    return;
  }

  /*
   * TOUT `set-cookie` EST RETIRE, et non le seul cookie de session : sur cette
   * route, aucun autre cookie n'a de raison de sortir vers un visiteur qui n'a
   * pas prouve sa session. La ligne de session reste ecrite en base, le hook
   * `after` s'executant apres l'endpoint ; elle n'ouvre rien, personne n'ayant
   * son jeton, et expire d'elle-meme.
   */
  ctx.context.responseHeaders?.delete("set-cookie");
}
