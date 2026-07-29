# 29 juillet 2026, second temps : aligner les sources de vérité

Suite de la même journée. La séance du matin corrigeait les enums et les règles,
LS-45 à LS-48. Celle-ci part d'un troisième rapport externe, remis alors que
j'allais découper la phase 1.

## Ce que le rapport valait

Nettement mieux que le précédent, qui avait inventé un ADR-013 de toutes pièces.
Aucune invention cette fois, les chiffres Jira exacts, et **deux défauts réels
que mes propres contrôles n'avaient pas attrapés**.

Il se trompe en revanche sur des détails de lecture, et son point le plus
important est juste pour la mauvaise raison. Vérifier chaque affirmation avant de
la reprendre reste la bonne méthode : cinq de ses formulations étaient fausses,
alors même que les défauts sous-jacents étaient réels.

## Le prédicat de paiement, sur trois documents

LS-45 avait élargi le filtre de `paiement_reussi_unique` aux trois états
d'encaissement, après avoir mesuré 3220 centimes encaissés sur une commande de
1610. Trois documents portaient encore `WHERE statut = 'REUSSI'`.

Le risque n'était pas théorique. `database.md` se charge sur `src/services/**` et
aurait fait autorité au moment de coder le paiement, en décrivant exactement la
faille corrigée quelques heures plus tôt.

**J'ai d'abord conclu à deux fichiers et non trois**, en affirmant que
`MODELE-CONCEPTUEL.md` était innocent. Faux : sa règle V14 écrivait
`statut = REUSSI` sans apostrophes, forme que ma recherche ratait. Le rapport
avait raison, ma vérification était incomplète.

## Le contrôle qui aurait dû l'attraper, et ses deux angles morts

`verifier-regles.sh` restait vert parce qu'il vérifie l'existence des
identifiants, jamais la cohérence d'un prédicat. Tous les identifiants
existaient.

Un troisième contrôle compare désormais les valeurs d'enum de chaque index
partiel du schéma à celles citées par les documents qui le décrivent.
Il a fallu trois tentatives.

**Premier angle mort.** Ancrer sur le seul nom d'index ratait `database.md`, qui
n'écrit jamais `paiement_reussi_unique` mais `UNIQUE paiement (commande_id)`.
C'est-à-dire précisément le fichier le plus dangereux des deux, celui qui se
charge au moment de coder.

**Second angle mort, en sens inverse.** Une version intermédiaire ancrait sur la
colonne du prédicat, `statut =`. Elle attrapait toute ligne parlant d'un statut :
18 faux positifs sur un état pourtant correct, et deux index qui se
contaminaient. Une ancre trop large rend le contrôle inutilisable aussi sûrement
qu'une ancre absente.

L'ancrage final porte sur trois formes, chacune rencontrée dans un document réel.

**Les deux ont été trouvés par le script de mutation, pas par relecture.**
`verifier-regles-mutation.sh` réinjecte six fois un défaut réel et exige que le
contrôle échoue à chaque fois. Il compte aussi les lignes d'échec : six
mutations doivent produire exactement six échecs, sans quoi le contrôle
contamine.

## L'interblocage sur panier multi-articles

Le rapport affirme qu'ADR-006 est « trop catégorique » en disant « aucun risque
d'interblocage ». Il a raison sur le fond et tort sur la lecture : l'ADR
**identifie** ce risque, et c'est sa raison d'écarter `SELECT ... FOR UPDATE`.

J'ai testé plutôt que de trancher par raisonnement, avec l'instruction exacte de
l'ADR et rien d'autre :

```
ERROR:  deadlock detected
DETAIL: Process 105 waits for ShareLock on transaction 757; blocked by process 112.
        Process 112 waits for ShareLock on transaction 756; blocked by process 105.
```

L'`UPDATE` conditionnel prend un verrou de ligne implicite **tenu jusqu'au
`COMMIT`**. L'absence de verrou explicite n'implique pas l'absence
d'interblocage, et c'est exactement l'inférence que l'ADR faisait.

**Deux nuances que le rapport ne fait pas, et qui fixent la priorité.**
PostgreSQL détecte le cycle et annule une des deux transactions. L'état final
reste cohérent, aucune survente, et la transaction survivante réserve ses deux
variantes correctement. Le défaut est un échec de commande sous concurrence, pas
une atteinte à l'intégrité du stock.

D'où le classement en LS-50, avant la phase 3, et non bloquant immédiat.

Le script est versé dans `docs/prototypes/interblocage-panier.sh`. Il contrôle
les deux propriétés : il échoue si l'interblocage disparaît comme s'il produit
une survente.

## Cinq écarts entre le modèle et le schéma

