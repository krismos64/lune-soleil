# ADR-030 : un mouvement de stock ne se compense qu'une fois

| Champ | Valeur |
|---|---|
| Statut | **Accepté** |
| Date | 18 août 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-106 |

## Ce que cet ADR tranche

La règle **S14** énonce qu'une vente externe erronée se corrige par un mouvement
inverse, jamais par une modification, et que ce compensateur « porte le même prix
figé et un `motif` ». Elle est muette sur deux points que LS-106 devait trancher
pour écrire l'écran :

1. rien ne **relie** le compensateur au mouvement qu'il corrige
2. rien n'empêche donc de compenser **deux fois** la même vente

Le second point n'est pas théorique : un double clic, un rechargement de page ou
deux onglets ouverts font remonter le stock de deux pièces là où une seule était
partie. L'inventaire devient faux, et le journal ne permet pas de le voir
puisqu'il porte deux corrections en apparence légitimes.

**Arbitrage de Christophe, 18 août 2026 : une colonne `compenseId` porte le lien,
et un index unique partiel rend la double compensation impossible.**

## Contexte

`MouvementStock` est immuable, règle S4, et cette immuabilité est une garantie
comptable : le stock reconstruit depuis le journal doit correspondre au stock
réel. Corriger en place effacerait la trace d'une erreur.

Le journal portait donc déjà deux lignes pour une vente corrigée, mais **sans
qu'aucune donnée ne dise laquelle corrige laquelle**. Le lien n'existait que dans
le texte libre du `motif`, illisible pour toute requête et pour toute contrainte.

## Décision

Une colonne `compenseId` nullable sur `mouvement_stock`, clé étrangère vers cette
même table, et un **index unique partiel** :

```sql
CREATE UNIQUE INDEX mouvement_compense_unique
  ON mouvement_stock (compense_id)
  WHERE compense_id IS NOT NULL;
```

Le prédicat `WHERE compense_id IS NOT NULL` est indispensable : sans lui, un
index unique ordinaire n'autoriserait qu'**un seul** mouvement non compensateur
dans toute la table, PostgreSQL traitant les `NULL` comme distincts mais
l'immense majorité des lignes portant cette valeur.

C'est le même motif que `mouvement_vente_web_unique` et que les six autres index
partiels du projet. Le piège associé est connu et documenté : **un index partiel
dont le prédicat change ouvre en silence**, rencontré deux fois ici.

### Trois options ont été posées

| Option | Écartée parce que |
|---|---|
| contrôle applicatif seul, sans colonne | la garantie reposerait sur du texte libre, et deux corrections simultanées passeraient toutes les deux |
| compensation libre, sans garde | un double clic fait remonter le stock de deux pièces qui n'existent pas |
| reporter la correction à un ticket dédié | S14 resterait non implémentée alors que l'écran de LS-106 la rend atteignable |

## Conséquences

**Le refus vient de la base, pas du service.** Une seconde tentative de
compensation heurte l'index et lève `P2002`, que le service traduit en refus
métier `DEJA_COMPENSE`. Deux corrections lancées simultanément ne peuvent pas
passer toutes les deux : c'est la même stratégie que l'UPDATE conditionnel de la
réservation, la garantie vit dans la base.

**Le compensateur est de type `RETOUR`** et porte le même `prixUnitaireFigeCentimes`
que l'original, conformément à S14. Il porte aussi un `motif` obligatoire : une
correction sans explication est inexploitable en contrôle.

**La chaîne s'arrête à un maillon.** Compenser un compensateur n'est pas prévu :
le cas correspondrait à une correction de correction, que rien dans le parcours 2
ne demande. L'index ne l'interdit pas techniquement, le service le refuse.

**Ce que cet ADR ne change pas.** L'immuabilité de S4 reste entière, aucune ligne
n'est modifiée ni supprimée. La clé `mouvement_vente_web_unique` n'est pas
touchée : elle porte l'idempotence des ventes web, un sujet distinct, et
l'étendre aux ventes externes rouvrirait le piège d'index partiel.

## Ce que cet ADR périme

Rien. Il **complète** S14 sans la contredire, et ajoute la règle **S15** au
modèle conceptuel : « un mouvement de stock ne se compense qu'une fois, garanti
par un index unique partiel ».
