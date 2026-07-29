# 29 juillet 2026, un rapport externe, un vrai défaut et un trou que j'ai ouvert

LS-45. Une relecture externe signale huit points. Un seul tient, et sa correction
en a créé un plus grave, trouvé par la revue critique.

## Ce que valait le rapport

Vérification faite point par point contre le dépôt : **un défaut réel sur huit**.

Le point juste : `StatutPaiement` n'avait pas `PARTIELLEMENT_REMBOURSE`, alors
que le modèle conceptuel, `PARCOURS.md` et `payments.md` l'exigent tous les
trois. Défaut réel, sur la zone paiement, que mes 29 contrôles n'avaient pas vu.

Le point le plus instructif est faux. Le rapport bâtit son argumentation la plus
longue, deux options d'arbitrage et une estimation de 8 à 16 heures, sur un
**ADR-013 qui n'existe pas**. `grep -rn "ADR-013"` sur tout le dépôt : zéro
occurrence. Le dépôt compte quatre ADR, 006, 021, 022 et 023.

Deux de ses trois « bloquants » contredisaient des décisions documentées.
Supprimer `montantAvoirCentimes` défaisait la décision F, arbitrée et classée
niveau 2 la veille. Ajouter taux et inclusion de taxe modélisait une TVA que
l'entreprise ne collecte pas, en franchise en base.

Appliquer ces deux recommandations aurait cassé le modèle. Le tri a pris plus de
temps que la correction.

## Le défaut que j'ai introduit en corrigeant

Ajouter `PARTIELLEMENT_REMBOURSE` a ouvert un trou d'encaissement. `ls-critical-reviewer`
l'a trouvé, je l'ai reproduit :

```
1. pay1 en REUSSI sur la commande
2. second REUSSI            -> rejeté par paiement_reussi_unique, correct
3. pay1 -> PARTIELLEMENT_REMBOURSE, il sort du filtre partiel
4. second REUSSI            -> ACCEPTÉ
```

État final mesuré sur PostgreSQL 18.4 : **3220 centimes encaissés sur une
commande de 1610**.

L'index filtrait `WHERE statut = 'REUSSI'`. Un état ajouté à l'enum devient
automatiquement une sortie du filtre. La séquence n'a rien d'exotique, c'est le
parcours 3, un remboursement partiel suivi d'un second.

Le contrôle V14 existant restait vert : il ne testait que l'insertion frontale
d'un second `REUSSI`, jamais le contournement en deux temps.

**Un prédicat d'index partiel énumère des états. Ajouter une valeur à l'enum
modifie ce que le prédicat laisse passer, en silence.**

## Le contrôle censé tout couvrir en oubliait un

J'ai écrit un contrôle générique des enums, et il avait le défaut exact qu'il
devait supprimer : `OrigineEcriture` n'y figurait pas.

La cause est en amont. Le modèle conceptuel écrit `texte origine` et non
`enum origine` aux trois endroits où il apparaît. J'ai bâti ma table en relevant
les lignes `enum` du document : elle en comptait douze, la base en déclare
treize.

Conséquence : retirer `RECONCILIATION` laissait le script vert. C'est la valeur
dont dépend la règle E5, celle qui ferme le second chemin d'entrée de la
décision D. Sans elle, un webhook tardif envoie une seconde confirmation après
régularisation.

La parade n'est pas d'ajouter la ligne manquante, c'est le contrôle de
complétude : `count(*)` sur `pg_type` comparé au nombre d'entrées de la table.
**Un contrôle censé couvrir tous les enums doit prouver qu'il les couvre tous.**

## Deux colonnes libres décrivant le même fait

`statut_traitement` et `traite_a` n'étaient reliés par rien. Quatre combinaisons
acceptées, dont `TRAITE` avec `traite_a` nul : une reprise filtrant sur
`traite_a IS NULL` rejoue un événement déjà traité, donc un second mouvement de
stock sur un rejeu du prestataire.

`CHECK` d'équivalence ajouté. Le motif est documenté trois fois dans la mémoire
du projet, il s'est reproduit une quatrième.

## Mes propres contrôles, deux fois verts pour la mauvaise raison

Pendant l'écriture, deux défauts du type identifié la veille en LS-13.

`docker exec -i` héritait du stdin de la boucle et avalait la liste : le contrôle
s'arrêtait **après le premier enum sur douze**, en affichant OK. Un contrôle qui
n'examine qu'un douzième de son périmètre et annonce vert.

`mapfile` n'existe pas en bash 3.2, la version livrée par macOS. Le script aurait
cassé sur la machine de développement.

## Vérification

48 réussites, 0 échec. Neuf mutations injectées, chacune fait rougir le contrôle
correspondant, y compris les trois défauts trouvés par la revue. Contre-épreuve :
un enum réordonné ne rougit pas.

## Où on en est

| Ticket | Sujet | État |
|---|---|---|
| LS-45 | Alignement des enums, V14, cohérence événement | Terminé, fusionné, `52b3680` |
| LS-46 | Règle périmée sur les champs fiscaux | À faire, Must Go-Live |
| LS-14 | Diagramme de séquence de l'achat | À faire, débloqué |
| LS-2 | Phase 1, fondations techniques | Prochaine phase |

LS-46 vient de la même relecture, par un autre chemin que celui qu'elle
indiquait. `.claude/rules/database.md:225` annonce trois champs fiscaux,
`taxRate`, `taxAmount` et `priceIncludesTax`, dont aucun n'existe. Le schéma
porte `montantTaxeCentimes`. Fichier chargé automatiquement au moment de coder,
donc même mécanisme de régression que le filtre d'email corrigé la veille.

## Prochaine étape

**LS-46**, court, ou **LS-14**, ou la **phase 1**.

Le script de vérification reste manuel. Il garde maintenant treize enums, quatre
clés d'idempotence et l'invariant V14, et rien ne le déclenche. LS-2 doit le
brancher en intégration continue : un contrôle qu'il faut penser à lancer ne
garde rien de façon fiable.
