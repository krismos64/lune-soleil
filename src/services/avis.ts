/**
 * Avis verifies : invitation apres livraison, depot, moderation. LS-61.
 *
 * ZONE CRITIQUE : autorisation par jeton, transaction, obligation legale
 * d'affichage. Trois proprietes s'y tiennent ensemble et aucune ne se relache.
 *
 * L'AVIS EST ANCRE SUR LA LIGNE DE COMMANDE, jamais sur le produit ni sur le
 * compte, decision G et regle R1. C'est ce qui le rend VERIFIE au sens de
 * l'article D111-10 : il existe parce qu'une ligne reellement livree existe, et
 * aucun chemin de ce module ne permet d'en creer un autrement, regle R12.
 *
 * LE DEPOT EST TRANSACTIONNEL, point 7 des transactions critiques. Creation de
 * l'avis et consommation du jeton dans la meme transaction : sans cela, un
 * jeton rejoue cree un second avis sur la meme ligne, et l'unicite
 * `ligneCommandeId` transformerait le rejeu en erreur 500 apres avoir brule le
 * jeton.
 *
 * AUCUNE INVITATION SANS LIVRAISON REELLE, regle R17. `Expedition.livreA` non
 * nul est exige, et LE REPLI DU DELAI DE RETRACTATION N'A PAS COURS ICI : les
 * articles D111-9 a D111-12 imposent d'afficher une date d'experience EXACTE,
 * une date estimee serait fausse. C'est la difference de fond avec
 * `retractation.ts`, ou le repli protege un droit qui court de toute facon.
 *
 * UN AVIS EST PUBLIE APRES RELECTURE, JAMAIS IMMEDIATEMENT, arbitrage de
 * l'exploitante du 3 septembre 2026, regle R4. Le statut par defaut est
 * `DEPOSE`, et aucune fonction de ce module ne publie sans decision explicite.
 *
 * CE QUE CE MODULE NE FAIT PAS : la reponse publique de l'exploitante a un
 * avis. `ReponseAvis` existe au schema, mais l'usage n'est pas decide et le
 * commentaire Jira du 3 septembre demande explicitement de ne pas construire
 * l'ecran correspondant sans arbitrage. La lecture publique rend la reponse si
 * elle existe, aucun chemin n'en cree.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutAvis, StatutSignalement } from "@/generated/prisma/client";

import {
  empreinteJeton,
  engendrerJeton,
  expirationAvis,
  lienAvis,
  signatureJetonValide,
} from "@/lib/jeton-acces";
import { journaliser, journaliserErreur } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  appliquerDecision,
  cloturerSignalement,
  ecrireAvis,
  ecrireSignalement,
  ecrireInvitation,
  lireCommandeARelancer,
  lireCommandePourAvis,
  lireInvitationsARenvoyer,
  lireInvitationsDeCommande,
  listerAvisParStatut,
  listerAvisPublies,
  listerCommandesAInviter,
  listerSignalements,
  lireAvisASignaler,
  lireAvisPubliePourSignalement,
  marquerEnvoiAbouti,
  rattacherJetonNeuf,
} from "@/repositories/avis";
import type {
  AvisAModerer,
  AvisPublie,
  InvitationLue,
  SignalementLu,
} from "@/repositories/avis";
import { incrementerCompteur } from "@/repositories/limitation";
import {
  EntreeInvalideError,
  schemaSignalementAvis,
  valider,
} from "@/lib/validation";
import { deposerEnvoi } from "@/services/envoi-email";
import { intentionActiveExiste } from "@/repositories/envoi-email";
import {
  consommerJeton,
  ecrireJeton,
  lireJetonParEmpreinte,
  revoquerJeton,
} from "@/repositories/jeton-acces";

/**
 * Nombre de commandes invitees par cycle.
 *
 * BORNE ET NON ILLIMITE, meme motif que `suivi-livraison` : chaque commande
 * produit une transaction et une intention d'envoi, et la tache tient son
 * verrou pendant ce temps.
 */
const LIMITE_PAR_CYCLE = 50;

/**
 * Note minimale et maximale, contrainte CHECK en base.
 *
 * ELLES SONT EXPORTEES POUR QUE LE SCHEMA ZOD ET LE TEST CITENT LA MEME SOURCE.
 * Deux bornes recopiees a trois endroits divergent au premier changement, et la
 * base rejetterait alors une saisie que l'ecran a acceptee.
 */
export const NOTE_MIN = 1;
export const NOTE_MAX = 5;

/**
 * Longueur maximale d'un commentaire.
 *
 * MEME VALEUR QUE LE MOTIF DE RETRACTATION, LS-134, et pour la meme raison : au
 * dela, le champ cesse d'etre un avis et devient un canal de contact, que le
 * formulaire de contact porte deja.
 */
export const COMMENTAIRE_LONGUEUR_MAX = 2000;

/**
 * Delai maximum de publication d'un avis, en jours ouvres au sens commun.
 *
 * ARBITRAGE, ET IL DOIT ETRE PUBLIE. L'article D111-10 2° impose d'annoncer le
 * delai maximum de publication dans une rubrique facilement accessible. Le
 * delai de CONSERVATION est tranche par ADR-028, sans limite ; celui de
 * PUBLICATION ne l'etait pas, et une rubrique muette est precisement le
 * manquement que l'article vise.
 *
 * SEPT JOURS PLUTOT QUE DEUX : l'exploitante releve ses avis entre deux
 * marches, et annoncer un delai qu'un week-end charge ferait depasser vaudrait
 * mieux ne rien annoncer. Un delai tenu compte davantage qu'un delai flatteur.
 */
export const DELAI_PUBLICATION_JOURS = 7;

/** Ce qu'un cycle d'invitation rend a l'appelant. */
export type IssueInvitations = {
  /** Commandes examinees, echecs compris. */
  traitees: number;
  /** Commandes pour lesquelles une invitation est partie. */
  invitees: number;
  /** Commandes dont l'invitation a echoue, cycle poursuivi. */
  echecs: number;
};

/**
 * Cree les invitations des commandes livrees et depose leur email.
 *
 * ELLE NE BLOQUE JAMAIS SUR UNE PANNE, meme motif que `suivi-livraison` : une
 * exception qui remonterait arreterait le cycle sur la premiere commande en
 * defaut, et les suivantes ne seraient jamais invitees.
 *
 * L'IDEMPOTENCE EST ANCREE SUR L'EFFET, invariant 5. Elle ne vient PAS d'un
 * identifiant d'evenement mais de `InvitationAvis.ligneCommandeId`, unique : la
 * tache reverra la meme commande livree a chaque cycle, et c'est cette unicite
 * qui fait qu'une seule invitation existe. Le filtre `invitation: null` evite
 * le conflit dans le cas courant, l'unicite tranche dans la course.
 */
