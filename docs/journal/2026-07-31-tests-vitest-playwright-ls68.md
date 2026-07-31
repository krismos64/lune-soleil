# 31 juillet 2026, le test phare entre dans la suite

| Champ | Valeur |
|---|---|
| Ticket | LS-68, **terminé** |
| Commits | `80fa29a` |
| Contrôles | 17 Vitest, 9 Playwright, 92 schéma, types, lint, format, build, audit à zéro |
| Mutations | 8 mutations, 8 détectées |

Troisième page du 31 juillet. Le test de concurrence sur le dernier exemplaire
cesse d'être un script bash que personne ne lance.

## Ce que la story a produit

Vitest en deux projets, `unitaire` sans base et `integration` sur base éphémère.
Playwright sur trois largeurs, 320, 390 et 1280 px, avec axe-core. Sept fichiers
sous `tests/`, plus `scripts/verifier-tests-mutation.sh`.

La base d'intégration porte un nom unique par exécution, reçoit le schéma par
`migrate deploy` puis est détruite. Le choix de `migrate deploy` plutôt que
`db push` n'est pas un détail de confort : `db push` dérive le schéma depuis
`schema.prisma` sans passer par les migrations, donc **sans les contraintes
CHECK**, qui n'ont aucun équivalent déclaratif. Une base poussée ainsi
accepterait précisément la survente que ces tests doivent voir refusée.

## Le défaut que la preuve par mutation a trouvé

**La première version des tests était entièrement verte avec la condition de
disponibilité retirée de l'`UPDATE`.**

Elle comptait les réservations créées et vérifiait que le stock ne devenait pas
négatif. Ces deux assertions semblaient suffisantes. Mesure sur la base réelle,
vingt acheteurs simultanés sur une pièce unique, condition retirée :

```
MUTATION - reussites UPDATE : 1  rejets : 19
codes de rejet : [ '23514' ]
reservations en base : 1
variante : { quantite_physique: 1, quantite_reservee: 1 }
```

Une réservation, quantité réservée à 1, stock positif. **L'état final est
rigoureusement identique au cas correct.** `chk_variante_pas_de_survente`
rattrapait à la place de l'`UPDATE`, et aucune assertion portant sur l'état ne
pouvait distinguer les deux.

Ce qui change sous mutation est la **nature du refus**, pas son résultat. Sans
mutation, dix-neuf refus métier propres, zéro erreur levée. Avec mutation,
dix-neuf violations de contrainte. L'aide `reserver` traduisait les deux en
`false`, ce qui effaçait le seul signal observable.

D'où la distinction `SERVIE` / `REFUSEE` / `VIOLATION`, et l'assertion décisive
qui porte sur l'absence de violation. Les assertions sur le compte de
réservations restent, mais elles ne prouvent rien à elles seules.

**Deux lignes de défense couvrent le même invariant, et un test qui ne les
distingue pas mesure la mauvaise.**

## Le script de mutation avait le même défaut, à un étage au-dessus

Première version de `verifier-tests-mutation.sh` : elle exigeait que la suite
échoue, sans regarder quel test échouait. En neutralisant les assertions des
trois tests de concurrence, elle annonçait toujours :

```
  7 mutations, 7 detectees
```

La mutation était bien vue, mais par deux tests **indirects**, libération et
conversion, qui comparent une issue exacte. Les tests censés porter la garantie
de concurrence étaient devenus aveugles sans que rien ne le signale.

Le script exige désormais un motif : quel test doit rougir pour chaque mutation.
Rejoué sur la version neutralisée, il donne maintenant :

```
  RATE  condition de disponibilite retiree de l'UPDATE
        -> echec constate, mais PAS sur le test attendu
        attendu : sert exactement un acheteur sur vingt simultanes
  7 mutations, 1 NON detectees
```

## Les huit mutations

