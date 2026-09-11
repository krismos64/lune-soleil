/**
 * Parametres commerciaux de la boutique, LS-98, ADR-043.
 *
 * CE QUE CE SERVICE DECIDE, ET QUE LE REPOSITORY IGNORE : qu'une ligne absente
 * est une panne de configuration et non un etat normal, et que l'ecriture est
 * une action sensible qui exige le role et la reauthentification.
 *
 * ADR-043 REMPLACE L'ARBITRAGE DU 31 AOUT 2026 pour ces valeurs seulement.
 * L'identite legale reste dans l'environnement, `lib/identite-legale.ts` : un
 * SIRET est un fait administratif, un seuil de franchise un levier commercial.
 *
 * LA CONFIGURATION EST LUE A CHAQUE APPEL, jamais mise en cache en module. Une
 * constante figee au demarrage du processus rendrait un changement invisible
 * jusqu'au redeploiement, ce qui annulerait l'objet de cet ADR. Meme motif que
 * `cleDeSignature` dans `lib/jeton-acces.ts`.
 */
import {
  type ConfigurationLivraison,
  ConfigurationLivraisonInvalideError,
  configurationDepuisParametres,
} from "@/lib/livraison";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import { schemaParametresBoutique } from "@/lib/validation";
import {
  type ClientBase,
  type ParametresAEcrire,
  type ParametresLus,
  ecrireParametres,
  lireParametres,
} from "@/repositories/parametres";

export type { ParametresLus } from "@/repositories/parametres";

/**
 * Parametres absents de la base.
 *
 * UNE CLASSE DEDIEE ET NON UNE `Error` NUE, meme motif que
 * `ConfigurationLivraisonInvalideError` : l'appelant doit pouvoir distinguer une
 * configuration manquante d'une panne, la premiere se corrigeant par l'ecran de
 * parametres et jamais par un rejeu.
 */
export class ParametresAbsentsError extends Error {
  constructor() {
    super(
      "Aucune ligne de parametres en base. La migration l'amorce, ADR-043 : une base restauree avant cette migration doit etre re-migree.",
    );
    this.name = "ParametresAbsentsError";
  }
}

/**
 * Lit les parametres, ou leve s'ils sont absents.
 *
 * ELLE LEVE PLUTOT QUE DE SE REPLIER, et c'est le meme choix que
 * `lireConfigurationLivraison` faisait deja sur l'environnement. Un repli sur
 * des valeurs par defaut facturerait un port que personne n'a decide, et le
 * defaut ne se verrait qu'a la premiere commande.
 *
 * LES PAGES PUBLIQUES RATTRAPENT DEJA CETTE LEVEE, `/aide` et
 * `/informations-legales` : elles masquent leur bloc de tarifs plutot que
 * d'annoncer un montant invente.
 */
export async function lireParametresBoutique(
  client: ClientBase = prisma,
): Promise<ParametresLus> {
  const parametres = await lireParametres(client);

  if (parametres === null) {
    throw new ParametresAbsentsError();
  }

  return parametres;
}

/** Ce qu'un enregistrement de parametres produit. */
export type IssueEnregistrement =
  | { statut: "ENREGISTRE"; parametres: ParametresLus }
  /**
   * Regle d'ADR-043 decision 3 : la franchise ne vaut que pour les modes en
   * relais, et le domicile ne doit donc jamais etre moins cher que le seuil ne
   * le laisse croire.
   */
  | { statut: "REFUSE_SEUIL_SOUS_TARIF" };