export async function inviterApresLivraison(): Promise<IssueInvitations> {
  const commandes = await listerCommandesAInviter(prisma, LIMITE_PAR_CYCLE);

  let invitees = 0;
  let echecs = 0;

  for (const commande of commandes) {
    try {
      /*
       * LES JETONS SONT ENGENDRES HORS TRANSACTION, comme partout ailleurs sur
       * ce depot : c'est un calcul en memoire, et l'inclure allongerait la
       * transaction sans rien garantir de plus. Leur VALEUR ne doit jamais etre
       * journalisee, invariant 9.
       *
       * UN JETON PAR LIGNE, ET C'EST LA REGLE R20 QUI L'IMPOSE :
       * `InvitationAvis.jetonAccesId` est UNIQUE, « sinon la resolution du
       * jeton vers sa ligne de commande serait ambigue ». Un jeton partage
       * entre trois invitations est refuse par la base, mesure le 10 septembre
       * 2026 en ecrivant l'inverse.
       *
       * LE LIEN DE L'EMAIL NE PORTE QUE LE PREMIER, et cela suffit :
       * `JetonAcces.commandeId` designe la COMMANDE, donc n'importe lequel des
       * trois ouvre l'ecran sur les trois pieces. Les deux autres existent pour
       * que chaque ligne garde un jeton propre, revocable et consommable
       * separement.
       *
       * CE QUE CELA NE DONNE PAS, ET IL FAUT LE DIRE : le lien de l'email
       * porte UNE valeur, celle de la premiere ligne. La consommer ferme
       * l'acces par ce lien, meme si les jetons des autres lignes restent
       * valides en base : leur valeur n'a ete transmise nulle part. Un client
       * qui note une piece sur trois ne revient donc pas par ce lien, et
       * l'ecran presente les trois pieces ensemble pour que le cas reste rare.
       */
      const jetons = commande.lignes.map(() => engendrerJeton());

      await prisma.$transaction(async (transaction) => {
        for (const [index, ligne] of commande.lignes.entries()) {
          const { id: jetonId } = await ecrireJeton(transaction, {
            commandeId: commande.commandeId,
            empreinte: jetons[index]!.empreinte,
            portee: "AVIS",
            expireA: expirationAvis(),
          });

          await ecrireInvitation(transaction, {
            ligneCommandeId: ligne.id,
            jetonAccesId: jetonId,
          });
        }

        /*
         * L'EMAIL NE PART QU'AU PREMIER CYCLE DE CETTE COMMANDE, correction de
         * la revue critique du 11 septembre 2026.
         *
         * UN RATTRAPAGE DE LIGNE NE DOIT PAS RENVOYER UNE SOLLICITATION.
         * `envoi_en_attente_actif_unique` ne couvre que `EN_ATTENTE` et
         * `ENVOI_EN_COURS` : une premiere invitation deja passee a `ENVOYE` ne
         * bloque plus rien, et le client recevrait deux fois le meme message.
         * Le lien du premier email ouvre deja l'ecran sur TOUTE la commande,
         * lignes rattrapees comprises, `JetonAcces.commandeId` designant la
         * commande.
         *
         * L'INTENTION RESTE DANS LA TRANSACTION, ADR-033 : une invitation
         * ecrite dont l'email ne partirait pas laisserait un droit de deposer
         * que personne ne connait.
         */
        if (!commande.premiereInvitation) {
          return;
        }

        await deposerEnvoi(transaction, {
          commandeId: commande.commandeId,
          destinataire: commande.emailNormalise,
          modele: "invitation-avis",
          variables: {
            numero: commande.numero,
            lien: lienAvis(jetons[0]!.valeur),
            pieces: commande.lignes
              .map(
                (ligne) =>
                  `${ligne.libelleProduitFige} (${ligne.libelleVarianteFige})`,
              )
              .join(", "),
            delaiPublicationJours: String(DELAI_PUBLICATION_JOURS),
          },
          origine: "SYSTEME",
        });
      });

      /*
       * HORS TRANSACTION, ET CE N'EST PAS UN OUBLI. `dernierEnvoiA` distingue
       * une invitation creee d'une invitation PARTIE, et l'envoi reel a lieu
       * plus tard, dans le cycle d'`expedierEnvoisEnAttente`. Le marquer ici
       * dit que l'intention est deposee, la preuve d'envoi vivant dans
       * `JournalEmail`, source unique en cas de divergence.
       *
       * IL SUIT LA MEME CONDITION QUE L'ENVOI, et l'oublier aurait annule la
       * correction ci-dessus : un rattrapage ne depose aucune intention, donc
       * ecrire `dernierEnvoiA` y ferait passer pour partie une invitation dont
       * rien n'est parti. Le champ cesserait de distinguer ce qu'il existe pour
       * distinguer.
       */
      if (commande.premiereInvitation) {
        await marquerEnvoiAbouti(prisma, commande.commandeId);
      }

      invitees += 1;
    } catch (erreur) {
      /*
       * UNE INVITATION DEJA CREEE N'EST PAS UN INCIDENT. La course entre deux
       * cycles est refusee par l'unicite de `ligneCommandeId`, ce qui est
       * exactement le comportement voulu : le second cycle ne doit rien
       * ecrire. Elle est journalisee en `info` et ne compte pas comme un echec.
       */
      const dejaInvitee =
        erreur instanceof Prisma.PrismaClientKnownRequestError &&
        erreur.code === "P2002";

      if (dejaInvitee) {
        journaliser("info", "invitation d'avis deja creee", {
          commandeId: commande.commandeId,
        });
        continue;
      }

      echecs += 1;
      journaliserErreur("invitation d'avis impossible", erreur, {
        commandeId: commande.commandeId,
      });
    }
  }

  journaliser("info", "Cycle d'invitation aux avis termine", {
    traitees: commandes.length,
    invitees,
    echecs,
  });

  return { traitees: commandes.length, invitees, echecs };
}

/**
 * Plafond de renvois d'une invitation d'avis.
 *
 * TROIS TENTATIVES AU TOTAL, l'envoi initial compris : `ecrireInvitation` pose
 * `nombreEnvois: 1` a la creation, donc deux renvois restent possibles.
 *
 * C'EST LE REPOSITORY QUI POSE CE 1, PAS LE DEFAUT DE LA COLONNE, qui vaut
 * zero au schema. Une invitation ecrite par un autre chemin partirait donc de
 * zero et obtiendrait un renvoi de plus. Un seul chemin d'ecriture existe
 * aujourd'hui, et le dire evite de lire ce plafond comme une garantie de
 * schema. Le plafond existe parce
 * que chaque renvoi CONSOMME LE QUOTA SMTP de l'offre MX Plan, deux cents
 * messages par heure, ADR-008 : une commande qu'on relancerait sans fin ferait
 * tomber les emails legitimes avec elle.
 *
 * IL N'EST PAS UNE PROTECTION CONTRE UN ATTAQUANT, et le dire evite de le
 * durcir pour de mauvaises raisons : le geste est reserve a l'exploitante, qui
 * est authentifiee et seule. Il borne une erreur de manipulation, pas une
 * attaque.
 */
