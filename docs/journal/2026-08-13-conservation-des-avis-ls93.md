# 13 août 2026, la conservation des avis et une référence périmée depuis deux ans

Troisième session du 13 août, après la porte de sortie de la phase 1 et le
branchement des actions sensibles. LS-93 était la dernière dette du registre des
traitements.

## Le ticket décrivait mal le problème

LS-93 présentait les trois ans de conservation des avis comme un chiffre sans
source, à motiver par un ADR. En vérifiant, c'était autre chose : **une
contradiction entre deux documents du dépôt**, que personne n'avait remarquée.

| Document | Date | Ce qu'il disait |
|---|---|---|
| `MODELE-CONCEPTUEL.md`, décision I | 28 juillet, LS-37 | « le délai de conservation est indéfini, et c'est un choix, pas un oubli », motivé, avec l'alternative écartée |
| `REGISTRE-DES-TRAITEMENTS.md`, T7 | 12 août, LS-90 | « trois ans après publication, durée retenue par ADR non encore rédigé » |

Le registre a contredit un arbitrage déjà rendu, **en s'annonçant lui-même comme
provisoire**. Le plus récent l'emporte d'ordinaire ; ici le plus ancien portait la
motivation et l'arbitrage explicite, et le plus récent se déclarait en attente.

L'écart a été signalé à Christophe plutôt que résolu en silence, et l'arbitrage
est allé à la décision du 28 juillet. ADR-028 la confirme et corrige le registre.

## D'où venaient les trois ans

D'un rapprochement fautif avec le **référentiel CNIL n° 2021-131**, vérifié à la
source : ses trois ans visent les **prospects non clients** et l'après-relation
commerciale, jamais un avis publié. Le référentiel cite bien « la gestion des avis
des personnes sur des produits, services ou contenus » parmi les finalités
couvertes, sans lui attacher de durée.

C'est le motif de LS-94 sur `RateLimit` : un référentiel invoqué pour une finalité
qui n'est pas la sienne. Deux fois en deux jours.

## Ce que la vérification a trouvé en plus

**L'article D111-17 n'existe plus depuis le 9 juillet 2024.** Le décret
n° 2024-753 du 7 juillet 2024, article 1er 3°, dispose que « les articles
D. 111-16, D. 111-17, D. 111-18 et D. 111-19 deviennent respectivement les
articles D. 111-9, D. 111-10, D. 111-11 et D. 111-12 ». Contenu identique, seule
la numérotation change.

Le dépôt citait l'ancien numéro à **onze endroits hors journaux** : `schema.prisma`,
`MODELE-CONCEPTUEL.md` et `PARCOURS.md`. Corrigés, avec « ex-D111-17 » gardé dans
le schéma pour que la référence historique se retrouve. **Les journaux ne sont pas
touchés** : ils disaient vrai à leur date, les corriger réécrirait l'histoire.

Aucune migration : un commentaire `//` de Prisma ne va pas en base, et
`schema.sql` ne cite aucun article.

## Ce que la loi impose, et qui change la nature de la décision

Aucun texte ne fixe de durée pour un avis publié. **L'article D111-10, 2° b),
impose en revanche d'annoncer celle qu'on retient**, dans une rubrique
spécifique facilement accessible, avec le délai de publication.

La durée n'est donc pas un paramètre interne : elle engage vis-à-vis des
acheteurs. « Sans limite de durée » est recevable et **doit être publié** ; une
rubrique muette sur la conservation serait le manquement que l'article vise. La
formulation à reprendre est dans l'ADR, pour la story qui écrira ces pages.

## La décision, et pourquoi elle ne coûte aucun code

Un avis publié est conservé sans limite de durée, tant qu'il reste publié. Il ne
quitte l'affichage que par une décision de modération motivée.

Trois raisons ont pesé, au-delà de la confirmation d'un arbitrage existant :

- **le catalogue est fait de pièces uniques**, un avis y est souvent le seul
  témoignage existant sur un article, et une purge détruirait une information qui
  ne se reconstitue pas
- **la donnée reste nécessaire à sa finalité** tant que l'avis est publié, ce qui
  est le critère de l'article 5.1.e. Raisonnement inverse de `RateLimit`, dont la
  finalité s'épuisait en soixante secondes
- **le droit d'effacement est le vrai contrepoids**, exerçable à tout moment sans
  attendre d'échéance

`Avis.ligneCommandeId` est en `onDelete: Restrict` sur une ligne conservée dix
ans : une purge aurait dû trancher ce conflit, pour un gain de minimisation que le
volume rend négligeable.

**Conséquence notable : la story d'implémentation que LS-93 annonçait « hors
périmètre » n'a pas lieu d'être créée.**

## Le contrôle qui aurait vu la contradiction

`verifier-registre-traitements.sh` vérifiait le rangement des tables et quatre
mentions. Il ne vérifiait **aucune propriété des durées**, et le disait : la
justesse d'une durée est une question de droit.

Deux propriétés manquaient pourtant, toutes deux mécaniques, ajoutées en sens 4 :

1. **chaque traitement porte une ligne Conservation.** Sans cela le tableau reste
   bien formé, la ligne manque, et il faut compter pour le voir
2. **aucune durée ne s'annonce provisoire.** C'est celle qui a manqué : le
   contrôle refuse désormais « non encore rédigé », « à trancher », « provisoire »
   sur la ligne Conservation

Le contrôle refuse la **formule**, pas la durée : il ne juge toujours pas du droit.

**Une erreur dans ma mutation, gardée en commentaire.** Le cas 15 remplaçait
d'abord « ### T1 » par « ### Traitement 1 », qui commence toujours par `### T` :
le motif comptait pareil, la mutation ne mutait rien, et le contrôle passait au
vert en accusant sa propre cible. Corrigé en « ### Fiche ». C'est le motif de la
mutation sans effet observable, déjà rencontré ici.

## Preuves

```
npm run type-check                                     vert
npm run lint                                           vert
npm run format:check                                   vert
npm run test                                           276 tests, 19 fichiers, inchangés
npx prisma validate                                    schéma valide
npm run db:verifier                                    95 réussites, 0 échec
./scripts/verifier-registre-traitements.sh             vert, 32 tables, 9 traitements
./scripts/verifier-registre-traitements-mutation.sh    15 / 15 détectées (12 avant)
./scripts/verifier-regles-mutation.sh                  12 / 12 détectées
./scripts/verifier-config-claude.sh --strict           vert
```

## État des tickets

**LS-93** : les cinq critères sont remplis. L'ADR fixe la durée et la motive, dit
ce qui se passe à l'échéance (rien, et pourquoi), le registre est corrigé,
`REFERENCES.md` porte ADR-028, et la section « Ce qui reste dû » n'a plus de
dette.

## Ce qui reste

La rubrique publique exigée par D111-10 est à écrire par la story qui livrera les
pages d'information sur les avis, epic LS-36. Elle doit annoncer **deux** délais :
la conservation, fixée par ADR-028, et la publication, qui reste un paramètre
commercial à fixer.

## Prochaine étape

Le registre des traitements n'a plus de dette. Sur LS-2, seule LS-96 reste
ouverte, et elle attend un déploiement réel en phase 6.
