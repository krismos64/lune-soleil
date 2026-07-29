# ADR-006 : réservation de stock par quantité réservée dénormalisée

| Champ | Valeur |
|---|---|
| Statut | Accepté, vérifié par prototype |
| Date | 27 juillet 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-17 |
| Vérifié sur | PostgreSQL 18.4, conteneur `postgres:18-alpine` |

## Contexte

Le catalogue compte des pièces uniques : des boucles d'oreilles fabriquées à la
main, souvent en un seul exemplaire. Deux clientes peuvent lancer un paiement sur
la même pièce à quelques millisecondes d'intervalle.

Une double vente sur pièce unique oblige à rembourser, à s'excuser et détruit la
confiance. Le registre des risques la classe en probabilité moyenne et impact
élevé. C'est le point le plus critique du modèle de données.

La section 15.4 du cahier des charges propose une stratégie. Cet ADR la vérifie
avant que le schéma définitif ne soit construit dessus.

## Décision

La variante porte une colonne `quantite_reservee` dénormalisée. La réservation se
fait par une instruction unique, conditionnelle, avec `RETURNING` :

```sql
WITH reserve AS (
  UPDATE variante
  SET quantite_reservee = quantite_reservee + :qte
  WHERE id = :variante
    AND vente_web_activee = true
    AND quantite_physique - quantite_reservee >= :qte
  RETURNING id
)
INSERT INTO reservation (variante_id, quantite, expire_a)
SELECT id, :qte, now() + interval '30 minutes' FROM reserve
RETURNING variante_id;
```

Aucune ligne retournée signifie un refus métier, présenté à la cliente sans
message technique.

Trois contraintes en base constituent la dernière ligne de défense :

```sql
CHECK (quantite_physique >= 0)
CHECK (quantite_reservee >= 0)
CHECK (quantite_physique - quantite_reservee >= 0)
```

Le niveau d'isolation `READ COMMITTED`, celui par défaut de PostgreSQL, suffit.
Le verrou de ligne implicite pris par l'`UPDATE` conditionnel garantit
l'exclusion mutuelle, sans aucun verrou explicite.

### Un panier multi-articles peut interbloquer, correction de LS-49

Cet ADR affirmait « aucun verrou explicite, aucun risque d'interblocage ». La
seconde proposition ne découle pas de la première : l'`UPDATE` prend un verrou
de ligne implicite qu'il **tient jusqu'au `COMMIT`**. Deux paniers portant les
mêmes variantes dans un ordre opposé se bloquent mutuellement.

Reproduit sur PostgreSQL 18, avec l'instruction ci-dessus et rien d'autre. Le
script est versé dans `docs/prototypes/interblocage-panier.sh` :

```
[T1] ERROR:  deadlock detected
[T1] DETAIL:  Process 102 waits for ShareLock on transaction 757;
              blocked by process 109.
              Process 109 waits for ShareLock on transaction 756;
              blocked by process 102.
```

**Ce que cela ne remet pas en cause.** PostgreSQL détecte le cycle et annule
l'une des deux transactions. L'état final reste cohérent, aucune survente ne se
produit, et la transaction survivante réserve ses deux variantes correctement.
Les contraintes `CHECK` et le choix de l'`UPDATE` conditionnel restent valides :
le défaut est un échec de commande sous concurrence, pas une atteinte à
l'intégrité du stock.

**Ce que cela impose.** La transaction de réservation d'un panier doit ordonner
les variantes de façon déterministe, par identifiant croissant, avant de les
mettre à jour. Deux paniers portant les mêmes pièces prennent alors les verrous
dans le même ordre et l'un attend l'autre au lieu de l'interbloquer. Le
traitement de l'erreur `40P01` reste nécessaire en dernier recours, un
interblocage restant possible avec une autre transaction concurrente.

Cette correction est portée par **LS-50**, à traiter avant la phase 3 : elle
suppose un service de réservation qui n'existe pas encore.

L'alternative écartée plus bas reste écartée pour la même raison, aggravée :
`SELECT ... FOR UPDATE` sérialise en plus les accès à une variante unique.

## Vérification par prototype

Un prototype a été exécuté sur PostgreSQL 18.4 avant l'écriture du schéma.

### La méthode naïve échoue

Le code écrit spontanément lit le stock, décide, puis écrit :

```sql
SELECT quantite_physique - quantite_reservee ...  -- les deux lisent "1"
-- 100 ms de traitement applicatif
UPDATE variante SET quantite_reservee = quantite_reservee + 1 ...
```