const PLAFOND_ENVOIS_INVITATION = 3;

/** Ce que le renvoi rend a l'ecran qui l'a demande. */
export type IssueRenvoi =
  | { statut: "RENVOYEE"; nombreEnvois: number }
  | { statut: "REFUSE_INTROUVABLE" }
  | { statut: "REFUSE_DEJA_NOTEE" }
  | { statut: "REFUSE_PLAFOND"; plafond: number }
  | { statut: "REFUSE_ENVOI_EN_COURS" };

/**
 * Renvoie l'invitation d'avis d'une commande, critere 3 de LS-61.
 *
 * CE QU'ELLE FERME. Jusqu'a cette fonction, une invitation partait UNE FOIS ET
 * UNE SEULE : un client qui perdait son email ne pouvait plus jamais deposer
 * son avis, et rien ne permettait de lui en renvoyer un. Cela se payait en avis
 * non deposes.
 *
 * TOUS LES JETONS SONT REGENERES, PAS SEULEMENT LE PREMIER, et c'est le point
 * le moins evident de cette fonction. Le lien de l'email ne porte que le jeton
 * de la PREMIERE ligne, mais les autres ont ete ecrits en base au meme moment :
 * n'en faire tourner qu'un laisserait les autres valides jusqu'a leur terme, ce
 * que le point 8 de `database.md` interdit precisement. Sur une boite partagee,
 * un ancien lien deposerait un avis a la place de son destinataire.
 *
 * L'ORDRE DES QUATRE ECRITURES EST IMPOSE, point 8 de `database.md` :
 * revoquer l'ancien jeton, INSERER LE NOUVEAU, puis faire pointer l'invitation
 * dessus, et compter la tentative. Inserer apres la mise a jour du pointeur
 * ferait echouer la cle etrangere.
 *
 * LA REVOCATION RENSEIGNE `revoqueA` ET JAMAIS `utiliseA`, regle L10. Un jeton
 * revoque marque consomme ferait afficher « avis deja depose » a un client qui
 * n'a rien depose.
 *
 * `dernierEnvoiA` EST RENSEIGNE HORS TRANSACTION, comme a la creation : un
 * envoi d'email n'appartient a aucune transaction PostgreSQL.
 *
 * L'AUTORISATION N'EST PAS ICI. Cette fonction est appelee par une Server
 * Action d'administration qui exige le role, invariant 2 : le `commandeId`
 * qu'elle reçoit vient d'un ecran deja garde, et un service ne lit ni session
 * ni cookie, fichier de garde de `services/`.
 */
export async function renvoyerInvitation(
  commandeId: string,
): Promise<IssueRenvoi> {
  const invitations = await lireInvitationsARenvoyer(prisma, commandeId);

  if (invitations.length === 0) {
    return { statut: "REFUSE_INTROUVABLE" };
  }

  /*
   * UNE COMMANDE ENTIEREMENT NOTEE NE SE RELANCE PAS. Le client recevrait un
   * lien qui lui dirait « avis deja depose », ce qui est une relance pour rien
   * et un message deroutant. Le refus porte sur TOUTES les lignes : une
   * commande dont une piece sur trois reste a noter se renvoie legitimement.
   */
  if (invitations.every((invitation) => invitation.avisDejaDepose)) {
    return { statut: "REFUSE_DEJA_NOTEE" };
  }

  /*
   * LE PLAFOND SE LIT SUR LE MAXIMUM et non sur la premiere ligne. Les
   * invitations d'une commande sont renvoyees ensemble, donc leurs compteurs
   * avancent de concert ; lire une seule ligne marcherait aujourd'hui et
   * casserait le jour ou un renvoi partiel existerait.
   */
  const envoisDejaFaits = Math.max(
    ...invitations.map((invitation) => invitation.nombreEnvois),
  );

  if (envoisDejaFaits >= PLAFOND_ENVOIS_INVITATION) {
    return { statut: "REFUSE_PLAFOND", plafond: PLAFOND_ENVOIS_INVITATION };
  }

  /*
   * UNE COMMANDE DISSOCIEE NE SE RELANCE PAS, et `lireCommandeARelancer` porte
   * ce filtre : elle appartient a un compte supprime, article 17, et lui
   * ecrire irait a l'adresse dont la personne a demande l'effacement.
   */
  const commande = await lireCommandeARelancer(prisma, commandeId);

  if (commande === null) {
    return { statut: "REFUSE_INTROUVABLE" };
  }

  // LES JETONS SONT ENGENDRES HORS TRANSACTION, meme motif qu'a la creation :
  // c'est un calcul en memoire. Leur VALEUR n'est jamais journalisee.
  /*
   * LE REFUS EST EN AMONT DE LA TRANSACTION, ET C'EST UN DEFAUT MESURE.
   *
   * `deposerEnvoi` attrape le P2002 d'`envoi_en_attente_actif_unique` et se
   * tait. Mais PostgreSQL a deja AVORTE la transaction au moment de la
   * violation : les trois ecritures precedentes, revocation, insertion et
   * rattachement, sont perdues au `COMMIT` sans que Prisma ne leve. Le service
   * rendait alors `RENVOYEE` sur une base INCHANGEE, et `nombreEnvois` ne
   * bougeait pas, donc le plafond ne se rapprochait meme pas.
   *
   * PIRE ENCORE SI LA TRANSACTION ABOUTISSAIT : l'email d'origine, encore en
   * attente, porte l'ANCIEN jeton que ce renvoi vient de revoquer. Le client
   * recevrait un lien « remplace » en etant invite a chercher un email plus
   * recent qui n'existe pas.
   *
   * MESURE PAR SONDE le 11 septembre 2026 : une insertion valide puis un
   * doublon avale dans la meme transaction laissent ZERO ligne ecrite.
   *
   * LE REFUS NE PERD RIEN : l'email d'origine part de toute façon dans la
   * minute, avec un jeton valide. Reessayer apres son depart fonctionne.
   */
  if (
    await intentionActiveExiste(prisma, {
      commandeId,
      modele: "invitation-avis",
    })
  ) {
    return { statut: "REFUSE_ENVOI_EN_COURS" };
  }

  const jetons = invitations.map(() => engendrerJeton());

  await prisma.$transaction(async (transaction) => {
    for (const [index, invitation] of invitations.entries()) {
      await revoquerJeton(transaction, invitation.jetonAccesId);

      const { id: jetonId } = await ecrireJeton(transaction, {
        commandeId,
        empreinte: jetons[index]!.empreinte,
        portee: "AVIS",
        expireA: expirationAvis(),
      });

      await rattacherJetonNeuf(transaction, {
        invitationId: invitation.id,
        jetonAccesId: jetonId,
      });
    }

    /*
     * L'EMAIL PORTE LE JETON DE LA PREMIERE LIGNE, exactement comme a la
     * creation : `JetonAcces.commandeId` designe la COMMANDE, donc ce lien
     * ouvre l'ecran sur toutes les pieces.
     *
     * `deposerEnvoi` PASSE ICI SANS CONFLIT, et c'est le refus en amont qui le
     * garantit, pas la chance. La cle `envoi_en_attente_actif_unique` exclut
     * les lignes ENVOYE, donc l'invitation deja partie n'occupe plus la cle :
     * c'est le « renvoi manuel de la regle E6 » que le schema annonce.
     *
     * NE PAS DEPLACER CET APPEL NI RETIRER LE REFUS EN AMONT. `deposerEnvoi`
     * avale le P2002, et une transaction avortee par PostgreSQL perd tout ce
     * qui la precede sans rien lever.
     */
    await deposerEnvoi(transaction, {
      commandeId,
      modele: "invitation-avis",
      destinataire: commande.emailNormalise,
      /*
       * LES MEMES VARIABLES QU'A LA CREATION, et `pieces` porte les LIBELLES
       * FIGES et non les identifiants : c'est ce que le client lit, et
       * l'invariant 3 interdit de relire le catalogue actuel pour une commande
       * passee.
       */
      variables: {
        numero: commande.numero,
        lien: lienAvis(jetons[0]!.valeur),
        pieces: invitations
          .map(
            (invitation) =>
              `${invitation.libelleProduitFige} (${invitation.libelleVarianteFige})`,
          )
          .join(", "),
        delaiPublicationJours: String(DELAI_PUBLICATION_JOURS),
      },
      /*
       * `ADMIN` ET NON `SYSTEME`, et ce choix a un effet mesurable :
       * `journal_email_systeme_unique` filtre sur
       * `origine IN ('SYSTEME','RECONCILIATION')`. Une origine SYSTEME ferait
       * buter le renvoi sur la trace du premier envoi. C'est exactement le
       * « renvoi manuel apres echec » que la regle E6 prevoit.
       */
      origine: "ADMIN",
    });
  });

  await marquerEnvoiAbouti(prisma, commandeId);

  /*
   * AUCUNE ADRESSE EMAIL NI VALEUR DE JETON DANS LE JOURNAL, invariant 9. Le
   * numero de commande suffit a retrouver le geste, et il n'identifie personne
   * a lui seul.
   */
  journaliser("info", "invitation d'avis renvoyee", {
    commandeId,
    envois: envoisDejaFaits + 1,
  });

  return { statut: "RENVOYEE", nombreEnvois: envoisDejaFaits + 1 };
}

