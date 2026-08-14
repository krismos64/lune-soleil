# ADR-029 : la référence d'une variante reste modifiable après création

| Champ | Valeur |
|---|---|
| Statut | **Accepté** |
| Date | 14 août 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-101 |

## Ce que cet ADR tranche

`MODELE-CONCEPTUEL.md` décrit, dans sa contrepartie de la décision C, les dégâts
d'une modification de référence. Il n'en tire aucune interdiction : le passage
sert à écarter `referenceFigee` comme clé de regroupement des avis, pas à figer
le champ.

Aucune règle numérotée n'interdit donc la modification, et aucune ne l'autorise
explicitement. LS-101 devait écrire l'écran d'édition d'une variante et ne
pouvait pas rester dans cette zone grise : le champ est éditable ou il ne l'est
pas.

**Arbitrage de Christophe, 14 août 2026 : la référence reste librement
modifiable.**

## Contexte

`Variante.reference` porte une unicité, règle C2, et n'est jamais réattribuée,
règle C14. Ces deux règles portent sur l'**attribution** d'une référence, pas sur
la stabilité de sa valeur dans le temps.

Le passage de `MODELE-CONCEPTUEL.md` qui a fait ouvrir la question :

> Ou bien elle corrige une faute de frappe dans une référence, et les avis déjà
> déposés, portant l'ancienne chaîne, disparaissent de la fiche.

Trois options ont été posées : figer à la création, verrouiller dès la première
vente, ou laisser librement modifiable.

## Décision

### 1. Le champ reste modifiable, sans condition de verrouillage

L'exploitante corrige une référence quand elle le juge utile. Aucune règle
technique ne l'en empêche, y compris après des ventes.

Le motif retenu tient à l'échelle réelle du catalogue : 10 à 40 références,
saisies par une seule personne. Une faute de frappe corrigée le jour même est le
cas courant ; interdire la correction obligerait à archiver la variante et à en
recréer une, ce qui laisse dans le catalogue une ligne morte pour une simple
coquille, et occupe définitivement la référence fautive au titre de C14.

Un verrouillage conditionnel, éditable tant qu'aucune vente n'existe, a été
écarté comme troisième voie : il produit un champ qui se verrouille un jour
donné sans que l'écran ait de bonne façon de l'annoncer à l'avance.

### 2. L'écran avertit quand la variante a déjà vendu

**C'est la contrepartie de la décision 1, et elle n'est pas facultative.**

Quand la variante est citée par au moins une ligne de commande, l'écran indique,
avant l'enregistrement, combien de commandes portent la référence actuelle et ce
que la modification laisse derrière elle.

L'avertissement est **informatif et non bloquant** : il nomme la conséquence,
l'exploitante décide. Un avertissement qui empêcherait l'action reviendrait au
verrouillage écarté à la décision 1.

### 3. Ce que la modification laisse derrière elle, et qui ne se répare pas

Les deux conséquences sont réelles, et l'ADR les acte plutôt que de les taire.

**Les avis déposés restent sur l'ancienne référence.** `LigneCommande` fige
`referenceFigee` au moment de la vente, invariant 3 : cette copie ne suit pas le
catalogue, par conception. Un affichage d'avis regroupé par `referenceFigee`
cesserait de les trouver.

**Les statistiques par référence se scindent.** Un même bijou apparaît sous deux
références selon la date de vente.

**Aucune commande, aucune facture et aucun avoir n'est touché.** C'est le point
qui rend la décision acceptable : les documents comptables portent leurs propres
copies figées, et rien dans le catalogue ne les modifie, invariants 3 et 4.

### 4. La parade durable ne vit pas dans cette story

`MODELE-CONCEPTUEL.md` la nomme déjà : **regrouper les avis par `varianteId` et
non par `referenceFigee`.** Une variante ne se supprimant jamais, C13, cet
identifiant reste toujours résolvable, ce qui rend la question de la stabilité de
la référence sans objet pour l'affichage des avis.

Les avis appartiennent à LS-61, epic LS-36. Cet ADR **n'anticipe pas** leur
implémentation, il fixe la contrainte que LS-61 devra respecter : ne pas
regrouper par `referenceFigee`.

## Ce que cet ADR modifie

| Élément | Ce qui change |
|---|---|
| `docs/architecture/MODELE-CONCEPTUEL.md` | la contrepartie de la décision C parle d'une réutilisation de référence comme d'un scénario hypothétique ; la modification devient un geste prévu et documenté |
| LS-101 | l'écran d'édition porte la référence en champ modifiable, avec son avertissement |
| LS-61 | le regroupement des avis passe par `varianteId`, jamais par `referenceFigee` |

Aucun ADR n'est remplacé. Les règles C2, C13 et C14 sont **inchangées** : cet ADR
ne touche ni l'unicité, ni la non-réattribution, ni l'interdiction de supprimer
une variante.

## Alternatives écartées

**Figer la référence à la création.** Cohérent avec l'esprit de C14 et sans effet
de bord, mais impose d'archiver puis de recréer une variante pour une coquille.
Sur un catalogue de 40 références tenu par une personne, le coût est
disproportionné.

**Verrouiller dès la première vente.** Protège exactement ce qui doit l'être,
puisque le dégât n'existe qu'à partir d'une ligne de commande. Écarté pour la
raison dite en décision 1 : un champ dont l'éditabilité dépend d'un état invisible
se comprend mal au moment de la saisie.

**Rattacher les avis à `varianteId` dès maintenant.** C'est la bonne correction,
mais elle appartient à LS-61 : l'écrire ici ferait entrer une story d'un autre
epic dans LS-101, sans écran pour l'éprouver.
