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

- **Insertion par l'admin** après l'accord explicite de Christophe, qui
  nommait les trois gestes : 5 photos téléversées, description enregistrée,
  deux clics « Monter » chacune. Photos réelles conservées aux rangs 2 et 3.

## Preuves

```
fiche publique        médias  og:image = 1er média  description
bague-chamallow-pop   3       oui                   présente
bague-stella-pop      3       oui                   présente
bague-citrus-pop      3       oui                   présente
bague-petale-disco    3       oui                   présente
bague-pop-acidulee    3       oui                   présente
```

Première image servie téléchargée et relue à l'œil pour les cinq : la main
portant la bague.

## Dérives

- Le skill `lune-soleil-photos-portees` ne connaissait que les boucles
  d'oreilles (filtre de catégorie, une seule photo attendue, une seule
  référence). Variante bagues intégrée en fin de session : `prompt-bagues.md`,
  `generer-bague.sh` et une section du `SKILL.md`, hors dépôt.
- Sur Candy Bloom, la `ref` du champ fichier valait `ref_172` et non
  `ref_182` : `file_upload` a refusé sans rien envoyer, photos recomptées à 2
  avant la relance. Cas déjà décrit par le skill.

## Prochaine étape

- Issue **#612**, contrôle nocturne en échec du 31 octobre, non traitée dans
  cette session : à regarder en premier.
- Backlog inchangé par rapport au journal `2026-10-30-d`.

## État des tickets

- **LS-303** close, PR #613 ; comptes Jira à 284 sur 293.
