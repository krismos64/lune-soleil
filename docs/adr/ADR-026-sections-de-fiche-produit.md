# ADR-026 : sections de fiche produit ordonnées, en remplacement de quatre colonnes fixes

| Champ | Valeur |
|---|---|
| Statut | **Accepté** |
| Date | 30 juillet 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-24, LS-15, **LS-76** qui l'applique |

## Ce que cet ADR modifie

Aucun ADR n'est remplacé. Il **modifie** les éléments suivants :

| Élément | Ce qui change |
|---|---|
| `prisma/schema.prisma` | quatre colonnes de `Produit` remplacées par l'entité `SectionProduit` |
| `prisma/sql-manuel/schema.sql` | traduction physique, index et contraintes |
| `prisma/sql-manuel/002_contraintes_unicite.sql` | **nouveau fichier**, l'unicité différable de l'ordre |
| `prisma/sql-manuel/verifier-schema.sh` | application du nouveau fichier, contrôles de la table |
| `docs/architecture/MODELE-CONCEPTUEL.md` | règles C20 à C23 |
| `docs/architecture/MODELE-LOGIQUE.md` | index, politique de suppression |
| `.claude/rules/frontend-design.md` | table « Fiche produit, ordre des blocs », lignes 8 à 12 |
| LS-24 | le livrable « cinq champs textuels » devient « quatre sections par défaut » |

## Contexte

Le prototype validé par Christophe permet à l'administratrice de gérer librement
les parties de la fiche produit. L'extraction de son bundle,
`AdminPrototype-Gq3RlyTg.js`, montre un état par partie :

```js
{id: "description", title: "Description détaillée", content: "", visible: true}
```

avec ajout, suppression, renommage, masquage et déplacement. Le prototype
l'énonce à l'écran : « Chaque partie est facultative, ordonnable et visible
uniquement si l'administratrice le décide. »

Le schéma actuel porte à la place quatre colonnes textuelles sur `Produit` :
`description`, `matieres`, `entretien`, `fabrication`. Leur commentaire les
justifie ainsi :

> Cinq champs textuels et non un moteur d'attributs générique : le catalogue
> compte 10 à 40 références de bijoux, aucune n'exige de structuration par
> attribut typé. Un EAV serait une complexité sans usage.

**Cette justification reste valable et cet ADR ne la contredit pas.** Elle écarte
un moteur d'attributs **typés**, où chaque attribut porterait un type, une unité
et des règles de validation. Du texte titré et ordonné n'est pas cela.

### Le point qui a failli être mal traité

Une première lecture concluait qu'il fallait garder les quatre colonnes **et**
ajouter une entité de sections pour les parties supplémentaires. C'est faux : les
quatre champs actuels correspondent, dans le prototype, à des sections par défaut
et non à des champs distincts. Elles y sont supprimables et renommables comme les
autres.

Conserver les deux aurait créé deux systèmes concurrents pour la même donnée.
L'administratrice qui renomme « Matières et composants » en « Composants » aurait
produit un état que le modèle ne sait pas représenter : la colonne `matieres`
existe toujours, mais son titre a changé, et rien ne dit lequel des deux affiche
la fiche.

## Décision

### 1. Ce qui reste un champ structuré

**`Produit.descriptionCourte` reste un champ fixe.** Il alimente les cartes de
catalogue et le haut de fiche, pas seulement la fiche produit. En faire une
section rendrait possible sa suppression, ce qui viderait les cartes du
catalogue. Un usage transversal justifie un champ dédié.

**`Variante.dimensions` reste un champ structuré distinct, et reste la source de
vérité des dimensions.** Elles appartiennent à la variante et non au produit : un
collier existe en 40 et 45 cm, et c'est précisément ce qui distingue les deux
déclinaisons.

**Aucune section « Dimensions » n'est proposée par défaut.** En proposer une
créerait une double saisie et un risque de contradiction entre une dimension
structurée par variante et un texte libre au niveau du produit.

Une section personnalisée peut porter des explications générales, un guide des
tailles par exemple. Elle ne remplace ni ne duplique la dimension structurée de
la variante. La distinction se documente dans l'interface d'administration, afin
que l'usage prévu soit lisible au moment de la saisie.

