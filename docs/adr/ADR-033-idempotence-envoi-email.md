# ADR-033 : outbox transactionnelle pour l'envoi des emails

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 27 août 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-51, implémenté par LS-82 |

## Ce que cet ADR ferme

LS-51 posait une question laissée ouverte depuis la revue de LS-49 : la
quatrième clé d'idempotence par effet protège la base, elle ne protège pas
l'appel au fournisseur. `.claude/rules/database.md` porte la consigne qui en
découle, « ne pas coder l'envoi d'email en supposant l'index suffisant », et
c'est cette consigne que le présent document lève.

## Contexte

L'index partiel `journal_email_systeme_unique` porte trois conditions :

```sql
UNIQUE journal_email (commande_id, modele)
  WHERE statut = 'ENVOYE' AND origine IN ('SYSTEME','RECONCILIATION')
```

Il fait correctement ce pour quoi il a été conçu : deux entrées `ENVOYE` pour la
même commande et le même modèle sont impossibles, quel que soit le chemin
d'entrée, webhook ou réconciliation. Il laisse passer la retentative après un
échec, règle E4, et le renvoi manuel par l'administratrice, règle E6.

**Il ne voit rien de ce qui se passe hors de la base.** Le scénario qui passe
entre les mailles, en quatre temps :

1. le service appelle le serveur SMTP, qui accepte le message et l'envoie
2. le processus tombe avant d'écrire la ligne `ENVOYE`
3. la reprise ne trouve aucune ligne, donc rien ne la bloque
4. le client reçoit une seconde confirmation de commande, identique

La même faille existe en sens inverse : la connexion réseau se coupe après que
le serveur a accepté le message, l'appelant voit un échec, et la retentative
double l'envoi.

Aucune gravité comptable, la facture restant unique et téléchargeable. C'est en
revanche le type de défaut qui érode la confiance sur une boutique qui ouvre.

## Décision

**L'intention d'envoi est écrite dans la transaction qui produit l'effet
métier. Une tâche planifiée la consomme et appelle le serveur SMTP.**

Une table `EnvoiEnAttente` porte l'intention. La transaction qui confirme une
commande écrit son effet métier et l'intention d'envoi ensemble : les deux
existent, ou aucune des deux.

```
Transaction métier                    Tâche « envoi-emails », toutes les minutes
  ├─ Commande CONFIRMEE                 ├─ SELECT ... FOR UPDATE SKIP LOCKED
  ├─ Mouvement de stock                 ├─ statut ENVOI_EN_COURS, commit
  └─ INSERT EnvoiEnAttente              ├─ appel SMTP
                                        └─ JournalEmail ENVOYE ou ECHOUE
```

**Le commit du passage en `ENVOI_EN_COURS` précède l'appel SMTP, et cet ordre
est le mécanisme entier.** Marquer après l'appel reproduirait exactement le trou
que cet ADR ferme, à un endroit différent.

### Ce que devient une panne à chaque instant

| Panne survenant | Effet |
|---|---|
| avant le commit métier | rien n'a eu lieu, ni commande ni intention |
| après le commit métier, avant la tâche | l'intention est là, la tâche l'enverra |
| après `ENVOI_EN_COURS`, pendant l'appel SMTP | la ligne reste `ENVOI_EN_COURS`, **jamais reprise en aveugle** |
| après l'appel, avant l'écriture de la trace | idem, la ligne reste `ENVOI_EN_COURS` |
| après l'écriture de la trace | terminé, l'index bloque tout doublon |

Les deux lignes du milieu sont le cœur du compromis. Une ligne restée en
`ENVOI_EN_COURS` est **ambiguë par nature** : personne ne sait si le message est
parti. La rejouer risquerait le doublon, l'abandonner risquerait le silence.

**Le choix est de ne pas trancher automatiquement.** Au-delà d'un délai de
garde, la ligne est signalée dans `AlerteCritique`, règle E7, et l'administratrice
décide du renvoi par le chemin manuel qui existe déjà, `origine = 'ADMIN'`
exclue de l'index.

