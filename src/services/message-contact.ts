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
  compterMessagesEnBase,
  listerMessagesEnBase,
  lireMessageEnBase,
  type MessageDetaille,
  type MessageEnListe,
} from "@/repositories/message-contact";
import { deposerEnvoi } from "@/services/envoi-email";
import { formaterDate } from "@/lib/affichage-commande";
import {
  ParametresAbsentsError,
  lireParametresBoutique,
} from "@/services/parametres";

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

/**
 * Nombre de messages affiches dans l'administration.
 *
 * IL EST EXPORTE DEPUIS LS-163, l'ecran devant nommer le plafond qu'il annonce :
 * ecrire « 100 » dans le texte en ferait une seconde source de verite, fausse
 * des que cette constante bouge.
 */
export const LIMITE_LISTE = 100;

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
  /*
   * LE DESTINATAIRE EST RESOLU AVANT LA TRANSACTION, jamais dedans : la lecture
   * des parametres est un aller-retour de plus, et le tenir a l'interieur
   * allongerait la transaction sans aucun gain.
   */
  const destinataire = await destinataireNotification();

  /*
   * AUCUN DESTINATAIRE, AUCUN ENVOI, et ce n'est pas un echec. L'exploitante a
   * decoche l'alerte, ou la configuration est incomplete : le message reste en
   * `NOUVEAU` dans l'administration, ou elle le trouvera.
   */
  if (destinataire === null || destinataire === "") {
    return { statut: "ENREGISTRE" };
  }

  try {
    await client.$transaction(async (transaction: Prisma.TransactionClient) => {
      await deposerEnvoi(transaction, {
        /*
         * AUCUNE COMMANDE, et ce nul a un effet : PostgreSQL traite les `NULL`
         * comme distincts dans un index unique, donc deux notifications de
         * contact ne se refusent jamais l'une l'autre.
         */
        commandeId: null,
        destinataire,
        modele: "message-contact-recu",
        /*
         * LE CORPS N'Y ENTRE PAS, precaution 3 d'ADR-008. Les variables
         * traversent `EnvoiEnAttente`, table que T9 declare file de travail :
         * y recopier le corps le stockerait une seconde fois, avec une duree de
         * retention differente de celle du message lui-meme.
         *
         * L'ADRESSE, ELLE, Y ENTRE DEPUIS LE 12 SEPTEMBRE 2026, arbitrage de
         * Christophe. Sans elle, l'exploitante devait ouvrir l'administration
         * pour connaitre l'adresse et pouvoir repondre : sur un telephone entre
         * deux marches, un aller-retour de trop pour une action qui tient dans
         * le bouton « Repondre » de sa boite.
         *
         * LE RAISONNEMENT D'ADR-008 NE S'Y APPLIQUE PAS DE LA MEME FACON : elle
         * est courte, deja presente dans `Message`, et son absence prive la
         * notification de son utilite. La double conservation reste a surveiller,
         * `REGISTRE-DES-TRAITEMENTS.md` porte cette categorie de donnee.
         */
        variables: {
          nom: valide.nom,
          email: valide.email,
          sujet: valide.sujet,
          date: formaterDate(new Date()),
        },
        origine: "SYSTEME",
      });

      /*
       * L'ACCUSE AU VISITEUR, F-MAIL-06, LS-29.
       *
       * DANS LA MEME TRANSACTION QUE LA NOTIFICATION, donc les deux existent ou
       * aucune : un accuse envoye sans que l'exploitante soit prevenue ferait
       * attendre une reponse que personne ne sait devoir ecrire.
       *
       * AUCUN DELAI DE REPONSE N'Y FIGURE, le cahier des charges l'interdit
       * explicitement. Une boutique tenue seule ne peut pas en garantir un.
       */
      await deposerEnvoi(transaction, {
        commandeId: null,
        destinataire: valide.email,
        modele: "message-contact-accuse",
        variables: { sujet: valide.sujet },
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
 * L'ADRESSE DE L'EXPLOITANTE, LUE EN BASE DEPUIS ADR-043, LS-98. Elle n'est PAS
 * le destinataire du message, qui est la boutique : c'est l'alerte « quelqu'un
 * vous a ecrit ».
 *
 * ------------------------------------------------------------------
 * ELLE LISAIT `EMAIL_EXPEDITEUR`, VARIABLE QUI N'EXISTAIT PAS, et `.env.example`
 * declarait `EMAIL_ADMIN_RECIPIENT`, que personne ne lisait. Trois noms pour une
 * seule adresse, dont deux fantomes : le repli reel portait donc sur `undefined`
 * puis sur la chaine vide, et une installation sans `FACTURE_EMAIL_CONTACT`
 * deposait un envoi SANS DESTINATAIRE, que rien ne signalait.
 *
 * `null` PLUTOT QU'UNE CHAINE VIDE, et la distinction a un effet : l'appelant
 * SAUTE l'envoi au lieu de deposer une ligne d'outbox invalide qui echouerait
 * plus tard, hors du contexte qui l'a produite.
 * ------------------------------------------------------------------
 */
async function destinataireNotification(): Promise<string | null> {
  try {
    const parametres = await lireParametresBoutique();

    /*
     * L'INTERRUPTEUR EST RESPECTE, et c'est ce qui le rend reel. Sans cette
     * ligne, `alerteMessageRecu` serait un bouton qui ne commande rien :
     * l'exploitante le decocherait et continuerait de recevoir les alertes.
     */
    return parametres.alerteMessageRecu ? parametres.emailAlertes : null;
  } catch (erreur) {
    if (!(erreur instanceof ParametresAbsentsError)) {
      throw erreur;
    }

    /*
     * REPLI SUR L'ADRESSE DE CONTACT, presente dans toute installation servant
     * des emails. Une ligne de parametres absente signale une base restauree
     * avant la migration d'ADR-043 : perdre l'alerte en plus serait punir deux
     * fois la meme anomalie.
     */
    return process.env.FACTURE_EMAIL_CONTACT ?? null;
  }
}

/** Ce que la liste d'administration rend, LS-163. */
export type ListeMessages = {
  messages: MessageEnListe[];
  /** Vrai si des messages existent au-dela de la limite affichee. */
  tronquee: boolean;
  /** Le nombre total, compte en base et NON sur la tranche affichee. */
  total: number;
  /** Les non-lus, comptes de meme sur l'ensemble. */
  nouveaux: number;
};

/**
 * Les messages pour l'administration, les plus recents d'abord.
 *
 * ------------------------------------------------------------------
 * LES COMPTES NE VIENNENT PAS DE LA TRANCHE, LS-163, critere 1.
 *
 * `listerMessagesEnBase` rend au plus cent lignes. Compter dessus faisait dire
 * « 100 messages » de facon permanente une fois le seuil franchi, et un message
 * `NOUVEAU` plus ancien que les cent derniers devenait invisible ET non compte.
 * Les deux nombres viennent donc d'un `groupBy` sur toute la table.
 *
 * LA LECTURE PORTE SUR `limite + 1`, motif de `traitement-retractation.ts` : une
 * ligne de plus que ce qui sera rendu suffit a savoir qu'il y en a d'autres,
 * sans compter quoi que ce soit. Le compte, lui, sert a dire COMBIEN.
 *
 * LE FILTRE PAR STATUT PORTE LE CRITERE 2, l'atteignabilite. Sans pagination,
 * c'est lui qui rend joignable un message ancien : filtrer sur `NOUVEAU` retire
 * de la liste les messages deja traites, donc fait remonter ceux que le plafond
 * cachait. La pagination a ete ecartee, arbitrage du 8 septembre 2026 : elle
 * coute une barre de navigation a 320 px pour un seuil qui ne sera pas atteint
 * avant des mois, quand le filtre sert aussi l'usage quotidien.
 * ------------------------------------------------------------------
 */
export async function listerMessages(
  client: typeof prisma = prisma,
  statut?: StatutMessage,
): Promise<ListeMessages> {
  const [lus, comptes] = await Promise.all([
    listerMessagesEnBase(client, LIMITE_LISTE + 1, statut),
    compterMessagesEnBase(client),
  ]);

  return {
    messages: lus.slice(0, LIMITE_LISTE),
    tronquee: lus.length > LIMITE_LISTE,
    total: comptes.total,
    nouveaux: comptes.nouveaux,
  };
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
