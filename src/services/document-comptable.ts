/**
 * Rendu des documents comptables et reprise apres echec. LS-129, ADR-034.
 *
 * CE SERVICE S'EXECUTE HORS TRANSACTION, ET C'EST LA DECISION D'ADR-034.
 * `emettreFacture` vit dans la transaction du webhook, celle qui ecrit le
 * paiement et le mouvement de stock. Y ajouter le rendu ferait tenir cette
 * transaction pendant une ecriture disque, et un echec tardif l'AVORTERAIT :
 * le paiement et le mouvement seraient perdus pour un fichier manquant.
 *
 * `cheminPdf` NUL EST LA FILE D'ATTENTE, et aucune table n'est ajoutee pour
 * cela. Une facture sans fichier est une tache de rendu en attente, etat que le
 * modele porte deja par decision de LS-49. L'outbox d'ADR-033 n'est pas
 * reutilisable, `EnvoiEmail` portant destinataire et modele, propres a l'email.
 */
import { prisma } from "@/lib/prisma";
import { journaliserErreur } from "@/lib/journal";
import { leverAlerteCritique } from "@/repositories/confirmation";
import {
  lireFactureARendre,
  poserCheminPdfFacture,
} from "@/repositories/facture";
import { rendreEtStocker } from "@/integrations/pdf/rendu-document";

/** Ce que le rendu d'un document a produit, ou pourquoi il a echoue. */
export type ResultatRendu =
  | { statut: "RENDU"; cheminRelatif: string }
  | { statut: "DEJA_RENDU"; cheminRelatif: string }
  | { statut: "INTROUVABLE" }
  | { statut: "ECHEC" };

/**
 * Rend le PDF d'une facture et pose son chemin, ou leve une alerte.
 *
 * ELLE NE LEVE JAMAIS, et c'est le critere 4 de LS-129. Un echec de rendu doit
 * laisser `cheminPdf` nul, produire une `AlerteCritique` et laisser le document
 * valide en base avec son numero. Propager l'exception depuis le webhook
 * annulerait la transaction du paiement, exactement ce que le modele interdit.
 *
 * LE NUMERO N'EST JAMAIS TOUCHE ICI, critere 5. Cette fonction ne connait qu'un
 * identifiant de facture et n'a aucun acces au compteur : une regeneration
 * repasse par le meme chemin et ne peut structurellement pas reattribuer un
 * rang, ADR-031.
 *
 * ELLE EST IDEMPOTENTE PAR L'EFFET, pas par une garde. Un document deja rendu
 * ressort en `DEJA_RENDU` sans reecrire le fichier. Deux rendus simultanes
 * ecrivent chacun leur temporaire puis renomment vers la meme cible : le
 * `rename` etant atomique, le dernier gagne et aucun etat intermediaire n'est
 * lisible.
 *
 * LEUR CONTENU N'EST PAS OCTET POUR OCTET IDENTIQUE, et l'affirmer serait faux :
 * `@react-pdf/renderer` reengendre `/CreationDate` et `/ID` a chaque rendu.
 * Seul le contenu UTILE est stable, ce qui suffit ici, un document comptable
 * valant par ce qu'il porte et non par son empreinte binaire.
 */
export async function rendreFacture(factureId: string): Promise<ResultatRendu> {
  /*
   * LA LECTURE EST DANS LE `try`, ET CE N'EST PAS UN DETAIL DE PORTEE.
   *
   * Defaut trouve par `ls-critical-reviewer` le 1er septembre 2026 : la lecture
   * etait AVANT, et trois appels pouvaient donc lever hors de toute protection,
   * `findUnique` sur une base injoignable, et surtout
   * `schemaInstantaneLegal.parse` sur un instantane d'une version plus
   * ancienne.
   *
   * LA CONSEQUENCE ETAIT LA PIRE POSSIBLE. L'exception remontait jusqu'au
   * webhook, qui rendait 500 ; le prestataire rejouait, l'unicite de
   * l'identifiant d'evenement sortait en `DEJA_TRAITE`, donc la garde
   * `issue.statut === "TRAITE"` etait fausse et LE RENDU N'ETAIT JAMAIS
   * RETENTE. La facture restait sans PDF **et sans alerte** : le mecanisme de
   * detection de LS-49 etait court-circuite, et rien ne signalait le document
   * manquant.
   */
  let numeroPourAlerte = factureId;

  try {
    const facture = await lireFactureARendre(prisma, factureId);

    if (facture === null) {
      return { statut: "INTROUVABLE" };
    }

    numeroPourAlerte = facture.numero;

    if (facture.cheminPdf !== null) {
      return { statut: "DEJA_RENDU", cheminRelatif: facture.cheminPdf };
    }

    const rendu = await rendreEtStocker({
      enTete: {
        intitule: "Facture",
        numero: facture.numero,
        emisA: facture.emiseA.toISOString(),
      },
      instantane: facture.instantaneLegal,
    });

    await poserCheminPdfFacture(prisma, facture.id, rendu.cheminRelatif);

    return { statut: "RENDU", cheminRelatif: rendu.cheminRelatif };
  } catch (erreur) {
    /*
     * TOUTE ERREUR EST RATTRAPEE, sans distinguer sa nature, et c'est
     * volontaire ici alors que `emettreFactureOuAlerter` ne rattrape QUE la
     * configuration absente.
     *
     * La difference tient a ce qui est en jeu. La-bas, une erreur inattendue
     * doit faire echouer la transaction pour que le prestataire rejoue. Ici il
     * n'y a plus de transaction a annuler : la facture est deja commitee avec
     * son numero, et laisser remonter l'exception ne ferait que casser
     * l'appelant sans rien reparer. L'etat « PDF en echec » est precisement
     * l'etat prevu pour cela, et il est rattrapable par regeneration.
     */
    journaliserErreur("Rendu du PDF de facture en echec", erreur, {
      facture: factureId,
    });

    await leverAlerteOuJournaliser(factureId, numeroPourAlerte);

    return { statut: "ECHEC" };
  }
}