/** Motif interne de refus, journalise, jamais rendu a l'appelant. */
type MotifRefus =
  | "SIGNATURE_INVALIDE"
  | "INTROUVABLE"
  | "EXPIRE"
  | "CONSOMME"
  | "REVOQUE"
  | "PORTEE_INCORRECTE";

/**
 * Ce qu'une resolution de jeton d'avis produit.
 *
 * LE REFUS DISTINGUE DEUX CAS, ET C'EST UN ECART ASSUME AVEC `acces-document`.
 * `REVOQUE` est rendu separement de `REFUSE` parce qu'un jeton revoque
 * correspond a un CLIENT LEGITIME dont le lien a ete remplace par un renvoi :
 * lui afficher le meme message qu'a un inconnu le laisserait sans recours,
 * alors qu'un email plus recent l'attend dans sa boite. Le critere 4 de la
 * story l'exige, et la fuite d'information est nulle : il faut deja detenir une
 * valeur signee valide pour atteindre ce message.
 *
 * `CONSOMME` EST RENDU SEPAREMENT POUR LA MEME RAISON : « vous avez deja depose
 * cet avis » est la verite, et l'afficher comme un refus generique ferait
 * croire a une panne.
 */
type ResolutionJeton =
  | { statut: "AUTORISE"; commandeId: string; jetonId: string }
  | { statut: "CONSOMME" }
  | { statut: "REVOQUE" }
  | { statut: "REFUSE" };

function refuser(
  motif: MotifRefus,
  correlation?: Correlation,
): ResolutionJeton {
  journaliser("info", "Acces avis refuse", { motif }, correlation);

  if (motif === "CONSOMME") {
    return { statut: "CONSOMME" };
  }

  if (motif === "REVOQUE") {
    return { statut: "REVOQUE" };
  }

  return { statut: "REFUSE" };
}

/**
 * Resout une valeur de jeton vers la commande qu'elle autorise.
 *
 * L'ORDRE DES CONTROLES EST DELIBERE, repris de LS-132 : la signature d'abord,
 * EN MEMOIRE et sans toucher la base. Une valeur forgee ne doit pas couter une
 * requete, sans quoi l'enumeration reste possible a cout constant.
 *
 * LES QUATRE CONDITIONS SE TESTENT ENSEMBLE, regle L9. Modifie, expire,
 * consomme, revoque : en omettre une ouvre un acces, et le piege documente est
 * de ne verifier que l'expiration, ce qui laisse utilisable jusqu'a son terme
 * un lien parti sur une adresse erronee.
 *
 * LA PORTEE EST VERIFIEE, regle L6, moindre privilege. La meme table sert
 * quatre usages : sans ce controle, un jeton de facture ouvrirait un depot
 * d'avis, et l'entite generique deviendrait une faille.
 */
async function resoudreJeton(
  valeurJeton: string,
  correlation?: Correlation,
): Promise<ResolutionJeton> {
  if (!signatureJetonValide(valeurJeton)) {
    return refuser("SIGNATURE_INVALIDE", correlation);
  }

  const jeton = await lireJetonParEmpreinte(
    prisma,
    empreinteJeton(valeurJeton),
  );

  if (jeton === null) {
    return refuser("INTROUVABLE", correlation);
  }

  if (jeton.portee !== "AVIS") {
    return refuser("PORTEE_INCORRECTE", correlation);
  }

  if (jeton.expireA.getTime() <= Date.now()) {
    return refuser("EXPIRE", correlation);
  }

  if (jeton.utiliseA !== null) {
    return refuser("CONSOMME", correlation);
  }

  if (jeton.revoqueA !== null) {
    return refuser("REVOQUE", correlation);
  }

  return {
    statut: "AUTORISE",
    commandeId: jeton.commandeId,
    jetonId: jeton.id,
  };
}

/** Ce que l'ecran de depot recoit, avant toute saisie. */
export type EtatDepotAvis =
  | {
      statut: "OUVERT";
      numeroCommande: string;
      pieces: InvitationLue[];
    }
  /** Le jeton a deja servi : l'avis est depose, ce n'est pas une erreur. */
  | { statut: "DEJA_DEPOSE" }
  /** Le lien a ete remplace par un renvoi, un email plus recent existe. */
  | { statut: "LIEN_REMPLACE" }
  | { statut: "INDISPONIBLE" };

