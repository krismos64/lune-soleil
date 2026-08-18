# 18 août 2026, LS-111, session d'administration dans la suite de bout en bout

Story de dette, née des revues de LS-102 et LS-103. Elle ne livre aucune
fonctionnalité : elle livre le **moyen d'observer** ce que les deux stories
précédentes ont écrit sans jamais pouvoir le regarder.

## Le manque qu'elle ferme

La suite de bout en bout couvrait le **refus sans session**, aux trois largeurs,
et ce test négatif est solide. Elle ne rendait aucun écran d'administration,
faute de session : les critères « le rendu est contrôlé à 320, 390, 768 et
1280 px » de LS-102 et LS-103 sont restés non exécutés, signalés comme tels dans
les deux tickets plutôt que déclarés faits.

Quatre écrans sont désormais rendus et mesurés : l'accueil de l'administration,
les catégories, la création de produit, et l'éditeur de fiche avec ses cinq
blocs.

## La mesure de débordement était aveugle, et seule la mutation l'a montré

C'est le point de méthode de la session, et il vaut au-delà de cette story.

Le test de débordement est passé au vert du premier coup. En le mutant, un
`<div>` de 800 px inséré dans l'éditeur, **les 131 tests sont restés verts**. La
mesure ne voyait rien.

La version d'origine comparait `scrollWidth` à `clientWidth` sur
`documentElement`, ce que font **les quatre fichiers e2e antérieurs du projet**.
Elle est fausse dans un cas précis : un élément en flux normal plus large que son
parent déborde visuellement, mais tant qu'aucun ancêtre n'établit de contexte de
défilement horizontal, la racine ne comptabilise pas ce dépassement. Mesuré sur
la page : l'élément s'étendait jusqu'à **816 px** sur un viewport de 320, et
`scrollWidth` rendait quand même 320.

Le document ne « sait » pas qu'il déborde. La personne qui regarde l'écran, si.

La mesure parcourt désormais `getBoundingClientRect`, en excluant les éléments
masqués. La mutation est alors détectée à 320 et 390 px, et **pas** à 1280 où le
viewport dépasse 816 : c'est exactement ce que les trois largeurs existent pour
attraper.

## Le plafond de débit, traité en trois paliers

La première version s'inscrivait à chaque exécution, comme le fait la session
cliente. Elle est tombée en `429` dès la seconde relance.

La cause était connue et écrite dans le ticket, mais son ampleur ne l'était pas :
le compteur vit **en base** depuis ADR-027, il survit donc au redémarrage du
serveur de test. Deux inscriptions par exécution, plus deux exécutions
rapprochées, dépassent les trois par minute, et les deux préparations tombent
ensemble.

Trois paliers, du moins coûteux au plus coûteux : réutiliser l'état de session
sur disque, sinon se connecter, sinon s'inscrire. Les sessions durent un jour,
donc l'état de l'exécution précédente est presque toujours valide.

Mesuré, compteur vidé avant chaque exécution :

| Situation | `/sign-up/email` | `/sign-in/email` |
|---|---|---|
| Base neuve, aucun état | 2 | 4 |
| Régime établi | 1 | 3 |

En régime établi la préparation ne fait **aucun** appel d'authentification : le
reliquat vient de fichiers antérieurs. Le plafond n'est pas désactivé, c'est la
consommation qui baisse.

**Le palier 1 se teste sur une route protégée** et non sur
`/api/auth/get-session`, qui rend 200 avec un corps vide pour une session
expirée : un contrôle « la réponse est ok » y passerait sur une session morte.

## Trois cas de mutation, et deux pièges de compilation

| Mutation | Test qui rougit |
|---|---|
| débordement de 800 px dans l'éditeur | ne déborde pas horizontalement, 320 et 390 seulement |
| bloc de publication descendu sous les informations | les cinq blocs sont rendus dans l'ordre décidé |
| `exigerAdministratrice` remplacé par `exigerSession` | refuse un visiteur sans session |

