# ADR-032 : un double encaissement est alerté et remboursé à la main

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 25 août 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | la décision D du modèle conceptuel, qui protège les données et non l'argent |
| Ticket | LS-43 |

## Contexte

La décision D pose quatre clés d'unicité d'effet, dont `paiement_reussi_unique` :
au plus un paiement encaissé par commande. Elle empêche qu'un second paiement
réussi soit **enregistré**.

Elle ne rembourse personne. Si deux sessions Checkout sont réellement payées, le
prestataire a encaissé deux fois, et la contrainte se contente de refuser la
seconde écriture. L'argent, lui, est parti.

**Comment le cas se produit.** Le parcours 1 prévoit le refus de paiement suivi
d'un nouvel essai. Une première session est créée, le client la laisse ouverte,
revient plus tard, une seconde session est créée. Il paie la seconde, puis
retrouve l'onglet de la première et paie aussi. Deux événements arrivent, avec
deux identifiants distincts : rien dans l'idempotence par identifiant ne les
rapproche.

## Ce que Stripe permet, vérifié le 25 août 2026

Vérifié par Context7, la version étant plus récente que la connaissance du
modèle :

| Mécanisme | Ce qu'il fait |
|---|---|
| `POST /v1/checkout/sessions/:id/expire` | expire une session, uniquement en statut `open`, erreur sinon |
| `expires_at` à la création | réglable de **30 minutes à 24 heures**, 24 h par défaut |
| en-tête `Idempotency-Key` | clé purgée après **au moins 24 h** ; réutilisée avec des paramètres différents, elle rend une **erreur** |

## Décision

### 1. Prévention, une seule session ouverte par commande

Avant de créer une session, **expirer celle que la commande porte encore**, si
elle est ouverte. L'appel n'agit que sur une session `open`, donc un échec parce
qu'elle est déjà payée ou expirée n'est pas une panne : c'est l'information que
la prévention n'avait rien à faire.

**`expires_at` est fixé à 30 minutes**, borne basse autorisée par Stripe, et ce
n'est pas un réglage arbitraire : c'est exactement la durée de la réservation de
stock d'ADR-006. Une session qui survivrait à sa réservation permettrait de payer
une pièce que la tâche de libération vient de rendre au catalogue.

### 2. La clé d'idempotence ne peut pas être le seul identifiant de commande

Une clé dérivée du seul `commandeId` rendrait une **erreur** au second essai
légitime, les paramètres différant, ou rejouerait la réponse de la première
session, désormais expirée. La clé porte donc la commande **et** la tentative.

### 2 bis. La réservation suit la session, complément du 26 août 2026

**Ajouté par LS-118**, qui a rencontré le cas que la décision 1 ne couvrait pas.
Au réessai de paiement, une nouvelle session dure **au minimum 30 minutes**,
borne basse du prestataire, alors que la réservation posée à la commande peut
n'en avoir plus que cinq. L'alignement que la décision 1 pose comme motif se
rompait donc exactement sur le chemin du nouvel essai, prévu par le parcours 1.

**Les réservations actives de la commande sont prolongées jusqu'à l'`expires_at`
de chaque session créée.** Le service calcule un seul instant, l'envoie au
prestataire et le pose sur les réservations : l'alignement est une identité, pas
une coïncidence de durées.

**Une réservation déjà expirée est un refus métier**, sans aucun appel au
prestataire : la tâche de libération a pu rendre la pièce au catalogue, et créer
une session permettrait de payer une pièce revendue. Le client repasse commande.

**Ce que la prolongation ne fait pas.** Elle ne fait pas renaître une réservation
expirée, le `WHERE expire_a > now()` restant la ligne de défense si les deux
instructions croisent la tâche de libération. Elle n'immobilise une pièce que
tant que la commande reste `EN_ATTENTE_PAIEMENT` : la réconciliation de LS-120
ferme ce cycle.

**La garde est universelle**, correction du 26 août 2026 relevée par
`ls-critical-reviewer` : le nombre de réservations prolongées est comparé au
nombre de lignes de la commande. Une garde existentielle laissait payer un panier
à deux pièces dont une seule était encore réservée.

### 1 bis. La prévention tient par un rattrapage, pas par un verrou

