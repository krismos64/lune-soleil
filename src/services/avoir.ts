/**
 * Remboursement et emission de l'avoir. LS-128, etapes 4 a 6 du parcours 4.
 *
 * L'ORDRE EST LE COEUR DE CE SERVICE : le prestataire D'ABORD, la base ENSUITE.
 * Un avoir ne nait que si l'argent est REELLEMENT parti, cas d'erreur du
 * parcours 4. L'ordre inverse produirait un document comptable opposable pour
 * un remboursement refuse, et seul un second avoir pourrait le corriger,
 * invariant 4.
 *
 * L'APPEL RESEAU EST DONC HORS TRANSACTION, et ce n'est pas negociable. Le
 * tenir dedans garderait un verrou de ligne pendant tout l'aller-retour, et son
 * echec effacerait par annulation des ecritures deja faites. Meme regle que la
 * session de paiement, `database.md`.
 *
 * AUCUN REMBOURSEMENT AUTOMATIQUE, ADR-032. Ce service s'appelle depuis
 * l'administration, sur un geste de l'exploitante, jamais depuis un webhook ni
 * une tache planifiee : le chemin qui decide « cet argent doit repartir » est
 * celui qui, s'il se trompe, rend l'argent d'une commande valide.
 *
 * LA REINTEGRATION DE STOCK N'EST PAS ICI, ADR-030 et etape 7 du parcours 4 :
 * elle depend du RETOUR REEL de la piece, jamais du remboursement seul. Un
 * client rembourse qui garde le bijou ne fait pas revenir la piece en stock.
 */
import { prisma } from "@/lib/prisma";
import { journaliser, journaliserErreur } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import {
  PrestatairePaiementIndisponibleError,
  type FournisseurPaiement,
} from "@/integrations/stripe/fournisseur";
import {
  lireDestinataireCommande,
  reserverNumero,
} from "@/repositories/commande";
import {
  ecrireAvoir,
  libererIntentionNonAboutie,
  lireFacturePourAvoir,
  marquerIntentionAboutie,
  reserverIntentionRemboursement,
} from "@/repositories/avoir";
import { leverAlerteCritique } from "@/repositories/confirmation";
import {
  lirePaiementEncaisse,
  marquerRembourse,
} from "@/repositories/paiement";
import { VERSION_INSTANTANE_LEGAL } from "@/lib/validation";
import type { InstantaneLegal } from "@/lib/validation";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  exigerReauthentificationRecente,
  ReauthentificationRequiseError,
} from "@/services/reauthentification";
import { deposerEnvoi } from "@/services/envoi-email";
import { formaterMontant } from "@/lib/montant";

/**
 * Ce qu'une demande de remboursement produit.
 *
 * LES REFUS SONT DISTINGUES, contrairement a l'acces aux documents de LS-132.
 * La difference tient a qui lit : ici l'appelant est l'exploitante, dans son
 * administration, et elle doit savoir POURQUOI le remboursement n'a pas eu
 * lieu. Un refus indistinct la laisserait relancer indefiniment un
 * remboursement que le prestataire ne fera jamais.
 */
export type IssueRemboursementCommande =
  /** L'argent est parti et l'avoir existe. */
  | {
      statut: "REMBOURSE";
      avoirId: string;
      numeroAvoir: string;
      montantCentimes: number;
    }
  /** Aucun paiement encaisse sur cette commande, rien a rembourser. */
  | { statut: "AUCUN_PAIEMENT" }
  /** Aucune facture : le document a rembourser n'existe pas encore. */
  | { statut: "FACTURE_ABSENTE" }
  /** Le montant demande depasse ce qui reste remboursable, regle F9. */
  | { statut: "MONTANT_TROP_ELEVE"; restantCentimes: number }
  /** Refus definitif du prestataire. Aucun avoir, aucun changement d'etat. */
  | { statut: "REFUSE_PRESTATAIRE"; code: string }
  /** Le prestataire ne repond pas. Rien n'a change, reessayer a du sens. */
  | { statut: "PRESTATAIRE_INDISPONIBLE" }
  /**
   * Exactement ce remboursement est deja parti, ou part en ce moment meme.
   *
   * DISTINCT D'UN REFUS : rien n'est refuse, un appel identique existe deja.
   * Rendre « refuse » pousserait a relancer, et la relance partirait avec un
   * cumul different donc une cle differente : un SECOND remboursement reel.
   */
  | { statut: "DEJA_DEMANDE" };

