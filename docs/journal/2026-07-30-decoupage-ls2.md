# 30 juillet 2026, le découpage de LS-2 en onze stories

| Champ | Valeur |
|---|---|
| Tickets | LS-65 à LS-75 créées, LS-2 et LS-67 commentés |
| Branche | aucune, travail de découpage sans modification de code |
| Contrôles | aucun exécuté, aucun code produit |

Première action de la session, comme l'arbitrage du 29 juillet au soir le
prévoyait. Le découpage était différé depuis trois sessions, interrompu chaque
fois par une correction plus urgente.

## L'arbitrage était dans les commentaires, pas dans la description

La description de LS-2 porte la liste des douze thèmes de la phase et la porte de
sortie. **Elle ne dit rien du découpage.** Les deux commentaires du 29 juillet
portent la décision entière : granularité à onze, les deux corrections de liste,
l'ordre d'attaque.

Le cas est le même que LS-27 et LS-33 la semaine dernière. La règle de `CLAUDE.md`
sur la lecture des commentaires a fonctionné ici comme prévu, et Christophe l'a
rappelée explicitement en ouvrant la session.

## Les onze stories

Les cinq premières ont un ordre imposé par les dépendances, les six suivantes sont
libres.

| Ordre | Ticket | Sujet |
|---|---|---|
| 1 | LS-65 | initialisation Next.js 16, TypeScript strict, structure par couches |
| 2 | LS-66 | base PostgreSQL 18 locale **et** migration initiale, fusionnées |
| 3 | LS-67 | les trois dettes de LS-13, dont les contraintes `CHECK` |
| 4 | LS-68 | Vitest et Playwright, test de concurrence porté |
| 5 | LS-69 | intégration continue, les huit contrôles de `CONTRIBUTING.md` |
| libre | LS-70 | Better Auth 1.6 et passkey de l'administration, ADR-021 |
| libre | LS-71 | socle de validation Zod |
| libre | LS-72 | squelette du cron et table de verrou |
| libre | LS-73 | supervision, journalisation et contrôle de santé |
| libre | LS-74 | image Docker multi-étapes, tag par SHA |
| dernier | LS-75 | porte de sortie, clone neuf prouvé |

LS-31, l'agent projet de conteneurisation, préexistait sous cette epic. LS-2 porte
donc **douze** stories filles, compté sur Jira et non estimé.

## Les deux corrections de l'arbitrage, appliquées

**Fusion de la base et de la migration**, LS-66. Elles ne peuvent pas se terminer
séparément : une migration sans base ne prouve rien, une base sans migration est
vide.

**Story de dettes créée**, LS-67, pour trois points documentés dans
`MODELE-LOGIQUE.md` depuis LS-13 mais rattachés à aucun ticket. Orphelins, donc
jamais faits.

Le plus sérieux des trois : les contraintes `CHECK` vivent dans
`001_contraintes_check.sql`, **hors du dossier de migrations**. Prisma ne les
génère pas. Un `prisma migrate deploy` en production produirait donc un schéma
sans le dernier filet contre la survente. C'est la raison qui place cette story en
troisième position et non en fin de phase.

## Deux arbitrages complémentaires demandés en séance

**Périmètre du cron, LS-72 : le squelette et le verrou, sans les tâches métier.**
Le verrou vit en base, donc il touche la migration initiale. Le repousser en phase
3 imposerait une seconde migration sur une table que `MODELE-CONCEPTUEL.md`
prévoit déjà. Les deux tâches, libération des réservations et réconciliation des
paiements, restent vides.

**Aucune estimation sur les onze stories.** Le pilotage se fait par portes de
sortie de phase, pas par calendrier. L'estimation de LS-2 à 20 h reste signalée à
revoir, LS-75 porte ce point.

## Une douzième story qui n'était pas dans la liste

LS-75, la porte de sortie. La liste esquissée le 28 juillet couvrait les douze
thèmes de la description mais aucun ne vérifie le premier terme de la porte de
sortie, « un clone neuf du dépôt lançable en local avec procédure écrite ».

