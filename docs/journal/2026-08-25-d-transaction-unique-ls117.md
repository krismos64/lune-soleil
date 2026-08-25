# 25 août 2026, la transaction unique

Quatrième session de la journée, après LS-86, LS-115 et LS-116. Elle livre
**LS-117**, l'étape 4 du parcours 1 et la décision d'ADR-024.

## Une décision manquait, et elle se figeait à la première commande

`Commande.numero` est sous contrainte `UNIQUE` depuis la migration initiale, et
`MODELE-LOGIQUE.md` documente son format, `C-2026-0001`. **Rien ne disait
comment ce numéro est engendré.** La section « Numérotation comptable » de
`database.md` ne couvre que les factures et les avoirs.

Christophe a tranché la table compteur, ADR-031. Le motif tient en une phrase :
une `SEQUENCE` PostgreSQL n'est pas transactionnelle, donc chaque refus de stock
laisserait un trou. Sur un catalogue de pièces uniques, le refus est un cas
**fréquent** et non une anomalie.

L'ordre de prise des verrous n'est pas libre pour autant : compteur puis
variantes triées. L'inverser dans un seul chemin suffirait à créer un cycle.

## Ce que LS-116 ne pouvait pas prouver

Le critère « aucune commande orpheline » était resté ouvert. Dans le test phare,
`creerCommande` insère les commandes **hors** de la transaction du service :
elles survivent au refus quoi qu'il arrive. Ce que le service garantissait était
l'inverse, aucune **réservation** orpheline.

La propriété devient vérifiable ici, la création de commande entrant dans la
transaction. Trois tests l'exercent, dont celui de la panne injectée après la
réservation.

## Le tri anti-interblocage, mesuré plutôt que supposé

Le commentaire de LS-117 disait que la fenêtre « pourrait devenir réelle avec une
transaction plus longue ». Elle ne l'est pas, et la raison est instructive.

| Configuration | Interblocages sur 80 |
|---|---|
| tri en place | 0 |
| sans tri | 0 |
| sans tri, fenêtre forcée à 300 ms | 0 |
| sans tri, **compteur hors transaction** | **40** |

**C'est le compteur qui ferme la fenêtre**, pas le tri. Il verrouille dès la
première instruction : la seconde transaction attend là et n'atteint jamais les
variantes. Le passage à 40 quand on retire cette sérialisation le prouve.

Le tri reste juste et nécessaire, mais pour un autre motif : les cycles avec un
chemin **tiers**, vente externe ou libération de réservations.

## Cinq défauts trouvés par la revue critique

**Une Server Action orpheline permettait de réserver tout le catalogue.**
`reserverPanierAction` n'avait plus d'appelant depuis que `passerCommande` porte
le cas d'usage, mais `"use server"` la laissait exposée comme point d'entrée HTTP
acceptant un `commandeId` arbitraire. Un visiteur récupérait l'identifiant de sa
propre commande dans la réponse, puis réservait chaque variante du catalogue :
vingt appels pour afficher « épuisé » partout pendant trente minutes,
renouvelables. Le recoupement annoncé « quand le tunnel existera » n'avait jamais
été fait. Le fichier est supprimé.

**Le rejeu d'interblocage était devenu du code mort.** Tout le mécanisme de
LS-71 vivait dans `reserverPanier`, que plus personne n'appelle. Le chemin réel
n'avait aucune reprise.

**Le prix figeait une version périmée.** La lecture précédait la prise de
verrou : en `READ COMMITTED`, une révision validée entre les deux instants
faisait écrire 4900 sur une commande passée quand le catalogue affichait déjà
5900. `FOR UPDATE OF v` ferme la fenêtre, `OF v` évitant de verrouiller `produit`
et de sérialiser deux variantes d'un même produit sans raison.

**L'année du numéro venait de l'horloge Node**, contre une règle explicite de
`database.md`. Deux conteneurs décalés au passage d'année écriraient l'un
`C-2027-0001`, l'autre `C-2026-0043`.

**Le total n'avait aucune contrainte**, alors qu'il est stocké en plus de ses
composantes. C28 le lie, posé pendant que le code est correct, donc sans reprise
de données.

## Trois défauts d'accessibilité sur la page neuve

La page de confirmation ne portait pas `id="contenu"`, alors que l'en-tête
partagé rend « Aller au contenu » sur elle aussi : le lien pointait vers une
ancre inexistante. Et le focus n'était pas déplacé après `router.push`, donc il
retombait sur `body` : au lecteur d'écran, la commande avait l'air de n'avoir
rien produit.

**Rien ne gardait cette page**, les deux tests e2e du tunnel s'arrêtant au
récapitulatif. Trois tests l'exercent désormais sur trois largeurs.

## Preuves

```
665 tests Vitest, 39 fichiers
322 tests e2e, 4 ignorés par condition
109 réussites du contrôle de modèle, 0 échec
29 contraintes CHECK sur 29, 33 tables
types, lint et format au vert, aucun avertissement
```

Mutations, toutes ciblées et vérifiées :

| Mutation | Effet |
|---|---|
| panne après le commit | les 3 tests de panne rougissent, les 14 autres restent verts |
| prix figé neutralisé | 3 tests |
| numéro hors transaction | 1 seul, celui qui porte ADR-031 |
| `FOR UPDATE` retiré | 1 seul, celui du prix concurrent |
| garde de disponibilité retirée | le jalon, en `23514` sur le `CHECK` |
| ancre retirée | 3 largeurs |
| focus retiré, ancre gardée | 3 largeurs |

La mutation du jalon mérite un mot : sans la garde, **un acheteur passe et
l'autre heurte le `CHECK`** en erreur brute. C'est la seconde ligne de défense
qui rattrape, et le client verrait une page d'erreur là où le stock était
disponible pour l'un des deux.

## Une mutation trop brutale ne prouve rien

Première tentative sur le critère 11 : faire passer la réservation par le client
principal au lieu du client transactionnel. **Les dix-sept tests ont rougi**, la
transaction attendant son propre verrou. Une mutation qui casse tout ne dit pas
si le test de panne attrape le défaut visé.

La bonne mutation déplace la panne **après** le commit : la réservation survit à
l'échec, forme réelle du défaut qu'ADR-024 supprime. Trois tests rougissent,
quatorze restent verts.

## État des tickets

| Ticket | État |
|---|---|
| LS-116 | Terminé, ses deux critères ouverts sont prouvés ici |
| LS-117 | **Terminé** |
| LS-125 | Créé, états `loading` et `error` de la page de confirmation |

## Prochaine étape

**Une session s'est intercalée depuis** : LS-43, journal `2026-08-25-e`, qui
tranche ADR-032 et que LS-118 exigeait avant tout code. Ce qui suit reste exact,
et la lecture à jour est celle du journal `e`.

**LS-118**, session de paiement Stripe créée après le commit, et page d'attente.
Deux points l'attendent :

- la page de confirmation est volontairement pauvre, elle annonce une commande
  enregistrée et **non payée**. LS-118 la rendra dynamique, et c'est à ce
  moment-là que LS-125 s'applique
- le bouton porte la mention légale de L221-14 alinéa 2 mais n'appelle aucun
  prestataire : `passerCommande` ne fait volontairement aucun appel externe
