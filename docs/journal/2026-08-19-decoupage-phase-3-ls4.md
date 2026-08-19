# 19 août 2026, découpage de la phase 3, epic LS-4

Seconde session du 19 août, après la clôture des tickets restants de la phase 2.
Aucun code écrit : cette session produit neuf stories et leurs dépendances.

## Quatre arbitrages de Christophe

**Le panier vit dans un cookie signé, sans entité en base.** Le modèle conceptuel
n'a jamais porté d'entité `Panier`, et le parcours 1 décrit la ligne de panier
comme « éphémère ». Le découpage confirme ce choix plutôt que d'élargir le
modèle : aucune migration, aucune purge planifiée, aucune donnée personnelle
supplémentaire à déclarer.

**Neuf stories**, même granularité que LS-3 qui en portait huit. Chaque story
reste vérifiable seule et tient dans une session.

**LS-43 avant la session de paiement.** C'est une décision, pas du code : elle
tranche l'expiration de la session précédente, l'alerte et le remboursement
automatique ou manuel. La poser avant LS-118 évite de coder par-dessus une
décision floue.

**La vérification juridique de LS-86 me revient**, à soumettre ensuite. Décider
d'une obligation juridique reste un interdit du projet.

## La chaîne

```
LS-114 -> LS-115 -> LS-116 -> LS-117 -> LS-118 -> LS-119 -> LS-120
                                          ^                  \-> LS-121
LS-86 -----------/                     LS-43 /
```

| Rang | Ticket | Sujet |
|---|---|---|
| 1 | LS-114 | panier en cookie signé, revalidation serveur |
| 2 | LS-115 | tunnel, adresse, trois modes, frais de port |
| 3 | LS-86 | récapitulatif légal, **ticket existant réutilisé** |
| 4 | LS-116 | test phare de concurrence |
| 5 | LS-117 | commande et réservation en transaction unique |
| 6 | LS-118 | session Stripe après le commit |
| 7 | LS-119 | webhook signé, idempotence à quatre clés |
| 8 | LS-120 | libération des réservations et réconciliation |
| 9 | LS-121 | administration des commandes, porte de sortie |

Huit liens `Blocks` posés. `./scripts/verifier-jira.sh` : 100 tickets examinés,
**aucun ticket sans epic**. Le seul signalement, LS-68, est antérieur.

## Ce que la lecture des sources a évité

**Un doublon de LS-86.** J'allais créer une story de récapitulatif avant
paiement. Le ticket existait depuis le 4 août et couvrait exactement ce
périmètre, vérification légale comprise. Il prend le rang 3, ce qui explique que
les descriptions numérotent « story 4 sur 9 » pour LS-116 : **le rang ne suit pas
la clé**.

**Une réécriture de `services/reservation.ts`.** Le service existe depuis LS-71,
avec le tri par identifiant croissant de LS-50 et le rejeu borné sur
interblocage. LS-116 et LS-117 s'appuient dessus. Ce que LS-116 écrit est le test
du **parcours complet**, là où LS-71 testait la primitive seule.

**Une migration inutile.** Les entités `Commande`, `Paiement`,
`EvenementFournisseur` et `VerrouTache` sont au schéma depuis LS-13. La phase 3
est de l'implémentation, pas de la modélisation.

## Le sens du lien Blocks, vérifié plutôt que supposé

Une fiche mémoire signale que `createIssueLink` pose Blocks à l'envers de sa
documentation. J'ai posé le premier lien, relu `issuelinks` sur LS-115, et
constaté que le sens était **correct** ici : `inwardIssue` est bien le bloqueur,
LS-115 « is blocked by » LS-114.

La fiche n'est pas fausse pour autant, elle décrit un cas rencontré. La leçon est
de vérifier le premier lien d'une série plutôt que d'appliquer une correction de
mémoire qui ne s'applique peut-être pas.

## Deux dettes portées par le découpage

**LS-120 lève celle de LS-72.** LS-72 est marquée Terminé et n'a livré que le
squelette du conteneur de tâches, ce qui était son périmètre arbitré. La tâche
métier manquait, et LS-106 en a mesuré la conséquence : `quantiteReservee` ne
redescend jamais, une réservation expirée bloque la vente externe indéfiniment.

**LS-114 et LS-115 portent les deux critères d'accessibilité de LS-85** que la
session précédente avait laissés inatteignables : l'annonce de l'ajout au panier
et le déplacement du focus au changement d'étape. Ils sont dans les critères des
stories qui écriront ces écrans, plutôt que traités après coup.

## Incident de session

Trois créations de ticket ont rendu une erreur `socket connection closed` alors
que **le ticket avait bien été créé**. Vérifier par une recherche avant de
relancer, sous peine de doublon. Une seule création a réellement échoué, celle de
LS-119, relancée avec une description plus courte.

## Prochaine étape

**LS-114**, le panier. Première de la chaîne, rien ne se fait avant elle.

Deux travaux peuvent la précéder ou l'accompagner, sans la bloquer :

- **LS-86**, la vérification juridique du récapitulatif, qui bloque LS-115 et non
  LS-114
- **LS-84**, le contrôle de contraste, court et entièrement spécifié dans le
  ticket
