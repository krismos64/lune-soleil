# repositories/

Accès aux données, par domaine.

Un repository traduit une intention de lecture ou d'écriture en requête Prisma.
Un fichier par domaine : produits, commandes, stock, factures.

## Ce qui entre ici

- les requêtes Prisma et les `$queryRaw` nécessaires
- les instructions dont la correction dépend du SQL exact, comme l'UPDATE
  conditionnel de réservation de stock, voir ADR-006
- la projection vers des types de domaine

## Ce qui n'entre pas

- la décision métier : un repository ne choisit pas si une réservation est
  légitime, il l'exécute
- l'ouverture d'une transaction, qui appartient au service appelant, afin que
  plusieurs écritures partagent la même

## Point de vigilance

La réservation de stock passe par un UPDATE conditionnel en `$queryRaw`, prouvé
par prototype. Prisma ne sait pas exprimer la condition sur la quantité dans un
`update` typé. Ne pas « simplifier » cette requête, voir ADR-006 et ADR-024.
