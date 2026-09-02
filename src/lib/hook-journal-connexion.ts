/**
 * Branchement du journal des connexions sur Better Auth. LS-80, ADR-027.
 *
 * POURQUOI UN MODULE SEPARE DE `auth.ts`. Ce hook porte la seule logique de
 * cette story qui decide quelque chose : reussite ou echec, quel moyen, quel
 * compte. La loger dans la configuration la rendrait intestable autrement
 * qu'en montant une instance complete de Better Auth, et elle se diluerait
 * dans un fichier qui fait deja quatre choses.
 *
 * POURQUOI UN HOOK ET NON UN APPEL DANS CHAQUE ECRAN DE CONNEXION. Les chemins
 * d'entree sont multiples, `/sign-in/email`, `/passkey/verify-authentication`,
 * et d'autres viendront. Un appel par ecran serait a refaire a chaque ajout, et un oubli
 * ne produirait aucun symptome : le journal serait simplement incomplet, ce
 * qui est le pire etat pour une trace de securite. Le hook capte la sortie de
 * Better Auth, donc tous les chemins qui passent par lui.
 *
 * CE QUE CE MODULE NE LIT JAMAIS : `ctx.body.password`. Better Auth expose le
 * mot de passe en clair a cet endroit, la documentation le confirme et le
 * greffon a deux facteurs s'en sert. Rien ici ne doit s'en approcher, meme
 * pour en mesurer la longueur. Invariant 9, critere d'acceptation 2.
 */
import { createAuthMiddleware, getIp } from "better-auth/api";

import { lireResultat } from "@/lib/issue-connexion";
import { retirerSessionDeVerification } from "@/lib/session-verification";
import {
  ADRESSE_ABSENTE,
  ADRESSE_NON_LUE,
  enregistrerTentativeConnexion,
  type MoyenConnexion,
} from "@/services/journal-connexion";

/**
 * Les chemins de connexion surveilles, et le moyen que chacun designe.
 *
 * UNE TABLE ET NON UNE SUITE DE `if`. Ajouter un chemin est une ligne, et la
 * liste se lit d'un coup d'oeil pour verifier qu'aucun chemin de connexion ne
 * manque. Le controle textuel du projet peut aussi la relever.
 *
 * `/sign-in/email` COUVRE LES DEUX POPULATIONS, l'administration comme les
 * clients : c'est la meme route, seul le role du compte differe. La portee
 * demandee par ADR-027 est donc atteinte sans traitement particulier.
 *
 * `/sign-up/email` N'EST PAS ICI. Une inscription n'est pas une tentative de
 * connexion : la journaliser melangerait deux faits distincts dans la meme
 * table, et l'ecran de consultation ne saurait plus ce qu'il montre.
 */
const CHEMINS_SURVEILLES: ReadonlyMap<string, MoyenConnexion> = new Map([
  ["/sign-in/email", "MOT_DE_PASSE"],
  // `/passkey/verify-authentication` ET NON `/sign-in/passkey`, qui N'EXISTE
  // PAS. Le nom evident est faux : le plugin expose ses routes sous `/passkey/`
  // et c'est la verification de l'assertion WebAuthn qui ouvre la session, via
  // `setSessionCookie`. La premiere version de ce fichier visait le chemin
  // inexistant, et le hook sortait donc sans rien ecrire sur TOUTES les
  // connexions par passkey, c'est-a-dire le moyen principal de
  // l'administration, ADR-021. Aucun test ne le voyait, et l'enum `PASSKEY`
  // n'etait ecrite par aucun chemin reel.
  ["/passkey/verify-authentication", "PASSKEY"],
]);

/**
 * Le prefixe de chemin de l'API d'authentification, a retirer avant comparaison.
 *
 * L'ADAPTATEUR DE ROUTE recoit l'URL COMPLETE, `/api/auth/sign-in/email`, la ou
 * le hook `after` recoit un `ctx.path` deja normalise, `/sign-in/email`.
 * Comparer les deux sans retirer ce prefixe ne trouverait jamais rien, et la
 * journalisation des refus serait silencieuse sans qu'aucune erreur
 * n'apparaisse.
 */
const PREFIXE_API_AUTH = "/api/auth";

/**
 * Extrait le moyen de connexion d'une URL complete, ou `undefined`.
 *
 * Exportee pour le test : le retrait du prefixe est exactement le genre de
 * detail qui casse en silence, et rien dans un parcours nominal ne distingue
 * « aucune tentative refusee » de « le chemin n'est plus reconnu ».
 */
export function moyenDepuisUrl(url: string): MoyenConnexion | undefined {
  let chemin: string;

  try {
    chemin = new URL(url).pathname;
  } catch {
    // Une URL relative n'est pas analysable ainsi. Le cas ne se produit pas
    // avec Better Auth, qui passe une `Request` dont l'URL est absolue, mais
    // lever ici ferait echouer la reponse elle-meme.
    return undefined;
  }

  if (!chemin.startsWith(PREFIXE_API_AUTH)) {
    return undefined;
  }

  return CHEMINS_SURVEILLES.get(chemin.slice(PREFIXE_API_AUTH.length));
}

