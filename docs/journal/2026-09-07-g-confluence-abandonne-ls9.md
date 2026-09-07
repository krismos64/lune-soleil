# 7 septembre 2026, g : Confluence abandonné, LS-9 close après 41 jours

Arbitrage de Christophe, demandé après la vérification de cohérence de la
session : Confluence n'est plus l'espace documentaire du projet.

## La décision

**Jira porte le suivi, `docs/` porte la documentation technique.** Maintenir un
troisième espace n'apportait rien, et cinq pages sur sept étaient restées vides
depuis juillet.

Ce n'est pas une renonciation au critère de suffisance de LS-9, c'est une
redéfinition de ce qui le remplit : l'espace documentaire est le dépôt, versionné
avec le code qu'il décrit, et relu par les mêmes contrôles.

## Ce qui rendait LS-9 bloquée

Le ticket demandait « dépôt, backlog, espace documentaire, assistant de
développement et connecteurs opérationnels ». Quatre points sur cinq étaient
acquis depuis juillet ; le commentaire du 28 juillet disait déjà que seul
l'espace Confluence restait. Il l'est resté 41 jours.

## Le point structurant, qui n'était pas évident

`CLAUDE.md` citait Confluence **dans la hiérarchie des sources de vérité**, entre
la documentation du dépôt et Jira. C'est le paragraphe qu'une session consulte en
cas de divergence : y laisser un espace abandonné aurait fait chercher une
réponse là où il n'y en a plus.

L'ordre devient : loi, ADR accepté, cahier des charges V1.0, documentation
technique du dépôt, Jira.

Le tableau des outils du `README.md` perd sa ligne. Aucune autre mention active
ne subsiste, vérifié sur `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`,
`docs/REFERENCES.md` et `.claude/`.

## Un effet de bord mesuré, et une fausse piste

`CLAUDE.md` était à **200 lignes pile**, la limite que `verifier-config-claude.sh`
refuse de dépasser. La phrase d'arbitrage l'a porté à 202, et le contrôle a
rougi, ce qui est exactement son travail.

**Raccourcir les phrases n'a rien donné**, et c'est la fausse piste à retenir :
elles tenaient déjà sur deux lignes chacune, donc les réécrire plus court ne
supprimait aucune ligne. Trois tentatives successives ont laissé le compte à 201.
C'est la **fusion du paragraphe** qui rend des lignes. Le fichier redescend à 199.

## Ce que la vérification de la session avait trouvé

Cette clôture vient d'un contrôle demandé sur les huit canaux. Quatre écarts y
avaient été trouvés, tous du même motif, un compte écrit à la main qui se périme
sans bruit : deux comptes d'epic du `README`, la description de la chaîne restée
à « huit contrôles », et la fiche mémoire d'état annonçant 135 tickets avec
LS-202 suspendue, son index datant l'état de douze jours plus tôt.

Les contrôles automatiques étaient **tous verts** pendant ce temps. Ils vérifient
ce qui est mécanique, un ADR hors table ou un lien mort ; un nombre écrit en
prose leur échappe par construction.

## État des tickets

**LS-9 LIVRÉE ET CLOSE**, PR #284 fusionnée en rebase, commit `26f2e9f`.

Comptes relevés dans Jira après la fermeture : **137 tickets terminés sur 192**.
La phase 0 ne garde que **deux** tickets ouverts, LS-19 et LS-20, qui dépendent
de démarches et non du code.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui attend que Christophe crée
les clés dans Sendcloud, Réglages puis Boutiques connectées.
