# 31 juillet 2026, l'interblocage du panier corrigé, et un ticket périmé

| Champ | Valeur |
|---|---|
| Ticket | LS-50 |
| Contrôles | 37 Vitest (17 avant, 20 ajoutés), types, lint, format, règles, config stricte, audit à zéro |
| Mutations | 6 injectées, 6 détectées |
| Défauts trouvés après coup | 2, par relecture critique, tous deux dans le service |
| Nouveaux fichiers | `services/reservation.ts`, `repositories/stock.ts`, trois fichiers de test |

Cinquième page du 31 juillet. Le premier code applicatif du projet entre dans
`src/services/` et `src/repositories/`, jusque-là vides de tout sauf leur fichier
de garde.

## Le défaut, reproduit avant d'être corrigé

Le prototype de LS-49 rejoué tel quel, sans modification :

```
[T1] ERROR:  deadlock detected
[T1] DETAIL:  Process 105 waits for ShareLock on transaction 757; blocked by process 112.
              Process 112 waits for ShareLock on transaction 756; blocked by process 105.
codes de sortie : T1=3 T2=0
etat final : A 1/1, B 1/1
```

Corriger un défaut sans l'avoir vu échouer produit un correctif dont rien ne
prouve qu'il corrige quelque chose.

## Le commentaire Jira était périmé, et il demandait du travail déjà fait

La description de LS-50 porte le tri déterministe. Un commentaire du 29 juillet
étend le périmètre à l'atomicité réservation-commande et demande de trancher
`Reservation.commandeId` **avant la migration initiale**.

Ce travail est fait depuis. ADR-024 est accepté, `commandeId` est `String` non
nullable avec `onDelete: Restrict`, et LS-53 l'a porté. Les trois questions « à
vérifier avant de trancher » du commentaire ont toutes reçu leur réponse dans
l'ADR, dont la purge des réservations expirées qui ne change pas.

Le commentaire a été rectifié plutôt que laissé en l'état. La règle du projet dit
que le plus récent l'emporte ; ici le plus récent était le commentaire, et il
était pourtant le plus faux. **La fraîcheur d'un commentaire ne dit rien de sa
validité quand un ADR est passé entre-temps.** Ce qui l'emporte, c'est la source
de vérité la plus haute, et l'ADR est au-dessus de Jira.

## Ce que la correction ajoute, et où

Deux mécanismes, dans `services/` et non dans le SQL : ils portent sur l'**ordre**
et la **répétition** des instructions, pas sur leur contenu.

**Le tri**, `ordonnerLignes`. Comparaison binaire et non `localeCompare`, dont
l'ordre dépend de la locale d'exécution. Deux processus applicatifs qui
trieraient différemment reformeraient exactement le cycle que le tri supprime.

**Le rejeu borné**, trois tentatives. Le tri règle les cycles entre deux paniers,
pas ceux qu'une vente externe ou une libération de réservations expirées crée par
un autre chemin. Au-delà, l'échec est structurel et remonte en
`InterblocagePersistantError`, distincte d'un refus métier : le stock était
peut-être disponible, c'est la contention qui a empêché de conclure.

## Le même événement porte trois formes, et j'en avais retenu deux

Première version : `40P01` du pilote `pg`, `P2034` de Prisma, les deux servis par
Context7. Le ticket ne parlait que du premier, ayant été rédigé depuis un
prototype `psql`.

Une sonde qui provoque un vrai interblocage a montré que le service ne recevait
ni l'un ni l'autre :

```
ERREUR code: P2010
ERREUR meta: {"driverAdapterError":{"cause":{"originalCode":"40P01",
             "originalMessage":"deadlock detected"}}}
```

Une requête **brute** échoue en `P2010`, code générique, et le `40P01` n'apparaît
que dans la cause de l'adaptateur. `P2034` est le code de l'API typée. Comme
toute la réservation passe par `$queryRawUnsafe`, **cent pour cent** des
interblocages échappaient au rejeu, pas une fraction.

Les deux tests unitaires du rejeu étaient pourtant verts : ils fabriquaient
eux-mêmes les erreurs par `erreurAvecCode("P2034")`, donc validaient la constante
contre elle-même. Un double de test ne peut pas démentir une hypothèse fausse sur
le monde réel, il ne fait que la répéter.

## Le défaut que je n'ai pas vu, trouvé par la relecture

Le plus grave des deux, et il était dans un commentaire que j'avais écrit avec
assurance : « Prisma annule la transaction dès que la fonction rend la main ».

C'est l'inverse. `$transaction` **valide** quand la fonction rend une valeur, et
n'annule que si elle **lève**. Le refus partiel sortait par un `return`, donc
partait en `COMMIT` avec les lignes déjà réservées.

Mesuré sur base réelle, panier de deux pièces dont une épuisée :

```
ISSUE: {"statut":"REFUSE","varianteRefusee":"778928e1-..."}
VARIANTE DISPONIBLE APRES REFUS: [{"quantite_physique":1,"quantite_reservee":1,"lignes":"1"}]
```

Le client voit « pièce indisponible », son panier échoue, et le collier
disponible reste gelé trente minutes pour une commande `EN_ATTENTE_PAIEMENT` que
personne ne paiera. Le client suivant essuie un refus sur une pièce
physiquement en stock. Sur un catalogue de pièces uniques, chaque panier
partiellement refusé retire du stock vendable.