/**
 * Enregistre les parametres apres validation.
 *
 * LA VALIDATION ZOD EST ICI ET NON DANS L'ADAPTATEUR, socle de LS-71 : c'est le
 * point d'entree du cas d'usage. L'adaptateur convertit les chaines du
 * formulaire en nombres, ce service juge les valeurs.
 *
 * ------------------------------------------------------------------
 * LE REFUS METIER, ET POURQUOI IL N'EST PAS UNE CONTRAINTE DE BASE.
 *
 * Un seuil de franchise INFERIEUR au tarif relais est une incoherence
 * commerciale : il rendrait la livraison gratuite sur des commandes qui ne la
 * financent pas, et le seuil perdrait son role d'incitation.
 *
 * CE N'EST PAS UN CHECK parce que ce n'est pas une impossibilite. Une boutique
 * peut vouloir un seuil bas pendant une operation commerciale, et une contrainte
 * de base refuserait pour toujours ce qui est une decision de l'exploitante. Le
 * service refuse la valeur ABSURDE, un seuil sous le cout du port lui-meme,
 * jamais une valeur simplement agressive.
 *
 * LA BORNE EST LE TARIF RELAIS ET NON LE TARIF DOMICILE, ADR-035 : la franchise
 * ne s'applique qu'aux modes en relais, comparer au domicile refuserait des
 * seuils parfaitement coherents.
 * ------------------------------------------------------------------
 */
export async function enregistrerParametres(
  entree: unknown,
  client: ClientBase = prisma,
): Promise<IssueEnregistrement> {
  const valide: ParametresAEcrire = valider(schemaParametresBoutique, entree);

  /*
   * ZERO EST EXPLICITEMENT AUTORISE, et cette exception a ete trouvee par le
   * test d'integration plutot que pensee a l'avance.
   *
   * Un seuil a zero signifie « livraison TOUJOURS offerte en relais », decision
   * commerciale legitime et distincte de `null`, qui desactive la franchise.
   * Sans cette exception, la borne ci-dessous le refusait : zero est inferieur
   * a 410, donc l'exploitante ne pouvait PAS offrir le port, alors que la
   * colonne l'accepte et que le CHECK l'autorise.
   *
   * LA BORNE NE VISE QUE LES VALEURS INCOHERENTES ENTRE DEUX, un seuil de
   * 2 euros sur un port de 4,10 : la livraison y serait offerte sur des paniers
   * qui ne la financent pas, sans que ce soit une gratuite assumee.
   */
  if (
    valide.seuilFranchiseCentimes !== null &&
    valide.seuilFranchiseCentimes !== 0 &&
    valide.seuilFranchiseCentimes < valide.tarifRelaisCentimes
  ) {
    return { statut: "REFUSE_SEUIL_SOUS_TARIF" };
  }

  const parametres = await ecrireParametres(client, valide);

  return { statut: "ENREGISTRE", parametres };
}

/**
 * Resout la configuration tarifaire depuis la base.
 *
 * ------------------------------------------------------------------
 * CE QUI A CHANGE, ET CE QUI N'A PAS CHANGE, ADR-043.
 *
 * Elle remplace `lireConfigurationLivraison` de `lib/livraison.ts`, qui lisait
 * l'environnement. Le CALCUL, lui, n'a pas bouge d'une ligne :
 * `calculerFraisPort` reste synchrone et pur, recoit la configuration en
 * argument, et ses tests unitaires tournent sans base.
 *
 * C'EST CE QUI REND LA MIGRATION SURE. Le chemin du paiement traverse ce
 * calcul : deplacer la lecture sans toucher au calcul laisse intacte la partie
 * dont la correction est prouvee par les tests de concurrence.
 *
 * ELLE LEVE `ConfigurationLivraisonInvalideError` et non
 * `ParametresAbsentsError`, deliberement : les deux pages publiques qui
 * rattrapent deja la premiere continuent de masquer leur bloc de tarifs sans
 * changement. Ajouter une seconde classe a rattraper aurait fait rendre 500 a
 * une page que la loi impose d'afficher, motif « configuration corrigee a
 * moitie » releve par `ls-frontend-revue` le 3 septembre 2026.
 * ------------------------------------------------------------------
 */
export async function resoudreConfigurationLivraison(
  client: ClientBase = prisma,
): Promise<ConfigurationLivraison> {
  const parametres = await lireParametres(client);

  if (parametres === null) {
    throw new ConfigurationLivraisonInvalideError(
      "Aucune ligne de parametres en base, le tarif de livraison ne peut pas etre devine.",
    );
  }

  return configurationDepuisParametres(parametres);
}
