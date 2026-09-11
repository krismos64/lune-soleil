/**
 * Ralentissement progressif par compte visé, LS-83. ADR-021 mesure 2, ADR-027.
 *
 * ZONE CRITIQUE : c'est du code écrit par-dessus la bibliothèque
 * d'authentification, et une erreur y ferme la porte à l'exploitante plutôt
 * qu'à l'attaquant.
 *
 * L'ÉCART QU'IL FERME. ADR-021 demande une limitation « par identifiant de
 * compte ». Le mécanisme intégré de Better Auth, retenu par LS-79, compte par
 * ADRESSE IP. Il couvre l'attaque automatisée depuis une machine, cas courant ;
 * il ne couvre ni l'attaque répartie sur de nombreuses adresses, ni le
 * verrouillage ciblé d'un compte précis.
 *
 * LES DEUX MÉCANISMES SE COMPOSENT, ils ne se remplacent pas. Celui de Better
 * Auth reste en place et refuse en 429 ; celui-ci ajoute un délai quand un même
 * compte est visé, quelle que soit l'adresse d'origine.
 *
 * LE BLOCAGE COMPLET EST ÉCARTÉ, ADR-027 le dit nommément : échouer
 * volontairement sur l'adresse de quelqu'un verrouillerait son compte. C'est
 * l'inverse de ce qu'on protège. Le ralentissement casse l'attaque automatique
 * sans jamais fermer la porte au vrai propriétaire, qui finit toujours par
 * pouvoir se connecter.
 *
 * IL NE RÉVÈLE PAS SI LE COMPTE EXISTE. Le délai s'applique à toute adresse
 * visée de façon répétée, existante ou non : mesurer le temps de réponse ne dit
 * donc rien de plus qu'une réponse immédiate. Sans cela, la protection
 * deviendrait un oracle d'énumération d'adresses.
 *
 * LA RÈGLE DE DÉLAI VIT DANS `lib/delai-ralentissement.ts`, et ce découpage
 * n'est pas cosmétique : ce module tire Prisma, donc `DATABASE_URL`, et la
 * suite unitaire du projet doit rester lançable sans base. Ce qui reste ici est
 * le compteur et la clé, qui ont besoin de la base pour être prouvés.
 */
import { delaiPourEchecs } from "@/lib/delai-ralentissement";
import { journaliser, journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  effacerCompteVise,
  incrementerCompteVise,
} from "@/repositories/limitation";

/**
 * Fenêtre d'observation des échecs sur un même compte.
 *
 * QUINZE MINUTES, PLUS LONGUE QUE CELLE DE BETTER AUTH qui compte par minute.
 * Les deux mesurent des choses différentes : la sienne attrape la rafale depuis
 * une machine, celle-ci la campagne patiente répartie sur des adresses, dont le
 * rythme est justement lent pour rester sous les seuils par IP.
 */
const FENETRE_SECONDES = 15 * 60;

/**
 * La clé du compteur, préfixée pour rester lisible en exploitation.
 *
 * LE PRÉFIXE N'EST PLUS UNE PROTECTION DEPUIS QUE LA TABLE EST PROPRE, et il
 * reste utile : une clé nue serait indistinguable d'un identifiant technique
 * quand quelqu'un lit la table à la main.
 *
 * ELLE PORTE L'ADRESSE EMAIL VISÉE, normalisée, et c'est tout l'objet : le
 * compteur suit la CIBLE et non l'origine. Deux mille adresses IP visant le
 * même compte partagent donc un seul compteur.
 *
 * L'ADRESSE EST HACHÉE, invariant 9. Le dépôt est public et le compteur vit
 * dans une table ordinaire : y écrire des adresses email en clair ferait d'une
 * fuite de cette table une fuite de fichier client. L'empreinte suffit, le
 * service n'ayant jamais besoin de relire l'adresse.
 */
async function cleDe(emailNormalise: string): Promise<string> {
  const { createHash } = await import("node:crypto");

  const empreinte = createHash("sha256")
    .update(emailNormalise)
    .digest("hex")
    .slice(0, 32);

  return `compte-vise:${empreinte}`;
}

/**
 * Compte un échec sur un compte visé, et rend le délai à appliquer.
 *
 * ELLE NE DORT PAS ELLE-MÊME : elle rend une durée, et l'appelant décide. Une
 * fonction qui dormirait serait intestable sans horloge simulée, et un test qui
 * attend huit secondes n'est pas un test qu'on relance.
 *
 * EN CAS DE PANNE DE LA BASE, ELLE REND ZÉRO. Défaut OUVERT, même choix que
 * `limitation-action.ts` et pour la même raison : refuser ou ralentir sur une
 * base qui tousse dégraderait l'authentification de tout le monde, alors que la
 * limitation par IP de Better Auth reste en place et ne dépend pas de cette
 * table. La tentative reste journalisée.
 */
export async function compterEchecSurCompte(
  emailNormalise: string,
): Promise<number> {
  try {
    const echecs = await incrementerCompteVise(
      prisma,
      await cleDe(emailNormalise),
      FENETRE_SECONDES,
    );

    const delai = delaiPourEchecs(echecs);

    if (delai > 0) {
      /*
       * AUCUNE ADRESSE EMAIL DANS LE JOURNAL, invariant 9. `journal.ts` masque
       * déjà toute clé contenant « email », mais ce service n'a de toute façon
       * pas besoin de la nommer : le compte et le délai suffisent au
       * diagnostic, et c'est le VOLUME qui signale une attaque.
       */
      journaliser("info", "ralentissement sur un compte vise", {
        echecs,
        delaiMs: delai,
      });
    }

    return delai;
  } catch (erreur) {
    journaliserErreur("ralentissement par compte indisponible", erreur, {});

    return 0;
  }
}

/**
 * Efface le compteur d'un compte après une connexion réussie.
 *
 * POURQUOI EFFACER PLUTÔT QUE LAISSER EXPIRER, même motif que
 * `limitation-action.ts` : sans cela, une personne qui se trompe six fois puis
 * réussit resterait ralentie pour le reste des quinze minutes, alors qu'elle
 * vient de prouver son identité.
 *
 * CELA N'AFFAIBLIT PAS LA PROTECTION. Le seul moyen de remettre le compteur à
 * zéro est de fournir le bon mot de passe ou la bonne passkey, ce qui est
 * précisément ce que l'attaquant cherche et n'a pas.
 *
 * ELLE AVALE SES ERREURS, règle E15 : une base en souffrance ne doit jamais
 * faire échouer une connexion qui vient de réussir.
 */
export async function oublierEchecsDuCompte(
  emailNormalise: string,
): Promise<void> {
  try {
    await effacerCompteVise(prisma, await cleDe(emailNormalise));
  } catch (erreur) {
    journaliserErreur("effacement du ralentissement impossible", erreur, {});
  }
}
