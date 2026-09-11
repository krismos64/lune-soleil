# 11 septembre 2026, f : LS-125, la frontière d'erreur publique

Le ticket demandait quatre choses. **Trois étaient déjà faites** par des stories
postérieures à sa rédaction, et la quatrième n'avait aucun objet. Ce qui restait
réellement ouvert était ailleurs, et plus large.

## Ce que le ticket demandait, et ce que le code porte déjà

Écrit le 25 août 2026 sur une page de confirmation **statique**, qui « ne lit
rien en base et n'affiche que le numéro porté par l'URL ».

| Critère | État réel |
|---|---|
| 1. la route porte un `error.tsx` | **fait par LS-146**, le 3 septembre : `(boutique)/error.tsx` couvre le groupe entier |
| 2. si la page devient dynamique, un `loading.tsx` | **sans objet** : LS-118 l'a rendue dynamique, et la règle C32 interdit le `loading.tsx` plutôt que de l'exiger |
| 3. un jeton absent rend un 404 réel | **sans objet** : la page lit un **cookie signé**, pas un jeton d'URL, et n'appelle jamais `notFound()` |
| 4. le test de statut précède le `loading.tsx` | sans objet, par conséquence |

Motif « livrable dépassé par le code », déjà en fiche mémoire. Appliquer le
ticket à la lettre aurait produit un `error.tsx` en double et un `loading.tsx`
que la règle C32 interdit.

## Ce qui restait ouvert, et qui est plus large

**La frontière d'erreur de la boutique publique n'était éprouvée par aucun
test.** Elle rattrape depuis LS-146 le panier, le tunnel, la confirmation et
l'espace client, c'est-à-dire tous les écrans publics sans frontière propre.

Son jumeau d'administration en a un depuis LS-191, avec une page qui lève à
dessein. Côté public, rien.

**Une relecture ne suffit pas.** Un `error.tsx` peut exister, être juste, et ne
jamais s'afficher : il ne rattrape que ce qui lève **sous lui** dans l'arbre, et
une frontière plus proche gagne. Trois écrans portent déjà la leur. Rien ne
disait que les autres tombaient bien sur celle du groupe plutôt que sur la page
générique de Next.js, en anglais et sans navigation.

## Le contrôle d'ordre ne voyait qu'une route sur deux

`verifier-route-echec.sh` gardait `administration/echec-rendu` **par son nom**,
seule route d'échec quand LS-191 l'a écrit. La route publique ajoutée
aujourd'hui serait passée dessous : le contrôle serait resté vert sur une garde
inversée, parce qu'il ne la regardait pas.

C'est le motif « règle juste, portée non mesurée ». Le contrôle **découvre**
désormais les routes par leur convention de nom, et une troisième y entrera sans
qu'il soit touché.

Prouvé par mutation : la garde inversée sur la route **publique** le fait rougir,
ce qui n'était pas le cas avant.

## Le test unitaire couvre les deux par une table

Plutôt qu'une copie, qui se serait périmée à la première correction apportée à
l'autre. Un test vérifie que chaque route lève **son propre** message : sans lui,
la table pourrait charger deux fois la même page, paraître couvrir les deux et
n'en exercer qu'une. Motif « valeurs qui coïncident ».

## Une assertion qui supposait au lieu de mesurer

Mon test cherchait un lien nommé « catalogue ». Le libellé réel est **« Voir les
créations »** : l'écran parle la langue de la boutique, pas celle de la route. Le
test rougissait sur un code parfaitement sain.

## Vérifications

```
npm run type-check                    vert
npm run lint                          vert
npm run format:check                  vert
npm run test                          1485 tests
vitest route-echec (unitaire)         14 tests, 7 par route
playwright erreur-boutique            11 tests
verifier-route-echec.sh               2 routes gardées
mutation de la garde publique         détectée
verifier-loading-et-404.sh            conforme
verifier-lien-evitement.sh            conforme
verifier-regles.sh                    règles conformes au schéma
```

## État des tickets

**LS-125 traitée**, epic LS-4. Ses quatre critères étaient périmés ou sans objet ;
le travail réel a porté sur la mesure de la frontière d'erreur publique, qui
n'existait pas.

**LS-109 rebasée** sur `main`, la CI rejoue.

## Prochaine étape

**LS-85**, les annonces aux lecteurs d'écran, ou **LS-64**, la page Statistiques.
