# 31 août 2026, session B : les comptes externes et le premier paiement réel

Session menée avec l'exploitante présente, consacrée aux démarches qui exigent sa
signature ou ses documents. Le compte bancaire professionnel était ouvert à
l'ouverture de la séance, ce qui a levé d'un coup le blocage qui pesait sur LS-18
et LS-27 depuis le 29 juillet.

Aucun code applicatif n'a été écrit. Ce qui a changé tient dans une configuration
locale, des comptes chez des tiers, et la première preuve que le jalon central du
projet fonctionne hors des tests.

## Le compte Stripe existe, et il encaisse

Compte créé au nom légal `MENENDEZ Stacy`, entreprise individuelle, SIRET
identique à celui des factures. La vérification d'identité est passée pendant la
séance, plus vite qu'attendu.

```
Compte           : acct_1UAS2JP51n9Wdb3G
Pays / devise    : FR / EUR
Paiements actifs : OUI
Virements actifs : OUI
Pieces attendues : aucune
```

Les trois valeurs sont renseignées dans le `.env` local, en **mode test**. Elles
n'ont à aucun moment transité par la conversation ni par un fichier du dépôt :
Christophe les a collées lui-même, et la vérification ne rend qu'un verdict par
champ, jamais une valeur.

**La CLI Stripe était authentifiée sur le mauvais compte**, celui de
SmartPlanning, avec une clé de production active jusqu'au 1er octobre. Un
`stripe listen` lancé sans précaution aurait écouté les événements d'un autre
projet, et le paiement serait resté sans confirmation pour une raison invisible.
Le contournement est `--api-key` avec la clé du projet, qui ne touche pas à la
session enregistrée.

## Le secret de webhook ne correspondait pas, et rien ne l'aurait dit

Le `STRIPE_WEBHOOK_SECRET` collé depuis le tableau de bord différait de celui que
`stripe listen` engendre. Les deux sont bien formés, tous deux commencent par
`whsec_`, et un contrôle de format les accepte l'un comme l'autre.

La conséquence aurait été un refus de signature à chaque paiement, donc une
commande jamais confirmée, avec un `400` dans un journal que personne ne lit
pendant une démonstration. Le défaut a été trouvé en **comparant** les deux
valeurs plutôt qu'en vérifiant leur forme, sans jamais afficher ni l'une ni
l'autre.

C'est le motif de `lune-soleil-config-corrigee-a-moitie` sous une autre forme :
une valeur présente et bien formée n'est pas une valeur juste.

## MEDIA_RACINE manquait

Découvert en tentant de publier un produit : le téléversement d'une photographie
échouait, la variable n'existant pas dans le `.env`. Ajoutée sur un chemin hors
du dépôt, `~/.lune-soleil/medias`, conformément à l'avertissement de
`.env.example` : en sortie standalone le dossier `public/` est recopié dans
l'image à la construction, un média téléversé y disparaîtrait au déploiement
suivant.

Le défaut aurait bloqué la première saisie de produit réel par l'exploitante.

## BETTER_AUTH_URL était déclarée deux fois

Deux occurrences portant la même valeur, donc sans effet observable aujourd'hui.
Le piège est différé : au passage en production, modifier la première ligne
laisserait la seconde décider, et l'application continuerait de pointer sur
`localhost` sans que rien ne le signale. Doublon supprimé.

## Le jalon central est franchi hors des tests

Un achat complet a été déroulé au navigateur sur une variante **à un seul
exemplaire**, avec les vraies clés Stripe en mode test.

| Étape | Constat |
|---|---|
| Réservation | 1 réservée sur 1 physique, portant un `commandeId`, ADR-024 |
| Événement | `checkout.session.completed` accepté en `200`, signature validée |
| Commande | `C-2026-0001`, `CONFIRMEE`, 2349 centimes, `DOMICILE` |
| Paiement | `REUSSI`, 2349 centimes |
| Stock | physique 0, réservée 0, **un seul** mouvement `VENTE_WEB` de -1 |
| Facture | `F-2026-0001`, 2349 centimes, instantané légal complet |
| Alertes | aucune `AlerteCritique` |

L'instantané légal porte l'identité saisie le matin même, la mention « TVA non
applicable, article 293 B du Code général des impôts », et les totaux 1850 + 499
= 2349. Les quatre valeurs de LS-126 figurent donc sur un document réel.

Deux comportements de repli se sont exercés au passage, sans avoir été
provoqués. Le choix d'un point de retrait est annoncé indisponible et **la vente
continue** à domicile, le compte Mondial Relay n'existant pas : c'est le critère
6 de LS-115 vérifié dans l'état réel du système. Et le panier a détecté un
article périmé d'une session antérieure, l'a affiché en « Pièce indisponible » à
0,00 €, exclu du total, avec un message d'avertissement.

## Ce qui reste ouvert

`chemin_pdf` est vide, LS-129 n'étant pas écrite : la facture existe en données,
pas en document téléchargeable.

Le **nom public** du compte Stripe n'est pas renseigné, si bien que la page de
paiement affiche « MENENDEZ Stacy » au client plutôt que « Lune & Soleil ». Le
descripteur de relevé bancaire est à vérifier dans le même écran : un libellé
méconnaissable sur un relevé provoque des contestations de paiement, dont le coût
dépasse celui de la commande.

Les données de cette séance sont **fictives** et devront disparaître avant le
vrai catalogue : produit « Créoles dorées Ariane », commande `C-2026-0001`,
facture `F-2026-0001`, compte `stacy@lune-soleil.fr`. La facture et la commande
étant immuables par conception, avec un `RESTRICT` sur la clé étrangère, le
nettoyage passe par une base neuve, `npm run db:preparer`.

## Prochaine étape

**LS-129**, le rendu PDF des factures et avoirs, inchangée depuis la session A :
elle referme `cheminPdf` et débloque l'envoi du document au client.

Restent ouverts par ailleurs, tous hors code : **LS-19**, la médiation de la
consommation, dont aucun commentaire ne trace le moindre engagement alors qu'elle
conditionne les mentions légales ; **LS-34**, la plateforme de facturation
électronique, dont l'échéance de réception tombe le 1er septembre 2026, demain ;
**LS-27**, le compte Mondial Relay, désormais débloqué par le compte bancaire
mais nécessitant l'alimentation d'un compte prépayé et la vérification de la
grille professionnelle contre les tarifs publics d'ADR-025, Corse comprise.
