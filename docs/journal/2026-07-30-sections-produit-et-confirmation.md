# 30 juillet 2026, ADR-026 et LS-76, le schéma prêt pour LS-66

Suite de la session `2026-07-30-initialisation-nextjs.md`, à lire d'abord.

## Ce qui a été fait

### ADR-026, sections de fiche produit, accepté

Présenté en deux temps. La première version portait une erreur technique que
Christophe a corrigée : elle présentait **une transaction seule** comme la
solution au problème de l'échange de positions sous contrainte `UNIQUE`.

C'est faux, et mesuré comme tel sur PostgreSQL 18.4 :

```
ROUGE, contrainte NON différable, échange en transaction
  ERROR:  duplicate key value violates unique constraint
  DETAIL:  Key (produit_id, ordre)=(p1, 2) already exists.

VERT, contrainte DEFERRABLE INITIALLY DEFERRED
  échange réussi, et doublon toujours refusé au COMMIT
```

Une contrainte `UNIQUE` ordinaire est vérifiée **à chaque instruction**. La
transaction garantit l'atomicité, elle ne repousse pas la vérification. Le
projet connaissait déjà ce piège sur les rangs de médias, mais l'avait résolu par
l'ordre des écritures faute de pouvoir différer un index partiel : `database.md`
note qu'« un index ne se diffère pas, seule une contrainte le peut ». Notre cas
utilise une contrainte, le différé est donc possible.

Deux autres corrections demandées, toutes deux vérifiées :

**L'index sur `produitId` était redondant.** Mesuré sur 12 000 lignes, même plan
et mêmes tampons (`shared hit=8`) avec ou sans lui, les deux unicités portant
`produit_id` en préfixe gauche. Retiré.

**La justification du refus de HTML était fausse.** J'avais écrit qu'un HTML
stocké serait injecté dans la page. React échappe le texte par défaut : le risque
naît du rendu, pas du stockage. La décision tient désormais à la réduction de la
surface d'attaque, à la simplicité de validation et à la cohérence visuelle, avec
interdiction explicite de `dangerouslySetInnerHTML` sur ce champ.

### LS-76, le schéma modifié

Story créée et fusionnée dans la même session. Commit `a6fbcd0`, PR 44, fusion en
rebase.

`SectionProduit` remplace les quatre colonnes éditoriales de `Produit`.
`descriptionCourte` reste fixe, `Variante.dimensions` reste la source de vérité
des dimensions, aucune section « Dimensions » par défaut.

`Paiement.confirmeA` ajouté, avec une contrainte d'équivalence sur **les trois**
états d'encaissement. Le point que `STATISTIQUES.md` laissait ouvert est fermé.

`verifier-schema.sh` passe de **68 à 92 réussites, 0 échec**.

## Ce que les contrôles ont trouvé, et que je n'avais pas prévu

### Trois contrôles V14 ont rougi à cause de ma contrainte

Les jeux d'essai de la section d'idempotence inséraient des paiements `REUSSI`
sans date de confirmation. Ma nouvelle contrainte les interceptait, donc le rejet
venait d'elle et non de l'index `paiement_reussi_unique`.

Les contrôles n'ont pas affiché un faux vert : `verifier_rejet` exige le **nom de
la contrainte attendue**, précisément pour ce cas. Il a annoncé « rejeté, mais par
une autre contrainte ». C'est la garantie ajoutée en LS-13 qui a servi ici, deux
semaines après avoir été écrite.

### Un faux vert que j'ai produit puis attrapé

Trois de mes propres contrôles de rejet passaient au vert **en testant le
contraire de ce qu'ils annonçaient**.

Cause : les identifiants `pay1` et `pay2` étaient déjà pris plus haut dans le
script. Mon `UPDATE ... WHERE id = 'pay1'` visait une ligne `REUSSI` portant déjà
sa date, donc l'écriture était légitime et acceptée. Un `UPDATE` qui ne touche
aucune ligne ne lève pas d'erreur non plus, ce qui rend le défaut silencieux dans
les deux cas.

