/**
 * Acces aux jetons signes sans compte. LS-132, regles L5, L9, L10 et L11.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : il traduit une
 * intention de lecture ou d'ecriture en requete. C'est `services/acces-
 * document.ts` qui juge si un jeton donne acces.
 *
 * IL N'Y A AUCUNE SUPPRESSION ICI, ET AUCUNE ECRITURE DE `empreinte`, `portee`,
 * `commandeId` NI `expireA` HORS CREATION, regle L11 : ces quatre colonnes sont
 * immuables apres ecriture. Seuls `utiliseA` et `revoqueA` evoluent, de nul vers
 * une date, et chacun a sa fonction propre : les confondre est precisement ce
 * que la regle L10 interdit.
 */
import type { PorteeJeton } from "@/generated/prisma/client";
import type { ClientBase } from "@/repositories/stock";

/**
 * Ce qu'une lecture de jeton rend, l'empreinte EXCLUE.
 *
 * L'EMPREINTE NE RESSORT PAS DE CE FICHIER. Elle sert a retrouver la ligne, pas
 * a circuler : la rendre a l'appelant l'exposerait a une journalisation ou a un
 * message d'erreur, alors que rien dans le service n'en a besoin.
 */
export type JetonLu = {
  id: string;
  commandeId: string;
  portee: PorteeJeton;
  expireA: Date;
  utiliseA: Date | null;
  revoqueA: Date | null;
};

/**
 * Retrouve un jeton par son empreinte, sans juger de sa validite.
 *
 * ELLE REND L'ETAT BRUT ET NE FILTRE RIEN, volontairement. Filtrer ici par
 * `expireA > now()` ferait disparaitre la distinction entre « aucun jeton » et
 * « jeton expire », que le service doit pouvoir tracer differemment meme si sa
 * reponse au client reste la meme. La regle L9 se verifie en un seul endroit,
 * et ce n'est pas dans une clause SQL eparpillee.
 */
export async function lireJetonParEmpreinte(
  client: ClientBase,
  empreinte: string,
): Promise<JetonLu | null> {
  return client.jetonAcces.findUnique({
    where: { empreinte },
    select: {
      id: true,
      commandeId: true,
      portee: true,
      expireA: true,
      utiliseA: true,
      revoqueA: true,
    },
  });
}

/**
 * Ecrit un jeton neuf, regle L11.
 *
 * `utiliseA` ET `revoqueA` RESTENT NULS, leur defaut en base : un jeton nait ni
 * consomme ni revoque. Les poser explicitement a `null` dupliquerait le defaut
 * du schema, qui resterait alors a synchroniser a la main.
 */
export async function ecrireJeton(
  client: ClientBase,
  parametres: {
    commandeId: string;
    empreinte: string;
    portee: PorteeJeton;
    expireA: Date;
  },
): Promise<{ id: string }> {
  return client.jetonAcces.create({
    data: {
      commandeId: parametres.commandeId,
      empreinte: parametres.empreinte,
      portee: parametres.portee,
      expireA: parametres.expireA,
    },
    select: { id: true },
  });
}

/**
 * Marque un jeton consomme, regle L9.
 *
 * LA CLAUSE EXIGE `utiliseA: null`, ET CE N'EST PAS DECORATIF. Deux requetes
 * simultanees sur le meme lien passeraient toutes deux la verification du
 * service, qui lit avant d'ecrire : sans cette condition, la seconde ecraserait
 * la date de consommation de la premiere et l'audit perdrait l'instant reel du
 * premier usage. Avec elle, `updateMany` rend `count: 0` et l'appelant sait
 * qu'il a perdu la course.
 *
 * `updateMany` ET NON `update` : ce dernier leve `P2025` quand aucune ligne ne
 * correspond, ce qui transformerait une course perdue, cas normal, en
 * exception. Le compte rendu est plus juste ici qu'une erreur a rattraper.
 *
 * ELLE NE TOUCHE JAMAIS `revoqueA`, regle L10 : consommation et revocation sont
 * deux etats distincts, et un jeton revoque mais non consomme ne doit pas
 * apparaitre comme utilise.
 */
export async function consommerJeton(
  client: ClientBase,
  jetonId: string,
  maintenant: Date = new Date(),
): Promise<boolean> {
  const { count } = await client.jetonAcces.updateMany({
    where: { id: jetonId, utiliseA: null },
    data: { utiliseA: maintenant },
  });

  return count === 1;
}

/**
 * Revoque un jeton, regle L10.
 *
 * ELLE RENSEIGNE `revoqueA` ET RIEN D'AUTRE. Revoquer en posant `utiliseA`
 * ferait passer un lien remplace pour un lien deja utilise ; revoquer en
 * ecrasant `expireA` effacerait la date d'expiration reelle et rendrait l'audit
 * impossible ; supprimer la ligne est interdit, la section d'immuabilite du
 * modele ne l'autorisant que sur trois entites dont celle-ci ne fait pas partie.
 *
 * LA CLAUSE EXIGE `revoqueA: null` pour la meme raison que ci-dessus : une
 * seconde revocation ne doit pas repousser la date de la premiere.
 */
export async function revoquerJeton(
  client: ClientBase,
  jetonId: string,
  maintenant: Date = new Date(),
): Promise<boolean> {
  const { count } = await client.jetonAcces.updateMany({
    where: { id: jetonId, revoqueA: null },
    data: { revoqueA: maintenant },
  });

  return count === 1;
}

/**
 * Revoque tous les jetons actifs d'une portee pour une commande, regle L10.
 *
 * ELLE SERT LA REEMISSION, LS-132. Un lien parti sur une adresse erronee, ou
 * une valeur perdue faute d'avoir ete transmise, se remplace : le jeton neuf
 * n'invalide pas l'ancien de lui-meme, `JetonAcces` etant une entite propre
 * avec sa propre expiration. Sans cette revocation, chaque reemission laisse un
 * orphelin valide jusqu'a son terme, exactement le defaut que le point 8 des
 * transactions critiques decrit pour l'invitation d'avis.
 *
 * ELLE NE TOUCHE QUE `revoqueA`, jamais `utiliseA` ni `expireA`, regle L10 : le
 * premier ferait passer un lien remplace pour un lien deja utilise, le second
 * effacerait la date d'expiration reelle et rendrait l'audit impossible.
 *
 * LA CLAUSE EXCLUT LES JETONS DEJA REVOQUES pour ne pas repousser la date de
 * la premiere revocation, et les jetons expires n'ont pas besoin de l'etre.
 * Elle rend le nombre de lignes touchees, que l'appelant peut journaliser.
 */
export async function revoquerJetonsActifs(
  client: ClientBase,
  commandeId: string,
  portee: PorteeJeton,
  maintenant: Date = new Date(),
): Promise<number> {
  const { count } = await client.jetonAcces.updateMany({
    where: {
      commandeId,
      portee,
      revoqueA: null,
      utiliseA: null,
      expireA: { gt: maintenant },
    },
    data: { revoqueA: maintenant },
  });

  return count;
}
