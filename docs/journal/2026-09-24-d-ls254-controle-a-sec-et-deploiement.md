# 24 septembre 2026, soirée : LS-251 déployée, LS-254 le contrôle à sec

Suite de `2026-09-24-c`.

## LS-251 en production

Workflow « Déployer en production », run 36018343074, toutes étapes vertes.
Aucune migration depuis `0a4fca29`, `git diff --stat 0a4fca29..HEAD -- prisma/`
vide. L'action `etat` rend **`6a22bcba`**, soit `main`. Domaine public : `/`,
`/catalogue`, `/panier`, `/aide` et `/api/sante` à 200.

Le catalogue de production étant vide, la réassurance de la fiche, du panier et
du tunnel ne se verra qu'à la première pièce publiée.

## LS-254, créée et livrée dans la foulée

Proposée pendant LS-252, acceptée par Christophe. Les trois expressions périmées
du jour n'ont été vues qu'après une trentaine de minutes de nocturne chacune.

`scripts/verifier-mutations-a-sec.sh` applique chaque expression `mute` à son
fichier, en mémoire, à chaque PR. **215 expressions dans six scripts, en
quelques centièmes de seconde**. La découverte trouve six scripts là où mon
recensement à la main en voyait deux : les scripts par PR qui portent `mute`
comptaient aussi.

Trois formes d'appel lues, par la signature des fonctions et non par
supposition : `mute "$VAR" expr`, `mute expr` à fichier fixe
(`verifier-ecart-production`), et `cas` qui passe fichier et expression à
`mute` (`verifier-reintegration-stock`), lignes continuées jointes.

**Rejoué sur `d08e14d`, le dépôt d'avant les corrections de LS-252, il désigne
exactement les deux expressions** qui avaient coûté deux nocturnes.

`verifier-etats-non-nominaux-mutation.sh` reçoit la garde « aucun caractère
modifié » qui lui manquait.

## Deux défauts de ma première version, trouvés en l'exécutant

- **onze expressions saines déclarées périmées** : la remise à zéro n'avait lieu
  qu'après un appel porteur de `mute`, jamais après `cas`, qui restaure. Les
  mutations s'accumulaient sur tout le script
- **zéro appel sur le dépôt ancien** : une fonction sur une ligne,
  `cle() { ...; }`, ouvrait un faux corps de fonction qui avalait le reste. La
  garde « zéro appel » l'a signalé au lieu de rendre un OK muet

La preuve par mutation, six cas, garde le premier. Elle couvre aussi le code qui
bouge sous une expression, une ligne non analysable, une découverte cassée, une
signature non reconnue et un commentaire qui ne doit rien déclencher. Deux cas
relus à la main : le premier désigne la ligne 596 exacte, le retrait de la remise
à zéro fait réapparaître douze fausses péremptions.

## Ce qui a dérapé

- une expression de la preuve écrite entre guillemets doubles s'est mal
  échappée ; la garde « aucun caractère modifié » du script de preuve l'a
  arrêtée net, sans laisser de fichier muté

## État des tickets

**LS-254** : six critères faits, clos à la fusion. **LS-251** : close et
déployée. **LS-252** et **LS-235** : le nocturne 36011272260 tourne encore.