/**
 * Rembourse tout ou partie d'une commande et emet l'avoir correspondant.
 *
 * LA CLE D'IDEMPOTENCE EST DERIVEE, JAMAIS ENGENDREE, ADR-032. Elle vaut
 * `commandeId:cumulDejaRembourse:montantDemande` : deux clics sur le meme
 * bouton produisent la MEME cle, donc le prestataire rend le meme
 * remboursement au lieu d'en creer un second. Un `randomUUID()` ici rendrait la
 * relance non idempotente, c'est-a-dire exactement ce que la cle existe pour
 * empecher, et le defaut couterait de l'argent reel.
 *
 * LE CUMUL ENTRE DANS LA CLE, et ce n'est pas cosmetique : sans lui, deux
 * remboursements partiels successifs de 1000 centimes porteraient la meme cle,
 * et le second serait avale par l'idempotence du prestataire. L'exploitante
 * verrait « rembourse » sans qu'un centime ne parte la seconde fois.
 */
export async function rembourserCommande(
  parametres: {
    commandeId: string;
    montantCentimes: number;
    motif: string;
    fournisseur: FournisseurPaiement;
    /**
     * Identite de la DEMANDE, fournie par l'appelant, LS-128.
     *
     * ELLE DESIGNE UN GESTE, pas un montant. L'ecran d'administration engendre
     * cette reference une fois au chargement du formulaire : deux clics sur le
     * meme bouton la reenvoient a l'identique, donc le second n'appelle jamais
     * le prestataire. Un remboursement legitime demande plus tard porte une
     * reference neuve et part normalement.
     *
     * ELLE REMPLACE LA DERIVATION SUR LE CUMUL, qui etait fausse et l'a ete
     * prouve : `montantAvoirCentimes` bouge des que le premier avoir est ecrit,
     * donc un second appel lit un cumul different, derive une AUTRE cle,
     * reserve une AUTRE intention et rembourse une seconde fois. Mesure le
     * 1er septembre 2026, deux avoirs de 2000 sur la commande 8bec5a3e.
     */
    referenceDemande: string;
    /**
     * La demande de retractation a l'origine du remboursement, LS-174.
     *
     * FACULTATIF, ET IL DOIT LE RESTER : un remboursement commercial decide
     * depuis l'ecran de commande n'a aucune demande derriere lui. Il sert
     * uniquement a rattacher l'avoir, `Avoir.demandeRetractationId`, pour que le
     * numero du document reste lisible apres rechargement de la page.
     */
    demandeRetractationId?: string | undefined;
  },
  correlation?: Correlation,
): Promise<IssueRemboursementCommande> {
  const {
    commandeId,
    montantCentimes,
    motif,
    fournisseur,
    referenceDemande,
    demandeRetractationId,
  } = parametres;

  const paiement = await lirePaiementEncaisse(prisma, commandeId);

  if (paiement === null) {
    return { statut: "AUCUN_PAIEMENT" };
  }

  const facture = await lireFacturePourAvoir(prisma, commandeId);

  if (facture === null) {
    /*
     * PAS DE FACTURE, PAS D'AVOIR. Un avoir reference une facture, colonne
     * `factureId` non nullable : rembourser sans document a corriger laisserait
     * la comptabilite sans trace de la sortie d'argent.
     */
    return { statut: "FACTURE_ABSENTE" };
  }

  /*
   * CETTE BORNE-CI NE DECIDE PLUS, ELLE REPOND VITE. La borne qui FAIT AUTORITE
   * vit dans `reserverIntentionRemboursement`, sous verrou de la ligne de
   * facture : celle-ci evite seulement d'ouvrir une transaction pour un montant
   * manifestement hors bornes.
   *
   * ELLE NE SUFFISAIT PAS, ET UNE PREMIERE VERSION AFFIRMAIT LE CONTRAIRE. Elle
   * lit `montantAvoirCentimes` HORS TRANSACTION : deux demandes concurrentes
   * lisent le meme cumul, se jugent toutes deux legitimes, et les deux appels
   * partent. L'unicite de l'intention ne rattrapait rien, ne serialisant que
   * deux demandes de MEME cle, quand deux onglets en produisent deux
   * differentes. Mesure le 1er septembre 2026, 9800 centimes rendus pour 4900.
   *
   * CE QUE LE `CHECK` NE RATTRAPE PAS : il protege l'ECRITURE COMPTABLE, jamais
   * la SORTIE D'ARGENT, se declenchant APRES le depart des fonds.
   */
  const restantApparentCentimes =
    facture.montantTotalCentimes - facture.montantAvoirCentimes;

  if (montantCentimes > restantApparentCentimes) {
    return {
      statut: "MONTANT_TROP_ELEVE",
      restantCentimes: restantApparentCentimes,
    };
  }

  /*
   * LA CLE PORTE L'IDENTITE DE LA DEMANDE, JAMAIS UN ETAT MOUVANT.
   *
   * Une premiere version la derivait de `montantAvoirCentimes`. Mesure : quand
   * le premier appel a le temps d'ecrire son avoir, le second lit un cumul
   * different, derive une autre cle, reserve une autre intention et rembourse
   * une SECONDE FOIS. L'unicite ne voyait rien, les deux lignes differant
   * reellement.
   *
   * LE MONTANT ENTRE DANS LA CLE avec la reference : une meme demande dont
   * l'exploitante corrige le montant avant de valider est une intention
   * differente, et doit pouvoir partir.
   */
  const cleIdempotence = `remboursement:${referenceDemande}:${montantCentimes}`;

  /*
   * L'INTENTION EST RESERVEE AVANT TOUT APPEL RESEAU, defaut trouve par la
   * revue critique le 1er septembre 2026.
   *
   * SANS ELLE, DEUX DEMANDES IDENTIQUES CONCURRENTES PARTAIENT TOUTES LES DEUX.
   * La cle est derivee d'un cumul lu hors transaction : deux executions
   * simultanees lisent la meme valeur et derivent la MEME cle. Or l'idempotence
   * de Stripe n'est pas un verrou, deux requetes portant la meme cle qui
   * arrivent EN PARALLELE ne rendent pas la meme reponse : la seconde recoit
   * `idempotency_key_in_use`, que le code classait en refus definitif.
   * L'exploitante relancait, le cumul avait bouge, la cle changeait, et un
   * SECOND remboursement REEL partait. Mesure : 4000 centimes rendus pour 2000.
   *
   * L'ECRITURE COMMITE AVANT L'APPEL, elle ne tient aucun verrou pendant
   * l'aller-retour reseau, ce que `database.md` interdit.
   */
  const intention = await reserverIntentionRemboursement(prisma, {
    factureId: facture.id,
    cleIdempotence,
    montantCentimes,
  });

  if (!intention.reservee || intention.intentionId === null) {
    /*
     * DEUX REFUS DISTINCTS SOUS LE MEME `reservee: false`, et les confondre
     * tromperait l'exploitante. `restantCentimes` renseigne signifie que la
     * borne sous verrou a refuse : une autre demande a pris la place, en
     * concurrence. Sans lui, c'est l'unicite qui a parle : exactement cette
     * demande est deja partie.
     *
     * LE PREMIER POUSSE A CORRIGER LE MONTANT, le second a ne rien faire.
     */
    if (intention.restantCentimes !== undefined) {
      journaliser(
        "warn",
        "Remboursement refuse, le restant ne le couvre pas",
        {
          commande: commandeId,
          montantCentimes,
          restantCentimes: intention.restantCentimes,
        },
        correlation,
      );

      return {
        statut: "MONTANT_TROP_ELEVE",
        restantCentimes: intention.restantCentimes,
      };
    }

    journaliser(
      "warn",
      "Remboursement deja demande, aucun second appel",
      { commande: commandeId, montantCentimes },
      correlation,
    );

    return { statut: "DEJA_DEMANDE" };
  }

  let issue: Awaited<ReturnType<FournisseurPaiement["rembourser"]>>;

  try {
    /*
     * L'APPEL SORTANT EST ICI, HORS DE TOUTE TRANSACTION. Tout ce qui precede
     * est en lecture seule : si le prestataire refuse ou ne repond pas, la base
     * n'a pas bouge d'un octet.
     */
    issue = await fournisseur.rembourser({
      identifiantSession: paiement.identifiantSession,
      montantCentimes,
      cleIdempotence,
    });
  } catch (erreur) {
    if (erreur instanceof PrestatairePaiementIndisponibleError) {
      /*
       * INDISPONIBILITE : RIEN N'A CHANGE, ET LE REESSAI EST SUR. La cle
       * d'idempotence etant derivee et non engendree, une seconde tentative
       * porte la meme valeur : si le premier appel etait en fait parti, le
       * prestataire rendra le meme remboursement au lieu d'un second.
       */
      /*
       * L'INTENTION EST LIBEREE, sans quoi le reessai sortirait en « deja
       * demande » et une panne reseau rendrait ce remboursement DEFINITIVEMENT
       * impossible. Mesure par un test de reessai le 1er septembre 2026.
       *
       * LE CAS AMBIGU RESTE OUVERT ET IL EST ASSUME : si l'appel etait en fait
       * parti avant la coupure, liberer la cle autorise un second appel. Il
       * portera la MEME cle, le cumul n'ayant pas bouge, donc l'idempotence de
       * Stripe rendra le premier remboursement au lieu d'en creer un second.
       * C'est precisement le cas que l'idempotence sait traiter, l'appel n'etant
       * plus concurrent mais successif.
       */
      await libererIntentionNonAboutie(prisma, intention.intentionId);

      journaliserErreur(
        "Remboursement impossible, prestataire indisponible",
        erreur,
        { commande: commandeId, montantCentimes },
        correlation,
      );

      return { statut: "PRESTATAIRE_INDISPONIBLE" };
    }

    throw erreur;
  }

  if (issue.issue === "REFUSE") {
    /*
     * REFUS DEFINITIF : AUCUN AVOIR, AUCUN CHANGEMENT D'ETAT DE PAIEMENT, et la
     * tentative est journalisee, critere 3 du ticket. Ecrire un avoir ici
     * produirait un document comptable pour un argent jamais parti.
     */
    /*
     * L'INTENTION EST LIBEREE : le prestataire a repondu sans rien rendre,
     * l'argent n'est pas parti. Garder la reservation empecherait toute
     * nouvelle demande du meme montant apres correction de la cause.
     */
    await libererIntentionNonAboutie(prisma, intention.intentionId);

    journaliser(
      "warn",
      "Remboursement refuse par le prestataire",
      { commande: commandeId, montantCentimes, code: issue.code },
      correlation,
    );

    return { statut: "REFUSE_PRESTATAIRE", code: issue.code };
  }

  /*
   * LE MONTANT ECRIT EST CELUI QUE LE PRESTATAIRE A RENDU, jamais celui
   * demande. Un ecart entre les deux doit apparaitre dans le document plutot
   * que d'etre suppose : c'est l'argent reellement sorti qui fait foi.
   */
  const montantRendu = issue.montantCentimes;

  /*
   * L'INTENTION N'EST PLUS MARQUEE ABOUTIE ICI, LS-224, corrige le 12 septembre
   * 2026. Elle l'est DANS la transaction qui ecrit l'avoir, voir plus bas.
   *
   * CE QUE L'ANCIEN ORDRE OUVRAIT. Entre ce marquage et l'ecriture de l'avoir,
   * le montant n'etait compte par AUCUN des deux termes de la borne : ni par
   * `montantAvoirCentimes`, l'avoir n'existant pas encore, ni par les intentions
   * en cours, celle-ci venant de cesser d'en etre une. Une demande concurrente
   * s'y jugeait legitime, et `chk_facture_avoir_borne` la refusait par une
   * EXCEPTION au lieu du refus lisible `MONTANT_TROP_ELEVE`.
   *
   * LE COMMENTAIRE DE `reserverIntentionRemboursement` ASSUMAIT CETTE FENETRE,
   * « son seul effet serait d'autoriser une demande concurrente que le CHECK
   * rattraperait ». C'est exact, et c'etait le probleme : le CHECK rattrape
   * l'argent, jamais le message. Le test de concurrence echouait quatre fois
   * sur cinq, instabilite mesuree et non supposee.
   *
   * LA DISTINCTION QUE L'ANCIEN ORDRE PORTAIT RESTE VRAIE : une intention sans
   * `aboutieA` est un appel dont personne ne sait s'il est parti. Elle est
   * simplement etablie une instruction plus tard, dans la meme transaction que
   * l'avoir, donc les deux naissent ensemble ou pas du tout.
   */

  /*
   * LE DESTINATAIRE EST LU HORS TRANSACTION, ET CETTE POSITION EST LE CORRECTIF.
   *
   * DEFAUT MESURE LE 12 SEPTEMBRE 2026 : cette lecture etait DANS la transaction
   * d'emission, et le test de concurrence de LS-160 est passe au rouge. Une
   * requete de plus allonge la transaction, or l'intention a deja ete marquee
   * aboutie a la ligne precedente : elle ne reserve donc plus sa part dans la
   * borne de `reserverIntentionRemboursement`, pendant que l'avoir n'est pas
   * encore ecrit. La fenetre ainsi rallongee laissait une seconde demande
   * concurrente se juger legitime, et `chk_facture_avoir_borne` la refusait par
   * une exception au lieu du refus lisible attendu.
   *
   * LA LEÇON VAUT AU-DELA DE CE FICHIER : ajouter une lecture « inoffensive »
   * dans une transaction deplace une fenetre de course que rien d'autre ne
   * signale. Ici la donnee ne depend d'aucune ecriture de la transaction, elle
   * n'a donc rien a y faire.
   */
  const destinataireClient = await lireDestinataireCommande(prisma, commandeId);

  return emettreAvoirApresRemboursement({
    destinataireClient,
    intentionId: intention.intentionId,
    commandeId,
    facture,
    paiementId: paiement.id,
    montantEncaisseCentimes: paiement.montantCentimes,
    montantRenduCentimes: montantRendu,
    motif,
    identifiantRemboursement: issue.identifiantRemboursement,
    demandeRetractationId,
    correlation,
  });
}

