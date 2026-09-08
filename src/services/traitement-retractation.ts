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
import { Prisma } from "@/generated/prisma/client";
import type { EtatPieceRetournee } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import type { FournisseurPaiement } from "@/integrations/stripe/fournisseur";
import {
  appliquerTransition,
  constaterEtatPiece as constaterEtatPieceDepot,
  horodaterReception,
  lireDemandePourTraitement,
  lireMontantRemboursable,
  listerDemandes,
  listerRetoursJamaisRecus,
  type DemandeEnListe,
} from "@/repositories/retractation";
import { leverAlerteCritique } from "@/repositories/confirmation";
import {
  creerMouvement,
  incrementerStockPhysique,
} from "@/repositories/mouvement-stock";
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
      /*
       * L'AVOIR EST RATTACHE A SA DEMANDE, LS-174.
       *
       * `Avoir.demandeRetractationId` existait au schema depuis LS-49 et
       * n'etait jamais ecrit : le numero du document qui corrige la facture
       * n'apparaissait que dans la region live suivant le remboursement, et
       * disparaissait au premier rechargement. Rapprocher un remboursement de
       * son avoir devant une reclamation obligeait a passer par le detail de la
       * commande.
       *
       * L'IDENTIFIANT VIENT D'ICI ET NON D'UNE DERIVATION. Une facture peut
       * porter PLUSIEURS avoirs, un remboursement commercial puis une
       * retractation : c'est le service qui traite la demande qui sait lequel
       * il vient d'emettre, et lui seul.
       */
      demandeRetractationId: parametres.demandeId,
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

/** Ce que le constat de l'etat de la piece rend a l'ecran, jamais une exception. */
export type IssueConstatEtatPiece =
  | { statut: "CONSTATEE" }
  | { statut: "INTROUVABLE" }
  /** Un constat exige son motif, comme toute compensation, S14. */
  | { statut: "MOTIF_REQUIS" }
  /**
   * L'etat de cette piece a deja ete constate, et il ne se reecrit pas.
   *
   * IL COUVRE LES DEUX ETATS, et c'est ce qui le rend indispensable :
   * `mouvement_compense_unique` ne garde QUE la remise en vente, la perte
   * n'ecrivant aucun mouvement. Sans le refus applicatif, une piece declaree
   * cassee pourrait etre requalifiee en remise en vente.
   */
  | { statut: "DEJA_CONSTATE" }
  /**
   * La variante a ete archivee : le stock ne peut pas remonter, LS-173.
   *
   * LE CAS EST ORDINAIRE. Une piece unique vendue n'a plus de reservation
   * active, donc `archiverVariante` l'accepte. Si le client se retracte
   * ensuite, la remise en vente heurterait le filtre `archivee_a IS NULL` de
   * `incrementerStockPhysique` : l'UPDATE ne toucherait aucune ligne pendant
   * que le mouvement s'ecrirait, et le journal divergerait de la colonne.
   */
  | { statut: "VARIANTE_ARCHIVEE" }
  /** Ni session ni role d'administration. */
  | { statut: "SESSION_ABSENTE" };

/**
 * Constate l'etat REEL de la piece retournee, ETAPE 9 DU PARCOURS 5, LS-173.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE GESTE EXISTE, ET POURQUOI IL N'EST PAS AUTOMATIQUE.
 *
 * `recueA` dit qu'un colis est ARRIVE, jamais dans quel etat. La regle S8 lie
 * la reintegration de stock au retour PHYSIQUE et a l'etat REEL de la piece :
 * un bijou revenu casse ne retourne pas au catalogue. `constaterReception`
 * n'ecrit donc deliberement aucun mouvement, et un test le verifie.
 *
 * CE SERVICE EST LE CHEMIN QUI MANQUAIT. Sans lui, une piece revenue intacte
 * restait sortie du stock indefiniment : `corrigerMouvement` refuse les ventes
 * web, a juste titre, un `RETOUR` y incrementerait le stock sans rien dire de
 * la commande ni de la facture.
 * ------------------------------------------------------------------
 *
 * LA REMISE EN VENTE COMPENSE LA VENTE WEB, ADR-030. Le `compenseId` designe le
 * mouvement d'origine, donc l'index `mouvement_compense_unique` rend le refus
 * de double remise en vente STRUCTUREL : deux clics simultanes ne peuvent pas
 * passer tous les deux, la ou un controle applicatif les laisserait passer
 * entre son `SELECT` et son `INSERT`.
 *
 * LA PERTE N'ECRIT AUCUN MOUVEMENT, et elle ecrit quand meme UN ETAT. C'est
 * toute la raison d'etre de `PERTE_CONSTATEE` : sans elle, une piece declaree
 * perdue serait indistinguable d'une demande jamais traitee, les deux ne
 * portant aucune ligne au journal.
 *
 * IL NE TOUCHE PAS AU STATUT DE LA DEMANDE, regle L12, exactement comme la
 * reception. Le colis arrive quand il arrive, y compris trois semaines apres le
 * remboursement, et poser un statut ferait regresser une demande `REMBOURSEE`.
 *
 * IL N'EXIGE PAS `recueA`, ET C'EST DELIBERE. La regle L13 decrit la piece
 * JAMAIS revenue : la declarer perdue est le seul geste qui solde cet ecart, et
 * exiger une reception le fermerait.
 *
 * AUCUNE MARQUE DE REAUTHENTIFICATION ICI, ET CE N'EST PAS UN OUBLI.
 *
 * LA MARQUE N'EST PAS CITEE DANS CE COMMENTAIRE, deliberement :
 * `verifier-actions-sensibles.sh` la detecterait et la lirait comme une marque
 * sans famille. Motif « le hook bloque son explication », deja rencontre ici.
 *
 * Les quatre familles
 * declarees par `FamilleActionSensible` couvrent le vol de compte et la sortie
 * d'ARGENT : identifiants, donnees clients, remboursement, parametres de la
 * boutique. Un constat d'etat de stock n'en releve d'aucune, et lui imposer une
 * reauthentification ferait ressaisir le mot de passe sur un geste courant, ce
 * qui use la protection la ou elle compte vraiment.
 *
 * LA GARDE DE ROLE SUFFIT DONC ICI, et elle est portee par cette fonction
 * elle-meme plutot que deleguee : une Server Action s'invoque directement,
 * motif de LS-89.
 */
