# 13 novembre 2026 : pièces récentes réduites et bandeau Black Week, LS-321 et LS-322

## Demande

Christophe a essayé le thème et la promotion en production : le thème
fonctionne, mais « tous les prix restent les mêmes ». Il demande aussi un
bandeau Black Week animé en tête de l'accueil, près de l'emblème.

## Diagnostic, mesuré et non supposé

- La production servait bien `8fe66c2`, aucune erreur dans les journaux.
- L'essai : activation à 8 h 39 min 40 s, désactivation à 8 h 40 min 36 s,
  une visite de l'accueil et du catalogue entre les deux (journal Nginx).
- La condition d'éligibilité rejouée en lecture seule sur la base de
  production : **53 produits réduits sur 65**. Les douze exclus sont les plus
  récents, créés les 24 et 29 octobre, et ce sont eux que l'accueil et le
  catalogue montrent en premier. Le calcul était juste, la règle de
  l'arbitrage 1 d'ADR-051 donnait cette impression.
- Lecture en production par `docker exec` dans le conteneur de base, la
  procédure d'`EXPLOITATION.md` : aucun identifiant lu.

## Arbitrages de Christophe

- LS-321 : « réduire toutes les pièces », risque juridique accepté et nommé
  dans le second amendement d'ADR-051.
- LS-322 : « coder directement », sans maquette.

## Fait

- **LS-321** : la condition d'âge retirée de `CONDITION_ELIGIBLE` ; seul un
  prix changé dans les trente jours exclut encore. Tests réécrits sur cette
  cause d'exclusion, et le cas nominal ajouté : il manquait, seul le cas
  négatif de la carte existait. Mutation (condition remise) : les deux tests
  visés rougissent, et eux seuls.
- **LS-322** : `BandeauBlackWeek`, texte immobile, comète d'or autour du cadre
  et étincelles latérales sous `data-continu`. Il remplace le ruban de LS-318
  et porte l'annonce sous promotion, région « Promotion en cours » comprise.
  ADR-046 amendé, `frontend-design.md` à jour.
- Revue `ls-frontend-revue` : or illisible à l'impression (1,68:1) et deux
  classes CSS inexistantes, corrigés ; région nommée ajoutée et prouvée par
  mutation.
- Relecture finale du matin : PR #669 fusionnée (deux commentaires et
  `ETAT.md` périmés par l'amendement de LS-319).

## Ce qui a dérapé

- **Le cas nominal de l'affichage n'était pas testé**, seulement le cas
  négatif : rien ne pouvait dire que l'essai de production était conforme.
- **Mon premier diagnostic visait un cache**, réfuté par les en-têtes
  (`no-store`) et le rendu dynamique ; seule la mesure en base a tranché.

## Preuves

- Vitest complet : 2085 tests, 129 fichiers. `promotion.sequential` : 25.
- Bout en bout `theme-black-week-ls318` : 49 passés sur les quatre largeurs.
- Lint, types, mise en forme, contrôles `verifier-*.sh` au vert, sauf trois
  contrôles propres à la machine de production ou au poste, rouges aussi sur
  `main`.

## Reste

- Rendu avec promotion active non vu à 320 px (état global de la base) : à
  regarder lors de l'activation, comme le bandeau sous Safari (`pathLength`
  sur un `rect`).
- Mise en production sur accord de Christophe, sans migration.

## État des tickets

- LS-321 et LS-322 : En cours jusqu'à la production.

## Mise en production, même jour

Sur accord de Christophe : PR #670 fusionnée, `main` à `74ed615`, image
publiée, déploiement run 43393759307 réussi, conteneur sain ; `/api/sante`
opérationnel, `/`, `/catalogue`, `/panier` en 200. Aucune migration. Mesure
en lecture seule : **65 variantes sur 65** seraient réduites à l'activation,
aucune promotion active.

## État des tickets, final

- **LS-321 et LS-322** : Terminé, en production. Restent à voir à
  l'activation : le bandeau sous promotion à 320 px, la comète sous Safari.

## Relecture finale des contenus, même jour

Production revérifiée à `74ed615`, conteneur sain. Cinq compléments : la
règle d'éligibilité de LS-321 dans `payments.md`, la promotion dans l'agent
`ls-critical-reviewer`, le bandeau de LS-322 dans l'agent `ls-frontend-revue`,
la version de production dans `docs/ETAT.md`, et l'arbitrage 1 d'ADR-051
marqué comme abrogé pour moitié. CLAUDE.md, README, skills et hooks relus
sans écart.
