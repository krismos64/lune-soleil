# 4 octobre 2026 : LS-262, Notre univers et le catalogue animés

Suite de `2026-10-04-d`. Rien n'est déployé avant la fin de la refonte,
arbitrage de Christophe.

## Ce qui a été fait

- **Notre univers suit le fil du jour** sans toucher aux textes de LS-25 :
  `AstreDecor`, composant serveur en SVG et CSS, pose un soleil levant
  au-dessus du titre et une lune à la sortie. Le décor est muet, ses
  animations finissent avant cinq secondes, et un masque fixe cache le bas du
  soleil sous l'horizon. Les textes restent sur leurs fonds mesurés, rien ne
  se pose sur un ciel qui change.
- **Apparitions** : les six illustrations en fondu ; la citation, les
  matières et les gestes d'entretien en glissement seul. Le mode
  `data-apparition-mode="glisse"` est nouveau : il garde l'opacité à 1 pour
  ce qui ne doit jamais partir d'une opacité nulle.
- **Catalogue** : l'inclinaison et le reflet au survol quittent la grille de
  l'accueil pour la carte elle-même, partagée par les deux pages. Les cartes
  arrivent en glissement échelonné, sans fondu. `ReactionPointeur` passe en
  délégation, qui suit les cartes qu'un filtre ou une page remplacent.
- **`AnimationsBornees` passe dans le layout de la boutique**, à côté de
  `ApparitionAuDefilement`, et se rejoue à chaque changement de chemin.
- `tests/e2e/vitrine-ls262.spec.ts`.

## Mesures

LCP et CLS, profil mobile ralenti, même machine, avant et après : Notre
univers de 372 à 384 ms, le catalogue de 628 à 632 ms, CLS 0 partout. Les
deux écarts restent dans la variation d'une série à l'autre, de l'ordre de
20 ms. Sur Notre univers, le plus grand élément devient un paragraphe : le
soleil repousse l'image sous le premier écran à 390 px.

## Ce qui a dérapé

La revue `ls-frontend-revue` a relevé cinq défauts, tous corrigés :

- **la lune de la sortie jouait au chargement, hors de l'écran** :
  `AnimationsBornees` n'était monté que sur l'accueil, donc `data-borne`
  restait vide ailleurs. Le commentaire affirmait le contraire ;
- **l'échelonnement des cartes était sans effet** : la transition de `.carte`,
  de même spécificité que `[data-apparition="vu"]` et déclarée après lui,
  remettait le retard à zéro ;
- l'échelonnement ne s'appliquait pas à l'accueil, son sélecteur dépendant de
  la grille du catalogue ;
- une carte pouvait rester inclinée après un défilement à la molette, d'où un
  `pointerout` délégué ;
- la citation partait d'une opacité nulle alors que la règle écrite par cette
  story la mettait en glissement, et deux commentaires étaient devenus faux.

## Preuves

- Trois mutations attrapées par le test prévu seul : exception « glisse »
  retirée, bornage retiré du layout, règle de retard retirée.
- Suite complète avant les corrections de la revue : 2 307 réussis,
  82 ignorés, code 0.
- **Après les corrections**, contrôles textuels de la CI au vert et suite
  complète en local : 2 315 réussis, 82 ignorés (les 70 du nocturne et les
  12 que le test du menu écarte selon la largeur), code 0.

## Demandes du 4 octobre, tracées

Christophe a confié trois idées pour la suite, entrées dans Jira : **LS-265**,
un même prix pour plusieurs articles ; **LS-266**, retirer un archivé de
l'espace de l'exploitante, sans suppression en base ; **LS-267**, des thèmes
saisonniers, Noël en premier, avec un ADR avant le code. Ordre proposé :
LS-263 et le déploiement, l'inventaire des tickets restants, puis LS-265,
LS-266 et LS-267.

## Prochaine étape

LS-263, la fiche produit et les micro-interactions des pages d'action, dernière
story de la refonte avant le déploiement.

## État des tickets

LS-262 close à la fusion. LS-263 à faire. LS-264 attend un arbitrage. LS-258
en cours jusqu'au 17 octobre.
