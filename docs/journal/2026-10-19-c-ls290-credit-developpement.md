# 19 octobre 2026 : LS-290, crédit de conception et développement

Accord total de l'exploitante confirmé par Christophe le 19 octobre, aucune
contrepartie liée au crédit.

## Fait

**Arbitrage écrit dans LS-290 avant le code** : le lien ne porte **aucun
`rel`**, crédit librement consenti ; `rel="sponsored"` le jour où une remise
ou une clause du contrat s'y attacherait. Même onglet, sans `target`, comme le
lien Facebook de `pied-boutique.tsx`.

Bloc h3 « Conception et développement » à la fin de la section `#mentions` de
`/informations-legales`, hors de la condition sur l'identité : « Site conçu et
développé par Christophe Mostefaoui, développeur web freelance », un seul lien
vers `https://christophe-dev-freelance.fr`. Rien dans le pied de page, rien
dans le JSON-LD `Organization`.

## Preuves

```
npx playwright test tests/e2e/informations-legales.spec.ts   84 passed, quatre largeurs
-g "crédit de développement", après correction                16 passed
type-check, lint                                             code 0
verifier-navigation-client, -redaction-francaise,
-atteignabilite-boutique, -contraste, -regles                 code 0
```

| Mutation | Test rouge |
| --- | --- |
| `rel="nofollow"` sur le lien | le lien unique, `not.toHaveAttribute` |
| lien recopié dans le pied | les deux tests, `toHaveCount` |
| ancre chargée de mots-clés | le lien unique, nom exact |
| URL ajoutée au `sameAs` de `Organization` | l'absence sur l'accueil |

## Dérive corrigée

La quatrième mutation est d'abord **restée verte** : l'assertion sur le JSON-LD
lisait `/informations-legales`, où `Organization` n'est pas rendu, et ne
vérifiait donc rien. Elle vit désormais sur l'accueil, avec une garde qui exige
la présence de `"Organization"` avant d'en conclure l'absence de l'URL.

Revue `ls-frontend-revue` : aucun défaut. Lien à 5,04:1 sur le blanc de la
section, souligné, focus global hérité. Seul point non couvert par un test : le
rendu sans identité configurée, où le crédit suit directement le message de
manque. Sans effet en production, l'identité y étant servie.

## État des tickets

LS-290 en cours jusqu'au déploiement et au constat en production. Le critère
d'indexation dans la Search Console revient à Christophe, aucun accès ici.

## Prochaine étape

Déployer, constater le lien en production, clore LS-290. Constater le nocturne
relancé (run 39311983905) et fermer #579. LS-258 à relire le 2 novembre.
