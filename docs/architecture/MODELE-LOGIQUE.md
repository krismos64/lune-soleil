# Modèle logique de données

| Champ | Valeur |
|---|---|
| Ticket | LS-13 |
| Entrée | `MODELE-CONCEPTUEL.md`, huit parcours, cinquante-sept cas d'erreur |
| Vérifié sur | PostgreSQL 18.4, Prisma 7.9.1, Node 22.14.0 |
| Livrables | `prisma/schema.prisma`, `prisma/sql-manuel/` |

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

**Le mécanisme est une table compteur**, `CompteurNumero`, ADR-031 et LS-117 :
une ligne par type et par année, incrémentée par `INSERT ... ON CONFLICT DO
UPDATE ... RETURNING`. Le verrou de ligne fait que la transaction annulée rend
son numéro, donc aucun trou. Une `SEQUENCE` PostgreSQL, non transactionnelle, en
créerait un à chaque refus de stock, cas fréquent sur un catalogue de pièces
uniques. L'année vient de `now()`, jamais de l'horloge Node, règle C27.

La remise à zéro annuelle est implicite, une nouvelle année créant sa ligne au
premier document : aucun amorçage manuel du 1er janvier, dont l'oubli bloquerait
toute vente.

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
point. Leur source de conception est
`prisma/sql-manuel/001_contraintes_check.sql`, et depuis LS-67 elles sont posées
par une migration versionnée, donc déployées comme le reste du schéma.

Un second fichier, `002_contraintes_unicite.sql`, porte les contraintes `UNIQUE`
que Prisma ne sait pas exprimer non plus, LS-76. Il est séparé du premier parce
que celui-ci porte des `CHECK` : y ranger une `UNIQUE` serait une catégorisation
trompeuse. `verifier-schema.sh` lit les deux pour confronter la base à
l'intention.

Leur nombre n'est pas écrit ici : il a déjà été faux une fois, ce document
annonçant seize contraintes après que LS-45 en eut ajouté une dix-septième. Un
compteur en toutes lettres se périme à chaque ajout, et sert de liste de contrôle
pour la phase 1, donc un écart d'une unité fait manquer une contrainte en
silence. Les commandes qui donnent la réponse :

```bash
grep -c "ADD CONSTRAINT" prisma/sql-manuel/001_contraintes_check.sql
grep -c "ADD CONSTRAINT" prisma/sql-manuel/002_contraintes_unicite.sql
```

### La contrainte différable de LS-76

`section_produit_ordre_unique` est déclarée
`UNIQUE (produit_id, ordre) DEFERRABLE INITIALLY DEFERRED`, ADR-026.

Une contrainte `UNIQUE` ordinaire est vérifiée à chaque instruction : l'échange
de deux positions la violerait sur la première des deux mises à jour, avant que
la seconde ne rétablisse la cohérence. Mesuré sur PostgreSQL 18.4. Le différé
déplace la vérification au `COMMIT` sans supprimer la protection, un doublon
restant refusé.

**Ne pas ajouter de `@@unique([produitId, ordre])` dans `schema.prisma`** : la
version non différable rejetterait l'échange et annulerait le bénéfice.

Deux conséquences pour l'implémentation :

- une contrainte différable **ne peut pas arbitrer un `ON CONFLICT`**, PostgreSQL
  le refuse. Le réordonnancement s'écrit en `UPDATE` dans une transaction, aucun
  upsert ne prend `(produit_id, ordre)` comme clé de conflit
- même piège que la permutation de rangs de médias, mais résolu autrement : un
  index partiel unique ne peut pas être différé, seule une contrainte le peut.
  C'est pourquoi A6 impose un ordre d'écriture là où C22 ne l'impose pas

**Déploiement, réglé par LS-67.** Ces contraintes sont posées par la migration
`20260731050325_contraintes_check_et_unicite_differable`, donc appliquées par
`prisma migrate deploy` en développement, en intégration continue et en
production. Vérifié sur une base issue des seules migrations : 25 `CHECK` sur 25
et `condeferrable = t`, là où la même mesure donnait zéro avant la story.

Les fichiers de `prisma/sql-manuel/` restent une source de **conception et de
contrôle**, lue par `verifier-schema.sh`. **Ne pas les réappliquer à la main** :
une base locale rendue conforme après coup masquerait une migration incomplète,
et le défaut n'apparaîtrait qu'en production. `preparer-base-locale.sh` compare
désormais le compte en base à ces fichiers et échoue en cas d'écart.

## Les sept index partiels

Chacun traduit une règle que le récapitulatif du modèle conceptuel range au
niveau 1, garanti par la base.