export async function constaterEtatPiece(
  enTetes: Headers,
  parametres: {
    demandeId: string;
    etat: EtatPieceRetournee;
    motif: string;
  },
  correlation?: Correlation,
): Promise<IssueConstatEtatPiece> {
  /*
   * LA GARDE DE ROLE EST LA PREMIERE INSTRUCTION, AVANT TOUTE LECTURE, meme
   * motif que `rembourserRetractation` : les refus de ce service NOMMENT l'etat
   * reel de la demande, deliberement, l'appelante etant l'exploitante. Lire
   * avant de garder en ferait un oracle pour un appelant sans session.
   */
  let acteurId: string;

  try {
    /*
     * L'IDENTITE VIENT DE LA GARDE ELLE-MEME, jamais d'un second appel ni d'un
     * parametre : `acteurId` alimente le mouvement de stock, et une valeur
     * venue de l'appelant permettrait d'attribuer une ecriture a quelqu'un
     * d'autre. Invariant 2.
     */
    ({ utilisateurId: acteurId } = await exigerAdministratrice(enTetes));
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }

  const motif = parametres.motif.trim();

  if (motif.length === 0) {
    return { statut: "MOTIF_REQUIS" };
  }

  const demande = await lireDemandePourTraitement(prisma, parametres.demandeId);

  if (demande === null) {
    return { statut: "INTROUVABLE" };
  }

  if (demande.etatPieceRetournee !== null) {
    return { statut: "DEJA_CONSTATE" };
  }

  const issue = await reintegrerPieceRetournee({
    demandeId: parametres.demandeId,
    commandeId: demande.commandeId,
    etat: parametres.etat,
    motif,
    acteurId,
  });

  if (issue !== null) {
    return issue;
  }

  journaliser(
    "info",
    "Etat de la piece retournee constate",
    {
      demande: parametres.demandeId,
      etat: parametres.etat,
      /*
       * LE STATUT EST JOURNALISE, PAS MODIFIE. Il dit a quel moment du cycle le
       * colis a ete constate, information utile devant un ecart d'inventaire.
       */
      statutDemande: demande.statut,
    },
    correlation,
  );

  return { statut: "CONSTATEE" };
}

/**
 * Levee quand la variante a compenser est archivee, LS-173.
 *
 * UNE EXCEPTION ET NON UN `return`, ET LA DISTINCTION EST CRITIQUE. Dans un
 * `prisma.$transaction`, seule une exception annule : un `return` VALIDE la
 * transaction, donc l'etat constate serait committe sans son mouvement de
 * stock. Motif « un return valide la transaction », en fiche sur ce depot.
 */
class VarianteArchiveeError extends Error {
  constructor() {
    super("Variante archivee");
    this.name = "VarianteArchiveeError";
  }
}

/**
 * Ecrit l'etat, et le mouvement compensateur quand la piece revient au
 * catalogue. Rend `null` en cas de succes, un refus sinon.
 *
 * TOUT EN UNE SEULE TRANSACTION, et c'est indispensable : l'etat constate et le
 * mouvement de stock doivent apparaitre ou disparaitre ENSEMBLE. Un etat ecrit
 * sans son mouvement laisserait une piece marquee remise en vente qui n'est
 * jamais rentree au stock, et le journal ne permettrait pas de le voir.
 */