/**
 * Journalise une tentative refusee par la limitation de debit, regle E13.
 *
 * POURQUOI CE CHEMIN EXISTE, ET POURQUOI IL N'EST PAS UN HOOK. Better Auth
 * applique la limitation dans le `onRequest` de son routeur et rend la reponse
 * 429 immediatement : `better-call` sort alors de son gestionnaire sans
 * appeler ni l'endpoint, ni les hooks `after`, ni meme `onResponse`. Aucun
 * point d'extension de la bibliotheque ne voit ces requetes. Le seul endroit
 * qui les voit est l'adaptateur de route de Next.js, en aval de tout.
 *
 * CE QUE LE TROU COUTAIT, mesure en relecture de LS-80 : avec cinq tentatives
 * par minute autorisees, une attaque de trois cents tentatives en cinq minutes
 * ne laissait que vingt-cinq lignes. La relecture y voyait « quelques echecs
 * par minute », c'est-a-dire une saisie maladroite, quand il s'agissait d'un
 * balayage. Le volume refuse EST le signal.
 *
 * L'ADRESSE TENTEE N'EST PAS LUE. Le corps de la requete a ete refuse sans
 * etre analyse, et le relire ici obligerait a consommer un flux que Better
 * Auth n'a pas touche. Ce que la ligne doit dire est « une cadence anormale a
 * ete refusee sur ce chemin, depuis cette adresse », et l'adresse IP suffit a
 * la relier aux tentatives voisines.
 *
 * ELLE NE LEVE JAMAIS, regle E15, `enregistrerTentativeConnexion` avalant deja
 * ses erreurs. Un refus de cadence doit partir au client quoi qu'il arrive.
 */
export async function journaliserRefusLimitation(
  requete: Request,
  options: Parameters<typeof getIp>[1],
): Promise<void> {
  const moyen = moyenDepuisUrl(requete.url);

  if (!moyen) {
    return;
  }

  await enregistrerTentativeConnexion({
    emailTente: ADRESSE_NON_LUE,
    utilisateurId: null,
    moyen,
    issue: "REFUSEE_LIMITATION",
    adresseIp: getIp(requete, options),
    agentUtilisateur: requete.headers.get("user-agent"),
  });
}

/**
 * Extrait l'adresse email d'un corps de requete de forme inconnue.
 *
 * `ctx.body` N'EST PAS TYPE au niveau du hook, qui voit passer toutes les
 * routes. Le champ est donc lu defensivement plutot que par une assertion de
 * type, qui mentirait au compilateur sur ce qui arrive reellement.
 *
 * LA VALEUR N'EST PAS VALIDEE ICI. Ce n'est pas une entree qui autorise quoi
 * que ce soit, invariant 2 : c'est le texte qu'on a tente, et son interet
 * tient precisement a ce qu'il puisse etre n'importe quoi. Une adresse
 * malformee dans le journal dit quelque chose de vrai sur la tentative.
 */
function emailTenteDepuisCorps(corps: unknown): string | null {
  if (typeof corps !== "object" || corps === null) {
    return null;
  }

  const email = (corps as { email?: unknown }).email;

  return typeof email === "string" ? email : null;
}

/**
 * Le hook `after` a brancher sur Better Auth.
 *
 * IL N'INTERROMPT RIEN ET NE MODIFIE AUCUNE REPONSE : il ne rend aucune valeur,
 * donc la reponse de Better Auth part telle quelle. C'est ce qui rend la regle
 * E15 tenable, un journal qui ne peut pas s'ecrire ne doit pas empecher une
 * connexion, et `enregistrerTentativeConnexion` ne leve deja jamais.
 *
 * L'ADRESSE IP VIENT DE `getIp` DE BETTER AUTH, jamais d'une lecture directe de
 * `x-forwarded-for`. Depuis la 1.6.21, cette fonction refuse une chaine a
 * plusieurs sauts tant qu'aucun proxy de confiance n'est declare, precisement
 * parce qu'un client peut usurper le saut de gauche. Relire l'en-tete a la main
 * reintroduirait le trou que la bibliotheque vient de fermer, et remplirait le
 * journal d'adresses choisies par l'attaquant. Une valeur nulle est preferable
 * a une valeur fausse : elle ne se fait pas passer pour une preuve.
 */
export const hookJournalConnexion = createAuthMiddleware(async (ctx) => {
  /*
   * LS-167 PASSE PAR ICI, ET CE N'EST PAS UN MELANGE DE RESPONSABILITES.
   * `hooks.after` n'accepte qu'UN middleware, verifie dans le code de dispatch
   * de Better Auth 1.6 : ce fichier est donc le seul point d'entree disponible
   * apres une requete. La logique elle-meme vit dans `session-verification.ts`,
   * ou elle reste lisible et testable seule.
   *
   * AVANT LE FILTRE DE CHEMIN CI-DESSOUS, qui sort immediatement : les chemins
   * surveilles sont ceux de CONNEXION, et `/verify-email` n'en est pas un.
   * Placer l'appel apres le rendrait inatteignable.
   */
  await retirerSessionDeVerification(ctx);

  const moyen = ctx.path ? CHEMINS_SURVEILLES.get(ctx.path) : undefined;

  if (!moyen) {
    return;
  }

  const resultat = lireResultat(ctx.context);

  // Sur une reussite, l'adresse vient du serveur ; sur un echec, il ne reste
  // que ce qui a ete saisi. La chaine vide n'est jamais ecrite telle quelle,
  // elle dirait « aucune adresse » la ou la verite est « adresse absente de la
  // requete ».
  const emailTente =
    resultat.emailConfirme ??
    emailTenteDepuisCorps(ctx.body) ??
    ADRESSE_ABSENTE;

  await enregistrerTentativeConnexion({
    emailTente,
    utilisateurId: resultat.utilisateurId,
    moyen,
    issue: resultat.issue,
    adresseIp: ctx.request
      ? getIp(ctx.request, ctx.context.options)
      : ctx.headers
        ? getIp(ctx.headers, ctx.context.options)
        : null,
    agentUtilisateur: ctx.headers?.get("user-agent") ?? null,
  });
});
