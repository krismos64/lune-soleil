/**
 * A qui partent les notifications de l'administration, LS-29.
 *
 * POURQUOI CE MODULE EXISTE. Le motif vivait dans `message-contact.ts`, seul
 * chemin qui notifiait l'exploitante jusqu'au 12 septembre 2026. Trois autres
 * s'y ajoutent, commande payee, retractation et incident : recopier la lecture
 * et l'interrupteur dans chacun ferait quatre definitions du meme comportement,
 * et le jour ou le repli change, trois d'entre elles resteraient en arriere.
 *
 * L'INTERRUPTEUR EST RESPECTE, ET C'EST CE QUI LE REND REEL. Sans cette lecture,
 * les cinq booleens d'ADR-043 decision 4 seraient des boutons qui ne commandent
 * rien : l'exploitante les decocherait et continuerait de recevoir les alertes.
 * LS-219 porte le constat que quatre d'entre eux etaient exactement dans ce cas.
 *
 * `null` PLUTOT QU'UNE CHAINE VIDE, et la distinction a un effet : l'appelant
 * SAUTE l'envoi au lieu de deposer une ligne d'outbox invalide qui echouerait
 * plus tard, hors du contexte qui l'a produite.
 */
import {
  ParametresAbsentsError,
  lireParametresBoutique,
} from "@/services/parametres";
import { leverAlerteCritique } from "@/repositories/confirmation";
import { deposerEnvoi } from "@/services/envoi-email";
import { journaliserErreur } from "@/lib/journal";
import { formaterDate } from "@/lib/affichage-commande";
import type { ClientBase } from "@/repositories/stock";

/**
 * Les alertes que l'exploitante peut couper, ADR-043 decision 4.
 *
 * LE TYPE ENUMERE LES CINQ, plutot qu'accepter une chaine libre : une alerte
 * ajoutee au parametre sans entree ici ne compile pas, meme controle
 * d'exhaustivite que le `Record` des modeles d'email.
 */
export type AlerteAdministration =
  | "alerteCommandePayee"
  | "alertePaiementAnnule"
  | "alerteStockFaible"
  | "alerteMessageRecu"
  | "alerteAvisAModerer";

/**
 * L'adresse a prevenir pour cette alerte, ou `null` s'il ne faut rien envoyer.
 *
 * DEUX RAISONS DE RENDRE `null`, et l'appelant n'a pas a les distinguer :
 * l'exploitante a decoche l'alerte, ou aucune adresse n'est configuree. Dans les
 * deux cas il n'y a personne a prevenir.
 *
 * LE REPLI SUR `FACTURE_EMAIL_CONTACT` COUVRE UNE BASE RESTAUREE avant la
 * migration d'ADR-043 : perdre l'alerte en plus serait punir deux fois la meme
 * anomalie. Il ne s'applique QU'A l'absence de ligne de parametres, jamais a un
 * interrupteur decoche, qui est une decision.
 */
export async function destinataireAlerte(
  alerte: AlerteAdministration,
): Promise<string | null> {
  try {
    const parametres = await lireParametresBoutique();

    return parametres[alerte] ? parametres.emailAlertes : null;
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }

    return process.env.FACTURE_EMAIL_CONTACT ?? null;
  }
}

/**
 * Le seuil de stock faible configure, ou `null` si rien n'est lisible, LS-219.
 *
 * LE SEUIL VIT EN BASE DEPUIS LS-98, `ParametreBoutique.seuilStockFaible`, et
 * l'exploitante le regle depuis l'ecran des parametres. L'ecrire en dur ici
 * rendrait ce champ decoratif, c'est-a-dire exactement le defaut que LS-219
 * existe pour fermer : un reglage qui ne commande rien.
 *
 * LE REPLI EST `null` ET NON UNE VALEUR, ce qui fait SAUTER l'alerte. Choisir
 * un seuil par defaut ferait partir des emails sur une configuration que
 * personne n'a validee, et l'exploitante ne pourrait pas les rattacher a un
 * reglage qu'elle n'a jamais vu.
 */
export async function seuilStockFaible(): Promise<number | null> {
  try {
    return (await lireParametresBoutique()).seuilStockFaible;
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }

    return null;
  }
}

