/**
 * Depot d'une demande de retractation, LS-134. Parcours 5, etapes 1 a 5.
 *
 * OBLIGATION LEGALE, article L221-21 : pour un contrat conclu en ligne, le
 * professionnel met a disposition une fonctionnalite permettant d'exercer
 * GRATUITEMENT le droit de retractation. Un formulaire a telecharger ne suffit
 * pas, et elle reste accessible pendant tout le delai.
 *
 * L'ARTICLE L221-20 FIXE LE COUT D'UNE ERREUR ICI : sans information correcte
 * sur ce droit, le delai passe de quatorze jours a PLUS D'UN AN, sur toutes les
 * commandes concernees. C'est le risque le plus couteux du parcours 5, et il
 * penche toujours du meme cote : mieux vaut accepter une demande douteuse que
 * refuser une demande legitime.
 *
 * DEUX CHEMINS D'AUTORISATION, jamais un numero de commande, regle L4 et
 * invariant 2. La session pour qui a un compte, un jeton signe de portee
 * `RETRACTATION` sinon. Le second existe parce qu'un achat sans compte ouvre le
 * meme droit, et que LS-57 ne le couvre pas.
 *
 * LE MOTIF EST FACULTATIF, et ce n'est pas un choix d'ergonomie : le droit de
 * retractation est INCONDITIONNEL, article L221-18. Exiger un motif le
 * conditionnerait, et le rendrait donc irregulier.
 *
 * AUCUNE EXCLUSION CODEE EN DUR, regle L3 et article L221-28. Les exceptions
 * dependent de la caracteristique concrete du produit et jamais de sa
 * categorie : ne jamais ecrire « les boucles d'oreilles sont exclues ». Un refus
 * se motive au cas par cas, et il appartient a l'administration, LS-135.
 *
 * LE DELAI VIENT DE `retractation.ts`, JAMAIS D'UN CALCUL LOCAL, LS-133 : un
 * second calcul divergerait de la date affichee au client, et c'est l'affichage
 * qui engage.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import {
  calculerEcheanceRetractation,
  DateReceptionInvalideError,
} from "@/lib/retractation";
import { empreinteJeton, signatureJetonValide } from "@/lib/jeton-acces";
import {
  consommerJeton,
  lireJetonParEmpreinte,
} from "@/repositories/jeton-acces";
import {
  creerDemandeRetractation,
  lireCommandePourRetractation,
  lireDemandeParCommande,
} from "@/repositories/retractation";
import { deposerEnvoi } from "@/services/envoi-email";

/**
 * Ce qu'une commande permet, vu du client.
 *
 * TROIS ETATS ET NON DEUX : « le delai n'a pas commence » n'est pas « le delai
 * est expire ». Un colis non encore recu laisse le droit ENTIER, et le
 * confondre avec une expiration eteindrait un droit ouvert.
 */
export type EtatRetractation =
  | {
      statut: "OUVERTE";
      /** Jour civil parisien du dernier jour utile, `AAAA-MM-JJ`. */
      jourLimite: string;
    }
  | {
      /**
       * Le bien n'est pas encore recu, donc le delai n'a pas commence.
       *
       * LA FONCTIONNALITE RESTE ACCESSIBLE dans cet etat, article L221-18 : la
       * retractation peut s'exercer DES la conclusion du contrat, et attendre
       * la reception pour ouvrir le formulaire retirerait un droit existant.
       */
      statut: "AVANT_RECEPTION";
    }
  | { statut: "EXPIREE"; jourLimite: string }
  | { statut: "DEJA_DEPOSEE"; statutDemande: string }
  | { statut: "INDISPONIBLE" };

/**
 * Ce qu'un depot produit.
 *
 * UN SEUL CAS DE REFUS POUR L'ACCES, comme LS-132 : l'appelant ne distingue pas
 * un jeton expire d'un jeton inexistant, sans quoi la route devient un oracle
 * revelant qu'une commande existe.
 *
 * LES REFUS METIER SONT DISTINCTS, EUX, et c'est deliberement different. Le
 * client a DEJA prouve son droit d'acces quand ils surviennent : lui dire que
 * le delai a expire le 12 mai, ou qu'une demande existe deja, ne revele rien
 * qu'il ne sache pas et lui evite de rester sans explication sur un droit.
 */
