# 1er novembre 2026 : photos portées des bagues, ADR-048, LS-303

Demande de Christophe : une photo portée sur une main de femme pour chaque
bague, générée par Codex comme les boucles d'oreilles du 9 octobre, **placée
en première photo**.

## Fait

- Relevé sur le site public : 5 bagues publiées, chacune avec **deux**
  photographies réelles (dessus de la pièce, dos avec l'anneau réglable).
- 5 photos portées générées par Codex à partir des deux photos réelles de
  chaque fiche, sans image de style. Planche relue : forme, couleurs,
  paillettes, visage du Chamallow et anneau fidèles, taille vraisemblable,
  aucun visage ni autre bijou. Aucune image écartée.
- Finalisées par le `finaliser.mts` du skill : `{"retenus":5,"refus":0}`, le
  réencodage retire le manifeste C2PA et chaque fichier passe
  `traiterPhotographie`.
- Écart signalé avant d'écrire : ADR-047 limite l'exception aux boucles
  d'oreilles et interdit la première position, qui est la vignette du
  catalogue (C9) et l'image Open Graph de la fiche. Trois options présentées,
  Christophe retient la première position sans mention visible.
- **ADR-048** écrit, ADR-047 marqué amendé, `REFERENCES.md` et
  `frontend-design.md` à jour.

## Dérives

- Le skill `lune-soleil-photos-portees` ne connaît que les boucles
  d'oreilles : catégorie, une seule photo attendue, une seule référence. La
  variante bagues a tourné depuis le scratchpad de la session (prompt et
  script à deux références), pas encore intégrée au skill.

## Prochaine étape

- Insertion des 5 photos par l'admin, **après accord explicite de
  Christophe** nommant les gestes : téléverser, écrire la description,
  monter la photo en première position. Contrôle après coup : 3 médias
  distincts par fiche publique, la photo portée en tête.
- Intégrer la variante bagues au skill.
- Issue **#612**, contrôle nocturne en échec du 31 octobre, non traitée dans
  cette session.

## État des tickets

- **LS-303** en cours : critère 1 (ADR) fusionné avec cette PR, critère 2
  (images relues) rempli, critères 3 et 4 (insertion, vérification publique)
  en attente.
