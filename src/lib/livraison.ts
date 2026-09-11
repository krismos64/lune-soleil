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
 * LES VALEURS VIENNENT D'ADR-035 : 410 centimes en Point Relais et Locker, 749
 * a domicile, franchise a 3900 RESERVEE AUX MODES EN RELAIS.
 *
 * ELLES VIVENT EN BASE DEPUIS ADR-043, LS-98, et non plus dans
 * l'environnement : l'exploitante doit pouvoir changer son seuil de franchise
 * sans redeploiement, une decision commerciale n'etant pas une intervention
 * technique.
 *
 * CE FICHIER NE LIT PAS LA BASE, ET C'EST L'ARCHITECTURE. `lib/` porte des
 * utilitaires PURS, son README l'ecrit : « une requete appartient a
 * repositories/ ». La resolution vit donc dans `services/parametres.ts`, et ce
 * module recoit la configuration deja resolue. Le calcul reste synchrone,
 * testable sans base, et les tests unitaires n'ont pas bouge d'une ligne.
 *
 * LA RESERVE N'EST PAS UN PARAMETRE, elle est dans `calculerFraisPort` : aucune
 * variable d'environnement ne permet de rendre le domicile gratuit au seuil, et
 * c'est voulu. ADR-025 accordait la franchise aux trois modes sur un tarif
 * domicile suppose de 4,99 EUR ; la grille reelle du 6 septembre 2026 le facture
 * 7,49 EUR, qu'une commande de 40 EUR ne finance pas.
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
 * Projette une ligne de parametres vers la configuration tarifaire.
 *
 * ------------------------------------------------------------------
 * POURQUOI UNE PROJECTION ET NON UNE LECTURE DIRECTE.
 *
 * Ce module est dans `lib/`, dont le README interdit la requete : « une requete
 * appartient a repositories/ ». `services/parametres.ts` lit la ligne, ce
 * module la traduit en ce dont le calcul a besoin.
 *
 * LE TYPE D'ENTREE EST STRUCTUREL ET NON IMPORTE de `repositories/`. Importer
 * `ParametresLus` ici creerait une dependance de `lib/` vers `repositories/`,
 * exactement ce que l'architecture ecarte, et `verifier-regles.sh` le verrait.
 * Une forme minimale suffit : ce module n'a besoin que de trois champs sur
 * onze.
 * ------------------------------------------------------------------
 */
export function configurationDepuisParametres(parametres: {
  tarifRelaisCentimes: number;
  tarifDomicileCentimes: number;
  seuilFranchiseCentimes: number | null;
}): ConfigurationLivraison {
  /*
   * LES VALEURS SONT VERIFIEES ICI AUSSI, et ce n'est pas une redondance
   * inutile. Elles viennent de la base, donc des CHECK, mais une base restauree
   * depuis une sauvegarde anterieure aux contraintes pourrait porter n'importe
   * quoi : ce module est la derniere barriere avant un montant facture.
   *
   * UN ENTIER EST EXIGE, pas seulement un nombre positif. Un flottant arriverait
   * d'une colonne modifiee a la main, et l'invariant 1 interdit tout flottant
   * dans un calcul monetaire.
   */
  for (const [nom, valeur] of [
    ["tarifRelaisCentimes", parametres.tarifRelaisCentimes],
    ["tarifDomicileCentimes", parametres.tarifDomicileCentimes],
  ] as const) {
    if (!Number.isInteger(valeur) || valeur < 0) {
      throw new ConfigurationLivraisonInvalideError(
        `${nom} doit etre un entier de centimes positif ou nul, valeur refusee.`,
      );
    }
  }

  /*
   * `null` DESACTIVE LA FRANCHISE, il ne vaut pas zero. Un seuil a zero rendrait
   * toute livraison gratuite, l'inverse exact de l'intention : les deux valeurs
   * se distinguent donc explicitement plutot que par un `??`.
   */
  const seuil = parametres.seuilFranchiseCentimes;

  if (seuil !== null && (!Number.isInteger(seuil) || seuil < 0)) {
    throw new ConfigurationLivraisonInvalideError(
      "seuilFranchiseCentimes doit etre un entier de centimes positif ou nul, ou nul pour desactiver la franchise.",
    );
  }

  return {
    relaisCentimes: parametres.tarifRelaisCentimes,
    domicileCentimes: parametres.tarifDomicileCentimes,
    seuilFranchiseCentimes: seuil,
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
 *
 * LA FRANCHISE NE VAUT PAS POUR LE DOMICILE, ADR-035. ADR-025 l'accordait aux
 * trois modes, sur un tarif domicile de 4,99 EUR suppose. La grille reelle
 * relevee le 6 septembre 2026 le facture 7,49 EUR, montant qu'une commande de
 * 40 EUR ne finance pas, quand elle finance les 4,10 EUR du relais. Le seuil
 * garde ainsi son role d'incitation tout en dirigeant vers le mode le moins
 * couteux.
 *
 * LA CONDITION PORTE SUR `exigePointRetrait` ET NON SUR `mode !== "DOMICILE"` :
 * une quatrieme valeur ajoutee a l'enum recevrait la franchise en silence avec
 * la seconde forme, alors qu'elle devra la demander explicitement en entrant
 * dans `MODES_AVEC_POINT_RETRAIT`.
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
    exigePointRetrait(mode) &&
    seuilFranchiseCentimes !== null &&
    totalArticlesCentimes >= seuilFranchiseCentimes
  ) {
    return 0;
  }

  return tarifDuMode(mode, configuration);
}
