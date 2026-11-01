# ADR-048 : photos portées générées des bagues, en première position

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 1er novembre 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | ADR-047 (catégorie limitée aux boucles d'oreilles, condition 1 « jamais en première position ») |
| Ticket | LS-303 |

## Contexte

ADR-047 admet une photo portée générée par Codex comme photo complémentaire
d'une fiche de **boucles d'oreilles** seulement, et jamais en première
position. Il écrit que l'exception « ne s'étend ni aux autres catégories, ni à
l'habillage, ni à la photo principale ».

Le 1er novembre 2026, Christophe demande une photo portée pour chaque bague du
catalogue : la bague à l'annulaire d'une main de femme, fond blanc, aucun autre
bijou. Il la veut **en première photo**, devant les deux photographies réelles
que portent les fiches de bagues (le dessus de la pièce et le dos avec l'anneau
réglable). Une bague posée sur un fond ne dit ni sa taille ni son allure une
fois portée ; une main la montre au premier coup d'œil.

La première photo d'une fiche n'est pas une photo parmi d'autres. Par C9, elle
est la **vignette du catalogue**, et `src/app/(boutique)/produit/[slug]/page.tsx`
en fait l'**image Open Graph** de la fiche, donc celle d'un partage. ADR-047
avait accepté une mention « Photo d'illustration » invisible à l'écran
justement parce qu'une photographie réelle restait en tête.

Christophe a été informé de cet écart et tranche le 1er novembre 2026 pour la
première position sans mention visible, l'une des trois options qui lui
étaient présentées.

## Décision

**Une photo portée générée est admise sur une fiche de bague, et elle peut y
occuper la première position.** Elle reste soumise aux conditions 2 à 6
d'ADR-047 (bijou reproduit d'après les photos réelles de la fiche, relu sur
planche, aucun visage ni texte ni logo, texte alternatif finissant par
« Photo d'illustration. », téléversement par l'administration), et à deux
conditions propres aux bagues :

1. **les photographies réelles de la pièce restent sur la fiche**, aucune
   n'est retirée ni remplacée par la photo générée ;
2. **la taille de la pièce sur le doigt est vraisemblable** par rapport aux
   photos réelles, contrôlée sur la même planche.

Pour les boucles d'oreilles, ADR-047 reste entier : photo portée jamais en
première position. L'exception ne s'étend à aucune autre catégorie.

## Alternatives écartées

**Photo portée en deuxième position.** Conforme à ADR-047 étendu aux bagues,
visible dès l'ouverture de la galerie, sans être la vignette. Recommandée,
écartée par Christophe : la vignette est ce qui fait ouvrir la fiche.

**Photo portée en première position avec une mention visible.** La voie la
plus transparente, déjà écartée par ADR-047 pour la même raison : elle demande
une story, un champ qui distingue un média généré d'une photographie réelle, et
l'affichage dans la galerie et la grille. Elle reste la voie de correction si
le risque juridique se confirme.

**Aucune photo portée sur les bagues.** Respecte ADR-047 tel quel, mais laisse
l'acheteur sans repère d'échelle sur une pièce dont la taille est le premier
critère. Écartée par la demande de Christophe.

## Conséquences

- Sur une fiche de bague, la vignette du catalogue et l'image de partage
  peuvent être une image générée. Le texte alternatif le dit, l'écran non.
- La photo est téléversée par l'administration, qui la place au dernier rang,
  puis remontée au premier par le bouton « Monter » (C9). Revenir en arrière
  tient en un geste du même écran, sans perte : les photographies réelles sont
  toujours là.
- `.claude/rules/frontend-design.md` renvoie à cet ADR dans la règle du
  contenu d'une fiche ; `docs/REFERENCES.md` le porte dans sa table.
- Le skill personnel `lune-soleil-photos-portees`, hors dépôt, outille la
  génération et la planche.

## Risques

**Pratique commerciale trompeuse, plus exposée qu'avec ADR-047.** L'acheteur
qui choisit une bague dans la grille la choisit sur une image générée. Atténué
par les conditions 2 et 3 d'ADR-047, qui exigent le bijou identique à la pièce
réelle, et par la condition 1 propre aux bagues, qui garde les photographies
réelles sur la fiche. **Cet ADR ne décide d'aucune obligation légale** :
l'exigence éventuelle d'une mention visible (Code de la consommation,
article 50 du règlement européen sur l'IA) se vérifie aux sources officielles.
Si elle se confirme, la mention visible écartée ci-dessus devient obligatoire.

**Image de partage générée.** Un aperçu sur un réseau social ou une messagerie
montre la main générée sans texte alternatif ni fiche autour. Accepté avec la
décision.

**Dérive vers les autres catégories.** Une photo portée générée en tête d'une
fiche de boucles d'oreilles, de collier ou de bracelet sortirait de toute
exception. Se contrôle dans l'administration en lisant l'ordre des médias.
