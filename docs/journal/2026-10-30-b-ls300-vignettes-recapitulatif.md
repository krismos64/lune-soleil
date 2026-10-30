# 30 octobre 2026 : vignette et lien de chaque pièce au récapitulatif, LS-300

Demande de la recette du 29 octobre : au récapitulatif, l'étape « Vos pièces »
ne montrait que du texte, et le client ne pouvait pas vérifier qu'il ne
s'était pas trompé d'article.

## Fait

- **Vignette de 56 px** par ligne, déclinaison `320.jpeg` existante (ADR-007),
  texte alternatif du média ; une case sable `aria-hidden` sans photo.
- **Le nom devient un lien vers la fiche, dans le même onglet** : l'étape vit
  dans l'URL et la saisie dans le cookie du tunnel, donc le retour du
  navigateur rend le récapitulatif intact. Un nouvel onglet aurait dû être
  annoncé et ouvrait un second tunnel sur le même panier.
- **Aucun lien vers une fiche absente** : `ficheAtteignable`, calculé par le
  service sur le statut `ACTIF` du produit (`produitPublie` lu par le dépôt).
  Une variante introuvable ou un produit archivé ou en brouillon rend le nom
  en texte simple ; une variante archivée d'un produit en vente garde son lien.
- Libellé sous le nom, comme au panier ; contour de focus global.

**`ls-frontend-revue`**, trois défauts corrigés dans la story : le lien menait
à une 404 sur une ligne indisponible ; « , libellé » passait à la ligne derrière
une virgule dès que le nom en prenait deux, le cas courant à 320 px ; le
contour de focus local faisait 2 px contre 3 au global.

## Preuves

```
npm run test        118 fichiers, 1883 tests verts
playwright          tunnel-commande, tunnel-carnet-ls299, panier,
                    mentions-retractation : 156 passed
```

| Mutation | Détectée par |
| --- | --- |
| alt ignoré, photo jamais rendue | e2e |
| lien vers la mauvaise fiche, nouvel onglet | e2e |
| zone tactile retirée, jamais de lien | e2e |
| fiche suivant `vendable`, toujours atteignable | intégration |
| variante introuvable atteignable, requête sans statut | intégration |

Deux formes ne font rien échouer, assumé : la largeur de vignette retirée
(`img { max-width: 100% }` de `globals.css` la borne déjà, règle gardée en
protection, même cas que la liste de LS-299) ; un lien posé sur toutes les
lignes en ignorant le drapeau, une ligne indisponible en bout en bout
exigeant un panier signé avec le secret de l'application.

Un premier essai de mutation par `false ? (` n'était pas un verdict : la
condition constante faisait échouer le build avant le test.

Déployé `c2fc672`, sans migration, `/api/sante` 200.

## Prochaine étape

LS-298 (message « email vérifié »), dernière demande de la recette.

## État des tickets

- **LS-300** close