/**
 * Ecrit l'avoir et met a jour le paiement, dans UNE transaction.
 *
 * TOUT CE QUI SUIT LE DEPART DE L'ARGENT EST INDISSOCIABLE : le numero, le
 * document, le cumul de la facture et le statut du paiement. Une moitie ecrite
 * laisserait une comptabilite fausse alors que l'argent est deja parti, et rien
 * ne le signalerait.
 *
 * LE NUMERO EST ATTRIBUE DANS CETTE TRANSACTION, invariant 4 et regle F4, sur
 * la sequence `AVOIR` distincte de `FACTURE` : `A-2026-0001` et non
 * `F-2026-0001`. Une transaction annulee rend son numero, le compteur etant
 * verrouille par ligne, ADR-031.
 *
 * UN ECHEC ICI EST UNE ALERTE CRITIQUE, pas une exception avalee : l'argent est
 * parti sans document. C'est le seul etat de ce service qui exige une
 * intervention humaine.
 */
async function emettreAvoirApresRemboursement(parametres: {
  commandeId: string;
  facture: NonNullable<Awaited<ReturnType<typeof lireFacturePourAvoir>>>;
  paiementId: string;
  montantEncaisseCentimes: number;
  montantRenduCentimes: number;
  motif: string;
  identifiantRemboursement: string;
  /** La demande de retractation a l'origine, LS-174. Absente hors retractation. */
  demandeRetractationId?: string | undefined;
  /**
   * A qui part l'email de remboursement, LU HORS TRANSACTION par l'appelant.
   *
   * `null` QUAND LA COMMANDE EST INTROUVABLE, cas qui ne devrait pas se
   * produire ici : aucun email ne part alors, plutot que d'inventer une adresse.
   */
  destinataireClient: { numero: string; emailNormalise: string } | null;
  /**
   * L'intention a marquer aboutie DANS la transaction d'emission, LS-224.
   *
   * Elle reserve sa part dans la borne tant que l'avoir n'existe pas : les deux
   * ecritures partagent donc la transaction, sans quoi une fenetre s'ouvre ou le
   * montant n'est compte nulle part.
   */
  intentionId: string;
  correlation?: Correlation | undefined;
}): Promise<IssueRemboursementCommande> {
  const {
    commandeId,
    facture,
    paiementId,
    montantEncaisseCentimes,
    montantRenduCentimes,
    motif,
    identifiantRemboursement,
    demandeRetractationId,
    destinataireClient,
    intentionId,
    correlation,
  } = parametres;

  try {
    const issue = await prisma.$transaction(async (transaction) => {
      const { annee, rang } = await reserverNumero(transaction, "AVOIR");
      const numero = `A-${annee}-${String(rang).padStart(4, "0")}`;

      const avoir = await ecrireAvoir(transaction, {
        factureId: facture.id,
        numero,
        montantCentimes: montantRenduCentimes,
        motif,
        demandeRetractationId,
        instantaneLegal: construireInstantaneAvoir({
          instantaneFacture: facture.instantaneLegal,
          numeroFacture: facture.numero,
          montantRenduCentimes,
          motif,
        }),
      });

      /*
       * LE CUMUL EST CALCULE PAR LA BASE, PLUS ICI. Le repository incremente et
       * decide du statut sur la valeur ainsi obtenue.
       *
       * UNE PREMIERE VERSION PASSAIT `cumulAvantCentimes + montantRenduCentimes`,
       * lu au tout debut du service, hors transaction. Deux remboursements
       * partiels concurrents de 1000 et 2000 lisaient tous deux zero, et la
       * seconde ecriture ECRASAIT la premiere : le paiement restait a 2000 pour
       * 3000 reellement sortis. Mesure le 1er septembre 2026.
       */
      await marquerRembourse(transaction, {
        paiementId,
        montantRenduCentimes,
        montantEncaisseCentimes,
      });

      /*
       * L'INTENTION ABOUTIT DANS LA MEME TRANSACTION QUE L'AVOIR, LS-224.
       * Tant que l'avoir n'est pas ecrit, elle reserve sa part dans la borne :
       * il n'existe plus d'instant ou le montant echappe aux deux termes.
       */
      await marquerIntentionAboutie(transaction, intentionId);

      journaliser(
        "info",
        "Avoir emis apres remboursement",
        {
          commande: commandeId,
          avoir: avoir.id,
          montantCentimes: montantRenduCentimes,
          remboursement: identifiantRemboursement,
        },
        correlation,
      );

      return {
        statut: "REMBOURSE" as const,
        avoirId: avoir.id,
        numeroAvoir: avoir.numero,
        montantCentimes: avoir.montantCentimes,
      };
    });

    /*
     * L'EMAIL PART APRES LE COMMIT, ET CETTE POSITION EST LE CORRECTIF, LS-29,
     * F-MAIL-04.
     *
     * DEFAUT MESURE LE 12 SEPTEMBRE 2026 : depose DANS la transaction, il
     * faisait rougir le test de concurrence de LS-160. L'intention a deja ete
     * marquee aboutie avant l'emission, donc elle ne reserve plus sa part dans
     * la borne sous verrou ; toute ecriture supplementaire allonge la fenetre
     * pendant laquelle l'avoir n'est pas encore visible, et une seconde demande
     * concurrente s'y juge legitime. `chk_facture_avoir_borne` la refusait alors
     * par une exception au lieu du refus lisible attendu.
     *
     * MEME REGLE QUE L'APPEL RESEAU, que ce service tient deja hors transaction :
     * ce qui n'a pas besoin d'etre atomique avec l'ecriture n'y entre pas. Un
     * email non depose est rattrapable, une fenetre de course sur l'argent ne
     * l'est pas.
     *
     * SON ECHEC N'ANNULE RIEN, l'avoir etant commite : il est journalise, et
     * l'exploitante voit le document dans l'administration.
     */
    if (issue.statut === "REMBOURSE" && destinataireClient !== null) {
      try {
        await deposerEnvoi(prisma, {
          /*
           * `null` ET NON `commandeId` : la cle `envoi_en_attente_actif_unique`
           * porte sur `(commandeId, modele)`, et un remboursement partiel se
           * repete legitimement, regle F9 et ADR-032. Deduplicquer par commande
           * interdirait le second envoi.
           */
          commandeId: null,
          destinataire: destinataireClient.emailNormalise,
          modele: "remboursement-envoye",
          variables: {
            numero: destinataireClient.numero,
            montant: formaterMontant(montantRenduCentimes),
            numeroAvoir: issue.numeroAvoir,
          },
          origine: "ADMIN",
        });
      } catch (erreur) {
        journaliserErreur(
          "email de remboursement non depose",
          erreur,
          { commande: commandeId },
          correlation,
        );
      }
    }

    return issue;
  } catch (erreur) {
    /*
     * L'ARGENT EST PARTI ET LE DOCUMENT MANQUE. C'est le pire etat de ce
     * service, et il ne se rejoue pas tout seul : rappeler le prestataire
     * rendrait le meme remboursement, la cle etant idempotente, mais l'avoir
     * resterait a ecrire a la main. L'alerte porte l'identifiant du
     * remboursement, seul lien avec l'argent sorti.
     */
    journaliserErreur(
      "Avoir non emis alors que le remboursement a eu lieu",
      erreur,
      { commande: commandeId, remboursement: identifiantRemboursement },
      correlation,
    );

    await leverAlerteCritique(prisma, {
      type: "AVOIR_NON_EMIS",
      message:
        `Remboursement ${identifiantRemboursement} effectue sur la commande ` +
        `${commandeId}, montant ${montantRenduCentimes} centimes, mais AUCUN ` +
        "avoir n'a pu etre emis. Document comptable a etablir manuellement.",
      typeCible: "Commande",
      idCible: commandeId,
    });

    throw erreur;
  }
}