| Champ | Arbitrage |
|---|---|
| `Categorie.ordre` | ajouté, tri choisi par l'exploitante |
| `Produit.publieA` | ajouté, non dérivable de `statut` ni de `modifieA` |
| `Facture.cheminPdf` | ajouté, nul = PDF en échec, mécanisme prévu au modèle |
| `Avoir.cheminPdf` et `Avoir.instantaneLegal` | ajoutés, un avoir est un document légal comme une facture |
| `LigneCommande` | deux libellés distincts, `totalLigneCentimes` reste dérivé |

Sur `LigneCommande` j'ai changé d'avis en cours de route. Mon arbitrage initial
était de corriger le modèle vers le libellé unique du schéma. En vérifiant, le
modèle a raison : une facture affiche le produit et la déclinaison séparément, et
l'invariant 3 interdit de les recomposer depuis le catalogue actuel. Les fusionner
à l'écriture rend impossible de les réafficher.

`totalLigneCentimes` reste hors schéma en revanche : il vaut
`prixFigeCentimes × quantite`, deux colonnes de la même ligne, et un total
redondant se désynchronise sans qu'aucune contrainte ne le détecte.

`cguAccepteesA` et `cguVersion` deviennent `cgv*`. Le contrat accepté lors d'un
achat est celui de vente. Le renommage coûte quelques minutes avant la migration
initiale, une migration entière après.

## Un détour sur Prisma 7

`prisma migrate diff` a changé d'interface : `--to-schema-datamodel` est devenu
`--to-schema`, `--from-url` a disparu au profit d'un `prisma.config.ts`
obligatoire. La régénération de `schema.sql` par cette voie suppose donc le
projet installé, ce qui appartient à la phase 1.

J'ai édité le SQL à la main et **prouvé l'équivalence autrement** : application
sur une base réelle, puis comparaison des dix colonnes touchées à
`information_schema`. Types, noms et nullabilité conformes, aucune trace des
anciens noms.

Node 23.9.0 reste incompatible avec Prisma 7, le piège documenté en LS-13. Tout
a tourné sous Node 22.14.

## Ce qui a été livré

| Commit | Sujet |
|---|---|
| `922bfee` | prédicat de paiement, et le contrôle qui l'attrape |
| `0f3bd6c` | cinq écarts modèle/schéma fermés |
| `124b385` | affirmation d'ADR-006 corrigée, prototype versé |
| `a0841c4` | exception transitoire sur les contrôles, ménage Jira |

Fusionné en rebase par la PR #29, `main` à jour, rien en attente.

### Vérifications

```
prisma validate               schéma valide, Node 22.14
verifier-schema.sh            48 réussites, 0 échecs
colonnes réelles en base      10 sur 10 conformes au schéma
verifier-regles.sh            vert, aucun faux positif
verifier-regles-mutation.sh   6 mutations, 6 détectées, 6 échecs exactement
interblocage-panier.sh        interblocage reproduit, aucune survente
```

## Ménage Jira

LS-23 rattaché à LS-22 : les photographies sont un contenu porté par
l'exploitante, pas une fondation technique.

LS-36 affirmait encore que les avis ne sont pas modélisés, alors que LS-37 les a
modélisés et LS-13 traduits en schéma.

LS-1 exigeait quatre filaires quand LS-15 en justifie un seul. Sa porte de sortie
dit maintenant explicitement que **les stories des phases 1 et 2 ne sont pas
détaillées**, point non rempli.

Quinze stories sans epic rattachées. Il n'en reste aucune.

## Où on en est

| Ticket | Sujet | État |
|---|---|---|
| LS-49 | Alignement des sources de vérité | Terminé, fusionné, `922bfee` à `a0841c4` |
| LS-50 | Tri déterministe des variantes | À faire, avant la phase 3 |
| LS-51 | Idempotence d'envoi des emails | À faire, avant la phase 4 |
| LS-2 | Phase 1, fondations techniques | À découper, deux stories filles seulement |
| LS-14 | Diagramme de séquence de l'achat | À faire |

## Prochaine étape

**Le découpage de LS-2**, interrompu par ce rapport. Onze stories esquissées,
ordonnées par dépendance, de l'initialisation Next.js jusqu'au conteneur de
tâches planifiées, en passant par la migration initiale et l'authentification.

Deux tickets attendent leur phase, LS-50 et LS-51, tous deux nés de cette séance.

## Ce que cette journée apprend

Trois rapports externes en deux jours, et une constante : **ils pointent la bonne
zone et se trompent sur la formulation**. Le premier inventait un ADR, celui-ci
attribue des champs aux mauvaises entités et inverse le raisonnement d'un ADR.
Vérifier chaque affirmation contre le dépôt reste indispensable, et suffisant.

L'autre leçon est sur les contrôles. `verifier-regles.sh` était vert et ne
gardait rien sur ce point. Les deux angles morts de sa correction ont été
trouvés par mutation, pas par relecture, et le second n'existait que parce que
j'avais corrigé le premier. **Un contrôle qui n'a jamais échoué sur le défaut
qu'il prétend attraper est une opinion**, et sa première version ne l'attrape
presque jamais du premier coup.
