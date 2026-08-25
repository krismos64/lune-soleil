/**
 * Passation de commande, LS-117. Etape 4 du parcours 1, decision d'ADR-024.
 *
 * UNE SEULE TRANSACTION, et c'est toute la story. Commande, lignes, figement
 * des montants, acceptation CGV horodatee, increment de `quantiteReservee` et
 * creation des reservations s'ecrivent ENSEMBLE. Un refus de l'`UPDATE`
 * conditionnel annule l'ensemble : aucune commande ne subsiste sans son stock,
 * et aucune piece n'est immobilisee pour une commande qui n'existera jamais.
 *
 * LE MOTIF EST UN INCIDENT CONCRET, ADR-024 : une panne entre la reservation et
 * la creation de commande laissait une reservation orpheline. La piece restait
 * indisponible trente minutes, et le client qui reessayait lisait « cette piece
 * vient d'etre vendue » alors qu'il etait le seul a la vouloir.
 *
 * LA SESSION DE PAIEMENT SE CREE APRES LE `COMMIT`, jamais ici. Elle appartient
 * a LS-118. Un appel reseau dans cette transaction tiendrait le verrou de ligne
 * de la variante pendant tout l'aller-retour, et son echec effacerait la
 * commande par rollback. Ce service ne fait donc AUCUN appel externe.
 *
 * TOUT MONTANT VIENT DU SERVEUR, invariant 1 et invariant 2. Rien n'est lu
 * depuis le navigateur : ni prix, ni frais de port, ni total. Le cookie de
 * tunnel n'en porte aucun, par construction.
 */
import { randomUUID } from "node:crypto";

import { calculerFraisPort, lireConfigurationLivraison } from "@/lib/livraison";
import { prisma } from "@/lib/prisma";
import type { SaisieTunnel } from "@/lib/tunnel-cookie";
import type { LignePanierCookie } from "@/lib/panier-cookie";
import type { ModeLivraison } from "@/generated/prisma/enums";
import { schemaPanier, valider } from "@/lib/validation";
import {
  ecrireCommande,
  ecrireLignes,
  lireDonneesAFiger,
  reserverNumero,
} from "@/repositories/commande";
import { reserverVariante } from "@/repositories/stock";
import {
  DUREE_RESERVATION_MINUTES,
  InterblocagePersistantError,
  TENTATIVES_MAXIMUM,
  estInterblocage,
  ordonnerLignes,
} from "@/services/reservation";

/**
 * Version des conditions generales acceptee a la commande.
 *
 * FIGEE SUR LA COMMANDE, regle V10 : la preuve du consentement doit dire a QUOI
 * le client a consenti. Une revision ulterieure des CGV ne doit pas reecrire ce
 * qu'une commande passee a accepte, meme raison que les libelles figes.
 *
 * ELLE VIT ICI EN ATTENDANT LES CONTENUS JURIDIQUES, LS-28. La deplacer vers un
 * parametrage se fera avec eux ; l'ecrire en dur dans deux endroits serait pire.
 */
export const VERSION_CGV = "2026-08";

/**
 * Refus metier : une piece du panier n'est plus disponible.
 *
 * UNE EXCEPTION ET NON UN RESULTAT, contrairement a `reserverPanier` qui rend
 * `{ statut: "REFUSE" }`. La difference n'est pas cosmetique : ici le refus doit
 * ANNULER la transaction qui a deja ecrit la commande et ses lignes. Rendre une
 * valeur validerait ces ecritures, `$transaction` ne les annulant que sur une
 * levee. C'est le defaut exact mesure en LS-71, transpose d'un cran plus haut.
 *
 * `varianteRefusee` nomme la piece pour que l'ecran signale LA ligne concernee,
 * critere 3, plutot que d'afficher une erreur generique.
 */
export class CommandeRefuseeError extends Error {
  constructor(readonly varianteRefusee: string) {
    super(`Variante ${varianteRefusee} indisponible.`);
    this.name = "CommandeRefuseeError";
  }
}

/** Ce que la commande ecrite rend a l'appelant. */
export type IssueCommande = {
  commandeId: string;
  numero: string;
  totalCentimes: number;
};

/**
 * Ecrit une commande et reserve son stock, en une transaction.
 *
 * `apresReservation` EST UN CROCHET DE TEST, et il est assume comme tel. Il
 * permet d'injecter une panne a l'instant precis ou une ecriture partielle
 * serait possible, ce qu'aucune coupure de connexion ne sait faire de facon
 * deterministe. Il ne fait rien en production, ou personne ne le passe.
 */
