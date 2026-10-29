/**
 * Correspondance des options d'expedition Sendcloud, LS-218 puis LS-296.
 *
 * CE MODULE NE FAIT AUCUN APPEL RESEAU et ne connait ni Prisma ni la base :
 * c'est une table de correspondance pure, testable sans rien monter, meme
 * decoupage que `statuts.ts` pour le suivi.
 *
 * CE QU'IL DECIDE : quelle option Sendcloud correspond au mode de livraison
 * choisi par le client. Ce qu'il ne decide pas : quand une etiquette est creee,
 * qui appartient au service, ni comment elle est payee.
 *
 * LES CODES VIENNENT DE L'API REELLE, releves le 29 octobre 2026 sur
 * `POST /api/v3/shipping-options` avec les cles de production, LS-296. Ne
 * jamais les inventer : un code faux cree une etiquette au mauvais tarif, et
 * une etiquette creee est FACTUREE, sans mode test chez Sendcloud.
 *
 * L'API v2 ET SES IDENTIFIANTS NUMERIQUES SONT ABANDONNES POUR LA CREATION :
 * Sendcloud refuse `POST /api/v2/parcels` a ce compte, « Creating parcels via
 * API v2 is not available for this account. Please use API v3. », mesure le
 * 29 octobre 2026 sur la premiere commande reelle.
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
 * de la v2, qui couvraient tous la tranche 0 a 0,251 kg, et le tarif de 4,10 €
 * annonce au client est celui de cette tranche, ADR-035. La v3 ne decoupe plus
 * l'option par poids, LS-296, mais le prix reste fonction du poids : la borne
 * tient le tarif annonce, a confirmer sur la premiere facture Sendcloud.
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
 * Les options d'expedition v3, par mode de livraison.
 *
 * `Record<ModeLivraison, string>` ET NON `Record<string, string>` : un mode
 * ajoute a l'enum fait echouer le `type-check` ici, ce qui empeche une
 * expedition de partir sans option. C'est le piege deja rencontre quatre fois
 * sur ce depot, dont `LIBELLES_LIVRAISON` en LS-57.
 *
 * LES OPTIONS « QR » SONT ECARTEES, deliberement. Sendcloud en propose pour le
 * Point Relais et le Locker, ou le client presente un code au point au lieu
 * d'une etiquette collee. Elles changent le geste de l'exploitante ET celui du
 * client : ce serait une decision commerciale, pas un detail technique, et
 * personne ne l'a prise. Les options retenues produisent une etiquette
 * imprimable, ce que le parcours actuel suppose.
 *
 * UN CODE COUVRE TOUTE LA PLAGE DE POIDS en v3, 0,011 a 25 kg pour le Locker,
 * la ou la v2 decoupait en tranches de 250 g. La borne du projet reste
 * pourtant celle de la tranche la plus legere, voir `POIDS_COLIS_MAXIMUM_GRAMMES` :
 * c'est le TARIF annonce au client qui en depend, pas l'option.
 */
export const OPTIONS_PAR_MODE: Record<ModeLivraison, string> = {
  /** `Mondial Relay Home Domestic`, sans point de retrait. */
  DOMICILE: "mondial_relay:home_domestic,dualapi/c2c",
  /** `Mondial Relay Point Relais`, point de retrait EXIGE. */
  POINT_RELAIS: "mondial_relay:service_point,dualapi/size=l,c2c",
  /** `Mondial Relay Locker Delivery`, point de retrait EXIGE. */
  LOCKER: "mondial_relay:locker_delivery,dualapi",
};

/**
 * Le contrat Mondial Relay du compte, commun aux trois options.
 *
 * RELEVE ET NON SUPPOSE, meme appel que les codes. La v3 accepte le code seul,
 * mais un compte qui porterait un jour deux contrats choisirait alors au
 * hasard : le nommer rend le choix explicite.
 */
export const CONTRAT_MONDIAL_RELAY = 239536;

/**
 * L'adresse d'expediteur configuree chez Sendcloud, celle de l'atelier.
 *
 * `from_address` EST OBLIGATOIRE EN v3, et la passer par son identifiant evite
 * de recopier l'adresse de l'atelier dans le depot, qui est public. Relevee le
 * 29 octobre 2026, seule adresse d'expediteur du compte, la meme en v2 et en v3.
 */
export const ADRESSE_EXPEDITEUR_ID = 914836;
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
 * Le code d'option Sendcloud pour ce mode.
 *
 * IL NE PREND AUCUN POIDS EN PARAMETRE, et c'est voulu tant que le forfait
 * existe : le poids part dans la demande, et l'option ne depend que du mode.
 */
export function optionPour(mode: ModeLivraison): string {
  return OPTIONS_PAR_MODE[mode];
}
