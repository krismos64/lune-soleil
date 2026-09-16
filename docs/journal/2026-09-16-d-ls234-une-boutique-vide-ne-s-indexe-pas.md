# 16 septembre 2026, une boutique vide ne s'indexe pas

Quatrième page du jour, et la seule qui livre du code applicatif. Elle naît d'une
question de Christophe qui corrigeait une erreur de ma part.

## Ce que j'avais mal dit

Après avoir regardé LS-153, j'ai parlé de « première mise en ligne » et Christophe
a répondu : « mais le site est en ligne depuis un moment ! ».

Il avait raison, et ma formulation était mauvaise. **Le site est en ligne depuis
le 13 septembre.** Ce que LS-153 appelle « première mise en ligne » est la
première ouverture **commerciale**, le moment où le site encaisse. Les deux ne se
recouvrent pas, et rien dans mes phrases ne le distinguait.

## Ce que la vérification a trouvé

Plutôt que d'argumenter, mesure de ce que la production sert :

```
https://lune-soleil.fr/           200
https://lune-soleil.fr/catalogue  200

robots.txt   User-Agent: *
             Allow: /

catalogue    « Aucune pièce à afficher. »
             « Le catalogue s'étoffe, les premières pièces arrivent bientôt. »
             zéro produit publié

sitemap.xml  5 URL, toutes statiques
```

**Le site était ouvert à l'indexation avec un catalogue vide**, exactement ce que
LS-153 veut empêcher en critère 4, et ce que sa description décrit comme un
piège : une page d'attente entrée dans un index y reste des semaines.

La question de Christophe a donc trouvé un défaut réel que ma mauvaise
formulation masquait.

## Pourquoi un ticket neuf plutôt que LS-153

LS-153 est la story du **jour** de l'ouverture. Sa propre fermeture de
l'indexation arriverait après des semaines d'indexation de la page d'attente : le
geste devait être posé maintenant. D'où LS-234.

## La décision, et ce qu'elle coûte

Trois options posées à Christophe : déduire du catalogue, un booléen en base
réglable à l'écran, une variable d'environnement. **Il a retenu la déduction.**

```
aucun produit publié  ->  Disallow: /
au moins un produit   ->  les règles actuelles
```

Le motif qui emporte : un paramètre à poser est un paramètre qu'on oublie de
poser, et le site serait alors resté **fermé après l'ouverture réelle**, défaut
silencieux et plus coûteux que celui qu'on corrige.

**Ce que ce choix coûte, écrit dans le code plutôt que tu** : LS-153 veut une
ouverture « volontaire et vérifiée, avec la date consignée ». Elle devient ici
implicite, déclenchée par la première pièce publiée. LS-153 garde son critère 6,
elle vérifie et consigne, elle ne déclenche plus.

## Deux détails qui ne vont pas de soi

**Le sitemap n'est pas annoncé quand tout est interdit.** L'annoncer pointerait
cinq URL statiques vers un site qu'on vient d'interdire en entier : un moteur lit
les deux signaux et le second contredit le premier.

**La même lecture que `sitemap.ts`**, qui appelle déjà `lireCataloguePublic()`
pour la même donnée. Un second chemin de lecture pourrait diverger, et deux
fichiers de référencement se contrediraient.

## Le test a appris quelque chose en échouant

Premier essai : le test du catalogue vide passait, celui du catalogue peuplé
levait `NEXT_PUBLIC_SITE_URL est requise`.

**C'est une preuve gratuite** que le chemin fermé n'appelle jamais `absolutise`,
donc n'annonce aucun sitemap. L'assertion qui le vérifie existait déjà ; cet
échec l'a confirmée par un autre moyen. Le commentaire du fichier garde la trace.

## La preuve par mutation

`produits.length === 0` remplacé par `< 0`, garde qui ne se déclenche jamais,
c'est-à-dire le défaut d'origine :

```
× interdit tout le site quand aucune piece n'est publiee
  AssertionError: expected { userAgent: '*', allow: '/', …(1) }
                  to deeply equal { userAgent: '*', disallow: '/' }
1 failed | 1 passed
```

Le second test reste vert, ce qui montre que la mutation est localisée et que le
premier test garde bien ce qu'il prétend garder.

## Vérifications

```
npm run type-check                    OK
npm run lint                          OK
npm run test                          105 fichiers, 1704 tests verts
verifier-regles.sh                    54 services, conformes
verifier-tests-non-ignores.sh         toute la suite s'execute
verifier-redaction-francaise.sh       166 fichiers, aucun cadratin
```

## Déployé, et le critère 5 fermé sur pièce

PR 448 fusionnée puis déployée sur `97032c4d`, run 35110472389, **sans
migration**, l'écart de neuf commits n'en portant aucune.

Mesuré sur la production après bascule, et non sur le statut du workflow :

```
$ curl -s https://lune-soleil.fr/robots.txt
User-Agent: *
Disallow: /

$ curl -s https://lune-soleil.fr/robots.txt | grep -ci sitemap
0
```

**Le même fichier rendait `Allow: /` une heure plus tôt.** La bascule est donc
prouvée de bout en bout, du test unitaire jusqu'au fichier servi.

Le site reste accessible, seule l'exploration est découragée : `/`, `/catalogue`
et `/aide` rendent 200, et les trois sites du VPS répondent.

## Traçabilité

**Dépôt** : PR 448 fusionnée en rebase, `0a3fbcd` et `97032c4`, puis déployée.

**Jira** : LS-234 créé, rattaché à LS-7, commenté deux fois et passé
**Terminé**, ses sept critères remplis.

**Mémoire** : rien d'écrit. Les trois questions ne passent pas, le piège ne
s'étant présenté qu'une fois et le test le fermant mécaniquement.

## Ce que ce ticket laisse à LS-153

Son **critère 4** est tenu par construction. Son **critère 6** reste entier :
LS-153 vérifie et consigne la date d'ouverture, elle ne la déclenche plus.

## Prochaine étape

**Le nocturne de 7h** tranche LS-232 et LS-233.

Comptes relevés dans Jira le 16 septembre : **198 terminés sur 224 hors epics**,
**26 ouverts**.