### 2. L'entité `SectionProduit`

```prisma
model SectionProduit {
  id        String  @id @default(uuid())
  produitId String  @map("produit_id")
  // Identifiant stable et technique, indépendant du titre modifiable.
  // Vaut `description`, `matieres`, `fabrication` ou `entretien` pour les
  // quatre sections proposées par défaut, et une valeur générée pour une
  // section créée par l'administratrice.
  cle       String
  titre     String
  contenu   String
  ordre     Int
  visible   Boolean @default(true)
  creeA     DateTime @default(now()) @map("cree_a") @db.Timestamptz(3)
  modifieA  DateTime @updatedAt @map("modifie_a") @db.Timestamptz(3)

  produit Produit @relation(fields: [produitId], references: [id], onDelete: Cascade)

  @@unique([produitId, cle], map: "section_produit_cle_unique")
  // L'unicité de `ordre` n'est PAS déclarée ici : elle doit être différable, ce
  // que le langage de schéma de Prisma 7 ne sait pas exprimer. Elle est portée
  // par la migration SQL manuelle, voir la décision 5 bis ci-dessous.
  //
  // Aucun `@@index([produitId])` : mesuré redondant, voir la décision 5 ter.
  @@map("section_produit")
}
```

### 3. Les quatre sections proposées par défaut

À la création d'un produit, quatre sections sont proposées, dans cet ordre :

| Ordre | Clé | Titre proposé |
|---|---|---|
| 1 | `description` | Description détaillée |
| 2 | `matieres` | Matières et composants |
| 3 | `fabrication` | Fabrication |
| 4 | `entretien` | Conseils d'entretien |

Le libellé retenu pour la deuxième est **« Matières et composants »**, confirmé
par Christophe le 30 juillet 2026. `frontend-design.md` porte aujourd'hui
« Matières et finitions » à sa ligne 187 : c'est cette table qui s'aligne, le
prototype faisant référence sur les libellés visibles.

« Proposées » et non « imposées » : l'administratrice peut les renommer, les
réordonner, les masquer, les réafficher et les supprimer, et créer d'autres
sections. Aucune n'est protégée, et aucune ne réapparaît après suppression, voir
la décision 5.

### 4. L'identifiant technique ne dépend pas du titre

`cle` est stable, `titre` est modifiable. Renommer « Matières et composants » en
« Composants » change `titre` et laisse `cle` à `matieres`.

Cette séparation est ce qui rend la migration réversible et le contenu
traçable. Sans elle, le renommage d'une section ferait perdre le lien avec la
colonne dont elle provient, et une future correspondance vers un format
d'échange, un flux de produits par exemple, reposerait sur un libellé que
l'administratrice peut changer à tout moment.

`cle` n'est **jamais affichée**. C'est un identifiant technique, il reste en
ASCII conformément à la règle du projet.

### 5. Comportement d'une section supprimée, et d'une section masquée

Deux gestes distincts, deux effets distincts, à ne pas confondre.

**Masquer** conserve le contenu et le retire de la fiche publique. Réversible :
réafficher restitue le texte. C'est le geste pour une section en cours de
rédaction.

**Supprimer efface la ligne, contenu compris.** Aucune conservation silencieuse
d'un contenu devenu inaccessible : une ligne qu'aucune interface n'affiche et
qu'aucune règle ne rappelle est une donnée orpheline qui réapparaît des mois plus
tard sans que personne sache si elle est à jour.

L'interface avertit avant la suppression que le contenu sera perdu, et propose le
masquage comme solution de rechange quand l'intention est seulement de retirer la
section de la fiche.

Cette décision **ne contredit pas l'invariant 3 sur l'historisation**. Une
section de fiche produit est une donnée de catalogue, modifiable par nature comme
le nom ou le prix. Elle n'entre dans aucune commande ni facture : celles-ci
figent leurs propres libellés au moment de la vente, `LigneCommande`. Supprimer
une section ne touche donc aucune commande passée.

Une variante, elle, ne se supprime jamais, C13, parce qu'une commande la
référence. La différence est là.

