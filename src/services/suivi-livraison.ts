/**
 * Synchronisation du suivi de livraison, LS-131. ADR-042, regle V11.
 *
 * CE MODULE ECRIT LA DATE QUI OUVRE UN DELAI LEGAL. `Expedition.livreA` est le
 * point de depart du droit de retractation, article L221-18, et l'article
 * L221-20 le porte a DOUZE MOIS quand l'information sur ce droit est
 * incorrecte. Il declenche aussi l'invitation a deposer un avis, LS-61, dont les
 * articles D111-9 a D111-12 imposent une date d'experience EXACTE.
 *
 * IL NE DECIDE PAS DE CE QU'UN STATUT VAUT : `integrations/sendcloud/statuts`
 * porte la correspondance, ce module porte ce qu'elle declenche. La frontiere
 * compte, une table de correspondance se relit d'un coup d'oeil quand une
 * regle metier melangee a elle ne se relit plus.
 *
 * IL NE BLOQUE JAMAIS SUR UNE PANNE. Une exception qui remonterait arreterait
 * le cycle sur la premiere expedition muette, et les suivantes ne seraient
 * jamais lues. L'echec est porte expedition par expedition, meme motif que
 * `purge-journaux` et la reconciliation de LS-120.
 */
import { estEchecDefinitif, estLivre } from "@/integrations/sendcloud/statuts";
import type { ClientSuivi } from "@/integrations/sendcloud/suivi";
import { clientSuivi } from "@/integrations/sendcloud/suivi";
import { journaliser, journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { leverAlerteCritique } from "@/repositories/confirmation";
import {
  enregistrerSuivi,
  listerASuivre,
  listerRemisesNonLivrees,
  passerCommandeLivree,
} from "@/repositories/expedition";

/**
 * Type d'alerte des livraisons qui n'aboutiront pas, ADR-042 decision 3.
 *
 * L'EXPLOITANTE TRAITE LE CAS A LA MAIN, et le site n'ecrit ni statut de
 * commande ni mouvement de stock : le traitement depend de faits qu'il ignore,
 * l'arbitrage entre rembourser, reexpedier et remettre en vente dependant de
 * l'etat reel de la piece revenue, ADR-030.
 */
export const TYPE_ALERTE_LIVRAISON = "LIVRAISON_EN_ECHEC";

/**
 * Nombre d'expeditions lues par cycle.
 *
 * BORNE ET NON ILLIMITE : chaque expedition coute un appel reseau, et la tache
 * tient son verrou pendant ce temps. Cinquante colis a huit secondes au pire
 * restent tres en dessous du verrou d'une heure.
 */
const LIMITE_PAR_CYCLE = 50;

export type IssueSynchronisation = {
  /** Expeditions examinees, echecs compris. */
  traitees: number;
  /** Expeditions dont le suivi n'a pas pu etre lu. */
  echecs: number;
  /** Expeditions dont la livraison vient d'etre constatee. */
  livrees: number;
};

/**
 * Lit le suivi des expeditions en cours et renseigne ce qui doit l'etre.
 *
 * LE CLIENT EST INJECTABLE pour que les tests exercent la REGLE sans reseau :
 * ce qu'un statut declenche est ce qui se paie en droit, la traduction de l'API
 * etant deja couverte ailleurs.
 */
export async function synchroniserSuivi({
  client = clientSuivi,
}: { client?: ClientSuivi } = {}): Promise<IssueSynchronisation> {
  /*
   * LA REQUETE VIT DANS `repositories/`, frontiere du projet : ce qui est lu et
   * pourquoi ces exclusions comptent y est documente.
   */
  const aSuivre = await listerASuivre(prisma, LIMITE_PAR_CYCLE);

  let echecs = 0;
  let livrees = 0;

  for (const expedition of aSuivre) {
    try {
      const suivi = await client.lireStatut(expedition.numeroSuivi ?? "");

      /*
       * UN NUMERO INCONNU DU TRANSPORTEUR N'EST PAS UNE PANNE, cas normal au
       * premier cycle : le colis remis la veille peut n'etre pas encore
       * enregistre. `synchroniseA` reste nul, ce qui est exact, aucun statut
       * n'ayant ete lu.
       */
      if (suivi === null) {
        continue;
      }

      const echec = estEchecDefinitif(suivi.statut);

      const livreA = echec
        ? null
        : await dateDeRemise(client, expedition, suivi.statut);

      /*
       * LE LIBELLE ET NON L'IDENTIFIANT, decision 5 : un nombre nu est illisible
       * sur l'ecran d'administration de LS-216, quand le code compare sur
       * l'identifiant, stable.
       *
       * `livreA` NE SE REECRIT JAMAIS : `listerASuivre` ne rend que les
       * expeditions dont il est nul, et `enregistrerSuivi` filtre l'ecriture sur
       * la meme condition. Deplacer cette date repousserait la fin du droit de
       * retractation.
       */
      const ecrite = await enregistrerSuivi(prisma, {
        expeditionId: expedition.id,
        statutTransporteur: suivi.libelle,
        ...(livreA === null ? {} : { livreA }),
      });

      if (livreA !== null && ecrite) {
        livrees += 1;
      }

      if (echec) {
        await signalerEchec(expedition.id, suivi.libelle);
      }
    } catch (erreur) {
      /*
       * L'ECHEC EST COMPTE ET LE CYCLE CONTINUE. Une expedition muette ne doit
       * pas empecher les suivantes d'avancer, et `synchroniseA` reste nul : le
       * renseigner malgre l'echec ferait passer un suivi jamais lu pour un
       * suivi a jour, et l'ecran annoncerait une fraicheur fausse.
       */
      echecs += 1;
      journaliserErreur("suivi de livraison illisible", erreur, {
        expeditionId: expedition.id,
      });
    }
  }

  const rattrapees = await rattraperLesRemises();

  journaliser("info", "Synchronisation du suivi terminee", {
    traitees: aSuivre.length,
    echecs,
    livrees,
    rattrapees,
  });

  return { traitees: aSuivre.length, echecs, livrees };
}

/**
 * Passe a `LIVREE` les commandes dont la remise est connue sans que le statut
 * ait suivi, LS-312. Rend leur nombre.
 *
 * UN SEUL CHEMIN, EN FIN DE CYCLE, ET C'EST VOULU. Il couvre la remise que la
 * boucle vient d'ecrire, celles ecrites avant LS-312, dont la premiere commande
 * reelle, et tout cycle interrompu entre la date et le statut. Un second passage
 * dans la boucle, transaction comprise, ferait la meme chose : retire, sa
 * mutation n'aurait rien fait rougir, ce balayage la masquant. Le statut suit
 * la remise dans le meme cycle, quelques millisecondes plus tard.
 *
 * Une transaction par commande, transition et historique ensemble : un echec
 * n'empeche pas les suivantes, et il est journalise sans interrompre le cycle,
 * comme une lecture de suivi illisible.
 */
async function rattraperLesRemises(): Promise<number> {
  let rattrapees = 0;

  for (const expeditionId of await listerRemisesNonLivrees(
    prisma,
    LIMITE_PAR_CYCLE,
  )) {
    try {
      const passee = await prisma.$transaction((transaction) =>
        passerCommandeLivree(transaction, expeditionId),
      );
      if (passee) {
        rattrapees += 1;
      }
    } catch (erreur) {
      journaliserErreur("passage a LIVREE impossible", erreur, {
        expeditionId,
      });
    }
  }

  return rattrapees;
}

/**
 * L'instant de la remise au client, ou `null` s'il n'a pas eu lieu. LS-311.
 *
 * L'HISTORIQUE FAIT FOI, LE STATUT DU COLIS EN EST LE REPLI. Mesure sur la
 * premiere commande reelle : retiree au Locker le 3 novembre 2026 a 14 h 52 UTC,
 * elle restait au statut 12 plus de vingt heures apres, l'historique portant
 * `delivered` a la seconde. Le statut seul laissait `livreA` nul, donc aucun
 * delai de retractation ouvert a l'ecran et aucune invitation a l'avis.
 *
 * LA DATE EST CELLE DU TRANSPORTEUR et non l'heure du cycle : la synchronisation
 * horaire decalait la date d'experience d'un avis, D111-9, d'une heure au
 * moins, et une panne de plusieurs cycles la decalait d'autant.
 *
 * LE REPLI `new Date()` NE SERT QUE SI LE STATUT LIVRE ET QUE L'HISTORIQUE SE
 * TAIT : `Shipment collected by customer`, 93, n'a pas d'evenement textuel
 * documente, et retirer ce chemin ferait regresser ce qu'ADR-042 garantissait.
 * Il ne peut qu'etre plus TARDIF que la remise reelle, sens sur de
 * `.claude/rules/legal.md` : un delai ouvert plus tard s'allonge, il ne
 * s'eteint pas avant terme.
 *
 * UNE PANNE DE L'HISTORIQUE LEVE, et l'expedition compte en echec sans rien
 * ecrire : la date exacte sera relue au cycle suivant, le transporteur la
 * conservant. Livrer au repli pendant une panne figerait une date fausse pour
 * toujours, `livreA` ne se reecrivant pas.
 */
async function dateDeRemise(
  client: ClientSuivi,
  expedition: { numeroSuivi: string | null; expedieA: Date | null },
  statut: number,
): Promise<Date | null> {
  const remise = await client.lireLivraison(expedition.numeroSuivi ?? "");

  /*
   * UN COLIS RETOUR NE LIVRE JAMAIS, repli compris : son statut 11 dit qu'il
   * est revenu a l'atelier, pas qu'il est chez le client.
   */
  if (remise.etat === "retour") {
    return null;
  }

  if (remise.etat === "remise") {
    /*
     * UNE REMISE ANTERIEURE A L'EXPEDITION EST UNE DERIVE, symetrique de la
     * garde du futur. Le cas type est un numero de suivi recolle a la
     * declaration manuelle : l'historique d'un ancien colis daterait la
     * reception d'AVANT l'envoi, et le delai de retractation s'eteindrait
     * avant meme la livraison reelle, sans retour possible, `livreA` ne se
     * reecrivant pas. L'expedition compte en echec, rien n'est ecrit.
     */
    if (expedition.expedieA !== null && remise.a < expedition.expedieA) {
      throw new Error("remise anterieure a l'expedition");
    }

    return remise.a;
  }

  return estLivre(statut) ? new Date() : null;
}

/**
 * Signale une livraison qui n'aboutira pas.
 *
 * L'IDEMPOTENCE EST ANCREE SUR L'EFFET ET NON SUR L'EVENEMENT, invariant 5 : la
 * tache reverra le meme statut a chaque cycle, et sans cette garde un colis
 * refuse produirait vingt-quatre alertes par jour.
 *
 * ELLE EST PORTEE PAR L'INDEX `alerte_ouverte_unique`, pose par cette story :
 * une garde applicative laisserait une fenetre entre la lecture et l'ecriture,
 * la ou un index tranche en base. Le conflit se rattrape ici plutot que de
 * remonter, un doublon refuse n'etant pas un incident.
 */
async function signalerEchec(
  expeditionId: string,
  libelle: string,
): Promise<void> {
  try {
    await leverAlerteCritique(prisma, {
      type: TYPE_ALERTE_LIVRAISON,
      message:
        `Livraison en échec, statut « ${libelle} ». Le client n'a pas reçu ` +
        `le colis : arbitrer entre remboursement, réexpédition et remise en ` +
        `vente selon l'état réel de la pièce.`,
      gravite: "AVERTISSEMENT",
      typeCible: "Expedition",
      idCible: expeditionId,
    });
  } catch (erreur) {
    /*
     * UNE ALERTE DEJA OUVERTE SUR CETTE CIBLE : rien a signaler de plus. Ce
     * `catch` attrape une erreur que l'index leve reellement, contrairement a
     * celui qu'`envoi-email.ts` portait avant cette story.
     */
    journaliser("info", "alerte de livraison deja ouverte", { expeditionId });
    void erreur;
  }
}
