/**
 * Acces aux donnees du stock, LS-50.
 *
 * Ce fichier porte les instructions dont la correction depend du SQL exact,
 * comme l'autorise explicitement le garde de `repositories/`. Il n'ouvre aucune
 * transaction et ne decide rien : le service appelant lui passe le client
 * transactionnel et l'ordre dans lequel traiter les variantes.
 *
 * LA REQUETE EST LA SOURCE DE VERITE PARTAGEE avec `tests/aide/reservation-sql.ts`.
 * Les deux doivent rester identiques, et `.claude/rules/database.md` avec
 * ADR-006 les gouvernent. Une divergence est un defaut, jamais une adaptation.
 *
 * POURQUOI `$queryRawUnsafe` ET NON L'API TYPEE. Prisma ne sait pas exprimer
 * `quantite_physique - quantite_reservee >= $3` dans un `update` typé : la
 * condition porte sur une expression entre deux colonnes, pas sur une valeur.
 * Passer par une lecture puis une ecriture rouvrirait la fenetre que l'UPDATE
 * conditionnel ferme. Ne pas « simplifier », ADR-006 et ADR-024.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`. Le service passe toujours le second,
 * une reservation isolee de sa commande n'existant pas depuis ADR-024.
 */
export type ClientBase = Prisma.TransactionClient;

/**
 * Reservation atomique d'une variante : verification de disponibilite et
 * ecriture en UNE seule instruction, sans verrou explicite ni lecture prealable.
 *
 * LES QUATRE CONDITIONS DU `WHERE` SONT SOLIDAIRES.
 *
 * - `id = $1` designe la variante.
 * - `archivee_a IS NULL` : l'archivage peut survenir entre une lecture et
 *   l'ecriture. Un client ayant la fiche ouverte reserverait une piece retiree
 *   du catalogue. Cette condition appartient au `WHERE`, jamais a une lecture
 *   qui la precede.
 * - `vente_web_activee = true` : le cas du marche, la piece est physiquement
 *   presente mais retiree de la vente en ligne le temps du stand.
 * - `quantite_physique - quantite_reservee >= $3` : le coeur de la strategie.
 *   C'est cette ligne que la preuve par mutation de LS-68 retire.
 *
 * Le parametre $2 porte la commande : `Reservation.commandeId` est OBLIGATOIRE
 * depuis ADR-024, une reservation sans commande n'existe pas en base.
 */
export const SQL_RESERVER = `
  WITH reserve AS (
    UPDATE variante
    SET quantite_reservee = quantite_reservee + $3
    WHERE id = $1
      AND archivee_a IS NULL
      AND vente_web_activee = true
      AND quantite_physique - quantite_reservee >= $3
    RETURNING id
  )
  INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
  SELECT gen_random_uuid(), id, $2, $3, now() + ($4 || ' minutes')::interval, now()
  FROM reserve
  RETURNING id
`;

/**
 * Tente de reserver une variante.
 *
 * Rend `true` si la piece est obtenue, `false` sur refus metier explicite,
 * c'est-a-dire quand l'`UPDATE` conditionnel ne trouve aucune ligne. Un refus
 * n'est PAS une erreur : il se presente au client sans jargon technique.
 *
 * Toute autre erreur remonte telle quelle, interblocage compris. Le service
 * decide quoi en faire, ce niveau ne l'absorbe jamais.
 */
export async function reserverVariante(
  client: ClientBase,
  parametres: {
    varianteId: string;
    commandeId: string;
    quantite: number;
    dureeMinutes: number;
  },
): Promise<boolean> {
  const lignes = await client.$queryRawUnsafe<{ id: string }[]>(
    SQL_RESERVER,
    parametres.varianteId,
    parametres.commandeId,
    parametres.quantite,
    String(parametres.dureeMinutes),
  );

  return lignes.length === 1;
}