export async function passerCommande({
  lignesCookie,
  saisie,
  configuration = lireConfigurationLivraison(),
  client = prisma,
  apresReservation,
}: {
  lignesCookie: readonly LignePanierCookie[];
  /*
   * LE MODE EST EXIGE PAR LE TYPE, meme garde que `construireRecapitulatif`.
   * Ecrire une commande sur un mode non choisi produirait un `DOMICILE` que
   * personne n'a retenu, et le `CHECK` ne peut pas l'attraper, un domicile sans
   * point de retrait etant parfaitement valide.
   */
  saisie: SaisieTunnel & { mode: ModeLivraison };
  configuration?: ReturnType<typeof lireConfigurationLivraison>;
  client?: typeof prisma;
  apresReservation?: () => void;
}): Promise<IssueCommande> {
  // VALIDATION AU POINT D'ENTREE DU CAS D'USAGE, socle de LS-71. Une quantite
  // nulle, negative ou decimale part sinon jusqu'a PostgreSQL et revient en
  // erreur brute, donc en page d'erreur serveur au lieu d'un refus lisible.
  const validees = valider(schemaPanier, lignesCookie);

  const ordonnees = ordonnerLignes(validees);

  /*
   * LE REJEU BORNE ENTOURE LA TRANSACTION, LS-117. Il reprend la mecanique de
   * `reserverPanier` parce que ce service est desormais le SEUL chemin de
   * production : sans lui, le rejeu construit et prouve en LS-71 serait devenu
   * du code mort, et le chemin reel n'aurait plus aucune reprise.
   *
   * CE QUE LE TRI NE COUVRE PAS, `database.md` : il elimine les cycles entre
   * deux commandes, pas ceux qu'une transaction concurrente cree par un AUTRE
   * chemin. Une vente externe enregistree depuis un marche prend le verrou de la
   * meme variante ; selon l'entrelacement, PostgreSQL rend `40P01`. Sans rejeu,
   * le client lit une page d'erreur alors que la commande aurait abouti au
   * second essai. Releve par `ls-critical-reviewer` le 25 aout 2026.
   */
  let derniereErreur: unknown;

  for (let tentative = 1; tentative <= TENTATIVES_MAXIMUM; tentative += 1) {
    try {
      return await ecrireUneFois();
    } catch (erreur) {
      /*
       * ORDRE CRITIQUE, meme regle qu'en LS-71 : le refus metier se traite
       * AVANT l'interblocage et n'entre jamais dans le rejeu. Rejouer un refus
       * repeterait trois fois une transaction dont on sait qu'elle echouera, la
       * piece manquante ne reapparaissant pas entre deux tentatives.
       */
      if (erreur instanceof CommandeRefuseeError || !estInterblocage(erreur)) {
        throw erreur;
      }

      // La transaction est deja annulee par PostgreSQL : la tentative suivante
      // repart d'un etat propre, sans commande ni reservation a nettoyer.
      derniereErreur = erreur;
    }
  }

  throw new InterblocagePersistantError(TENTATIVES_MAXIMUM, {
    cause: derniereErreur,
  });

  /**
   * Une tentative complete.
   *
   * L'IDENTIFIANT ET L'HORODATAGE SONT ENGENDRES PAR TENTATIVE, jamais au-dessus
   * de la boucle : les figer ferait porter a la commande rejouee l'instant de la
   * tentative qui a echoue.
   */
  async function ecrireUneFois(): Promise<IssueCommande> {
    const commandeId = randomUUID();
    const acceptationCgv = new Date();

    return client.$transaction(async (transaction) => {
      /*
       * LE NUMERO EN PREMIER, ADR-031, et l'ordre n'est pas libre. Le compteur
       * est une ressource verrouillee comme les variantes : le prendre APRES
       * elles dans un seul chemin creerait un cycle, une transaction tenant la
       * variante et attendant le compteur pendant qu'une autre fait l'inverse.
       * L'ordre global est compteur, puis variantes triees par identifiant.
       */
      const { annee, rang } = await reserverNumero(transaction, "COMMANDE");
      const numero = `C-${annee}-${String(rang).padStart(4, "0")}`;

      /*
       * LES DONNEES FIGEES SONT LUES ICI, dans la transaction, et non reprises du
       * panier revalide de l'etape 3. Cette revalidation a pu avoir lieu plusieurs
       * minutes plus tot : ce que la commande fige doit etre l'etat au moment de
       * l'ecriture.
       *
       * CETTE LECTURE VERROUILLE LES VARIANTES, `FOR UPDATE OF v`, et c'est elle
       * qui prend le verrou de ligne, non plus la reservation. Sans verrou, une
       * revision de prix validee entre la lecture et la reservation faisait figer
       * l'ancien prix sur une commande ecrite apres la revision, `READ COMMITTED`
       * donnant deux versions differentes aux deux instructions.
       *
       * L'ORDRE DE PRISE RESTE INCHANGE, compteur puis variantes triees : les
       * identifiants sont deja ordonnes par `ordonnerLignes`, et la reservation
       * qui suit reprend les memes lignes dans le meme ordre, sur des verrous
       * qu'elle detient deja.
       */
      const aFiger = await lireDonneesAFiger(
        transaction,
        ordonnees.map((ligne) => ligne.varianteId),
      );
      const parVariante = new Map(
        aFiger.map((donnees) => [donnees.varianteId, donnees]),
      );

      const lignes = ordonnees.map((ligne) => {
        const donnees = parVariante.get(ligne.varianteId);

        /*
         * UNE VARIANTE DISPARUE EST UN REFUS METIER, pas une panne. Elle a pu
         * etre supprimee entre la revalidation et ici. Le client doit lire que la
         * piece n'est plus disponible, pas une page d'erreur serveur.
         */
        if (donnees === undefined) {
          throw new CommandeRefuseeError(ligne.varianteId);
        }

        return {
          commandeId,
          varianteId: ligne.varianteId,
          referenceFigee: donnees.reference,
          libelleProduitFige: donnees.libelleProduit,
          libelleVarianteFige: donnees.libelleVariante,
          prixFigeCentimes: donnees.prixCentimes,
          quantite: ligne.quantite,
        };
      });

      /*
       * LES MONTANTS SONT DES SOMMES D'ENTIERS, invariant 1. Aucun arrondi
       * n'intervient, rien n'ayant jamais quitte le domaine des centimes.
       */
      const sousTotalCentimes = lignes.reduce(
        (total, ligne) => total + ligne.prixFigeCentimes * ligne.quantite,
        0,
      );

      const fraisPortCentimes = calculerFraisPort({
        mode: saisie.mode,
        totalArticlesCentimes: sousTotalCentimes,
        configuration,
      });

      const adresse = {
        nom: saisie.nomClient,
        ligne1: saisie.adresse.ligne1,
        ...(saisie.adresse.ligne2 === undefined
          ? {}
          : { ligne2: saisie.adresse.ligne2 }),
        codePostal: saisie.adresse.codePostal,
        ville: saisie.adresse.ville,
        pays: saisie.adresse.pays,
      };

      await ecrireCommande(transaction, {
        id: commandeId,
        numero,
        emailNormalise: saisie.email.trim().toLowerCase(),
        nomClient: saisie.nomClient,
        telephone: saisie.telephone,
        /*
         * DEUX COPIES DISTINCTES ET NON UNE REFERENCE PARTAGEE. Le carnet
         * d'adresses de LS-59 permettra de les dissocier ; les faire pointer sur
         * le meme objet ferait qu'une future divergence passerait inapercue.
         */
        adresseLivraison: { ...adresse },
        adresseFacturation: { ...adresse },
        sousTotalCentimes,
        modeLivraison: saisie.mode,
        pointRelaisId: saisie.pointRetrait?.identifiant ?? null,
        /*
         * LE POINT EST COPIE AVEC SON ADRESSE, ADR-025, pas seulement son
         * identifiant : un point qui ferme rendrait sinon illisible une commande
         * passee, meme regle que les libelles figes des lignes.
         */
        pointRelaisAdresse: saisie.pointRetrait,
        fraisPortCentimes,
        totalCentimes: sousTotalCentimes + fraisPortCentimes,
        cgvAccepteesA: acceptationCgv,
        cgvVersion: VERSION_CGV,
      });

      await ecrireLignes(transaction, lignes);

      /*
       * LA RESERVATION EN DERNIER, dans l'ordre trie. Elle decide de la
       * disponibilite : un refus annule tout ce qui precede, ce qui est
       * exactement la garantie d'ADR-024.
       */
      for (const ligne of ordonnees) {
        const servie = await reserverVariante(transaction, {
          varianteId: ligne.varianteId,
          commandeId,
          quantite: ligne.quantite,
          dureeMinutes: DUREE_RESERVATION_MINUTES,
        });

        if (!servie) {
          throw new CommandeRefuseeError(ligne.varianteId);
        }
      }

      apresReservation?.();

      return {
        commandeId,
        numero,
        totalCentimes: sousTotalCentimes + fraisPortCentimes,
      };
    });
  }
}
