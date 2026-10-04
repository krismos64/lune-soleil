# ADR-045 : politique d'animation des pages publiques

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 4 octobre 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | `.claude/rules/frontend-design.md`, sections « Interdits visuels » et « Paillettes » |
| Ticket | LS-259 |

## Correction du 4 octobre 2026, revue de LS-260

**Le point 4 citait WCAG 2.2.2 à moitié.** Le critère ne dispense d'un moyen
d'arrêt qu'une animation qui s'arrête **en cinq secondes au plus**. La borne de
dix secondes écrite ci-dessous n'était donc pas conforme, sans bouton de pause.
L'arbitrage de Christophe, pas de bouton de pause, tient : c'est la borne qui
change.

- Toute animation automatique s'arrête **au plus tard cinq secondes** après son
  entrée dans l'écran, et chaque animation finie dure moins de cinq secondes,
  retard compris. `DUREE_MAX_MS` vaut 5 000.
- Les propriétés animables sont `transform`, `opacity` et, pour le dessin d'un
  tracé, `stroke-dashoffset`. Le reflet des mots dorés du titre, qui animait
  `background-position` sur l'élément du LCP, n'est pas porté.

Relevé par `ls-frontend-revue` avant la fusion de LS-260, sur le code qui
appliquait la version fautive.

## Amendement du 4 octobre 2026, portes d'entrée et contact, LS-268

**Arbitrage de Christophe sur maquette**, critiquée par Codex. Le point 7
classait la connexion, l'inscription et le contact parmi les pages d'action,
limitées aux micro-interactions. Ils reçoivent désormais un **décor animé**,
et **le formulaire reste immobile** : rien ne bouge pendant une saisie.

- **Le dégradé de ciel s'étend à deux décors de plus**, soit quatre en tout :
  la scène du matin à la nuit, le fond du menu mobile, **le panneau des portes
  d'entrée de la boutique** et **l'en-tête du contact**. Il reste interdit sur
  un contrôle, une carte, un bandeau ou une surface d'interface.
- **Connexion** : ciel de nuit, image générée par Codex (aquarelle, aucun
  bijou, aucun texte, métadonnées retirées), lune tracée, étoiles, poussière
  d'or. **Inscription** : aube, soleil levant, rayons et orbite tracés.
  **Contact** : enveloppe tracée, rabat posé, sceau en lune, et trois encarts
  « avant d'écrire » qui glissent sans disparaître.
- **Sous 768 px, le décor devient un bandeau** au-dessus du formulaire, image
  comprise, environ 100 ko : le panneau masqué de LS-229 laissait le mobile
  sans identité.
- **L'administration n'est pas concernée** : son écran de connexion garde la
  photographie immobile de l'atelier, le point 7 n'y anime rien.
- Les autres règles tiennent sans changement : titre, introduction et
  formulaire visibles au premier rendu, sans script et en mouvement réduit ;
  arrêt avant cinq secondes par `data-borne` ; `transform`, `opacity` et
  `stroke-dashoffset` seulement.

Contrastes calculés : `--ls-texte-nuit` donne 13,27:1 sur
`--ls-ciel-nuit-bas` et 16,37:1 sur `--ls-ciel-nuit-haut` ;
`--ls-primary-hover` et `--ls-text` dépassent 10:1 sur `--ls-ciel-aube-haut`.

## Contexte

Le 4 octobre 2026, Christophe a validé une maquette d'accueil animée et décidé
d'étendre ce rendu aux autres pages publiques. Cet arbitrage élargit le
périmètre, il est tracé dans LS-259. Les stories de portage sont LS-260 à
LS-263.

La maquette anime le logo vectoriel (anneau qui se dessine, lune qui glisse,
soleil et rayons, étoiles), révèle le titre mot à mot, fait passer le ciel du
matin à la nuit au défilement, et ouvre un menu mobile plein écran sur un ciel
nocturne. Elle tient en CSS et en un script sans dépendance.

Quatre contraintes du projet encadrent le portage :

- le **référencement** est prioritaire, et le titre de la maquette n'apparaît
  qu'après 1,6 seconde, ce qui retarde le plus grand élément affiché, le LCP ;
- les **composants serveur** sont la règle, le client réservé à une
  interaction réelle ;
- l'**accessibilité** WCAG 2.2 AA s'applique, dont 2.2.2 : une animation
  automatique de plus de cinq secondes doit pouvoir s'arrêter ;
- la suite de **bout en bout** compte plus de deux mille tests, qu'une
  animation peut rendre instables en déplaçant un élément au moment du clic.

