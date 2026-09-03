/**
 * Traitement d'une demande de retractation, LS-135. Parcours 5, etapes 6 a 9.
 *
 * FACE ADMINISTRATION du parcours dont `retractation.ts` porte la face client :
 * celui-ci depose une demande, celui-ci la traite. Les deux ne partagent aucune
 * garde, et c'est voulu : le depot n'exige AUCUN role, le traitement exige
 * `ADMINISTRATRICE`.
 *
 * LE PIEGE CENTRAL, ET IL EST LEGAL : LES ETAPES 7a ET 7b NE SONT PAS UNE
 * SEQUENCE. L'article L221-24 rend le remboursement du au PREMIER des deux
 * faits, preuve d'expedition OU reception, « la date retenue etant celle du
 * premier de ces faits ».
 *
 * `EXPEDITION_PROUVEE` N'EST DONC PAS UN PASSAGE OBLIGE. Une demande va de
 * `RETOUR_ATTENDU` directement a `REMBOURSEMENT_EN_COURS` des que `recueA` est
 * renseigne, cas COURANT d'un retour depose en point relais sans numero de
 * suivi. Exiger `EXPEDITION_PROUVEE` avant de rembourser bloquerait ces
 * demandes indefiniment, sur un droit qui est du.
 *
 * NE JAMAIS RENSEIGNER `preuveExpeditionA` POUR DEBLOQUER UNE TRANSITION. Ce
 * champ prouve un fait devant un litige ; une ecriture de confort detruirait sa
 * valeur probatoire.
 *
 * LA RECEPTION N'A AUCUN STATUT, regle L12 et LS-41. Elle survient avant le
 * remboursement, pendant, ou trois semaines apres, et un statut `RECUE` ferait
 * regresser une demande deja `REMBOURSEE`.
 *
 * LE REMBOURSEMENT LUI-MEME N'EST PAS ICI : il appartient a `avoir.ts`, LS-128,
 * dont l'ordre prestataire-puis-base et la cle d'idempotence sont deja eprouves.
 * Ce service decide QUAND rembourser et COMBIEN, jamais COMMENT.
 */
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import type { FournisseurPaiement } from "@/integrations/stripe/fournisseur";
import {
  appliquerTransition,
  horodaterReception,
  lireDemandePourTraitement,
  lireMontantRemboursable,
  listerDemandes,
  listerRetoursJamaisRecus,
  type DemandeEnListe,
} from "@/repositories/retractation";
import { leverAlerteCritique } from "@/repositories/confirmation";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  exigerReauthentificationRecente,
  ReauthentificationRequiseError,
} from "@/services/reauthentification";
import {
  demanderRemboursement,
  type IssueDemandeRemboursement,
} from "@/services/avoir";

/**
 * Statuts depuis lesquels un remboursement peut partir.
 *
 * LES DEUX Y SONT, ET C'EST TOUT L'ARTICLE L221-24. `EXPEDITION_PROUVEE` couvre
 * le premier fait, `RETOUR_ATTENDU` couvre le second quand `recueA` vient
 * d'etre renseigne sans qu'aucune preuve n'ait ete fournie.
 *
 * RETIRER `RETOUR_ATTENDU` DE CETTE LISTE EST LA FAUTE QUE LA STORY NOMME : le
 * retour sans numero de suivi ne se rembourserait plus jamais.
 */
const STATUTS_REMBOURSABLES = ["RETOUR_ATTENDU", "EXPEDITION_PROUVEE"] as const;

/**
 * Le montant du sur une retractation, sous-total ET frais de port.
 *
 * LES FRAIS DE PORT SONT REMBOURSES EN ENTIER, AU TARIF REELLEMENT PAYE,
 * article L221-24 et `legal.md`. La faculte de l'alinea 4 de plafonner au mode
 * standard n'est PAS retenue : l'ecart est de 0,89 EUR et l'exercer imposerait
 * de designer un mode standard dans les conditions generales, sous peine de
 * retomber sur l'article L221-20 et ses douze mois.
 *
 * NE PAS PLAFONNER, NE PAS COMPARER A UN MODE STANDARD, NE PAS RECALCULER
 * DEPUIS LA CONFIGURATION COURANTE DES TARIFS : c'est le montant fige sur la
 * commande qui a ete paye, et lui seul.
 */
