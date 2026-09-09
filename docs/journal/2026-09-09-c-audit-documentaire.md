# 9 septembre 2026, c : LS-152 close, et l'audit de ce que la documentation dit

Session de clôture et de vérification. **LS-152 est close**, ses trois défauts
bloquants ayant été fermés en session b. Puis audit demandé sur README, CLAUDE.md,
agents, skills, hooks, journal, mémoire et `docs/`.

## Ce que les contrôles automatiques ne voient pas

Les quatre contrôles de cohérence étaient **verts** avant l'audit :
`verifier-config-claude.sh`, `verifier-propagation-docs.sh`, `verifier-regles.sh`
et `verifier-registre-traitements.sh`. L'audit a pourtant trouvé sept
affirmations fausses.

C'est la limite connue de ces contrôles, énoncée dans le skill : ils vérifient ce
qui est **mécanique**, un ADR absent d'une table ou un chemin inexistant. Ils ne
voient ni un compte écrit à la main, ni un état devenu faux, ni une table
devenue incomplète.

## Le défaut le plus grave, dans la procédure d'astreinte

**`docs/deploiement/EXPLOITATION.md` annonçait encore comme ouverts les trois
défauts fermés douze heures plus tôt.** Les médias « servis par rien », deux
tâches planifiées « non déclenchées », Nginx « plafonnant à 12 Mo ».

Ce document est celui qu'on lit en intervenant sur la production. Il contredisait
le README de la même journée, et il aurait fait renoncer à un déploiement pour
des raisons résolues.

**La cause est ordinaire et vaut d'être retenue** : j'ai écrit cette section en
session a, quand elle était vraie, et je ne l'ai pas relue en fermant les trois
tickets en session b. Une section « ce qui manque » est **datée par nature**, et
elle se relit à chaque fois qu'un des manques est comblé.

Elle devient « ce qui manquait le 8 septembre et ne manque plus », gardée plutôt
que supprimée : un lecteur revenant sur un journal de cette date ne conclura pas
à un manque en service.

## Trois comptes faux dans le README, dont un instructif

```
scripts totaux    annonce 54   mesure 84
dont mutation     annonce 22   mesure 35
en integration    annonce 19   mesure 42
mutations hors CI annonce 4    mesure 27
```

**Le paragraphe qui annonçait « dix-neuf » prescrivait lui-même la commande de
mesure**, et avertissait qu'il avait déjà annoncé « trois » quand ils étaient
dix-sept. Il a reproduit son propre défaut une seconde fois.

L'enseignement n'est pas qu'il faut mieux avertir : c'est qu'**un avertissement
écrit à côté d'un chiffre n'empêche pas ce chiffre de vieillir**. Seule la
commande le dit, et le texte le porte désormais explicitement.

## Le tableau d'état avait dérivé en journal

Sa cellule « phase 2 » faisait **16 556 caractères** et celle de la phase 6
**15 912**, quand une autre en faisait 89. Il racontait l'historique de chaque
story, avec des passages **dupliqués mot pour mot**, sous un en-tête « État au
5 septembre » qui mélangeait des relevés du 5 au 8.

Arbitrage de Christophe : réécrire en état court. Une ligne par phase, le nombre
de stories ouvertes relevé ce jour, ce qui bloque, et un renvoi vers le journal.

**Vérifié avant de couper** : les 38 stories citées comme livrées figurent toutes
dans les 149 pages de `docs/journal/`. Rien n'est perdu. Le README passe de 1139
à 1024 lignes.

## Un manque structurant dans la table d'aiguillage

**`docs/deploiement/` n'était cité nulle part dans `docs/REFERENCES.md`**, alors
que ses deux documents décrivent la production **en service**. La table recense
pourtant les vingt ADR, les cinq règles, les trois agents et les huit hooks sans
erreur : le trou portait précisément sur ce qui venait d'être livré.

`CLAUDE.md` ne le citait pas non plus. Il était **saturé à 200 lignes**, son
plafond, donc l'ajout a demandé de condenser ailleurs : l'énumération du contenu
de `REFERENCES.md` était redondante avec le fichier lui-même.

## Quatre conséquences d'ADR-007 annoncées au futur, désormais faites

Un ADR accepté ne se réécrit pas dans sa décision, mais ses conséquences se
datent quand elles sont réalisées. « La déclaration de production relève de la
phase 6 », « point à porter en phase 6 » pour la sauvegarde des médias : les deux
sont faits, et chaque paragraphe porte maintenant son « fait le 9 septembre ».

**Une reste vraie et devient un manque réel** : l'espace disque n'est toujours
pas surveillé. Son renvoi « relève de la phase 6 » ne disait plus rien
d'actionnable, la phase 6 étant en cours. Il nomme désormais **LS-139** et
rappelle que le risque a changé de nature depuis ADR-036, le disque étant partagé
avec un produit payant.

Même motif dans `JOURNALISATION.md` : « la question se rouvrira en phase 6, avec
le VPS » était atteint sans être honoré. Le texte dit maintenant que le VPS
existe et que la question n'a **pas** été rouverte, délibérément.

## L'agent de conteneurisation décrivait un état à construire

Il connaissait ADR-036 et le port 3002, mais son inventaire ignorait
`docker-compose.production.yml`, le dossier `deploiement/`, `EXPLOITATION.md` et
**ADR-037**, jamais cité dans ses 263 lignes alors qu'il décide de son sujet.

Conséquence concrète : il aurait pu proposer d'écrire une seconde composition, ou
d'improviser une sauvegarde qui existe. Il annonçait aussi « deux volumes portent
des données » quand il y en a trois, les documents comptables ayant leur propre
racine par décision de sécurité.

## Ce qui était déjà juste

**Les huit hooks** sont présents, déclarés, exécutables, sans script orphelin.
**Les cinq règles** de `.claude/rules/` ont toutes un `paths:` qui matche des
fichiers suivis, aucune règle morte. **Les deux skills** sont à jour. **Les vingt
ADR**, cinq règles, trois agents et huit hooks figurent tous dans
`REFERENCES.md`. `PREPARATION-SERVEUR.md` avait été corrigé en session b.
`CLAUDE.md` ne portait **aucune** affirmation fausse.

Deux de mes propres mesures ont d'ailleurs été de faux négatifs, corrigés en
refaisant : les hooks annoncés « absents » parce que mon script ne résolvait pas
`$CLAUDE_PROJECT_DIR`, et deux commandes npm « absentes » parce que mon
extraction tronquait `db:e2e` au chiffre.

## Preuves

```
verifier-config-claude.sh --strict          configuration cohérente
verifier-propagation-docs.sh                socle Zod et son document accordés
verifier-regles.sh                          règles conformes au schéma
verifier-registre-traitements.sh            registre cohérent
verifier-nginx.sh                           seul medias/public/ est servi
npm run format:check                        All matched files use Prettier code style!
CLAUDE.md                                   200 lignes, au plafond
README.md                                   1024 lignes, était 1139
38 stories citées                           toutes présentes dans docs/journal/
```

## État des tickets

**LS-152 est CLOSE.** Ses huit critères étaient prouvés en session a, et les
trois défauts qui la maintenaient ouverte ont été fermés en session b.

**152 tickets terminés sur 208**, les deux termes relevés dans Jira ce jour.

## Prochaine étape

**LS-153**, la première mise en ligne, dernier verrou technique : poser les clés
Stripe et SMTP, fixer l'ordre des opérations et le point de non-retour.

Un manque est identifié et non traité : **l'alerte de seuil sur l'espace disque**,
rattachée à LS-139. Le disque est à 13 %, mais il est partagé avec un produit
payant depuis ADR-036.