/**
 * Construit l'instantane legal de l'avoir, invariant 3.
 *
 * IL DERIVE DE CELUI DE LA FACTURE, jamais du catalogue. Les libelles et les
 * prix sont ceux figes a l'achat : relire les variantes ici ferait dependre un
 * avoir emis du prix actuel, exactement ce que l'invariant 3 interdit.
 *
 * LES TOTAUX RESTENT CEUX DE LA FACTURE. L'avoir ne redit pas la vente, il la
 * corrige : le montant rendu vit dans `montantCentimes` de l'avoir et dans sa
 * mention, pas dans un total recalcule qui laisserait croire a une seconde
 * vente d'un montant different.
 */
function construireInstantaneAvoir(parametres: {
  instantaneFacture: InstantaneLegal;
  numeroFacture: string;
  montantRenduCentimes: number;
  motif: string;
}): InstantaneLegal {
  const { instantaneFacture, numeroFacture, montantRenduCentimes, motif } =
    parametres;

  return {
    ...instantaneFacture,
    version: VERSION_INSTANTANE_LEGAL,
    /*
     * LES MENTIONS PORTENT LE LIEN VERS LA FACTURE CORRIGEE. Un avoir qui ne
     * nomme pas son document d'origine est inexploitable a la lecture, et le
     * rapprochement se ferait a la main sur la date.
     */
    mentions: [
      ...instantaneFacture.mentions,
      `Avoir sur la facture ${numeroFacture}`,
      `Montant rembourse : ${montantRenduCentimes} centimes`,
      `Motif : ${motif}`,
    ],
  };
}

