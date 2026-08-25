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
| clé d'idempotence | dérivée de la commande **et** de la tentative |
| webhook, LS-119 | un refus d'unicité produit une `AlerteCritique` CRITIQUE |
| remboursement | manuel, tableau de bord Stripe, aucun code au Go-Live |

**Ce qui ne change pas** : les quatre clés d'idempotence de la décision D,
l'invariant 5, le journal d'événements fournisseur et son unicité. Aucune
migration : `Paiement.identifiantFournisseur` et `AlerteCritique` portent déjà ce
qu'il faut.
