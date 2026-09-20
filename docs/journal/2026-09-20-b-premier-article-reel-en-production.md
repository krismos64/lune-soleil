# 20 septembre 2026, le premier article réel en production

Christophe et l'exploitante ont créé un premier article sur la boutique en
production. Cette page relève ce que ça prouve, ce que ça ne prouve pas, et les
deux tickets touchés.

## Ce qui est en ligne

```
https://lune-soleil.fr/produit/boucles-d-oreilles-etoile-filante
« boucles d'oreilles Etoile filante », 10,00 EUR, derniere piece
categorie boucles d'oreilles
```

Constaté sans rien écrire : lire la production suffisait, et une mise au panier
aurait créé un mouvement sur un stock réel à un exemplaire.

## Ce que la chaîne média prouve enfin

**Aucune métadonnée sur les trois déclinaisons servies**, vérifié octet par
octet après téléchargement :

```
320.jpeg     6848 octets   EXIF absent  GPS absent  XMP absent  ICC absent
640.jpeg    20849 octets   EXIF absent  GPS absent  XMP absent  ICC absent
1280.jpeg   60464 octets   EXIF absent  GPS absent  XMP absent  ICC absent
```

C'est l'exigence de sécurité non négociable de LS-23 : une photographie de
smartphone porte par défaut la position du domicile de l'exploitante. F-MED-02
tenait sur des fixtures, il tient maintenant sur une image réelle.

## Le reste de la fiche

| Élément | État |
| --- | --- |
| Texte alternatif, F-MED-05 | présent et descriptif |
| JSON-LD | `Product`, `Brand`, `Offer` 10.00 EUR `InStock`, `BreadcrumbList` |
| Informations précontractuelles | matériaux, dimensions, entretien, livraison, rétractation |
| `robots.txt` | passé de `Disallow` à **`Allow: /`** |
| `sitemap.xml` | 7 URLs, dont la fiche et sa catégorie |

Le basculement de `robots.txt` est le signe visible de LS-234 : il déduit son
état du catalogue, et une boutique vide ne s'indexe pas.

## Les tickets

**LS-20 close**, sur confirmation de Christophe. Son critère était « demande
transmise, premier lot en cours », et le premier lot est désormais attesté par
une photographie en ligne. Je ne pouvais pas l'attester seul : la transmission de
la demande est un fait hors du dépôt.

**LS-23 reste ouvert**, commenté. Deux de ses critères sont remplis, le produit
réel en grille et en fiche, et l'absence de GPS mesurée. Le premier ne l'est pas :
dix à vingt références sont attendues, deux photographies chacune, et **le visuel
de hero réel manque toujours**. `public/habillage/accueil-hero.jpg` montre encore
un pendentif et des créoles qui ne sont pas au catalogue, ce que l'arbitrage du
19 août impose de remplacer avant l'ouverture commerciale.

**LS-145 devient mesurable.** Son chronométrage de F-ADM-07, un produit complet
en moins de trois minutes au smartphone, exigeait un téléversement réel avec le
traitement des déclinaisons. Ce parcours vient d'être joué.

**LS-107, LS-140 et LS-123** restent bloqués : ils demandent un catalogue
fourni, pas un article.

## Un compte faux trouvé en chemin

Le README annonçait « les neuf de l'epic LS-22 ». La mesure en rend **dix**,
`parent = LS-22 AND status != "Terminé"`. L'écart ne venait pas de la clôture de
LS-20, qui appartient à l'epic LS-1 et non à LS-22 : le compte était déjà faux.

Motif « un compte recopié n'est pas une mesure », qui ressort une fois de plus.

Comptes du jour, relevés dans Jira : **201 terminés sur 225 hors epics**, 24
ouverts.