/**
 * Ou en est le droit de deposer, sans rien ecrire.
 *
 * ELLE SERT L'ECRAN AVANT LE FORMULAIRE, meme arbitrage que la retractation :
 * un lien remplace ou deja consomme s'explique sur un ecran d'information
 * plutot que de se faire refuser apres saisie.
 *
 * ELLE NE CONSOMME PAS LE JETON. La consommation marque une action FAITE, le
 * depot lui-meme : consommer a l'affichage rendrait le lien inutilisable a
 * quiconque ouvre l'email sans avoir le temps d'ecrire.
 */
export async function lireEtatDepot(
  valeurJeton: string,
  correlation?: Correlation,
): Promise<EtatDepotAvis> {
  const resolution = await resoudreJeton(valeurJeton, correlation);

  if (resolution.statut === "CONSOMME") {
    return { statut: "DEJA_DEPOSE" };
  }

  if (resolution.statut === "REVOQUE") {
    return { statut: "LIEN_REMPLACE" };
  }

  if (resolution.statut === "REFUSE") {
    return { statut: "INDISPONIBLE" };
  }

  const pieces = await lireInvitationsDeCommande(prisma, resolution.commandeId);

  if (pieces.length === 0) {
    return { statut: "INDISPONIBLE" };
  }

  const commande = await lireCommandePourAvis(prisma, resolution.commandeId);

  if (commande === null) {
    return { statut: "INDISPONIBLE" };
  }

  return { statut: "OUVERT", numeroCommande: commande.numero, pieces };
}

/** Ce qu'un depot d'avis produit. */
export type DepotAvis =
  | { statut: "DEPOSE"; nombre: number }
  /** Le jeton a deja servi, un rejeu ne cree pas de second avis. */
  | { statut: "DEJA_DEPOSE" }
  | { statut: "LIEN_REMPLACE" }
  /** Aucune ligne saisie ne correspond a une invitation de cette commande. */
  | { statut: "REFUSE_PIECE_INCONNUE" }
  /** La livraison n'est pas constatee, `experienceA` serait faux. */
  | { statut: "REFUSE_SANS_LIVRAISON" }
  | { statut: "REFUSE_ACCES" };

/** Une note portee sur une piece precise de la commande. */
export type SaisieAvis = {
  ligneCommandeId: string;
  note: number;
  commentaire: string | null;
};

/**
 * Depose un ou plusieurs avis et consomme le jeton, point 7.
 *
 * LES DEUX ECRITURES SONT DANS LA MEME TRANSACTION, et l'ordre importe moins
 * que l'atomicite : un jeton consomme sans avis prive le client de son droit,
 * un avis sans consommation autorise un second depot que l'unicite
 * `ligneCommandeId` transformerait en erreur 500.
 *
 * LE JETON EST CONSOMME UNE FOIS POUR TOUTE LA COMMANDE, et c'est la
 * consequence assumee du groupement. Un client qui note une piece sur trois ne
 * pourra pas revenir noter les deux autres par ce lien. L'alternative, un jeton
 * par ligne, exigeait de salir `JetonAcces` d'un `ligneCommandeId` nullable que
 * le modele conceptuel a ecarte ; et l'ecran presente les trois pieces
 * ensemble, ce qui rend le cas peu frequent. L'espace client reste ouvert aux
 * clients qui en ont un.
 *
 * `experienceA` VIENT DE `Expedition.livreA`, JAMAIS DE L'HORLOGE, article
 * D111-10 : c'est la date de l'experience de consommation, pas celle de la
 * saisie. Une commande sans date de remise est refusee plutot que datee au
 * jour du depot, une date approchee etant fausse au sens de cet article.
 *
 * L'AUTEUR VIENT DU JETON OU DE LA SESSION, regle R13 et invariant 2, jamais
 * d'un identifiant fourni par l'appelant.
 */