`frontend-design.md` interdit en outre le dégradé violet ou bleu, la
suranimation et le dégradé métallique sur un bouton, et impose des paillettes
en CSS déterministe. La maquette validée contredit trois de ces points. Une
règle qui contredit une décision est fausse : cet ADR les amende.

## Décision

**Les pages publiques s'animent en CSS et par un composant client minimal, sans
bibliothèque d'animation, avec une intensité fixée par type de page. Le contenu
est toujours visible au premier rendu, sans JavaScript et en mouvement réduit,
et aucune animation ne tourne indéfiniment.**

Les huit points de LS-259, tranchés :

### 1. Moyen technique : aucune bibliothèque

Animations en CSS (`@keyframes`, transitions, `stroke-dashoffset` pour les
tracés), et un script sans dépendance pour ce que le CSS ne sait pas faire :
progression au défilement, apparition à l'entrée dans l'écran, parallaxe au
pointeur, gestion du menu.

Mesuré le 4 octobre 2026 avec esbuild, minifié puis gzip niveau 9 :

| Option | Poids transmis |
|---|---|
| Script de la maquette, non minifié | 3 461 octets |
| `motion` 14, fonction `animate` seule | 20 329 octets |
| `motion/react`, composant `motion` | 41 404 octets |

### 2. Frontière serveur et client

Textes, liens, données du catalogue et métadonnées restent rendus par des
composants serveur. Les effets vivent dans **un composant client par
comportement** (défilement, apparition, menu), qui reçoit ses cibles par
attribut ou par référence et **retire ses écouteurs et observateurs au
démontage**. Aucun texte affiché n'est produit côté client.

### 3. Réduction des mouvements

Sous `prefers-reduced-motion: reduce`, la page est **complète et immobile** :
aucun script d'animation ne s'installe, les scènes pilotées par le défilement
deviennent un flux statique lisible, les tracés sont dessinés d'emblée. Un
changement de préférence pendant la visite est pris en compte.

### 4. Aucune boucle sans fin, sans bouton de pause

Arbitrage de Christophe le 4 octobre 2026 : **pas de bouton de pause visible**.
WCAG 2.2.2 est donc tenu par l'arrêt : toute animation automatique qui dure
plus de cinq secondes **s'arrête d'elle-même**, au plus tard dix secondes après
(**cinq secondes depuis la correction ci-dessus**) son entrée dans l'écran, et ne reprend qu'au retour dans l'écran. Une animation
hors de l'écran ne consomme rien. Les reflets, scintillements et la rotation
des rayons suivent cette règle, le bandeau défilant aussi.

### 5. Référencement : rien de principal n'est masqué

Le titre, l'accroche, les boutons d'action et les cartes de produit sont
**visibles et à leur place au premier rendu**. L'animation porte sur le décor
(emblème, ciel, astres, reflets) ou se joue **sans partir d'une opacité nulle**
sur un contenu principal. Le LCP et le CLS d'une page portée se mesurent avant
et après, sur la même machine, et ne régressent pas.

### 6. Sans JavaScript

Les masquages initiaux (opacité nulle, translation) ne s'appliquent que sous
une classe posée par le script après son initialisation. Sans script, tout le
contenu est visible et la navigation reste atteignable, menu mobile compris
par un repli qui ne dépend pas du script.

### 7. Intensité par type de page

| Type | Pages | Ce qui est permis |
|---|---|---|
| Vitrine | accueil, notre univers, catalogue | scènes, tracés, parallaxe, reflets, apparitions |
| Produit | fiche produit | transitions de galerie, apparitions discrètes, aucun décor animé |
| Action | panier, commande, compte, aide, pages légales | micro-interactions seulement : réaction d'un bouton, passage d'un état à l'autre |
| Portes d'entrée, amendement LS-268 | connexion et inscription de la boutique, contact | décor animé, formulaire immobile |
| Administration | tous les écrans | aucun changement |

Dans le tunnel de commande, rien ne bouge pendant une saisie ni autour d'un
élément de paiement.

### 8. Tests de bout en bout en mouvement réduit

Playwright tourne avec `reducedMotion: "reduce"` dans sa configuration
commune. Les tests vérifient l'état final, et un test dédié par comportement
animé le vérifie en mouvement normal (ouverture du menu, apparition).

## Ce que cet ADR amende

**`frontend-design.md`, « Interdits visuels »** :

- le **dégradé de ciel** est permis dans deux décors seulement, la scène du
  matin à la nuit et le fond du menu mobile plein écran. Ses teintes nocturnes
  entrent dans `tokens.css`. Il reste interdit sur un contrôle, une carte, un
  bandeau ou une surface d'interface ;
