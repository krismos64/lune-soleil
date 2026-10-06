# 6 octobre 2026 : LS-277, les deux thèmes de Noël dans le code

Suite de `2026-10-06-d`.

## Ce qui a été fait

- **Base** : migration `20261006200000_themes_noel`. Elle retire
  `chk_parametre_theme_connu`, convertit un `NOEL` choisi en `NOEL_1`, puis
  repose la contrainte sur `AUCUN`, `NOEL_1`, `NOEL_2`. L'ordre est imposé,
  car l'ancienne contrainte refuse `NOEL_1`. Un test d'intégration exécute le
  vrai fichier sur l'état qu'il rencontrera. `verifier-schema.sh` rejette
  `NOEL` et `noel_1`, accepte les deux thèmes : 135 réussites, et 3 échecs
  sur la base non migrée, ce qui prouve que les cas mordent. La migration
  **demandera `--confirm-destructive`** à `migrate-production.sh`, à cause du
  `DROP CONSTRAINT`, comme l'annonce ADR-046 amendé.
- **Jetons** : deux blocs, `noel_1` et `noel_2`, en trois classes (accents,
  fonds `--ls-noel-fond-*`, textes `*-sur-rouge`). Le pied de page, hors du
  `<main>`, reçoit les siens par `:root:has(main[data-theme=…])`.
- **`verifier-contraste.sh` réparé deux fois.**
  - Son expression ne lisait que des lettres : `noel_1` et `noel_2` auraient
    échappé à toute mesure, sans un mot. Elle les lit, et un garde compte les
    blocs écrits contre les blocs lus.
  - Il résolvait les jetons dans une table commune. Le second bloc écrasait
    le premier, et un `--ls-noel-vert` cassé dans `noel_1` était mesuré avec
    la valeur saine de `noel_2`. La mutation du cas 7 est restée verte jusqu'à
    la résolution bloc par bloc.

  Trois cas de mutation ajoutés : 10 sur 10 détectés.
- **Décors** : `decor-noel.tsx` (boules, neige continue, bandes sucre d'orge
  et papier cadeau, marges neigeuses, icônes), `bouton-pause-animations.tsx`,
  et `guirlande-boules.tsx`, qui remplace la guirlande d'étoiles. Les décors
  sont branchés dans l'emblème, l'accueil (paquet au ruban, bande défilante,
  sceau), le catalogue (bandeau, filtres, compte, pagination en étiquette,
  cartes en paquet cadeau, bouton d'achat) et le pied de page.
- **Mouvement continu** : `data-continu` échappe à la borne de cinq secondes
  à l'état `fin` seulement. La classe `pause-animations` fige tout le `<main>`.
- **Images** : le papier cadeau a été régénéré, puis découpé en **une tuile
  d'une période exacte** mesurée par autocorrélation (341 x 284 px). Il se
  raccorde par construction. Le paquet au ruban est réduit à 720 px. Les deux
  sont sans métadonnées, vérifiées octet par octet.
- **Tests** : `theme-noel-ls277.spec.ts` remplace celui de LS-267, avec
  84 tests aux quatre largeurs. Cinq mutations de bout en bout sont prouvées
  à la main puis inscrites au nocturne : pause sans effet, exemption retirée,
  nœud sur la photographie, neige sans script, bande dans la grille.

## Ce qui a dérapé

La revue `ls-frontend-revue` a relevé six défauts, tous corrigés et gardés
par un test :

1. Sans script, neige, boules et rayons tournaient sans fin, sans bouton de
   pause, celui-ci étant un composant client. Le mouvement continu ne vit
   désormais que sous `data-borne` à `joue` ou `fin`.
2. La bande sucre d'orge devenait une case de la grille du bandeau de 900 à
   1280 px : à spécificité égale, l'ordre de chargement tranchait.
3. L'accroche grise du catalogue tombait à 4,43:1 sur le dégradé de
   `NOEL_1`, que le contrôle ne lit pas. Le dégradé est ramené à 5 % de rouge,
   4,76:1.
4. Le contour de focus du bouton de pause tombait à 1,25:1 sur le pied de
   `NOEL_2`. Il est remplacé par un double anneau, blanc puis brun.
5. Le cercle du paquet était décentré par la règle globale
   `svg { max-width: 100% }`.
6. En mouvement réduit, le flocon des filtres tournait encore.

**Écarts entre la maquette et l'ADR, tranchés selon l'ADR** :

- la gerbe de flocons du bouton d'achat passait sur le prix et le badge. Elle
  est retirée, et c'est le petit paquet du bouton qui saute au clic réussi ;
- la pagination ne bascule plus au survol, puisque c'est le contrôle lui-même
  qui bougeait ;
- le flocon d'un filtre et le paquet d'un bouton restent animés, au titre de
  la réaction propre du contrôle (ADR-045, point 7). À confirmer par
  Christophe.

**Autres dérapages de mon fait** :

- J'ai d'abord annoncé que le nœud mordait de 9 px sur la photographie. Il
  ne mordait que de 1 px, son `top` se comptant depuis le ruban. Corrigé et
  gardé par un test.
- L'or du titre sur le filigrane de `NOEL_2` est à 3,19:1, et non à 3,47:1
  comme l'écrivait ADR-046. Le seuil de 3:1 est tenu ; la valeur est
  corrigée dans l'ADR.

## Fusion, migration et déploiement

- PR #536 fusionnée, `56a308c`. Un premier passage de la CI a échoué au
  formatage Prettier, et cet échec masquait un défaut latent de
  `verifier-ecart-production.sh`. Le script cherchait la dernière migration
  dans l'historique de la branche, puis mesurait l'écart contre `main` : toute
  PR porteuse d'une migration le faisait échouer. Le défaut est corrigé dans
  la PR. Rejoués en local, les 69 scripts de `controles.yml` passent, sauf
  `verifier-config-claude --strict` et sa mutation, qui échouent aussi sur
  `main` en local à cause de la mémoire du poste, absente en CI.
- **Arbitrage de Christophe** : les micro-interactions propres aux contrôles,
  le flocon d'un filtre et le paquet d'un bouton, sont conservées.
- **Migration sur autorisation explicite de Christophe.** Un premier passage
  sans confirmation a arrêté le script sur la seule instruction attendue,
  `DROP CONSTRAINT "chk_parametre_theme_connu"`. Le second passage, avec
  `--confirm-destructive`, a appliqué la migration : 24 migrations. La
  sauvegarde préalable est restée sur le poste. Le relevé de production est
  identique avant et après : thème `AUCUN`, 50 pièces publiées et 1 archivée,
  50 variantes, 54 photos, 3 catégories, 0 commande. Tunnel et relais fermés.
- **Déployé**, run 37533408410. L'écart avec `main` vaut 0 commit et
  0 migration. Le visiteur voit l'habillage ordinaire : aucun thème n'est
  activé.

## Prochaine étape

Christophe active Noël 1 ou Noël 2 dans Paramètres le moment venu. Le
nocturne de la nuit doit fermer LS-274 et l'issue #525.

## État des tickets

LS-277 close, déployée. LS-274 en cours jusqu'au
nocturne vert. LS-273 et LS-258 en cours. LS-275, LS-276 et LS-278 à faire.
