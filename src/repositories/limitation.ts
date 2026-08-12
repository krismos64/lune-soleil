/**
 * Compteur de limitation de debit applicatif. LS-92, ADR-027 decision 1.
 *
 * POURQUOI CE FICHIER EXISTE ALORS QUE BETTER AUTH LIMITE DEJA. Sa limitation
 * ne couvre QUE les routes servies par `auth.handler`. `auth.api.*`, appele
 * depuis une Server Action, ne passe par aucun routeur : le compteur n'est
 * jamais consulte ni incremente. C'est le piege deja mesure en LS-79, ou six
 * tests annonçaient verifier un plafond sans rien exercer, et il est ecrit dans
 * `.claude/rules/securite.md`.
 *
 * L'ECRAN DE REAUTHENTIFICATION DE LS-89 APPELLE `verifyPassword` DEPUIS UNE
 * SERVER ACTION. Une Server Action est invocable en boucle, sans navigateur :
 * les mots de passe s'y testent donc sans aucun plafond.
 *
 * LA MEME TABLE QUE BETTER AUTH, ET NON UNE NOUVELLE. Le ticket le demande
 * explicitement, « ne pas reinventer un stockage ». `RateLimit` existe, elle est
 * deja purgee par LS-94, et son schema convient exactement : une cle, un
 * compteur, un horodatage de derniere requete.
 *
 * LA CLE EST PREFIXEE `action:`, ET C'EST NON NEGOCIABLE. Better Auth ecrit ses
 * propres cles sous la forme `<ip>|<chemin>` : sans prefixe distinct, une
 * Server Action et une route de la bibliotheque pourraient partager un compteur,
 * chacune consommant le quota de l'autre. Le prefixe rend les deux espaces
 * disjoints par construction.
 *
 * CE MODULE NE DECIDE RIEN. Il incremente et rend l'etat du compteur ; le seuil,
 * la fenetre et la conduite a tenir vivent dans `services/limitation-action.ts`,
 * conformement au fichier de garde de `repositories/`.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Client principal ou client transactionnel remis par `$transaction`.
 * Meme convention que `repositories/verrou.ts`.
 */
type ClientPrisma = Prisma.TransactionClient | typeof prisma;

/**
 * Ce que rend une prise de jeton.
 *
 * `restant` SERT LE DIAGNOSTIC, jamais l'appelant final : le nombre de
 * tentatives restantes ne doit pas etre expose a qui tente, il renseignerait
 * sur le plafond et permettrait de s'en approcher sans le franchir.
 */
export type EtatCompteur = {
  /** Nombre de tentatives dans la fenetre courante, celle-ci comprise. */
  compte: number;
  /** Instant de la premiere tentative de la fenetre courante. */
  fenetreOuverteA: Date;
};

/**
 * Incremente le compteur d'une cle et rend son etat, en UNE instruction.
 *
 * MEME PRINCIPE QUE L'UPDATE CONDITIONNEL DE RESERVATION, ADR-006, et pour la
 * meme raison. Un `SELECT` suivi d'un `UPDATE` laisserait deux requetes
 * concurrentes lire le meme compte, puis ecrire toutes deux `compte + 1` : deux
 * tentatives n'en compteraient qu'une. Sur une limitation de debit, ce defaut
 * est exploitable a volonte en lançant les tentatives en parallele, c'est-a-dire
 * exactement ce que fait une attaque.
 *
 * `ON CONFLICT DO UPDATE` REND LE COMPTEUR ATOMIQUE : PostgreSQL serialise les
 * ecritures concurrentes sur la meme ligne, chacune voyant le resultat de la
 * precedente.
 *
 * LA REMISE A ZERO EST DANS LA MEME INSTRUCTION, par le `CASE` : si la derniere
 * requete est plus vieille que la fenetre, le compteur repart a un plutot que de
 * s'incrementer. Une remise a zero faite dans une seconde requete rouvrirait la
 * course que cette instruction ferme.
 *
 * `now()` EST L'HORLOGE DE POSTGRESQL, jamais celle de Node, meme motif que le
 * verrou de LS-72 : deux instances dont les horloges derivent compareraient des
 * instants incomparables, et la fenetre s'ouvrirait trop tot sur l'une d'elles.
 *
 * `lastRequest` PORTE DES MILLISECONDES depuis l'epoch, en `BIGINT`, parce que
 * la table appartient a Better Auth qui y ecrit `Date.now()`. La conversion
 * passe donc par `extract(epoch ...) * 1000`, jamais par un horodatage.
 */
export async function incrementerCompteur(
  client: ClientPrisma,
  cle: string,
  fenetreSecondes: number,
): Promise<EtatCompteur> {
  const lignes = await client.$queryRaw<
    { count: number; last_request: bigint }[]
  >`
    INSERT INTO rate_limit (id, key, count, last_request)
    VALUES (gen_random_uuid()::text, ${cle}, 1,
            (extract(epoch FROM now()) * 1000)::bigint)
    ON CONFLICT (key) DO UPDATE
      SET count = CASE
            WHEN rate_limit.last_request
                 < (extract(epoch FROM now()) * 1000)::bigint
                   - ${fenetreSecondes}::bigint * 1000
            THEN 1
            ELSE rate_limit.count + 1
          END,
          last_request = (extract(epoch FROM now()) * 1000)::bigint
    RETURNING count, last_request
  `;

  const ligne = lignes[0];

  if (!ligne) {
    // Inatteignable : un `INSERT ... ON CONFLICT DO UPDATE` avec `RETURNING`
    // rend toujours une ligne, le `DO UPDATE` etant inconditionnel. Lever
    // plutot que de rendre un compte invente, qui accorderait une tentative.
    throw new Error("Compteur de limitation sans ligne retournee");
  }

  return {
    compte: Number(ligne.count),
    fenetreOuverteA: new Date(Number(ligne.last_request)),
  };
}

/**
 * Efface le compteur d'une cle, apres une tentative reussie.
 *
 * POURQUOI EFFACER PLUTOT QUE LAISSER EXPIRER. Sans cela, une exploitante qui
 * se trompe quatre fois puis reussit resterait a quatre tentatives consommees
 * pour le reste de la fenetre : une cinquieme saisie legitime, quelques secondes
 * plus tard, serait refusee alors qu'elle vient de prouver son identite.
 *
 * CELA N'AFFAIBLIT PAS LA PROTECTION. Le seul moyen de remettre le compteur a
 * zero est de fournir le bon mot de passe, ce qui est precisement ce que
 * l'attaquant cherche et n'a pas.
 */
export async function effacerCompteur(
  client: ClientPrisma,
  cle: string,
): Promise<void> {
  await client.rateLimit.deleteMany({ where: { key: cle } });
}