export type MontantDu = {
  sousTotalCentimes: number;
  fraisPortCentimes: number;
  totalCentimes: number;
};

/** Ce qu'une transition rend a l'ecran, jamais une exception. */
export type IssueTransition =
  | { statut: "APPLIQUEE" }
  /** Aucune demande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /**
   * La demande n'est pas dans un etat d'ou cette transition part.
   *
   * `statutActuel` EST RENDU pour que l'ecran dise ou en est reellement la
   * demande, plutot qu'un refus sans explication : l'appelante est
   * l'exploitante, qui doit savoir quoi faire ensuite.
   */
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: string }
  /** Un refus exige son motif, regle L2. */
  | { statut: "MOTIF_REQUIS" };

/** Ce que l'horodatage de la reception rend. */
export type IssueReception =
  | { statut: "HORODATEE" }
  | { statut: "INTROUVABLE" }
  /** `recueA` est deja renseigne, un colis ne se recoit qu'une fois. */
  | { statut: "DEJA_RECUE" };

/**
 * Ce qu'une demande de remboursement de retractation rend.
 *
 * ELLE ELARGIT `IssueDemandeRemboursement` plutot que de la redire : les issues
 * du remboursement lui-meme, gardes comprises, viennent de `avoir.ts` et ne se
 * recopient pas. Une copie divergerait au premier cas ajoute.
 */
export type IssueRemboursementRetractation =
  | IssueDemandeRemboursement
  | { statut: "INTROUVABLE" }
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: string }
  /**
   * Ni preuve d'expedition ni reception : aucun des deux faits de L221-24.
   *
   * C'EST LE SEUL CAS OU LE REMBOURSEMENT SE DIFFERE LEGITIMEMENT, cas d'erreur
   * du parcours 5. Il ne se confond pas avec `STATUT_INCOMPATIBLE` : la demande
   * est au bon endroit du cycle, c'est le fait declencheur qui manque.
   */
  | { statut: "AUCUN_FAIT_DECLENCHEUR" }
  /** Le montant demande depasse ce que la commande a rapporte. */
  | { statut: "MONTANT_SUPERIEUR_AU_DU"; montantDuCentimes: number };

/**
 * Nombre de demandes affichees dans l'administration.
 *
 * LA VALEUR IMPORTE MOINS QUE LE FAIT DE DIRE QU'ELLE EXISTE. LS-163 releve le
 * defaut sur les listes voisines : plafonner sans le signaler fait afficher un
 * compte faux, et l'exploitante croit avoir tout traite. `tronquee` porte donc
 * l'information jusqu'a l'ecran.
 */
export const LIMITE_LISTE_DEMANDES = 100;

/** Ce que la liste d'administration rend. */
export type ListeDemandes = {
  demandes: DemandeEnListe[];
  /** Vrai si des demandes existent au-dela de la limite affichee. */
  tronquee: boolean;
};

/**
 * Les demandes a traiter, la plus ancienne d'abord.
 *
 * ELLE N'EXIGE AUCUN ROLE, et ce n'est pas un oubli : la page appelle
 * `exigerAdministratrice` avant tout rendu, comme les six autres ecrans
 * d'administration. Ajouter une garde ici la dupliquerait sans fermer aucun
 * chemin, une lecture ne produisant aucun effet.
 */
export async function listerDemandesRetractation(): Promise<ListeDemandes> {
  const lues = await listerDemandes(prisma, LIMITE_LISTE_DEMANDES);

  return {
    demandes: lues.slice(0, LIMITE_LISTE_DEMANDES),
    tronquee: lues.length > LIMITE_LISTE_DEMANDES,
  };
}

/**
 * Accuse reception de la declaration, etape 5, et ouvre l'attente du retour.
 *
 * LES DEUX ETAPES SONT UNE SEULE TRANSITION, `DEPOSEE` vers `RETOUR_ATTENDU`,
 * et `ACCUSEE` reste un etat traverse plutot qu'un palier : l'accuse part par
 * l'outbox au depot, LS-134, et l'exploitante n'a rien a faire entre les deux.
 *
 * `retourAttenduA` EST POSE ICI parce qu'il est la BASE DU SEUIL D'ALERTE,
 * regle L8 et L13. Sans lui, aucune anciennete n'est calculable et le colis
 * jamais revenu reste invisible.
 */
