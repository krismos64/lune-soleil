# 8 septembre 2026, e : LS-203, les six boutons annoncent leur attente

Le fichier des rétractations était le **seul** de l'administration sans aucune
annonce d'attente, quand quinze existent dans quatorze fichiers. Ce que la
session a coûté à apprendre : **un test d'interface trouve ce qu'aucun contrôle
statique ne voit**, et il l'a fait deux fois ici.

## Le titre du ticket était périmé par ma propre story

Il annonçait « cinq boutons », compté par la revue de LS-173 avant que celle-ci
n'en ajoute un sixième le même jour. Les critères d'acceptation, eux, disaient
déjà six. Le titre est corrigé dans Jira.

## Deux défauts trouvés en écrivant le test

**Quatre boutons portaient le même libellé.** Ma première version posait
« Enregistrement en cours… » partout, ce que le critère 2 interdisait
explicitement. **Playwright a refusé l'ambiguïté** en résolvant deux éléments, et
c'est ce refus qui a révélé le défaut : l'exploitante n'aurait pas su lequel des
six gestes travaille.

Chaque bouton nomme désormais son action, « Constat en cours… », « Réception en
cours… ». La région live garde un libellé générique, étant unique par carte et ne
sachant pas quel geste tourne.

**Le libellé du constat était cassé.** Il contenait la séquence littérale
`’` au lieu d'une apostrophe, donc le bouton affichait « Enregistrer
l’état de la pièce » à l'écran. Ma substitution l'avait introduite en
écrivant une chaîne JSX.

Ni `tsc` ni le lint ne pouvaient le voir, la chaîne étant valide. **Seul le test
de bout en bout l'a trouvé**, en ne trouvant pas le bouton par son nom
accessible.

## Le test qui consommait ce qu'il mesurait

Ma première version ralentissait la Server Action d'une seconde pour observer
l'attente. Le constat s'écrivait donc **réellement**, et il est irréversible par
conception.

Les trois projets de largeur partagent la **même** demande de fixture : le
premier consommait le geste, les deux autres ne trouvaient plus le bloc, et le
test de débordement voisin tombait avec eux.

**Mesuré sur la suite complète** : `mobile-320` vert, les trois autres largeurs
en échec, plus le voisin. Tous passaient en isolation, ce qui rendait le défaut
invisible en développement.

`route.abort()` ferme le cas proprement : la requête n'atteint jamais le serveur,
l'écran reste en attente, et la base n'est pas touchée. **Aucun nettoyage
nécessaire, donc rien à oublier**, ce qui vaut mieux qu'un `afterAll` correct.

## Ce que le débordement pendant l'attente ajoute

Le test voisin mesure l'écran **au repos**. Plusieurs libellés d'attente sont
plus longs que celui qu'ils remplacent, « Enregistrement de la preuve… » faisant
27 caractères contre 21 : la mesure au repos ne les voyait pas. Les quatre
largeurs sont vertes.

## Preuves

Le test **rougit sans l'annonce**, vérifié par mutation. 1503 tests de bout en
bout au vert, zéro échec, ce qui valide aussi le parallélisme des trois largeurs.
1291 en Vitest, les 4 échecs `chemin_pdf` restant préexistants.

## Un faux positif de la chaîne, ticketé

La pull request **documentaire** qui suit la livraison a été bloquée par l'étape
`9a bis`, sur son cas 5. Sa sortie affichait pourtant « configuration Claude Code
cohérente » juste sous le mot ÉCHEC : le contrôle avait **réussi** et était
compté en échec.

Trois vérifications ont écarté ma modification : elle ne touchait que
`README.md`, le contrôle est vert sur `main` comme sur la branche, et la règle du
journal daté est satisfaite, cinq pages existant pour 81 fichiers commités ce
jour-là. **La relance de la CI a rendu vert sans aucune modification.**

**LS-204 créée**, rattachée à la phase 6. Un garde-fou qui rougit sans raison
finit ignoré, motif que LS-199 a déjà payé. Le ticket demande la **cause**, pas
un réessai automatique, et note que la sortie actuelle rend le diagnostic
trompeur en affichant le verdict de réussite sous le mot ÉCHEC.

## Prochaine étape

Le backlog réalisable sans VPS porte la part documentaire de **LS-175**, la
procédure d'amorçage et le script idempotent. L'enregistrement de la passkey
attend le domaine de production.

L'allègement du composant client de l'écran des rétractations reste ouvert, sans
ticket : il ne se justifierait que si la CI rougissait sur le test des
catégories, ce qu'elle n'a pas fait.
