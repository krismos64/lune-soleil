/**
 * Emission du document comptable, LS-126, etape 8 du parcours 1.
 *
 * CE SERVICE N'OUVRE AUCUNE TRANSACTION. Il recoit celle de la confirmation et
 * y ecrit, ce qui est la garantie du critere 1 : la facture nait avec le
 * paiement et le mouvement de stock, ou ne nait pas du tout. Une transaction
 * propre ici laisserait exister une facture sans commande confirmee, ou
 * l'inverse, selon celle qui echouerait.
 *
 * IL N'Y A PAS DE CHEMIN DE MODIFICATION, invariant 4. Une facture emise est
 * immuable : ni ce module ni aucun autre ne doit exposer de quoi la corriger.
 * Une correction produit un avoir, LS-128, document distinct portant sa propre
 * sequence de numerotation.
 *
 * AUCUN PDF N'EST PRODUIT ICI, regle F8. Le document existe en base d'abord, et
 * son rendu est le sujet de LS-129 : lier les deux ferait dependre l'existence
 * d'une facture de la reussite d'un rendu, alors qu'un rendu se rejoue et
 * qu'une facture ne se recree pas.
 */
import { reserverNumero } from "@/repositories/commande";
import {
  engendrerJeton,
  expirationDocument,
  expirationRetractation,
} from "@/lib/jeton-acces";
import { ecrireJeton } from "@/repositories/jeton-acces";
import { ecrireFacture, lireFactureDeCommande } from "@/repositories/facture";
import type { FactureEmise } from "@/repositories/facture";
import type { ClientBase } from "@/repositories/stock";
import {
  MENTION_FRANCHISE_TVA,
  VERSION_INSTANTANE_LEGAL,
  schemaEmetteurFacture,
  schemaInstantaneLegal,
} from "@/lib/validation";
import type { AdresseFigee, EmetteurFacture } from "@/lib/validation";

/**
 * Identite legale de l'emetteur absente ou mal formee.
 *
 * UNE CLASSE DEDIEE, comme pour la configuration de livraison : l'appelant doit
 * distinguer une configuration manquante d'une panne. La premiere se corrige par
 * un deploiement, jamais par un rejeu de l'evenement.
 */
export class EmetteurNonConfigureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmetteurNonConfigureError";
  }
}

/**
 * Lit l'identite de l'emetteur depuis l'environnement.
 *
 * ARBITRAGE DU 31 AOUT 2026, l'environnement plutot qu'une table. Ces quatre
 * valeurs changent au rythme d'un demenagement, pas d'une vente : une table de
 * parametrage aurait demande une migration, un ecran d'administration et un ADR
 * pour une donnee quasi immobile.
 *
 * LA LECTURE EST FAITE A CHAQUE EMISSION ET NON AU CHARGEMENT DU MODULE. Une
 * constante de module figerait la valeur au demarrage du processus, ce qui rend
 * la configuration intestable et masque une correction faite sans redemarrage.
 *
 * LE MESSAGE D'ERREUR NE PORTE AUCUNE VALEUR LUE, invariant 9. Il nomme les
 * champs fautifs, ce qui suffit a corriger, et `EntreeInvalideError` de Zod ne
 * fuit deja que des noms de cles.
 */
export function lireEmetteur(): EmetteurFacture {
  const resultat = schemaEmetteurFacture.safeParse({
    raisonSociale: process.env.FACTURE_RAISON_SOCIALE,
    siret: process.env.FACTURE_SIRET,
    adresse: process.env.FACTURE_ADRESSE,
    emailContact: process.env.FACTURE_EMAIL_CONTACT,
  });

  if (!resultat.success) {
    const champs = resultat.error.issues
      .map((probleme) => probleme.path.join("."))
      .join(", ");

    throw new EmetteurNonConfigureError(
      `Identite legale de l'emetteur absente ou invalide : ${champs}. ` +
        "Renseigner les variables FACTURE_* avant toute emission.",
    );
  }

  return resultat.data;
}

/**
 * Ce que l'emission rend : la facture, et la valeur du jeton quand il vient
 * d'etre cree.
 *
 * `jetonAcces` EST ABSENT SUR UN REJEU, et cette asymetrie est voulue. La
 * valeur n'existe qu'a l'instant de sa creation, l'empreinte seule etant
 * conservee : un rejeu ne peut donc pas la reproduire, et pretendre le
 * contraire supposerait de stocker le jeton en clair, ce que la regle L5
 * interdit.
 */
