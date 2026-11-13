# 13 novembre 2026 : promotion libre et période réglable, LS-319

## Demande

Christophe, après la mise en production : l'exploitante doit pouvoir activer
et désactiver la promotion quand elle veut, sans blocage, et régler elle-même
les dates annoncées. Les deux risques ont été exposés avant : prix barré faux
sur une promotion trop proche d'une autre (L112-1-1, C-330/23), annonce datée
contredite par une activation hors période. **Arbitrage** : libre, sans aucun
avertissement ; dates gardées dans le bandeau, réglables dans Paramètres.

## Fait

- **Carence retirée** (fenêtre de 24 heures et refus de trente jours),
  arbitrage 2 d'ADR-051 abrogé par amendement, risque accepté par Christophe
  et nommé dans l'ADR.
- **Période réglable** : migration additive
  `20261113120000_periode_promotion`, deux `DATE` sur `parametre_boutique`
  initialisées au 23 et au 29 novembre 2026, `chk_parametre_periode_promotion`
  (les deux ou aucune, dans l'ordre), quatre cas dans `verifier-schema.sh`.
- `formaterPeriode` écrit « du lundi 23 au dimanche 29 novembre », le mois et
  l'année répétés s'ils changent ; sans période, le bandeau n'annonce aucune
  date. Formulaire « Période annoncée de la promotion » dans Paramètres, deux
  champs de date, rôle exigé sans réauthentification.
- ADR-051 amendé, `frontend-design.md`, `database.md`, `MODELE-LOGIQUE.md`,
  `REFERENCES.md`.

## Ce qui a dérapé

- **Le bouton « Enregistrer la période » rendait ambigu le bouton
  « Enregistrer » des tarifs** : huit échecs de bout en bout aux quatre
  largeurs. Renommé « Appliquer la période », comme « Appliquer ce thème ».

## Preuves

- Vitest complet : 2082 tests, 129 fichiers. Formatage, réactivation libre
  dix jours après, période lue en base, validation : tests neufs ; mutations du
  formatage, de l'annonce sans période et du message de l'écran détectées.
- Bout en bout : paramètres, thèmes, accueil, catalogue rejoués, 274 puis 57
  passés après le renommage ; le test de la période passe aux quatre largeurs.
- Tous les contrôles de `controles.yml`, contrôle à sec des mutations compris.

## Prochaine étape

Mise en production sur accord de Christophe (migration additive, lecture de
`DATABASE_URL` à autoriser), puis LS-291.

## État des tickets

- **LS-319** : rouvert pour l'amendement, clos après la mise en production.
