# 21 novembre 2026 : LS-331, Kanoa réduite par exception arbitrée

## Demande

Christophe : « une boucle ne paraît pas en promo Black Week, pourquoi ?
comment la mettre en promo ? ». Puis, après l'explication : « option 3, on
fait exception et on la comprend dans les promos, j'en prends la
responsabilité ». Ticket neuf **LS-331**, Story sous l'epic LS-7.

## Constat, production en lecture seule

- Promotion active : `PROMOTION`, portée `TOUT`, 30 %, activée le 21 novembre
  2026 à 16:44:52 UTC.
- Une seule pièce active non réduite : « Kanoa », `KANOA`, 15 €.
- Historique : 1 500 → 100 centimes le 16 novembre à 20:17:51 UTC, 100 → 1 500
  à 20:23:37 ; commande **C-2026-0006** passée à 1 € à 20:21, livrée.
- L'arbitrage 1 d'ADR-051 l'exclut : 1 € est le prix le plus bas pratiqué
  dans les trente jours, L112-1-1.

## Options présentées

1. Baisser Kanoa à 10,50 € sans prix barré (désactiver, changer, réactiver),
   **recommandée**.
2. Attendre le 16 décembre 2026 à 20:23 UTC.
3. Exception dans le code, déconseillée. **Retenue par Christophe**, risque
   juridique accepté.

## Fait

- `CHANGEMENTS_PRIX_ECARTES` dans `src/lib/promotion.ts` : les deux
  identifiants d'historique du 16 novembre, et eux seuls.
- `CONDITION_ELIGIBLE` (`src/repositories/promotion.ts`) les ignore. Même
  condition pour l'affichage et la commande, aucune autre écriture.
- Aucune migration, aucune donnée de production modifiée : l'historique de
  prix reste intact.
- ADR-051 amendé, risque nommé.
- Deux cas ajoutés à `verifier-tests-mutation.sh`.

## Preuves

- Test écrit et commité avant le code, rouge pour la bonne raison (aucune
  pièce réduite, donc aucune promotion annoncée).
- Après le code : `promotion.sequential.test.ts`, 35 tests sur 35.
- Trois mutations jouées à la main, toutes détectées : exception retirée
  (1 test rouge), contrôle d'historique neutralisé (7 rouges), exception
  élargie à la pièce entière (1 rouge, par le changement de plus sur la même
  pièce). `verifier-mutations-a-sec.sh` : 232 expressions de
  `verifier-tests-mutation.sh`, aucune périmée.
- Types et lint au vert ; `npm run test` : 130 fichiers, 2 111 tests ;
  `verifier-regles.sh` conforme.

## Dérive

Le premier lancement du test, en arrière-plan derrière un filtre, s'est
terminé sans sortie et n'avait écrit ni la constante ni le commit : relancé
au premier plan. Rien de perdu.

## Prochaine étape

Fusion, déploiement, contrôle en production de Kanoa à 10,50 € et 15 €
barré. Après la Black Week, rien à défaire : la liste ne sert qu'à ces deux
changements, que la fenêtre de trente jours oubliera le 16 décembre.

## État des tickets

- LS-331 : en cours jusqu'au contrôle en production.
- LS-330 : en attente du nocturne relancé, run 44924071009.