/**
 * Ce que la demande gardee rend, en plus des issues du remboursement lui-meme.
 *
 * LES DEUX REFUS DE GARDE SONT DISTINGUES, et la distinction est utile ici
 * contrairement a l'acces aux documents de LS-132. L'appelante est
 * l'exploitante, dans son administration : « votre session a expire » et
 * « confirmez votre identite » appellent deux gestes differents, et les
 * confondre la ferait se reconnecter quand il suffit de saisir son mot de
 * passe.
 *
 * AUCUN DES DEUX NE RENSEIGNE UN INTRUS. Atteindre cette fonction suppose deja
 * une session ouverte : la distinction ne se lit qu'apres la garde de role,
 * jamais avant.
 */
export type IssueDemandeRemboursement =
  | IssueRemboursementCommande
  /** Aucune session d'administration, ou session sans le role. */
  | { statut: "SESSION_ABSENTE" }
  /** Session valide, mais la preuve d'identite manque ou a plus de quinze minutes. */
  | { statut: "REAUTHENTIFICATION_REQUISE" };

/**
 * Rembourse sur decision de l'exploitante, gardes comprises. LS-160.
 *
 * ELLE EXISTE POUR PORTER LES DEUX GARDES DANS LE SERVICE, et non dans le seul
 * adaptateur. La marque de famille se pose sur la fonction qui DECIDE : la
 * poser sur une Server Action qui delegue laisserait `rembourserCommande`
 * atteignable sans garde par un futur appelant, et le controle cherche la garde
 * dans le corps de la fonction marquee, jamais dans son appelant.
 *
 * L'ADAPTATEUR EXIGE LE ROLE LUI AUSSI, et c'est deliberement redondant : une
 * Server Action est un point d'entree HTTP invocable directement. Les deux
 * gardes ferment deux chemins distincts vers le meme effet.
 *
 * LES DEUX GARDES REPONDENT A DEUX QUESTIONS DISTINCTES, motif de LS-89 :
 * `exigerAdministratrice` dit QUI agit, `exigerReauthentificationRecente` dit
 * si cette identite est RECENTE. Un client inscrit sur la boutique franchirait
 * la seconde avec son propre mot de passe si la premiere manquait.
 *
 * L'ORDRE DES GARDES N'EST PAS INDIFFERENT : le role d'abord. L'inverse ferait
 * proposer une reauthentification a quelqu'un qui n'a de toute facon aucun
 * droit sur cet ecran, ce qui lui apprendrait que l'ecran existe.
 *
 * @sensible REMBOURSEMENT
 */
export async function demanderRemboursement(
  enTetes: Headers,
  parametres: {
    commandeId: string;
    montantCentimes: number;
    motif: string;
    fournisseur: FournisseurPaiement;
    referenceDemande: string;
    /**
     * La demande de retractation a l'origine, LS-174, transmise telle quelle a
     * `rembourserCommande`. Absente pour un remboursement commercial.
     */
    demandeRetractationId?: string | undefined;
  },
  correlation?: Correlation,
): Promise<IssueDemandeRemboursement> {
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
     * etre revoquee entre les deux gardes. Elle se traduit comme plus haut :
     * une session disparue est une session absente, pas une panne.
     */
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }

  return rembourserCommande(parametres, correlation);
}
