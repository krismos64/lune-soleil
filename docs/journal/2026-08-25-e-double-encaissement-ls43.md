# 25 août 2026, le double encaissement

Cinquième session de la journée. Elle livre **LS-43**, une story de **décision**
et non d'implémentation : aucun code, aucune migration, et pourtant elle
débloquait toute la chaîne de paiement.

## Pourquoi elle passait avant LS-118

La description de LS-118 est explicite, « dépend de LS-43 qui doit être tranchée
avant » et « ne pas coder par-dessus cette décision tant qu'elle n'est pas
prise ». Elle ne demande aucun compte Stripe, seulement de trancher : c'était
donc le travail faisable pendant que le compte reste bloqué par LS-18.

## Le trou, et ce qu'il n'est pas

La décision D pose quatre clés d'unicité d'effet. Elles empêchent qu'un second
paiement réussi soit **enregistré**.

**Elles ne remboursent personne.** Si deux sessions Checkout sont réellement
payées, le prestataire a encaissé deux fois et la contrainte se contente de
refuser la seconde écriture. L'argent est parti, et rien dans l'idempotence par
identifiant d'événement ne rapproche les deux paiements : ils portent deux
identifiants distincts.

## Ce que Context7 a établi

Trois faits vérifiés plutôt que supposés, la version de Stripe étant plus
récente que ma connaissance :

| Mécanisme | Fait |
|---|---|
| `POST /v1/checkout/sessions/:id/expire` | n'agit que sur une session `open`, erreur sinon |
| `expires_at` | réglable de **30 minutes** à 24 heures, 24 h par défaut |
| `Idempotency-Key` | purgée après **au moins 24 h**, erreur si réutilisée avec d'autres paramètres |

**Le troisième change la conception.** Une clé dérivée du seul `commandeId`
casserait le nouvel essai légitime après un refus de paiement, cas que le
parcours 1 prévoit explicitement. La clé doit porter la commande **et** la
tentative. Sans Context7, j'aurais probablement écrit la clé sur la seule
commande.

**Le deuxième est une coïncidence utile** : la borne basse de `expires_at`
coïncide exactement avec les 30 minutes de réservation d'ADR-006. Une session qui
survivrait à sa réservation permettrait de payer une pièce que la tâche de
libération vient de rendre au catalogue.

## L'arbitrage de Christophe

**Remboursement manuel**, avec alerte critique, plutôt qu'automatique.

Le motif décisif tient en une phrase : le chemin qui décide « ce paiement est en
trop » est le même qui, s'il se trompe, rend l'argent d'une commande valide. Un
faux positif automatique est un incident commercial, un faux positif manuel est
un courriel que personne n'envoie.

Deux conséquences pratiques : le Go-Live n'a pas besoin de la mécanique de
remboursement, qui appartient à la phase 4 avec les avoirs, et le coût assumé est
que le client attende le temps que l'exploitante voie l'alerte. C'est pour cela
qu'elle est en gravité maximale.

## Le contrôle a rattrapé une omission

`verifier-regles.sh` a refusé ma première rédaction :

```
ECHEC .claude/rules/payments.md:123 : paiement_reussi_unique cité
      sans PARTIELLEMENT_REMBOURSE REMBOURSE REUSSI
```

Il exige qu'une mention de cet index rappelle son prédicat **complet**. C'est
exactement le piège de LS-45 : filtrer sur le seul `REUSSI` laissait un paiement
sortir du filtre en passant à `PARTIELLEMENT_REMBOURSE`, et un second `REUSSI`
redevenait insérable. Le contrôle empêche qu'une prose imprécise réintroduise
l'idée fausse.

C'est la deuxième fois de la journée qu'il attrape une de mes approximations,
après les deux noms de colonnes inventés ce matin.

## Aucune migration

Le schéma porte déjà tout : `Paiement.identifiantFournisseur` pour désigner le
paiement en trop, `AlerteCritique` avec `typeCible` et `idCible`, et l'index
`paiement_reussi_unique` dont le commentaire renvoyait explicitement à LS-43. Ce
commentaire dit maintenant ce qu'ADR-032 a tranché, et surtout ce qu'il ne faut
pas ajouter.

## Preuves

```
verifier-regles.sh    règles conformes au schéma
prisma validate       schéma valide
format:check          au vert
```

Aucun test : cette story n'écrit pas de code. Les tests viendront avec LS-118
pour la prévention, LS-119 pour la détection.

## État des tickets

| Ticket | État |
|---|---|
| LS-43 | **Terminé** |
| LS-118 | Débloquée, les trois contraintes d'ADR-032 déposées en commentaire |

## Prochaine étape

**LS-118**, session de paiement Stripe créée après le commit. Toute la logique
est livrable avec un double de test du prestataire, y compris la panne simulée
qu'exige son critère 4. Ce qui attend le compte Stripe, LS-18 : la vérification
de bout en bout contre l'API réelle.