Garde-fou ajouté : un contrôle vérifie que la cible existe **et est dans l'état
attendu** avant les contrôles de rejet.

### Deux chiffres de MODELE-LOGIQUE.md étaient faux avant cette story

Le document annonçait 17 `RESTRICT`, 12 `SET NULL`, 31 clés étrangères. Mesuré :

```sql
SELECT confdeltype, count(*) FROM pg_constraint WHERE contype='f'
GROUP BY confdeltype;
-- r|18  n|11  c|3, total 32
```

Deux des trois lignes étaient fausses **avant** mon travail, personne ne l'avait
vu parce qu'aucun contrôle ne confrontait ces nombres à la base. Même défaut que
le compte de contraintes `CHECK`, corrigé de la même façon : la commande qui
produit le chiffre est écrite à côté de lui.

### Un faux positif que j'ai introduit dans verifier-regles.sh

Le script prenait `dangerouslySetInnerHTML` pour un champ du schéma, sa casse
camelCase correspondant au motif de recherche. Liste d'exclusion explicite d'une
seule valeur, dont j'ai prouvé qu'elle n'aveugle pas le contrôle : deux faux
identifiants injectés sont toujours détectés.

## Preuves par mutation

Quatre mutations sur le schéma, toutes détectées :

| Mutation | Contrôles qui rougissent |
|---|---|
| retirer `DEFERRABLE` | 4 |
| retirer `chk_paiement_confirmation_coherente` | 4 |
| réduire le prédicat au seul `REUSSI` | 2 |
| réintroduire la colonne `matieres` | 1 |

La première mérite un mot : le contrôle « l'échange de positions est effectif » a
attrapé un **rollback silencieux** que les autres auraient laissé passer. Sans
lui, la transaction annulée aurait produit un `verifier_accepte` au vert avec des
positions inchangées.

La troisième reproduit l'erreur exacte de LS-45, celle qui avait compté 3220
centimes encaissés pour 1610.

## Ce qui a dérapé

**J'ai poussé le journal de la session précédente directement sur `main`**, sans
PR, alors que `CONTRIBUTING.md` l'exige même en solo et ne prévoit aucune
exception pour la documentation. Signalé par Christophe. L'historique n'est pas
réécrit, et cette page-ci passe par une branche et une PR.

## Prochaine étape

**LS-66 est débloquée.** Les deux modifications de schéma qui la bloquaient sont
appliquées, contrôlées et fusionnées sur `main`.

Restent à corriger avant d'exécuter les stories concernées, non bloquant pour
LS-66 elle-même :

| Ticket | Correction attendue |
|---|---|
| LS-66 | porter `prisma.config.ts`, que sa description laisse à LS-67 |
| LS-67 | retirer la CI et le Dockerfile de son périmètre, ils n'existent qu'en LS-69 et LS-74. Ajouter `002_contraintes_unicite.sql` à la dette de recopie |
| LS-68 | lever la contradiction entre test rouge exigé et `npm run test` vert |
| LS-70 | seize caractères pour tous les comptes, ADR-023 |

LS-67 gagne un élément de périmètre : la contrainte différable vit aujourd'hui
dans un fichier manuel, donc `prisma migrate deploy` ne l'applique pas. Elle doit
entrer dans une migration versionnée au même titre que les contraintes `CHECK`.

Le prototype devra être ajusté sur un point, il propose une section
« Dimensions » par défaut qu'ADR-026 écarte. Tâche et non décision.

## État des tickets

| Ticket | État |
|---|---|
| LS-65 | Terminé, fusionné, PR 43 |
| LS-76 | Terminé, fusionné, PR 44 |
| LS-66 | À faire, **débloquée**, description à corriger avant exécution |
| LS-67, LS-68, LS-70 | À faire, descriptions à corriger |
