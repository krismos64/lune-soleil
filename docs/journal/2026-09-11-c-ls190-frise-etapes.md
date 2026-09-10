# 11 septembre 2026, c : LS-190, la frise d'étapes

Le reste du critère 4 de LS-180, tracé plutôt que passé sous silence le
5 septembre. Le panneau « Documents et actions » avait été livré, la frise non :
elle supposait un suivi de livraison que rien ne renseignait.

LS-58 puis LS-131 l'ont débloquée, et LS-61 a confirmé la veille que `livreA` est
bien alimenté par la synchronisation horaire.

## Ce que le code sait renseigner, et rien d'autre

Le critère 3 est la story entière : **une étape que le code ne sait pas remplir
est absente**, jamais rendue en attente. Quatre faits existent réellement :

| Étape | Source |
|---|---|
| commande confirmée | `Commande.statut` sorti d'`EN_ATTENTE_PAIEMENT` |
| colis remis au transporteur | `Expedition.expedieA` |
| dernier statut connu | `Expedition.statutTransporteur`, texte libre du transporteur |
| remise constatée | `Expedition.livreA`, ADR-042 |

**Le prototype en montrait davantage**, « colis préparé » et « disponible au
point relais » notamment. Aucun des deux n'a de source : `EN_PREPARATION` est un
statut posé à la main qui ne survit pas à l'expédition, et la disponibilité au
relais vit dans le **texte** du statut transporteur, qu'ADR-042 refuse
d'interpréter.

## La nuance qui justifie le report de cette story

« En attente » affirme que l'étape **viendra**. Sur un colis dont le transporteur
se tait, c'est un suivi figé que le client lit comme un blocage : il attend
devant une frise qui n'avancera pas, et écrit à la boutique.

La fixture de test rend ce cas exactement : son statut transporteur est
« Awaiting customer pickup », un **faux ami** qui annonce un colis disponible au
relais que personne n'a retiré. Une frise naïve y afficherait « remis au
destinataire » en attente, et éteindrait un droit qui n'a pas commencé à courir.

Le test e2e assure `not.toContainText("Remise au destinataire")` sur cette
commande. C'est la seule assertion de la suite qui vérifie une **absence**, et
c'est celle qui porte le critère.

## Trois états non nominaux rendent une frise vide

Une commande **annulée** n'a pas de frise : afficher « confirmée » puis s'arrêter
laisserait croire à une livraison en attente alors que rien ne viendra. Le statut,
affiché juste au-dessus par le récapitulatif, dit déjà ce qui s'est passé.

Une commande **non payée** non plus : elle n'a franchi aucune étape, et une frise
à une seule pastille vide n'apprend rien.

Une **expédition sans suivi** s'arrête à « colis remis au transporteur ». C'est
l'état le plus fréquent des premiers jours.

## Un cas que le type m'a forcé à traiter

Une commande `EXPEDIEE` dont `expedieA` est nul existe : l'exploitante peut saisir
une expédition sans date. **L'étape est vraie, sa date ne l'est pas.** La taire
effacerait un fait, afficher une date inventée en poserait un faux : l'étape se
rend sans sa date.

## Ce qui n'est pas porté par la couleur

La pastille est décorative, `aria-hidden`, et l'état est doublé par un texte
visuellement masqué, « Étape franchie » ou « Étape en cours ». La couleur informe
l'œil, le texte informe le lecteur d'écran, et **aucun des deux ne porte seul le
sens**, règle WCAG 1.4.1.

Une liste **ordonnée** et non une suite de `div` : l'ordre est l'information, et
un lecteur d'écran annonce « 2 sur 3 », ce qu'aucune pastille ne dit.

## La revue frontend a mesuré ce qu'aucun contrôle ne voyait

**Mon trait de liaison ne reliait rien.** Posé sur `:not(:first-child)` avec
`top: -16px` et `height: 16px`, il occupait le seul padding de l'étape
précédente et s'arrêtait au bord supérieur de l'étape courante : **17,4 px de
vide au-dessus, 5,6 px en dessous**, soit trois segments détachés. Il était en
plus décalé de **2 px** à droite de l'axe des pastilles, le calcul ajoutant la
demi-largeur du trait au lieu de la retrancher.

**Le commentaire décrivait un comportement que le code ne produisait pas.** Il
affirmait « il part du haut de l'étape et s'arrête à sa pastille » : ni l'un ni
l'autre n'était vrai.

Rien ne pouvait le voir. Les tests passaient, les contrastes aussi, et aucun
contrôle textuel ne mesure une géométrie. **Le test qui l'attrape mesure
désormais le rendu**, et il est prouvé par deux mutations : le décalage de 2 px
remis, puis la géométrie d'origine remise. Les deux rougissent.

**`statut: string` désarmait `tsc`.** La revue l'a prouvé en remplaçant
`"ANNULEE"` par `"ANULEE"` : le fichier compilait, et une commande annulée aurait
rendu la frise complète, ce que le code déclare interdire. Le type vient
désormais de l'enum Prisma, et la même mutation échoue maintenant à la
compilation.

**Un commentaire donnait une raison fausse.** Il justifiait l'exclusion d'une
commande non payée par « une frise à une seule pastille n'apprend rien », alors
qu'une commande confirmée sans expédition en rend légitimement une. La vraie
raison est qu'aucune étape n'est franchie. Un commentaire inexact est ce qui
produit les franchissements de bonne foi de ce dépôt.

**Un sélecteur de test ne ciblait pas la frise.** `section ol li` comptait tous
les `li` de tous les `ol` de la page : il passait par chance, aucun autre `ol`
n'existant sur cet écran.

## Vérifications

```
npm run type-check                    vert
npm run lint                          vert
npm run format:check                  vert
npm run test                          92 fichiers, 1477 tests
vitest frise-etapes (unitaire)        8 tests
playwright compte-commandes frise     22 tests, les quatre largeurs
mutations de la géométrie du trait    2 cas, 2 détectés
mutation du typage de statut          1 cas, détecté par tsc
verifier-contraste.sh                 toutes paires conformes
verifier-bordure-controle.sh          seuil 3:1 tenu
verifier-lien-evitement.sh            conforme
verifier-loading-et-404.sh            conforme
verifier-ponctuation-chargement.sh    conforme
verifier-navigation-client.sh         conforme
verifier-description-accessible.sh    conforme
verifier-regles.sh                    règles conformes au schéma
```

## État des tickets

**LS-190 développée**, epic LS-36. Les sept critères sont remplis : le panneau
l'était depuis le 7 septembre, la frise l'est désormais, avec ses états non
nominaux et sa mesure aux quatre largeurs.

## Prochaine étape

**LS-109**, la reprise d'un média bloqué en `EN_ATTENTE`, ou **LS-165**, le
contrôle d'atteignabilité des écrans de la boutique.
