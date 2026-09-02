/**
 * Message de contact, LS-97.
 *
 * LA REGLE PRINCIPALE, ANNONCEE PAR `MODELE-CONCEPTUEL.md` DEPUIS LE 28 JUILLET
 * 2026 : le message est persiste AVANT toute tentative d'envoi d'email. L'ordre
 * est impose, pas preferable. Une panne du fournisseur ne doit jamais faire
 * perdre une demande client.
 *
 * L'ARBITRAGE DE LA TRANSACTION EST L'INVERSE DE CELUI D'ADR-033, et c'est
 * deliberé. Ailleurs sur ce projet, l'intention d'envoi et l'effet metier
 * partagent la transaction : les deux existent ou aucun des deux, parce qu'une
 * confirmation de commande envoyee sans commande serait fausse.
 *
 * ICI LE MESSAGE SURVIT SEUL SI LA NOTIFICATION ECHOUE. Une demande client
 * perdue ne se rattrape par AUCUN rejeu : personne ne sait qu'elle a existe.
 * Une notification manquee, elle, se voit dans l'administration, ou le message
 * attend avec son statut `NOUVEAU`. Le risque n'est pas symetrique, donc
 * l'arbitrage ne l'est pas non plus.
 *
 * TROIS COUCHES CONTRE LES ENVOIS AUTOMATISES, sans aucun service tiers, le
 * projet en ecartant l'usage. Aucune n'est suffisante seule, et c'est pourquoi
 * il y en a trois : champ piege, delai minimum, plafond par adresse IP.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutMessage } from "@/generated/prisma/enums";
import { journaliser, journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  EntreeInvalideError,
  schemaIdentifiant,
  schemaSaisieMessage,
  valider,
} from "@/lib/validation";
import { incrementerCompteur } from "@/repositories/limitation";
import {
  changerStatutEnBase,
  creerMessage,
  listerMessagesEnBase,
  lireMessageEnBase,
  type MessageDetaille,
  type MessageEnListe,
} from "@/repositories/message-contact";
import { deposerEnvoi } from "@/services/envoi-email";

export type { MessageDetaille, MessageEnListe };

/** Ce qu'un depot de message rend. L'ecran choisit les mots. */
export type IssueDepot =
  /**
   * Le message est enregistre.
   *
   * IL EST AUSSI RENDU AU ROBOT DETECTE, et ce n'est pas une erreur : dire
   * « refuse » a un robot lui apprend l'existence du piege, et la version
   * suivante de son script le contournera. Rien n'est ecrit, il croit avoir
   * reussi.
   */
  | { statut: "ENREGISTRE" }
  /** Saisie refusee, le message dit lequel des champs. */
  | { statut: "INVALIDE"; message: string }
  /**
   * Plafond atteint pour cette adresse.
   *
   * CELUI-CI EST DIT, contrairement au piege : un plafond concerne une personne
   * reelle dans l'immense majorite des cas, et lui laisser croire que son
   * message est parti serait le vrai defaut.
   */
  | { statut: "TROP_DE_MESSAGES" }
  /** Panne technique, deja journalisee. */
  | { statut: "INDISPONIBLE" };

/** Ce qu'un changement de statut rend. */
export type IssueStatut = { statut: "SUCCES" } | { statut: "INTROUVABLE" };

/** Nombre de messages affiches dans l'administration. */
const LIMITE_LISTE = 100;

/**
 * Delai minimum entre l'affichage du formulaire et sa soumission.
 *
 * TROIS SECONDES, ET LE SEUIL EST BAS EXPRES. Il ne s'agit pas de mesurer un
 * temps de redaction credible, ce qui punirait un texte prepare ailleurs puis
 * colle, mais d'ecarter la soumission INSTANTANEE, signature d'un script qui
 * poste sans jamais afficher la page.
 */
const DELAI_MINIMUM_MS = 3000;

/**
 * Plafond par adresse IP, et sa fenetre.
 *
 * CINQ PAR HEURE, plus genereux que les cinq par MINUTE de la
 * reauthentification, et pour une raison opposee. La-bas le plafond protege un
 * secret contre une attaque en rafale ; ici il borne un volume d'ecriture, et
 * une personne qui ecrit deux fois de suite parce qu'elle a oublie un detail
 * doit passer sans obstacle.
 *
 * UNE HEURE PLUTOT QU'UNE JOURNEE : une adresse partagee, un lieu public ou une
 * connexion mobile, ne doit pas rester bloquee jusqu'au lendemain a cause d'un
 * seul envoi automatise.
 */
