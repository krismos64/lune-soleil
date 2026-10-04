# 4 octobre 2026 : LS-263, fiche produit retenue et micro-interactions

Suite de `2026-10-04-e`. Dernière story de la refonte animée. Le déploiement
attend la fin de la session, après LS-264 à LS-268, arbitrage de Christophe.

## Ce qui a été fait

**Périmètre réduit** en cours de journée, à la demande de Christophe : la
connexion, l'inscription et le contact sortent vers LS-268, qui les refondra
en entier. Commentaire posé sur LS-263.

- **Fiche produit, retenue** : fondu de la photo de la galerie à son arrivée
  quand on en change, par `Element.animate`, de 0,4 et jamais de zéro ; la
  première photo s'affiche sans animation. Ouverture douce de la photo
  agrandie et de son fond. Vignettes soulevées au survol, souris seulement.
  Sections éditoriales et bloc légal en glissement. Ordre des blocs inchangé.
- **Pages d'action** : un enfoncement instantané à l'appui des boutons et de
  « Passer la commande », limité à la boutique par son en-tête ;
  l'administration ne bouge pas. Les messages d'alerte et d'état apparaissent
  de 0,4 en 220 ms. Rien ne bouge pendant une saisie.
- **Les deux boutons de paiement sont immobiles**, marqués `data-paiement`.
- `tests/e2e/fiche-ls263.spec.ts`.

## Ce qui a dérapé

- **Mon premier test d'appui passait pour une mauvaise raison** : il mesurait
  une vignette, déjà soulevée au survol, dont la transformation n'est jamais
  « none ». La mutation « règle d'appui retirée » l'a montré ; le test mesure
  désormais le bouton d'agrandissement.
- **Une transition globale aurait effacé celles des boutons** : la
  spécificité du sélecteur limité à la boutique écrasait chaque `transition`
  de bouton. Retirée avant le commit ; l'enfoncement est instantané.
- La revue `ls-frontend-revue` a relevé sept défauts, tous corrigés :
  - **les deux boutons de paiement s'enfonçaient**, et le commentaire qui
    l'autorisait invoquait un cadre de Stripe qui n'existe pas, le paiement
    passant par une redirection ;
  - **un `key` sur l'image remontait l'élément** et le vidait pendant le
    chargement : le fondu animait un carré vide ;
  - le fond de la photo agrandie apparaissait d'un coup ;
  - la vignette soulevée perdait sa bordure du haut, rognée par le défilement
    horizontal ;
  - sur écran tactile, la vignette touchée restait soulevée ;
  - les transitions d'état du ticket n'étaient pas livrées ;
  - « Passer la commande », lien habillé en bouton, ne réagissait pas.

## Preuves

- Sept mutations attrapées par le test prévu seul : fondu retiré, image
  remontée, règle d'appui retirée, règle étendue à l'administration, paiement
  non exclu, animation des messages retirée, et la première, qui a démasqué
  le faux vert.
- Suite complète avant les corrections de la revue : 2 327 réussis,
  82 ignorés, code 0.
- **Après les corrections**, contrôles textuels de la CI au vert et suite
  complète en local : 2 335 réussis, 82 ignorés, code 0.

## Prochaine étape

LS-264, le libellé « Notre univers » : un arbitrage de Christophe d'abord.
Puis LS-265, LS-266, LS-268 et LS-267, le déploiement en fin de session.

## État des tickets

LS-263 close à la fusion. LS-264 à LS-268 à faire. LS-258 en cours jusqu'au
17 octobre.
