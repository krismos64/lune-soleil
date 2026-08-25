---
paths:
  - "src/services/retractation/**"
  - "src/services/invoices/**"
  - "src/services/shipping/**"
  - "src/integrations/mondial-relay/**"
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
| Frais de retour | à la charge du client, **seulement s'il en a été informé avant la commande** | L221-5 et L221-23 |
| Frais de livraison initiaux | remboursés, **au tarif réellement payé** quel que soit le mode | L221-24 |

### Les frais de livraison initiaux se remboursent en entier

L'article L221-24 alinéa 4 permettrait de ne pas rembourser le surcoût d'un mode
« plus coûteux que le mode de livraison standard ». Depuis ADR-025 il existe deux
tarifs, 4,10 € en Point Relais ou Locker et 4,99 € à domicile, ce qui rendrait la
faculté exerçable.

**Elle n'est pas retenue.** Rembourser le montant réellement payé, sans
plafonnement ni comparaison à un mode standard. L'écart est de 0,89 €, et
l'exercer imposerait de désigner un mode standard dans les conditions générales
et au tunnel, sous peine de retomber sur l'article L221-20.

Ne pas introduire de règle de remboursement partiel des frais de port.

### Les frais de retour se perdent faute d'information

Décision commerciale du 28 juillet 2026, LS-27 : les frais de retour sont à la
charge du client. La loi l'autorise, à une condition qui n'est pas négociable.

L'article L221-23 pose que le consommateur ne supporte ces frais que si le
professionnel **l'en a informé**. À défaut, ils reviennent au vendeur, et la
charge de la preuve pèse sur le vendeur : c'est à lui de démontrer qu'il a
informé, pas au client de démontrer le contraire.

L'article L221-20 aggrave l'enjeu : une information incorrecte sur le droit de
rétractation porte le délai à **douze mois**. Une mention oubliée ne coûte donc
pas quelques euros de port, elle ouvre un an de rétractation possible.

**Trois emplacements obligatoires**, et le premier est celui qu'on oublie :

1. **avant la validation de la commande**, dans le tunnel, pas seulement dans les
   conditions générales que personne ne lit
2. dans les conditions générales de vente
3. dans le formulaire type de rétractation

Une formule vague ne suffit pas. Le principe doit être explicite.

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

### D'où vient la date de réception

Le point de départ suppose de connaître la date de réception du colis. **Tranché
le 28 juillet 2026, LS-33** : elle vient du suivi automatique Mondial Relay,
offre Start, par API.

**Le piège tient en deux événements que le transporteur distingue** et qu'il ne
faut jamais confondre :

| Événement Mondial Relay | Mode | Sens | Effet |
|---|---|---|---|
| disponible au Point Relais | relais, locker | le colis est arrivé, le client ne l'a pas | **aucun** |
| mise en distribution | domicile | le colis part en tournée | **aucun** |
| avis de passage | domicile | personne n'était là, rien n'est remis | **aucun** |
| remis au destinataire | les trois | le client l'a physiquement récupéré | renseigne `livreA` |

Seul le dernier fait courir le délai de rétractation et déclenche l'invitation à
déposer un avis. Un colis peut rester une semaine en relais avant retrait :
prendre un événement antérieur éteindrait le droit du client avant terme.

**Les trois modes suivent la même règle**, ADR-025 : le déclencheur est la prise
de possession physique par le client, jamais l'acheminement. À domicile, la mise
en distribution et l'avis de passage sont les faux amis équivalents à
« disponible au Point Relais ». Un avis de passage signifie précisément que le
client **n'a pas** reçu le colis.

Un échec de livraison à domicile peut produire un report vers un Point Relais.
Le délai ne court alors qu'au retrait effectif, et `Expedition.mode` change sans
que la commande soit réécrite.

Le repli, si l'API est indisponible ou si un suivi reste bloqué, est la date
d'expédition **plus une marge de sécurité couvrant le délai d'acheminement**,
jamais la date d'expédition seule.

**Faire courir les quatorze jours depuis l'expédition est une faute.** Le délai
légal court à compter de la réception, et l'expédition précède la réception :
expédié le 1er, reçu le 4, un délai parti du 1er expire le 15 alors que le
minimum légal court jusqu'au 18. Le droit du consommateur serait éteint trois
jours trop tôt, et l'article L221-20 sanctionne l'information incorrecte sur ce
droit par un délai porté à douze mois.

Un repli sûr allonge le délai, il ne l'avance jamais. À défaut de date de
réception, retenir la date la plus tardive plausible pour la réception, pas la
plus précoce.

## Récapitulatif avant paiement et passation de commande

Vérifié aux sources le 25 août 2026, LS-86. **L'article qui gouverne cet écran
est L221-14, et non L221-5** comme le supposaient la description de LS-86 et la
table des écarts de `PROTOTYPE.md`.

L221-5 porte l'information précontractuelle générale, due avant que le
consommateur soit lié. L221-14 porte ce qui se rappelle **au moment de la
commande par voie électronique**, et son alinéa 1 énumère limitativement quatre
informations.

| Information à rappeler avant la commande | Source |
|---|---|
| caractéristiques essentielles des biens | L221-14 al. 1, par renvoi à L221-5 |
| leur prix | L221-14 al. 1 |
| la durée du contrat | L221-14 al. 1 |
| durée minimale des obligations, s'il y a lieu | L221-14 al. 1 |

