/**
 * La primitive de reservation de stock, en SQL, LS-68.
 *
 * POINT D'ENTREE UNIQUE DES TESTS vers les instructions de reservation, et cible
 * de la mutation exigee par LS-68 : retirer la condition
 * `quantite_physique - quantite_reservee >= $3` de `SQL_RESERVER` doit faire
 * rougir les tests d'integration de reservation.
 *
 * Les requetes ne sont pas recopiees dans chaque test pour cette raison precise :
 * une requete dupliquee dans cinq tests se mute en cinq endroits, et une mutation
 * partielle laisse croire que le test resiste alors qu'il n'a pas ete exerce.
 *
 * DEPUIS LS-50, `SQL_RESERVER` vit dans `src/repositories/stock.ts` et n'est que
 * reexportee ici : le meme raisonnement vaut entre ce fichier et le code
 * applicatif. Les deux autres requetes attendent leur service, phase 2.
 *
 * Source de verite de ces requetes : `.claude/rules/database.md` et ADR-006.
 * Toute divergence entre les deux est un defaut, pas une adaptation de test.
 */

/**
 * Reservation atomique, REEXPORTEE depuis le repository applicatif, LS-50.
 *
 * ELLE Y ETAIT RECOPIEE JUSQU'A LS-50, quand le code applicatif n'existait pas
 * encore. Maintenir deux copies identiques d'une requete dont la correction
 * depend du SQL exact revient a parier que personne n'en modifiera qu'une : le
 * test continuerait de passer sur SA copie pendant que la production emploierait
 * l'autre. C'est le defaut que l'en-tete de ce fichier denonce, applique a
 * lui-meme.
 *
 * La reexportation garde la mutation efficace : retirer la condition de
 * disponibilite dans le repository fait toujours rougir les tests, et elle la
 * rend meme plus fidele, la cible etant desormais le code reellement execute.
 */
export { SQL_RESERVER } from "@/repositories/stock";

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
  SET quantite_reservee = v.quantite_reservee
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
