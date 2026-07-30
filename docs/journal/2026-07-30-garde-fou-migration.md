# 30 juillet 2026, un garde-fou qui n'a jamais rien gardé

Quatrième page du 30 juillet. Christophe a soumis une analyse externe du projet
avant de lancer LS-66, en demandant si je la partageais. Vérification point par
point, puis correction du seul défaut qui touchait du code.

## Ce qui a été fait

**LS-42**, la détection destructive de `scripts/migrate-production.sh`, corrigée
et prouvée par mutation. Commits `c5c8d64`, `6ffeb5f`, `2e40d76`, PR #50 fusionnée
sur `main`.

**LS-68** corrigée, **LS-77** créée sous l'epic LS-36.

## Le défaut, plus grave que la story ne le disait

LS-42 décrivait un mode fail-open : la détection se terminait par `|| true`, donc
une panne laissait passer. La réalité est que la détection était **inopérante à
100 %**, pour trois causes cumulées.

```bash
SQL_ATTENTE=$(npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel   prisma/schema.prisma \
  --script 2>/dev/null || true)
```

Les deux côtés du diff pointaient le **même fichier**. Après `migrate deploy` la
base est conforme au schéma, donc le résultat est vide, toujours. Le `|| true`
absorbait le reste. Et le repli analysait `prisma migrate status`, qui liste des
**noms de fichiers** et non du SQL : aucun `DROP` n'y apparaît jamais.

Le script affichait donc « Migration additive, aucune instruction destructive
detectee » quoi qu'il arrive, puis appliquait la migration.

`CLAUDE.md` accorde l'autonomie sur les migrations de production **parce que** ce
garde-fou existe. La condition n'était pas remplie.

## La preuve, et pourquoi elle compte

Dix cas dans `scripts/verifier-migration-mutation.sh`, sans base réelle : `psql`,
`pg_dump`, `pg_restore` et `npx` sont des doublures en tête de `PATH`. Cinq
familles destructives doivent bloquer, une migration additive doit passer, et une
détection qui ne peut pas conclure doit bloquer.

Le nouveau script passe les dix. Ça ne prouve rien tant que le test n'a pas
rougi : lancé contre la version d'avant, avec `DROP TABLE commandes;` en attente,
il échoue sur **sept des dix cas** et affiche noir sur blanc « migration
additive » suivi de « Migration terminee ».

Le vert immédiat d'un test neuf devait faire suspecter le test avant la
correction, comme l'a appris `mutation-sans-effet-observable`.

## L'analyse externe, ce qu'elle valait

Trois points annoncés comme bloquants. Un seul l'était.

| Point | Verdict |
|---|---|
| Migrations de production | **fondé**, et sous-estimé. Mais la cause avancée était fausse |
| Conservation des avis | infondé, l'arbitrage existe et fait quinze lignes dans `MODELE-CONCEPTUEL.md` |
| Sortie de phase 0 | gouvernance, pas un défaut technique |

Sur les migrations, le rapport attribuait la panne à la suppression de
`--from-schema-datasource` en Prisma 7. Cette option **existe toujours**,
`npx prisma migrate diff --help` la liste. La vraie cause était le sens du diff.

Il annonçait aussi avoir analysé le dépôt au commit `c00bd80`, l'avant-avant
dernier : deux commits de retard, dont celui qui ajoute `verifier-config-claude.sh`.
Ses comptes portaient sur un état dépassé.

Le motif est celui que `rapport-externe-verification` enregistre pour la
quatrième fois : la bonne zone, la mauvaise formulation. Le rapport a rendu
service en pointant le script, il aurait fait perdre du temps s'il avait été
appliqué à la lettre.

## Ce que les contrôles ont attrapé pendant le travail

`verifier-regles.sh` a signalé `_prisma_migrations` cité par la règle de migration
et absent du schéma. Signalement juste : c'est une table interne de Prisma, pas
une entité du modèle. La règle la désigne maintenant sans la nommer.

`verifier-config-claude.sh` a bloqué à 201 lignes de `CLAUDE.md`, mon ajout de
deux lignes ayant dépassé la limite. Condensé à 200.

Deux comptes faux trouvés dans `README.md` en les mesurant plutôt qu'en les
relisant : sept mutations sur la config et non six, sept scripts de vérification
et non cinq. Le rapport externe avait vu le premier écart sur l'autre script et
manqué celui-ci.

## Documentation corrigée

| Fichier | Correction |
|---|---|
| `README.md` | Tailwind annoncé alors qu'il est écarté, phase de cadrage devenue phase 1, deux comptes de mutations, liste des scripts |
| `CONTRIBUTING.md` | affirmait que le dépôt n'a ni `package.json` ni TypeScript, faux depuis LS-65 ; LS-69 remplace LS-2 comme point de levée |
| `CLAUDE.md` | l'autonomie de migration est conditionnée aux garde-fous |
| `.claude/rules/database.md` | source de la détection, comportement bloquant, renvoi vers la preuve |

## Ce qui reste ouvert

**Les avis, à trancher par Christophe.** Je n'ai rien touché : l'arbitrage de
conservation illimitée est argumenté et le rapport ne le contredit pas
sérieusement. La question mérite d'être reposée, pas la décision d'être annulée
en silence.

Quatre points de gouvernance signalés et non traités : dérogation écrite de sortie
de phase 0, ADR formalisant l'abandon de Tailwind, liens de dépendance Jira sur la
chaîne LS-65 à LS-75, classification MoSCoW absente de nombreuses descriptions.

## Prochaine étape

**LS-66**, inchangée. La base PostgreSQL 18 locale, `prisma.config.ts` et la
migration initiale. Le blocage qui la précédait est levé.

## État des tickets

| Ticket | État |
|---|---|
| LS-42 | **Terminé**, fusionné, preuve par mutation dans le commentaire |
| LS-68 | À faire, position dans la chaîne et renvoi vers LS-17 corrigés |
| LS-77 | **Créée**, à faire, signalement d'authenticité, epic LS-36 |
| LS-66 | À faire, **prochaine action** |
| LS-67, LS-69, LS-70 | À faire |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
