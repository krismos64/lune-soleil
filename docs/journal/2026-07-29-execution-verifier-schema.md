# 29 juillet 2026, la première exécution de verifier-schema.sh

Quatrième session de la journée. La précédente s'était close en listant
`verifier-schema.sh` comme **non exécuté**, faute de Docker lancé, et le contrôle
de couverture par colonne qu'elle venait d'ajouter n'avait donc jamais tourné.
Christophe a choisi de lancer Docker avant d'ouvrir la phase 1 plutôt que de
découper LS-2 tout de suite.

Le choix était le bon : le script échoue à la première tentative.

## Ce qui a été trouvé

### Le schéma SQL ne portait pas ADR-025

```
ABANDON : l'application de 001_contraintes_check.sql a échoué
ERROR:  column "mode_livraison" does not exist
```

Le commit `1a90384` de la veille a modifié `schema.prisma` et
`001_contraintes_check.sql`, **en oubliant `schema.sql`**. Les deux descriptions
du schéma ont divergé : Prisma portait l'enum `ModeLivraison`, les trois colonnes
de la commande, le mode de l'expédition et les cinq colonnes produit, le SQL de
référence n'en portait aucune.

L'écart ne pouvait se voir qu'en exécutant le script. Aucune relecture ne l'avait
signalé, et le journal de la veille présentait la conception comme close.

Répercuté dans `schema.sql` : enum `ModeLivraison`, `commande.mode_livraison`,
`point_relais_id`, `point_relais_adresse`, `expedition.mode`, plus
`description_courte`, `matieres`, `entretien`, `fabrication` sur le produit et
`dimensions` sur la variante.

### Les deux CHECK d'ADR-025 n'avaient aucun contrôle

Ils étaient arrivés au SQL sans qu'aucune assertion ne les exerce. Cinq contrôles
ajoutés, couvrant l'équivalence dans les deux sens sur les deux entités.

Le cas dangereux est en premier dans le script, une commande `DOMICILE` portant
un point de retrait : l'étiquette partirait vers un relais alors que le client a
payé 4,99 € pour être livré chez lui, et rien ne le signalerait avant
l'expédition.

Le cas de l'expédition rebasculée vers un relais après un échec à domicile est
couvert en acceptation, c'est le scénario que la double porte du mode existe pour
permettre.

### Le contrôle jamais exécuté trouve un défaut à sa première exécution

```
ECHEC colonnes enum non contrôlées : historique_statut.origine journal_email.origine
```

`OrigineEcriture` est porté par **trois** colonnes, `mouvement_stock.origine`,
`historique_statut.origine` et `journal_email.origine`. La table de
correspondance n'en couvrait qu'une.

**C'est exactement le motif de `ModeLivraison` la veille**, par un autre type. Le
contrôle par type reste vert dès qu'un seul porteur figure dans la table, et les
autres colonnes du même type cessent d'être comparées au modèle conceptuel en
silence. Le contrôle de couverture par colonne existe pour ça, il a fait son
travail dès qu'on l'a laissé tourner.

Les valeurs de `journal_email.origine` portent la règle E5 : `RECONCILIATION` y
est indispensable, c'est le second chemin d'entrée de la décision D. Cette
colonne échappait au contrôle de conformité.

## Ce qui a dérapé

**Une mutation mal conçue a d'abord semblé prouver l'inverse.** En neutralisant
`chk_commande_mode_point_relais` par un renommage en `..._DESACTIVE`, le script
restait vert à 60 réussites. Deux minutes de doute sur les contrôles que je
venais d'écrire.

La cause tient en une ligne : le renommage laisse la contrainte **active**, elle
rejette toujours, et le nom muté contient le nom cherché comme préfixe. Le grep
de `verifier_rejet` matchait donc. La mutation ne retirait rien.

Refaite en remplaçant le prédicat par `CHECK (true)`, elle est détectée
immédiatement, deux échecs. La leçon est sur la méthode de mutation elle-même :
une mutation qui ne change pas le comportement observable ne prouve rien, et le
signal « vert sous mutation » doit d'abord faire suspecter la mutation avant les
contrôles.

## État des contrôles

| Contrôle | Résultat |
|---|---|
| `verifier-schema.sh` | **60 réussites, 0 échec**, exécuté pour de bon |
| Mutations sur ce script | 5 injections, 5 détectées |
| `verifier-regles.sh` | vert |
| `verifier-regles-mutation.sh` | 8 mutations, 8 détectées |
| Cadratins dans le diff | aucun |
| `type-check`, `lint`, `test` | sans objet, aucun `package.json` |

Le détail des cinq mutations, chacune injectant un défaut réel :

| Mutation | Détection |
|---|---|
| retirer `JOURNAL_EMAIL\|origine` de la table | colonnes enum non contrôlées |
| neutraliser le CHECK de la commande | 2 échecs |
| neutraliser le CHECK de l'expédition | 2 échecs |
| retirer `mode_livraison` de `schema.sql` | ABANDON, le défaut du jour |
| retirer l'enum `ModeLivraison` de `schema.sql` | ABANDON |

Les deux dernières confirment que le défaut corrigé aujourd'hui ne peut plus
repasser inaperçu, à condition que le script tourne.

## État des tickets

| Ticket | État |
|---|---|
| LS-13 | commenté, l'écart `schema.sql` fermé, reste ouvert sur ses trois dettes de phase 1 |

## Prochaine étape

**Découper LS-2**, inchangé depuis hier. La différence est que le schéma est
maintenant vérifié sur PostgreSQL réel et non seulement relu.

Les deux questions posées à Christophe restent ouvertes : granularité, onze
stories ou regroupement, et ordre d'attaque.

Les trois dettes de LS-13 attendent toujours la phase 1 : fixer Node 22 LTS
partout, créer `prisma.config.ts`, recopier toutes les contraintes `CHECK` dans
la migration Prisma. La commande fait foi sur leur nombre :

```bash
grep -c "ADD CONSTRAINT" prisma/migrations/manual/001_contraintes_check.sql
```

## Ce que cette session change pour la suite

`verifier-schema.sh` doit tourner **à chaque modification du schéma**, pas en fin
de phase. Deux sessions de suite ont livré un schéma incohérent que trente
secondes d'exécution auraient signalé.

Le sujet naturel est d'en faire une porte automatique quand la CI existera, en
phase 1. Il n'y a rien à automatiser avant, faute de `package.json` et de
workflow.