**Deux cas ont dû être réécrits pour ne pas casser la compilation.** Retirer le
bloc de publication rendait `motifs` inutilisé, et remplacer la garde sans
importer `exigerSession` ne compile pas : dans les deux cas la construction
Next.js échouait avant la suite, et la mutation aurait été comptée « détectée »
sur une erreur de compilation, sans rien prouver des tests. Le premier déplace le
bloc au lieu de le supprimer, le second ajoute l'import.

## Une erreur de ma part, corrigée par le rendu réel

Mon test d'ordre des blocs exigeait la publication **en dernier**, en s'appuyant
sur la table « Fiche produit, ordre des blocs » de `frontend-design.md`. Elle
décrit la fiche **publique**, celle de LS-105 : prix, ajout au panier, avis
vérifiés. L'éditeur d'administration suit un autre ordre, et LS-103 a
délibérément placé la publication **en tête**, sa justification écrite dans
`page.tsx` : elle porte l'état de la fiche, donc la première chose à lire.

Le test rougissait sur du code correct. Deux écrans, deux ordres.

## Ce que la revue d'interface a rapporté

Deux défauts réels, tous deux vérifiés par mutation avant correction.

**Le test des motifs de non-publication ne mesurait pas les motifs.** Il comptait
`page.getByRole("listitem")` sur toute la page, or l'éditeur rend **quatre**
listes : les manques, mais aussi une entrée par variante, par photo et par
section. La fixture posant une déclinaison, le compte valait au moins 1 même
quand le bloc de publication ne rendait plus rien. Mesuré en vidant `manquants` :
le test restait vert aux trois largeurs, alors que son commentaire affirmait
l'inverse. L'assertion est ancrée dans la région « Publication ».

C'est le même défaut que celui de la mesure de débordement, sous une autre forme.
Une assertion trop large ne mesure pas ce qu'elle nomme, et son commentaire
devient un mensonge que personne ne relit.

**Aucun test ne refusait un client connecté.** Les fichiers antérieurs
vérifiaient le visiteur **anonyme**. Une page qui appellerait `exigerSession` au
lieu d'`exigerAdministratrice` redirige toujours l'anonyme, donc tous ces tests
restent verts, et livre l'écran entier à n'importe quel compte de la boutique.
C'est l'invariant 2, et le seul chemin réaliste vers ces écrans : une personne
inscrite dans la boutique qui tape l'URL d'administration.

La session cliente existait déjà, aucune inscription supplémentaire n'a été
nécessaire. Le trou est fermé, cas de mutation 88.

**146 tests de bout en bout**, contre 131 avant la revue.

## Un avis de sécurité pendant la CI

`deepmerge-ts`, GHSA-ggr8-5vv4-36mx, paru entre le dernier contrôle vert et le
passage de la CI. Deuxième fois que le cas se produit sur ce projet.

C'est le **premier override qui franchit une majeure** chez son consommateur,
exactement la situation que `package.json` décrit comme le piège :
`@prisma/config` épingle `7.1.5` et la correction n'existe qu'en `8.0.0`. Aucune
version corrigée dans la branche 7.x, donc aucun choix, et le remède proposé par
npm rétrogradait Prisma en 6.12.

La règle devient alors sa propre exigence de preuve : `prisma validate`,
`generate` et `migrate status` ont été exécutés, et `prisma.config.ts` se charge,
qui est le chemin consommant `@prisma/config`.

## Deux tickets créés

- **LS-112**, epic LS-3 : onze assertions de débordement, dans six fichiers
  antérieurs, reposent sur la mesure prouvée aveugle. Elles ont servi de critère
  d'acceptation à LS-68, LS-81 et LS-89. Certaines rougiront une fois
  rebranchées, ce qui est le résultat utile
- **LS-113**, epic LS-3 : les états non nominaux, que la session rend enfin
  atteignables. Vide, pending, erreur serveur, panneau d'archivage, plus deux
  écrans protégés non couverts. La fixture de cette story rend d'ailleurs deux
  états vides structurellement inaccessibles, à corriger là

## État des tickets

LS-111 **En cours** au moment d'écrire, PR #122 ouverte, en attente des contrôles
et de la fusion.

## Prochaine étape

LS-104, catalogue public, grille, filtres par catégorie et tri. Inchangée : elle
consomme `statut = ACTIF` en filtre d'entrée et `publieA` en tri des nouveautés.
