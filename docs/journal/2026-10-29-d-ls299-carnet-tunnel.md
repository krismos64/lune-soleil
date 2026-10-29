# 29 octobre 2026, nuit : le carnet d'adresses dans le tunnel, LS-299

Demande de la recette : connecté à un compte qui a des adresses enregistrées,
le tunnel obligeait à retaper l'adresse de livraison.

## Fait

- **Étape adresse** : pour une session ouverte, une liste « Adresse
  enregistrée » au-dessus des champs. Un choix remplit les champs, qui restent
  modifiables. L'adresse par défaut est présélectionnée sur un formulaire vide,
  et la saisie déjà enregistrée l'emporte (`etatInitialAdresse`, fonction pure
  de `src/lib/carnet-tunnel.ts`).
- **Aucun identifiant d'adresse ne remonte au serveur** : le choix remplit les
  champs dans le navigateur, et la saisie repasse par `enregistrerAdresse` et sa
  validation comme une frappe. C'est plus strict que le recoupement prévu par
  le parcours 8 : il n'y a rien à usurper.
- **Lecture par la session seule** : `adressesPourLeTunnel(identite.utilisateurId)`
  après `exigerSession`, à l'étape adresse uniquement, réduite aux champs de
  l'étape. Ni nom ni téléphone ne partent vers le navigateur.

**`ls-critical-reviewer`** : aucun défaut. Signalé hors périmètre : le cookie
du tunnel survit à une déconnexion, comportement antérieur.

**`ls-frontend-revue`**, quatre défauts corrigés : la liste annonçait « Saisir
une autre adresse » au retour à l'étape, et restait sur l'adresse choisie après
une retouche ; revenir sur « Saisir une autre adresse » effaçait la frappe
manuelle ; l'option omettait le complément ; le test de débordement ne mesurait
pas le libellé le plus long.

## Preuves

```
npm run test        118 fichiers, 1879 tests verts
npm run test:e2e    2639 passed, 82 skipped
50 scripts de la CI, mutations à sec   OK
```

| Mutation | Détectée par |
| --- | --- |
| carnet de tous les comptes | test négatif d'intégration |
| tous les champs envoyés au navigateur | test de minimisation |
| l'adresse par défaut écrase la saisie | test unitaire |
| liste à sa largeur naturelle | e2e 320 px, 1893 px de débordement |

Retirer la largeur bornée de la liste ne fait rien échouer : la colonne flexible
la borne déjà. La règle reste en protection.

Le test de paiement `paiement-session` a échoué une fois sur la suite complète,
passé trois fois seul puis sur la suite finale : instabilité connue de la base
éphémère partagée, sans rapport avec cette branche.

Déployé `faa953e`, sans migration.

## Prochaine étape

LS-300 (vignette et lien des pièces au récapitulatif), puis LS-298 (message
« email vérifié »).

## État des tickets

- **LS-299** close
