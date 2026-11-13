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

## Mise en production, même jour

- PR #667 fusionnée, `main` à `8fe66c2`.
- **Migration** `20261113120000_periode_promotion`, additive, sur autorisation
  ponctuelle de Christophe : 31 puis 32 migrations, période relue au 23 et au
  29 novembre 2026, thème `NOEL_2` inchangé, sauvegarde conservée, relais et
  tunnel fermés.
- **Constaté en production** : une promotion `BLACK_WEEK` activée à 7 h 05
  (heure de Paris) par un compte administratrice, désactivée 47 secondes plus
  tard, aucune ligne de commande sous promotion. Un essai. Sous le code alors
  en service, il aurait bloqué toute réactivation à partir du 14 novembre
  7 h 05 pour trente jours, Black Week comprise : l'amendement le lève.
- **Déploiement** run 43381578871 : `f55754c` vers `8fe66c2`, conteneur sain en
  10 s, pages en 200, aucune annonce servie, aucune promotion active.

## Prochaine étape

LS-291.

## État des tickets

- **LS-319** : Terminé, amendement en production.

## Relecture finale, même jour

Production vérifiée à `8fe66c2`, `/api/sante` opérationnel. Trois textes
périmés par l'amendement corrigés : le commentaire de `activerPromotion` et
celui de `choix-promotion.tsx` décrivaient encore la carence et une période
écrite dans le code, et `docs/ETAT.md` citait `f55754c`. CLAUDE.md, README,
agents, skills, hooks et mémoire relus sans écart ; `verifier-config-claude.sh`
et `verifier-regles.sh` au vert. Jira : LS-318 et LS-319 terminées, LS-320 et
LS-291 à faire.
