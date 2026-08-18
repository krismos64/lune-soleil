# 18 août 2026, LS-112, la mesure de débordement partagée

Seconde session du 18 août, après LS-111 qui a livré la session d'administration
et découvert le défaut que celle-ci corrige.

## Pourquoi elle passe avant LS-104

Arbitrage de Christophe, sur ma recommandation. LS-104 et LS-105 vont créer les
pages publiques et écriront des tests de débordement : sans module partagé, elles
recopiaient la version fausse par mimétisme des fichiers voisins, ou dupliquaient
la bonne. Le nettoyage aurait été plus gros, et dans le premier cas de nouvelles
assertions fausses seraient nées sur les pages que les clients voient.

## La duplication était la cause racine

Sept assertions, six fichiers, **six copies de la même mesure fausse**. Le défaut
a vécu trois stories, LS-68, LS-81 et LS-89, dont les critères d'acceptation
s'appuyaient dessus.

Ce n'est pas la mesure qui était difficile à écrire, c'est sa duplication qui l'a
rendue impossible à corriger d'un seul geste. `tests/e2e/mesure-rendu.ts` la porte
maintenant une fois, comme `chemin-session.ts` porte les chemins de session.

## Les deux décisions que le ticket laissait ouvertes

**Les deux bords sont mesurés.** LS-111 ne retenait que
`getBoundingClientRect().right`. Un élément tiré vers les abscisses négatives,
marge négative ou `position: absolute; left: -Npx`, déborde et produit la même
barre de défilement, le même geste latéral pour lire. Le nom des tests dit
« ne déborde pas horizontalement », pas « ne déborde pas à droite » : la mesure
tient désormais sa promesse entière.

**La tolérance est nommée.** `Math.round` laissait passer 0,4 px sans que rien ne
le dise. `TOLERANCE_DEBORDEMENT_PX` vaut 1 px, chaque assertion la cite, et son
commentaire explique le choix : la mise en page produit des fractions inévitables,
bordure de 0,5 px, pourcentage qui ne tombe pas juste, arrondi de sous-pixel.
Aucune ne fait défiler. Un débordement réel se compte en dizaines de pixels, 496
pour celui de LS-111, 40 pour celui de LS-103.

## Le résultat qui rassure, et ce qu'il ne dit pas

**Les 146 tests passent après rebranchement.** Aucun écran antérieur ne débordait
réellement : les assertions étaient fausses en méthode, justes en conclusion.

Ce vert ne prouve rien à lui seul, et c'est le piège que le projet connaît. La
preuve est ailleurs : le cas 11 existant reste détecté avec la nouvelle mesure, et
le **cas 11 bis** ajouté ici attrape un `left: -200px` que ni l'ancienne mesure ni
celle de LS-111 ne voyaient.

Détail qui distingue les deux cas : le débordement à droite n'est visible qu'à 320
et 390 px, invisible à 1280 où la fenêtre est plus large que l'élément. Celui à
gauche est détecté **aux trois largeurs**, puisqu'il sort par zéro.

## Un chiffre faux dans ma propre description

Le ticket annonçait **onze** assertions, il y en avait **sept**. L'écart vient
d'un comptage des exécutions plutôt que des assertions écrites : celle de
`catalogue-administration` vit dans une boucle sur trois écrans, et chaque test
tourne sur trois largeurs.

Rectifié par un commentaire Jira plutôt qu'en réécrivant la description, le fond
du ticket étant inchangé.

## État des tickets

LS-112 **En cours** au moment d'écrire, en attente de la revue d'interface, de la
PR et de la fusion.

## Prochaine étape

LS-104, catalogue public, grille, filtres par catégorie et tri. Elle écrira ses
tests de débordement sur `mesure-rendu.ts`, ce qui était la raison de faire
LS-112 avant elle.
