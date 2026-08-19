# 19 août 2026, la vitrine publique n'avait aucun ticket

Session partie d'une question de Christophe : les pages d'accueil sont-elles
prévues au développement dans Jira ? Réponse mesurée : non, et le trou était plus
large que l'accueil seul.

## Ce qui a été constaté

**Aucun des 121 tickets ne portait la vitrine publique.** Vérifié par balayage
des neuf epics et des stories, pas par échantillon. Deux confirmations directes :

- LS-104 écrit dans sa propre description « la page d'accueil actuelle n'étant
  qu'une page d'attente ». Elle constate le manque sans le combler
- les neuf stories de la phase 3, LS-114 à LS-121, couvrent panier, tunnel,
  paiement et commandes, aucune ne touche à la vitrine

`src/app/page.tsx` est bien une page d'attente, son commentaire le dit.

**Les tickets de contenu ne comblent pas le trou.** LS-25, LS-26 et LS-28
produisent du texte et vivent dans LS-22, epic de contenus. Aucun ne crée de
route ni de gabarit. LS-25 exige pourtant que « le lien notre histoire de
l'en-tête et du pied de page pointe vers une page réelle » : le critère suppose
une page que rien ne construit.

## Le prototype contredisait la documentation

Christophe a fourni l'adresse du prototype. Il porte **quatre pages publiques**
que `PROTOTYPE.md` n'inventoriait pas : `/`, `/notre-univers`, `/aide` et
`/informations-legales`. Le titre servi est « Prototype complet », et le pied de
page les relie depuis n'importe quel écran.

Le document se disait « revérifié le 13 août 2026, inchangé ». L'affirmation
était fausse sur son inventaire.

**Ce que je n'ai pas pu trancher** : pages manquées lors des deux passes, ou
prototype modifié après son gel du 5 août. Aucun historique du site ne le dit. La
mention « inchangée » est retirée plutôt que remplacée par une hypothèse.

## Un sixième écart de contraste, hors LS-84

Mesure sur la page d'accueil : 26 textes sous le seuil AA. Le terracotta
`#B4643E` à 4,07:1 est connu et porté par LS-84.

Le gris `#7A6A5D` à 4,35:1 ne l'est pas. Il apparaît sur les descriptions de
catégories, les libellés numérotés et les liens du pied de page.

**Nuance ajoutée après relecture des commentaires de LS-84**, que je n'avais pas
lus au moment de la mesure. Un point d'avancement du matin même établit que le
terracotta n'est employé nulle part dans `src/` : LS-104 a écrit les composants
sans reprendre le motif du prototype, et il ne reste que le contrôle automatique
à écrire.

Le gris est donc un défaut **du prototype**, pas du code, et rien ne dit qu'il
entrera dans `src/`. Ce qu'il change est la **forme du contrôle** attendu par
LS-84 : ancré sur le seul nom du jeton terracotta, il resterait vert devant une
autre couleur insuffisante.

**Arbitrage en attente de Christophe** : contrôle générique dans LS-84, ou
traitement dans LS-122.

Le motif mérite d'être noté : j'ai posé un constat sur LS-84 avant d'avoir lu
ses commentaires, alors que `CLAUDE.md` l'exige explicitement. Le constat
n'était pas faux, sa portée l'était.

## Deux mesures qui ont failli être fausses

**Le viewport plafonnait à 500 px.** `resize_page` à 320 laissait
`clientWidth` à 500, donc la première mesure de débordement ne valait rien.
Il a fallu passer par l'émulation d'appareil pour obtenir 320 px réels. Aucun
débordement une fois la largeur correcte, mesuré par `getBoundingClientRect` sur
chaque élément et non par `scrollWidth`.

**`awk length` compte les octets.** Dix lignes semblaient dépasser 80 colonnes,
il n'y en avait que trois : les accents comptent double. Vérifié par `wc -m`.

## Ce qui a été livré

| Canal | État |
|---|---|
| Dépôt | `996a133` fusionné sur `main`, PR 132, contrôles verts |
| Jira | **LS-122** accueil et **LS-123** pages de contenu, rattachées à LS-3 |
| Journal | cette page |
| Mémoire | fiche sur l'inventaire incomplet du prototype |

LS-123 est bloquée par LS-25, LS-26 et LS-28. Les trois liens `Blocks` ont été
posés un par un, le premier relu avant de dérouler les suivants, conformément à
ce qu'imposent les deux fiches mémoire sur le sens de ces liens. Sens correct
dès le premier essai, la forme documentée fonctionne.

## Prochaine étape

Inchangée par cette session : **LS-114**, le panier, première de la chaîne de la
phase 3. LS-122 ne la bloque pas et peut se prendre en parallèle, le catalogue de
LS-104 lui fournissant déjà ses données.

Deux points à trancher avant d'attaquer LS-122 :

- le gris `#7A6A5D`, traité dans LS-122 ou dans LS-84 élargie
- le regroupement de `/notre-univers`, qui réunit les trois pages annoncées
  séparément par LS-25. L'écart est tracé dans LS-123, il n'est pas arbitré
