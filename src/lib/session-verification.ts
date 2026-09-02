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
 * ce hook n'intervienne. Ce qui est retire, c'est uniquement le cookie pose
 * pour une requete qui n'en portait AUCUN.
 */
/** Le chemin vise, ecrit une seule fois. */
const CHEMIN_VERIFICATION = "/verify-email";

/**
 * Le nom du cookie de session, prefixe compris.
 *
 * LES DEUX FORMES SONT TRAITEES : Better Auth prefixe `__Secure-` quand il sert
 * en HTTPS, et ne le fait pas en HTTP. Ne chercher qu'une seule forme laisserait
 * le hook inoperant dans l'environnement ou il compte le plus, la production.
 *
 * LA COMPARAISON PORTE SUR LE NOM SEUL, jamais sur la valeur : rien ici ne lit
 * ni ne journalise un jeton de session, invariant 9.
 */
const NOMS_COOKIE_SESSION = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
];

/**
 * Vrai si la requete entrante portait deja une session.
 *
 * SUR LA REQUETE ET NON SUR LA REPONSE, et la distinction est tout le
 * mecanisme. La reponse porte TOUJOURS un cookie a ce stade, que la session ait
 * ete recuperee ou creee : c'est la requete qui dit si quelqu'un etait connecte
 * AVANT de cliquer.
 */
function requeteDejaConnectee(enTeteCookie: string | null): boolean {
  if (!enTeteCookie) {
    return false;
  }

  return NOMS_COOKIE_SESSION.some((nom) =>
    // La borne `=` evite qu'un cookie dont le nom CONTIENT celui-ci, pose par un
    // autre outil, fasse passer la requete pour connectee.
    enTeteCookie.split(";").some((paire) => paire.trim().startsWith(`${nom}=`)),
  );
}

/**
 * Ce dont cette fonction a besoin, et RIEN DE PLUS.
 *
 * UN TYPE STRUCTUREL ET NON `MiddlewareContext` de Better Auth, et ce n'est pas
 * un contournement de commodite. Le type du contexte porte `request?: Request`
 * en optionnel exact : le repasser d'un middleware a un autre exigerait un cast,
 * qui masquerait un vrai changement de forme le jour d'une montee de version.
 *
 * Nommer les trois champs employes rend en outre la surface visible : cette
 * fonction lit un chemin, un en-tete de requete, et touche deux porteurs
 * d'en-tetes de reponse. Elle ne peut rien faire d'autre.
 */
type ContexteVerification = {
  path?: string | undefined;
  headers?: Headers | undefined;
  context: {
    responseHeaders?: Headers | undefined;
  };
};

/**
 * Retire le cookie de session qu'un lien de verification vient de poser.
 *
 * UNE FONCTION ET NON UN `createAuthMiddleware`, et la raison est mecanique :
 * `hooks.after` n'accepte qu'UN middleware, verifie dans le code de dispatch de
 * Better Auth 1.6, et LS-80 y a deja pose le journal des connexions.
 * `hook-journal-connexion.ts` l'appelle donc, ce qui evite un composeur qui
 * devrait recaster le contexte.
 *
 * ELLE EST APPELEE AVANT le filtre de chemin du journal : celui-ci sort
 * immediatement sur `/verify-email`, qui n'est pas un chemin de connexion.
 */
export async function retirerSessionDeVerification(
  ctx: ContexteVerification,
): Promise<void> {
  if (ctx.path !== CHEMIN_VERIFICATION) {
    return;
  }

  if (requeteDejaConnectee(ctx.headers?.get("cookie") ?? null)) {
    /*
     * LE CLIENT ETAIT DEJA CONNECTE : le cookie de la reponse rafraichit SA
     * session, celle qu'il detenait avant de cliquer. Le retirer le
     * deconnecterait au milieu de son propre parcours, ce qui est exactement la
     * reserve que LS-167 posait.
     */
    return;
  }

  /*
   * PERSONNE N'ETAIT CONNECTE, et une session vient pourtant d'etre ouverte. Le
   * cookie est retire de la reponse : la verification a bien eu lieu, l'adresse
   * est mise a jour, mais le lien ne vaut plus connexion.
   *
   * AUCUN COOKIE N'EST POSE POUR EFFACER, et c'est deliberé : un cookie expire
   * ecraserait une session legitime portee par un autre onglet du meme
   * navigateur. On retire l'en-tete que Better Auth vient d'ecrire, sans en
   * poser aucun.
   */
  /*
   * UNE SEULE SOURCE SUFFIT, ET C'EST LA MESURE QUI L'A DIT. J'avais d'abord
   * ajoute deux traitements de plus, sur `ctx.context.returned` et sur les
   * symboles propres de l'erreur, en supposant que `ctx.redirect` recopiait les
   * en-tetes hors de portee.
   *
   * LA MUTATION A PROUVE LE CONTRAIRE : retirer chacun de ces deux traitements
   * laissait les trois tests VERTS, retirer celui-ci les faisait rougir. Les
   * deux autres etaient du code mort, ecrit sur une hypothese jamais verifiee,
   * et un code mort dans une correction de securite est pire qu'absent : il
   * donne l'impression d'une defense en profondeur qui n'existe pas.
   *
   * `mergeAPIErrorHeaders` recopie bien les en-tetes sur l'erreur, mais APRES
   * ce hook : vider l'accumulateur suffit donc, la copie emportant un
   * accumulateur deja vide.
   */
  ctx.context.responseHeaders?.delete("set-cookie");
}
