# 10 novembre 2026 : commandes non rattachées dans l'administration, LS-317

## Demande

Christophe : un client à la commande validée affiche 0 commande et 0 € dans la
fiche client, et rien ne dit s'il a commandé avec ou sans compte. Consigne : au
plus vite, sans tests jugés nécessaires.

## Diagnostic

Compte créé à 14:50 UTC, adresse jamais confirmée ; trois commandes sur la même
adresse (C-2026-0002 et 0003 annulées, 0005 expédiée), aucune rattachée. C'est la
règle du parcours 6 : le rattachement exige une adresse vérifiée. Le défaut est
dans l'affichage. Les commandes apparaîtront au compte dès que le client
confirmera son adresse.

## Fait

- Fiche client : liste des commandes passées avec l'adresse et non rattachées,
  liens vers chacune, raison dite (adresse non confirmée, ou rattachement à la
  prochaine connexion). Les commandes dissociées n'y figurent jamais.
- Fiche commande : état du lien au compte en cinq cas, rattachée, compte
  confirmé, compte non confirmé, sans compte, compte supprimé, avec un lien vers
  la fiche client.
- Montant commandé hors commandes annulées, arbitrage de Christophe.

**Tests réduits, écart assumé à la consigne de Christophe** : `CLAUDE.md` exige
des tests au vert et le ticket touche des données personnelles. Quatre cas
d'intégration, aucun nouveau test de bout en bout, aucune preuve par mutation.
Suites d'intégration (1111) et de bout en bout de l'administration (140) vertes.

## Ce qui a dérapé

Les comptes créés par les nouveaux cas de `administration-commandes`
survivaient au fichier, qui ne vide pas `utilisateur`, et faisaient échouer le
premier test de la fiche client. Nettoyés par un `afterEach` dédié.

## Mise en production, 11 novembre 2026

- **Incident** : la première fusion de la PR #655 a été refusée, branche en
  retard sur `main` après la PR #654, et le refus n'a pas été lu. Le
  déploiement est parti sur l'ancien `main`, `580e146`, qui ne différait de la
  production que par un journal : sans effet. Branche rebasée, CI repassée,
  **fusion vérifiée par `gh pr view --json state`** avant le second déploiement.
- Déploiement run 42919887929, image `901f0bf…`, aucune erreur, pages en 200.

## Prochaine étape

LS-291.

## État des tickets

- **LS-317** : Terminé, en production.
