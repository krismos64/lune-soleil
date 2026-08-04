# ADR-008 : envoi des emails par le SMTP du domaine, sans fournisseur transactionnel

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 4 août 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-29, LS-54, LS-70 |

## Ce que cet ADR ferme

Le numéro ADR-008 était **réservé** depuis le cahier des charges pour le choix du
fournisseur d'email transactionnel, sans qu'aucun document ne soit écrit. Trois
endroits le citaient comme une décision ouverte :

| Endroit | Ce qui change |
|---|---|
| ADR-021, mesures compensatoires 3 et conséquences | le fournisseur est nommé, l'alerte de connexion devient implémentable |
| ADR-023, réinitialisation de mot de passe | `sendResetPassword` a une implémentation cible |
| LS-29, volet technique | la dépendance « fournisseur à fermer » est levée |
| `docs/REFERENCES.md`, deux lignes | `EnvoyeurEmail` cesse d'être une interface sans implémentation prévue |

La formulation du titre réservé, « fournisseur d'email transactionnel »,
présupposait le recours à un service spécialisé. Cet ADR écarte ce présupposé :
il n'y a pas de fournisseur transactionnel au lancement.

## Contexte

Le projet doit envoyer des emails que personne ne rédige : confirmation de
commande, facture, expédition, rétractation, réinitialisation de mot de passe,
vérification d'adresse, alerte de connexion par mot de passe. La liste complète
est dans LS-29, F-MAIL-01 à F-MAIL-06.

Aucun n'existe aujourd'hui. LS-70 a livré l'interface `EnvoyeurEmail` et une
implémentation qui journalise sans envoyer, faute de décision. La conséquence
est tracée : `requireEmailVerification` reste désactivé, et trois des cinq
mesures compensatoires d'ADR-021 ne sont pas portées.

Deux contraintes réelles cadrent la décision.

**Le nom de domaine `lune-soleil.fr` est acheté chez OVH, avec une boîte aux
lettres `contact@lune-soleil.fr` comprise.** Le moyen d'envoi existe donc déjà et
est déjà payé.

**Le budget est contraint.** Le projet est mono-tenant, pour une boutique
artisanale dont le volume se compte en dizaines de commandes par mois, pas en
dizaines de milliers.

## Décision

**Les emails partent par le SMTP OVH du domaine, avec nodemailer.** Aucun
fournisseur transactionnel n'est souscrit au lancement.

**Chaque envoi laisse une trace en base**, dans une table dédiée : destinataire,
type d'email, statut, identifiant de message retourné par le serveur, erreur le
cas échéant. La table existe dès le premier envoi, pas ajoutée après coup.

**La facture reste téléchargeable depuis l'espace client.** L'email la
transporte, il n'en est jamais le seul chemin d'accès.

## Ce que la trace en base sait, et ce qu'elle ignore

Cette distinction est le coeur du compromis, et la confondre rendrait la trace
trompeuse plutôt qu'utile.

Un statut `ENVOYE` signifie **que le serveur SMTP a accepté le message**. C'est
le récépissé du dépôt, non l'accusé de réception du destinataire.

| Fait | La trace le sait |
|---|---|
| Le message a été remis au serveur d'envoi | oui |
| Le serveur d'envoi a refusé, panne ou authentification | oui |
| Le message a été refusé par le destinataire après acceptation | **non** |
| Le message est arrivé en indésirable | **non** |
| L'adresse n'existe pas | **non** |

Les trois derniers faits ne sont accessibles qu'auprès d'un fournisseur
transactionnel, qui les renvoie par interface ou par événement serveur. Aucune
qualité de code ne les obtient en SMTP classique : le refus tardif revient par
un message de non-remise dans la boîte d'envoi, que personne ne lit
systématiquement.

**La facture téléchargeable est la réponse à cet angle mort.** Un client qui n'a
pas reçu sa facture par email la retrouve dans son espace client. L'obligation
commerciale ne dépend donc pas d'un canal dont on ne mesure pas l'arrivée.

## Alternatives écartées

