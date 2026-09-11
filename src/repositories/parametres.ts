/**
 * Acces a la ligne unique de parametres commerciaux, LS-98, ADR-043.
 *
 * AUCUNE DECISION METIER ICI, README du dossier. Ce fichier sait lire et ecrire
 * la ligne ; il ne dit pas ce qu'est un seuil valide, ni si la franchise
 * s'applique a un mode. Ces deux jugements vivent dans `services/parametres.ts`
 * et dans `lib/livraison.ts`.
 *
 * LA LIGNE EST UNIQUE ET LA BASE LE GARANTIT, `chk_parametre_ligne_unique` sur
 * une cle primaire booleenne contrainte a `true`. Ce fichier n'a donc aucun
 * garde-fou applicatif contre une seconde ligne : il serait redondant avec une
 * contrainte qui ne peut pas etre contournee, et redondant de la mauvaise
 * facon, en laissant croire que la garantie vient du code.
 *
 * `IDENTIFIANT_LIGNE` EST UNE CONSTANTE ET NON UN LITTERAL REPETE. Ecrire
 * `true` a quatre endroits marche, et rend invisible le fait que ces quatre
 * `true` designent la MEME ligne : un lecteur les prendrait pour des booleens
 * sans rapport.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

/**
 * La seule valeur que la cle primaire puisse prendre.
 *
 * ELLE N'EST PAS EXPORTEE. Aucun appelant n'a besoin de la connaitre : les
 * fonctions de ce fichier designent toujours la meme ligne, et l'exposer
 * inviterait a ecrire une lecture par identifiant qui n'a aucun sens ici.
 */
const IDENTIFIANT_LIGNE = true;

/** Les parametres tels qu'ils vivent en base, sans jugement. */
export type ParametresLus = {
  tarifRelaisCentimes: number;
  tarifDomicileCentimes: number;
  /** `null` DESACTIVE la franchise, et ne vaut pas zero. */
  seuilFranchiseCentimes: number | null;
  seuilStockFaible: number;
  emailAlertes: string;
  alerteCommandePayee: boolean;
  alertePaiementAnnule: boolean;
  alerteStockFaible: boolean;
  alerteMessageRecu: boolean;
  alerteAvisAModerer: boolean;
  modifieA: Date;
};

/**
 * Ce qu'une ecriture peut changer.
 *
 * `modifieA` N'Y FIGURE PAS, et c'est voulu : `@updatedAt` la renseigne, et la
 * laisser passer permettrait a un appelant de dater une modification dans le
 * passe, donc de masquer un changement dans le journal d'audit.
 */
export type ParametresAEcrire = Omit<ParametresLus, "modifieA">;

/**
 * Lit la ligne de parametres, ou `null` si elle est absente.
 *
 * `null` PLUTOT QU'UNE LEVEE, et la distinction compte. L'absence de ligne est
 * un fait que ce fichier constate ; decider qu'elle est une panne appartient au
 * service, qui seul sait si l'appelant peut s'en passer. Les pages publiques
 * masquent leur bloc de tarifs, l'ecran de parametres propose l'amorcage.
 *
 * `findUnique` ET NON `findFirst` : la ligne est designee par sa cle primaire,
 * et `findFirst` sur une table a ligne unique donnerait le meme resultat en
 * laissant croire qu'un ordre existe.
 */
export async function lireParametres(
  client: ClientBase,
): Promise<ParametresLus | null> {
  const ligne = await client.parametreBoutique.findUnique({
    where: { id: IDENTIFIANT_LIGNE },
  });

  if (ligne === null) {
    return null;
  }

  /*
   * LA PROJECTION EST EXPLICITE, jamais un `...ligne`. Une colonne ajoutee au
   * schema entrerait sinon en silence dans le type de retour, et traverserait
   * les couches sans qu'aucune decision ne soit prise sur elle.
   */
  return {
    tarifRelaisCentimes: ligne.tarifRelaisCentimes,
    tarifDomicileCentimes: ligne.tarifDomicileCentimes,
    seuilFranchiseCentimes: ligne.seuilFranchiseCentimes,
    seuilStockFaible: ligne.seuilStockFaible,
    emailAlertes: ligne.emailAlertes,
    alerteCommandePayee: ligne.alerteCommandePayee,
    alertePaiementAnnule: ligne.alertePaiementAnnule,
    alerteStockFaible: ligne.alerteStockFaible,
    alerteMessageRecu: ligne.alerteMessageRecu,
    alerteAvisAModerer: ligne.alerteAvisAModerer,
    modifieA: ligne.modifieA,
  };
}

/**
 * Ecrit la ligne de parametres, en la creant si elle n'existe pas.
 *
 * `upsert` ET NON `update`, et ce n'est pas une commodite. Une base restauree
 * depuis une sauvegarde anterieure a la migration, ou une base de test montee
 * depuis `schema.sql`, n'a pas de ligne : un `update` echouerait alors sur
 * `P2025` et l'ecran rendrait une panne la ou l'amorcage suffisait.
 *
 * L'ECRITURE EST TOTALE ET NON PARTIELLE, tous les champs a chaque fois. Une
 * ecriture partielle obligerait l'ecran a renvoyer seulement ce qui a change,
 * donc a distinguer « non modifie » de « remis a sa valeur par defaut », ce
 * qu'un formulaire HTML ne permet pas de faire sans ambiguite.
 */
export async function ecrireParametres(
  client: ClientBase,
  parametres: ParametresAEcrire,
): Promise<ParametresLus> {
  const ligne = await client.parametreBoutique.upsert({
    where: { id: IDENTIFIANT_LIGNE },
    create: { id: IDENTIFIANT_LIGNE, ...parametres },
    update: parametres,
  });

  return {
    tarifRelaisCentimes: ligne.tarifRelaisCentimes,
    tarifDomicileCentimes: ligne.tarifDomicileCentimes,
    seuilFranchiseCentimes: ligne.seuilFranchiseCentimes,
    seuilStockFaible: ligne.seuilStockFaible,
    emailAlertes: ligne.emailAlertes,
    alerteCommandePayee: ligne.alerteCommandePayee,
    alertePaiementAnnule: ligne.alertePaiementAnnule,
    alerteStockFaible: ligne.alerteStockFaible,
    alerteMessageRecu: ligne.alerteMessageRecu,
    alerteAvisAModerer: ligne.alerteAvisAModerer,
    modifieA: ligne.modifieA,
  };
}
