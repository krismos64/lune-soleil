/**
 * Revalidation du panier, LS-114. Etape 3 du parcours 1.
 *
 * CE SERVICE EST LE COEUR DE LA STORY. Le cookie est signe, donc non
 * falsifiable, mais il reste PERIMABLE : le prix, le nom et la disponibilite
 * ont pu changer depuis l'ajout. Le parcours 1 est explicite, « le navigateur
 * n'est jamais source de verite ».
 *
 * TOUT MONTANT VIENT D'ICI, jamais du cookie ni du navigateur, invariant 1 et
 * regle de `payments.md`. Les calculs se font en centimes entiers.
 *
 * IL NE TOUCHE AUCUN STOCK. Ajouter au panier n'immobilise rien : la
 * reservation a lieu a l'etape 4, dans la transaction de LS-117. Depuis LS-238,
 * `verifierQuantiteDemandee` refuse l'ajout d'une quantite superieure au
 * disponible, mais c'est un confort de lecture et non une garantie : la piece
 * peut partir entre l'ajout et le paiement, et la revalidation le signale.
 */
import { prisma } from "@/lib/prisma";
import {
  QUANTITE_MAXIMALE_PAR_LIGNE,
  type LignePanierCookie,
} from "@/lib/panier-cookie";
import * as depot from "@/repositories/panier";

/** Pourquoi une ligne ne peut pas etre commandee telle quelle. */
export type MotifIndisponible =
  "VARIANTE_INTROUVABLE" | "PLUS_VENDABLE" | "EPUISE" | "QUANTITE_REDUITE";

/** Une ligne de panier revalidee contre la base. */
export type LignePanierRevalidee = {
  varianteId: string;
  libelle: string;
  produitNom: string;
  produitSlug: string;
  mediaChemin: string | null;
  mediaTexteAlternatif: string | null;
  /** Quantite retenue, deja ramenee au disponible le cas echeant. */
  quantite: number;
  /** Quantite demandee par le cookie, si elle a du etre reduite. */
  quantiteDemandee: number;
  /**
   * Plus grande quantite que le selecteur peut proposer, LS-238 : le
   * disponible, borne par `QUANTITE_MAXIMALE_PAR_LIGNE`. Zero sur une ligne
   * qu'on ne peut pas commander.
   */
  quantiteMaximale: number;
  prixUnitaireCentimes: number;
  totalLigneCentimes: number;
  motif: MotifIndisponible | null;
};

/** Le panier tel que l'ecran doit l'afficher. */
export type PanierRevalide = {
  lignes: LignePanierRevalidee[];
  totalArticlesCentimes: number;
  nombreArticles: number;
  /**
   * `true` si au moins une ligne a change depuis l'ajout.
   *
   * L'ECRAN DOIT ALORS DEMANDER CONFIRMATION avant de poursuivre, cas d'erreur
   * « prix ou produit modifie » du parcours 1. Le drapeau est calcule ici parce
   * que c'est une regle metier, pas une decision d'affichage.
   */
  aChange: boolean;
};

/**
 * Revalide un panier contre la base.
 *
 * `totalPresenteCentimes` EST OPTIONNEL, et c'est le mecanisme de detection du
 * cas d'erreur « prix ou produit modifie ». L'appelant transmet le total qu'il
 * a AFFICHE au visiteur ; si le total recalcule differe, `aChange` passe a
 * `true` et l'ecran demande confirmation.
 *
 * POURQUOI PAS UN PRIX DANS LE COOKIE, qui rendrait la comparaison triviale :
 * ce prix serait fourni par le navigateur, donc choisi par le client. Il
 * suffirait d'ajouter au panier, d'attendre une hausse et de commander a
 * l'ancien tarif. Le total presente vient d'un formulaire, il n'autorise rien
 * non plus : il ne sert QU'A detecter un ecart, jamais a calculer un montant.
 */
export async function revalider(
  lignesCookie: LignePanierCookie[],
  totalPresenteCentimes?: number,
): Promise<PanierRevalide> {
  const variantes = await depot.lireVariantesDuPanier(
    prisma,
    lignesCookie.map((ligne) => ligne.varianteId),
  );

  const parIdentifiant = new Map(
    variantes.map((variante) => [variante.varianteId, variante]),
  );

  const lignes: LignePanierRevalidee[] = [];
  let totalArticlesCentimes = 0;
  let nombreArticles = 0;

  for (const ligneCookie of lignesCookie) {
    const variante = parIdentifiant.get(ligneCookie.varianteId);

    /*
     * UNE VARIANTE INTROUVABLE N'EST PAS UNE ERREUR TECHNIQUE. Le cas se produit
     * quand un cookie survit a une suppression en base, ou porte un identifiant
     * inconnu. La ligne est signalee, le reste du panier tient, critere 7.
     */
    if (variante === undefined) {
      lignes.push({
        varianteId: ligneCookie.varianteId,
        libelle: "Pièce indisponible",
        produitNom: "Pièce indisponible",
        produitSlug: "",
        mediaChemin: null,
        mediaTexteAlternatif: null,
        quantite: 0,
        quantiteDemandee: ligneCookie.quantite,
        quantiteMaximale: 0,
        prixUnitaireCentimes: 0,
        totalLigneCentimes: 0,
        motif: "VARIANTE_INTROUVABLE",
      });
      continue;
    }

    const motif = motifDeLaLigne(variante, ligneCookie.quantite);

    /*
     * LA QUANTITE EST RAMENEE AU DISPONIBLE plutot que la ligne rejetee. Un
     * visiteur qui a mis trois exemplaires et n'en trouve plus qu'un doit
     * pouvoir acheter cet exemplaire : vider la ligne lui ferait perdre la
     * piece au profit du suivant.
     */
    const quantite = Math.min(
      ligneCookie.quantite,
      variante.quantiteDisponible,
    );
    const totalLigneCentimes = variante.prixCentimes * quantite;

    totalArticlesCentimes += totalLigneCentimes;
    nombreArticles += quantite;

    lignes.push({
      varianteId: variante.varianteId,
      libelle: variante.libelle,
      produitNom: variante.produitNom,
      produitSlug: variante.produitSlug,
      mediaChemin: variante.mediaChemin,
      mediaTexteAlternatif: variante.mediaTexteAlternatif,
      quantite,
      quantiteDemandee: ligneCookie.quantite,
      quantiteMaximale: variante.vendable
        ? Math.min(variante.quantiteDisponible, QUANTITE_MAXIMALE_PAR_LIGNE)
        : 0,
      prixUnitaireCentimes: variante.prixCentimes,
      totalLigneCentimes,
      motif,
    });
  }

  const aChange =
    lignes.some((ligne) => ligne.motif !== null) ||
    (totalPresenteCentimes !== undefined &&
      totalPresenteCentimes !== totalArticlesCentimes);

  return { lignes, totalArticlesCentimes, nombreArticles, aChange };
}