**Une section supprimée ne réapparaît jamais d'elle-même.** Les quatre sections
sont proposées **à la création du produit uniquement**. Aucune modification
ultérieure ne les recrée : ni l'enregistrement du produit, ni un changement de
catégorie, ni une republication après dépublication.

C'est un point de conception explicite, et non un détail d'implémentation. Une
initialisation écrite naïvement, du type « garantir que les quatre sections
existent » exécutée à chaque enregistrement, ferait revenir une section que
l'administratrice a délibérément supprimée, avec un contenu vide. Elle la
supprimerait à nouveau, et le cycle se répéterait sans qu'elle comprenne pourquoi.

La création des sections par défaut appartient donc au seul cas d'usage de
création d'un produit. Le recréer volontairement reste possible par le bouton
d'ajout, avec le titre de son choix.

### 5 bis. L'unicité de l'ordre est différable, et portée par la migration SQL

```sql
ALTER TABLE section_produit
  ADD CONSTRAINT section_produit_ordre_unique
  UNIQUE (produit_id, ordre) DEFERRABLE INITIALLY DEFERRED;
```

**Une transaction seule ne suffit pas.** Une contrainte `UNIQUE` ordinaire est
vérifiée à chaque instruction, pas au `COMMIT` : la première mise à jour d'un
échange viole la contrainte avant que la seconde ne rétablisse la cohérence. La
transaction garantit l'atomicité, elle ne repousse pas la vérification.

Mesuré sur PostgreSQL 18.4, la version des contrôles du projet :

```
=== ROUGE : echange en transaction, contrainte NON differable ===
BEGIN
ERROR:  duplicate key value violates unique constraint "sec_nd_ordre_unique"
DETAIL:  Key (produit_id, ordre)=(p1, 2) already exists.
ROLLBACK
--- etat : inchange, a=1 b=2, l'echange n'a pas eu lieu

=== VERT 1 : echange en transaction, contrainte DIFFERABLE ===
BEGIN / UPDATE 1 / UPDATE 1 / COMMIT
--- etat : inverse, a=2 b=1

=== VERT 2 : la protection tient toujours, doublon refuse au COMMIT ===
BEGIN / UPDATE 1 / COMMIT
ERROR:  duplicate key value violates unique constraint "sec_d_ordre_unique"
--- etat : inchange, a=2 b=1
```

La protection en base est donc conservée : le différé déplace le moment de la
vérification, il ne la supprime pas. Un doublon est refusé au `COMMIT`, que la
tentative vienne d'une mise à jour ou d'une insertion, les deux cas étant
mesurés.

**Prisma 7 ne sait pas exprimer `DEFERRABLE`.** Ni `@@unique` ni `@@index`
n'exposent ce paramètre, vérifié via Context7 sur Prisma 7.6.0. La contrainte
s'écrit donc en SQL, comme les contraintes `CHECK` que Prisma ne génère pas non
plus. Leur nombre n'est pas écrit ici : il a déjà été faux deux fois sur ce
projet, et un compteur en toutes lettres se périme à chaque ajout. La commande
qui donne la réponse :

```bash
grep -c "ADD CONSTRAINT" prisma/sql-manuel/001_contraintes_check.sql
```

**Aucun `@@unique` Prisma n'est conservé sur `[produitId, ordre]`.** En garder un
créerait une seconde contrainte non différable sur les mêmes colonnes, qui
rejetterait l'échange dès la première instruction et annulerait tout le bénéfice
du différé.

#### Où vit la contrainte, et l'état transitoire à ne pas figer

Elle ne va **pas** dans `001_contraintes_check.sql` : ce fichier porte des
contraintes `CHECK`, une `UNIQUE` y serait une catégorisation trompeuse. Elle va
dans un fichier voisin dédié, `002_contraintes_unicite.sql`, que
`verifier-schema.sh` applique après le premier.

Renommer le fichier existant en un nom générique a été envisagé et écarté : il est
cité treize fois, dont quatre dans des journaux de sessions passées que la règle
de rédaction prospective interdit de réécrire.

