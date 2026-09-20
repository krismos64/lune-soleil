# 20 septembre 2026, la page que seule l'exploitante pouvait écrire

Troisième session du jour. Christophe et l'exploitante ont voulu attaquer LS-25,
les contenus de marque. Les textes ont été récoltés auprès d'elle, la page écrite
avec, et **elle l'a validée**.

## Ce que la page débloque

**Trois liens y menaient et rendaient 404**, vérifié en production : deux depuis
l'accueil, un au pied de page. Le commentaire de `/aide` disait pourquoi elle
n'existait pas :

> `/notre-univers` porte au contraire l'histoire de la marque et les matières,
> que seule l'exploitante détient, LS-25 : l'écrire reviendrait à inventer.

## Ce que l'exploitante a dit, et ce que ça a changé

**Elle exerce seule.** Sa sœur n'est pas déclarée dans l'entreprise, et elle
demande que son prénom reste hors du site. Tout le cadrage parlait des « deux
créatrices », y compris LS-25. Le récit est donc à la première personne du
singulier, et `frontend-design.md` gagne l'interdit du pluriel et du prénom.

**Elle modèle la pâte elle-même.** Le mot « modelé » était interdit depuis le
3 septembre, un générateur l'ayant inventé sans confirmation. L'interdit portait
sur l'origine du mot, jamais sur un démenti : il tombe.

**Elle ne connaît pas la nuance de son acier.** « 316L » n'est donc pas écrit, et
un test l'empêche de revenir.

## Les trois défauts que seule la mesure a trouvés

### La justification écartelait les mots à 320 px

Christophe l'avait demandée contre mon avis, arbitrage tracé. Le rendu mobile l'a
invalidée : en colonne de 288 px, même avec la césure, les espaces s'ouvrent deux
à trois fois trop larges. « la question sui-vante était toujours la même :
est-ce que je pouvais en faire pour elles » écartelait ses mots sur trois lignes.

Elle s'arrête sous 768 px. Mesuré aux quatre largeurs après correction.

**Les 44 tests ne pouvaient pas l'attraper** : ils gardent l'absence de
débordement et les violations `axe-core`, pas l'harmonie d'un espacement.

### Une animation passait sous le seuil AA

`axe-core` a mesuré **3,47:1** sur `#8c837d`, couleur qui n'est aucun jeton du
projet : c'est `--ls-text` composé avec le fond à mi-parcours d'une animation
d'opacité.

Ce n'était pas un artefact de mesure. Pendant toute la transition, le texte était
réellement sous le seuil. Le déplacement seul l'a remplacée.

### Le jeton atténué tombe à 4,35:1 sur sable

Motif C31, et il a mordu **deux fois** dans la même session : la légende de la
photo d'atelier, puis celle de la citation. Les deux vivent dans « Mon
histoire », section peinte en sable en cours de route. J'avais repris le 4,86:1
annoncé à côté du jeton, qui ne vaut que pour le fond crème.

## Le GPS n'était pas un risque théorique

Cinq photographies sont arrivées d'abord, toutes avec du XMP. La sixième,
`nettoyage.png`, portait en plus un bloc **GPS**.

Ce dossier ne passe pas par la chaîne d'ADR-007 : le retrait n'y est pas
automatique, il est à la charge de qui ajoute l'image. Sans la conversion, la
position du domicile de l'exploitante aurait été servie publiquement.

Le README de l'habillage porte désormais cette mesure plutôt qu'un avertissement
général.

## Le design, et ce que le skill a dit de mon propre travail

Le rendu a été refusé deux fois par l'exploitante avant d'être validé. Le skill
`frontend-design`, chargé à la demande de Christophe, nomme trois marqueurs de
page engendrée :

```
content chopped into identical rounded cards
fade-and-slide-up entrances on each section
hover transitions on every card
```

**Ma version portait les trois.** Six sections au même poids, chacune animée,
chaque carte réagissant au survol.

La correction a suivi sa règle : dépenser l'audace à un seul endroit. La section
matières est devenue une bande bronze pleine largeur, seule zone sombre, et le
reste s'est tu. L'animation ne subsiste que sur son entrée.

**La palette et la police n'ont pas bougé.** Elles viennent d'ADR-022, dérivé
d'une analyse colorimétrique du logo réel, et de la règle C43. Le skill dit
lui-même que le brief prime.

## Une exemption retirée en clôturant

`verifier-atteignabilite-boutique.sh` exemptait `/notre-univers` depuis LS-122 :
la page n'existait pas, sept liens la désignaient, le contrôle les comptait.

**La page livrée, l'exemption ne protégeait plus rien** : elle aurait laissé ces
sept liens hors du contrôle. Retirée, et prouvée par mutation, sans quoi je
n'aurais fait que supprimer un garde-fou.

```
href vers /notre-univers-inexistant  ->  1 anomalie, code 1
restauration                          ->  aucune anomalie, code 0
```

Le contrôle juge 20 liens au lieu de 19.

## Preuves

```
1704 tests unitaires, 105 fichiers     verts
44 tests de bout en bout, 4 largeurs   verts
type-check, lint, verifier-regles.sh   verts
redaction francaise, graphie marque    conformes
```

Rendu contrôlé à l'écran à 320 px et 1280 px à chaque étape.

## Ce qui reste

**LS-25 n'est pas close.** Les textes sont livrés, mais le ticket porte aussi les
fiches produits de LS-24 et le lot de photographies de LS-23. Une seule référence
existe au catalogue.

**LS-123 ferme son critère 1** : plus aucun lien mort au pied de page. L'ancre
`#accessibilite` reste rattachée à LS-140.

**LS-236 est ouvert** : un bandeau de réassurance, relevé en comparant la page à
celle d'un concurrent du même bassin, Les Paulinas à Pau. Les six éléments sont
déjà arrêtés dans `frontend-design.md`, avec deux pièges nommés dans le ticket.

**Le visuel de hero de l'accueil reste à remplacer** avant l'ouverture
commerciale. Il montre des pièces qui n'ont jamais existé.
