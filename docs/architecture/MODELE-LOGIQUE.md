# Modèle logique de données

| Champ | Valeur |
|---|---|
| Ticket | LS-13 |
| Entrée | `MODELE-CONCEPTUEL.md`, huit parcours, cinquante-sept cas d'erreur |
| Vérifié sur | PostgreSQL 18.4, Prisma 7.9.1, Node 22.14.0 |
| Livrables | `prisma/schema.prisma`, `prisma/migrations/manual/` |

Traduction du modèle conceptuel en schéma physique. Vingt-cinq tables, sept
domaines, trente et une clés étrangères.

## Conventions fixées par cette story

**Nommage.** Modèles et champs en `camelCase` côté Prisma, tables et colonnes en
`snake_case` en base, via `@map` et `@@map`.

Le motif est le SQL brut. ADR-006 impose un `$queryRaw` pour la réservation
atomique, et le projet compte dix transactions critiques dont plusieurs
s'écriront à la main. PostgreSQL replie les identifiants non cités en
minuscules : en `camelCase`, chaque colonne exigerait des guillemets doubles, et
un guillemet oublié vise silencieusement une colonne inexistante.

**Numérotation.** Trois séquences distinctes, remises à zéro chaque année.

| Document | Format |
|---|---|
| Commande | `C-2026-0001` |
| Facture | `F-2026-0001` |
| Avoir | `A-2026-0001` |

Le numéro est attribué **dans la transaction** qui crée le document, jamais
réservé à l'avance, règle F4. La lettre identifie le type au premier regard, ce
qui compte quand un client dicte son numéro au téléphone.

**Montants.** Entiers en centimes, invariant 1. Aucun type flottant n'apparaît
dans le schéma.

**Horodatages.** `DateTime` en UTC, invariant 8. Le suffixe `A` des champs se lit
« à », `creeA` pour « créé à ».

## Ce que Prisma génère, et ce qu'il ne génère pas

**Découverte de LS-13, qui corrige une affirmation du projet.**

Prisma 7.9.1 **génère les index partiels**, via la fonctionnalité en
avant-première `partialIndexes`. Vérifié sur le cas exact du projet :

```sql
CREATE UNIQUE INDEX "utilisateur_administratrice_unique"
  ON "utilisateur"("role") WHERE (role = 'ADMINISTRATRICE');
```

Le SQL manuel n'est donc plus nécessaire pour ces contraintes, contrairement à ce
qu'affirmaient ADR-023 et le modèle conceptuel avant cette story. Les six index
partiels du modèle sont produits par `prisma migrate diff`.

Prisma ne génère **pas** les contraintes `CHECK`. ADR-006 reste exact sur ce
point. Elles vivent dans `prisma/migrations/manual/001_contraintes_check.sql`,
seize contraintes à recopier dans la migration Prisma en phase 1.

## Les six index partiels

Chacun traduit une règle que le récapitulatif du modèle conceptuel range au
niveau 1, garanti par la base.

| Index | Filtre | Règle |
|---|---|---|
| `media_principal_unique` | `ordre = 1` | C9, un seul média principal |
| `mouvement_vente_web_unique` | `type = 'VENTE_WEB'` | S7, décision D |
| `paiement_reussi_unique` | `statut = 'REUSSI'` | V14, décision D |
| `journal_email_systeme_unique` | `statut = 'ENVOYE' AND origine IN ('SYSTEME','RECONCILIATION')` | E5, décision D |
| `adresse_defaut_unique` | `est_par_defaut` | A2, une adresse par défaut |
| `utilisateur_administratrice_unique` | `role = 'ADMINISTRATRICE'` | E1, ADR-023 |

**Le filtre est ce qui rend chaque contrainte utilisable.** Sans lui, l'unicité
sur `role` interdirait un second compte client, celle sur `produit_id`
interdirait un second média, et celle sur `commande_id` interdirait un panier à
plusieurs articles. C'est le défaut qui avait été introduit puis corrigé en
LS-12.

## Les politiques de suppression

Trente et une clés étrangères, trois politiques.

| Politique | Occurrences | Motif |
|---|---|---|
| `RESTRICT` | 17 | rien d'historique ne se supprime par effet de bord |
| `SET NULL` | 12 | le lien disparaît, la ligne survit |
| `CASCADE` | 2 | l'enfant n'a aucun sens sans son parent |

Les deux cascades portent sur `Media` vers `Produit` et sur `AdresseCarnet` vers
`Utilisateur`. La seconde est la traduction de la règle A10.

**`Commande.utilisateurId` est en `SET NULL` et cela ne suffit pas.** Une
politique de clé étrangère ne sait pas écrire un champ : `dissocieA` doit être
renseigné dans la même transaction, avant la suppression. C'est la transaction 10
de `.claude/rules/database.md`. Sans elle, une commande dissociée redevient
« sans propriétaire » et donc éligible au rattachement du parcours 6, ce qui
rouvrirait l'historique d'un client parti.

## Ce qui reste hors du schéma

**Les entités Better Auth**, session, compte et passkey. Elles sont générées par
la bibliothèque en phase 1, conformément à ADR-021 pour l'administration et
ADR-023 pour les clients. Le champ `role` de `Utilisateur` se déclare en
`additionalFields` avec `input: false`, règle E11.

