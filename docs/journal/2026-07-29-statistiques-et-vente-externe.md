# 29 juillet 2026, statistiques commerciales et montant des ventes externes

| Champ | Valeur |
|---|---|
| Tickets | LS-63 créé, LS-64 créé, LS-3, LS-8, LS-35 commentés |
| Branche | `feat/LS-63-montant-vente-externe` |
| Contrôles | 68 réussites 0 échec sur le schéma, 35 identifiants conformes, 8 mutations détectées |

## Le constat, confirmé

Un montant manquait au journal des mouvements de stock. Une vente externe
enregistrait la variante, la quantité, le canal et la date, **jamais le prix**.
Vérifié sur les trois artefacts qui doivent rester synchronisés, `schema.prisma`,
`schema.sql` et `MODELE-CONCEPTUEL.md` domaine 2.

Le chiffre d'affaires des marchés n'était donc pas calculable. Le seul montant
atteignable était `Variante.prixCentimes`, le prix **actuel** du catalogue, dont
l'usage pour reconstituer une vente passée viole l'invariant 3. C'est exactement
la raison qui fait exister `LigneCommande.prixFigeCentimes` côté web : le défaut
avait été vu et traité pour la vente en ligne, et pas pour la vente de marché.

Une remise de stand n'était par ailleurs représentable d'aucune façon.

## L'incohérence la plus gênante, LS-35

LS-35 porte une obligation légale, l'e-reporting du chiffre d'affaires journalier
au 1er septembre 2027. Sa description affirmait que le modèle permet l'agrégation
par jour, « les mouvements de stock distinguent vente web et vente externe ».

C'est vrai du **nombre de pièces** et faux du **montant**, seule donnée que
l'administration demande. Et le ticket signalait lui-même deux paragraphes plus
bas que les ventes de marché entrent dans le chiffre d'affaires à transmettre.
L'exigence était juste, la prémisse sur le modèle ne l'était pas.

Une obligation fiscale reposait donc sur une affirmation inexacte, et aucun
contrôle ne pouvait le signaler : un contrôle textuel vérifie qu'un identifiant
existe, pas qu'une phrase sur le modèle dit vrai.

## Ce qui a été décidé

Trois questions posées à Christophe, trois réponses.

**Un prix unitaire figé, seul.** `MouvementStock.prixUnitaireFigeCentimes`, entier
en centimes. Pas de total encaissé en plus : il vaut `quantite * prix`, deux
colonnes de la même ligne, et le projet a déjà écarté deux fois un champ
redondant pour ce motif, le total de ligne de `ligne_commande` et le booléen de
média principal.

**Une correction par mouvement inverse**, jamais par modification, ce qui découle
de la règle S4 sur l'immuabilité des mouvements. Le compensateur porte le même
prix figé et un motif, comme un avoir corrige une facture.

**La date du mouvement fait foi**, `creeA`, sans champ de date de vente distinct.
La limite est assumée et consignée : une saisie faite deux jours après le marché
range le chiffre d'affaires sur le mauvais jour, ce qui compte pour un e-reporting
journalier. La consigne est de saisir le jour même.

## La contrainte n'a pas la forme des précédentes, et c'est le point technique

La proposition initiale était une équivalence, sur le modèle des deux `CHECK`
d'ADR-025 pour le mode de livraison :

```sql
CHECK ((type = 'VENTE_EXTERNE') = (prix_unitaire_fige_centimes IS NOT NULL))
```

**Elle est fausse ici**, et le signaler avant d'écrire le code a évité de casser
la décision prise dans la même conversation. Une équivalence interdit tout montant
sur un autre type, donc sur le mouvement compensateur qui corrige une vente
externe. La correction devenait impossible à écrire.

La forme retenue est une implication :

```sql
CHECK (type <> 'VENTE_EXTERNE' OR prix_unitaire_fige_centimes IS NOT NULL)
```

La différence tient au fait modélisé. Un point de retrait sur une commande
`DOMICILE` est une incohérence, un prix sur un `AJUSTEMENT` est une information
légitime. Reprendre la forme d'une contrainte voisine sans vérifier ce qu'elle
interdit est le piège, et il ne se voit pas à la relecture : les deux formes se
ressemblent et l'une passe tous les contrôles d'obligation.

## Preuve par mutation, quatre mutations

Chaque contrôle a été prouvé en réintroduisant le défaut qu'il surveille.

