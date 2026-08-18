# 18 août 2026, LS-104, le catalogue public

Troisième session du 18 août, après LS-111 et LS-112. **Premier écran public réel
du projet**, la page d'accueil n'étant qu'une page d'attente depuis LS-68.

## Deux arbitrages au départ

**`/catalogue` en composant serveur, filtres par l'URL.** Chaque catalogue filtré
est alors partageable, indexable, et fonctionne sans JavaScript. Le bouton retour
du navigateur retrouve le filtre précédent gratuitement, ce qu'un `useState`
obligerait à réimplémenter.

**Tri par nouveautés seulement.** La règle dit « et éventuellement par prix », ce
qui n'est pas une obligation, et trier par prix demande de décider quel prix fait
foi quand un produit porte plusieurs variantes. Décision laissée à LS-105.

## Le défaut trouvé par un test, avant toute revue

Le test d'état vide a révélé un vrai défaut de conception. Je résolvais la
catégorie demandée parmi les seules catégories **ayant du contenu publié** :
filtrer sur une catégorie dont tout venait d'être archivé la rendait
« inconnue », donc le filtre était ignoré, et **le catalogue entier s'affichait
sans explication**.

La résolution se fait désormais sur les catégories existantes. Une catégorie
réelle mais vide reste retenue, ce qui permet à l'écran de dire « aucune pièce
dans Bagues » et de proposer d'effacer le filtre.

## Deux violations de contraste, dont une qui accusait la règle

**Le badge « Dernière pièce » en blanc sur terracotta donne 4,35:1**, sous le
seuil AA de 4,5:1. Or `frontend-design.md` prescrivait exactement cette
combinaison, tout en constatant le chiffre **deux lignes plus haut**. La règle se
contredisait, et je l'ai suivie à la lettre : c'est le cas typique d'une règle
qui se franchit de bonne foi.

Nouveau jeton `--ls-accent-terracotta-deep` `#9C4F2B`, 5,89:1 avec du blanc. La
règle est corrigée et **ADR-022 amendé**, la palette étant fixée par ADR.

**Le badge « Épuisé » en `--ls-text-muted` sur sable donne 4,35:1.** Ce jeton est
documenté « 4,86:1, AA » : vrai sur le fond **crème**, faux sur le sable. Un
rapport annoncé dans un jeton ne vaut que pour un fond, et rien ne le dit.

Les treize couples texte/fond de l'écran ont ensuite été mesurés un par un, tous
conformes.

## Ce que la revue a rapporté

**Le `<picture>` n'était exécuté par aucun test**, et c'est le point le plus
lourd. La préparation ne posait aucune ligne `media` : les trois cartes
empruntaient toutes la branche « image absente », donc les trois sources, les
`srcSet`, les `sizes` et le repli JPEG n'étaient traversés par **aucun des 188
tests**.

C'est le motif exact du défaut de LS-102, une URL portant `640.jpg` quand le
traitement écrit `640.jpeg`. Un test confronte désormais chaque URL servie à
`declinaisonsAttendues()`, la source de vérité du traitement, plutôt que de la
relire. Prouvé par mutation : en remettant `.jpg`, il rougit avec
« l'URL /medias/produits/e2e-ls104/640.jpg ne correspond a aucune declinaison
produite ».

**L'état vide ne nommait pas sa catégorie.** Le nom était cherché dans la liste
des catégories proposées au filtre, qui exclut par construction celle qu'on
filtre quand elle est vide : il valait `undefined` exactement quand il était le
plus utile.

**Aucun `loading.tsx` ni `error.tsx` n'existait dans tout `src/app`**, alors que
`frontend-design.md` les exige nommément. Sans le premier, une navigation entre
filtres laisse l'écran précédent figé pendant tout le rendu serveur. Sans le
second, une base injoignable rend la page générique de Next.js, en anglais, sur
le premier écran public du projet.

## Un écart entre le code et la règle, arbitré

La revue signale sans trancher : mon `JOIN` retirait du catalogue un produit dont
toutes les variantes ont la vente web coupée, quand la table des états donne
« vente web désactivée » comme condition de l'état **Épuisé**.

Christophe a arbitré de suivre la règle. L'enjeu n'est pas cosmétique : une pièce
partie sur un marché sortait du catalogue, perdait son adresse publique et son
référencement, et revenait plus tard sous une URL que plus personne n'avait en
favori. C'est aussi l'invariant 6, suspendre la vente web et retirer du catalogue
sont deux gestes distincts.

Seul l'archivage retire désormais une variante du compte, la vente web étant
prise en compte dans la disponibilité par un `CASE` qui la fait contribuer zéro.

## Chiffres

**478** tests unitaires et d'intégration, **200** de bout en bout, **95** cas de
mutation. Cinq cas ajoutés ici, 91 à 95, chacun exercé à la main et détecté par
le test attendu.

## État des tickets

LS-104 **En cours** au moment d'écrire, en attente de la PR et de la fusion.

Deux stories transverses sont absorbées : **LS-84**, contraste du terracotta,
traitée par le nouveau jeton et l'amendement d'ADR-022 ; **LS-85**, régions live
et noms accessibles, traitée par `aria-current` sur le filtre retenu et le
`role="status"` sur le compte.

## Ce qui reste, dit plutôt que tu

Six points relevés par la revue ne sont pas traités et demandent un œil, pas une
déduction :

- **les bordures à 1,5:1**, décoratives donc hors SC 1.4.11, mais c'est le seul
  indice qui délimite une carte à 1280 px et un filtre inactif à 320 px
- **l'affordance de défilement de la barre de filtres** à 320 px, sans dégradé de
  bord ni indice : avec six catégories, les dernières peuvent ne jamais être
  découvertes
- **un nom de catégorie long** dans une pastille en `white-space: nowrap`, motif
  que la règle interdit ailleurs, absorbé ici par le conteneur à défilement
- **un nom de produit long** à 320 px, qu'aucun test ne produit
- **l'annonce de la région live** entre deux filtres, la navigation Next.js
  démontant puis remontant le nœud `aria-live`
- **768 px**, quatrième largeur toujours absente des projets Playwright

## Prochaine étape

LS-105, fiche produit publique, onze blocs dans l'ordre imposé. Elle consomme le
slug que le catalogue vient de lier, `/produit/[slug]`, route qui n'existe pas
encore : les liens des cartes pointent aujourd'hui vers une 404.