**Les contrôles applicatifs de niveau 3**, qu'aucune contrainte ne peut porter :
C1 compte les lignes d'une autre table, L9 vérifie trois conditions à chaque
lecture de jeton, A11 recoupe une écriture sur la session.

## Vérification

`prisma/migrations/manual/verifier-schema.sh` rejoue vingt-neuf contrôles sur
une base PostgreSQL 18.4 jetable. Il couvre ce que le prototype d'ADR-006
vérifiait sur deux tables, et l'étend aux contraintes nées de LS-37 à LS-41.

```
Réservation de stock, ADR-006
  OK    une réservation sur une pièce unique réussit
  OK    la seconde réservation ne trouve plus de stock
  OK    vente web suspendue, aucune réservation
  OK    variante archivée, aucune réservation, C15
  OK    la survente est rejetée par le CHECK, C6

Concurrence, deux acheteurs sur la dernière pièce
  OK    cinq tentatives simultanées, une seule réservation
  OK    la quantité réservée reste à un

  29 réussites, 0 échecs
```

Le test de concurrence est le contrôle qui compte : cinq réservations lancées
simultanément sur une pièce unique produisent **une seule** réservation. C'est le
jalon technique du projet, vérifié cette fois sur le schéma complet et non sur
un prototype isolé.

Deux cas couverts par LS-13 que le prototype d'ADR-006 ignorait, parce qu'ils
sont nés après lui : la variante archivée non réservable, règle C15 de LS-37, et
le panier multi-articles qui produit deux mouvements de stock, corrigé en LS-12.

### Une assertion nomme toujours la contrainte attendue

La première version du script cherchait simplement « violates » dans la sortie
de PostgreSQL. Le contrôle « second avis rejeté » validait en réalité une
violation de **clé étrangère** : deux instructions dans un même `psql -c`
partagent une transaction implicite, le rejet de la première annulait la ligne de
commande, et l'insertion suivante échouait pour une raison sans rapport.

Ce contrôle serait passé à l'identique si l'index unique avait été absent du
schéma. Un test qui passe pour la mauvaise raison est pire qu'un test absent :
il donne une confiance que rien ne fonde.

Chaque `verifier_rejet` nomme donc désormais la contrainte attendue, et un rejet
par une autre contrainte est signalé comme un échec.

**Le même défaut existait en miroir sur les contrôles d'acceptation**, trouvé à
la passe suivante. Ils s'écrivaient `verifier "..." "" "$(grep -i violation)"`,
or PostgreSQL écrit toujours « violates », jamais « violation » : le `grep`
retournait une chaîne vide quelle que soit la réponse de la base, et la
comparaison était vraie par construction. Six contrôles ne testaient rien, dont
celui censé détecter la régression de LS-12 sur le panier multi-articles.

D'où `verifier_accepte`, symétrique, qui échoue sur `^ERROR:` autant que sur
`violates` : une erreur de syntaxe ou une colonne inexistante passait elle aussi
inaperçue.

### Le script est vérifié par mutation

Affirmer qu'un test détecte un défaut ne suffit pas, il faut le prouver. Deux
mutations ont été injectées dans le schéma, chacune réintroduisant un défaut réel
de l'historique du projet.

| Mutation | Résultat |
|---|---|
| clé email revenue à `origine = 'SYSTEME'` seul | 2 échecs, dont la retentative après échec |
| clé mouvement sur `commande_id` seul, régression LS-12 | 1 échec, panier multi-articles |

Avant la correction des assertions, ces deux mutations passaient au vert. C'est
la seule preuve qui compte : un test qui ne rougit sur aucune mutation ne garde
rien.

### Deux défauts d'idempotence trouvés par la revue

La clé du journal d'email filtrait sur `origine = 'SYSTEME'` seul. Deux cas
passaient au travers.

**Une ligne `ECHOUE` occupait la clé**, ce qui condamnait la retentative : une
panne du fournisseur d'email à 14 h 02 privait définitivement le client de son
email d'expédition, contre la règle E4. **Et le chemin `RECONCILIATION`
n'était pas couvert**, alors que c'est le second chemin d'entrée que la décision
D existe pour neutraliser : un webhook tardif envoyait une seconde confirmation
de commande.

Le filtre porte maintenant les trois conditions, et quatre contrôles couvrent ces
chemins.

## Contraintes d'environnement

**Node 22 LTS.** Prisma 7 refuse les versions impaires : 20.19+, 22.12+ ou 24.0+
uniquement. La machine de développement portait Node 23.9.0, incompatible. À
fixer dans `.nvmrc`, dans `engines` du `package.json`, dans le `Dockerfile` et
dans l'intégration continue, en phase 1.

**Prisma 7 a supprimé `url` du bloc `datasource`.** La chaîne de connexion passe
par un fichier `prisma.config.ts` à la racine :

```ts
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

Ce fichier appartient à la phase 1, LS-13 ne l'installe pas dans le dépôt.

## Ce que LS-13 ne fait pas

L'initialisation du projet, `package.json`, Next.js, Docker Compose et
l'exécution de `prisma migrate dev` appartiennent à la **phase 1**, LS-2, dont la
description porte explicitement « ORM et migration initiale ».

LS-13 produit un schéma et une migration **prouvés**, que la phase 1 branchera
sur un projet réel sans avoir à les concevoir.
