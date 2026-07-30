# Statistiques commerciales de l'administration

Définition des indicateurs de la page « Statistiques » et de leurs règles de
calcul. Ce document fixe **ce qui est compté et à partir de quelle date**, il ne
décrit ni l'interface ni les requêtes SQL.

| Champ | Valeur |
|---|---|
| Ticket | LS-64, collecte en LS-63 |
| Entrées | `MODELE-CONCEPTUEL.md` domaines 2 à 4, LS-8, LS-35 |
| Jalon | collecte au Go-Live, interface en V1 cible |

## Pourquoi ce document existe séparément

Une statistique fausse ne plante pas. Elle s'affiche, elle est crue, et elle
oriente des décisions d'achat de matière ou de participation à un marché. Le seul
moyen de la rendre vérifiable est d'écrire sa définition avant de l'implémenter,
puis de tester le calcul contre cette définition.

Le projet a déjà rencontré deux fois le même défaut sous une autre forme : une
règle exacte dans un document, périmée dans un autre, sans qu'aucun contrôle ne
le signale. Les définitions ci-dessous sont donc écrites en termes d'entités
réelles du schéma, ce qu'un contrôle automatique peut confronter.

## Le fait générateur, ce qui compte comme une vente

**Une vente en ligne est datée par la confirmation effective du paiement**, jamais
par la création de la commande. Les deux diffèrent de quelques minutes sur le
chemin nominal, et de plus d'une heure quand la réconciliation régularise une
commande dont le webhook n'est jamais arrivé, décision D. Une commande créée le
31 janvier à 23 h 55 et confirmée le 1er février appartient à février.

Le fait générateur est donc `Paiement`, dans l'un des trois états d'encaissement
`REUSSI`, `PARTIELLEMENT_REMBOURSE` ou `REMBOURSE`, et non `Commande.creeA`.

**Ce qui ne compte pas** : une commande `EN_ATTENTE_PAIEMENT`, une commande
`ANNULEE` avant paiement, un paiement `ECHOUE`. Un panier abandonné n'est aucune
entité, il ne peut donc pas être compté par erreur.

**Une vente externe est datée par `MouvementStock.creeA`**, la saisie se faisant
sur le stand ou le soir même. La limite de cette approximation et la raison de ne
pas ajouter un second champ de date sont traitées dans `MODELE-CONCEPTUEL.md`,
domaine 2.

### Le fait générateur, tranché le 30 juillet 2026

**La date de rattachement d'une vente en ligne est `Paiement.confirmeA`.** Le
point était ouvert, il est fermé par arbitrage de Christophe, LS-76.

`creeA` ne convient pas : il date la création de la tentative, pas son
encaissement. Sur le chemin nominal l'écart est de quelques minutes. Sur le
chemin de réconciliation il dépasse l'heure et peut franchir un minuit, donc
changer le jour d'imputation. Pour l'e-reporting **journalier** de LS-35, ce
n'est pas un détail de confort.

L'alternative examinée, dériver la date depuis `HistoriqueStatut`, est
**écartée** : elle éviterait un champ mais ferait dépendre une donnée comptable
d'un journal de transitions.

Six règles d'usage :

1. `confirmeA` est **nullable**. Une tentative `EN_ATTENTE` ou `ECHOUE` n'en
   porte pas, et `chk_paiement_confirmation_coherente` garantit cette cohérence
   dans les deux sens
2. Il est renseigné **dans la transaction** qui fait passer le paiement en état
   d'encaissement, jamais avant
3. Le webhook et la **réconciliation** écrivent le même champ. C'est ce second
   chemin qui produit les écarts de plus d'une heure
4. **Une seule valeur par paiement.** Un second passage ne réécrit pas
   `confirmeA` : une date comptable ne bouge pas après coup. L'idempotence
   s'ancre sur l'effet, décision D
5. La conversion en `Europe/Paris` a lieu **à l'agrégation seulement**, le champ
   restant en UTC. Une commande créée le 31 janvier à 23 h 55 et confirmée le
   1er février appartient à février
6. **Aucune reconstruction** depuis `creeA` ni depuis l'historique des statuts

Les trois états d'encaissement conservent leur date : un remboursement compense
l'encaissement, il ne l'efface pas. Retirer `confirmeA` d'un paiement remboursé
est refusé par la base, ce qui empêche une vente de disparaître des statistiques
du mois où elle a eu lieu.

