/**
 * Acces aux donnees du verrou de tache planifiee, LS-72.
 *
 * Ce fichier porte les instructions dont la correction depend du SQL exact,
 * comme l'autorise le garde de `repositories/`. Il n'ouvre aucune transaction
 * et ne decide rien.
 *
 * MEME PRINCIPE QUE L'UPDATE CONDITIONNEL DE RESERVATION, ADR-006 : la prise de
 * verrou tient en UNE SEULE INSTRUCTION atomique, sans lecture prealable.
 *
 * POURQUOI PAS `SELECT` PUIS `INSERT`, meme dans une transaction. Deux
 * instances liraient toutes deux « aucun verrou », puis toutes deux
 * inserreraient : la seconde echouerait sur l'unicite, ce qui parait sauver la
 * situation, mais le code devrait alors distinguer « conflit d'unicite parce
 * qu'un autre detient le verrou » de « conflit parce que le verrou est expire
 * et reprenable ». Cette distinction se fait en SQL, dans le `WHERE` du
 * `DO UPDATE`, ou elle est atomique.
 *
 * Regle E8, `verrou_tache_nom_key` UNIQUE est la ligne de defense finale.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Client principal ou client transactionnel remis par `$transaction`.
 *
 * APPELER CES FONCTIONS DEPUIS UNE TRANSACTION CHANGE LA FORME DU REFUS, et le
 * type ci-dessus l'autorise sans le dire. Mesure sur PostgreSQL 18, verrou
 * expire en place, trois prises concurrentes :
 *
 *   READ COMMITTED   -> [ 1 servi, 0, 0 ]        refus = zero ligne
 *   REPEATABLE READ  -> [ 40001, 40001, 1 ]      refus = erreur de serialisation
 *   SERIALIZABLE     -> [ 40001, 1, 40001 ]      idem
 *
 * Le mode d'echec reste SUR : jamais deux detenteurs, quel que soit le niveau.
 * Mais au-dela de `READ COMMITTED`, `prendreVerrou` leve au lieu de rendre
 * `false`, et `executerSousVerrou` traduirait cela en `ECHOUEE`, donc un 500 au
 * cron a chaque echeance au lieu d'un 200 `IGNOREE`.
 *
 * Aucun appelant n'ouvre de transaction aujourd'hui. La phase 3, qui ecrira la
 * liberation des reservations, devra prendre le verrou AVANT d'ouvrir sa
 * transaction plutot que dedans.
 */
export type ClientBase = Prisma.TransactionClient;

/**
 * Prend le verrou d'une tache, ou echoue sans rien ecrire.
 *
 * L'INSTRUCTION EST UN `INSERT ... ON CONFLICT DO UPDATE` CONDITIONNEL, et
 * chacune de ses trois parties porte un cas :
 *
 * - `INSERT` reussit quand aucun verrou n'existe : premiere execution, ou
 *   verrou relache proprement par l'instance precedente.
 * - `ON CONFLICT (nom)` capte le cas ou un verrou existe deja. Sans lui,
 *   l'instruction leverait sur l'unicite et le code devrait interpreter une
 *   erreur de contrainte, ce qui melange refus metier et defaut technique.
 * - `WHERE verrou_tache.expire_a < now()` est LE POINT DE LA STORY. Il n'ecrase
 *   un verrou existant QUE s'il a expire. Un verrou actif ne bouge pas, aucune
 *   ligne n'est rendue, et l'appelant sait qu'il n'a pas la main.
 *
 * `RETURNING id` REND UNE LIGNE OU AUCUNE, et c'est tout ce que l'appelant a
 * besoin de savoir. Aucune ligne signifie « quelqu'un d'autre travaille », un
 * refus normal et non une erreur.
 *
 * `now()` EST L'HORLOGE DE POSTGRESQL, jamais celle de Node. Deux conteneurs
 * dont les horloges derivent de quelques secondes compareraient sinon des
 * instants incomparables, et la fenetre de reprise s'ouvrirait trop tot sur
 * l'un d'eux. L'horloge de la base est la seule que toutes les instances
 * partagent. Invariant 8, tout est en timestamptz.
 *
 * LE JETON EST ENGENDRE PAR L'APPELANT et ecrit ici : il identifie CETTE prise
 * de verrou, et sert au relachement conditionnel, voir `relacherVerrou`.
 */
export const SQL_PRENDRE_VERROU = `
  INSERT INTO verrou_tache (id, nom, acquis_a, expire_a)
  VALUES ($1, $2, now(), now() + make_interval(secs => $3::double precision))
  ON CONFLICT (nom) DO UPDATE
    SET id = EXCLUDED.id,
        acquis_a = EXCLUDED.acquis_a,
        expire_a = EXCLUDED.expire_a
    WHERE verrou_tache.expire_a < now()
  RETURNING id
`;

export async function prendreVerrou(
  client: ClientBase,
  jeton: string,
  nom: string,
  dureeSecondes: number,
): Promise<boolean> {
  const lignes = await client.$queryRawUnsafe<Array<{ id: string }>>(
    SQL_PRENDRE_VERROU,
    jeton,
    nom,
    dureeSecondes,
  );

  return lignes.length === 1;
}

/**
 * Relache le verrou, UNIQUEMENT si l'appelant le detient encore.
 *
 * LA CONDITION SUR `id` N'EST PAS UNE PRECAUTION DE STYLE, elle ferme un trou
 * reel. Scenario : l'instance A prend le verrou pour cinq minutes, se fige
 * huit minutes sur un appel reseau. Le verrou expire, l'instance B le reprend
 * legitimement et commence a travailler. A se reveille enfin et termine : sans
 * cette condition, elle relacherait le verrou DE B, qui continuerait a
 * travailler en croyant l'avoir, pendant qu'une troisieme instance le prendrait.
 * Deux executions simultanees, exactement ce que la table existe pour empecher.
 *
 * Le jeton distingue les prises successives d'un meme nom de tache : il change
 * a chaque acquisition, la comparer suffit.
 *
 * REND LE NOMBRE DE LIGNES SUPPRIMEES, ce qui permet a l'appelant de journaliser
 * le cas « je ne detenais plus le verrou », signe qu'une tache a depasse sa
 * duree. Ce n'est pas une erreur, c'est une information d'exploitation.
 */
export const SQL_RELACHER_VERROU = `
  DELETE FROM verrou_tache
  WHERE nom = $1 AND id = $2
`;

export async function relacherVerrou(
  client: ClientBase,
  nom: string,
  jeton: string,
): Promise<number> {
  return client.$executeRawUnsafe(SQL_RELACHER_VERROU, nom, jeton);
}
