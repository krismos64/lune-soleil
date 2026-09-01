/**
 * Acces a un document comptable par lien signe. LS-132, invariants 2 et 9.
 *
 * LE CAS SANS COMPTE, celui que LS-57 ne couvre pas. Un achat sans compte
 * produit une facture, et le client doit pouvoir y acceder : sans session,
 * l'autorisation ne peut venir que d'un jeton signe.
 *
 * LES QUATRE CONDITIONS SE TESTENT ENSEMBLE, regle L9 et `PARCOURS.md`.
 * Modifie, expire, consomme, revoque : en omettre une ouvre un acces. Le piege
 * documente est de ne verifier que l'expiration, ce qui laisse utilisable
 * jusqu'a son terme un lien parti sur une adresse email erronee.
 *
 * LE REFUS EST UNIFORME, invariant 2 et `payments.md`. L'appelant recoit
 * `REFUSE` sans savoir laquelle des quatre conditions a echoue, ni si la
 * commande existe. Rendre des motifs distincts au client transformerait la
 * route en oracle : « ce jeton a expire » revele qu'il a existe, donc qu'une
 * commande existe.
 *
 * LE MOTIF EST JOURNALISE, LUI. Le distinguer cote serveur est necessaire au
 * diagnostic, et `journal.ts` masque toute cle contenant « jeton ».
 */
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/lib/journal";
import type { Correlation } from "@/lib/journal";
import {
  empreinteJeton,
  engendrerJeton,
  expirationDocument,
  lienDocument,
  signatureJetonValide,
} from "@/lib/jeton-acces";
import {
  ecrireJeton,
  lireJetonParEmpreinte,
  revoquerJetonsActifs,
} from "@/repositories/jeton-acces";
import { lireFactureAServir } from "@/repositories/facture";
import type { ClientBase } from "@/repositories/stock";

/**
 * Ce qu'une demande d'acces produit.
 *
 * UN SEUL CAS DE REFUS, VOLONTAIREMENT. Le type lui-meme empeche un appelant de
 * distinguer les motifs : un `type` a quatre branches finirait tot ou tard
 * affiche a l'ecran, et l'oracle serait reconstitue sans qu'aucune regle n'ait
 * ete enfreinte explicitement.
 */
export type AccesDocument =
  | {
      statut: "AUTORISE";
      factureId: string;
      numero: string;
      cheminPdf: string;
    }
  | { statut: "REFUSE" };

/** Motif interne, journalise, jamais rendu a l'appelant. */
type MotifRefus =
  | "SIGNATURE_INVALIDE"
  | "INTROUVABLE"
  | "EXPIRE"
  | "CONSOMME"
  | "REVOQUE"
  | "PORTEE_INCORRECTE"
  | "FACTURE_ABSENTE"
  | "PDF_ABSENT";

function refuser(motif: MotifRefus, correlation?: Correlation): AccesDocument {
  journaliser("info", "Acces document refuse", { motif }, correlation);

  return { statut: "REFUSE" };
}

/**
 * Autorise, ou non, l'acces au document d'une commande.
 *
 * L'ORDRE DES CONTROLES EST DELIBERE : la signature d'abord, EN MEMOIRE et sans
 * toucher la base. Une valeur forgee ne doit pas couter une requete, sans quoi
 * l'enumeration reste possible a cout constant. Les trois conditions d'etat
 * viennent ensuite, une fois la ligne lue.
 *
 * ELLE NE CONSOMME PAS LE JETON, et c'est un arbitrage. `utiliseA` marque une
 * action FAITE, une rétractation deposee, un avis ecrit : consommer a la
 * premiere lecture rendrait le lien de facture utilisable une seule fois, alors
 * qu'un client rouvre son email pour retelecharger. La portee `DOCUMENT` est
 * une consultation repetable, bornee par `expireA` et revocable a tout moment.
 * `consommerJeton` reste ecrit dans le repository pour les portees qui en ont
 * besoin, RETRACTATION et AVIS.
 *
 * ELLE NE LEVE PAS SUR UN JETON DOUTEUX. Toute entree non fiable ressort en
 * `REFUSE` : lever produirait un 500, discernable d'un refus, donc un oracle.
 */
