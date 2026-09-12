/**
 * Correspondance des methodes d'expedition Sendcloud, LS-218.
 *
 * CE MODULE NE FAIT AUCUN APPEL RESEAU et ne connait ni Prisma ni la base :
 * c'est une table de correspondance pure, testable sans rien monter, meme
 * decoupage que `statuts.ts` pour le suivi.
 *
 * CE QU'IL DECIDE : quelle methode Sendcloud correspond au mode de livraison
 * choisi par le client. Ce qu'il ne decide pas : quand une etiquette est creee,
 * qui appartient au service, ni comment elle est payee.
 *
 * LES IDENTIFIANTS VIENNENT DE L'API REELLE, releves le 10 septembre 2026 sur
 * `GET /api/v2/shipping_methods?to_country=FR` avec les cles de production. Ne
 * jamais les inventer : un identifiant faux cree une etiquette au mauvais
 * tarif, et une etiquette creee est FACTUREE, sans mode test chez Sendcloud.
 */
import type { ModeLivraison } from "@/generated/prisma/enums";

/**
 * Poids maximum d'un colis pour la tranche d'expedition retenue, en grammes.
 *
 * CE N'EST PAS LE POIDS EMPLOYE, c'est sa BORNE. Le poids reel est un reglage,
 * `ParametreBoutique.poidsColisGrammes`, arbitrage de Christophe du
 * 10 septembre 2026 : « configurable et non une constante, lisible et
 * modifiable, jamais enfoui dans le code ». La premiere livraison de LS-218
 * l'avait pose en constante ici, donc modifiable par un deploiement seulement,
 * et ce module a ete corrige le 12 septembre 2026.
 *
 * POURQUOI LA BORNE RESTE ICI QUAND LA VALEUR PART EN BASE. Elle n'est pas une
 * decision commerciale : elle decoule des trois identifiants de methode
 * ci-dessous, qui couvrent tous la tranche 0 a 0,251 kg. Le jour ou cette table
 * change de tranche, la borne change avec elle, dans le meme fichier.
 *
 * 250 ET NON 251, la borne de Sendcloud etant exclusive, et pour ne pas inviter
 * a s'y coller. La meme valeur vit dans `schemaPoidsColis` et dans
 * `chk_parametre_poids_colis_borne`, qui la font respecter.
 *
 * CE QUI ROUVRIRA LE SUJET : une piece plus lourde au catalogue, un bracelet en
 * pierres ou un coffret. Le poids par VARIANTE deviendra alors necessaire, et
 * un reglage unique ne suffira plus.
 */
export const POIDS_COLIS_MAXIMUM_GRAMMES = 250;

/**
 * Le poids employe quand la base n'en porte aucun, en grammes.
 *
 * IL N'EST PAS UN REPLI DE FONCTIONNEMENT. `lireParametresBoutique` leve quand
 * la ligne manque, donc aucun chemin reel n'atteint cette valeur : elle sert de
 * DEFAUT a la colonne, migration `20260912160000_poids_colis_configurable`, et
 * l'ecrire ici la garde lisible a cote de la tranche qu'elle respecte.
 */
export const POIDS_COLIS_DEFAUT_GRAMMES = 200;

/**
 * Les methodes d'expedition, par mode de livraison, pour la tranche 0-0,25 kg.
 *
 * `Record<ModeLivraison, number>` ET NON `Record<string, number>` : un mode
 * ajoute a l'enum fait echouer le `type-check` ici, ce qui empeche une
 * expedition de partir sans methode. C'est le piege deja rencontre quatre fois
 * sur ce depot, dont `LIBELLES_LIVRAISON` en LS-57.
 *
 * LES METHODES « QR » SONT ECARTEES, deliberement. Sendcloud en propose une
 * variante par mode, ou le client presente un code au point relais au lieu
 * d'une etiquette collee. Elles changent le geste de l'exploitante ET celui du
 * client : ce serait une decision commerciale, pas un detail technique, et
 * personne ne l'a prise. Les methodes retenues produisent une etiquette
 * imprimable, ce que le parcours actuel suppose.
 *
 * LA TRANCHE EST UNIQUE PARCE QUE LE POIDS EST FORFAITAIRE. Le jour ou un poids
 * par variante existe, cette table devient une fonction du poids et non plus du
 * seul mode, et ces trois identifiants ne seront qu'une ligne de sa grille.
 */
export const METHODES_PAR_MODE: Record<ModeLivraison, number> = {
  /** `Mondial Relay Home Domestic 0-0.25kg`, 0,015 a 0,251 kg, sans point. */
  DOMICILE: 27755,
  /** `Mondial Relay Point Relais 0-0.25kg`, point de retrait EXIGE. */
  POINT_RELAIS: 28035,
  /** `Mondial Relay Locker Delivery 0-0.25kg`, point de retrait EXIGE. */
  LOCKER: 29145,
};

/**
 * Ce mode exige-t-il que l'expedition porte un point de retrait ?
 *
 * IL REFLETE `service_point_input` DE L'API, releve a `required` sur les deux
 * modes de retrait et `none` au domicile. Envoyer un colis en Point Relais sans
 * point de retrait fait echouer la creation chez Sendcloud, et l'erreur revient
 * apres l'appel reseau : la verifier ici la rend lisible avant de partir.
 *
 * IL NE DOUBLE PAS `exigePointRetrait` DE `lib/livraison`, il en dit autre
 * chose. Ce dernier decide ce que le TUNNEL demande au client ; celui-ci decrit
 * ce que le FOURNISSEUR exige. Les deux coincident aujourd'hui, et rien ne
 * garantit qu'un futur transporteur les garde alignes : les confondre ferait
 * dependre le parcours d'achat d'une contrainte d'API.
 */
export function methodeExigePointRetrait(mode: ModeLivraison): boolean {
  return mode === "POINT_RELAIS" || mode === "LOCKER";
}

/**
 * L'identifiant de methode Sendcloud pour ce mode.
 *
 * IL NE PREND AUCUN POIDS EN PARAMETRE, et c'est voulu tant que le forfait
 * existe : accepter un poids ici laisserait croire que la table le prend en
 * compte, alors qu'elle ne couvre qu'une tranche. Le jour ou le poids varie,
 * cette signature change et tous ses appelants avec, ce qui est exactement ce
 * qu'on veut.
 */
export function methodePour(mode: ModeLivraison): number {
  return METHODES_PAR_MODE[mode];
}
