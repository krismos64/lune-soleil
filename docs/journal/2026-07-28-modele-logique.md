# 28 juillet 2026, modèle logique et premier code

LS-13. Le projet passe de la modélisation au code : `prisma/schema.prisma`,
25 tables, une migration SQL manuelle, un script de vérification.

Entrée séparée de celle du modèle conceptuel, parce que la nature du travail
change. Jusqu'ici les défauts se corrigeaient dans un document ; à partir
d'aujourd'hui ils se corrigent dans une migration.

## Une décision de périmètre au démarrage

Le dépôt n'avait aucune dépendance : ni `package.json`, ni Prisma, ni Docker
Compose. LS-13 ne pouvait donc pas produire une migration exécutable sans
d'abord initialiser le projet.

La description de LS-2, phase 1, porte pourtant explicitement « ORM et migration
initiale ». Absorber l'initialisation dans LS-13 aurait vidé LS-2 de son objet et
fait choisir les versions de Next.js et React hors de la story qui les cadre.

Christophe a tranché : LS-13 produit un schéma et une migration **prouvés sur une
base réelle**, sans installer le projet. La phase 1 les branchera sans avoir à
les concevoir.

## Trois découvertes techniques, dont deux invalident le projet

**Prisma génère les index partiels.** ADR-023 demandait de revérifier ce point au
moment de LS-13, c'était la bonne consigne. La fonctionnalité `partialIndexes`
produit exactement l'index attendu :

```sql
CREATE UNIQUE INDEX "utilisateur_administratrice_unique"
  ON "utilisateur"("role") WHERE (role = 'ADMINISTRATRICE');
```

Le SQL manuel ne sert plus qu'aux `CHECK`, que Prisma ne génère toujours pas.
ADR-006 reste exact, ADR-023 et le modèle conceptuel sont corrigés.

Détail de méthode : Context7 a donné **deux réponses contradictoires**, la
documentation publique décrivant la fonctionnalité comme disponible et le dépôt
Prisma la listant comme non implémentée. Seul le test tranchait.

**Prisma 7 a supprimé `url` du bloc `datasource`.** La connexion passe par un
fichier `prisma.config.ts`. Le projet l'ignorait.

**Node 23 est refusé.** Prisma 7 n'accepte que 20.19+, 22.12+ ou 24.0+, les
versions impaires sont exclues. La machine portait Node 23.9.0. Le projet fixe
Node 22 LTS.

## Le défaut le plus instructif venait de mes propres tests

Sept assertions ne testaient rien. Elles s'écrivaient ainsi :

```bash
verifier "panier multi-articles accepté" "" "$(echo "$sortie" | grep -i violation)"
```

**PostgreSQL écrit « violates », jamais « violation ».** Le `grep` retournait donc
une chaîne vide quelle que soit la réponse de la base, et la comparaison était
vraie par construction.

Le contrôle censé détecter la régression de LS-12 sur le panier multi-articles
affichait OK **avec le défaut présent dans le schéma**.

Un huitième, trouvé à la première passe, validait une violation de clé étrangère
au lieu de l'unicité qu'il prétendait tester : deux instructions dans un même
`psql -c` partagent une transaction implicite, et le rejet de la première
annulait la ligne dont la seconde dépendait.

### La parade : prouver le test par mutation

Corriger les assertions ne suffisait pas, il fallait démontrer qu'elles rougissent
vraiment. Deux mutations ont été injectées dans le schéma, chacune réintroduisant
un défaut réel de l'historique du projet.

| Mutation | Avant correction | Après |
|---|---|---|
| clé email revenue à `origine = 'SYSTEME'` | vert | 2 échecs |
| clé mouvement sur `commande_id` seul, LS-12 | vert | 1 échec |

**Un test qui ne rougit sur aucune mutation ne garde rien.** C'est la leçon de la
journée, et elle vaut au-delà de ce script : le projet compte désormais sur ce
fichier pour tenir le jalon en intégration continue.

## Les autres défauts des deux passes

**Les horodatages étaient générés sans fuseau.** `CURRENT_TIMESTAMP` sur une
colonne `timestamp` enregistre l'heure murale de la session. Prouvé : la même
insertion sous `Europe/Paris` et sous `UTC` diffère de deux heures.

L'impact était comptable. `emise_a` date une facture, `deposee_a` prouve un dépôt
de rétractation et fait courir les quatorze jours. Une facture émise le
31 décembre à 23 h 30 UTC changeait d'exercice et de séquence annuelle. Quarante-
neuf champs passés en `timestamptz`.

**La clé d'idempotence des emails avait deux trous**, tous deux de mon fait. Une
ligne `ECHOUE` occupait la clé et condamnait la retentative, contre la règle E4 :
une panne du fournisseur à 14 h 02 privait définitivement le client de son email
d'expédition. Et le chemin `RECONCILIATION` n'était pas couvert, alors que c'est
précisément le second chemin d'entrée que la décision D existe pour neutraliser.

**Neuf clés étrangères sans index.** PostgreSQL n'en crée pas automatiquement.
`reservation.variante_id` est le plus gênant : les règles S5 et C18 l'interrogent
avant d'autoriser une vente externe ou un archivage, sur une table qui accumule
les réservations expirées entre deux purges.

**Une formulation trompeuse sur les avoirs.** Le modèle annonçait un `CHECK`
garantissant que la somme des avoirs ne dépasse pas la facture. Le `CHECK` ne
borne que le champ dénormalisé : un `CHECK` ne peut pas agréger une autre table.
F9 est de niveau 2, c'est écrit maintenant.

## Ce qui a été corrigé au-delà du code

`.claude/rules/database.md` décrivait encore l'ancien filtre d'email. Ce fichier
est chargé automatiquement au moment de coder : la session qui implémentera le
service d'email en phase 1 y aurait lu la définition défectueuse et aurait pu
« corriger » le schéma vers l'état cassé, en croyant s'aligner sur la règle.

C'est le mécanisme exact des régressions passées. Une règle périmée est plus
dangereuse qu'une règle absente.

## Où on en est

Phase 0 terminée sur sa partie modélisation. Onze stories closes.

| Ticket | Sujet | État |
|---|---|---|
| LS-13 | Modèle logique de données | Terminé : 25 tables, 29 contrôles au vert |
| LS-14 | Diagramme de séquence de l'achat | À faire, débloqué |
| LS-15 | Filaire mobile création produit | À faire |
| LS-2 | Phase 1, fondations techniques | Prochaine phase, branche le schéma |

## Prochaine étape

**LS-14**, le diagramme de séquence de l'achat, ou **la phase 1** qui initialise
le projet et applique la migration.

Trois éléments attendent la phase 1, tous documentés dans `MODELE-LOGIQUE.md` :
fixer Node 22 dans `.nvmrc`, `engines`, le `Dockerfile` et l'intégration
continue ; créer `prisma.config.ts` ; recopier les seize `CHECK` dans la
migration Prisma pour que `prisma migrate deploy` les embarque.

Le script de vérification doit entrer en intégration continue. Il est aujourd'hui
la seule chose qui garde le jalon du projet.