**Fournisseur transactionnel dès le lancement.** Écartée sur le coût et sur le
volume. Les paliers gratuits couvriraient largement le trafic attendu, mais
ajoutent un compte, une clé à gérer et une dépendance externe pour une visibilité
dont la valeur est réduite par la facture téléchargeable. La décision est
réversible à faible coût, l'interface `EnvoyeurEmail` isolant l'appelant du
moyen d'envoi.

**Envoi direct depuis le VPS de production.** Écartée, et c'est l'option la plus
risquée des trois. Une adresse IP de VPS neuve n'a aucune réputation auprès des
grands fournisseurs de messagerie. Les messages partent en indésirable ou sont
refusés, et construire cette réputation demande un envoi régulier sur plusieurs
semaines qu'une boutique de ce volume ne produira jamais. Le SMTP OVH s'appuie
au contraire sur une infrastructure d'envoi déjà établie.

**Deux canaux selon la criticité**, SMTP pour les notifications et fournisseur
transactionnel pour les factures. Écartée : deux chemins d'envoi à configurer,
deux jeux d'enregistrements DNS à maintenir, pour un projet dont le volume ne
justifie pas cette complexité.

## Conséquences

**`nodemailer` entre en dépendance.** L'implémentation de `EnvoyeurEmail` écrite
en LS-70 est remplacée par une implémentation réelle, sans changement pour les
appelants.

**Les enregistrements DNS d'authentification du domaine sont le vrai travail
technique de cette décision.** SPF, DKIM et DMARC restent nécessaires avec le
SMTP OVH : sans eux, les grands fournisseurs de messagerie classent les messages
en indésirable. LS-29 note déjà que cette démarche a un délai que le développeur
ne contrôle pas et doit être engagée tôt. **Cette phrase reste vraie telle
quelle**, le choix d'OVH ne la lève pas.

**Une table de traçabilité des envois entre au schéma.** Trois précautions,
reprises d'un défaut observé sur un autre projet où la traçabilité avait été
ajoutée après coup :

1. l'écriture de la trace **ne lève jamais** : un échec de journalisation ne doit
   pas casser une inscription ou une commande
2. l'envoi retente en cas d'échec réseau, sans retenter sur une erreur
   d'authentification, qui ne se résoudra pas d'elle-même
3. le contenu du message n'est pas stocké, seulement son type et son destinataire

**`requireEmailVerification` peut être activé** pour les comptes client, ce que
LS-54 exige pour le rattachement des commandes passées sans compte.

**Les trois mesures d'ADR-021 qui dépendaient de l'email deviennent
implémentables** : alerte de connexion, réinitialisation de mot de passe,
vérification d'adresse.

**La boîte `contact@lune-soleil.fr` garde son usage humain.** La correspondance
avec les clients ne passe pas par le code, et cet ADR ne la concerne pas.

## Risques

**Un email peut ne jamais arriver sans que rien ne le signale.** C'est le risque
accepté, nommé plus haut. Atténué par la facture téléchargeable, non supprimé.
Une réclamation client reste le signal principal, ce qui est un mécanisme de
détection lent.

**Le volume d'envoi des offres mutualisées est plafonné.** La limite exacte de
l'offre OVH souscrite n'a pas été vérifiée à la source et ne doit pas être
supposée. À contrôler avant l'ouverture, en même temps que les enregistrements
DNS : une journée de marché suivie de plusieurs commandes déclenche confirmation,
facture et expédition pour chacune.

**Le mot de passe SMTP est un secret d'exploitation.** Il vit en variable
d'environnement, jamais dans le dépôt qui est public, et n'est jamais journalisé.

**Un défaut de configuration DNS se voit tard.** Les messages partent, la trace
dit `ENVOYE`, et ils arrivent en indésirable. La vérification exigée par LS-29,
un email de test reçu dans une vraie boîte de réception, est le seul contrôle qui
attrape ce cas, et elle doit couvrir plusieurs fournisseurs de messagerie.

**La bascule vers un fournisseur transactionnel n'a pas de déclencheur
automatique.** Elle relève d'une décision, sur réclamation client ou sur taux
d'échec observé en base. Cet ADR ne fixe pas de seuil : en fixer un sans mesure
serait un chiffre inventé.