export type DepotRetractation =
  | { statut: "DEPOSEE"; demandeId: string; jourLimite: string | null }
  | { statut: "REFUSE_ACCES" }
  | { statut: "REFUSE_HORS_DELAI"; jourLimite: string }
  | { statut: "REFUSE_DEJA_DEPOSEE" }
  | { statut: "REFUSE_ETAT_COMMANDE" };

/** Motif interne, journalise, jamais rendu a l'appelant. */
type MotifRefusAcces =
  | "SIGNATURE_INVALIDE"
  | "INTROUVABLE"
  | "EXPIRE"
  | "CONSOMME"
  | "REVOQUE"
  | "PORTEE_INCORRECTE"
  | "SESSION_ETRANGERE";

function refuserAcces(
  motif: MotifRefusAcces,
  correlation?: Correlation,
): { statut: "REFUSE_ACCES" } {
  journaliser("info", "Acces retractation refuse", { motif }, correlation);

  return { statut: "REFUSE_ACCES" };
}

/**
 * Longueur maximale du motif libre.
 *
 * BORNEE PARCE QU'ELLE EST PERSISTEE ET RELUE PAR L'EXPLOITANTE. La valeur est
 * large : le champ est facultatif, et un client qui s'explique longuement ne
 * doit pas voir sa demande refusee pour un depassement, ce qui reviendrait a
 * conditionner un droit inconditionnel a une contrainte de forme.
 */
export const MOTIF_LONGUEUR_MAX = 2000;

/**
 * Statuts de commande qui ouvrent une retractation.
 *
 * CE N'EST PAS UNE EXCLUSION AU SENS DE L221-28, regle L3 : il ne s'agit pas de
 * juger le PRODUIT, mais de constater qu'une commande non payee ou deja annulee
 * n'a pas de contrat a retracter. Une commande `REMBOURSEE` non plus.
 */
const STATUTS_RETRACTABLES = new Set([
  "CONFIRMEE",
  "EN_PREPARATION",
  "EXPEDIEE",
  "LIVREE",
]);

/**
 * Identite prouvee de qui agit, dejà etablie par l'appelant.
 *
 * LE SERVICE NE LIT NI COOKIE NI EN-TETE : il recoit une preuve, il ne la
 * fabrique pas. C'est ce qui rend les deux chemins testables separement et
 * empeche un adaptateur de passer un identifiant de commande nu.
 */
export type PreuveAcces =
  | { voie: "SESSION"; utilisateurId: string; commandeId: string }
  | { voie: "JETON"; valeurJeton: string };

/**
 * Resout une preuve d'acces vers la commande qu'elle autorise.
 *
 * L'ORDRE DES CONTROLES EST DELIBERE, repris de LS-132 : la signature d'abord,
 * EN MEMOIRE et sans toucher la base. Une valeur forgee ne doit pas couter une
 * requete, sans quoi l'enumeration reste possible a cout constant.
 *
 * LES QUATRE CONDITIONS SE TESTENT ENSEMBLE, regle L9. Modifie, expire,
 * consomme, revoque : en omettre une ouvre un acces, et le piege documente est
 * de ne verifier que l'expiration, ce qui laisse utilisable jusqu'a son terme
 * un lien parti sur une adresse erronee.
 */
async function resoudreAcces(
  preuve: PreuveAcces,
  correlation?: Correlation,
): Promise<
  | { statut: "AUTORISE"; commandeId: string; jetonId: string | null }
  | {
      statut: "REFUSE_ACCES";
    }
> {
  if (preuve.voie === "SESSION") {
    /*
     * L'AUTORISATION EST DANS LA LECTURE, jamais dans un `if` apres coup, comme
     * `lireMaCommande` de LS-57 : la requete porte l'identifiant ET
     * l'utilisateur, et rend `null` aussi bien pour une commande inexistante
     * que pour celle d'un tiers.
     */
    const commande = await lireCommandePourRetractation(prisma, {
      commandeId: preuve.commandeId,
      utilisateurId: preuve.utilisateurId,
    });

    if (commande === null) {
      return refuserAcces("SESSION_ETRANGERE", correlation);
    }

    return { statut: "AUTORISE", commandeId: commande.id, jetonId: null };
  }

  if (!signatureJetonValide(preuve.valeurJeton)) {
    return refuserAcces("SIGNATURE_INVALIDE", correlation);
  }

  const jeton = await lireJetonParEmpreinte(
    prisma,
    empreinteJeton(preuve.valeurJeton),
  );

  if (jeton === null) {
    return refuserAcces("INTROUVABLE", correlation);
  }

  /*
   * LA PORTEE EST VERIFIEE, regle L6, moindre privilege. La meme table sert
   * quatre usages : sans ce controle, un jeton de facture ouvrirait une
   * retractation, et l'entite generique deviendrait une faille.
   */
  if (jeton.portee !== "RETRACTATION") {
    return refuserAcces("PORTEE_INCORRECTE", correlation);
  }

  if (jeton.expireA.getTime() <= Date.now()) {
    return refuserAcces("EXPIRE", correlation);
  }

  if (jeton.utiliseA !== null) {
    return refuserAcces("CONSOMME", correlation);
  }

  if (jeton.revoqueA !== null) {
    return refuserAcces("REVOQUE", correlation);
  }

  return {
    statut: "AUTORISE",
    commandeId: jeton.commandeId,
    jetonId: jeton.id,
  };
}