export async function ouvrirAttenteRetour(
  demandeId: string,
  correlation?: Correlation,
): Promise<IssueTransition> {
  const demande = await lireDemandePourTraitement(prisma, demandeId);

  if (demande === null) {
    return { statut: "INTROUVABLE" };
  }

  const { appliquee } = await appliquerTransition(prisma, {
    demandeId,
    statutsAdmis: ["DEPOSEE", "ACCUSEE"],
    statutCible: "RETOUR_ATTENDU",
    champs: { retourAttenduA: new Date() },
  });

  if (!appliquee) {
    return { statut: "STATUT_INCOMPATIBLE", statutActuel: demande.statut };
  }

  journaliser(
    "info",
    "Retour attendu sur une retractation",
    { demande: demandeId },
    correlation,
  );

  return { statut: "APPLIQUEE" };
}

/**
 * Enregistre la preuve d'expedition fournie par le client, etape 7a.
 *
 * LA PREUVE EST DECLARATIVE, ET CELA NE CHANGE RIEN A L'OBLIGATION. Un numero
 * de suivi fourni par le client suffit a faire courir le remboursement,
 * l'exploitante n'ayant pas a le verifier aupres du transporteur avant de
 * rembourser. Le litige sur un retour jamais expedie se traite APRES, il ne
 * justifie pas de retenir une somme due.
 *
 * CETTE ETAPE EST FACULTATIVE. Son absence n'empeche aucun remboursement des
 * lors que `recueA` est renseigne.
 */
export async function enregistrerPreuveExpedition(
  demandeId: string,
  preuve: string,
  correlation?: Correlation,
): Promise<IssueTransition> {
  const demande = await lireDemandePourTraitement(prisma, demandeId);

  if (demande === null) {
    return { statut: "INTROUVABLE" };
  }

  const { appliquee } = await appliquerTransition(prisma, {
    demandeId,
    statutsAdmis: ["RETOUR_ATTENDU"],
    statutCible: "EXPEDITION_PROUVEE",
    champs: {
      preuveExpeditionRetour: preuve,
      preuveExpeditionA: new Date(),
    },
  });

  if (!appliquee) {
    return { statut: "STATUT_INCOMPATIBLE", statutActuel: demande.statut };
  }

  journaliser(
    "info",
    "Preuve d'expedition enregistree",
    { demande: demandeId },
    correlation,
  );

  return { statut: "APPLIQUEE" };
}

/**
 * Constate la reception du colis, etape 7b, SANS TOUCHER AU STATUT.
 *
 * AUCUN STATUT N'EST ECRIT ICI, ET C'EST LA REGLE L12. La fonction est
 * appelable sur une demande `RETOUR_ATTENDU`, `EXPEDITION_PROUVEE`,
 * `REMBOURSEMENT_EN_COURS` OU `REMBOURSEE` : le colis peut arriver a n'importe
 * quel moment, y compris trois semaines apres le versement.
 *
 * NE PAS « COMPLETER » CETTE FONCTION PAR UNE TRANSITION. Poser un statut
 * ferait disparaitre une demande remboursee de toute liste filtree sur le
 * statut, et LS-41 a supprime `RECUE` precisement pour cela.
 *
 * ELLE NE DECLENCHE AUCUN MOUVEMENT DE STOCK, ADR-030 et regle S8. La
 * reintegration depend de l'ETAT REEL de la piece, que seule l'exploitante
 * constate : un bijou revenu casse ne retourne pas au catalogue. L'ajustement
 * reste son geste, avec son motif.
 */
export async function constaterReception(
  demandeId: string,
  correlation?: Correlation,
): Promise<IssueReception> {
  const demande = await lireDemandePourTraitement(prisma, demandeId);

  if (demande === null) {
    return { statut: "INTROUVABLE" };
  }

  const { appliquee } = await horodaterReception(prisma, {
    demandeId,
    recueA: new Date(),
  });

  if (!appliquee) {
    return { statut: "DEJA_RECUE" };
  }

  journaliser(
    "info",
    "Retour recu sur une retractation",
    { demande: demandeId, statut: demande.statut },
    correlation,
  );

  return { statut: "HORODATEE" };
}

