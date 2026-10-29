# 29 octobre 2026, soir : facture « Lune-soleil » et dénomination EI, LS-297

Demande de la recette : l'exploitante ne voulait pas son nom en titre de
facture. Christophe a arbitré la marque en titre et le nom en petit avec
« EI », seulement là où la loi l'exige.

## Fait

**Vérifié aux sources** : article R526-27 du Code de commerce et fiche F31808
de service-public.fr. Le nom de l'entrepreneur suivi de « EI » est obligatoire
sur les documents professionnels. **F-2026-0001 ne portait pas « EI »**, et
elle ne se modifie pas, invariant 4.

- **Instantané légal en version 2** : l'émetteur fige `nomCommercial`
  (`NOM_BOUTIQUE`, « Lune-soleil ») et `denomination` (« Nom EI ») à
  l'émission. La lecture accepte les versions 1 et 2 par une union discriminée,
  l'écriture n'emploie que la version 2.
- **Gabarit PDF** : la version choisit le rendu, jamais la date. F-2026-0001 se
  réimprime telle qu'émise. Le titre a sa propre hauteur de ligne : il héritait
  13,5 points pour un texte de 16, d'où le chevauchement sur l'adresse.
- **Avoir** toujours en version 2, identité recopiée de sa facture.
- **`/informations-legales`** : nom commercial et dénomination EI, constatés en
  production.
- **`FACTURE_RAISON_SOCIALE` porte le nom seul** : toute mention EI y est
  refusée, et le site l'ajoute toujours. Défaut relevé par
  `ls-critical-reviewer` : la première version ne cherchait la mention qu'en
  fin de nom, « EI Marie Dupont » devenait « EI Marie Dupont EI ». La valeur de
  production a été testée dans le conteneur avant déploiement, sans affichage.

**Graphie** : « Lune-soleil », celle du logo et d'ADR-022, gardée par
`verifier-graphie-marque.sh`. Christophe avait écrit « Lune-Soleil » ; une
majuscule serait un changement de marque global.

## Preuves

```
npm run test        117 fichiers, 1867 tests verts
npm run test:e2e    2619 passed, 82 skipped
50 scripts de la CI, mutations à sec   OK
```

Mutations détectées : mention EI retirée (4 tests), rendu v1 forcé (1), refus
de configuration retiré (7). Rendus PDF v1 et v2 relus à l'œil.

Déployé `ae6a323`, PR #600, sans migration.

## Prochaine étape

LS-299 (adresse du carnet dans le tunnel), LS-300 (vignette et lien au
récapitulatif), LS-298 (message « email vérifié »). La première facture émise
désormais sera au nouveau format.

## État des tickets

- **LS-297** close