**L'état actuel est transitoire, et cette phrase ne décrit que lui.** Tant que la
contrainte n'existe que dans un fichier SQL manuel, `prisma migrate deploy` ne
l'applique pas.

**LS-67 doit la porter dans une migration Prisma SQL versionnée**, au même titre
que les contraintes `CHECK`. Elle sera alors appliquée normalement en
développement, en intégration continue et en production, par le mécanisme de
migration ordinaire.

Après LS-67, les fichiers de `prisma/sql-manuel/` restent une **source de
conception et de contrôle**, lue par `verifier-schema.sh` pour vérifier que la
base correspond à l'intention. Ils ne constituent pas un second mécanisme
permanent de déploiement, et rien ne doit dépendre de leur application manuelle en
production.

#### Une contrainte différable ne peut pas arbitrer un `ON CONFLICT`

PostgreSQL refuse explicitement cet usage. Mesuré sur 18.4, dans les deux formes
d'écriture :

```
=== ON CONFLICT (produit_id, ordre) DO NOTHING ===
ERROR:  ON CONFLICT does not support deferrable unique constraints/exclusion
        constraints as arbiters

=== ON CONFLICT ON CONSTRAINT s_cle_unique DO NOTHING ===
ERROR:  ON CONFLICT does not support deferrable unique constraints/exclusion
        constraints as arbiters
```

Conséquences pour l'implémentation :

- le réordonnancement s'écrit avec des `UPDATE` dans une transaction, jamais avec
  un upsert
- **aucun `upsert` ne prend `(produit_id, ordre)` comme clé de conflit**, ni en
  SQL, ni via l'API `upsert` de Prisma
- un upsert reste possible sur `(produit_id, cle)`, cette contrainte n'étant pas
  différable

Ce point mérite d'être écrit parce que l'échec est tardif : le code compile, la
requête est syntaxiquement correcte, et l'erreur ne survient qu'à l'exécution
contre une vraie base.

### 5 ter. Aucun index dédié sur `produitId`

`@@index([produitId])` est **redondant** et n'est pas créé. Les deux contraintes
d'unicité portent `produit_id` en préfixe gauche, ce qui sert déjà les requêtes
filtrant sur le seul produit.

Mesuré sur PostgreSQL 18.4, 12 000 lignes, sur la requête réelle de la fiche
produit, sections visibles ordonnées :

| Index disponibles | Plan retenu | Coût |
|---|---|---|
| avec l'index dédié | `Bitmap Index Scan on sec_i_produit_idx` | `shared hit=8`, 0,021 ms |
| sans l'index dédié | `Bitmap Index Scan on sec_i_ordre_unique` | `shared hit=8`, 0,022 ms |

Même forme de plan, mêmes tampons touchés. L'index dédié n'apporte aucun plan
d'accès distinct : il coûterait de l'écriture à chaque modification sans rien
accélérer.

### 6. Contenu textuel, sans HTML libre

`contenu` porte du **texte simple**. Pas de HTML libre, pas d'éditeur riche.

Le rendu convertit les sauts de ligne en paragraphes, et rien d'autre.
`dangerouslySetInnerHTML`, et tout rendu HTML équivalent, est **interdit sur ce
champ**. C'est l'interdiction qui compte : React échappe le texte par défaut, donc
du HTML stocké s'afficherait comme des caractères visibles, sans exécution. Le
risque naît du rendu, pas du stockage.

Trois raisons justifient la décision, et non un risque d'exécution automatique :

**Surface d'attaque réduite.** Tant qu'aucun champ n'est rendu en HTML, aucune
revue future n'a à vérifier qu'un assainissement est correct et à jour. Une règle
absolue se contrôle par recherche textuelle, une politique d'assainissement se
contourne par oubli.

**Validation simple.** Valider du texte, c'est une longueur maximale. Valider du
HTML suppose une liste blanche de balises et d'attributs, la gestion des URL dans
les liens, et le suivi des contournements connus de la bibliothèque retenue. Pour
un catalogue de 10 à 40 bijoux, le rapport coût-bénéfice est mauvais.