| Index | Filtre | Règle |
|---|---|---|
| `media_principal_unique` | `ordre = 1` | C9, un seul média principal |
| `mouvement_vente_web_unique` | `type = 'VENTE_WEB'` | S7, décision D |
| `paiement_reussi_unique` | `statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')` | V14, décision D, corrigé par LS-45 |
| `journal_email_systeme_unique` | `statut = 'ENVOYE' AND origine IN ('SYSTEME','RECONCILIATION')` | E5, décision D |
| `envoi_en_attente_actif_unique` | `statut IN ('EN_ATTENTE','ENVOI_EN_COURS')` | E5, ADR-033, première ligne de défense |
| `adresse_defaut_unique` | `est_par_defaut` | A2, une adresse par défaut |
| `utilisateur_administratrice_unique` | `role = 'ADMINISTRATRICE'` | E1, ADR-023 |

**Les deux index de la règle E5 ne font pas double emploi.** Celui de
`journal_email` empêche deux traces d'envoi réussi ; celui d'`envoi_en_attente`
empêche deux **intentions** actives, donc deux appels au serveur. Le second agit
avant que le message ne parte, le premier constate après coup : garder le seul
`journal_email` laisserait deux messages arriver chez le client, et seule la
seconde écriture de trace serait refusée, trop tard.

**Le filtre est ce qui rend chaque contrainte utilisable.** Sans lui, l'unicité
sur `role` interdirait un second compte client, celle sur `produit_id`
interdirait un second média, et celle sur `commande_id` interdirait un panier à
plusieurs articles. C'est le défaut qui avait été introduit puis corrigé en
LS-12.

**Un filtre trop étroit est le défaut symétrique**, et il est plus discret. Celui
du paiement portait `statut = 'REUSSI'` seul : un paiement passant à
`PARTIELLEMENT_REMBOURSE` sortait du filtre, et un second `REUSSI` redevenait
insérable sur la même commande. Corrigé par LS-45, après mesure de 3220 centimes
encaissés sur une commande de 1610. Ajouter un état d'encaissement à l'enum
oblige à l'ajouter au filtre.

## Les politiques de suppression

Trois politiques. Les occurrences ci-dessous sont **mesurées en base** le
30 juillet 2026, après LS-76, et non comptées à la main :

```sql
SELECT confdeltype, count(*) FROM pg_constraint WHERE contype='f'
GROUP BY confdeltype;
```

| Politique | Occurrences | Motif |
|---|---|---|
| `RESTRICT` | 18 | rien d'historique ne se supprime par effet de bord |
| `SET NULL` | 11 | le lien disparaît, la ligne survit |
| `CASCADE` | 3 | l'enfant n'a aucun sens sans son parent |

Trente-deux clés étrangères au total.

Les chiffres annoncés ici avant LS-76 étaient faux sur deux des trois lignes,
17 et 12 au lieu de 18 et 11, pour un total de 31 au lieu de 32. Personne ne
l'avait vu parce qu'aucun contrôle ne confrontait ces nombres à la base : c'est le
même défaut que le compte de contraintes `CHECK`, corrigé par la commande
ci-dessus. **Recompter plutôt que relire.**

Les trois cascades portent sur `Media` vers `Produit`, `SectionProduit` vers
`Produit`, et `AdresseCarnet` vers `Utilisateur`. La dernière est la traduction de
la règle A10.

`SectionProduit` est en `CASCADE` et non en `RESTRICT`, contrairement à
`Variante` : une section n'est référencée par aucune commande ni facture, elle ne
porte donc aucun historique à protéger. Supprimer un produit emporte ses sections
sans rien perdre d'opposable, ADR-026.

**`Commande.utilisateurId` est en `SET NULL` et cela ne suffit pas.** Une
politique de clé étrangère ne sait pas écrire un champ : `dissocieA` doit être
renseigné dans la même transaction, avant la suppression. C'est la transaction 10
de `.claude/rules/database.md`. Sans elle, une commande dissociée redevient
« sans propriétaire » et donc éligible au rattachement du parcours 6, ce qui
rouvrirait l'historique d'un client parti.

## Les entités d'authentification, LS-70

Elles sont **dans le schéma** depuis LS-70, et écrites à la main comme le reste :
`Session`, `Compte`, `Verification` et `Passkey`, plus trois colonnes ajoutées à
`Utilisateur`, `nom`, `image` et `misAJourA`.

Ce document annonçait qu'elles seraient « générées par la bibliothèque ». Le
générateur de Better Auth a été écarté : il écrase les commentaires du fichier,
ignore la convention snake_case de LS-13 et ne connaît pas `@db.Timestamptz(3)`,
donc produirait des horodatages sans fuseau, contre l'invariant 8.

