/**
 * Acces au carnet d'adresses, LS-59, parcours 8.
 *
 * IL N'OUVRE AUCUNE TRANSACTION, garde de `repositories/` : le service appelant
 * lui passe le client, et c'est lui qui decide.
 *
 * TOUTE ECRITURE PORTE `utilisateurId` DANS SA CONDITION, jamais `id` seul,
 * regle A1 et invariant 2. Le parcours 8 le dit sans ambiguite : « les etapes 3,
 * 4 et 5 recoivent un identifiant d'adresse et n'en tirent aucune
 * autorisation ». Un `WHERE id = :id` seul laisserait un identifiant poste dans
 * un formulaire modifier l'adresse d'autrui.
 *
 * C'est pourquoi ce fichier n'expose AUCUNE fonction prenant un identifiant
 * d'adresse sans son `utilisateurId` : la signature elle-meme ferme le chemin.
 */
import type { ClientBase } from "@/repositories/stock";

/** Une adresse telle qu'elle apparait dans le carnet. */
export type AdresseDuCarnet = {
  id: string;
  libelle: string | null;
  nomComplet: string;
  ligne1: string;
  ligne2: string | null;
  codePostal: string;
  ville: string;
  pays: string;
  telephone: string | null;
  estParDefaut: boolean;
  creeA: Date;
};

/** Les champs qu'une saisie peut porter, jamais `utilisateurId` ni `estParDefaut`. */
export type ChampsAdresse = {
  libelle: string | null;
  nomComplet: string;
  ligne1: string;
  ligne2: string | null;
  codePostal: string;
  ville: string;
  pays: string;
  telephone: string | null;
};

/**
 * Le carnet d'un compte, etape 1 du parcours 8.
 *
 * L'ADRESSE PAR DEFAUT REMONTE EN PREMIER, puis les plus recentes : c'est
 * l'ordre de lecture attendu a l'ecran, et le tri vient de la base plutot que
 * d'un `sort` en memoire, qui se perdrait a la premiere pagination.
 */
export async function listerAdresses(
  client: ClientBase,
  utilisateurId: string,
): Promise<AdresseDuCarnet[]> {
  return client.adresseCarnet.findMany({
    where: { utilisateurId },
    orderBy: [{ estParDefaut: "desc" }, { creeA: "desc" }],
  });
}

/**
 * Une adresse, SI elle appartient a ce compte. Rend `null` sinon.
 *
 * LE COUPLE EST DANS LE `where`, jamais une lecture suivie d'une comparaison :
 * il n'y a rien a oublier.
 */
export async function lireAdresse(
  client: ClientBase,
  adresseId: string,
  utilisateurId: string,
): Promise<AdresseDuCarnet | null> {
  return client.adresseCarnet.findFirst({
    where: { id: adresseId, utilisateurId },
  });
}

/**
 * Cree une adresse dans le carnet d'un compte, etape 2.
 *
 * `estParDefaut` N'EST PAS UN CHAMP DE SAISIE et n'apparait pas dans
 * `ChampsAdresse` : le poser ici contournerait l'ordre impose de l'etape 3, et
 * deux adresses par defaut violeraient l'index partiel. Une adresse creee ne
 * l'est jamais par defaut ; c'est un geste separe.
 *
 * A7 AUTORISE UN CARNET SANS ADRESSE PAR DEFAUT, donc la premiere adresse ne se
 * promeut pas non plus automatiquement.
 */
export async function creerAdresse(
  client: ClientBase,
  utilisateurId: string,
  champs: ChampsAdresse,
): Promise<AdresseDuCarnet> {
  return client.adresseCarnet.create({
    data: { utilisateurId, ...champs },
  });
}

/**
 * Met a jour une adresse, SI elle appartient a ce compte, etape 4.
 *
 * `updateMany` ET NON `update`, et ce n'est pas un detail : `update` n'accepte
 * qu'un `where` sur une cle unique, donc `id` seul, ce qui obligerait a
 * verifier l'appartenance separement. `updateMany` accepte le couple, et rend
 * le compte de lignes touchees, qui vaut zero quand l'adresse n'est pas la
 * sienne. La garde est structurelle plutot que disciplinaire.
 *
 * `estParDefaut` N'EST PAS MODIFIABLE PAR CE CHEMIN, le type l'exclut : la
 * bascule a son propre chemin, dont l'ordre des ecritures est impose.
 */
export async function mettreAJourAdresse(
  client: ClientBase,
  adresseId: string,
  utilisateurId: string,
  champs: ChampsAdresse,
): Promise<number> {
  const { count } = await client.adresseCarnet.updateMany({
    where: { id: adresseId, utilisateurId },
    data: champs,
  });

  return count;
}

/**
 * Supprime une adresse, SI elle appartient a ce compte, etape 5.
 *
 * AUCUNE PROMOTION AUTOMATIQUE si l'adresse supprimee etait celle par defaut,
 * regle A7 : « un carnet sans adresse par defaut est un etat legitime ».
 * Promouvoir la suivante choisirait a la place du client, et le tunnel sait
 * traiter l'absence de defaut.
 */
export async function supprimerAdresse(
  client: ClientBase,
  adresseId: string,
  utilisateurId: string,
): Promise<number> {
  const { count } = await client.adresseCarnet.deleteMany({
    where: { id: adresseId, utilisateurId },
  });

  return count;
}

/**
 * Retire le drapeau par defaut de toutes les adresses d'un compte.
 *
 * PREMIERE MOITIE DE LA BASCULE, ET ELLE PASSE AVANT LA SECONDE, point 9 des
 * transactions critiques. Voir `services/carnet-adresses.ts` pour le motif
 * complet : l'index partiel se verifie LIGNE A LIGNE et non au `COMMIT`, donc
 * poser le nouveau drapeau avant de retirer l'ancien leve une violation
 * d'unicite.
 *
 * `updateMany` SUR TOUT LE CARNET plutot que sur la seule ancienne : le compte
 * en porte au plus une, l'index le garantit, et ne pas avoir a la CHERCHER
 * supprime une lecture qui pourrait etre fausse.
 */
export async function retirerDefautDuCarnet(
  client: ClientBase,
  utilisateurId: string,
): Promise<number> {
  const { count } = await client.adresseCarnet.updateMany({
    where: { utilisateurId, estParDefaut: true },
    data: { estParDefaut: false },
  });

  return count;
}

/**
 * Pose le drapeau par defaut sur une adresse, SI elle appartient a ce compte.
 *
 * SECONDE MOITIE DE LA BASCULE, jamais appelee sans la premiere. Elle rend le
 * compte de lignes touchees : zero signifie que l'adresse n'est pas celle de ce
 * compte, et le service doit alors annuler la transaction plutot que de laisser
 * un carnet sans defaut apres en avoir eu un.
 */
export async function poserDefautSurAdresse(
  client: ClientBase,
  adresseId: string,
  utilisateurId: string,
): Promise<number> {
  const { count } = await client.adresseCarnet.updateMany({
    where: { id: adresseId, utilisateurId },
    data: { estParDefaut: true },
  });

  return count;
}
