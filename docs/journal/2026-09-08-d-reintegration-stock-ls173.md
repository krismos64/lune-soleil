# 8 septembre 2026, d : LS-173, l'état réel de la pièce décide du stock

L'étape 9 du parcours 5 n'avait aucun chemin : une pièce revenue intacte restait
sortie du stock indéfiniment. Ce que la session a coûté à apprendre tient en une
phrase : **le défaut qu'une story ferme peut se reproduire à l'intérieur d'elle**,
et c'est arrivé deux fois ici.

## Deux décisions avant de coder

Le modèle ne suffisait pas, ce que la troisième des quinze questions a révélé :
`DemandeRetractation` ne portait rien pour tracer la décision. Sans champ, une
pièce déclarée perdue reste indistinguable d'une demande jamais traitée, les deux
ne portant aucun mouvement.

Arbitrage de Christophe : **deux colonnes**, `etatPieceRetournee` et
`etatConstateA`, liées par C41 en équivalence. Et l'unicité ancrée sur
`compenseId` vers la vente web, ce qui réutilise l'index d'ADR-030 sans nouvelle
contrainte.

**C41 ne dit rien de `recueA`, et c'est délibéré.** On croirait qu'un état
constaté exige un colis reçu, mais la règle L13 décrit le cas contraire : une
pièce jamais revenue se déclare perdue, et lier les deux fermerait le seul geste
qui solde un colis perdu en transit.

## Le défaut de la story, reproduit dans la story

`findFirst` sur le mouvement de vente ne compensait **qu'une ligne**. Le webhook
en écrit un par article, sa clé portant `(commandeId, varianteId)` : une
rétractation sur un panier à deux bijoux laissait le second sorti du stock,
exactement ce que la story venait fermer.

**Il était silencieux sur une commande à un article**, ce que tous mes autres
tests utilisaient. Je l'ai trouvé en vérifiant moi-même une piste avant que la
revue ne réponde, et le test ajouté échoue bien sur l'ancien code.

## Ce que la revue critique a trouvé et que je n'avais pas vu

`incrementerStockPhysique` porte `AND archivee_a IS NULL` et **rend le nombre de
lignes touchées**. Sur une variante archivée, l'UPDATE n'en touchait aucune
pendant que le mouvement `RETOUR` s'écrivait : le journal totalisait zéro sur la
commande, donc l'inventaire reconstruit annonçait une pièce en stock quand la
colonne disait zéro. Deux vérités, aucune contrainte pour les départager.

**Le scénario est ordinaire.** Une pièce unique vendue n'a plus de réservation
active, donc l'archivage l'accepte. Et le geste était **brûlé** : l'état posé et
l'index de compensation consommé rendaient la pièce non réintégrable.

Le refus lève plutôt que de retourner, motif « un return valide la transaction » :
dans `$transaction`, seule une exception annule.

## La revue d'interface : la donnée lue puis jetée

`etatConstateA` était sélectionné par le dépôt et **absent de sa projection**.
Seul un booléen remontait au composant, pour masquer le bloc. L'écran perdait
donc l'information au moment même où elle existait, et l'exploitante rouvrant la
page ne pouvait plus distinguer une remise en vente d'une perte.

Les deux champs se ferment aussi pendant l'envoi : le geste étant irréversible,
un basculement pendant l'aller-retour affichait un état différent de celui qui
partait.

## Le test que je croyais probant, et qui ne l'était pas

J'ai écrit un test de concurrence sur deux constats simultanés, persuadé qu'il
éprouvait le second filet, la clause conditionnelle du dépôt.

**Retirer cette clause laisse le test vert.** `Promise.all` sur une connexion
unique est **sérialisé par le pilote**, ce que `reservation.sequential.test.ts`
documentait déjà pour ses propres préparations. Il n'y a pas de course réelle.

Le test garde sa valeur, il couvre le double clic. Son commentaire dit maintenant
ce qu'il prouve **et ce qu'il ne prouve pas**, plutôt que d'annoncer une garantie
absente.

## Une story qui déstabilise un test voisin

Le bloc était rendu **une fois par demande**, la liste plafonnant à cent.
Déployé, il rendait instable le test des catégories : environ une fois sur trois
sur la branche, zéro fois sur huit sur `main`, même base, même nettoyage.

**Un diagnostic délégué a conclu « bruit de charge, ne rien corriger ».** La
mesure l'a contredit : `main` restait vert avec la même assertion corrigée et à
charge artificielle comparable. J'ai retenu ses réfutations, qui étaient solides,
et écarté sa conclusion.

**La neutralisation du bloc a isolé la cause** : six passes vertes à charge
supérieure. Arbitrage de Christophe, repli en `<details>`, convention du bloc de
refus voisin. Aucun cas métier fermé, et le test de débordement ouvre le bloc
avant de mesurer.

**Un écart résiduel subsiste au-delà de 6,8 de charge**, le composant étant
client : `<details>` évite le rendu, pas l'hydratation. Sous 6, les deux branches
sont vertes, et la suite complète donne 1499 tests au vert.

## Preuves

Huit mutations sur huit, chacune sur un état réellement existant. C41 éprouvée
sur ses quatre combinaisons, 113 réussites et 0 échec au contrôle de schéma.
1499 tests de bout en bout, 1291 en Vitest.

Les **quatre échecs `chemin_pdf` sont préexistants**, mesurés à l'identique sur
`main` plutôt que supposés : `4 failed | 1277 passed`. Défaut de LS-166.

## Ce qui reste ouvert

**LS-203 créée** : les six boutons de cet écran n'annoncent pas leur attente,
dette préexistante que corriger sur le seul bloc neuf aurait rendue pire.

**L'allègement du composant client** n'est pas fait. Si la CI rougit sur le test
des catégories, c'est le chantier à ouvrir.

**J'ai perdu une correction non commitée** en manipulant `git stash` pour
comparer les branches, motif déjà en fiche. Elle a été réappliquée puis commitée
aussitôt.

## Prochaine étape

Le backlog réalisable sans VPS porte encore la part documentaire de LS-175, dont
la procédure d'amorçage et le script idempotent. L'enregistrement de la passkey
attend le domaine de production.
