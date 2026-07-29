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

**Et elle l'était encore après cette correction.** Voir la section finale : un
quatrième rapport a trouvé deux occurrences supplémentaires dans le même fichier.
Cinq au total, sur trois fichiers.

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

**Le découpage de LS-2**, interrompu deux fois par des rapports. Onze stories
esquissées, ordonnées par dépendance, de l'initialisation Next.js jusqu'au
conteneur de tâches planifiées, en passant par la migration initiale et
l'authentification.

Deux tickets attendent leur phase, LS-50 et LS-51, tous deux nés de cette séance.

### Fin des audits complets, décision du 29 juillet 2026

Quatre rapports externes en deux jours, sur un dépôt qui compte près de 10 000
lignes de documentation et **toujours aucun `package.json`**. Le rendement
décroît : chaque passe trouve moins, pour un coût constant.

Décision : **plus d'audit complet avant la fin de la phase 1.** À partir de LS-2,
ce sont les tests et l'intégration continue qui détectent les régressions, pas
une relecture humaine ou externe du projet entier.

Ce qui reste ouvert et signalé par le dernier rapport, sans bloquer le démarrage :

- l'atomicité réservation-commande, `Reservation.commandeId` nullable alors que
  le parcours réserve avant de créer la commande. **Ce point touche le schéma
  initial**, donc à trancher avant la migration, en extension de LS-50
- des écarts de nommage résiduels entre modèle conceptuel et Prisma,
  `referenceSessionFournisseur` contre `identifiantFournisseur`, `recuA` contre
  `creeA`, et les champs LS-33 d'`Expedition` absents du modèle
- la décision LS-33 non propagée dans le modèle conceptuel et les parcours, qui
  la présentent encore comme ouverte
- l'estimation de LS-2 à 20 h, à revoir après découpage

Ces points vont dans un ticket de nettoyage, pas dans une nouvelle passe d'audit.

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

## Rebondissement, LS-49 rouvert le même jour

Un quatrième rapport, remis après la clôture, a trouvé **deux occurrences de
plus** du prédicat périmé, aux lignes 516 et 1555 de `MODELE-CONCEPTUEL.md` : le
tableau des quatre clés d'idempotence et le récapitulatif des unicités
partielles. Le contrôle était vert malgré elles.

Ces deux lignes écrivent `paiement (commandeId)` sans nommer l'index ni le mot
`UNIQUE`. Quatrième forme d'écriture, hors de portée des trois ancres.

**C'est la troisième erreur d'ancrage du même contrôle en une journée**, et
précisément le piège que sa propre documentation décrivait quelques heures plus
tôt : empiler une ancre par forme rencontrée garantit que la suivante échappe.
J'avais écrit la leçon et je l'ai reproduite.

L'ancre porte désormais sur `<table> (`, point commun de presque toutes les
écritures d'une contrainte, qui couvre `UNIQUE paiement (commande_id)` par
inclusion. Deux ancres bien choisies remplacent trois ancres accumulées. La forme
des champs indexés reste nécessaire pour la règle V14, qui ne nomme pas la table :
la retirer fait rougir le cas 6 du script de mutation, ce qui est son rôle.

Huit mutations, huit détectées, huit échecs exactement.

Deux formulations de prose corrigées en plus, fausses mais structurellement hors
de portée d'un contrôle ancré sur les contraintes : « au plus un paiement
`REUSSI` par commande » dans le modèle conceptuel et les parcours. Un paiement
remboursé occupe le filtre lui aussi.

Le message de succès du script annonce maintenant **sa portée réelle** au lieu
d'affirmer qu'aucun document ne contredit son prédicat. Un contrôle qui
surestime sa couverture invite à lui faire confiance là où il ne regarde pas.

Commit `612a751`, PR #31.

### Ce que ce rebondissement change au bilan

Le compte final est de **cinq occurrences** du prédicat périmé sur trois
fichiers, contre trois annoncées plus haut. Chaque passe en a trouvé de
nouvelles, et chacune était vérifiée avec le meilleur outil disponible à ce
moment-là.

