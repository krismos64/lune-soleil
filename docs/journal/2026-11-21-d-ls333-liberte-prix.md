# 21 novembre 2026 : LS-333, un changement de prix n'exclut plus de la promotion

## Demande

Christophe : « comme pour le problème précédent, l'exploitante a changé le prix
des porte-clés et ils ne sont plus pris en compte par la réduction. Peux-tu
mettre en place cette liberté, elle prend la responsabilité pour tous les
articles ». Ticket **LS-333**, Story sous LS-7.

## Constat, production en lecture seule

Promotion réactivée à 18:15:57 UTC, 30 %, toute la boutique. Trois pièces
exclues par l'arbitrage 1 d'ADR-051 :

- porte-clés « Flocon Gourmand » et « Douce Fantaisie », 15 € → 18 € à
  18:15:39 ;
- « Bonhommes de Neige Pailletés », 15 € → 20 € → 15 € à 18:14:53 et 18:15:07.

## Arbitrage

Deux options présentées : prix barré au plus bas des trente jours (conforme à
L112-1-1, recommandée) ou liberté totale. **Liberté totale retenue**, risque
accepté par l'exploitante : un prix monté puis remisé affiche un prix barré
supérieur au plus bas des trente jours.

## Fait

- `CONDITION_ELIGIBLE` réduite à `v.prix_centimes > 0`. `historique_prix_variante`
  toujours écrit, prix toujours gelés sous promotion.
- `JOURS_PRIX_ANTERIEUR` et `CHANGEMENTS_PRIX_ECARTES` (LS-331) retirés.
- Mention de la fiche : « Prix barré : prix catalogue de la pièce, avant
  application de la réduction. » L'ancienne formule de L112-1-1 serait devenue
  fausse.
- ADR-051 amendé (arbitrage 1 abrogé, amendement de LS-331 sans objet),
  `payments.md`, `frontend-design.md`, `docs/REFERENCES.md`.
- `verifier-tests-mutation.sh` : les deux cas de LS-331 remplacés par un cas
  qui remet la règle des trente jours.

## Preuves

- Test neuf commité avant le code, rouge pour la bonne raison (pièce montée
  sans taux).
- Après le code : `promotion.sequential.test.ts`, 34 sur 34. Cinq tests
  reposaient sur une pièce exclue par un changement de prix : trois gardent une
  ligne non réduite, désormais hors de la sélection ; deux affirment le
  nouveau comportement.
- Mutation « règle des trente jours remise » : 3 tests rouges.
  `verifier-mutations-a-sec.sh` : 231 expressions, aucune périmée.
- Types et lint au vert ; `npm run test` : 130 fichiers, 2 110 tests.

## Prochaine étape

Fusion, déploiement, contrôle en production des trois pièces.

## État des tickets

- LS-333 : en cours jusqu'au contrôle en production.
- LS-330 : en attente du nocturne relancé, run 44924071009.
- Ajout de LS-332 : « Bonhommes de Neige Pailletés », dixième article, photo
  portée publiée après validation explicite de Christophe.