**Relevé le 26 août 2026 sur l'implémentation de LS-118.** La décision 1 suppose
qu'on sache, avant de créer une session, si la commande en porte déjà une. Deux
démarrages simultanés lisent tous deux « aucune session précédente » : ni l'un ni
l'autre n'a encore rattaché la sienne au moment de lire, et deux sessions payables
coexistent malgré la prévention.

**Un verrou de ligne ne referme pas ce trou**, et il a été essayé puis retiré :
il serait relâché avant l'appel réseau, donc avant que la session existe, la
décision d'ADR-024 interdisant de tenir une transaction pendant un aller-retour.
Aucune mutation ne le faisait rougir, ce qui l'a désigné comme une protection
affirmée et non exercée.

**La garantie vient d'un rattrapage après création** : une fois sa session
rattachée, un démarrage relit les tentatives de la commande et expire toutes les
sessions qui ne sont pas la sienne. Le dernier à rattacher expire les
précédentes, et l'invariant tient quel que soit l'entrelacement.

**La tentative est écrite avant l'appel**, `identifiantFournisseur` nul, puis
complétée. C'est ce qui rend toute session traçable, donc expirable : écrite
après, une écriture perdue laissait une session orpheline que rien ne fermait.

### 3. Détection, un second encaissement est une alerte critique

Le refus par `paiement_reussi_unique` ne se journalise pas silencieusement. Il
produit une `AlerteCritique` de gravité `CRITIQUE`, portant `typeCible =
"Paiement"`, l'identifiant Stripe du paiement en trop et son montant.

L'événement reste **persisté** : c'est la trace de ce qui s'est produit, et il ne
doit pas être rejoué indéfiniment.

### 4. Traitement, remboursement manuel

**L'exploitante rembourse depuis le tableau de bord Stripe.** Aucun appel de
remboursement automatique.

## Pourquoi le remboursement n'est pas automatique

**Un bug de détection rembourserait un paiement légitime.** Le chemin qui décide
« ce paiement est en trop » est le même qui, s'il se trompe, rend l'argent d'une
commande valide. Un faux positif automatique est un incident commercial, un faux
positif manuel est un courriel que personne n'envoie.

**Le cas est rare et son diagnostic compte.** Deux encaissements peuvent venir
d'un client qui a payé deux fois par erreur, mais aussi d'un défaut de la
prévention, ou d'une fraude. Rembourser sans regarder efface la trace du motif.

**Le Go-Live n'a pas besoin de la mécanique de remboursement.** Elle appartient à
la phase 4, avec les avoirs. L'introduire ici pour un cas que la prévention doit
rendre presque impossible ajouterait un chemin d'appel au prestataire à tester,
sans traiter mieux le cas nominal.

**Le coût assumé** : le client attend son remboursement le temps que
l'exploitante voie l'alerte. C'est acceptable pour un cas dont la prévention
réduit déjà l'occurrence, et l'alerte est en gravité maximale précisément pour
que ce délai reste court.

## Alternatives écartées

**Remboursement automatique immédiat.** Le client est remboursé en minutes.
Écarté pour les trois motifs ci-dessus, le premier étant décisif.

**Automatique sous condition**, montant identique et écart court, manuel sinon.
Écarté : deux chemins à écrire et à tester au Go-Live, plus une règle de seuil à
maintenir, pour un cas rare. La complexité n'est pas payée par le gain.

**Ne rien prévoir**, au motif que la prévention suffit. Écarté : une prévention
qui repose sur un appel réseau au prestataire peut échouer, et le cahier des
charges interdit qu'un incident d'argent se journalise silencieusement.

## Conséquences

| Élément | Effet |
|---|---|
| création de session, LS-118 | expirer la session ouverte précédente d'abord |
| `expires_at` | 30 minutes, aligné sur la réservation d'ADR-006 |
| réservation, LS-118 | prolongée au même instant à chaque session créée, expirée vaut refus |
| clé d'idempotence | dérivée de la commande **et** de la tentative |
| webhook, LS-119 | un refus d'unicité produit une `AlerteCritique` CRITIQUE |
| remboursement | manuel, tableau de bord Stripe, aucun code au Go-Live |

**Ce qui ne change pas** : les quatre clés d'idempotence de la décision D,
l'invariant 5, le journal d'événements fournisseur et son unicité. Aucune
migration : `Paiement.identifiantFournisseur` et `AlerteCritique` portent déjà ce
qu'il faut.
