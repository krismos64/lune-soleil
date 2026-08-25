# ADR-031 : le numéro de commande vient d'une table compteur, sans trou

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 25 août 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | ADR-024, qui décide *quand* écrire la commande et non *comment* la numéroter |
| Ticket | LS-117 |

## Contexte

`Commande.numero` est sous contrainte `UNIQUE` depuis la migration initiale, et
`MODELE-LOGIQUE.md` documente son format, `C-2026-0001`, remis à zéro chaque
année. Rien ne disait **comment** ce numéro est engendré.

La section « Numérotation comptable » de `.claude/rules/database.md` ne couvre que
les factures et les avoirs. La commande y échappait, alors qu'elle est le premier
document numéroté que le parcours 1 produit, à l'étape 4.

Le choix se fige à la première commande écrite en production : renuméroter des
commandes existantes est impossible, un client détient déjà son numéro.

## Décision

**Le numéro est attribué par une table compteur, dans la transaction qui crée la
commande.** Une ligne par type de document et par année, incrémentée par un
`UPDATE ... RETURNING` qui prend un verrou de ligne jusqu'au `COMMIT`.

```sql
INSERT INTO compteur_numero (type, annee, dernier) VALUES ($1, $2, 1)
ON CONFLICT (type, annee) DO UPDATE SET dernier = compteur_numero.dernier + 1
RETURNING dernier;
```

L'`INSERT ... ON CONFLICT` crée la ligne de l'année au premier document plutôt
que d'exiger un amorçage annuel manuel, oubli qui bloquerait toute vente le
1er janvier.

**Aucun trou en fonctionnement normal.** Une transaction annulée, refus de stock
ou panne, rend le numéro avec elle : le compteur revient à sa valeur d'avant.

**La table est prévue pour les trois séquences**, commande, facture et avoir. Le
type est une colonne, pas une table par document. Les factures et avoirs
l'emploieront en phase 4 sans nouvelle migration.

## Ordre de prise des verrous, et pourquoi il n'est pas libre

Le compteur est un point de sérialisation : toutes les commandes concurrentes
d'une même année se disputent **la même ligne**. C'est acceptable, l'incrément
durant quelques microsecondes, mais l'ordre compte.

**Le numéro se prend AVANT les variantes**, jamais entre deux réservations. Le
motif est un interblocage possible autrement :

| Transaction | Prend d'abord | Puis attend |
|---|---|---|
| A | compteur | variante X |
| B | variante X | compteur |

B tient la variante et attend le compteur que A détient ; A tient le compteur et
attend la variante que B détient. Un ordre global unique, compteur puis variantes
triées par identifiant, supprime le cycle. C'est la même règle que le tri de
LS-50, étendue à une ressource de plus.

Ce point a une conséquence mesurable : le verrou du compteur est tenu pendant
toute la réservation, donc les commandes se sérialisent sur leur écriture. Sur le
volume attendu, quelques commandes par jour, c'est sans effet. Un volume qui
rendrait cette sérialisation coûteuse justifierait de revoir cette décision, pas
de la contourner localement.

## Alternatives écartées

**Une `SEQUENCE` PostgreSQL par année.** Ne verrouille rien, donc aucune
sérialisation. Écartée : une séquence n'est pas transactionnelle, un `nextval`
consommé par une transaction annulée est perdu. Sur ce projet, chaque refus de
stock créerait un trou, et le refus est un cas **fréquent** sur un catalogue de
pièces uniques, pas une anomalie. Une numérotation à trous fréquents empêche de
lire le nombre de commandes dans le dernier numéro, ce que l'exploitante fera.

**Attribuer le numéro à la confirmation du paiement**, LS-119. Aucun numéro
consommé par une commande jamais payée. Écartée : elle exige `numero` nullable,
donc un schéma qui peut représenter une commande sans numéro, et prive de
référence lisible toute commande en attente, exactement celle dont le client
appelle pour demander où elle en est.

**Dériver le numéro de l'identifiant ou de l'horodatage.** Aucun verrou, aucune
collision. Écartée : le format documenté est séquentiel et lisible au téléphone,
ce qu'un UUID tronqué ou un horodatage ne sont pas.

## Conséquences

| Élément | Effet |
|---|---|
| Table `CompteurNumero` | ajoutée, une migration additive |
| Numéro de commande | attribué dans la transaction de l'étape 4 |
| Factures et avoirs | emploieront la même table en phase 4, sans migration |
| Ordre des verrous | compteur, **puis** variantes triées, ordre global unique |

**Ce qui ne change pas** : le format `C-2026-0001`, la remise à zéro annuelle,
la règle F4 d'attribution dans la transaction.