**Cohérence visuelle.** Du HTML saisi à la main produit des fiches dépareillées,
tailles et graisses variables selon la section. La mise en forme reste portée par
les jetons d'ADR-022, ce qui garantit une fiche homogène quelle que soit la
personne qui l'a remplie.

Si un besoin de mise en forme apparaît, une liste à puces par exemple, il se
traite par une syntaxe restreinte convertie côté serveur, jamais par du HTML
accepté tel quel. Ce serait un ADR distinct.

### 7. Ce qui reste hors de cet éditeur

Les blocs système ne sont pas des sections et n'apparaissent pas dans l'éditeur :

| Bloc | Pourquoi il reste hors éditeur |
|---|---|
| Informations de livraison | tarifs et délais viennent de la configuration, jamais saisis à la main, sous peine d'information précontractuelle fausse |
| Retours et rétractation | textes légaux, leur modification engage juridiquement |
| Avis vérifiés | données issues des commandes, pas du catalogue |

`frontend-design.md` l'énonce déjà pour la livraison : aucun tarif ni seuil écrit
en dur, tout vient d'une configuration centralisée. Rendre ces blocs éditables
comme du texte libre ouvrirait exactement le défaut que cette règle prévient, un
tarif affiché divergeant du tarif facturé.

## Règles de gestion ajoutées au modèle conceptuel

| Règle | Énoncé |
|---|---|
| C20 | Une section de fiche produit appartient à un produit et porte une clé technique stable, unique par produit, indépendante de son titre modifiable. |
| C21 | Quatre sections sont proposées **à la création** d'un produit : `description`, `matieres`, `fabrication`, `entretien`. Aucune n'est protégée : toutes peuvent être renommées, réordonnées, masquées ou supprimées. Aucune modification ultérieure ne recrée une section supprimée. |
| C22 | L'ordre d'affichage est unique par produit, garanti par une contrainte différable vérifiée au `COMMIT`, ce qui autorise l'échange de deux positions dans une transaction. Une section masquée conserve son contenu et n'apparaît pas sur la fiche publique. Une section supprimée est effacée, contenu compris, sans conservation. |
| C23 | Le contenu d'une section est du texte simple. Il n'est jamais rendu en HTML, `dangerouslySetInnerHTML` et tout équivalent étant interdits sur ce champ. Une section sans contenu ne s'affiche pas, y compris son titre. |

C23 reprend la règle existante de `frontend-design.md` : « Un bloc vide ne
s'affiche pas, il ne montre jamais un intitulé sans contenu. »

## Conséquences

### Sur les données

Le catalogue réel est **vide** : aucun produit n'existe en base et la migration
initiale n'a pas encore été jouée. Il n'y a donc **aucune donnée à reprendre**,
et c'est ce qui rend cette décision peu coûteuse maintenant. Prise après LS-66,
elle aurait exigé une migration de données sur un catalogue en production.

C'est la raison pour laquelle cette correction précède LS-66.

### Sur la contrainte d'ordre unique

La contrainte différable règle le cas de l'échange, décision 5 bis. Deux
conséquences restent à porter dans la story.

**La réorganisation s'exécute dans une transaction**, non pour repousser la
vérification, ce que fait déjà le différé, mais parce qu'un échange partiellement
appliqué laisserait deux sections au même rang si le processus s'interrompait
entre les deux instructions.

**La contrainte vit aujourd'hui dans un fichier SQL manuel**, état transitoire :
`prisma migrate deploy` ne l'applique pas encore. LS-67 la porte dans une
migration Prisma SQL versionnée, comme les contraintes `CHECK`, après
quoi elle est déployée par le mécanisme ordinaire. Son compte se mesure, il ne se
recopie pas.

**Aucun upsert sur `(produit_id, ordre)`.** Une contrainte différable ne peut pas
arbitrer un `ON CONFLICT`, PostgreSQL le refuse. Le réordonnancement s'écrit en
`UPDATE`.

Deux tests d'intégration sont exigés, avec preuve rouge puis verte :

1. un échange réel de deux positions réussit dans une transaction
2. deux sections ne peuvent pas conserver le même ordre au `COMMIT`

Le second est celui qui prouve que le différé n'a pas supprimé la protection. Un
test qui ne vérifierait que le premier passerait aussi avec la contrainte
absente.