/**
 * Le montant du sur une retractation, pour pre-remplir l'ecran.
 *
 * IL PRE-REMPLIT, IL N'IMPOSE PAS. Arbitrage de Christophe du 3 septembre 2026 :
 * le cas nominal ne demande aucun calcul mental, et une piece revenue abimee
 * fonde une reduction AVANT versement, que le modele conceptuel autorise
 * explicitement.
 *
 * IL N'EST PAS LA BORNE DE SECURITE. Celle-ci vit dans `avoir.ts`, sous verrou
 * de la ligne de facture : ce montant-ci sert l'affichage, et le service de
 * remboursement refuse de lui-meme ce qui depasse le restant remboursable.
 */
export async function lireMontantDu(
  commandeId: string,
): Promise<MontantDu | null> {
  const montants = await lireMontantRemboursable(prisma, commandeId);

  if (montants === null) {
    return null;
  }

  return {
    sousTotalCentimes: montants.sousTotalCentimes,
    fraisPortCentimes: montants.fraisPortCentimes,
    /*
     * LE TOTAL DE LA COMMANDE FAIT FOI, jamais une somme recalculee ici. C28
     * garantit en base que `total = sous_total + frais_port + taxe`, et
     * refaire l'addition produirait une seconde verite a garder d'accord.
     */
    totalCentimes: montants.totalCentimes,
  };
}

/**
 * Rembourse une retractation et emet l'avoir, etape 8.
 *
 * ELLE PORTE LES DEUX GARDES ELLE-MEME, ET NON PAR DELEGATION. Une premiere
 * version se contentait d'appeler `demanderRemboursement`, qui les porte deja :
 * `verifier-actions-sensibles.sh` l'a refuse, et il avait raison sur le fond.
 * La marque se pose sur la fonction qui DECIDE qu'un remboursement doit partir,
 * et le controle cherche l'appel dans le corps de CETTE fonction, jamais chez
 * son appelee. Sans cela, un futur appelant atteindrait cette fonction en
 * franchissant une seule des deux gardes.
 *
 * L'ORDRE DES DEUX EST IMPOSE, motif de LS-89 et de LS-160 : le role D'ABORD,
 * la fraicheur ENSUITE. L'inverse proposerait une reauthentification a
 * quelqu'un qui n'a de toute facon aucun droit sur cet ecran, ce qui lui
 * apprendrait que l'ecran existe.
 *
 * LA GARDE DE ROLE PRECEDE AUSSI TOUTE LECTURE, et pour un motif propre a ce
 * service : ses refus metier NOMMENT l'etat reel de la demande, deliberement,
 * l'appelante etant l'exploitante. Lire avant de garder en ferait un oracle.
 *
 * LA DOUBLE VERIFICATION AVEC `demanderRemboursement` EST ASSUMEE : les deux
 * fonctions ferment deux chemins distincts vers le meme effet, exactement comme
 * une Server Action redouble la garde de son service.
 *
 * @sensible REMBOURSEMENT
 *
 * L'ORDRE EST IMPOSE : LE REMBOURSEMENT D'ABORD, LE STATUT ENSUITE. Passer
 * `REMBOURSEE` avant que l'argent ne parte afficherait un remboursement qui
 * n'a pas eu lieu, et une panne du prestataire laisserait une demande close
 * sur un versement jamais fait.
 *
 * `REMBOURSEMENT_EN_COURS` N'EST PAS UN PALIER TENU EN BASE PENDANT L'APPEL, et
 * c'est delibere : l'ecrire avant l'appel obligerait a le defaire sur echec,
 * donc a une transition inverse qui ferait regresser un statut. La demande
 * reste dans son statut de depart tant que l'argent n'est pas parti.
 */