- le **texte doré en dégradé** est permis sur des mots de titre, à condition
  que **chaque arrêt de couleur** atteigne 3:1 sur son fond, seuil du grand
  texte. Mesuré sur la maquette : `#8b5a12` donne 5,66:1 et `#a46c17` 4,26:1
  sur `#fffaf1`, mais `#e0b657` tombe à 1,84:1 et `#f0cf7a` à 1,45:1. Ces deux
  derniers arrêts sont retirés au portage ;
- l'interdit du **dégradé métallique sur un bouton** est maintenu. Le reflet
  qui balaie le bouton principal au survol dans la maquette n'est pas porté ;
- la **suranimation** reste interdite, et se définit désormais par le
  tableau du point 7.

**`frontend-design.md`, « Paillettes »** : la poussière d'or du héros est une
forme de paillettes. Elle est portée en **CSS déterministe**, positions fixes
et non tirées au hasard, `aria-hidden`, `pointer-events: none`, supprimée en
mouvement réduit, jamais par-dessus un bijou ou un contrôle. Le canvas de la
maquette n'est pas porté.

## Alternatives écartées

**Une bibliothèque d'animation, `motion` ou équivalent.** Elle simplifierait
les enchaînements, mais coûte de 6 à 12 fois le poids du script de la maquette,
tableau du point 1, pour des effets que le CSS rend déjà. Elle pousserait aussi
vers des composants client plus larges, contre le point 2.

**Un bouton de pause visible**, présent dans la maquette jusqu'au 4 octobre.
Il satisfait WCAG 2.2.2 sans contrainte de durée, mais Christophe l'a jugé
inutile pour le visiteur. L'arrêt automatique du point 4 tient la même
exigence sans élément d'interface.

**Animer partout avec la même intensité.** Plus homogène, mais une animation
décorative distrait au moment de payer, gêne la lecture des pages légales, et
alourdit des écrans d'administration qui sont des outils de travail.

**Animer le contenu principal à l'entrée, comme la maquette.** Le titre révélé
mot à mot est plus spectaculaire, mais il part d'un état invisible pendant
1,6 seconde et retarde le LCP, critère de classement. Le décor porte
l'animation, le texte reste stable.

**Ne compter que sur `prefers-reduced-motion`** pour WCAG 2.2.2. Ce réglage
n'est connu que d'une partie des personnes gênées par le mouvement, et le
critère vise toute animation qui dure. L'arrêt automatique couvre les deux.

**Laisser Playwright tourner en mouvement normal.** Les tests resteraient au
plus près du réel, mais un clic sur un élément en cours de déplacement produit
des échecs intermittents, dont le diagnostic a déjà coûté cher à ce projet.
Le mouvement normal reste couvert
par les tests dédiés du point 8.

## Conséquences

- `tokens.css` reçoit les teintes du ciel nocturne et des durées
  d'enchaînement, qui passent à zéro en mouvement réduit comme les durées
  existantes.
- `frontend-design.md` est mis à jour dans la même branche que cet ADR, en
  citant ADR-045.
- `playwright.config.ts` reçoit `reducedMotion: "reduce"` dès la première
  story de portage, LS-260.
- Chaque story de portage reprend dans ses critères : contenu visible au
  premier rendu, mouvement réduit, sans JavaScript, arrêt des boucles,
  mesure du LCP et du CLS avant et après.
- La maquette validée entre dans `docs/prototypes/` avec LS-260 comme
  référence de rendu, et non comme source de vérité : ce sont les règles
  ci-dessus qui font foi.

## Risques

**Un composant client qui grossit.** Chaque comportement ajouté alourdit le
script. Atténuation : un composant par comportement, et le poids de la page
d'accueil se relève dans la PR de LS-260.

**Un contraste qui varie avec le défilement.** La couleur du texte de la scène
du matin à la nuit change avec le ciel. Atténuation : le texte est choisi par
contraste calculé à chaque étape, et la story vérifie au moins 4,5:1 sur
toute la progression.

**Un téléphone modeste qui saccade.** Atténuation : seules `transform` et
`opacity` s'animent, aucune propriété qui recalcule la mise en page, et rien
ne tourne hors de l'écran.

**Une règle d'arrêt oubliée sur une animation future.** Atténuation : la règle
est écrite dans `frontend-design.md`, et la revue `ls-frontend-revue` la
vérifie à chaque story qui touche une page publique.