/**
 * L'adresse d'alerte, SANS interrupteur.
 *
 * POUR LES NOTIFICATIONS QU'AUCUN DES CINQ BOOLEENS NE COUVRE, la retractation
 * en etant le cas : elle ouvre deux delais legaux de quatorze jours dont l'un
 * engage financierement l'exploitante.
 *
 * NE PAS L'EMPLOYER POUR CONTOURNER UN INTERRUPTEUR EXISTANT. Si une alerte a
 * son booleen, c'est `destinataireAlerte` qui s'applique : passer par ici
 * rendrait la case a cocher decorative, exactement le defaut que LS-219 porte.
 * Une notification qui MERITE d'etre coupable demande un sixieme interrupteur,
 * donc un ADR.
 */
export async function lireEmailAlertes(): Promise<string | null> {
  try {
    return (await lireParametresBoutique()).emailAlertes;
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }

    return process.env.FACTURE_EMAIL_CONTACT ?? null;
  }
}

/**
 * Leve une alerte critique ET previent l'exploitante par email, LS-29.
 *
 * POURQUOI CETTE FONCTION PLUTOT QUE L'EMAIL DANS CHAQUE APPELANT. Six services
 * levent des alertes, dix-neuf appels au total : y recopier le depot d'envoi
 * ferait dix-neuf occasions d'oublier l'interrupteur ou le repli, et le jour ou
 * le modele change, dix-huit resteraient en arriere.
 *
 * ELLE N'EST PAS L'UNIQUE VOIE, ET C'EST DELIBERE. `leverAlerteCritique` reste
 * appelable seule : une alerte `AVERTISSEMENT`, une livraison en echec qui
 * demande un arbitrage commercial, n'a pas a reveiller quelqu'un par email. Le
 * choix appartient a l'appelant, qui sait ce qu'il signale.
 *
 * L'EMAIL NE FAIT JAMAIS ECHOUER L'ALERTE. Le depot est tente apres l'ecriture,
 * et son echec est journalise sans etre propage : une alerte ecrite sans email
 * se voit dans l'administration, un email envoye sans alerte ne laisse aucune
 * trace a acquitter. Des deux, c'est l'ecriture qui compte.
 *
 * AUCUN MONTANT NI IDENTIFIANT DE PAIEMENT DANS L'EMAIL, invariant 9 : le
 * message porte le type, la date et le libelle de l'alerte, jamais la reference
 * du paiement en cause. Elle se lit dans l'administration, derriere une session.
 */
export async function leverAlerteEtNotifier(
  client: ClientBase,
  parametres: {
    type: string;
    message: string;
    typeCible: string;
    idCible: string;
    gravite?: "AVERTISSEMENT" | "CRITIQUE";
    /**
     * Ce que l'EMAIL dit, quand le message de l'alerte ne peut pas sortir.
     *
     * LE MESSAGE D'ALERTE PORTE SOUVENT CE QU'UN EMAIL NE DOIT PAS TRANSPORTER.
     * Celui du double encaissement cite l'identifiant de session Stripe et le
     * montant : utile dans une table derriere une session, hors de question
     * dans une boite email, invariant 9. L'appelant fournit donc une phrase
     * sobre, et sans elle aucun email ne part.
     */
    descriptionEmail?: string;
  },
): Promise<void> {
  await leverAlerteCritique(client, parametres);

  if (parametres.descriptionEmail === undefined) {
    return;
  }

  let destinataire: string | null = null;

  try {
    destinataire = await lireEmailAlertes();
  } catch (erreur) {
    journaliserErreur("destinataire d'alerte critique illisible", erreur, {
      type: parametres.type,
    });

    return;
  }

  if (destinataire === null || destinataire === "") {
    return;
  }

  try {
    await deposerEnvoi(client, {
      /*
       * `commandeId: null` MEME QUAND L'ALERTE VISE UNE COMMANDE. La cle
       * `(commandeId, modele)` dedupliquerait alors deux incidents distincts
       * sur la meme commande, un double encaissement puis une facture non
       * emise : le second email ne partirait jamais.
       */
      commandeId: null,
      destinataire,
      modele: "admin-incident-critique",
      variables: {
        type: parametres.type,
        date: formaterDate(new Date()),
        description: parametres.descriptionEmail,
      },
      origine: "SYSTEME",
    });
  } catch (erreur) {
    journaliserErreur("email d'alerte critique non depose", erreur, {
      type: parametres.type,
    });
  }
}