### Sur l'interface d'administration

L'éditeur porte, par section : titre modifiable, contenu, bascule de visibilité,
déplacement haut et bas, suppression avec avertissement. Plus un bouton d'ajout.
Le prototype montre déjà cette disposition.

Le prototype devra être ajusté sur un point : il propose une section
« Dimensions » par défaut, que cet ADR écarte.

### Sur la fiche publique

La table « Fiche produit, ordre des blocs » de `frontend-design.md` change. Ses
lignes 8 à 12 citent quatre sources qui disparaissent, plus la ligne Dimensions
qui reste sur `Variante.dimensions`.

Les blocs 1 à 7 et 13 à 14 sont inchangés. Entre eux s'insèrent les sections
visibles et non vides du produit, dans leur ordre. Les blocs système gardent leur
position fixe.

### Sur les contrôles existants

`scripts/verifier-regles.sh` confronte `.claude/rules/` au schéma et cite
35 identifiants métier. Les quatre colonnes supprimées y sont peut-être
référencées : le script doit rester vert après la migration, et les identifiants
C20 à C23 s'ajouter à sa couverture.

`verifier-schema.sh` gagne les contrôles de la nouvelle table. Son compte de
réussites augmente ; **ce compte se mesure, il ne se recopie pas depuis ce
document**, leçon de LS-67.

## Alternatives écartées

**Garder les quatre colonnes et ajouter une entité pour les seules sections
supplémentaires.** Écarté : deux systèmes concurrents pour la même donnée, et
aucun moyen de représenter le renommage d'une section par défaut. C'est
l'alternative que l'analyse initiale proposait, avant l'extraction du prototype.

**Un moteur d'attributs typés, EAV.** Écarté, conformément à la justification
existante du schéma et à `frontend-design.md` qui l'inscrit dans les écartés. Le
besoin est du texte titré, pas des attributs typés avec unités et validation.

**Une colonne JSON portant un tableau de sections.** Tentant, une seule colonne
et aucune jointure. Écarté : ni l'unicité de l'ordre ni celle de la clé ne
seraient exprimables par une contrainte de base, elles retomberaient sur du code
applicatif. Le projet pose comme principe qu'un invariant se garantit en base
plutôt que par du code qu'on peut oublier, le même raisonnement qui a écarté,
dans ADR-023, la vérification applicative de la longueur de mot de passe. Une
table permet de garder les deux garanties en base, dont l'une différable.

**Interdire la suppression, ne permettre que le masquage.** Écarté : le prototype
valide la suppression, et une section créée par erreur doit pouvoir disparaître.
L'avertissement avant suppression couvre le risque de perte.

**Une contrainte `UNIQUE` ordinaire sur `[produitId, ordre]`, la réorganisation
se faisant en transaction.** Écarté parce que **cela ne fonctionne pas** : une
contrainte non différable est vérifiée à chaque instruction, l'échange échoue donc
sur la première. Mesuré, voir la décision 5 bis. C'était la formulation de la
première version de cet ADR, corrigée par Christophe.

**Aucune contrainte en base, l'unicité de l'ordre étant garantie par le
service.** Écarté : le projet pose comme principe qu'un invariant se garantit en
base plutôt que par du code qu'on peut oublier. La contrainte différable permet
de garder la protection sans empêcher l'échange, il n'y a donc rien à
sacrifier.

**Un ordre non contraint, avec un tri stable de repli sur l'identifiant.**
Écarté : deux sections au même rang produiraient un ordre d'affichage dépendant
d'un détail d'implémentation, donc instable entre deux versions de la requête.

**Conserver le contenu d'une section supprimée dans une colonne d'archive.**
Écarté à la demande explicite de Christophe : pas de conservation silencieuse
d'un contenu devenu inaccessible.

## Ce que cet ADR ne décide pas

Le format d'une éventuelle syntaxe de mise en forme restreinte, si le besoin
apparaît. La traduction, hors périmètre V1, la boutique étant francophone. La
reprise du prototype sur le point des dimensions, qui est une tâche et non une
décision.