L'issue rendue était correcte, `REFUSE` avec la bonne variante nommée. Seule
l'écriture en base ne l'était pas. Un test qui vérifie l'issue passe au vert.

## Pourquoi mes propres tests ne voyaient ni l'un ni l'autre

Les deux défauts vivent dans le service, et **aucun de mes tests n'exécutait le
service sur une base**. Le test d'intégration reproduisait sa mécanique en SQL
direct, avec un `ROLLBACK` explicite et une lecture de `erreur.code` : les deux
points exacts sur lesquels le service différait, et les deux qui étaient faux.

J'avais justifié ce choix dans un commentaire, en affirmant que Prisma
s'interposerait entre le défaut et la mesure. La mesure dit le contraire :
l'interblocage traverse Prisma intact, `40P01` lisible dans `meta`.

Un test qui reproduit le code au lieu de l'appeler prouve que le motif est bon.
Il ne prouve rien sur ce qui tourne en production, et c'est précisément là que
les défauts étaient.

`tests/integration/reservation-service.sequential.test.ts` appelle désormais
`reserverPanier`. Ses deux tests décisifs rougissent sur les versions fautives.

## L'assertion qui distingue vraiment, et celle qui ne distingue rien

Le piège de ce test tient en une phrase : **sous interblocage, l'état final du
stock est rigoureusement correct.** PostgreSQL annule une des deux transactions,
la survivante réserve ses deux pièces, aucune survente ne se produit.

Compter les réservations, vérifier que le stock reste positif, contrôler que
chaque variante porte bien une réservation : tout cela passe au vert avec le
défaut en place. La seule chose qui change est la **nature de l'issue**, un panier
servi contre un panier mort en `40P01`.

C'est le même motif qu'en LS-68, où le CHECK produisait le même état final que
l'UPDATE conditionnel correct. Deuxième occurrence, et il mérite désormais d'être
cherché par défaut : quand un défaut et sa correction produisent le même état,
seul le chemin emprunté les sépare.

## Six mutations

| Mutation | Détectée par |
|---|---|
| Tri neutralisé dans `ordonnerLignes` | 3 tests unitaires, dont l'ordre réel des appels |
| Tri retiré du test d'intégration décisif | `expected [ 'INTERBLOCAGE', 'SERVI' ] to not include 'INTERBLOCAGE'` |
| Code `P2034` retiré de la détection | le test qui le vise, et lui seul |
| Condition de disponibilité retirée, mutation de LS-68 | 7 tests |
| Refus repassé par un `return`, défaut 1 réinjecté | `expected 1 to be +0`, sur l'état de la pièce disponible |
| Détection ne descendant plus dans la cause, défaut 2 | le test d'intégration du rejeu, et le test unitaire `P2010` |

Les deux dernières sont les plus utiles : elles prouvent que les tests ajoutés
après la relecture attrapent bien les défauts qui leur ont échappé la première
fois. La quatrième vérifie que la preuve de LS-68 survit au déplacement de la
requête.

## La requête était recopiée dans les tests

`tests/aide/reservation-sql.ts` portait `SQL_RESERVER` en dur, écrite quand aucun
code applicatif n'existait. Écrire le repository en a fait une seconde copie,
identique au caractère près, et rien n'aurait maintenu les deux ainsi.

Le fichier de test dénonce ce défaut dans son propre en-tête, à propos des tests
qui recopieraient la requête. Il le commettait à l'échelle au-dessus.

La requête vit désormais dans `repositories/stock.ts` et l'aide de test la
réexporte. La mutation de LS-68 y gagne : elle frappe le code réellement exécuté
en production, et sept tests la voient au lieu de cinq.

## Un piège de configuration, `resolve` ne descend pas dans les projets

Premier test à importer du code applicatif par l'alias `@/`, premier échec :

```
Error: Cannot find package '@/services/reservation'
```

Un projet Vitest n'hérite pas du `resolve` de la configuration englobante, il
porte sa propre résolution de modules. Déclaré une seule fois au sommet, il sert
la configuration racine et aucun projet. L'alias est maintenant déclaré dans les
deux projets, et le commentaire de `vitest.config.mts` dit pourquoi.

Rien ne l'avait révélé jusqu'ici : les tests de LS-68 n'importent que des aides
locales, par chemin relatif.

## Ce qui reste hors de cette story

Le service crée les réservations mais **pas la commande** : `reserverPanier`
reçoit un `commandeId` existant. L'écriture conjointe commande, lignes et
réservations dans une seule transaction relève de la story qui créera la
commande, ADR-024 en portant déjà la décision.

Le prototype `interblocage-panier.sh` reste hors intégration continue. Il
documente le défaut à l'état brut, et le brancher rendrait la chaîne rouge en
permanence puisqu'il exige l'interblocage pour réussir. Le test d'intégration
couvre la même propriété dans les deux sens, tri actif et tri retiré.

## Prochaine étape

**LS-70**, authentification de l'administration par passkey, Better Auth 1.6,
ADR-021. L'ordre des stories restantes de LS-2 est libre, LS-50 était la seule en
priorité haute.

## État des tickets

| Ticket | État |
|---|---|
| LS-50 | **Terminé**, six critères vérifiés, commentaire périmé rectifié |
| LS-65 à LS-69, LS-78 | **Terminés**, pages précédentes |
| LS-70 à LS-75 | À faire, ordre libre |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