const PLAFOND_PAR_IP = 5;
const FENETRE_PLAFOND_SECONDES = 3600;

/** Ce que le formulaire public transmet, avant toute validation. */
export type SaisiePublique = {
  nom: string;
  email: string;
  sujet: string;
  corps: string;
  /** Champ piege, invisible a l'ecran. Une personne ne le remplit jamais. */
  piege: string;
  /** Instant d'affichage du formulaire, en millisecondes. */
  ouvertA: number;
};

/**
 * Enregistre un message de contact.
 *
 * L'ORDRE DES INSTRUCTIONS EST LE MECANISME, et aucune ne se deplace :
 *
 * 1. les trois couches anti-robot, AVANT toute ecriture, sans quoi un envoi
 *    automatise remplirait la table avant d'etre ecarte
 * 2. la validation, sur une entree publique donc non fiable, invariant 7
 * 3. l'ecriture du message, qui COMMITE
 * 4. le depot de la notification, qui peut echouer sans emporter le message
 *
 * LES ETAPES 3 ET 4 SONT DEUX TRANSACTIONS, et c'est tout l'objet de cette
 * story. Les fondre en une seule ferait perdre le message quand l'outbox est
 * indisponible, ce que `MODELE-CONCEPTUEL.md` interdit nommement.
 *
 * `adresseIp` PEUT ETRE NULLE, et le plafond ne s'applique pas alors. Compter
 * sur une valeur nulle donnerait un compteur UNIQUE partage par tous, donc un
 * deni de service offert au premier venu : c'est le defaut que
 * `limitation-action.ts` documente pour expliquer son ancrage sur la session.
 */