export async function rembourserRetractation(
  enTetes: Headers,
  parametres: {
    demandeId: string;
    montantCentimes: number;
    fournisseur: FournisseurPaiement;
    referenceDemande: string;
  },
  correlation?: Correlation,
): Promise<IssueRemboursementRetractation> {
  /*
   * LA GARDE DE ROLE EST LA PREMIERE INSTRUCTION, AVANT TOUTE LECTURE, et une
   * premiere version l'avait placee apres : le test negatif de securite l'a
   * revele en recevant `STATUT_INCOMPATIBLE` la ou `SESSION_ABSENTE` etait
   * attendu.
   *
   * CE N'ETAIT PAS COSMETIQUE. Les refus metier de ce service NOMMENT l'etat
   * reel de la demande, deliberement, l'appelante etant l'exploitante. Lire
   * avant de garder faisait de ces messages un ORACLE : un appelant sans
   * session distinguait une demande `DEPOSEE` d'une demande `REMBOURSEE`, et
   * un identifiant inexistant d'un identifiant valide.
   *
   * L'ORDRE EST CELUI DE `avoir.ts` ET DE `actions.ts` DE L'EXPEDITION, ou il
   * est documente pour ce motif exact.
   */
  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }

  try {
    await exigerReauthentificationRecente(enTetes, "REMBOURSEMENT");
  } catch (erreur) {
    if (erreur instanceof ReauthentificationRequiseError) {
      return { statut: "REAUTHENTIFICATION_REQUISE" };
    }
    /*
     * `AutorisationRefuseeError` PEUT AUSSI SORTIR D'ICI, la session ayant pu
     * etre revoquee entre les deux gardes. Une session disparue est une session
     * absente, jamais une panne.
     */
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }

  const demande = await lireDemandePourTraitement(prisma, parametres.demandeId);

  if (demande === null) {
    return { statut: "INTROUVABLE" };
  }

  if (!STATUTS_REMBOURSABLES.includes(demande.statut as never)) {
    return { statut: "STATUT_INCOMPATIBLE", statutActuel: demande.statut };
  }

  /*
   * L'UN OU L'AUTRE SUFFIT, ARTICLE L221-24. Exiger les deux, ou exiger la
   * preuve seule, bloquerait le retour depose en relais sans numero de suivi.
   * Exiger la reception seule rouvrirait le defaut que LS-41 a ferme, un colis
   * lent ou perdu gelant un remboursement du depuis la preuve.
   */
  if (demande.recueA === null && demande.preuveExpeditionA === null) {
    return { statut: "AUCUN_FAIT_DECLENCHEUR" };
  }

  const montantDu = await lireMontantDu(demande.commandeId);

  if (montantDu === null) {
    return { statut: "INTROUVABLE" };
  }

  /*
   * ON NE REMBOURSE JAMAIS PLUS QUE CE QUI A ETE PAYE. La borne qui protege
   * l'argent vit dans `avoir.ts`, sous verrou ; celle-ci refuse tot une saisie
   * manifestement fausse, une virgule mal placee par exemple, et le fait avec
   * un message que l'exploitante comprend.
   */
  if (parametres.montantCentimes > montantDu.totalCentimes) {
    return {
      statut: "MONTANT_SUPERIEUR_AU_DU",
      montantDuCentimes: montantDu.totalCentimes,
    };
  }

  const issue = await demanderRemboursement(
    enTetes,
    {
      commandeId: demande.commandeId,
      montantCentimes: parametres.montantCentimes,
      motif: `Retractation, article L221-18`,
      fournisseur: parametres.fournisseur,
      referenceDemande: parametres.referenceDemande,
    },
    correlation,
  );

  if (issue.statut !== "REMBOURSE") {
    return issue;
  }

  /*
   * L'ARGENT EST PARTI, LA DEMANDE SUIT. `montantRembourseCentimes` porte ce
   * que le PRESTATAIRE A RENDU, jamais ce qui a ete demande : c'est l'argent
   * reellement sorti qui fait foi, meme regle que le montant de l'avoir.
   */
  await appliquerTransition(prisma, {
    demandeId: parametres.demandeId,
    statutsAdmis: STATUTS_REMBOURSABLES,
    statutCible: "REMBOURSEE",
    champs: { montantRembourseCentimes: issue.montantCentimes },
  });

  journaliser(
    "info",
    "Retractation remboursee",
    {
      demande: parametres.demandeId,
      montantCentimes: issue.montantCentimes,
      avoir: issue.avoirId,
    },
    correlation,
  );

  return issue;
}

/**
 * Refuse une demande, avec son motif obligatoire, regle L2.
 *
 * LE MOTIF EST EXIGE PARCE QU'UN REFUS SE MOTIVE AU CAS PAR CAS, jamais par une
 * exclusion de categorie : l'article L221-28 fonde les exceptions sur la
 * caracteristique CONCRETE du bien, et « les boucles d'oreilles sont exclues »
 * ne s'ecrit nulle part, regle L3.
 *
 * LE REFUS EST RARE ET IL SE JUSTIFIE. L'article L221-20 porte le delai a douze
 * mois quand l'information est mauvaise : mieux vaut accepter une demande
 * douteuse que refuser une demande legitime.
 */
