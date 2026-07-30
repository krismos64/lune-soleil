# 30 juillet 2026, la base locale et la migration initiale

| Champ | Valeur |
|---|---|
| Ticket | LS-66, story 2 sur 11 de LS-2 |
| Branche | `feat/LS-66-base-locale-migration-initiale`, commit `864a15e` |
| Pull request | #51, **ouverte, non fusionnée**, voir plus bas |
| Contrôles | 92 réussites 0 échec dans les deux modes, types, lint, règles, config, audit à zéro |

Cinquième page du 30 juillet. Le schéma de LS-13 et LS-76, jusqu'ici vérifié sur
une base jetable, vit maintenant dans une base de développement gouvernée par des
migrations versionnées.

## Ce qui a été fait

`docker-compose.yml` démarre un PostgreSQL 18.4 lié à `127.0.0.1`, sans aucun
secret : les variables viennent de `.env` et Compose refuse de démarrer si elles
manquent. `prisma.config.ts` porte la chaîne de connexion, que Prisma 7 n'accepte
plus dans le bloc `datasource`.

La migration initiale fait 637 lignes, crée 26 tables et **les 6 index partiels
sur 6 attendus**. Les 25 contraintes `CHECK` et l'unicité différable restent dans
`prisma/sql-manuel/`, appliquées après la migration par `db:preparer`.

Huit commandes npm, dont `db:preparer`, `db:reinitialiser` et `db:verifier`.
`scripts/preparer-base-locale.sh` reconstruit tout depuis un volume détruit, en
une commande, et l'opération est idempotente.

## Le mode qui manquait, et ce qu'il rend visible

`verifier-schema.sh` ne tournait que sur un conteneur jetable alimenté par le SQL
de référence. Il validait l'intention, jamais ce que Prisma produit. Une
divergence entre `schema.prisma` et `schema.sql` passait donc au vert.

Le mode `--base-migree` exécute les mêmes contrôles sur la base issue de la
migration. Les deux modes donnent **92 réussites et zéro échec**, ce qui prouve la
concordance des deux sources plutôt que de la supposer.

Prouvé par mutation, sur la base réelle :

| Mutation | Résultat |
|---|---|
| `DROP CONSTRAINT chk_variante_pas_de_survente` | 1 échec, « la survente est rejetée par le CHECK, C6 » |
| `DROP INDEX paiement_reussi_unique` | 3 échecs, tous sur V14 |
| Suppression des 25 `CHECK` | abandon, code 2, aucun contrôle exécuté |

La première tentative visait `chk_variante_stock_coherent`, qui n'existe pas. La
suppression a échoué et le script est resté vert : le vert d'une mutation doit
faire suspecter la mutation avant le contrôle, ce que
`mutation-sans-effet-observable` avait déjà enregistré.

## Trois obstacles techniques

**`postgres:18` a changé son point de montage.** Le volume va sur
`/var/lib/postgresql`, plus sur `.../data`. L'ancien chemin fait redémarrer le
conteneur en boucle. Le message décrit l'état trouvé sans nommer la cause.

**Prisma 7 traite tout sous-dossier de `prisma/migrations` comme une migration**
et sort en `P3015` devant `manual/`. `listMigrations` n'offre aucune exclusion,
vérifié sur la source via Context7. D'où le déplacement vers
`prisma/sql-manuel/`, **17 chemins corrigés dans 8 fichiers**. Les journaux
gardent l'ancien chemin, ils décrivent un état passé.

Le déplacement a cassé un chemin relatif de `verifier-schema.sh`, qui remontait de
trois niveaux. Le contrôle de conformité des enums est passé au rouge et l'a
signalé. Le chemin est désormais ancré sur la racine du dépôt.

**`migrate dev` est interactif** et sort en erreur dans un script, y compris après
avoir appliqué la migration. `preparer-base-locale.sh` emploie `migrate deploy`.
Conséquence assumée : créer une migration reste un geste manuel.

## La dérive de la session, l'analyse de secrets

GitGuardian a bloqué la PR sur deux secrets, aucun réel. Le principal était
`POSTGRES_PASSWORD=verif`, présent depuis LS-13 sans jamais avoir alerté : le
simple déplacement du fichier a rendu la ligne neuve aux yeux de l'analyse.

Deux enseignements. L'analyse porte sur **tous les commits de la branche** et non
sur son état final, donc corriger dans un commit suivant ne suffit pas, il faut
réécrire l'historique. Et un faux positif se corrige à la cause : le conteneur
jetable tire désormais son mot de passe d'`openssl rand`, `.env.example` décrit le
format sans son préfixe.

Une détection subsiste au moment d'écrire cette page, sans valeur réelle en cause.
Le détail vit sur le tableau de bord GitGuardian, hors de portée depuis le dépôt.

## Ce qui reste ouvert

**La PR #51 n'est pas fusionnée**, contrôle GitGuardian au rouge.
`CONTRIBUTING.md` interdit de fusionner dans cet état. Le travail est poussé et
complet, seule la fusion attend.

Deux prototypes de `docs/prototypes/` portent le même motif de mot de passe
littéral. Ils ne sont pas signalés tant qu'ils ne changent pas, à traiter en
LS-67.

Le générateur reste `prisma-client-js`. Prisma 7 recommande `prisma-client`, mais
ce changement touche les imports partout et sort du périmètre de cette story.

## Prochaine étape

**LS-67**, les trois dettes de LS-13. Porter les contraintes `CHECK` et l'unicité
différable dans une migration Prisma SQL versionnée, sans quoi la production ne
les reçoit pas. Ajouter le nettoyage des deux prototypes.

## État des tickets

| Ticket | État |
|---|---|
| LS-66 | **En cours**, tous les critères vérifiés, fusion bloquée par GitGuardian |
| LS-67 | À faire, **prochaine action**, périmètre inchangé plus deux prototypes |
| LS-68, LS-69, LS-70 | À faire |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