/**
 * Pourquoi cette ligne ne peut pas etre commandee telle quelle, ou `null`.
 *
 * L'ORDRE DES TESTS COMPTE. Une variante archivee est aussi a zero disponible :
 * annoncer « épuisé » sur une piece retiree du catalogue serait faux, et
 * laisserait croire qu'elle reviendra. Le motif le plus explicatif l'emporte.
 */
function motifDeLaLigne(
  variante: depot.VariantePanier,
  quantiteDemandee: number,
): MotifIndisponible | null {
  if (!variante.vendable) {
    return "PLUS_VENDABLE";
  }

  if (variante.quantiteDisponible === 0) {
    return "EPUISE";
  }

  if (quantiteDemandee > variante.quantiteDisponible) {
    return "QUANTITE_REDUITE";
  }

  return null;
}

/**
 * Nombre d'articles du panier, pour le compteur de l'en-tete.
 *
 * IL SOMME LES QUANTITES DU COOKIE, sans requete en base. Le compteur est rendu
 * sur CHAQUE page du site : y ajouter une lecture de base ferait payer une
 * requete a toute la navigation pour un chiffre indicatif.
 *
 * IL PEUT DONC DIFFERER du `nombreArticles` de la revalidation, qui lui est
 * ramene au disponible. L'ecart est assume : le compteur annonce ce que le
 * visiteur a mis, la page du panier dit ce qu'il peut reellement acheter.
 */
export function compterArticles(lignes: LignePanierCookie[]): number {
  return lignes.reduce((total, ligne) => total + ligne.quantite, 0);
}

/** Verdict sur une quantite demandee pour une variante, LS-238. */
export type VerdictQuantite =
  { accepte: true } | { accepte: false; message: string };

/**
 * Dit si le panier peut porter `quantiteTotale` exemplaires d'une variante.
 *
 * LS-238, RELEVE PAR L'EXPLOITANTE EN RECETTE. Ajouter une seconde fois une
 * piece unique repondait « Ajouté au panier. », puis la page du panier
 * ramenait la quantite a un sans que le visiteur comprenne pourquoi. Le refus
 * arrive desormais AU MOMENT DU GESTE, avec la raison.
 *
 * CE N'EST PAS UNE GARANTIE DE STOCK, et rien ici ne la remplace. La lecture
 * precede l'ecriture du cookie sans verrou : deux visiteurs peuvent tous deux
 * mettre la derniere piece au panier. C'est voulu, un panier n'immobilise
 * rien ; la reservation atomique de LS-117 tranche au paiement.
 *
 * `quantiteTotale` EST LE CUMUL VISE, pas l'increment : l'appelant ajoute ce
 * que le panier porte deja. `dejaAuPanier` ne sert qu'a formuler le message.
 */
export async function verifierQuantiteDemandee(
  varianteId: string,
  quantiteTotale: number,
  dejaAuPanier: number,
): Promise<VerdictQuantite> {
  const [variante] = await depot.lireVariantesDuPanier(prisma, [varianteId]);

  if (variante === undefined || !variante.vendable) {
    return { accepte: false, message: "Cette pièce n'est plus disponible." };
  }

  const disponible = variante.quantiteDisponible;

  if (disponible === 0) {
    return { accepte: false, message: "Cette pièce est épuisée." };
  }

  if (quantiteTotale <= disponible) {
    return { accepte: true };
  }

  return {
    accepte: false,
    message: messageStockInsuffisant(disponible, dejaAuPanier),
  };
}

function messageStockInsuffisant(
  disponible: number,
  dejaAuPanier: number,
): string {
  const reste =
    disponible === 1
      ? "il n'en reste qu'un exemplaire"
      : `il n'en reste que ${disponible} exemplaires`;

  if (dejaAuPanier > 0) {
    return dejaAuPanier >= disponible
      ? `Cette pièce est déjà dans votre panier, ${reste}.`
      : `Votre panier en contient déjà ${dejaAuPanier}, ${reste}.`;
  }

  return `Quantité indisponible, ${reste}.`;
}
