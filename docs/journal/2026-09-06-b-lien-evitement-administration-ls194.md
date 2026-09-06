# 6 septembre 2026, session B : le lien d'évitement de l'administration, LS-194

Deuxième session de la journée, après LS-113 le matin. Le défaut venait de la
revue d'interface de LS-191 : `grep -rn 'href="#contenu"' src/` ne rendait qu'un
seul résultat, dans l'en-tête de la boutique. Les seize écrans d'administration
n'avaient aucun raccourci clavier vers leur contenu, WCAG 2.4.1 niveau A.

Elle a coûté plus cher que prévu, pour une raison qui n'a rien à voir avec le
sujet : **j'ai perdu quatre fichiers deux fois de suite** en commitant pendant
qu'un script de mutation tournait.

## Le classement du backlog qui a mené ici

Christophe demandait des tickets rapides, en écartant Mondial Relay, la
médiation et le VPS. Le classement a placé LS-194 en tête devant LS-166, que le
journal de la veille annonçait pourtant comme prochaine étape.

**LS-166 est la plus chère du lot**, pas la moins chère : ajouter la largeur
768 px triple chaque appel d'une suite déjà lourde, motif « plafond de débit et
suite e2e ». Le journal l'avait rangée première parce qu'elle suivait LS-191
dans l'ordre du travail, pas dans l'ordre du coût.

## L'arbitrage était déjà rendu

Le ticket proposait deux voies : un `id` posé par le layout sur un conteneur
enveloppant `children`, ou l'ancre répétée par chaque page. Il recommandait la
première, « qui évite seize modifications ».

**LS-122 avait déjà tranché l'inverse, et l'avait mesuré.** Le commentaire du
layout de la boutique porte le verdict : la première version enveloppait
`children` dans un `<div id="contenu">`, `focus()` sur ce div ne prenait pas, le
focus retombait sur `body`. Le lien faisait défiler la page sans déplacer le
focus clavier.

Suivre la recommandation du ticket aurait rejoué un défaut déjà payé. La cible
vit donc dans le `<main>` de chaque page.

## Ce que la story a livré

**Le lien vit dans le layout, sous le retour anticipé hors rôle.** Un lien
d'évitement affiché sur l'écran de connexion pointerait vers une cible que cette
page ne porte pas : il occuperait la première tabulation sans mener nulle part,
ce qui est pire que son absence.

**Seize `<main>` portent l'ancre**, y compris la frontière d'erreur et les
`loading.tsx`. Le composant de chargement partagé la porte quand il rend le
`<main>` d'un écran, jamais quand il sert de repli à une frontière Suspense
interne : deux éléments de même identifiant rendraient le lien indéterminé.

**Trois écrans sont exclus avec leur raison écrite.** `connexion` et
`reauthentification` sortent par le retour anticipé du layout, `echec-rendu`
lève et ne rend aucun `<main>`.

**Un contrôle textuel dans les deux sens**, sur le modèle de
`verifier-navigation-administration.sh` : le layout pose le lien, et tout écran
rendu sous la barre porte sa cible focalisable. Le second sens est celui qui
attrapera le dix-septième écran dès son écriture.

## La perte de travail, deux fois

`git checkout -- <chemin>` restaure depuis l'**index**, pas depuis `HEAD`. Sur
un arbre dont le travail n'est pas commité, il rend donc la version d'avant le
TRAVAIL et non celle d'avant la MUTATION.

**Premier tour.** Le script de mutation a ramené quatre fichiers à l'état de
`main`, et le `git add -A` qui a suivi a figé cet état. Le lien du layout,
l'ancre de deux écrans et celle du composant partagé sont partis dans un commit
qui prétendait les ajouter.

**Second tour, après correction.** J'ai réparé, corrigé le script, puis enchaîné
`type-check && format:check && git add -A && git commit`. Le `trap ... EXIT` du
lancement précédent s'est exécuté pendant cette chaîne, et le commit a de
nouveau figé un état muté.

La correction tient en deux moitiés, et la seconde est la vraie : restaurer
depuis `HEAD` rend déterministe **ce qui** revient, mais écraserait encore un
travail non commité. Le script **refuse désormais de tourner** quand un fichier
mutable porte des modifications non commitées.

**Le cas 3 avait raison depuis le début.** Il rougissait sur quatre défauts
quand un seul était muté, et j'ai d'abord conclu à un trou du contrôle. C'était
la signature d'une perte de travail : un cas de mutation qui rougit sur plus que
sa cible ne dit pas que le contrôle est trop large, il dit que l'état de départ
n'est pas celui qu'on croit.

## Un test rendu insensible à ce qu'il gardait

`tabIndex={-1}` rend le `<main>` focalisable, et **Next.js y déplace le focus
après une navigation client**. Le test « le focus ne se perd pas en naviguant au
clavier » exigeait le bouton de bascule : il a rougi.

Le comportement obtenu est meilleur que celui qu'il exigeait, on arrive au début
du contenu. L'assertion porte donc sur l'intention, ne pas retomber sur `body`.