La conclusion pratique n'est pas d'auditer une fois de plus. C'est que la
recherche exhaustive doit chercher la **valeur** (`REUSSI` sur tout le dépôt) et
non la forme supposée du prédicat, ce qui a été fait cette fois et ne renvoie
plus rien.

## Décision préalable au découpage, l'atomicité réservation-commande

Christophe a demandé d'instruire ce point avant de découper la phase 1, avec un
temps limité à trente minutes et sans nouvel audit général. Fait, LS-53,
ADR-024, commit `4a9fd2b`.

### Le problème en une phrase

Le parcours 1 réservait le stock, puis créait la commande. Entre les deux, une
panne laissait une réservation que rien ne rattachait à personne : la pièce
restait bloquée trente minutes, et le client qui réessayait recevait « cette
pièce vient d'être vendue » alors qu'il était seul à la vouloir.

### Ce que l'instruction a établi

Trois règles auraient pu dépendre de réservations sans commande. Aucune n'en
dépend, ce qui a rendu la décision simple :

| Règle | Ce qu'elle contrôle | Dépend de `commandeId` ? |
|---|---|---|
| S5, vente externe | une réservation active **sur la variante** | non |
| S3, purge | `expireA` dépassé | non |
| Parcours 1 | déclarait les étapes 4 à 7 transactionnelles | non, il exigeait l'inverse |

Le schéma ne garantissait donc pas ce que le parcours affirmait déjà.

### La décision

Commande, lignes et réservations dans une seule transaction.
`Reservation.commandeId` obligatoire, clé étrangère en `RESTRICT`.

Le raisonnement tient en une phrase : **une réservation sans commande n'a aucun
sens métier, donc le schéma ne doit pas pouvoir la représenter.** Rendre l'état
absurde impossible en base vaut mieux que compter sur le code applicatif pour ne
jamais le produire.

Deux options écartées, tracées dans l'ADR : garder le nullable, et introduire une
entité panier pour représenter un état qui dure quelques millisecondes.

### Le point qui n'était pas dans la question

**La session de paiement se crée après le `COMMIT`**, et cela méritait sa propre
règle numérotée, S11. Un appel réseau à l'intérieur de la transaction tiendrait
le verrou de ligne de la variante pendant tout l'aller-retour, ce qui aggrave
l'interblocage de LS-50 d'un facteur mille. Et son échec effacerait la commande
par rollback, alors qu'après le commit il laisse une commande
`EN_ATTENTE_PAIEMENT` que la réconciliation traite normalement.

C'est typiquement la contrainte qu'une session future casserait sans le savoir,
en cherchant à « tout mettre dans la transaction pour être sûr ».

### Vérifications

```
prisma validate              schéma valide, Node 22.14
verifier-schema.sh           50 réussites, 0 échecs
verifier-regles.sh           vert
verifier-regles-mutation.sh  8 mutations, 8 détectées
```

Deux contrôles ajoutés, chacun prouvé par mutation. Le second est instructif :
repasser la clé étrangère en `SET NULL` fait échouer la suppression par le
`NOT NULL` de la colonne et non par la clé étrangère. Deux contraintes se
recouvrent, et `verifier_rejet` les distingue, ce qui est exactement la
correction apportée en LS-13 au contrôle qui passait pour la mauvaise raison.

### Séparation d'avec LS-50

Volontaire, pour une raison d'ordre. Cette décision change une colonne, donc elle
précède la migration initiale. Le tri déterministe des variantes suppose un
service de réservation qui n'existe pas, donc il attend la phase 3. Les mélanger
aurait bloqué LS-2 sur du code non écrivable.

Les deux se combineront le moment venu : même transaction, même ordre de verrous,
même test de concurrence.

### État après cette décision

Le schéma est **définitif pour la migration initiale**. Plus rien ne bloque le
découpage de LS-2.