| Mutation | Détectée par |
|---|---|
| condition de disponibilité retirée de l'`UPDATE` | vingt acheteurs simultanés |
| condition `archivee_a IS NULL` retirée | variante archivée |
| condition `vente_web_activee` retirée | vente web désactivée |
| libération qui ne décrémente plus | réservation expirée |
| conversion qui ne décrémente plus le physique | indisponible après vente |
| débordement horizontal dans la page | 320 px et 390 px, pas 1280 px |
| attribut `lang` retiré | axe-core, `html-has-lang` |
| mot de passe perdu au remplacement d'URL | deux tests unitaires |

La sixième justifie à elle seule les trois largeurs de Playwright : 496 px de
débordement à 320 px, 426 px à 390 px, **rien du tout à 1280 px**.

## Trois écarts avec le prototype, imposés par le schéma

Le prototype d'ADR-006 teste un schéma jouet qui a divergé du schéma réel.

1. `commande_id` est **obligatoire** sur une réservation depuis ADR-024 et
   LS-53. Le prototype insère une réservation sans commande, ce que la base
   refuse aujourd'hui. Chaque acheteur simulé porte donc sa propre commande.
2. `archivee_a IS NULL` entre dans la condition. La colonne n'existait pas au
   moment du prototype, et `database.md` l'exige : archivée l'emporte sur
   `vente_web_activee`, y compris quand ce drapeau vaut `true`.
3. Identifiants UUID et non entiers.

Le prototype reste en place : il documente la démarche d'ADR-006 et se rejoue si
la version de PostgreSQL change.

## Ce qui a dérivé en cours de route

**Node est passé de 22.14.0 à 22.23.2.** jsdom 30 exige au moins 22.22.2, et
`engine-strict` a bloqué l'installation plutôt que de produire un état
incohérent. Deuxième mise à l'épreuve réelle de ce garde-fou en deux jours.

**ESLint analysait `src/generated`**, soit 446 fichiers engendrés à chaque
exécution. Aucune remarque n'y serait corrigeable, `prisma generate` écrasant
toute modification. Exclu.

**Le hook de sécurité a bloqué le premier commit** sur une chaîne de connexion
dans le test unitaire. La valeur était inventée, mais le motif
`utilisateur:valeur@hôte` reste un mauvais précédent dans un dépôt public, et
l'analyse ne peut pas deviner. L'URL est désormais assemblée, et un test vérifie
que les identifiants traversent le remplacement intacts, mutation à l'appui.

**`CLAUDE.md` a dépassé 200 lignes** en accueillant les nouvelles commandes.
Condensé à 200 exactement, contrôle strict au vert.

## Ce que cette story ne fait pas, et pourquoi

Le test du **service** de réservation, avec sa transaction et son mouvement de
stock. Ce service n'existe pas, il relève de la phase 2. LS-68 couvre la
primitive SQL, seul niveau où la garantie est aujourd'hui portée.

Le test de non-régression de l'interblocage reste un script tant que LS-50 n'est
pas traitée : le porter maintenant produirait la suite rouge que la correction de
description du 30 juillet visait à éviter.

## Ce qui reste ouvert

`no-restricted-imports` sur `PrismaClient` n'a pas été posé, l'interdiction reste
écrite dans `src/lib/README.md` sans contrôle. Reporté à LS-69, hérité de LS-78.

L'intégration continue devra lancer `prisma generate` avant de compiler, et
`npm run test:integration` a besoin d'un service PostgreSQL.

## Prochaine étape

**LS-69**, la chaîne d'intégration continue complète, huit contrôles de
`CONTRIBUTING.md` dont `verifier-schema.sh`. Les commandes de test qu'elle doit
lancer existent désormais.

## État des tickets

| Ticket | État |
|---|---|
| LS-68 | **Terminé**, sept critères vérifiés |
| LS-65, LS-66, LS-67, LS-78 | **Terminés**, pages précédentes |
| LS-69 | À faire, **prochaine action** |
| LS-70 à LS-75 | À faire |
| LS-50 | À faire, l'interblocage reste un script |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