| Mutation | Résultat |
|---|---|
| `chk_mouvement_vente_externe_prix` retirée | 1 échec, vente externe sans montant acceptée |
| la même réécrite en équivalence | 2 échecs, compensateur rejeté, chiffre d'affaires à 1100 au lieu de 0 |
| `chk_mouvement_prix_positif` retirée | 2 échecs, prix négatif accepté, chiffre d'affaires à -500 |
| colonne retirée du schéma | aucun contrôle exécuté, le script refuse de partir |

**La deuxième est celle qui compte.** Elle chiffre la conséquence de l'erreur de
forme : une vente annulée continue de compter dans le chiffre d'affaires. Sans
cette mutation, l'équivalence aurait passé tous les autres contrôles, dont celui
qui vérifie l'obligation du montant.

**La quatrième mérite d'être lue.** Retirer la colonne casse la création du
schéma, et le garde-fou de LS-48 refuse alors d'exécuter le moindre contrôle
plutôt que d'afficher des réussites qui ne vérifient rien. La mutation ne produit
pas « le contrôle rougit » mais « aucun contrôle ne tourne », ce qui est le bon
comportement. C'est le cas symétrique de la mutation sans effet observable
rencontrée le 29 juillet : ici l'effet est visible et bon, il n'a simplement pas
la forme attendue.

## Les statistiques, définies avant d'être codées

`docs/architecture/STATISTIQUES.md` est créé, et il est la source de vérité de
LS-64. Cinq périodes en `Europe/Paris`, douze indicateurs, règles de calcul
écrites en termes d'entités réelles pour rester vérifiables.

Le fuseau n'est pas un détail d'affichage : en heure d'été, minuit à Paris vaut
22 h UTC la veille, et un regroupement fait en UTC range une vente du 3 juillet à
00 h 30 au 2 juillet. La conversion se fait dans la requête, jamais par un
décalage fixe qui deviendrait faux à l'heure d'hiver.

Trois règles n'étaient pas tranchées et le sont.

Une vente en ligne est datée par la **confirmation du paiement**, jamais par la
création de la commande. Un remboursement est imputé à la période où **l'avoir a
été émis**, jamais à celle de la vente : une période close ne se rouvre pas, et à
partir de septembre 2027 elle aura été transmise à l'administration. Le montant
brut n'est jamais diminué des remboursements.

La conséquence de la deuxième est assumée : sur un mois à faible activité, le net
peut être négatif, et l'affichage ne doit ni le masquer ni le borner à zéro.

## Priorisation, une seule ligne bouge

La collecte du montant des ventes externes passe en périmètre d'ouverture, LS-63.
L'interface reste en V1 cible, LS-64.

**Aucune décision fermée n'est contredite.** `CLAUDE.md` range les statistiques en
V1 cible et c'est toujours le cas : ce qui remonte est la capture d'une donnée,
pas son affichage. Une interface non développée se développe plus tard, une donnée
non capturée est définitivement perdue.

## Ce qui reste ouvert

**Le fait générateur d'une vente web n'a pas d'horodatage.** `Paiement` porte
`creeA`, qui date la création de la tentative, pas son encaissement. Sur le chemin
de réconciliation l'écart dépasse l'heure et peut franchir un minuit, donc changer
le jour d'imputation. Deux options, ajouter `Paiement.confirmeA` ou dériver depuis
`HistoriqueStatut`. À trancher avant d'implémenter le calcul, LS-64. Ne bloque pas
LS-63.

**Une vente externe remboursée en main propre** ne produit aucun avoir, le modèle
ne connaissant pas ce cas. La correction passe par le mouvement compensateur, donc
elle est imputée à la période de saisie. Signalé plutôt que résolu : si l'usage
montre que le cas est fréquent, il justifiera une entité propre.

## État des tickets

| Ticket | État |
|---|---|
| LS-63 | À faire, conception et contrôles livrés, formulaire et service en phase 2 |
| LS-64 | À faire, définitions livrées, V1 cible |
| LS-3 | À faire, commenté, première story enfant créée |
| LS-8 | À faire, commenté, LS-64 créée sous cet epic |
| LS-35 | À faire, commenté, affirmation inexacte rectifiée sans réécrire la description |

## Prochaine étape

Inchangée et prioritaire : **découper LS-2 en onze stories**, décision de
Christophe du 29 juillet au soir, granularité déjà tranchée. Ce travail-ci était
une correction de conception à faire avant que le code ne s'appuie sur un modèle
incomplet, il ne remplace pas le découpage de la phase 1.
