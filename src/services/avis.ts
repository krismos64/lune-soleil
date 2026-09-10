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
import type { StatutAvis } from "@/generated/prisma/client";

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
  ecrireAvis,
  ecrireInvitation,
  lireCommandePourAvis,
  lireInvitationsDeCommande,
  listerAvisParStatut,
  listerAvisPublies,
  listerCommandesAInviter,
  marquerEnvoiAbouti,
} from "@/repositories/avis";
import type {
  AvisAModerer,
  AvisPublie,
  InvitationLue,
} from "@/repositories/avis";
import { deposerEnvoi } from "@/services/envoi-email";
import {
  consommerJeton,
  ecrireJeton,
  lireJetonParEmpreinte,
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
