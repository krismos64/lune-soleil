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
 * d'entree sont multiples, `/sign-in/email`, `/sign-in/passkey`, et d'autres
 * viendront. Un appel par ecran serait a refaire a chaque ajout, et un oubli
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
import {
  enregistrerTentativeConnexion,
  type IssueConnexion,
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
  ["/sign-in/passkey", "PASSKEY"],
]);

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
    resultat.emailConfirme ?? emailTenteDepuisCorps(ctx.body) ?? "(inconnu)";

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
