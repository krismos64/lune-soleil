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

/**
 * Verrouille les adresses d'un compte pour la duree de la transaction. LS-59.
 *
 * CE QU'IL SERIALISE, ET LE DEFAUT MESURE QU'IL FERME. Sans lui, deux bascules
 * concurrentes vers deux adresses differentes echouent l'une des deux, mesure
 * 12 fois sur 12 par `ls-critical-reviewer` sur PostgreSQL 18.4 :
 *
 *   T1  UPDATE ... est_par_defaut = false WHERE ... AND est_par_defaut  -> 1
 *   T2  le meme UPDATE                                                 -> 0
 *   T2  pose le drapeau sur sa cible                                   -> 1
 *   le second a commiter leve `adresse_defaut_unique`
 *
 * En `READ COMMITTED`, T2 attend le verrou de ligne de T1 puis **re-evalue son
 * predicat** sur la version commitee : il ne trouve plus rien a retirer. C'est
 * le motif « lecture avant verrou », deja en fiche sur ce projet.
 *
 * LA DONNEE RESTAIT CORRECTE, le perdant etant integralement annule. Ce qui
 * cassait est l'USAGE : un client qui bascule depuis deux onglets, ou dont le
 * double clic produit deux requetes qui se recouvrent, lisait « operation
 * momentanement indisponible » sur un geste banal, et une ligne `error` partait
 * au journal.
 *
 * AVEC LE VERROU, les deux bascules se serialisent : la seconde ecrase la
 * premiere, les deux rendent `FAIT`, dernier clic gagnant. C'est ce qu'un
 * client attend de deux onglets.
 *
 * AUCUN CYCLE D'INTERBLOCAGE POSSIBLE : ce chemin verrouille `adresse_carnet`
 * seul, et aucun autre chemin du depot n'ecrit sur cette table.
 */
export async function verrouillerCarnet(
  client: ClientBase,
  utilisateurId: string,
): Promise<void> {
  /*
   * `$queryRaw` PARCE QUE PRISMA NE SAIT PAS EXPRIMER `FOR UPDATE`, meme motif
   * que le verrou de facture d'`avoir.ts` et celui de la suppression de compte.
   * Le parametre est lie, jamais interpole.
   */
  await client.$queryRaw`
    SELECT id FROM adresse_carnet WHERE utilisateur_id = ${utilisateurId} FOR UPDATE
  `;
}
