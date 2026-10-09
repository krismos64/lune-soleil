# ADR-047 : photos portées générées, exception à la règle des images Codex

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 9 octobre 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | ADR-045 et ADR-046 (images Codex « sans bijou ni texte », « aucune personne »), règle de l'epic LS-22 (« aucun contenu fictif présenté comme réel ») |
| Ticket | LS-23 |

## Contexte

Le dépôt admet les images générées par Codex **en habillage seulement**, et
sous deux conditions répétées par ADR-045, ADR-046 et
`public/habillage/README.md` : **aucun bijou, aucun texte, aucune personne**.
L'epic LS-22 interdit tout contenu fictif présenté comme réel ; le hero généré
du 19 août 2026, qui montrait des pièces absentes du catalogue, a été retiré
pour ce motif (LS-23, LS-260).

Le 9 octobre 2026, à la demande de Christophe, une seconde photographie
« portée » a été ajoutée par l'administration à 44 pièces de boucles
d'oreilles. Elle montre la boucle sur une oreille de profil, fond blanc, visage
hors champ, pour donner l'échelle du bijou que la photo produit seule ne donne
pas. L'oreille est générée ; le bijou est reproduit d'après la photo produit
réelle. Ces images contredisent les deux conditions ci-dessus. L'écart n'a été
relevé qu'après l'insertion, journal `2026-10-09-a`.

Christophe tranche le 9 octobre 2026 : l'exception est actée plutôt que les
photos retirées.

## Décision

**Une photo portée générée est admise comme photo complémentaire d'une fiche de
boucles d'oreilles**, aux six conditions suivantes, toutes cumulatives :

1. **jamais en première position** : la photo principale, celle du catalogue et
   du partage, reste une photographie réelle de la pièce ;
2. **le bijou est reproduit d'après la photo produit réelle** de la même fiche,
   jamais inventé ni retouché pour l'embellir ;
3. **relue contre l'original avant publication**, sur planche côte à côte :
   forme, couleurs, motif, paillettes et attache identiques, sinon écartée ;
4. **aucun visage** : ni œil, ni nez, ni bouche ; aucun texte, aucun logo ;
5. **texte alternatif descriptif finissant par « Photo d'illustration. »**,
   200 caractères au plus ;
6. **téléversée par l'administration**, donc soumise au traitement d'ADR-007
   qui retire toute métadonnée.

L'exception ne s'étend ni aux autres catégories, ni à l'habillage, ni à la
photo principale. Le procédé est outillé par un skill personnel de Christophe,
hors dépôt (`lune-soleil-photos-portees`).

**Aucune mention visible à l'écran n'est ajoutée par cette décision** : la
mention « Photo d'illustration » vit dans le texte alternatif. Ce point est
nommé en risque ci-dessous.

## Alternatives écartées

**Retirer les 44 photos.** Respecte la règle d'origine, mais rend à l'acheteur
une fiche sans repère d'échelle sur 44 pièces sur 50, alors que la taille d'une
boucle d'oreille est la question la plus difficile à trancher sur une photo de
produit posée. Écartée par Christophe.

**Garder les photos avec une mention visible sur la fiche.** Transparence la
plus nette, mais demande une story, une modification de la galerie et un
modèle de données qui distingue une photo générée d'une photo réelle, champ
absent du schéma au 9 octobre 2026. Non retenue à ce jour ; reste la voie de
correction si le risque juridique se confirme.

**Photographier réellement chaque pièce portée.** La solution sans écart, mais
elle suppose un modèle et une séance de prise de vue que l'exploitante n'a pas
programmés. Reste préférable quand elle devient possible : une photo réelle
remplace alors la photo générée.

## Conséquences

- ADR-045 et ADR-046 gardent leur règle pour l'habillage : **aucun bijou,
  aucune personne** dans une image générée de décor. L'exception ne vaut que
  pour la photo portée complémentaire d'une fiche.
- La règle de LS-22 reste entière pour tout le reste : aucune pièce inventée,
  aucun avis, aucun visuel de pièce absente du catalogue.
- Une image générée PNG d'OpenAI porte un manifeste C2PA que le contrôle de
  signature de `traitement.ts` prend pour un SVG ; elle doit être réencodée sans
  métadonnée avant téléversement. Faux positif relevé le 9 octobre 2026.
- `.claude/rules/frontend-design.md` renvoie à cet ADR dans la règle du contenu
  d'une fiche.

## Risques

**Pratique commerciale trompeuse.** Une image générée qui laisserait croire à
un rendu différent du bijou réel tromperait l'acheteur sur une caractéristique
essentielle. Atténué par les conditions 2 et 3, et par la condition 1 qui garde
une photo réelle en tête de chaque fiche. **Cet ADR ne décide d'aucune
obligation légale** : l'exigence éventuelle d'une mention visible (Code de la
consommation, article 50 du règlement européen sur l'IA) se vérifie aux sources
officielles. Si elle se confirme, la mention visible écartée ci-dessus devient
obligatoire.

**Mention invisible.** Le texte alternatif n'est lu que par un lecteur d'écran
ou un moteur de recherche ; un acheteur voyant ne sait pas que l'oreille est
générée. C'est le prix accepté de cette décision.

**Dérive du procédé.** Une photo générée publiée sans relecture, ou en première
position, sortirait de l'exception. La condition 1 se contrôle sur une fiche
en lisant l'ordre des médias dans l'administration.
