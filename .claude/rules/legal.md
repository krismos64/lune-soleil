---
paths:
  - "src/services/retractation/**"
  - "src/services/invoices/**"
  - "src/app/(legal)/**"
  - "src/app/retractation/**"
---

# Délais légaux et obligations d'information

Valeurs vérifiées aux sources officielles le 28 juillet 2026. **Ne pas coder
d'après une idée générale de la règle**, et ne pas les modifier sans nouvelle
vérification aux sources.

Le cahier des charges interdit de décider d'une obligation juridique. Ces valeurs
viennent du texte, pas d'une appréciation.

## Rétractation, Code de la consommation

| Règle | Valeur | Article |
|---|---|---|
| Délai | 14 jours | L221-18 |
| Point de départ, vente de biens | réception du bien | L221-18 |
| Livraison échelonnée | réception du **dernier** bien | L221-18 |
| Renvoi par le consommateur | 14 jours après sa décision | L221-23 |
| Remboursement par le professionnel | 14 jours après information | L221-24 |
| Report du remboursement | jusqu'au **premier** de deux faits, récupération du bien **ou** preuve de son expédition par le consommateur | L221-24 |

### Le calcul n'est pas un ajout de quatorze jours

Article L221-19, trois règles cumulatives :

1. le jour de réception du bien **n'est pas compté** dans le délai
2. le délai commence à la première heure du premier jour et finit à la dernière
   heure du dernier jour
3. si l'échéance tombe un **samedi, un dimanche ou un jour férié**, elle est
   prorogée jusqu'au premier jour ouvrable suivant

Le calendrier des jours fériés français est donc nécessaire côté serveur.
Couvrir par des tests les cas limites : échéance au 1er mai, au 25 décembre, un
week-end prolongé.

### Le piège des douze mois

Article L221-20. Sans information correcte du consommateur sur son droit de
rétractation, **le délai est prolongé de douze mois** à compter de l'expiration
du délai initial. Si l'information intervient pendant cette prolongation, le
délai expire quatorze jours après.

Une omission d'affichage transforme quatorze jours en plus d'un an, sur toutes
les commandes concernées. C'est le risque le plus coûteux du parcours 5.

### Fonctionnalité en ligne obligatoire

Article L221-21. Pour un contrat conclu en ligne, le professionnel met à
disposition une fonctionnalité permettant d'exercer **gratuitement** le droit de
rétractation. Un formulaire à télécharger ne suffit pas.

Elle doit rester accessible pendant tout le délai.

### Aucune exclusion codée en dur

Les exceptions au droit de rétractation, article L221-28, dépendent de la
caractéristique concrète du produit et non de sa catégorie. Ne jamais coder
« les boucles d'oreilles sont exclues ». Un refus se motive au cas par cas, avec
un motif documenté obligatoire.

### Dépendance ouverte

Le point de départ suppose de connaître la date de réception du colis. **D'où
vient cette date n'est pas tranché**, ticket LS-33.

Tant que la question reste ouverte, le repli est la date d'expédition **plus une
marge de sécurité couvrant le délai d'acheminement**, jamais la date d'expédition
seule.

**Faire courir les quatorze jours depuis l'expédition est une faute.** Le délai
légal court à compter de la réception, et l'expédition précède la réception :
expédié le 1er, reçu le 4, un délai parti du 1er expire le 15 alors que le
minimum légal court jusqu'au 18. Le droit du consommateur serait éteint trois
jours trop tôt, et l'article L221-20 sanctionne l'information incorrecte sur ce
droit par un délai porté à douze mois.

Un repli sûr allonge le délai, il ne l'avance jamais. À défaut de date de
réception, retenir la date la plus tardive plausible pour la réception, pas la
plus précoce.

## Facturation électronique

**Les factures aux clients particuliers ne relèvent pas de la facturation
électronique.** L'obligation vise les opérations entre entreprises assujetties
établies en France. Les factures restent générées par le site et envoyées par
email. Stripe n'y participe pas, il encaisse.

Deux échéances, aucune n'impacte le code des factures clients :

- **1er septembre 2026** : obligation de pouvoir **recevoir** les factures
  électroniques des fournisseurs. Démarche administrative, LS-34.
- **1er septembre 2027** : e-reporting, transmission du chiffre d'affaires **par
  jour** en données globalisées. Aucune donnée personnelle transmise. LS-35.

La franchise en base de TVA n'exonère de rien : ces entreprises restent
assujetties. Ce qui écarte l'obligation d'émission, c'est la nature B2C de
l'activité et le calendrier échelonné.

## Avis de consommateurs

Afficher des avis impose des obligations d'information précises : date de
publication, date de l'expérience, existence ou non d'une procédure de
vérification, traitement des avis non publiés.

**À vérifier aux sources officielles avant l'implémentation**, au même titre que
les délais ci-dessus. Les avis entrent en périmètre d'ouverture, epic LS-36.

Aucun faux avis, jamais, y compris en préproduction visible.
