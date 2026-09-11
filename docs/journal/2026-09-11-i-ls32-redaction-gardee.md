# 11 septembre 2026, i : LS-32, deux règles que rien ne gardait

Une story d'arbitrage rendu le 3 septembre, « tout neutraliser », dont j'ai
d'abord cru qu'elle était faite. Le code l'était ; la règle ne l'était pas.

## Ce que le code portait déjà

Aucun accord au féminin fautif dans les textes visibles, mesuré sur l'ensemble du
dépôt. LS-32 a été appliquée au fil des stories, et les seules occurrences de
« cliente » sont des adjectifs techniques légitimes, « la route cliente »,
« une API cliente ».

La story aurait pu se clore là. Elle aurait été close sur un état vrai **ce
jour-là**.

## Ce que rien ne gardait

**Aucun contrôle** ne portait ni sur l'accord au féminin, ni sur l'interdiction
du tiret cadratin, alors que `CLAUDE.md` les énonce comme valant **partout** :
code, commentaires, Jira, documentation, interface.

C'est le même motif que trois fois aujourd'hui, et la quatrième : une règle juste
dont rien ne mesure l'application.

## Le contrôle a trouvé un défaut à sa première exécution

**Un tiret cadratin dans le pied de page de chaque facture.**

```
`${enTete.intitule} ${enTete.numero} — page ${pageNumber} / ${totalPages}`
```

Imprimé sur **chaque page de chaque facture** remise à un client. C'est de l'UI
visible par les clients finaux, cas où mes instructions demandent de corriger
plutôt que de laisser. Un deux-points le remplace.

Trois autres occurrences existent, toutes hors portée : un ADR accepté, qui ne se
réécrit pas, et deux commentaires de hooks internes.

## Deux limites que j'ai écrites plutôt que de les subir

**L'accord n'est traqué que sur les textes visibles.** Un contrôle textuel ne
distingue pas « la route cliente » de « chère cliente » : viser tout le dépôt
produirait des faux positifs sur du code sain, ce qui est pire qu'une absence de
contrôle. Le motif porte sur les formes qui ne peuvent désigner qu'une personne.

**Il ne lit pas le sens.** « Bonjour Madame » lui échappe, et c'est la relecture
humaine qui l'attrape. Il ferme les formes **mécaniques**, celles qu'une session
recopie sans y penser.

## Il m'a accusé à tort, et je l'ai resserré

Ma première version cherchait « est informée » nu. Elle a accusé :

> La personne qui l'a déposé en est informée

L'accord y porte sur « personne », il est **parfaitement correct**. Le motif exige
désormais le sujet « vous ».

Un contrôle qui accuse du texte sain est pire qu'une absence de contrôle : la
correction évidente aurait été de dégrader une phrase qui ne demandait rien.

## Un `sed` qui échouait en silence

Mon filtre de commentaires employait une alternance en syntaxe GNU. Sur macOS,
BSD `sed` refuse : « parentheses not balanced ».

**Le contrôle rendait « OK » malgré tout**, le `|| true` avalant l'échec. Un
contrôle qui conclut sur un filtre en panne ne vaut rien. `perl` se comporte
identiquement sur les deux systèmes.

## Vérifications

```
verifier-redaction-francaise.sh          151 fichiers, aucune anomalie
verifier-redaction-francaise-mutation.sh 4 mutations, 4 détectées
verifier-config-claude.sh                configuration cohérente
npm run lint                             vert
controles.yml                            YAML valide, étape 9s sexies
```

Les quatre mutations couvrent le cadratin, le **demi**-cadratin (plus difficile
à distinguer d'un trait d'union à l'œil), l'accord au féminin, et le contrôle
gardé contre son propre ancrage cassé.

## Un SECOND défaut réel, trouvé après le rebase

Ajouté le 11 septembre au matin, en fusionnant un journal écrit en double sur
cette même story.

La branche a été rebasée sur `main` après la fusion de LS-64, et le contrôle a
alors trouvé **un cadratin neuf** : l'écran de statistiques employait « — »
comme état vide du panier moyen.

C'est exactement ce pour quoi ce contrôle existe. Sans lui, le caractère serait
entré sur `main` sans que personne ne le voie, comme celui du pied de page des
factures avant lui. Corrigé en « Aucun », qui dit ce qu'il y a à comprendre là
où un lecteur d'écran annonce « tiret cadratin » ou se tait selon le moteur.

**Le contrôle a donc trouvé deux défauts réels le même jour**, à deux moments
différents : un à sa première exécution, un au rebase suivant.

## Un journal écrit en double, et ce que cela dit

Ce fichier a existé en deux exemplaires pendant quelques heures,
`i-ls32-redaction-francaise.md` et celui-ci, tous deux sur la lettre `i`. Le
second a été écrit sans voir le premier, sur une branche parallèle.

**Rien ne l'a signalé** : `verifier-config-claude.sh` vérifie qu'un journal daté
existe quand du code est commité, jamais qu'il n'y en a qu'un par story. Le
doublon a été trouvé à l'œil, en listant les journaux du jour.

## État des tickets

**LS-32 traitée**, epic LS-22. L'arbitrage était appliqué, il est désormais
**gardé** : une régression future fait rougir la CI plutôt que d'attendre une
troisième relecture de Christophe.

## Prochaine étape

**LS-123**, les pages de contenu, ou une passe d'audit de fin de session.
