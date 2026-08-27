# 27 août 2026, les deux tâches du paiement

**LS-120**, seconde story de la journée. Les deux routes vides depuis LS-72
portent enfin leur métier : la libération des réservations échues et la
réconciliation des commandes en attente. Les quatre tâches planifiées du projet
travaillent désormais.

## Ce que la libération répare

`quantiteReservee` ne redescendait **jamais**. Une réservation expirée continuait
de compter dans le stock réservé et bloquait la vente de sa pièce indéfiniment,
en ligne comme sur un marché. LS-106 l'avait mesuré sans pouvoir le lever, faute
de tâche.

Elle est **idempotente par construction** et non par un drapeau : la ligne de
réservation est supprimée dans la même instruction que le décrément, donc une
seconde exécution ne trouve plus rien à rendre. Un drapeau `libereeA` aurait
laissé la ligne visible et exigé de filtrer dessus partout ailleurs.

## La réconciliation ne réécrit rien

Elle appelle **le même service que le webhook**, `traiterEvenementPaiement`, avec
l'origine `RECONCILIATION`. Réécrire la confirmation ici produirait deux
mécaniques à garder d'accord, et c'est exactement ainsi qu'un stock devient faux
en silence. Les quatre clés d'unicité par effet de LS-119 empêchent les deux
chemins de produire des doublons, quel que soit celui qui arrive en second.

Le croisement se teste enfin **pour de vrai**, dans les deux ordres d'arrivée :
LS-119 devait le simuler en appelant son propre service avec une autre origine.

Trois refus valent d'être notés. **Ne pas savoir n'autorise aucune décision** :
une panne du prestataire fait sauter la commande et jamais annuler, sans quoi des
commandes payées seraient annulées et des pièces vendues rendues au catalogue.
Une session encore **ouverte** se laisse vivre, elle appartient au client. Et
l'annulation **ne touche pas au stock**, la libération s'en charge : le rendre
aux deux endroits le rendrait deux fois dès que les tâches se croiseraient.

## La revue critique a trouvé quatre défauts

`ls-critical-reviewer` a relu la zone. Les quatre étaient fondés, et le premier
touche le jalon central du projet.

### Un interblocage laissait une pièce payée non déstockée

La confirmation de LS-119 prend ses verrous dans l'ordre `variante` puis
`reservation`, avec du travail entre les deux et dans la même transaction. Ma
première version de la libération prenait l'ordre **inverse**.

Les deux transactions s'attendaient mutuellement, et PostgreSQL tuait
**systématiquement la confirmation** : paiement non enregistré, stock non sorti,
et la pièce payée repartait au catalogue, immédiatement revendable. Sur une pièce
unique, c'est la double vente que le jalon interdit.

La correction aligne l'ordre : la libération verrouille les variantes avant de
supprimer les réservations. Un **rejeu borné** sur interblocage protège en outre
la confirmation, même mécanique et même borne que la réservation de LS-71 : un
chemin tiers futur ne sera pas forcément aligné.

### Une ligne incohérente gelait toute la libération

`chk_variante_reservee_positif` annulait la passe **entière**. Une seule variante
dont `quantiteReservee` est incohérent, et plus aucune réservation expirée n'était
libérée sur tout le catalogue, à chaque cycle de cinq minutes, jusqu'à
intervention humaine. C'est le défaut même que cette story répare, réintroduit
par un autre chemin et sur un périmètre plus large.

Mon intention était bonne, refuser de masquer une incohérence par un plancher
`GREATEST`, mais la **granularité** était fausse. La ligne fautive est désormais
écartée par le `WHERE`, les saines sont traitées, et l'incohérence reste visible.

### Une commande en échec arrêtait les suivantes

Quarante commandes en attente dont la troisième échoue, et les trente-sept
suivantes n'étaient jamais examinées. Le cycle d'après rebutait sur la même,
indéfiniment. L'échec est maintenant porté commande par commande, puis levé après
la boucle pour que l'exploitation voie un échec plutôt qu'un 200 rassurant. C'est
le motif que `purge-journaux` documente depuis LS-94.

### Une session terminée sans paiement classée expirée

Non atteignable aujourd'hui, ce projet n'employant que le paiement immédiat. Il
se ferme quand même : ajouter un virement SEPA le rendrait actif du jour au
lendemain, et le symptôme serait l'annulation de commandes en cours de règlement.

## La preuve d'un ordre de verrous ne tient pas dans un test

Mon test d'intégration prétendait couvrir l'interblocage. **Il ne le couvrait
pas** : retirer le `FOR UPDATE` le laissait vert, trois fois sur trois. La
fenêtre tient à un intervalle entre les deux écritures de la confirmation, que le
service ne permet pas d'ouvrir depuis un test sans ajouter un point d'accroche au
code de production.

Deux formes de synchronisation ont été essayées et écartées avant de le
comprendre, chacune refermant la fenêtre au lieu de l'ouvrir.

La preuve vit donc dans `docs/prototypes/interblocage-liberation-confirmation.sh`,
même convention que `interblocage-panier.sh` pour LS-49. Il joue les deux ordres
et montre le contraste :

```
ORDRE FAUTIF   confirmation : ERROR: deadlock detected
               etat final   : physique=1 reservee=0   (piece payee NON destockee)
ORDRE ACTUEL   etat final   : physique=0 reservee=0   (vente correcte)
```

Le commentaire du test dit maintenant ce qu'il couvre et ce qu'il ne couvre pas,
plutôt que de laisser croire le contraire.

## Preuves

```
type-check       au vert
lint             au vert
format:check     au vert
build            au vert
test             44 fichiers, 724 tests
verifier-regles.sh                 règles conformes au schéma
verifier-propagation-docs.sh       socle Zod et son document accordés
verifier-registre-traitements.sh   33 tables rangées
verifier-tests-non-ignores.sh      toute la suite s'exécute
```

**Huit mutations, huit détectées par le test attendu**, cas 112 à 119.

| Mutation | Test qui rougit |
|---|---|
| libération sans suppression, idempotence perdue | deux exécutions ne décrémentent pas deux fois |
| libération sans comparaison d'expiration | ne touche pas une réservation encore active |
| session ouverte annulée | laisse vivre une commande dont la session est ouverte |
| panne du prestataire traitée en annulation | saute la commande et n'annule rien |
| seuil d'âge supprimé | ignore une commande de moins d'une heure |
| verrou n'écartant plus la seconde exécution | deux exécutions ne rendent la pièce qu'une fois |
| ligne incohérente non écartée | libère les variantes saines malgré une incohérente |
| échec d'une commande arrêtant la boucle | traite les suivantes puis lève |

Deux cas du script ont dû être **réalignés** après refactor : leurs
substitutions ne mutaient plus rien, et le garde-fou de lisibilité les a
attrapés. C'est la fiche « cible de mutation déplacée », rencontrée à nouveau.

## État des tickets

| Ticket | État |
|---|---|
| LS-120 | **terminée**, revue passée, quatre défauts corrigés |
| LS-18 | bloqueur inchangé, la vérification contre l'API réelle l'attend |

## Prochaine étape

**LS-121**, administration des commandes : liste, détail et transitions de statut
historisées. Elle est la dernière de la chaîne imposée LS-118 à LS-121, et
`HistoriqueStatut` est déjà écrit par les deux chemins de confirmation ainsi que
par l'annulation de réconciliation : l'écran a de quoi afficher.