| Table | Politique de suppression | Pourquoi |
|---|---|---|
| `session` | `CASCADE` | un jeton de connexion n'a aucune valeur sans son compte |
| `compte` | `CASCADE` | idem, `password` y porte une **empreinte**, jamais le mot de passe |
| `passkey` | `CASCADE` | une credential orpheline resterait un moyen d'accès sans répondant |
| `verification` | aucune clé étrangère | `identifier` porte une adresse qui n'a pas encore de compte |

Ce `CASCADE` contraste volontairement avec `Commande.utilisateurId`, en
`SET NULL` : une commande survit à la suppression du compte, un moyen d'accès non.

**Les noms de champs restent en camelCase anglais**, là où le reste du schéma est
en français. Ce sont les clés du protocole de Better Auth, pas des champs métier :
les renommer imposerait une entrée `fields:` par colonne, donc autant d'occasions
de désynchroniser. Seuls les noms de tables suivent la convention du projet.

**`passkey.credential_id` porte un `UNIQUE`** que le schéma de référence du plugin
ne pose pas, il n'y met qu'un index ordinaire. Une credential WebAuthn est unique
par construction, rien en base ne l'imposait : deux comptes pouvaient porter la
même, et la recherche par credential à la connexion aurait eu deux comptes à
départager. C'est le risque d'accès croisé qu'ADR-021 demande de couvrir.

## Ce qui reste hors du schéma

**Les contrôles applicatifs de niveau 3**, qu'aucune contrainte ne peut porter :
C1 compte les lignes d'une autre table, L9 vérifie trois conditions à chaque
lecture de jeton, A11 recoupe une écriture sur la session. Le champ `role` de
`Utilisateur` se déclare en `additionalFields` avec `input: false`, règle E11,
qui **ne couvre que les routes de Better Auth** : toute autre écriture y échappe.

## Le montant des ventes externes, LS-63

`MouvementStock` a reçu `prixUnitaireFigeCentimes` le 29 juillet 2026. Le journal
des mouvements enregistrait la variante, la quantité, le canal et la date, sans
aucun montant : le chiffre d'affaires des marchés n'était pas calculable, et il ne
se reconstitue pas depuis `Variante.prixCentimes` sans violer l'invariant 3.

Deux contraintes l'encadrent, et la première n'a pas la forme habituelle.

| Contrainte | Forme | Portée |
|---|---|---|
| `chk_mouvement_vente_externe_prix` | implication | montant obligatoire sur `VENTE_EXTERNE`, autorisé ailleurs |
| `chk_mouvement_prix_positif` | borne | jamais négatif, zéro autorisé pour une pièce offerte |

**L'implication est délibérée**, là où les `CHECK` d'ADR-025 sur le mode de
livraison sont des équivalences. Un prix reste légitime sur un `AJUSTEMENT` :
c'est le mouvement compensateur qui corrige une vente externe erronée, un
mouvement de stock étant immuable, règle S14.

Mesuré par mutation : réécrite en équivalence, la contrainte rejette le
compensateur et le chiffre d'affaires reste à 1100 centimes au lieu de 0, donc une
vente annulée continue de compter.

Un index `mouvement_periode_idx` sur `(creeA, type)` accompagne le champ, toute
statistique bornant une période avant de regrouper par type.

## Vérification

`prisma/sql-manuel/verifier-schema.sh` rejoue soixante-huit contrôles sur
une base PostgreSQL 18.4 jetable. Il couvre ce que le prototype d'ADR-006
vérifiait sur deux tables, et l'étend aux contraintes nées de LS-37 à LS-41, puis
au montant des ventes externes de LS-63.

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
| `chk_mouvement_vente_externe_prix` retirée, LS-63 | 1 échec, vente externe sans montant acceptée |
| la même réécrite en équivalence, LS-63 | 2 échecs, compensateur rejeté et chiffre d'affaires faux |
| `chk_mouvement_prix_positif` retirée, LS-63 | 2 échecs, prix négatif accepté, chiffre d'affaires à -500 |
| colonne `prix_unitaire_fige_centimes` retirée du schéma, LS-63 | aucun contrôle exécuté, le script refuse de partir |

La dernière mutation est la plus instructive. Retirer la colonne casse la création
du schéma, et le garde-fou de LS-48 refuse alors d'exécuter le moindre contrôle
plutôt que d'afficher des réussites qui ne vérifient rien. Une mutation dont
l'effet attendu serait « le contrôle rougit » produit ici « aucun contrôle ne
tourne », ce qui est le bon comportement et non un échec de la mutation.

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