## Périodes

Cinq périodes, toutes calculées dans le fuseau métier **Europe/Paris**.

| Période | Borne basse | Borne haute |
|---|---|---|
| Aujourd'hui | minuit local du jour | maintenant |
| Cette semaine | lundi minuit local | maintenant |
| Ce mois | premier du mois, minuit local | maintenant |
| Cette année | 1er janvier, minuit local | maintenant |
| Période libre | date de début, minuit local | date de fin, minuit local du jour suivant |

**Le fuseau n'est pas un détail d'affichage ici.** Les horodatages sont persistés
en UTC, invariant 8. En heure d'été, minuit à Paris vaut 22 h UTC la veille : une
vente conclue le 3 juillet à 00 h 30 heure française est stockée au 2 juillet
22 h 30 UTC. Un regroupement fait en UTC la rangerait au 2 juillet, et le total du
jour serait faux pour l'exploitante comme pour l'e-reporting.

La conversion se fait donc dans la requête, sur le fuseau `Europe/Paris`, et
jamais par un décalage fixe de une ou deux heures : le passage à l'heure d'hiver
rendrait ce décalage faux la moitié de l'année.

Les bornes sont **inclusive à gauche, exclusive à droite**. Une vente conclue
exactement à minuit appartient au jour qui commence, et aucune vente n'est
comptée deux fois sur deux périodes contiguës.

## Indicateurs

| Indicateur | Définition | Source |
|---|---|---|
| Montant brut encaissé | somme des paiements encaissés dont le fait générateur tombe dans la période, plus les ventes externes de la période | `Paiement.montantCentimes`, `MouvementStock` |
| Montant des remboursements | somme des remboursements **imputés à la période**, voir ci-dessous | `Avoir.montantCentimes` |
| Montant net | brut encaissé de la période moins remboursements imputés à la période | calcul |
| Commandes payées | nombre de commandes dont le paiement a été confirmé dans la période | `Paiement` |
| Bijoux vendus | somme des quantités, ventes web et externes | `LigneCommande.quantite`, `MouvementStock.quantite` |
| Panier moyen | montant brut des ventes **web** divisé par le nombre de commandes payées | calcul, voir la réserve |
| Frais de livraison facturés | somme des frais de port des commandes payées de la période | `Commande.fraisPortCentimes` |
| Évolution dans le temps | montant net regroupé par jour, semaine ou mois selon l'amplitude | calcul |
| Produits et variantes les plus vendus | quantités regroupées par `varianteId` | `LigneCommande.varianteId`, `MouvementStock.varianteId` |
| Variantes jamais vendues | variantes non archivées sans aucune ligne ni mouvement de vente | anti-jointure |
| Répartition des modes de livraison | commandes payées regroupées par mode | `Commande.modeLivraison` |
| Répartition web et externe | montant brut ventilé par canal d'origine | `Paiement` contre `MouvementStock` |

### Trois définitions qui demandent une précision

**Le panier moyen ne porte que les ventes web.** Diviser un montant incluant les
marchés par un nombre de commandes produirait un chiffre sans signification, une
vente de marché n'étant pas une commande. L'indicateur affiche donc le panier
moyen web, et l'étiquette doit le dire.

**Les frais de livraison sont comptés dans le montant brut** et affichés
séparément, sans être soustraits. Ils font partie de ce que le client a payé et de
ce que l'entreprise a encaissé. Les isoler répond à une autre question : quelle
part du chiffre d'affaires n'est pas de la marge sur bijou.

**Une variante « jamais vendue » se compte sur les variantes non archivées.** Une
variante archivée est sortie du catalogue, la faire figurer dans une liste
d'invendus proposerait d'agir sur une pièce qui n'existe plus à la vente. Le
regroupement se fait par `varianteId` et jamais par `referenceFigee`, une
référence pouvant théoriquement changer, motif détaillé en décision G.

## Les remboursements, et pourquoi ils restent séparés

**Le montant brut encaissé n'est jamais diminué d'un remboursement.** Un
remboursement est un fait distinct, à sa propre date. Les fondre dans le brut
rendrait impossible de répondre à « combien ai-je encaissé en juin », question à
laquelle l'e-reporting de LS-35 devra répondre.

