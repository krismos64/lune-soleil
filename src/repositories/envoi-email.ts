/**
 * Acces aux donnees de l'outbox d'emails, ADR-033. LS-51 et LS-82.
 *
 * Ce fichier porte les instructions dont la correction depend du SQL exact,
 * comme l'autorise le garde de `repositories/`. Il ne decide rien : le service
 * choisit quoi envoyer et quand alerter.
 *
 * POURQUOI CE MODULE EXISTE. `journal_email_systeme_unique` protege la base,
 * pas l'appel au serveur SMTP. Entre l'instant ou nodemailer rend la main et
 * celui ou la trace s'ecrit, une panne du processus fait perdre la trace sans
 * annuler l'envoi : la reprise ne trouve rien qui la bloque et le client recoit
 * une SECONDE confirmation de commande. L'outbox ferme cette fenetre en ecrivant
 * l'intention dans la transaction metier, puis en marquant la ligne AVANT
 * l'appel.
 */
import { Prisma, StatutEnvoi } from "@/generated/prisma/client";

/** Client principal ou client transactionnel remis par `$transaction`. */
export type ClientBase = Prisma.TransactionClient;

/** Une ligne d'outbox prise pour envoi, reduite a ce que la tache consomme. */
export type EnvoiPris = {
  id: string;
  commandeId: string | null;
  destinataire: string;
  modele: string;
  variables: Record<string, string>;
  tentatives: number;
};

/**
 * Prend jusqu'a `lot` lignes a envoyer et les marque `ENVOI_EN_COURS`.
 *
 * LE MARQUAGE ET LA LECTURE SONT UNE SEULE INSTRUCTION, et c'est le point
 * entier de cette fonction. Lire puis marquer en deux temps laisserait une
 * fenetre ou deux executions liraient la meme ligne : le verrou applicatif de
 * LS-72 empeche deja deux instances de la tache, mais il expire, et une
 * instance lente doublerait alors ses propres envois.
 *
 * `FOR UPDATE SKIP LOCKED` ET NON `FOR UPDATE` SEUL. Sans `SKIP LOCKED`, une
 * seconde execution ATTENDRAIT la fin de la premiere plutot que de passer son
 * chemin, et la tache s'empilerait sur elle-meme a chaque cycle jusqu'a saturer
 * les connexions. Avec, elle prend les lignes libres et laisse les autres.
 *
 * LE `COMMIT` DE CE MARQUAGE PRECEDE L'APPEL SMTP, c'est l'appelant qui en
 * repond. Marquer apres l'appel reproduirait a l'identique le trou qu'ADR-033
 * ferme, deplace de quelques lignes.
 *
 * `ECHOUE` EST REPRIS, `ENVOI_EN_COURS` NE L'EST JAMAIS. Un echec signifie que
 * l'appel a rendu une erreur, donc que rien n'est parti : la retentative est
 * sure, regle E4. Une ligne restee `ENVOI_EN_COURS` est au contraire ambigue,
 * personne ne sait si le message est parti, et la rejouer risquerait le doublon.
 * Elle sort par l'alerte, jamais par une reprise automatique.
 */
export async function prendreEnvoisAExpedier(
  client: ClientBase,
  lot: number,
  tentativesMax: number,
): Promise<EnvoiPris[]> {
  return client.$queryRaw<EnvoiPris[]>`
    WITH cibles AS (
      SELECT id
      FROM envoi_en_attente
      WHERE statut IN ('EN_ATTENTE', 'ECHOUE')
        AND tentatives < ${tentativesMax}
      -- Les plus anciennes d'abord : un envoi retarde ne doit pas se faire
      -- doubler indefiniment par les arrivees fraiches.
      ORDER BY cree_a
      FOR UPDATE SKIP LOCKED
      LIMIT ${lot}
    )
    UPDATE envoi_en_attente AS e
    SET statut = 'ENVOI_EN_COURS',
        -- now() EST L'HORLOGE DE POSTGRESQL, jamais celle de Node, regle de
        -- database.md. C'est elle qui sert a mesurer le delai de garde, et une
        -- derive d'horloge applicative alerterait a tort ou trop tard.
        prise_a = now(),
        tentatives = e.tentatives + 1
    FROM cibles
    WHERE e.id = cibles.id
    RETURNING e.id,
              e.commande_id AS "commandeId",
              e.destinataire,
              e.modele,
              e.variables,
              e.tentatives
  `;
}

/**
 * Marque une ligne d'outbox comme partie.
 *
 * ELLE N'ECRIT PAS LA TRACE `JournalEmail`, qui appartient au service : les
 * deux ecritures doivent tenir dans une meme transaction, et ouvrir une
 * transaction est interdit a cette couche.
 */
export async function marquerEnvoye(
  client: ClientBase,
  id: string,
): Promise<void> {
  await client.envoiEnAttente.update({
    where: { id },
    data: { statut: StatutEnvoi.ENVOYE, motifEchec: null },
  });
}

/**
 * Marque une ligne d'outbox en echec, avec le motif.
 *
 * `motif` NE PORTE JAMAIS LA REPONSE BRUTE DU SERVEUR, filtree par l'appelant :
 * un serveur SMTP renvoie parfois l'identifiant de connexion dans son message
 * de refus, et cette colonne est lue dans l'administration.
 *
 * `epuiserTentatives` PORTE LA DISTINCTION DU CRITERE 4 DE LS-82. Une erreur
 * definitive, authentification en tete, ne doit pas etre reessayee : plutot que
 * d'ajouter un statut, les tentatives montent au plafond, ce qui rend la ligne
 * non reprenable par `prendreEnvoisAExpedier` sans inventer un etat de plus.
 */
export async function marquerEchoue(
  client: ClientBase,
  id: string,
  motif: string,
  options: { epuiserTentatives?: number } = {},
): Promise<void> {
  await client.envoiEnAttente.update({
    where: { id },
    data: {
      statut: StatutEnvoi.ECHOUE,
      motifEchec: motif,
      ...(options.epuiserTentatives === undefined
        ? {}
        : { tentatives: options.epuiserTentatives }),
    },
  });
}

/**
 * Les lignes bloquees en `ENVOI_EN_COURS` au-dela du delai de garde.
 *
 * CE QU'ELLES SIGNIFIENT : le processus est tombe entre le marquage et
 * l'ecriture du resultat. Personne ne sait si le message est parti, et ADR-033
 * refuse de trancher automatiquement. Elles remontent en alerte, et
 * l'administratrice decide du renvoi par le chemin manuel de la regle E6.
 *
 * LE SEUIL SE COMPTE EN SECONDES ET SE PASSE EN PARAMETRE plutot que d'etre
 * fige ici : c'est une decision d'exploitation, elle appartient au service.
 */
export async function envoisBloques(
  client: ClientBase,
  delaiGardeSecondes: number,
): Promise<{ id: string; commandeId: string | null; modele: string }[]> {
  return client.$queryRaw`
    SELECT id, commande_id AS "commandeId", modele
    FROM envoi_en_attente
    WHERE statut = 'ENVOI_EN_COURS'
      AND prise_a < now() - make_interval(secs => ${delaiGardeSecondes}::double precision)
    ORDER BY prise_a
  `;
}