Ce critère ne se vérifie sur aucune des dix autres stories : **chacune fonctionne
sur la machine où elle a été développée**, où tout est déjà installé. Une
procédure de démarrage se prouve sur une machine qui n'a rien, sinon l'étape non
écrite parce qu'elle allait de soi reste invisible.

Le projet connaît déjà la version « base de données » de ce défaut, les sept
contrôles verts sans Docker du 29 juillet.

Cette story porte aussi la preuve que le hook de secrets est actif. Il exige deux
commandes manuelles sur un clone neuf, `git config core.hooksPath .githooks` et
l'installation de gitleaks. **Sans elles, le garde-fou n'existe pas**, sur un
dépôt public.

## L'erreur de la session, un compte recopié au lieu d'être compté

J'ai écrit « seize contraintes `CHECK` » dans LS-67 et dans le commentaire de
synthèse de LS-2, en reprenant le chiffre du commentaire de Christophe du
29 juillet au matin.

**Il y en a vingt-et-une.**

```
$ grep -c "ADD CONSTRAINT" prisma/migrations/manual/001_contraintes_check.sql
21
```

Le chiffre de seize était juste quand il a été écrit et a été dépassé le même
jour : LS-63 a ajouté `chk_mouvement_prix_positif` et
`chk_mouvement_vente_externe_prix`.

Ce qui rend l'erreur intéressante est qu'elle contredit une consigne que je venais
d'écrire deux stories plus haut. LS-69 dit explicitement que le workflow ne doit
pas figer un compte attendu, les nombres de contrôles évoluant à chaque story. La
mémoire du découpage disait déjà « ne pas écrire leur nombre de mémoire, la
commande fait foi », et donnait la commande.

**Un compte recopié depuis un ticket est une opinion sur l'état du dépôt, pas une
mesure.** Le motif est le même que celui du contrôle de cardinalité de LS-49 :
tant qu'une commande ne le prouve pas, une liste écrite à la main est une opinion.

Rectifié par un commentaire sur LS-67, qui énumère les vingt-et-une et pose la
consigne de recompter au moment de traiter la story plutôt que de lire le nombre
dans la description.

## Écart relevé entre les commentaires de LS-2

Le commentaire du matin annonce 48 contrôles de schéma et 28 identifiants de
règles, celui du soir 60, et la session du 29 au soir 68 après LS-63. Ce sont des
instantanés successifs, pas une contradiction, et le plus récent l'emporte.

Signalé plutôt que corrigé : réécrire un commentaire daté effacerait la trace de
sa date. Les stories créées évitent en revanche de figer un compte attendu.

## État des tickets

| Ticket | État |
|---|---|
| LS-2 | À faire, découpée en onze stories, commentaire de synthèse posté |
| LS-65 à LS-75 | À faire, créées et validées par Christophe |
| LS-67 | À faire, rectifiée par commentaire, vingt-et-une contraintes et non seize |
| LS-31 | À faire, préexistait sous LS-2, à traiter avant ou avec LS-74 |

## Prochaine étape

**LS-65, l'initialisation du projet.** Première story de la chaîne, rien d'autre
ne peut démarrer avant : le dépôt n'a toujours aucun `package.json` et `src/` ne
contient que `styles`.

La phase de conception est close. À partir de LS-65 le dépôt reçoit du code
applicatif pour la première fois.

Deux points restent ouverts sans bloquer :

- `Paiement` n'a aucun horodatage de confirmation, seulement `creeA` qui date la
  tentative. Sur le chemin de réconciliation l'écart peut franchir un minuit et
  changer le jour d'imputation du chiffre d'affaires. À trancher avant LS-64
- trois stories correctives hors LS-2 attendent leur phase, LS-50 sur
  l'interblocage du panier, LS-42 sur le mode fail-open du script de migration,
  LS-43 sur deux sessions Checkout payées