/**
 * Ou en est le droit de retractation d'une commande, sans rien ecrire.
 *
 * SERT L'ECRAN AVANT LE FORMULAIRE, arbitrage du 3 septembre 2026 : une demande
 * hors delai s'explique sur un ecran d'information plutot que de se faire
 * refuser apres saisie. Le client comprend pourquoi au lieu de buter sur un
 * refus.
 */
export async function lireEtatRetractation(
  preuve: PreuveAcces,
  correlation?: Correlation,
): Promise<EtatRetractation> {
  const acces = await resoudreAcces(preuve, correlation);

  if (acces.statut === "REFUSE_ACCES") {
    return { statut: "INDISPONIBLE" };
  }

  const commande = await lireCommandePourRetractation(prisma, {
    commandeId: acces.commandeId,
  });

  if (commande === null || !STATUTS_RETRACTABLES.has(commande.statut)) {
    return { statut: "INDISPONIBLE" };
  }

  const demande = await lireDemandeParCommande(prisma, acces.commandeId);

  if (demande !== null) {
    return { statut: "DEJA_DEPOSEE", statutDemande: demande.statut };
  }

  const echeance = echeanceDe(commande.livreA);

  if (echeance === null) {
    return { statut: "AVANT_RECEPTION" };
  }

  if (Date.now() >= echeance.finInclusive.getTime()) {
    return { statut: "EXPIREE", jourLimite: echeance.jourLimite };
  }

  return { statut: "OUVERTE", jourLimite: echeance.jourLimite };
}

/**
 * L'echeance d'une commande, ou `null` tant que la reception est inconnue.
 *
 * `livreA` N'EST RENSEIGNE PAR PERSONNE TANT QUE LS-131 N'EXISTE PAS, et c'est
 * un etat, pas une panne : le repli en l'absence de suivi appartient a cette
 * story, qui ALLONGE le delai sans jamais l'avancer. Inventer ici une date de
 * reception depuis l'expedition serait la faute que `legal.md` nomme
 * explicitement, et elle eteindrait le droit trop tot.
 */
function echeanceDe(
  livreA: Date | null,
): ReturnType<typeof calculerEcheanceRetractation> | null {
  if (livreA === null) {
    return null;
  }

  try {
    return calculerEcheanceRetractation(livreA);
  } catch (erreur) {
    /*
     * UNE DATE ILLISIBLE NE FERME PAS LE DROIT. Le calcul ne leve que sur une
     * date invalide, cas qu'aucune ecriture normale ne produit ; le traiter
     * comme « reception inconnue » laisse le delai entier, tandis que le
     * traiter comme une expiration eteindrait un droit sur une anomalie
     * technique.
     */
    if (erreur instanceof DateReceptionInvalideError) {
      journaliser("error", "Date de livraison illisible, delai laisse ouvert", {
        motif: "DATE_INVALIDE",
      });

      return null;
    }

    throw erreur;
  }
}

