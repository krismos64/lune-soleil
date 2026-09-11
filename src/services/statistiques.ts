/**
 * Indicateurs d'activité, ventes web et marchés confondus. LS-64.
 *
 * `docs/architecture/STATISTIQUES.md` EST LA SOURCE DE VÉRITÉ, et ce fichier
 * applique ses règles plutôt que de les redéfinir. Les requêtes vivent dans
 * `repositories/statistiques.ts`, ce module porte les cas d'usage.
 *
 * QUATRE RÈGLES SE TIENNENT ENSEMBLE ET AUCUNE NE SE RELÂCHE.
 *
 * LE BRUT N'EST JAMAIS DIMINUÉ DES REMBOURSEMENTS, et les trois montants
 * s'affichent ensemble, le net jamais seul. Les fondre rendrait impossible de
 * répondre à « combien ai-je encaissé en juin », question à laquelle
 * l'e-reporting de LS-35 devra répondre.
 *
 * LE NET PEUT ÊTRE NÉGATIF sur un mois à faible activité, et il n'est PAS borné
 * à zéro : c'est la réalité comptable de ce mois-là, que l'affichage ne doit ni
 * masquer ni corriger.
 *
 * LE PANIER MOYEN NE PORTE QUE LES VENTES WEB. Diviser un montant incluant les
 * marchés par un nombre de commandes produirait un chiffre sans signification,
 * une vente de marché n'étant pas une commande.
 *
 * AUCUN FLOTTANT, invariant 1. Le seul quotient de ce module est une division
 * ENTIÈRE en centimes : l'arrondi appartient à l'affichage.
 */
import { prisma } from "@/lib/prisma";
import {
  bornesPeriodeStatistique,
  type ValeurPeriodeStatistique,
} from "@/lib/periode-comptable";
import {
  lireEvolutionQuotidienne,
  lireMeilleuresVentes,
  lireMontants,
  lireRepartitionLivraison,
  lireVariantesInvendues,
} from "@/repositories/statistiques";
import type {
  PartModeLivraison,
  PointEvolution,
  VarianteInvendue,
  VenteParVariante,
} from "@/repositories/statistiques";

/**
 * Nombre de lignes des deux palmarès.
 *
 * CINQ ET NON VINGT : ces listes servent à DÉCIDER, refabriquer une pièce qui
 * marche ou retirer une pièce qui dort. Une liste longue ne se lit pas, et le
 * catalogue ouvrira avec dix à vingt références.
 */
const LIGNES_PALMARES = 5;

/** Ce que l'écran reçoit, tous indicateurs composés. */
export type Statistiques = {
  periode: { debut: Date; fin: Date };
  /** Ventes web plus ventes de marché, frais de port compris. */
  brutCentimes: number;
  brutWebCentimes: number;
  brutExterneCentimes: number;
  remboursementsCentimes: number;
  /** Brut moins remboursements imputés à la période. Peut être NÉGATIF. */
  netCentimes: number;
  commandesPayees: number;
  bijouxVendus: number;
  /** `null` quand aucune commande web n'a été payée, jamais zéro. */
  panierMoyenWebCentimes: number | null;
  fraisPortCentimes: number;
  evolution: PointEvolution[];
  meilleuresVentes: VenteParVariante[];
  variantesInvendues: VarianteInvendue[];
  repartitionLivraison: PartModeLivraison[];
  /** `true` quand rien n'a été encaissé ni remboursé sur la période. */
  periodeVide: boolean;
};

/**
 * Compose les indicateurs d'une période.
 *
 * LES CINQ LECTURES SONT PARALLÈLES ET NON SÉQUENTIELLES : elles ne dépendent
 * pas les unes des autres, et les enchaîner multiplierait par cinq le temps
 * d'affichage d'un écran que l'exploitante ouvre pour un coup d'œil.
 *
 * `maintenant` EST UN PARAMÈTRE, jamais `new Date()` lu au fond de la fonction :
 * c'est ce qui rend « ce mois-ci » testable sans attendre le mois prochain, et
 * ce qui permet à un test de franchir un minuit.
 */
