# 7 septembre 2026, f : LS-202, la renumérotation demandée ne rentrait pas

Reprise de LS-202, suspendue en session E faute d'arbitrage. La correction
demandée par le ticket était impossible telle quelle, et la cause n'était pas
celle qu'il décrivait.

## Ce que le ticket demandait, et pourquoi cela ne rentrait pas

Renuméroter les étapes de `controles.yml` dans l'ordre d'exécution. La famille 6
portait **28 étapes pour 25 lettres** disponibles : `6b` à `6z` ne suffit pas.
Le premier script écrit s'est arrêté sur ce constat plutôt que d'inventer
`6aa`, et n'a rien modifié.

**La cause était un classement, pas une numérotation.** Quatre étapes seulement
valident réellement le schéma, c'est-à-dire le contrôle 6 de `CONTRIBUTING.md` :

```
6.  verifier-schema.sh
6b. verifier-schema.sh --base-migree
6c. verifier-regles.sh
6d. verifier-registre-traitements.sh
```

Les vingt-six autres sont des contrôles textuels sans rapport avec le schéma,
numérotées `6x` parce qu'elles avaient été ajoutées à la suite. Le désordre
était la conséquence visible d'un rangement faux.

**Le classement a été fait sur la commande lancée, jamais sur le titre.** Un
titre se réécrit ; `run:` dit ce que l'étape fait réellement.

## L'arbitrage rendu

Un **contrôle 9** est détaché pour les contrôles textuels. Chaque famille garde
de la marge, 22 lettres sur 26 employées, et le numéro dit enfin de quoi il
s'agit.

**Une preuve par mutation porte le numéro de ce qu'elle prouve, suffixé `bis`.**
`9c bis` éprouve `9c` : ce n'est pas un contrôle autonome, et le regroupement des
quatre paires libère quatre lettres de plus.

## Le nom du job ne se renomme pas, et c'était le vrai piège

« Les huit controles de CONTRIBUTING » décrit désormais neuf contrôles. La
tentation de le corriger est forte, et elle casserait tout :

```
$ gh api repos/.../branches/main/protection --jq '.required_status_checks.contexts'
["Les huit controles de CONTRIBUTING"]
```

Ce n'est pas un libellé, c'est l'**identifiant** exigé par la protection de
branche. Le renommer laisserait toute pull request en attente d'un résultat qui
n'arrive jamais. `CONTRIBUTING.md` porte maintenant cette raison écrite, pour
que la prochaine session ne « corrige » pas ce qui a l'air d'une incohérence.

## Les renvois croisés, résolus un par un

Neuf commentaires citaient un numéro d'étape, dont des renvois entre étapes,
« ne fait pas doublon avec `6g` ». Une substitution globale était **impossible** :
un ancien numéro porté par deux étapes est ambigu, ce qui est le défaut même que
le ticket corrige. Chacun a donc été résolu par son sens, en lisant l'étape
porteuse et l'étape désignée.

Les journaux des sessions passées citent d'anciens numéros. Ils ne sont pas
touchés : ce sont des archives de ce qui était vrai ce jour-là.

## Ce qui empêche le retour

Le sens « numéros d'étape en doublon » entre dans `verifier-config-claude.sh`,
sur **tous** les workflows et **par job**. Cinq cas sur cinq, dont deux qui
gardent le contrôle contre lui-même :

```
4. même numéro dans deux jobs distincts  ->  aucun faux positif
5. « 9c bis » ne fait pas doublon avec « 9c »
```

Deux jobs sont deux séquences indépendantes, et tronquer le suffixe `bis`
accuserait la convention partout où elle vient d'être appliquée.

**Ce que le contrôle ne vérifie pas est écrit dans son en-tête** : l'ordre des
numéros. Ordonner demande de savoir ce qui doit précéder quoi, et le fichier
porte des étapes délibérément hors séquence ; un doublon, lui, est faux dans
tous les cas. Le critère 4 du ticket demandait cela ou sa raison écrite.

## État des tickets

**LS-202 LIVRÉE ET CLOSE**, PR #281 fusionnée en rebase, commit `e6863be`. Les
étapes renumérotées ont été vérifiées à l'API du run, pas seulement au vert
global : `6d`, `9a`, `9a bis`, `9v` et `9v bis` rendent toutes `success`.

Comptes relevés dans Jira après la fermeture, jamais recopiés : **136 tickets
terminés sur 192**. Aucun ticket créé de la session, conformément à la consigne.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui attend toujours que
Christophe crée les clés dans Sendcloud, Réglages puis Boutiques connectées.