/**
 * Depose une demande de retractation, etapes 3 a 5 du parcours 5.
 *
 * TOUT SE JOUE DANS UNE SEULE TRANSACTION, et l'ordre y est impose par le
 * critere 7 : la demande est PERSISTEE AVANT toute tentative d'envoi. Un email
 * indisponible ne doit jamais faire perdre une declaration, qui est un acte
 * juridique du client. L'accusé part par l'outbox d'ADR-033, deposee dans la
 * meme transaction : si elle echoue, tout est annule ensemble ; si elle
 * reussit, l'envoi est rejouable indefiniment par `expedierEnvoisEnAttente`.
 *
 * L'ACCUSE EST DONC DIFFERE, ET LE STATUT SUIT. La demande nait `DEPOSEE` et
 * passe `ACCUSEE` quand l'envoi part reellement, LS-135 portant la suite. Poser
 * `ACCUSEE` ici affirmerait qu'un accuse est parti alors qu'il n'est qu'en
 * attente, ce qu'aucune trace ne pourrait justifier devant un litige.
 *
 * L'UNICITE EST TENUE PAR LA BASE, `commande_id` etant unique. La garde
 * applicative existe pour rendre un refus lisible, la contrainte reste la
 * seconde ligne de defense : entre les deux, deux envois simultanes du
 * formulaire ne creeraient qu'une demande.
 */
export async function deposerRetractation(
  preuve: PreuveAcces,
  saisie: { motif: string | null },
  correlation?: Correlation,
): Promise<DepotRetractation> {
  const acces = await resoudreAcces(preuve, correlation);

  if (acces.statut === "REFUSE_ACCES") {
    return { statut: "REFUSE_ACCES" };
  }

  const commande = await lireCommandePourRetractation(prisma, {
    commandeId: acces.commandeId,
  });

  if (commande === null || !STATUTS_RETRACTABLES.has(commande.statut)) {
    return { statut: "REFUSE_ETAT_COMMANDE" };
  }

  const echeance = echeanceDe(commande.livreA);

  /*
   * HORS DELAI SEULEMENT QUAND L'ECHEANCE EST CONNUE ET PASSEE. Une reception
   * inconnue laisse le depot POSSIBLE : le droit court des la conclusion du
   * contrat, article L221-18, et refuser ici retirerait un droit ouvert.
   */
  if (echeance !== null && Date.now() >= echeance.finInclusive.getTime()) {
    return { statut: "REFUSE_HORS_DELAI", jourLimite: echeance.jourLimite };
  }

  const motif = normaliserMotif(saisie.motif);

  try {
    const demandeId = await prisma.$transaction(async (transaction) => {
      const demande = await creerDemandeRetractation(transaction, {
        commandeId: acces.commandeId,
        motifClient: motif,
      });

      /*
       * LE JETON EST CONSOMME DANS LA MEME TRANSACTION, regle L9 et L10. La
       * portee `RETRACTATION` marque une action FAITE, contrairement a
       * `DOCUMENT` qui reste consultable : le lien ne doit pas servir deux
       * fois. Hors transaction, un echec ulterieur laisserait un jeton brule
       * sur une demande inexistante.
       */
      if (acces.jetonId !== null) {
        await consommerJeton(transaction, acces.jetonId);
      }

      await deposerEnvoi(transaction, {
        commandeId: acces.commandeId,
        destinataire: commande.email,
        modele: "retractation-accusee",
        variables: {
          numero: commande.numero,
          // LE MOTIF NE PART PAS DANS L'EMAIL, il n'apporte rien au client qui
          // vient de l'ecrire et alourdirait une trace deja persistee.
          jourLimite: echeance?.jourLimite ?? "",
        },
        origine: "SYSTEME",
      });

      return demande.id;
    });

    journaliser(
      "info",
      "Demande de retractation deposee",
      { voie: preuve.voie },
      correlation,
    );

    return {
      statut: "DEPOSEE",
      demandeId,
      jourLimite: echeance?.jourLimite ?? null,
    };
  } catch (erreur) {
    /*
     * `P2002` EST LE DOUBLON, seconde ligne de defense de l'unicite. Il se
     * produit quand deux envois du formulaire se croisent, la garde lue plus
     * haut ayant vu la meme absence de demande. Le refus rendu est le meme que
     * celui de la garde, l'utilisateur ne devant pas distinguer les deux.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      return { statut: "REFUSE_DEJA_DEPOSEE" };
    }

    throw erreur;
  }
}

/**
 * Normalise le motif libre.
 *
 * UNE SAISIE VIDE VAUT `null` ET NON LA CHAINE VIDE : le champ est facultatif,
 * et deux representations de « rien » feraient diverger l'affichage cote
 * administration selon le chemin emprunte.
 */
function normaliserMotif(motif: string | null): string | null {
  if (motif === null) {
    return null;
  }

  const propre = motif.trim();

  if (propre.length === 0) {
    return null;
  }

  return propre.slice(0, MOTIF_LONGUEUR_MAX);
}
