# 1er septembre 2026, session F : LS-132, LS-128 et LS-159

Trois stories enchaînées en autonomie. Deux défauts qui coûtaient de l'argent ou
un accès, trouvés par la revue critique et par la mutation, pas par les tests
écrits de bonne foi.

## LS-132, l'accès à la facture par lien signé

Un achat sans compte produit une facture que le client doit pouvoir lire. Sans
session, l'autorisation vient d'un jeton signé, invariant 2.

`lib/jeton-acces.ts` porte la valeur signée et l'empreinte, étiquette
`document-v1` distincte des trois cookies signés qui partagent la clé maître.
`services/acces-document.ts` teste les quatre conditions et rend un refus
uniforme, la route rendant **404 sur tous les motifs** : un 403 signifierait
« ce document existe mais vous n'y avez pas droit ».

**Quatre conditions et non trois.** La règle L9 en porte trois d'état, expiré,
consommé, révoqué. La quatrième est la signature, qui ne se lit pas en base et
se vérifie avant toute requête, ce qui ferme l'énumération à coût constant.

**La portée `DOCUMENT` ne se consomme pas**, arbitrage tracé. `utiliseA` marque
une action faite ; une facture se consulte plusieurs fois, et consommer à la
première lecture casserait le second clic.

## Le jeton était produit puis jeté

Défaut trouvé par `ls-critical-reviewer`. `emettreFacture` rendait la valeur, le
webhook ignorait le retour. La base ne gardant que l'empreinte, la valeur
n'existait alors plus nulle part : un rejeu d'événement, un email en échec ou un
lien parti sur une mauvaise adresse laissaient la commande **sans accès
possible, définitivement**.

`reemettreJetonDocument` révoque les jetons actifs puis en écrit un neuf dans la
même transaction. Sans la révocation, l'ancien lien resterait valide jusqu'à son
terme, défaut déjà décrit au point 8 des transactions critiques.

## Un test qui ne testait pas ce qu'il annonçait

Le test de la condition « modifié » restait **vert** quand on neutralisait
`signatureJetonValide`. L'empreinte portant sur la valeur complète, altérer la
valeur change l'empreinte : le jeton devenait introuvable, et le refus venait de
la lecture en base, jamais de la signature.

La version juste inscrit en base l'empreinte de la valeur **modifiée** : la
ligne existe, la portée et l'expiration sont bonnes, donc la signature est le
seul motif de refus possible. Un témoin vérifie que la valeur correctement
signée reste acceptée.

## LS-128, l'avoir, et un double remboursement réel

Une facture est immuable : un remboursement produit un avoir, séquence
`A-2026-0001` distincte de `F-2026-0001`. L'ordre est le cœur du service, le
prestataire d'abord et la base ensuite, l'appel réseau hors transaction.

**La revue critique a trouvé un défaut qui rembourse deux fois.** La clé
d'idempotence était dérivée de `montantAvoirCentimes`, lu hors transaction. Deux
demandes concurrentes lisaient le même cumul et dérivaient la même clé.
L'idempotence de Stripe n'étant pas un verrou, la seconde recevait
`idempotency_key_in_use`, que le code classait en refus définitif ; en relançant,
le cumul avait bougé, la clé changeait, **un second remboursement réel partait**.
4000 centimes rendus pour 2000 voulus.

Le `CHECK` ne rattrape pas ce cas : il protège l'écriture comptable, jamais la
sortie d'argent, et se déclenche après le départ des fonds. Le commentaire du
code qui l'affirmait était faux, il est corrigé.

## La correction a révélé un second défaut

La table `intention_remboursement` ferme le cas simultané par une unicité
`(facture_id, cle_idempotence)` écrite avant l'appel réseau, dans une
transaction courte qui commite : aucun verrou n'est tenu pendant
l'aller-retour, ce que `database.md` interdit.

Mais le test de concurrence rougissait encore par intermittence. Mesure : quand
le premier appel a le temps d'écrire son avoir, le second lit un cumul
**différent**, dérive une autre clé, réserve une autre intention et rembourse.
Deux avoirs de 2000 sur la même commande, l'unicité ne voyant rien puisque les
deux lignes diffèrent réellement.

**La clé porte désormais l'identité de la demande**, fournie par l'appelant, et
non un état mouvant. Une intention non aboutie se libère, sans quoi une panne
rendrait le remboursement définitivement impossible, ce qu'un test de réessai a
montré.

## LS-159, le contrôle voyait 20 actions sur 29

Le relevé cherchait `-name "actions.ts"` et ne voyait pas les trois fichiers
`actions-*.ts` : neuf Server Actions hors de la boucle, toutes gardées. Le trou
était dans le filet.

L'ancrage devient le marqueur `"use server"`, et un **plancher de complétude**
échoue si moins de 29 actions sont examinées. Face au même défaut, l'ancienne
version rendait 0 en annonçant « toutes gardées », la nouvelle rend 1 et nomme
`reordonnerMediasAction`.

## Deux accrocs de méthode, et ils m'appartiennent