export async function autoriserAccesDocument(
  valeurJeton: string,
  correlation?: Correlation,
): Promise<AccesDocument> {
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

  /*
   * LA PORTEE EST VERIFIEE, regle L6, moindre privilege. La meme table sert
   * quatre usages : sans ce controle, un jeton de suivi de commande ouvrirait
   * la facture, et l'entite generique deviendrait une faille plutot qu'une
   * simplification.
   */
  if (jeton.portee !== "DOCUMENT") {
    return refuser("PORTEE_INCORRECTE", correlation);
  }

  const maintenant = new Date();

  if (jeton.expireA.getTime() <= maintenant.getTime()) {
    return refuser("EXPIRE", correlation);
  }

  if (jeton.utiliseA !== null) {
    return refuser("CONSOMME", correlation);
  }

  if (jeton.revoqueA !== null) {
    return refuser("REVOQUE", correlation);
  }

  /*
   * LA FACTURE EST RELUE DEPUIS LE JETON, jamais depuis un identifiant fourni
   * par l'appelant, invariant 2. C'est le jeton qui designe la commande, donc
   * la facture : le controle de propriete est structurel et non ajoute.
   */
  const facture = await lireFactureAServir(prisma, jeton.commandeId);

  if (facture === null) {
    return refuser("FACTURE_ABSENTE", correlation);
  }

  if (facture.cheminPdf === null) {
    /*
     * LE PDF PEUT MANQUER SANS QUE LE DOCUMENT SOIT INVALIDE, regle F8 : la
     * facture existe en base avant son rendu, et un rendu en echec laisse
     * `cheminPdf` nul avec une alerte deja levee par LS-129. Le refus est le
     * bon comportement, il n'y a rien a servir.
     */
    return refuser("PDF_ABSENT", correlation);
  }

  return {
    statut: "AUTORISE",
    factureId: facture.id,
    numero: facture.numero,
    cheminPdf: facture.cheminPdf,
  };
}

/**
 * Emet un jeton de document neuf pour une commande, en revoquant les actifs.
 *
 * POURQUOI CE CHEMIN EXISTE, defaut trouve par la revue critique le
 * 1er septembre 2026. La valeur en clair n'existe qu'a l'instant de sa
 * creation, la base ne gardant que l'empreinte, regle L5. Trois situations la
 * rendent introuvable et n'avaient autrement AUCUNE issue : un rejeu
 * d'evenement, qui ressort sur la facture existante sans reengendrer de jeton ;
 * un envoi d'email en echec ; un lien parti sur une adresse erronee. Sans
 * reemission, ces commandes n'ont plus jamais de facture accessible.
 *
 * LA REVOCATION PRECEDE L'ECRITURE, ET ELLE EST LE COEUR DE LA FONCTION.
 * `JetonAcces` est une entite propre avec sa propre expiration : emettre un
 * jeton neuf n'invalide pas l'ancien, qui reste valide jusqu'a son terme. Sur
 * une boite partagee, le premier lien continue d'ouvrir la facture. C'est
 * exactement le defaut que le point 8 des transactions critiques decrit pour
 * l'invitation d'avis, et la parade est la meme.
 *
 * LES DEUX ECRITURES VONT DANS UNE TRANSACTION, ouverte par l'appelant. Une
 * revocation sans emission laisserait la commande sans acces ; une emission
 * sans revocation laisserait l'orphelin. C'est l'ensemble qui est correct, pas
 * chaque moitie.
 *
 * ELLE NE TRANSMET RIEN. La valeur ressort vers l'appelant, a qui il revient de
 * l'envoyer, LS-82. La journaliser ou la stocker annulerait la regle L5.
 */
export async function reemettreJetonDocument(
  client: ClientBase,
  commandeId: string,
  correlation?: Correlation,
): Promise<{ valeur: string; lien: string; revoques: number }> {
  const revoques = await revoquerJetonsActifs(client, commandeId, "DOCUMENT");

  const jeton = engendrerJeton();

  await ecrireJeton(client, {
    commandeId,
    empreinte: jeton.empreinte,
    portee: "DOCUMENT",
    expireA: expirationDocument(),
  });

  /*
   * LE NOMBRE DE REVOCATIONS EST JOURNALISE, jamais la valeur ni l'empreinte.
   * Il dit si une reemission a remplace un lien actif ou comble un trou, ce qui
   * suffit au diagnostic.
   */
  journaliser(
    "info",
    "Jeton de document reemis",
    { commande: commandeId, revoques },
    correlation,
  );

  return { valeur: jeton.valeur, lien: lienDocument(jeton.valeur), revoques };
}
