/**
 * Tarifs de livraison et calcul des frais de port, LS-115.
 *
 * SOURCE UNIQUE DES TARIFS ET DU SEUIL. `frontend-design.md` interdit d'ecrire
 * un tarif ou un seuil en dur dans un composant, et LS-27 critere 9 l'etend a
 * tout affichage : panier, fiche produit, emails, FAQ, page Livraison et textes
 * juridiques lisent cette configuration. Un tarif AFFICHE qui diverge du tarif
 * FACTURE est une information precontractuelle fausse, sanctionnee bien au-dela
 * de l'ecart de prix.
 *
 * TOUT EN CENTIMES ENTIERS, invariant 1. Aucun flottant n'entre dans un calcul
 * monetaire, et les entrees non entieres sont refusees plutot qu'arrondies.
 *
 * LES VALEURS VIENNENT D'ADR-025 : 410 centimes en Point Relais et Locker, 499
 * a domicile, franchise a 3900 tous modes. Elles sont dans l'environnement et
 * non ici, le seuil devant rester modifiable et desactivable sans redeploiement
 * du code.
 */
import type { ModeLivraison } from "@/generated/prisma/enums";

/** Configuration tarifaire resolue, en centimes entiers. */
export type ConfigurationLivraison = {
  /** Point Relais et Locker, meme tarif, ADR-025. */
  relaisCentimes: number;
  domicileCentimes: number;
  /** `null` quand la franchise est desactivee, ce qui n'est pas zero. */
  seuilFranchiseCentimes: number | null;
};

/**
 * Configuration absente ou hors domaine.
 *
 * UNE CLASSE DEDIEE ET NON UNE `Error` NUE : l'appelant doit pouvoir distinguer
 * une configuration manquante d'une panne, la premiere se corrigeant par un
 * deploiement et jamais par un rejeu.
 */
export class ConfigurationLivraisonInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationLivraisonInvalideError";
  }
}

/**
 * Modes proposables sans appeler le transporteur.
 *
 * PORTE LE CAS D'ERREUR « API Mondial Relay indisponible » du parcours 1. Quand
 * la liste des points de retrait ne peut pas s'afficher, ce sont ces modes qui
 * restent offerts, et la vente continue au lieu de s'arreter. C'est la raison
 * d'etre des trois modes dont un sans appel externe : une panne degrade le
 * choix, elle ne ferme pas la boutique.
 */
export const MODES_SANS_POINT_RETRAIT = [
  "DOMICILE",
] as const satisfies readonly ModeLivraison[];

/** Modes qui exigent un point de retrait, contrainte `chk_commande_mode_point_relais`. */
export const MODES_AVEC_POINT_RETRAIT = [
  "POINT_RELAIS",
  "LOCKER",
] as const satisfies readonly ModeLivraison[];

/** `true` si ce mode impose de choisir un point de retrait. */
export function exigePointRetrait(mode: ModeLivraison): boolean {
  return (MODES_AVEC_POINT_RETRAIT as readonly ModeLivraison[]).includes(mode);
}

/**
 * Lit un montant en centimes depuis l'environnement.
 *
 * REFUSE UN DECIMAL PLUTOT QUE DE L'ARRONDIR. « 4.10 » dans une variable qui
 * attend des centimes trahit une confusion euros/centimes : l'accepter
 * facturerait quatre centimes de port. Echouer nomme la variable fautive.
 */
function lireCentimes(nom: string, valeur: string): number {
  if (!/^\d+$/.test(valeur)) {
    throw new ConfigurationLivraisonInvalideError(
      `${nom} doit etre un entier de centimes, valeur refusee.`,
    );
  }

  return Number.parseInt(valeur, 10);
}

/**
 * Resout la configuration tarifaire depuis l'environnement.
 *
 * LE PARAMETRE EXISTE POUR LES TESTS, meme motif que `lireProxiesDeConfiance` :
 * une valeur d'environnement reassignee apres l'import d'un module fige n'a
 * aucun effet, et la seule facon de tester plusieurs configurations est de les
 * passer.
 *
 * UN TARIF MANQUANT LEVE, il ne se replie pas. Un repli a zero afficherait
 * « livraison offerte » partout, un repli sur une constante en dur
 * reintroduirait ce que `frontend-design.md` interdit.
 */
export function lireConfigurationLivraison(
  brut: Record<string, string | undefined> = process.env,
): ConfigurationLivraison {
  const relais = brut.SHIPPING_RELAY_RATE_CENTS;
  const domicile = brut.SHIPPING_HOME_RATE_CENTS;

  if (relais === undefined || relais === "") {
    throw new ConfigurationLivraisonInvalideError(
      "SHIPPING_RELAY_RATE_CENTS est absent, le tarif Point Relais ne peut pas etre devine.",
    );
  }

  if (domicile === undefined || domicile === "") {
    throw new ConfigurationLivraisonInvalideError(
      "SHIPPING_HOME_RATE_CENTS est absent, le tarif domicile ne peut pas etre devine.",
    );
  }

  /*
   * LE SEUIL VIDE DESACTIVE LA FRANCHISE, il ne vaut pas zero. Un seuil a zero
   * rendrait toute livraison gratuite, l'inverse exact de l'intention.
   * `.env.example` documente « laisser vide pour desactiver », LS-27 exige que
   * la franchise soit desactivable.
   */
  const seuilBrut = brut.SHIPPING_FREE_THRESHOLD_CENTS;
  const seuilFranchiseCentimes =
    seuilBrut === undefined || seuilBrut === ""
      ? null
      : lireCentimes("SHIPPING_FREE_THRESHOLD_CENTS", seuilBrut);

  return {
    relaisCentimes: lireCentimes("SHIPPING_RELAY_RATE_CENTS", relais),
    domicileCentimes: lireCentimes("SHIPPING_HOME_RATE_CENTS", domicile),
    seuilFranchiseCentimes,
  };
}

/** Tarif applicable a ce mode, franchise non appliquee. */
function tarifDuMode(
  mode: ModeLivraison,
  configuration: ConfigurationLivraison,
): number {
  return mode === "DOMICILE"
    ? configuration.domicileCentimes
    : configuration.relaisCentimes;
}

/**
 * Frais de port en centimes, pour un mode et un total d'articles.
 *
 * CE CALCUL EST LA SEULE SOURCE DU MONTANT FACTURE. Le navigateur ne le fournit
 * jamais : un frais de port recu d'un formulaire serait un frais de port choisi
 * par le client, exactement le defaut que LS-114 a ferme sur le prix du panier.
 *
 * LE SEUIL EST INCLUSIF, « a partir de 39 euros » comprend 39,00 euros. Un `>`
 * au lieu d'un `>=` facturerait le port sur la seule valeur ou le client
 * verifie que la promesse tient.
 */
export function calculerFraisPort({
  mode,
  totalArticlesCentimes,
  configuration,
}: {
  mode: ModeLivraison;
  totalArticlesCentimes: number;
  configuration: ConfigurationLivraison;
}): number {
  if (!Number.isInteger(totalArticlesCentimes) || totalArticlesCentimes < 0) {
    throw new RangeError(
      "Le total des articles doit etre un entier de centimes positif ou nul.",
    );
  }

  const { seuilFranchiseCentimes } = configuration;

  if (
    seuilFranchiseCentimes !== null &&
    totalArticlesCentimes >= seuilFranchiseCentimes
  ) {
    return 0;
  }

  return tarifDuMode(mode, configuration);
}
