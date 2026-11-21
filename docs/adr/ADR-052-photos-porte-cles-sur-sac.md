# ADR-052 : photos générées des porte-clés, accrochés à un sac à main

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 21 novembre 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | ADR-047 (catégorie limitée aux boucles d'oreilles), ADR-048 (« l'exception ne s'étend à aucune autre catégorie ») |
| Ticket | LS-332 |

## Contexte

ADR-047 admet une photo portée générée par Codex en photo complémentaire d'une
fiche de boucles d'oreilles, ADR-048 l'étend aux bagues, et tous deux ferment
la porte aux autres catégories : la règle des images Codex d'ADR-045 reste
« aucun bijou, aucune personne ».

Le 21 novembre 2026, deux porte-clés sont publiés, « Flocon Gourmand » et
« Douce Fantaisie », avec leur seule photo produit sur fond blanc. Christophe
demande pour chacun « une image sur un sac à main féminin et joli ». Un
porte-clés à pompon se juge à l'usage : sa taille et son allure une fois
accroché à un sac, que la photo à plat ne montre pas.

## Décision

**Une photo générée est admise sur une fiche de porte-clés, montrant la pièce
accrochée à l'anse d'un sac à main**, en **photo complémentaire**, jamais en
première position. Elle suit les conditions 2 à 6 d'ADR-047 (pièce reproduite
d'après la photo réelle, relue sur planche, aucun visage ni texte ni logo,
texte alternatif finissant par « Photo d'illustration. », téléversement par
l'administration), et trois conditions propres :

1. **aucune personne ni main** : le sac porte seul la mise en situation ;
2. **le sac ne porte aucune marque, logo ni monogramme**, pour ne suggérer ni
   un partenariat ni un article de maison connue ;
3. **la pièce est nette et entière**, pompon compris, à une taille
   vraisemblable par rapport au sac.

La première photo reste la photographie réelle, donc la vignette du catalogue
et l'image de partage (C9). Les autres catégories restent fermées.

## Alternatives écartées

**Photo générée en première position**, comme les bagues d'ADR-048. Non
demandée ; la photographie réelle en tête garde la vignette et l'image de
partage fidèles, ce qui rend la mention invisible acceptable, raisonnement
d'ADR-047.

**Porte-clés tenu en main.** Une main générée ajoute une personne là où le sac
suffit à donner l'échelle.

**Aucune image.** Respecte ADR-047 et ADR-048 tels quels, écartée par la
demande de Christophe.

## Conséquences

- Le sac est entièrement généré : l'image dit « Photo d'illustration. » dans
  son texte alternatif, rien à l'écran, comme pour les boucles d'oreilles.
  L'obligation d'une mention visible n'est pas tranchée ici et se vérifie aux
  sources.
- `.claude/rules/frontend-design.md` renvoie à cet ADR dans la règle du
  contenu d'une fiche ; `docs/REFERENCES.md` le porte dans sa table.
- Le skill personnel `lune-soleil-photos-portees`, hors dépôt, outille la
  génération et la planche.