**Le coût caché était ailleurs.** Ce test était le seul à garder
`bascule.current?.focus()` dans le composant de navigation. Vérifié en retirant
la ligne : la suite restait entièrement verte. Le test `Escape` semblait le
garder, mais il presse la touche juste après un `click()` sur la bascule, où le
focus est déjà : `focus()` n'y change rien.

Il déplace maintenant le focus dans le panneau avant la frappe, ce qui le rend
réellement sensible, prouvé par mutation.

## Ce que la revue d'interface a trouvé

`ls-frontend-revue` a relevé quatre points, trois retenus et un écarté.

**Le contrôle acceptait l'ancre posée hors du `<main>`.** Il cherchait
`id="contenu"` dans le FICHIER : un `<main>` nu suivi d'un
`<h1 id="contenu" tabIndex={-1}>` le satisfaisait, et il annonçait « chaque
écran porte sa cible focalisable » sur un écran où le lien menait à un titre.
Motif « contrôle par fichier ou par fonction ». Il lit désormais la balise
elle-même, de `<main` au `>` fermant, ce qui garde le cas multiligne
d'`error.tsx`.

Le second effet de la même cause était plus discret : `tabIndex={-1}` est un
attribut courant, posé sur un titre focalisé après une action. Cherché dans le
fichier, il aurait été satisfait par cet autre élément.

**Un sixième cas de mutation manquait.** Les cinq premiers RETIRENT l'ancre, le
sixième la DÉPLACE vers un enfant. C'est la forme qui se produira vraiment, lors
d'une refonte d'écran.

**Le contour de focus sortait du cadre.** `globals.css` trace `outline: 3px`
avec `outline-offset: 2px`, soit 5 px au-delà de la boîte : à `left: 0`, les
côtés gauche et supérieur n'étaient pas rendus, et le focus ne se voyait que sur
deux côtés sur quatre. Mon assertion disait `x >= 0` et laissait passer ce cas,
alors que son commentaire annonçait garder WCAG 2.4.7.

**Ma justification du `z-index` était fausse sous 768 px.** Elle nommait le
bandeau, alors que le haut de l'écran y est occupé par le bouton « Menu » sur
toute la largeur. Mesure : lien focalisé à 8,8 sur 163 × 52, bouton à 0,0 sur
390 × 51. Le recouvrement est réel et sans conséquence à l'usage, mais le
commentaire décrivait la mauvaise largeur.

### Le point écarté par la mesure

La revue déduisait que `not-found.tsx` produirait **deux** liens « Aller au
contenu » sous `/administration`, le layout restant monté au-dessus du segment
introuvable. La déduction était plausible : ce fichier compose lui-même
`<EnTeteBoutique />`, qui porte son propre lien.

**Mesuré sur trois formes d'URL**, dont une passant par un segment dynamique où
le layout est le plus susceptible d'être monté : Next.js remonte au
`not-found.tsx` racine SANS monter le layout du segment. Un lien, une ancre,
aucune barre d'administration.

Un test garde désormais cette propriété, parce qu'elle dépend d'un comportement
de Next.js et non d'une ligne du dépôt : une version future pourrait la changer
sans que rien ne le signale à la relecture.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `verifier-lien-evitement.sh` | **25 écrans examinés**, dont 8 délégués |
| `verifier-lien-evitement-mutation.sh` | **6 sur 6**, chacune par son message |
| `verifier-contraste.sh` | **178 paires** contre 177 avant |
| `verifier-navigation-administration.sh`, `verifier-regles.sh` | verts |
| Suite e2e complète | **1067 verts** |

Le lien focalisé mesure 155 × 44 px à 8,8, identique aux trois largeurs : il
tient à 320 px et respecte la cible tactile.

**Les 14 échecs de la suite complète appartiennent tous à des familles déjà
rouges sur `main`**, qui en portait 13 lors de la mesure de référence. Tous
passent en isolation : c'est l'instabilité de base partagée tracée en LS-168.
Le nombre varie d'une exécution à l'autre, ce qui est la signature de cette
instabilité et non d'une régression.

## État des tickets

**LS-194 est TERMINÉE**, six critères sur six, PR #255.

**LS-196 est ouverte**, rattachée à LS-3, priorité Low : le lien d'évitement de
la boutique n'a pas de zone tactile de 44 px et garde `left: 0`, donc le même
contour coupé que celui que cette story vient de corriger côté administration.

**LS-168 reste ouverte** et se rappelle à chaque suite complète.

## Propagation

Règle **C34** ajoutée à `frontend-design.md` : le lien et sa cible se posent
ensemble, ou aucun des deux. Contrôle branché à la CI en étape **6l**, les deux
scripts déclarés au README.

## Prochaine étape

**LS-195**, la ponctuation des annonces de chargement, un seul fichier public à
aligner sur les quinze autres plus un contrôle textuel. Ensuite **LS-187 et
LS-192** groupées, qui touchent les mêmes fichiers de composition d'URL de
média.