async function reintegrerPieceRetournee(parametres: {
  demandeId: string;
  commandeId: string;
  etat: EtatPieceRetournee;
  motif: string;
  acteurId: string;
}): Promise<IssueConstatEtatPiece | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { appliquee } = await constaterEtatPieceDepot(tx, {
        demandeId: parametres.demandeId,
        etat: parametres.etat,
        constateA: new Date(),
      });

      /*
       * LA CLAUSE CONDITIONNELLE DU DEPOT A REFUSE : un constat concurrent est
       * passe entre la lecture ci-dessus et cette ecriture. Le refus vient donc
       * de la base, pas seulement de la lecture prealable.
       */
      if (!appliquee) {
        return { statut: "DEJA_CONSTATE" as const };
      }

      /*
       * UNE PERTE S'ARRETE ICI. Aucun mouvement, aucun stock touche : c'est
       * l'etat qui est enregistre, et lui seul. Regle S8.
       */
      if (parametres.etat === "PERTE_CONSTATEE") {
        return null;
      }

      /*
       * TOUTES LES VENTES DE LA COMMANDE, ET NON LA PREMIERE.
       *
       * ------------------------------------------------------------------
       * UN PANIER A DEUX BIJOUX PRODUIT DEUX MOUVEMENTS `VENTE_WEB`, un par
       * ligne : `webhook-paiement.ts` boucle sur les lignes et filtre sur
       * `varianteId`, donc la cle d'idempotence `mouvement_vente_web_unique`
       * porte bien `(commandeId, varianteId)` et non la commande seule.
       *
       * UNE PREMIERE VERSION EMPLOYAIT `findFirst`. Une retractation sur une
       * commande a deux articles n'aurait alors reintegre QU'UNE piece, et la
       * seconde serait restee sortie du stock indefiniment : exactement le
       * defaut que cette story vient fermer, reproduit a l'interieur d'elle.
       *
       * LA RETRACTATION PORTE SUR TOUTE LA COMMANDE, et non sur une ligne :
       * `DemandeRetractation.commandeId` est UNIQUE au schema, il n'existe
       * aucune demande partielle. Compenser toutes les lignes est donc le seul
       * comportement coherent avec le modele.
       * ------------------------------------------------------------------
       */
      const ventes = await tx.mouvementStock.findMany({
        where: { commandeId: parametres.commandeId, type: "VENTE_WEB" },
        select: { id: true, varianteId: true, quantite: true },
      });

      /*
       * AUCUNE VENTE WEB A COMPENSER. Le cas existe : une commande dont le
       * paiement n'a jamais ete confirme ne porte aucun mouvement. Rien a
       * reintegrer, l'etat reste ecrit et dit ce qui a ete constate.
       */
      for (const vente of ventes) {
        /*
         * LE SIGNE EST L'INVERSE DE LA VENTE, jamais une constante. La vente
         * ayant ete ecrite en negatif, la compensation est positive, et la
         * somme du journal retombe a zero sur une commande retractee.
         */
        const quantiteCompensatrice = -vente.quantite;

        /*
         * LE RETOUR DE L'UPDATE EST LU, ET C'EST TOUT L'OBJET DE CE BLOC.
         *
         * `incrementerStockPhysique` porte `AND archivee_a IS NULL` dans son
         * `WHERE` et rend le nombre de lignes touchees. L'ignorer laissait
         * ecrire le mouvement `RETOUR` sur une variante archivee sans que le
         * stock remonte : le journal totalisait zero sur la commande, donc
         * l'inventaire reconstruit annoncait une piece en stock quand
         * `quantite_physique` disait zero. Defaut trouve par
         * `ls-critical-reviewer` le 8 septembre 2026.
         *
         * ET LE GESTE ETAIT BRULE : l'etat pose et l'index
         * `mouvement_compense_unique` consomme, la piece n'etait plus
         * reintegrable par ce chemin.
         */
        const lignes = await incrementerStockPhysique(tx, {
          varianteId: vente.varianteId,
          quantite: quantiteCompensatrice,
        });

        if (lignes === 0) {
          throw new VarianteArchiveeError();
        }

        await creerMouvement(tx, {
          varianteId: vente.varianteId,
          commandeId: parametres.commandeId,
          type: "RETOUR",
          quantite: quantiteCompensatrice,
          motif: parametres.motif,
          acteurId: parametres.acteurId,
          compenseId: vente.id,
        });
      }

      return null;
    });
  } catch (erreur) {
    /*
     * LA VARIANTE ARCHIVEE EST UN REFUS METIER, jamais une panne : rien n'a
     * ete ecrit, la transaction ayant ete annulee par l'exception.
     */
    if (erreur instanceof VarianteArchiveeError) {
      return { statut: "VARIANTE_ARCHIVEE" };
    }

    /*
     * `P2002` SUR `mouvement_compense_unique` EST UN REFUS METIER, ADR-030 :
     * deux remises en vente simultanees ont vise la meme vente. Meme traduction
     * que `corrigerMouvement`, et c'est la base qui garantit, jamais la lecture.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      return { statut: "DEJA_CONSTATE" };
    }
    throw erreur;
  }
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