export async function deposerMessage({
  saisie,
  adresseIp,
  client = prisma,
}: {
  saisie: SaisiePublique;
  adresseIp: string | null;
  client?: typeof prisma;
}): Promise<IssueDepot> {
  /*
   * PREMIERE COUCHE, LE CHAMP PIEGE. Il est masque a l'ecran par CSS et porte
   * `tabindex="-1"` plus `autocomplete="off"` : ni la souris, ni le clavier, ni
   * le remplissage automatique du navigateur ne l'atteignent.
   */
  if (saisie.piege.trim() !== "") {
    journaliser("info", "message de contact ecarte, champ piege rempli", {});

    return { statut: "ENREGISTRE" };
  }

  /*
   * DEUXIEME COUCHE, LE DELAI. `ouvertA` vient du formulaire, donc il n'est pas
   * fiable : un robot peut l'anti-dater. Ce n'est pas un defaut de conception,
   * c'est la limite acceptee de la couche, et c'est pourquoi elle n'est pas
   * seule. Elle ecarte le script naif, qui poste sans lire la page.
   */
  const ecoule = Date.now() - saisie.ouvertA;

  if (!Number.isFinite(saisie.ouvertA) || ecoule < DELAI_MINIMUM_MS) {
    journaliser("info", "message de contact ecarte, soumission immediate", {});

    return { statut: "ENREGISTRE" };
  }

  let valide;

  try {
    valide = valider(schemaSaisieMessage, {
      nom: saisie.nom,
      email: saisie.email,
      sujet: saisie.sujet,
      corps: saisie.corps,
    });
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  /*
   * TROISIEME COUCHE, LE PLAFOND. Il vient APRES la validation : compter une
   * saisie refusee ferait fermer la porte a quelqu'un qui corrige une faute de
   * frappe dans son adresse email.
   */
  if (adresseIp !== null) {
    try {
      const compteur = await incrementerCompteur(
        client,
        `contact|${adresseIp}`,
        FENETRE_PLAFOND_SECONDES,
      );

      if (compteur.compte > PLAFOND_PAR_IP) {
        return { statut: "TROP_DE_MESSAGES" };
      }
    } catch (erreur) {
      /*
       * DEFAUT OUVERT, MEME CHOIX QU'EN LS-89 ET POUR LA MEME RAISON. Une base
       * qui tousse ne doit pas fermer le seul moyen d'ecrire a la boutique. Le
       * risque accepte est borne par les deux couches precedentes, qui ne
       * dependent pas de la base.
       */
      journaliserErreur("plafond de contact indisponible", erreur, {});
    }
  }

  let messageId: string;

  try {
    /*
     * L'ECRITURE DU MESSAGE, SEULE DANS SA TRANSACTION. Elle commite avant que
     * la notification ne soit tentee : c'est la regle principale de cette
     * story, et l'inverser la casserait entierement.
     */
    messageId = await creerMessage(client, valide);
  } catch (erreur) {
    journaliserErreur("message de contact non enregistre", erreur, {});

    return { statut: "INDISPONIBLE" };
  }

  /*
   * LA NOTIFICATION VIENT APRES, ET SON ECHEC N'EMPORTE RIEN. Le message existe
   * deja : au pire l'exploitante ne recoit pas d'alerte, et le decouvre en
   * ouvrant l'administration, ou il attend en `NOUVEAU`.
   *
   * ELLE PASSE PAR L'OUTBOX ET JAMAIS PAR UN ENVOI DIRECT, `securite.md` :
   * l'envoi direct est reserve a ce qu'une personne attend a l'ecran, et un
   * appel SMTP ici tiendrait la requete du visiteur pendant tout
   * l'aller-retour.
   */
  try {
    await client.$transaction(async (transaction: Prisma.TransactionClient) => {
      await deposerEnvoi(transaction, {
        /*
         * AUCUNE COMMANDE, et ce nul a un effet : PostgreSQL traite les `NULL`
         * comme distincts dans un index unique, donc deux notifications de
         * contact ne se refusent jamais l'une l'autre.
         */
        commandeId: null,
        destinataire: destinataireNotification(),
        modele: "message-contact-recu",
        /*
         * LE CORPS N'Y ENTRE PAS, precaution 3 d'ADR-008. Les variables
         * traversent `EnvoiEnAttente`, table que T9 declare file de travail :
         * y recopier le corps le stockerait une seconde fois, avec une duree de
         * retention differente de celle du message lui-meme.
         */
        variables: { nom: valide.nom, sujet: valide.sujet },
        origine: "SYSTEME",
      });
    });
  } catch (erreur) {
    journaliserErreur(
      "notification de message de contact non deposee",
      erreur,
      {
        message: messageId,
      },
    );
  }

  return { statut: "ENREGISTRE" };
}

/**
 * A qui part la notification.
 *
 * L'ADRESSE DE L'EXPLOITANTE, lue dans l'environnement comme l'identite de
 * l'emetteur de facture. Elle n'est PAS le destinataire du message, qui est la
 * boutique : c'est l'alerte « quelqu'un vous a ecrit ».
 *
 * LE REPLI EST L'ADRESSE DE CONTACT, presente dans toute installation servant
 * des emails : sans elle, aucun email ne partirait de toute facon.
 */
function destinataireNotification(): string {
  return (
    process.env.FACTURE_EMAIL_CONTACT ?? process.env.EMAIL_EXPEDITEUR ?? ""
  );
}

/** Les messages pour l'administration, les plus recents d'abord. */
export async function listerMessages(
  client: typeof prisma = prisma,
): Promise<MessageEnListe[]> {
  return listerMessagesEnBase(client, LIMITE_LISTE);
}

/** Le detail d'un message, corps compris. */
export async function lireMessage(
  messageId: string,
  client: typeof prisma = prisma,
): Promise<MessageDetaille | null> {
  const identifiant = valider(schemaIdentifiant, messageId);

  return lireMessageEnBase(client, identifiant);
}

/**
 * Fait avancer le statut d'un message, sur geste de l'exploitante.
 *
 * LA LECTURE ET L'ECRITURE PARTAGENT LA TRANSACTION, parce que `luA` depend de
 * l'etat courant : le poser une seconde fois effacerait la date de PREMIERE
 * lecture, seule information qui dise combien de temps la demande a attendu.
 */
export async function changerStatutMessage({
  messageId,
  statut,
  client = prisma,
}: {
  messageId: string;
  statut: StatutMessage;
  client?: typeof prisma;
}): Promise<IssueStatut> {
  const identifiant = valider(schemaIdentifiant, messageId);

  return client.$transaction(async (transaction: Prisma.TransactionClient) => {
    const message = await transaction.message.findUnique({
      where: { id: identifiant },
      select: { luA: true },
    });

    if (message === null) {
      return { statut: "INTROUVABLE" as const };
    }

    await changerStatutEnBase(transaction, {
      messageId: identifiant,
      statut,
      luADejaPose: message.luA,
      maintenant: new Date(),
    });

    return { statut: "SUCCES" as const };
  });
}