export type FactureEmiseAvecAcces = FactureEmise & {
  /** Valeur en clair, a transmettre puis oublier. Absente sur un rejeu. */
  jetonAcces?: string;
  /**
   * Jeton de retractation, LS-134. Meme regime que `jetonAcces` : en clair une
   * seule fois, absent sur un rejeu, a transmettre par email puis oublier.
   *
   * DISTINCT DU PRECEDENT, regle L6 : une fuite du lien de facture ne doit pas
   * donner le pouvoir de retracter la commande d'autrui.
   */
  jetonRetractation?: string;
};

/** Ce que la commande apporte au document, deja fige par elle. */
export type CommandeAFacturer = {
  id: string;
  numero: string;
  nomClient: string;
  emailNormalise: string;
  adresseFacturation: unknown;
  sousTotalCentimes: number;
  fraisPortCentimes: number;
  totalCentimes: number;
  creeA: Date;
  lignes: {
    referenceFigee: string;
    libelleProduitFige: string;
    libelleVarianteFige: string;
    prixFigeCentimes: number;
    quantite: number;
  }[];
};

/**
 * Emet la facture d'une commande, ou rend celle qui existe deja.
 *
 * RENVOYEE, JAMAIS RECREEE, exigence de `payments.md` et du critere 3. Le
 * chemin de sortie anticipe est la garantie : sans lui, la contrainte
 * `facture_commande_id_key` refuserait bien la seconde ecriture, mais en
 * faisant AVORTER la transaction entiere, code `25P02`, ce qui perdrait aussi
 * le paiement et le mouvement de stock deja ecrits.
 *
 * LE NUMERO N'EST RESERVE QU'APRES CETTE SORTIE, et l'ordre porte le critere 2.
 * Reserver avant de verifier consommerait un rang a chaque rejeu : la sequence
 * porterait des trous, qu'un controle fiscal lit comme des factures disparues.
 *
 * LE COMPTEUR EST PRIS EN DERNIER DANS CETTE TRANSACTION, et ce point demande
 * de l'attention. `repositories/commande.ts` pose l'ordre global « compteur puis
 * variantes triees », valable pour `passerCommande` qui verrouille ensuite les
 * variantes. Ici les variantes sont DEJA verrouillees par la confirmation quand
 * la facture arrive : prendre le compteur maintenant n'inverse aucun ordre, il
 * ajoute un dernier verrou apres les autres. Un chemin qui prendrait le compteur
 * PUIS une variante deja tenue ici creerait le cycle, ce qu'aucun n'a le droit
 * de faire, et c'est pourquoi la regle reste ecrite au plus pres du compteur.
 */