Ce cas suppose une panne du processus dans la fenêtre de quelques secondes que
dure un appel SMTP. Il sera rare. Le traiter par une alerte plutôt que par une
règle automatique évite d'inventer une réponse à une situation qu'on ne sait pas
distinguer.

## Alternatives écartées

**Clé d'idempotence acceptée par le fournisseur.** Écartée parce qu'elle n'existe
pas ici. LS-51 la posait comme option « à vérifier aux sources », le fournisseur
n'étant pas encore arrêté. ADR-008 a depuis tranché pour le SMTP OVH, et SMTP ne
déduplique rien : le protocole accepte un message et le remet, sans notion de
clé fournie par l'appelant. L'option est close par la décision précédente, pas
par un arbitrage nouveau.

**Rapprochement documenté**, accepter le doublon rare et le détecter après coup.
Écartée sur le coût d'exploitation. Un rapport de rapprochement suppose quelqu'un
pour le lire, et une boutique artisanale n'a pas ce quelqu'un. Le défaut
resterait donc invisible jusqu'à la réclamation d'un client, ce qui est le
mécanisme de détection le plus lent possible.

**Écrire la trace avant l'appel plutôt qu'une table d'attente.** Écartée parce
qu'elle ment sur ce qu'elle enregistre. Une ligne `JournalEmail` en statut
`ENVOYE` signifie « le serveur a accepté le message », définition posée par
ADR-008 et sur laquelle repose la lecture du journal. L'écrire avant l'appel
ferait dire à la table quelque chose de faux, et la retentative après échec
réseau deviendrait impossible, la clé étant déjà occupée.

## Conséquences

**Une cinquième tâche planifiée entre dans `TACHES`.** L'infrastructure de
LS-72, complétée par LS-120, l'accueille sans modification : verrou nommé,
expiration, route interne d'exécution.

C'est ce qui a fait pencher la décision. LS-51 évaluait l'outbox à « une table,
un processus de consommation, et le conteneur de tâches planifiées prévu en
phase 1 ». Ce conteneur existe désormais et porte quatre tâches en service, le
coût est donc retombé à une table et un consommateur.

**L'envoi devient asynchrone, et ce délai doit être assumé.** Un client ne
reçoit plus sa confirmation dans la seconde qui suit son paiement, mais dans la
minute qui suit. Acceptable pour une confirmation de commande.

**Deux messages ne passent pas par l'outbox** : la réinitialisation de mot de
passe et la vérification d'adresse. Ils sont attendus immédiatement par une
personne devant son écran, et ils ne portent aucune commande, donc aucune ligne
`JournalEmail` ne les couvre. Ils partent en appel direct, avec la retentative
bornée décrite plus bas.

Le partage se lit ainsi : **ce qui découle d'une transaction métier passe par
l'outbox, ce qu'une personne attend à l'écran part directement.**

**La règle E5 est complétée** dans `.claude/rules/database.md` et dans
`MODELE-CONCEPTUEL.md` : l'index reste la seconde ligne de défense, l'outbox
devient la première.

**La retentative distingue deux familles d'erreur**, ce qu'exige le critère 4 de
LS-82. Les codes viennent de la documentation nodemailer, vérifiée le 27 août
2026 : `ECONNECTION` et `ETIMEDOUT` sont réseau et se réessaient, `EAUTH` et
`ENOAUTH` sont des erreurs d'authentification qui ne se résoudront pas d'elles-
mêmes. Réessayer sur un mot de passe faux ne fait qu'épuiser le plafond de 200
messages par heure de l'offre MX Plan.

## Risques

**Une ligne bloquée en `ENVOI_EN_COURS` demande une intervention humaine.**
C'est le prix assumé de ne pas rejouer en aveugle. L'alerte est le seul
mécanisme qui rend ce cas visible, et une alerte que personne ne regarde ne vaut
rien : elle apparaît dans l'administration, au même endroit que les alertes
d'ADR-032.

**L'outbox ne garantit pas la remise**, et rien ne le peut en SMTP. ADR-008 pose
déjà cet angle mort, la facture téléchargeable en est la réponse. Le présent ADR
traite le doublon, pas l'absence.