export async function lireStatistiques(
  valeur: ValeurPeriodeStatistique,
  maintenant: Date = new Date(),
): Promise<Statistiques> {
  const periode = bornesPeriodeStatistique(valeur, maintenant);

  const [
    montants,
    evolution,
    meilleuresVentes,
    variantesInvendues,
    repartitionLivraison,
  ] = await Promise.all([
    lireMontants(prisma, periode),
    lireEvolutionQuotidienne(prisma, periode),
    lireMeilleuresVentes(prisma, periode, LIGNES_PALMARES),
    lireVariantesInvendues(prisma, LIGNES_PALMARES),
    lireRepartitionLivraison(prisma, periode),
  ]);

  const brutCentimes = montants.brutWebCentimes + montants.brutExterneCentimes;

  return {
    periode,
    brutCentimes,
    brutWebCentimes: montants.brutWebCentimes,
    brutExterneCentimes: montants.brutExterneCentimes,
    remboursementsCentimes: montants.remboursementsCentimes,
    /*
     * LE NET N'EST PAS BORNÉ À ZÉRO. Sur un mois à faible activité, les
     * remboursements peuvent dépasser les encaissements : c'est la réalité
     * comptable de ce mois-là, et la masquer produirait un chiffre faux.
     */
    netCentimes: brutCentimes - montants.remboursementsCentimes,
    commandesPayees: montants.commandesPayees,
    bijouxVendus: montants.bijouxVendus,
    panierMoyenWebCentimes: panierMoyen(
      montants.brutWebCentimes,
      montants.commandesPayees,
    ),
    fraisPortCentimes: montants.fraisPortCentimes,
    evolution,
    meilleuresVentes,
    variantesInvendues,
    repartitionLivraison,
    /*
     * LA PÉRIODE EST VIDE QUAND RIEN N'A BOUGÉ, ni encaissement ni
     * remboursement. Le distinguer de « tout à zéro » permet à l'écran de dire
     * « aucune vente sur cette période » plutôt que d'afficher des zéros muets
     * et un graphique plat, critère 10.
     */
    periodeVide:
      brutCentimes === 0 &&
      montants.remboursementsCentimes === 0 &&
      montants.commandesPayees === 0,
  };
}

/**
 * Le panier moyen des ventes WEB, en centimes entiers.
 *
 * `null` ET NON ZÉRO QUAND AUCUNE COMMANDE N'A ÉTÉ PAYÉE. Zéro se lirait comme
 * « le panier moyen vaut zéro euro », ce qui est faux : il n'existe pas. C'est
 * la différence entre une mesure nulle et une mesure absente, et l'écran ne
 * peut la faire que si le service la porte.
 *
 * DIVISION ENTIÈRE, invariant 1. Le quotient se fait en centimes et l'arrondi
 * appartient à l'affichage : passer par un flottant réintroduirait le décimal
 * que l'invariant refuse, sur une valeur qui finit dans un tableau de bord.
 *
 * EXPORTÉE POUR ÊTRE TESTÉE SANS BASE. La règle qui compte est ici, pas dans la
 * requête : un test d'intégration la prouverait aussi, en payant une base pour
 * une division.
 */
export function panierMoyen(
  brutWebCentimes: number,
  commandesPayees: number,
): number | null {
  if (commandesPayees === 0) {
    return null;
  }

  return Math.trunc(brutWebCentimes / commandesPayees);
}

/**
 * La part d'un canal dans le brut, en pour cent entiers.
 *
 * ELLE REND `null` SUR UN BRUT NUL, jamais zéro ni cent : une part n'a pas de
 * sens sans total, et afficher « 0 % web » sur une période sans vente
 * laisserait croire que tout est passé par les marchés.
 *
 * ARRONDI AU PLUS PROCHE ET NON TRONQUÉ, à la différence du panier moyen : une
 * part est un affichage, pas un montant. Les deux parts peuvent donc totaliser
 * 101, ce que l'écran assume plutôt que de forcer l'une à compléter l'autre,
 * ce qui ferait mentir la plus petite.
 */
export function partEnPourCent(
  partCentimes: number,
  totalCentimes: number,
): number | null {
  if (totalCentimes === 0) {
    return null;
  }

  return Math.round((partCentimes * 100) / totalCentimes);
}