export async function refuserRetractation(
  demandeId: string,
  motifDecision: string,
  correlation?: Correlation,
): Promise<IssueTransition> {
  const motif = motifDecision.trim();

  /*
   * LA GARDE PRECEDE LA LECTURE, et le refus est rendu sans toucher la base :
   * un motif vide est une erreur de saisie, pas un etat de la demande.
   */
  if (motif.length === 0) {
    return { statut: "MOTIF_REQUIS" };
  }

  const demande = await lireDemandePourTraitement(prisma, demandeId);

  if (demande === null) {
    return { statut: "INTROUVABLE" };
  }

  /*
   * UNE DEMANDE DEJA REMBOURSEE NE SE REFUSE PLUS. L'argent est parti : la
   * refuser produirait un document qui contredit un versement reel.
   */
  const { appliquee } = await appliquerTransition(prisma, {
    demandeId,
    statutsAdmis: ["DEPOSEE", "ACCUSEE", "RETOUR_ATTENDU"],
    statutCible: "REFUSEE",
    champs: { motifDecision: motif },
  });

  if (!appliquee) {
    return { statut: "STATUT_INCOMPATIBLE", statutActuel: demande.statut };
  }

  journaliser(
    "info",
    "Retractation refusee",
    { demande: demandeId },
    correlation,
  );

  return { statut: "APPLIQUEE" };
}

/**
 * Delai au-dela duquel un colis jamais revenu devient une alerte, regle L13.
 *
 * TRENTE JOURS DEPUIS `retourAttenduA`. Le client dispose de quatorze jours
 * pour renvoyer le bien, article L221-23, et un acheminement lent s'ajoute :
 * un seuil plus court alerterait sur des retours normalement en cours, et
 * l'alerte perdrait son sens a force de se declencher pour rien.
 */
export const SEUIL_RETOUR_JAMAIS_RECU_JOURS = 30;

/**
 * Alerte sur les pieces remboursees qui ne sont jamais revenues, regle L13.
 *
 * CE QUI EST SIGNALE EST UN ECART DE STOCK, pas un impaye : la piece est sortie
 * du stock, l'argent est rendu, et rien n'explique ou est le bijou. Sans cette
 * alerte l'ecart reste invisible, le journal des mouvements montrant une vente
 * web et un avoir total sans le moindre retour.
 *
 * ELLE N'ECRIT AUCUN MOUVEMENT DE STOCK, ADR-030. Un colis peut arriver trois
 * semaines plus tard : ajuster automatiquement ferait disparaitre une piece qui
 * revient ensuite, et l'ajustement reste une decision de l'exploitante, avec
 * son motif.
 *
 * ELLE EST IDEMPOTENTE PAR SON EFFET, jamais par un drapeau : `AlerteCritique`
 * est acquittable et jamais supprimee, regle E7, et un second passage sur la
 * meme demande produirait une seconde ligne. Le declenchement quotidien la
 * borne, et l'acquittement fait le reste cote administration.
 */
export async function alerterRetoursJamaisRecus(
  correlation?: Correlation,
): Promise<{ alertees: number }> {
  const seuil = new Date(
    Date.now() - SEUIL_RETOUR_JAMAIS_RECU_JOURS * 24 * 60 * 60 * 1000,
  );

  const demandes = await listerRetoursJamaisRecus(prisma, { avant: seuil });

  for (const demande of demandes) {
    await leverAlerteCritique(prisma, {
      type: "RETOUR_JAMAIS_RECU",
      message:
        `La demande de retractation ${demande.id} est remboursee depuis plus ` +
        `de ${SEUIL_RETOUR_JAMAIS_RECU_JOURS} jours et le colis n'est jamais ` +
        `revenu. La piece est sortie du stock sans y rentrer : ecart a traiter ` +
        `avec le transporteur, aucun mouvement de stock n'a ete ecrit.`,
      typeCible: "DemandeRetractation",
      idCible: demande.id,
    });
  }

  if (demandes.length > 0) {
    journaliser(
      "warn",
      "Retours jamais recus signales",
      { nombre: demandes.length },
      correlation,
    );
  }

  return { alertees: demandes.length };
}
