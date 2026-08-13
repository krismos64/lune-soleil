# 13 août 2026, découpage de la phase 2

Cinquième session du 13 août. Christophe a demandé de découper LS-3, phase 2,
catalogue, médias et stock multicanal, en proposant de trancher au besoin.

## Huit stories, LS-99 à LS-106

L'epic en portait déjà quatre. Il en porte douze.

| Clé | Sujet |
|---|---|
| LS-99 | Catégories et création de produit |
| LS-100 | Éditeur de fiche, sections d'ADR-026 |
| LS-101 | Variantes, référence unique, prix |
| LS-102 | Médias, traitement, EXIF supprimé |
| LS-103 | Publication et archivage |
| LS-104 | Catalogue public |
| LS-105 | Fiche produit publique |
| LS-106 | Stock multicanal |

Chaîne portée par des liens `Blocks` de LS-99 à LS-105, plus LS-101 vers LS-106.

## Ce que le découpage n'a pas eu à créer

Vérifié avant d'écrire quoi que ce soit : **le schéma est complet depuis LS-13**.
`Categorie`, `Produit`, `SectionProduit`, `Variante`, `Media` et `MouvementStock`
existent avec leurs contraintes, index partiels et longs commentaires de
conception. `repositories/stock.ts` et `services/reservation.ts` aussi.

Les huit stories écrivent donc les services et l'interface, jamais le modèle.
Découper sans cette vérification aurait produit des stories de modélisation déjà
faites.

Le travail de conception déjà présent dans le schéma a servi directement : les
descriptions des stories citent les pièges que les commentaires documentent, au
lieu de les redécouvrir à l'implémentation. Trois exemples dans LS-100 :
la section supprimée qui ne doit jamais réapparaître, la contrainte différable
qui interdit `ON CONFLICT`, et la séparation entre `cle` et `titre`.

## Deux décisions demandées à Christophe

**Le stockage des médias.** Aucun ADR ne le tranchait, et `Media` porte un
`identifiantFournisseur` qui suppose un service externe, ce qui entrait en tension
avec l'arbitrage « pas de service tiers » du 10 août.

La tension était réelle et non tranchée d'avance : cet arbitrage-là portait sur
le transfert de **données personnelles** vers un sous-traitant, et une photo de
bijou sans EXIF n'en est pas une. La question méritait donc d'être posée plutôt
que déduite.

Réponse : **sharp en local, aucun service tiers**. Deux conséquences notées dans
LS-102, la sauvegarde qui devra couvrir le volume des médias, et le CPU du VPS
consommé par le traitement.

**L'ordre du découpage.** Réponse : administration d'abord. L'alternative,
écrire le catalogue public sur des données de test, aurait demandé d'inventer un
jeu de données sans reprendre celui du prototype, qui est un interdit du projet.

## L'ADR n'a pas été écrit, et c'est volontaire

L'arbitrage sur les médias est structurant, il doit produire un ADR avant
l'implémentation de LS-102. Le skill `adr` porte `disable-model-invocation`, il
est réservé à l'invocation explicite de Christophe.

La consigne est de ne pas reproduire le déroulé du skill par un autre moyen. Rien
n'a donc été rédigé, et la story porte la mention. C'est aussi la leçon de LS-93,
où un ADR écrit sans le skill avait raté deux sections attendues.

## Les quatre stories qui étaient déjà là

**LS-63**, montant encaissé, se traite avec LS-106. **LS-84** et **LS-85**, qui
sont transverses, se traitent avec les premiers composants publics, LS-104 et
LS-105. **LS-87** touche le même écran que LS-100 et peut y être absorbée.

Aucune n'a été modifiée ni dupliquée : le découpage s'articule autour d'elles.

## État des tickets

- **LS-3**, en cours, douze stories, commentaire de découpage posté
- **LS-99 à LS-106**, créées, à faire, epic LS-3, priorité High
- `verifier-jira.sh --strict` : 96 tickets examinés, aucune des huit signalée

## Prochaine étape

**LS-99** ouvre la chaîne et ne dépend de rien. Avant LS-102, l'ADR sur le
stockage des médias, que Christophe rédige avec `/adr`.