export async function deposerAvis(
  valeurJeton: string,
  saisies: SaisieAvis[],
  correlation?: Correlation,
): Promise<DepotAvis> {
  const resolution = await resoudreJeton(valeurJeton, correlation);

  if (resolution.statut === "CONSOMME") {
    return { statut: "DEJA_DEPOSE" };
  }

  if (resolution.statut === "REVOQUE") {
    return { statut: "LIEN_REMPLACE" };
  }

  if (resolution.statut === "REFUSE") {
    return { statut: "REFUSE_ACCES" };
  }

  if (saisies.length === 0) {
    return { statut: "REFUSE_PIECE_INCONNUE" };
  }

  const pieces = await lireInvitationsDeCommande(prisma, resolution.commandeId);

  /*
   * LES LIGNES SAISIES SONT CONFRONTEES AUX INVITATIONS DE CETTE COMMANDE, et
   * c'est le controle d'autorisation le plus important de cette fonction.
   * `ligneCommandeId` arrive du formulaire, donc d'une entree non fiable :
   * sans ce recoupement, un client deposerait un avis sur la ligne d'un tiers
   * en changeant une valeur de champ cache, invariant 2.
   */
  const autorisees = new Map(
    pieces.map((piece) => [piece.ligneCommandeId, piece]),
  );
  const retenues: { saisie: SaisieAvis; piece: InvitationLue }[] = [];

  /*
   * LES LIGNES REPETEES SONT DEDUPLIQUEES, ET C'EST UNE CORRECTION DE LA REVUE
   * CRITIQUE DU 11 SEPTEMBRE 2026, mesuree par sonde. Sans elle, un envoi
   * portant deux fois la meme ligne faisait lever `P2002` DANS la transaction :
   * celle-ci etait annulee en entier, et les avis SINCERES du meme envoi
   * partaient avec. Trois saisies, deux legitimes, zero avis ecrit, et le
   * client recevait « avis deja depose » sur un avis qui n'existait pas.
   *
   * LA PREMIERE SAISIE L'EMPORTE plutot que la derniere : c'est celle que
   * l'ecran a rendue en premier, donc celle que la personne a vue en notant.
   */
  const dejaRetenues = new Set<string>();

  for (const saisie of saisies) {
    const piece = autorisees.get(saisie.ligneCommandeId);

    if (piece === undefined) {
      return { statut: "REFUSE_PIECE_INCONNUE" };
    }

    if (dejaRetenues.has(saisie.ligneCommandeId)) {
      continue;
    }

    /*
     * UNE PIECE DEJA NOTEE EST IGNOREE, PAS REFUSEE. Le rejeu partiel n'est pas
     * une tentative de fraude : l'unicite `ligneCommandeId` la refuserait de
     * toute facon, et faire echouer l'ensemble perdrait les notes valides
     * saisies en meme temps.
     */
    if (piece.avisExistant !== null) {
      continue;
    }

    if (piece.livreA === null) {
      return { statut: "REFUSE_SANS_LIVRAISON" };
    }

    retenues.push({ saisie, piece });
    dejaRetenues.add(saisie.ligneCommandeId);
  }

  if (retenues.length === 0) {
    return { statut: "DEJA_DEPOSE" };
  }

  const utilisateurId = await lireAuteurDeCommande(resolution.commandeId);

  try {
    await prisma.$transaction(async (transaction) => {
      for (const { saisie, piece } of retenues) {
        /*
         * `livreA` EST NON NUL ICI, la boucle precedente l'ayant verifie. Le
         * test est repete plutot qu'assene par un `!` : le jour ou la boucle
         * changerait, ce chemin ecrirait une date fausse en silence.
         */
        if (piece.livreA === null) {
          continue;
        }

        await ecrireAvis(transaction, {
          ligneCommandeId: saisie.ligneCommandeId,
          utilisateurId,
          note: saisie.note,
          commentaire: normaliserCommentaire(saisie.commentaire),
          experienceA: piece.livreA,
        });
      }

      /*
       * LE JETON N'EST CONSOMME QUE SI TOUTE LA COMMANDE EST NOTEE, correction
       * de la revue critique du 11 septembre 2026, mesuree par sonde.
       *
       * LE DEFAUT ETAIT SUR LE CHEMIN NOMINAL, sans acteur hostile ni panne.
       * Un client qui notait une piece sur deux et gardait l'autre pour plus
       * tard voyait son lien CONSOMME : en revenant, l'ecran lui annonçait
       * « un avis a deja ete depose pour cette commande », ce qui etait faux
       * pour la seconde piece. Le jeton de cette ligne existait, valide
       * quatre-vingt-dix jours, mais sa valeur n'avait jamais circule : il
       * restait orphelin et la piece devenait definitivement innotable.
       *
       * MON COMMENTAIRE PRECEDENT ANNONÇAIT CE CAS COMME « PEU FREQUENT ». Il
       * etait pire que cela : le retour n'etait pas seulement ferme PAR CE
       * LIEN, il l'etait definitivement, aucun autre chemin d'ecriture
       * n'existant.
       *
       * CE QUI PROTEGE DU REJEU N'EST PLUS LE JETON MAIS L'UNICITE
       * `ligneCommandeId`, deja en place et deja eprouvee : un second depot sur
       * une ligne notee ressort par le `continue` de la boucle ci-dessus, puis
       * par `retenues.length === 0`. C'est aussi ce qui donne enfin un usage
       * aux jetons des autres lignes que la regle R20 impose de creer.
       *
       * LA CONSOMMATION RESTE DANS LA TRANSACTION, point 7, et exige
       * `utiliseA: null` cote repository : deux requetes simultanees sur le
       * meme lien passeraient toutes deux `resoudreJeton`, qui lit avant
       * d'ecrire, et la seconde perdrait la course ici.
       */
      const restantes = pieces.filter(
        (piece) =>
          piece.avisExistant === null &&
          !retenues.some(
            (retenue) =>
              retenue.piece.ligneCommandeId === piece.ligneCommandeId,
          ),
      );

      if (restantes.length > 0) {
        /*
         * `return` VALIDE LA TRANSACTION, il ne l'annule pas, fiche memoire
         * « un return valide la transaction » de ce depot. C'est bien ce qu'on
         * veut : les avis de cette passe sont ecrits, seul le jeton reste
         * intact pour que le client revienne noter le reste.
         */
        return;
      }

      const consomme = await consommerJeton(transaction, resolution.jetonId);

      if (!consomme) {
        /*
         * LEVER ANNULE LA TRANSACTION, ET C'EST LE COMPORTEMENT VOULU. La
         * course est perdue : l'avis concurrent est deja ecrit, et laisser
         * celui-ci passer creerait le second avis que le point 7 existe pour
         * empecher.
         */
        throw new CourseJetonPerdueError();
      }
    });
  } catch (erreur) {
    if (erreur instanceof CourseJetonPerdueError) {
      journaliser("info", "depot d'avis, course sur le jeton perdue", {
        commandeId: resolution.commandeId,
      });

      return { statut: "DEJA_DEPOSE" };
    }

    /*
     * UN AVIS DEJA DEPOSE SUR CETTE LIGNE, regle R2. Le cas est atteignable
     * quand deux requetes concurrentes passent la lecture ensemble : l'unicite
     * tranche en base, et le rejeu ne cree pas de second avis, critere 2.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      journaliser("info", "avis deja depose sur cette ligne", {
        commandeId: resolution.commandeId,
      });

      return { statut: "DEJA_DEPOSE" };
    }

    throw erreur;
  }

  /*
   * LA CLE EST `avisEcrits` ET NON `nombre`, ET CE N'EST PAS UN CAPRICE.
   * `journal.ts` masque par INCLUSION : « nombre » contient « nom », donc la
   * valeur sortait en `[masque]` et la ligne ne disait plus rien. Le filtre est
   * volontairement large et n'est pas a corriger, il masque trop et jamais trop
   * peu ; c'est la cle appelante qui s'ecarte du motif.
   */
  journaliser("info", "avis deposes", {
    commandeId: resolution.commandeId,
    avisEcrits: retenues.length,
  });

  return { statut: "DEPOSE", nombre: retenues.length };
}

/** Course perdue sur la consommation du jeton, annule la transaction. */
class CourseJetonPerdueError extends Error {
  constructor() {
    super("Jeton d'avis deja consomme par une requete concurrente");
    this.name = "CourseJetonPerdueError";
  }
}

/**
 * L'auteur d'un avis, quand la commande est rattachee a un compte.
 *
 * IL VIENT DE LA COMMANDE ET NON DE LA SESSION, regle R13 : le jeton est le
 * seul titre d'acces sur ce chemin, et un client connecte sous un autre compte
 * ne doit pas signer l'avis d'une commande qui n'est pas la sienne.
 *
 * `dissocieA` EST VERIFIE : une commande dont le compte a ete supprime ne doit
 * pas rattacher l'avis a un identifiant qui n'a plus de titulaire.
 */
async function lireAuteurDeCommande(
  commandeId: string,
): Promise<string | null> {
  const commande = await lireCommandePourAvis(prisma, commandeId);

  if (commande === null || commande.dissocieA !== null) {
    return null;
  }

  return commande.utilisateurId;
}

/**
 * Normalise un commentaire, meme traitement que le motif de retractation.
 *
 * UNE CHAINE VIDE DEVIENT `null`, ce qui distingue « aucun commentaire » de
 * « commentaire vide » a la lecture. La note seule est un avis valide.
 */
function normaliserCommentaire(commentaire: string | null): string | null {
  if (commentaire === null) {
    return null;
  }

  const nettoye = commentaire.trim();

  return nettoye === "" ? null : nettoye.slice(0, COMMENTAIRE_LONGUEUR_MAX);
}

/** Les avis en attente de relecture, pour l'ecran de moderation. */
export async function listerAvisAModerer(): Promise<AvisAModerer[]> {
  return listerAvisParStatut(prisma, ["DEPOSE"]);
}

/** Les avis deja decides, pour la seconde section de l'ecran. */
export async function listerAvisDecides(): Promise<AvisAModerer[]> {
  return listerAvisParStatut(prisma, ["PUBLIE", "REFUSE", "RETIRE"]);
}

/** Ce qu'une decision de moderation produit. */
export type IssueModeration =
  | { statut: "APPLIQUEE" }
  /** Regle R5, un refus ou un retrait sans motif est refuse. */
  | { statut: "REFUSE_MOTIF_MANQUANT" }
  | { statut: "REFUSE_INTROUVABLE" };

/**
 * Applique une decision de moderation, regles R4, R5 et R9.
 *
 * LE MOTIF EST OBLIGATOIRE SUR `REFUSE` ET `RETIRE`, regle R5, et le controle
 * est ICI plutot qu'en base : une contrainte CHECK le garantirait mieux, mais
 * elle refuserait aussi les lignes ecrites avant son ajout. Le service refuse,
 * le test le prouve, et `database.md` porte la regle a la ligne de validation
 * applicative.
 *
 * ELLE N'EST PAS TRANSACTIONNELLE, ET C'EST JUSTE. `appliquerDecision` ecrit au
 * plus deux instructions sur LA MEME LIGNE, dont la seconde est conditionnee
 * par `publieA: null` : un echec entre les deux laisse un avis publie sans date
 * de premiere publication, que le cycle suivant renseignera. Aucune autre
 * entite n'est touchee.
 */
export async function modererAvis(
  parametres: {
    avisId: string;
    statut: Extract<StatutAvis, "PUBLIE" | "REFUSE" | "RETIRE">;
    motifDecision: string | null;
  },
  correlation?: Correlation,
): Promise<IssueModeration> {
  const motif = normaliserCommentaire(parametres.motifDecision);

  if (parametres.statut !== "PUBLIE" && motif === null) {
    journaliser(
      "info",
      "moderation refusee, motif manquant",
      { avisId: parametres.avisId, statut: parametres.statut },
      correlation,
    );

    return { statut: "REFUSE_MOTIF_MANQUANT" };
  }

  try {
    await appliquerDecision(prisma, {
      avisId: parametres.avisId,
      statut: parametres.statut,
      motifDecision: motif,
    });
  } catch (erreur) {
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2025"
    ) {
      return { statut: "REFUSE_INTROUVABLE" };
    }

    throw erreur;
  }

  journaliser(
    "info",
    "avis modere",
    { avisId: parametres.avisId, statut: parametres.statut },
    correlation,
  );

  return { statut: "APPLIQUEE" };
}