Trois montants sont donc affichés ensemble, et le net est toujours présenté à
côté du brut, jamais seul.

### Le remboursement qui tombe sur une autre période

Le cas est normal, pas exceptionnel : une vente du 28 juin remboursée le 4 juillet
après rétractation, le délai légal étant de quatorze jours.

**Règle retenue, la plus fiable des deux : le remboursement est imputé à la
période où l'avoir a été émis**, `Avoir.emisA`, jamais à celle de la vente
d'origine.

Le motif est qu'une période close ne se rouvre pas. Imputer le remboursement à la
vente changerait rétroactivement le montant net de juin, déjà consulté et, à
partir de septembre 2027, déjà transmis à l'administration. Un chiffre publié qui
change tout seul est pire qu'un chiffre imparfait.

**La conséquence est assumée et doit être visible** : sur un mois à faible
activité, les remboursements peuvent dépasser les encaissements et le net devient
négatif. C'est la réalité comptable de ce mois-là, l'affichage ne doit pas le
masquer ni le borner à zéro.

Un remboursement partiel suit exactement la même règle. Chaque avoir compte pour
son montant propre, à sa date d'émission, et le parcours 4 prévoit explicitement
deux avoirs successifs sur une même facture.

### Ce qui n'est pas encore couvert

**Une vente externe remboursée en main propre ne produit aucun avoir.** Le modèle
ne connaît pas ce cas : la vente de marché n'émet pas de facture, donc rien à
corriger par un avoir. La correction passe par le mouvement compensateur de la
règle S14, qui diminue le brut de la période **où la correction est saisie**, et
non celle de la vente.

C'est cohérent avec la règle ci-dessus, et c'est signalé plutôt que résolu en
silence : si l'usage montre que ce cas est fréquent, il justifiera une entité
propre, pas avant.

## Ce qu'aucune statistique ne fait

**Aucun calcul ne lit `Variante.prixCentimes`**, règle S13. C'est le prix actuel
du catalogue : l'utiliser pour reconstituer une vente passée produirait un chiffre
d'affaires qui change quand l'exploitante révise ses prix.

Toute reconstitution part des copies figées, `LigneCommande.prixFigeCentimes`
côté web et `MouvementStock.prixUnitaireFigeCentimes` côté marché. C'est
l'invariant 3 appliqué aux statistiques.

**Aucun calcul n'utilise de nombre à virgule flottante**, invariant 1. Le panier
moyen et les pourcentages de répartition sont les seuls quotients : ils
s'effectuent en centimes entiers, et l'arrondi se fait à l'affichage.

## Priorisation

Confirmée contre les décisions existantes. `CLAUDE.md` range les statistiques en
V1 cible, LS-8 les porte à 8 h sous condition d'un historique de ventes suffisant.
Rien n'est modifié à ces décisions.

| Exigence | Importance | Jalon |
|---|---|---|
| Indicateurs opérationnels, commandes à traiter, expéditions, stocks faibles | Must | Go-Live |
| Enregistrement du montant encaissé de chaque vente externe | Must | Go-Live |
| Statistiques de ventes en ligne par période | Should | V1 cible |
| Statistiques par produit et variante | Should | V1 cible |
| Statistiques multicanales incluant les marchés | Should | V1 cible |
| Comparaison avec la période précédente | Could | V1.x |
| Statistiques d'acquisition et de conversion | Could | V1.x |

**La deuxième ligne est la seule qui déplace quelque chose**, et elle ne
contredit aucune décision fermée : la collecte d'une donnée n'est pas son
affichage. LS-8 porte l'interface, elle reste en V1 cible.

Le motif est qu'une donnée non capturée est définitivement perdue. Ouvrir sans le
montant des ventes externes, puis construire les statistiques trois mois plus
tard, laisserait un trou correspondant aux premiers marchés, exactement ceux dont
l'exploitante a besoin pour décider auxquels retourner. Aucune reprise de données
ne comble ce trou, le prix pratiqué n'étant écrit nulle part.

Les indicateurs opérationnels de la première ligne ne sont pas des statistiques
commerciales et existent déjà au périmètre d'ouverture : ils lisent l'état
courant, pas un historique agrégé.