Les deux dernières lignes ne concernent pas ce site : la vente d'un bijou est un
contrat à exécution instantanée, sans durée ni engagement de durée. Elles
restent dans la table parce qu'un abonnement ou une précommande les rendrait
applicables.

### L'adresse de livraison n'est imposée par aucun texte

**Aucun des articles lus ne l'exige au récapitulatif** : ni L221-14, ni L221-5,
ni L111-1. Ne jamais écrire l'inverse dans un document, un ticket ou un
commentaire de code.

Le site l'affiche quand même, pour les trois modes, **par décision d'ergonomie
et non par obligation**, arbitrage de Christophe du 25 août 2026 : une adresse
rappelée avant paiement évite les erreurs de saisie et les colis non distribués.

Un affichage volontaire ne se justifie pas par une obligation inventée. La
distinction compte : une obligation légale ne se retire jamais sans nouvelle
vérification, une décision d'ergonomie se rediscute librement.

**Ce qui est rappelé dépend du mode**, ADR-025 :

| Mode | Adresse affichée au récapitulatif |
|---|---|
| `DOMICILE` | l'adresse de livraison saisie par le client |
| `POINT_RELAIS`, `LOCKER` | **le nom et l'adresse du point de retrait**, plus le nom du destinataire |

En Point Relais, l'adresse personnelle du client n'a aucun usage : le colis part
au commerce partenaire. En afficher une qui ne servira pas induit en erreur. Le
nom du destinataire est rappelé parce que c'est l'identité que le client devra
présenter au retrait.

### Le bouton porte une mention imposée

L221-14 alinéa 2 : la fonction utilisée pour valider la commande comporte la
mention claire et lisible **« commande avec obligation de paiement »**, ou une
formule analogue dénuée de toute ambiguïté indiquant que passer commande oblige
à payer.

C'est une obligation portant sur le **libellé du bouton lui-même**, pas sur un
texte voisin. « Payer », « Valider » ou « Confirmer ma commande » seuls ne
satisfont pas cette exigence : aucun ne dit l'obligation de paiement.

### Les restrictions de livraison s'annoncent au début du tunnel

L221-14 alinéa 3 : les moyens de paiement acceptés et les éventuelles
restrictions de livraison s'indiquent **au plus tard au début du processus de
commande**, pas au récapitulatif.

La zone desservie d'ADR-025, France métropolitaine Corse comprise, est une
restriction de livraison au sens de cet alinéa. Elle est due à l'entrée du
tunnel, et l'y placer seulement à l'étape du mode serait tardif.

### La sanction vise nommément cet article

L242-10 rend tout manquement aux obligations d'information de L221-5, L221-6,
L221-8 et L221-11 à L221-14 passible d'une amende administrative jusqu'à
**15 000 € pour une personne physique et 75 000 € pour une personne morale**.

Ces montants sont ceux de la version **en vigueur depuis le 28 mai 2022**,
ordonnance n° 2021-1734 du 22 décembre 2021. Légifrance sert encore une version
antérieure affichant 3 000 € et 15 000 € : vérifier la mention « en vigueur du
... au ... » avant de reprendre un montant, le même piège que la renumérotation
de D111-17 plus bas.

### La confirmation sur support durable est une obligation distincte

L221-13 : le professionnel fournit la confirmation du contrat comprenant
**toutes les informations de L221-5** sur un support durable, dans un délai
raisonnable et au plus tard à la livraison. Le formulaire type de rétractation y
est joint.

Cette obligation vise l'email de confirmation et la facture, pas l'écran de
récapitulatif. Ne pas confondre les deux : satisfaire L221-14 à l'écran ne
dispense pas de L221-13 après la commande, et l'inverse est vrai aussi.

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

Afficher des avis impose des obligations d'information précises, **article
D111-10** du code de la consommation, vérifié à la source le 13 août 2026 :

- **près de chaque avis**, 1° : l'existence ou non d'une procédure de contrôle,
  la date de publication **et** celle de l'expérience de consommation, les
  critères de classement dont le classement chronologique
- **dans une rubrique spécifique facilement accessible**, 2° : l'existence ou non
  d'une contrepartie, et **le délai maximum de publication et de conservation**
  d'un avis

**L'article est D111-10 et non D111-17.** Le décret n° 2024-753 du 7 juillet 2024
a renuméroté D111-16 à D111-19 en D111-9 à D111-12, sans changer leur contenu. Le
dépôt citait l'ancien numéro à onze endroits jusqu'à LS-93. Un numéro d'article se
périme seul : sur Légifrance, la mention « en vigueur du ... **au** ... » signale
une version qui n'est plus celle en vigueur.

**Les deux délais de la rubrique sont distincts, et un seul est tranché.** La
conservation est **sans limite de durée**, ADR-028 : un avis publié reste en ligne
tant qu'une décision de modération motivée ne le retire pas. Cette absence de
limite **doit être publiée** au même titre qu'une durée chiffrée, une rubrique
muette étant le manquement que l'article vise. Le délai de publication reste un
paramètre commercial à fixer.

Les avis entrent en périmètre d'ouverture, epic LS-36.

Aucun faux avis, jamais, y compris en préproduction visible.