Résultat observé avec deux requêtes concurrentes : les deux transactions lisent
`disponible = 1`, les deux concluent qu'elles peuvent réserver. La seconde est
rejetée par la contrainte `chk_pas_de_survente` :

```
ERROR: new row for relation "variante" violates check constraint "chk_pas_de_survente"
DETAIL: Failing row contains (1, LS-ECLIPSE-01, 1, 2, t)
```

L'état final reste correct, mais uniquement grâce à la contrainte. La cliente
reçoit une erreur de base de données, donc une page d'erreur serveur.

### La méthode atomique réussit

Mêmes conditions, avec l'instruction conditionnelle unique :

| Cliente | Résultat |
|---|---|
| Amélie | `variante_id: 1`, réservation créée |
| Sophie | `(0 rows)`, `INSERT 0 0`, aucune erreur |

Sophie obtient un refus propre, exploitable par l'application pour afficher un
message métier.

### Résultats des six tests

| Test | Scénario | Attendu | Obtenu |
|---|---|---|---|
| 1 | Méthode naïve, 2 concurrentes | échec | échec, erreur de contrainte |
| 2 | Méthode atomique, 2 concurrentes | 1 gagnante | 1 gagnante, 1 refus propre |
| 3 | Méthode atomique, 20 concurrentes | 1 gagnante | 1 gagnante, 19 refus |
| 4 | Vente web désactivée | non achetable, stock intact | 0 réservation, physique = 1 |
| 5 | Réservation expirée puis purge | pièce relibérée | disponible repasse à 1 |
| 6 | Conversion en vente payée | physique et réservée à 0 | physique = 0, réservée = 0 |

Le test 3 est le plus significatif : sur vingt requêtes simultanées sur une pièce
unique, une seule réservation existe en fin d'exécution et le stock n'est jamais
négatif.

## Alternatives écartées

**Verrou explicite `SELECT ... FOR UPDATE`** puis lecture, décision, écriture.
Fonctionne, mais sérialise les accès à la variante et introduit un risque
d'interblocage si plusieurs variantes sont verrouillées dans un ordre différent,
ce qui arrive avec un panier multi-articles. Écarté pour cette raison.

**Niveau d'isolation `SERIALIZABLE`**. Correct, mais impose de gérer les erreurs
de sérialisation et de rejouer les transactions côté applicatif. Complexité non
justifiée alors que l'`UPDATE` conditionnel suffit.

**Compter les réservations actives à la demande**, sans colonne dénormalisée.
Évite la dénormalisation mais rend la condition non atomique et impose un
agrégat à chaque tentative. Écarté.

**Aucune protection, correction a posteriori.** Le cahier des charges en fait un
critère de refus d'ouverture. Écarté.

## Conséquences

Le schéma Prisma doit porter `quantiteReservee` sur la variante, avec les trois
contraintes `CHECK`. Prisma ne génère pas les contraintes `CHECK` depuis le
schéma : elles sont ajoutées par une migration SQL manuelle, revue.

La réservation utilise du SQL brut via `$queryRaw`, l'API Prisma ne permettant
pas d'exprimer un `UPDATE` conditionnel avec `RETURNING`. Ce SQL est paramétré,
relu et couvert par un test de concurrence.

Trois opérations doivent rester transactionnelles et sont vérifiées par le
prototype : la réservation avec insertion de la ligne, la libération des
réservations expirées, la conversion d'une réservation en vente.

La tâche planifiée de libération s'exécute toutes les cinq minutes et doit être
idempotente.

Le test de concurrence du prototype devient le test phare du projet, écrit avant
l'implémentation du paiement et conservé en intégration continue.

## Risques

Un développeur pressé peut réintroduire le motif « lire puis écrire » sans s'en
apercevoir, le code paraissant plus lisible. Les contraintes `CHECK` empêcheront
la corruption des données mais produiront une erreur serveur au lieu d'un refus
métier. Atténuation : la règle `.claude/rules/database.md` documente le motif
attendu, et l'agent `ls-critical-reviewer` contrôle ce point en priorité.

La colonne dénormalisée peut dériver de la somme réelle des réservations si une
opération oublie de la décrémenter. Atténuation : toute modification passe par les
trois opérations transactionnelles identifiées, et un contrôle de cohérence
périodique peut comparer `quantite_reservee` à la somme des réservations actives.