**La suite de mutation lancée pendant que je modifiais les mêmes fichiers.** Elle
restaure ses cibles à chaque cas : `lienDocument` puis l'implémentation Stripe
ont été effacés sous mes doigts. Deux réécritures perdues. Les prochaines
mutations se lancent sur du code figé.

**Une mutation commitée par erreur.** Le script interrompu avait laissé
`tests/aide/reservation-sql.ts` altéré, un `git add -A` l'a emporté dans un
commit, et le dépôt paraissait propre puisque HEAD portait le défaut. La
libération d'une réservation expirée ne décrémentait plus rien. Un test
d'intégration l'a montré, restauré en `c6d8dff`.

**La suite complète s'arrêtait avant mes cas.** Elle a tourné deux heures pour
échouer au cas 56 sur une cible déplacée par LS-158 : mes sept cas LS-132,
situés après, n'ont jamais été joués. Corrigé, puis rejoué en ciblé sur les huit
cas nécessaires.

## Cinq exécutions de CI, quatre échecs, quatre causes distinctes

Le journal ci-dessus a été écrit avant la première exécution. Ce qui a suivi
mérite d'être tracé, aucune cause ne se répétant :

| | Cause | Origine |
|---|---|---|
| 1 | `intention_remboursement` absente de `prisma/sql-manuel/schema.sql`, 35 tables en base contre 34 | mon code |
| 2 | la même table absente du registre RGPD, rangée depuis dans T5 | mon code |
| 3 | avis `GHSA-3f6p-5ww8-9rcr` sur `mysql2` | **externe**, `main` était rouge aussi |
| 4 | le `README.md` annonçait huit overrides, il y en avait neuf | ma correction du point 3 |

**Le point 3 méritait de ne pas être suivi à la lettre.** `npm audit fix --force`
proposait `prisma@6.19.3`, un retour de la 7 vers la 6 annoncé comme *breaking
change* : il aurait cassé le client généré, l'adaptateur et les conventions de
migration. L'override monte `mysql2` en 3.24.2 sans toucher Prisma, resté en
7.9.1. Même piège que `deepmerge-ts`, déjà documenté dans le `README.md`.

**Le point 4 est une erreur de séquence, et elle m'appartient.** J'avais rejoué
les onze contrôles textuels **avant** d'ajouter l'override, donc sur un état que
je modifiais ensuite. Les rejouer après aurait évité un aller-retour entier.

**Le SQL de référence et le registre des traitements ne se dérivent pas du
schéma.** Toute table neuve doit y être portée à la main, et aucun des deux
n'était dans ma liste de vérifications avant de pousser. C'est le troisième et le
quatrième fichier à synchroniser, aux côtés de `schema.prisma` et de la migration.

## Un moniteur qui a conclu à tort

La surveillance de la CI a annoncé « tous les contrôles terminés » alors que le
contrôle gâtant n'était pas encore **inscrit** dans la liste : la condition
« tous les contrôles connus sont non-pending » est trivialement vraie sur une
liste d'un seul élément. Corrigée pour exiger que le contrôle nommé soit présent
ET non-pending.

C'est la variante exacte du piège déjà fiché ce matin, le feu vert étant le
compte des contrôles terminés et jamais l'arrivée d'une notification. Cette
fois le défaut venait de ma propre boucle.

## Vérifications

```
npm run type-check                                    OK
npm run lint                                          OK
npm run format:check                                  All matched files use Prettier code style!
npm run test:unitaire                                 388 tests verts
tests intégration acces-document                      23 verts
tests intégration avoir                               16 verts, dont 2 de concurrence
./scripts/verifier-regles.sh                          34 services, frontière Prisma respectée
./scripts/verifier-gardes-administration.sh           29 actions, toutes gardées
./scripts/verifier-gardes-administration-mutation.sh  3 mutations, 3 détectées
./scripts/verifier-nginx-mutation.sh                  7 mutations, 7 détectées
./scripts/verifier-actions-sensibles.sh               OK, 29 fichiers vérifiés
mutation ciblée LS-132                                8 cas, 8 détectés après correction
```

## Ce qui reste

**LS-160** créée et liée à LS-128 par `Blocks` : l'écran d'administration du
remboursement, ses deux gardes, la référence de demande stable et le retrait de
la ligne `REMBOURSEMENT` de `.claude/familles-sans-action.txt`, qui deviendra
fausse ce jour-là. Le critère 6 de LS-128 y est explicitement reporté plutôt que
laissé muet dans une story close.

La suite de mutation complète n'a pas été rejouée de bout en bout après la
correction du cas 56. Elle dure plus de deux heures ; les huit cas nécessaires
ont été joués en ciblé.

## Prochaine étape

**LS-82**, l'envoi du lien de facture par email, qui consomme `lienDocument` et
`reemettreJetonDocument` livrés ici. Puis **LS-160** pour l'écran de
remboursement, et **LS-129** reste à confronter au rendu PDF de l'avoir.

## État des tickets

LS-132, LS-128 et LS-159 livrées et closes. LS-160 créée, à faire. LS-84,
LS-85, LS-82, LS-86 et LS-9 restent ouvertes, inchangées.
