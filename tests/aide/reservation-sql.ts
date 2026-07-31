/**
 * La primitive de reservation de stock, en SQL, LS-68.
 *
 * CE FICHIER EST LA CIBLE DE LA MUTATION exigee par le critere d'acceptation de
 * LS-68. Retirer la condition `quantite_physique - quantite_reservee >= $3` de
 * `SQL_RESERVER` doit faire rougir tests/integration/reservation.test.ts.
 *
 * La requete est ici et non recopiee dans chaque test pour cette raison precise :
 * une requete dupliquee dans cinq tests se mute en cinq endroits, et une mutation
 * partielle laisse croire que le test resiste alors qu'il n'a pas ete exerce.
 *
 * Source de verite de cette requete : `.claude/rules/database.md` et ADR-006.
 * Toute divergence entre les deux est un defaut, pas une adaptation de test.
 */

/**
 * Reservation atomique : verification de disponibilite et ecriture en UNE seule
 * instruction, sans verrou explicite ni lecture prealable.
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
 *   C'est cette ligne que la preuve par mutation retire.
 *
 * Le parametre $2 porte la commande : `Reservation.commandeId` est OBLIGATOIRE
 * depuis ADR-024, une reservation sans commande n'existe pas en base.
 *
 * Aucune ligne rendue signifie un refus metier explicite, a presenter au client
 * sans jargon technique.
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
 * Liberation des reservations expirees, la tache planifiee des cinq minutes.
 *
 * La suppression des lignes et le decrement de la quantite reservee forment une
 * seule instruction : les separer laisserait une fenetre ou le stock est libre
 * dans une table et bloque dans l'autre.
 */
export const SQL_LIBERER_EXPIREES = `
  WITH expirees AS (
    DELETE FROM reservation WHERE expire_a < now()
    RETURNING variante_id, quantite
  )
  UPDATE variante v
  SET quantite_reservee = v.quantite_reservee - e.q
  FROM (
    SELECT variante_id, sum(quantite) AS q FROM expirees GROUP BY variante_id
  ) e
  WHERE v.id = e.variante_id
`;

/**
 * Conversion d'une reservation en vente payee.
 *
 * La quantite physique ET la quantite reservee decroissent ensemble : la piece
 * quitte le stock, elle n'est donc plus reservee. Ne decrementer que l'une des
 * deux laisserait la variante indisponible pour toujours, ou la ferait
 * reapparaitre en vente alors qu'elle est partie.
 */
export const SQL_CONVERTIR_EN_VENTE = `
  WITH conversion AS (
    DELETE FROM reservation WHERE commande_id = $1
    RETURNING variante_id, quantite
  )
  UPDATE variante v
  SET quantite_physique = v.quantite_physique - c.q,
      quantite_reservee = v.quantite_reservee - c.q
  FROM (
    SELECT variante_id, sum(quantite) AS q FROM conversion GROUP BY variante_id
  ) c
  WHERE v.id = c.variante_id
`;