export async function emettreFacture(
  client: ClientBase,
  commande: CommandeAFacturer,
): Promise<FactureEmiseAvecAcces> {
  const existante = await lireFactureDeCommande(client, commande.id);

  if (existante !== null) {
    return existante;
  }

  // L'EMETTEUR EST LU AVANT DE RESERVER LE NUMERO : une configuration absente
  // ne doit pas consommer de rang, meme raison que ci-dessus.
  const emetteur = lireEmetteur();

  const instantaneLegal = construireInstantane(commande, emetteur);

  const { annee, rang } = await reserverNumero(client, "FACTURE");
  const numero = `F-${annee}-${String(rang).padStart(4, "0")}`;

  const facture = await ecrireFacture(client, {
    commandeId: commande.id,
    numero,
    montantTotalCentimes: commande.totalCentimes,
    instantaneLegal,
  });

  /*
   * LE JETON D'ACCES NAIT AVEC LA FACTURE, LS-132, DANS CETTE TRANSACTION. Un
   * achat sans compte produit un document que le client doit pouvoir lire :
   * sans session, l'autorisation ne peut venir que d'un jeton signe,
   * invariant 2. L'ecrire par un chemin separe laisserait exister des factures
   * sans moyen d'acces, decouvertes une par une par des clients qui reclament.
   *
   * SEULE L'EMPREINTE EST ECRITE, regle L5. La valeur ressort vers l'appelant,
   * qui la transmet par email, LS-82, et ne la conserve nulle part : une fuite
   * de la table ne donne aucun acces.
   *
   * LE CHEMIN DE SORTIE ANTICIPE PLUS HAUT LE COUVRE AUSSI. Un rejeu trouve la
   * facture existante et ressort avant d'arriver ici, donc n'engendre pas un
   * second jeton : `facture (commande_id)` etant unique, un jeton par rejeu
   * s'accumulerait sans que rien ne le borne.
   */
  const jeton = engendrerJeton();

  await ecrireJeton(client, {
    commandeId: commande.id,
    empreinte: jeton.empreinte,
    portee: "DOCUMENT",
    expireA: expirationDocument(),
  });

  /*
   * LE JETON DE RETRACTATION NAIT AU MEME ENDROIT, LS-134, ET POUR LA MEME
   * RAISON. Un achat sans compte ouvre le meme droit de retractation qu'un
   * achat avec compte, article L221-21, et l'ecran de `/compte` est derriere
   * une session : sans ce jeton, un client sans compte n'a AUCUNE
   * fonctionnalite en ligne pour se retracter, ce que L221-20 sanctionne par
   * un delai porte a douze mois.
   *
   * LE MEME CHEMIN DE SORTIE ANTICIPE LE PROTEGE DU REJEU, `facture
   * (commande_id)` etant unique : un evenement rejoue ressort avant d'arriver
   * ici et n'engendre pas un second jeton.
   *
   * SA DUREE EST PLUS LONGUE QUE CELLE DU DOCUMENT, soixante jours contre
   * trente : le delai de retractation court a compter de la RECEPTION, qui
   * survient plusieurs jours apres cette emission.
   *
   * LA VALEUR RESSORT MAIS PERSONNE NE LA TRANSMET ENCORE, exactement comme
   * `jetonAcces` : l'email de confirmation qui portera les deux liens n'est pas
   * branche, il appartient a LS-172. Tant qu'il n'existe pas, un acheteur sans
   * compte ne RECOIT pas son lien, meme si la route qui le consomme existe.
   * Ne pas lire cette emission comme une couverture complete de L221-21.
   *
   * DEUX JETONS ET NON UN SEUL, regle L6, moindre privilege. Un jeton unique
   * qui ouvrirait la facture ET la retractation ferait d'une fuite du lien de
   * facture un pouvoir de retracter la commande d'autrui.
   */
  const jetonRetractation = engendrerJeton();

  await ecrireJeton(client, {
    commandeId: commande.id,
    empreinte: jetonRetractation.empreinte,
    portee: "RETRACTATION",
    expireA: expirationRetractation(),
  });

  return {
    ...facture,
    jetonAcces: jeton.valeur,
    jetonRetractation: jetonRetractation.valeur,
  };
}

/**
 * Assemble le contenu integral du document, regle F7.
 *
 * TOUT VIENT DE LA COMMANDE ET DE LA CONFIGURATION, jamais du catalogue,
 * invariant 3. Les libelles et les prix sont ceux que `LigneCommande` a figes a
 * l'achat : relire la variante ici ferait dependre une facture emise du prix
 * actuel, ce que le critere 5 interdit et verifie.
 *
 * VALIDE PAR ZOD AVANT D'ETRE ECRIT, et la validation n'est pas decorative sur
 * un champ `Json`. La colonne accepte n'importe quelle forme : sans contrat, une
 * cle oubliee ne se verrait qu'a la relecture du document, des annees plus tard,
 * quand plus rien ne permet de la reconstituer.
 */
function construireInstantane(
  commande: CommandeAFacturer,
  emetteur: EmetteurFacture,
): ReturnType<typeof schemaInstantaneLegal.parse> {
  return schemaInstantaneLegal.parse({
    version: VERSION_INSTANTANE_LEGAL,
    emetteur,
    client: {
      nom: commande.nomClient,
      email: commande.emailNormalise,
      adresseFacturation: commande.adresseFacturation as AdresseFigee,
    },
    commande: {
      numero: commande.numero,
      passeeA: commande.creeA.toISOString(),
    },
    lignes: commande.lignes.map((ligne) => ({
      referenceFigee: ligne.referenceFigee,
      libelleProduit: ligne.libelleProduitFige,
      libelleVariante: ligne.libelleVarianteFige,
      prixUnitaireCentimes: ligne.prixFigeCentimes,
      quantite: ligne.quantite,
    })),
    sousTotalCentimes: commande.sousTotalCentimes,
    fraisPortCentimes: commande.fraisPortCentimes,
    totalCentimes: commande.totalCentimes,
    /*
     * LA MENTION EST OBLIGATOIRE ET TEXTUELLE, article 293 B du CGI. Un tableau
     * plutot qu'une chaine : d'autres mentions s'y ajouteront, delai de
     * retractation ou penalites de retard, sans changer la structure du
     * document ni sa version.
     */
    mentions: [MENTION_FRANCHISE_TVA],
  });
}