/**
 * Leve l'alerte, et n'echoue pas si l'alerte elle-meme echoue.
 *
 * SANS CETTE PROTECTION, UNE BASE INJOIGNABLE ROUVRAIT LE MEME TROU. La cause
 * la plus probable d'un echec de rendu accompagne d'un echec d'ecriture est une
 * base indisponible : `alerteCritique.create` leverait a son tour, l'exception
 * sortirait de `rendreFacture` malgre son contrat, et le webhook rendrait 500.
 * Defaut 3 releve par `ls-critical-reviewer` le 1er septembre 2026.
 *
 * IL RESTE ALORS LE JOURNAL TECHNIQUE, moins visible qu'une alerte mais jamais
 * rien : le document manquant se retrouve par la requete des `cheminPdf` nuls,
 * que le modele rend justement possible.
 */
async function leverAlerteOuJournaliser(
  factureId: string,
  numero: string,
): Promise<void> {
  try {
    await leverAlerteCritique(prisma, {
      type: "PDF_FACTURE_EN_ECHEC",
      message:
        `Facture ${numero} emise sans document PDF : le rendu a ` +
        "echoue. La facture reste valide en base avec son numero. Relancer " +
        "la generation depuis l'administration.",
      typeCible: "Facture",
      idCible: factureId,
    });
  } catch (erreur) {
    journaliserErreur("Alerte de PDF en echec non levee", erreur, {
      facture: factureId,
    });
  }
}

/**
 * Rend le PDF de la facture d'une commande, APRES le commit de celle-ci.
 *
 * APPELEE PAR LE WEBHOOK UNE FOIS SA TRANSACTION TERMINEE, ADR-034. Elle passe
 * par la commande et non par un identifiant de facture remonte a travers les
 * couches : `facture.commandeId` est unique, la retrouver coute une lecture, et
 * `IssueEvenementPaiement` reste le contrat public qu'il est, sans un champ de
 * rendu qui n'interesse pas l'adaptateur HTTP.
 *
 * ELLE NE LEVE JAMAIS, meme raison que `rendreFacture` : a ce stade le paiement
 * est commite, et une exception ne ferait que casser l'appelant. Une commande
 * sans facture, cas de l'emetteur non configure, ressort en `INTROUVABLE` et a
 * deja produit son alerte dans la transaction.
 */
export async function rendreFactureDeCommande(
  commandeId: string,
): Promise<ResultatRendu> {
  /*
   * LA LECTURE EST PROTEGEE, meme raison que dans `rendreFacture` : une base
   * injoignable entre le commit et cette requete ferait remonter l'exception
   * jusqu'au webhook, qui rendrait 500, et le rejeu ne retenterait jamais le
   * rendu, la garde `TRAITE` etant fausse sur `DEJA_TRAITE`.
   */
  let facture: { id: string } | null;

  try {
    facture = await prisma.facture.findUnique({
      where: { commandeId },
      select: { id: true },
    });
  } catch (erreur) {
    journaliserErreur("Facture introuvable pour le rendu du PDF", erreur, {
      commande: commandeId,
    });

    return { statut: "ECHEC" };
  }

  if (facture === null) {
    return { statut: "INTROUVABLE" };
  }

  return rendreFacture(facture.id);
}