/**
 * Les avis publies d'une variante, pour la fiche produit.
 *
 * SEULE LECTURE PUBLIQUE, regle R4. Elle delegue au repository, qui filtre sur
 * `PUBLIE` et n'expose ni la ligne de commande ni le client.
 */
export async function lireAvisPublies(
  varianteIds: string[],
): Promise<AvisPublie[]> {
  return listerAvisPublies(prisma, varianteIds);
}

/** Moyenne et compte, pour l'entete de la section d'avis. */
export type SyntheseAvis = {
  nombre: number;
  /** Moyenne arrondie au dixieme, `null` quand aucun avis n'est publie. */
  moyenne: number | null;
};

/**
 * Resume les avis publies d'une variante.
 *
 * LA MOYENNE EST CALCULEE SUR LES AVIS PUBLIES SEULEMENT, jamais sur les avis
 * en attente : afficher une moyenne incluant des avis non relus contredirait
 * la regle R4 en donnant a lire, sous forme agregee, ce qui n'est pas publie.
 *
 * ELLE N'EST PAS UN MONTANT, donc le flottant est ici legitime, invariant 1 :
 * une note moyenne n'est pas de l'argent et ne se compare a aucun centime.
 */
export function resumerAvis(avis: AvisPublie[]): SyntheseAvis {
  if (avis.length === 0) {
    return { nombre: 0, moyenne: null };
  }

  const total = avis.reduce((somme, ligne) => somme + ligne.note, 0);

  return {
    nombre: avis.length,
    moyenne: Math.round((total / avis.length) * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Signalement d'un doute sur l'authenticite d'un avis, LS-77.
//
// OBLIGATION LEGALE, article L111-7-2 du Code de la consommation, verifie a
// Legifrance le 11 septembre 2026, version en vigueur depuis le 17 fevrier
// 2024 : la fonctionnalite doit etre GRATUITE, ouverte aux « responsables des
// produits ou des services faisant l'objet d'un avis », et le signalement doit
// etre MOTIVE.
//
// AUCUNE AUTHENTIFICATION N'EST EXIGEE, et c'est la lecture du texte : les
// personnes qu'il vise ne sont pas des clients de la boutique et n'ont aucun
// compte ici. Exiger une authentification restreindrait un droit que la loi
// ouvre.
//
// LE FORMULAIRE EST DONC PUBLIC, avec les trois memes couches anti-robot que
// le contact de LS-97 : champ piege, delai minimum, plafond par adresse IP.
// Elles ne sont pas recopiees par confort, elles sont le seul rempart d'un
// formulaire sans session.
//
// UN SIGNALEMENT NE DEPUBLIE RIEN. Aucune fonction ci-dessous n'ecrit sur
// `Avis` : une depublication automatique ferait de ce formulaire un moyen de
// retirer les avis d'un concurrent. Si le doute conduit a un retrait, il passe
// par `modererAvis` avec son motif, regle R5.
// ---------------------------------------------------------------------------

/**
 * Delai minimum entre l'affichage du formulaire et sa soumission.
 *
 * MEME VALEUR QUE LE CONTACT, et pour la meme raison : il ne s'agit pas de
 * mesurer un temps de reflexion, mais d'ecarter la soumission INSTANTANEE,
 * signature d'un script qui poste sans lire la page.
 */
const DELAI_MINIMUM_SIGNALEMENT_MS = 3000;

/**
 * Plafond par adresse IP, et sa fenetre.
 *
 * PLUS BAS QUE LE CONTACT, TROIS AU LIEU DE CINQ. Signaler un avis est un geste
 * rare : une personne qui en signale trois en une heure conteste deja tout ce
 * qu'elle avait a contester. Un plafond genereux ici servirait surtout a noyer
 * l'exploitante sous des signalements automatises.
 */
const PLAFOND_SIGNALEMENTS_PAR_IP = 3;
const FENETRE_SIGNALEMENTS_SECONDES = 3600;

/** Ce que le formulaire public de signalement transmet, avant validation. */
export type SaisieSignalement = {
  avisId: string;
  qualite: string;
  email: string;
  motif: string;
  /** Champ piege, invisible a l'ecran. Une personne ne le remplit jamais. */
  piege: string;
  /** Instant d'affichage du formulaire, en millisecondes. */
  ouvertA: number;
};

/** Ce qu'un depot de signalement produit. */
export type IssueSignalement =
  | { statut: "ENREGISTRE" }
  | { statut: "INVALIDE"; message: string }
  | { statut: "TROP_DE_SIGNALEMENTS" }
  /** L'avis n'existe pas, ou n'est pas publie : meme reponse dans les deux cas. */
  | { statut: "AVIS_INTROUVABLE" };

/**
 * Enregistre un signalement de doute sur l'authenticite d'un avis.
 *
 * L'ORDRE DES INSTRUCTIONS EST LE MECANISME, repris de `message-contact.ts` :
 * les trois couches anti-robot AVANT toute ecriture, la validation ensuite, le
 * plafond APRES la validation pour ne pas compter une faute de frappe, et
 * l'ecriture en dernier.
 *
 * UN AVIS NON PUBLIE EST INTROUVABLE, ET C'EST UN CHOIX D'AUTORISATION. Seuls
 * les avis publies sont signalables : accepter un signalement sur un avis
 * `DEPOSE` confirmerait son existence a quelqu'un qui n'a pas pu le lire, ce qui
 * ferait de ce formulaire un oracle sur la file de moderation.
 *
 * LE REFUS EST UNIFORME entre « aucun avis sous cet identifiant » et « avis non
 * publie », meme motif que l'acces par jeton : distinguer les deux revelerait
 * qu'un avis existe.
 */
export async function signalerAvis({
  saisie,
  adresseIp,
}: {
  saisie: SaisieSignalement;
  adresseIp: string | null;
}): Promise<IssueSignalement> {
  /*
   * PREMIERE COUCHE, LE CHAMP PIEGE. Il rend `ENREGISTRE` et non un refus :
   * dire « refuse » a un robot lui apprend l'existence du piege.
   */
  if (saisie.piege.trim() !== "") {
    journaliser("info", "signalement ecarte, champ piege rempli", {});

    return { statut: "ENREGISTRE" };
  }

  /*
   * DEUXIEME COUCHE, LE DELAI. `ouvertA` vient du formulaire, donc il n'est pas
   * fiable : un robot peut l'anti-dater. C'est la limite acceptee de cette
   * couche, et c'est pourquoi elle n'est pas seule.
   */
  const ecoule = Date.now() - saisie.ouvertA;

  if (
    !Number.isFinite(saisie.ouvertA) ||
    ecoule < DELAI_MINIMUM_SIGNALEMENT_MS
  ) {
    journaliser("info", "signalement ecarte, soumission immediate", {});

    return { statut: "ENREGISTRE" };
  }

  let valide;

  try {
    valide = valider(schemaSignalementAvis, {
      avisId: saisie.avisId,
      qualite: saisie.qualite,
      email: saisie.email,
      motif: saisie.motif,
    });
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  /*
   * TROISIEME COUCHE, LE PLAFOND. Il vient APRES la validation : compter une
   * saisie refusee fermerait la porte a quelqu'un qui corrige une faute de
   * frappe dans son adresse.
   */
  if (adresseIp !== null) {
    try {
      const compteur = await incrementerCompteur(
        prisma,
        `signalement|${adresseIp}`,
        FENETRE_SIGNALEMENTS_SECONDES,
      );

      if (compteur.compte > PLAFOND_SIGNALEMENTS_PAR_IP) {
        return { statut: "TROP_DE_SIGNALEMENTS" };
      }
    } catch (erreur) {
      /*
       * DEFAUT OUVERT, meme choix que le contact et pour la meme raison. Une
       * base qui tousse ne doit pas fermer un canal que la loi impose
       * d'ouvrir. Le risque est borne par les deux couches precedentes, qui ne
       * dependent pas de la base.
       */
      journaliserErreur("plafond de signalement indisponible", erreur, {});
    }
  }

  const avis = await lireAvisPubliePourSignalement(prisma, valide.avisId);

  if (avis === null) {
    return { statut: "AVIS_INTROUVABLE" };
  }

  await ecrireSignalement(prisma, {
    avisId: valide.avisId,
    qualite: valide.qualite,
    email: valide.email,
    motif: valide.motif,
  });

  journaliser("info", "signalement d'avis enregistre", {
    avisId: valide.avisId,
  });

  return { statut: "ENREGISTRE" };
}

/** Les signalements en attente d'examen, pour l'ecran d'administration. */
export async function listerSignalementsAExaminer(): Promise<SignalementLu[]> {
  return listerSignalements(prisma, ["NOUVEAU"]);
}

/** Les signalements deja traites, pour la seconde section de l'ecran. */
export async function listerSignalementsTraites(): Promise<SignalementLu[]> {
  return listerSignalements(prisma, ["EXAMINE", "RETENU", "ECARTE"]);
}

/** Ce qu'une cloture de signalement produit. */
export type IssueCloture =
  { statut: "APPLIQUEE" } | { statut: "REFUSE_INTROUVABLE" };

/**
 * Clot un signalement apres examen.
 *
 * ELLE NE TOUCHE PAS A L'AVIS, deliberement. Retenir un signalement ne retire
 * pas l'avis : c'est `modererAvis` qui le fait, avec son propre motif, et les
 * deux gestes restent distincts pour que la decision de moderation porte
 * toujours sa justification propre, regle R5.
 */
export async function cloturerSignalementAvis(
  parametres: {
    signalementId: string;
    statut: Extract<StatutSignalement, "EXAMINE" | "RETENU" | "ECARTE">;
    suiteDonnee: string | null;
  },
  correlation?: Correlation,
): Promise<IssueCloture> {
  try {
    await cloturerSignalement(prisma, {
      signalementId: parametres.signalementId,
      statut: parametres.statut,
      suiteDonnee: normaliserCommentaire(parametres.suiteDonnee),
    });
  } catch (erreur) {
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2025"
    ) {
      return { statut: "REFUSE_INTROUVABLE" };
    }

    throw erreur;
  }

  journaliser(
    "info",
    "signalement d'avis clos",
    { signalementId: parametres.signalementId, statut: parametres.statut },
    correlation,
  );

  return { statut: "APPLIQUEE" };
}

/**
 * L'avis vise par un signalement, pour le rappeler a l'ecran.
 *
 * SEULS LES AVIS PUBLIES REMONTENT, regle R4 et controle d'autorisation : un
 * avis en attente de relecture ne doit pas devenir lisible par quiconque forge
 * une URL portant son identifiant.
 */
export async function lireAvisPourSignalement(avisId: string) {
  return lireAvisASignaler(prisma, avisId);
}
