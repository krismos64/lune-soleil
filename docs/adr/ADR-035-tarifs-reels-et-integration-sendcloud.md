# ADR-035 : tarifs réels constatés, domicile au prix coûtant, intégration Sendcloud

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 6 septembre 2026 |
| Décideur | Christophe Mostefaoui et l'exploitante |
| Ticket | LS-27 |

## Ce que cet ADR remplace

**ADR-025**, qui passe en `Remplacé par ADR-035`. Son contenu reste intact : il
enregistre la décision du 29 juillet 2026, prise sur la grille publique Mondial
Relay alors que le compte n'était pas ouvert. Cet ADR ne le corrige pas, il prend
la suite avec les chiffres réels.

ADR-025 avait prévu ce moment. Il écrit que la grille est « à revérifier à
l'ouverture réelle du compte », et porte en risque que « le compte Mondial Relay
n'est pas ouvert ». Le compte a été ouvert le 6 septembre 2026 avec l'exploitante,
et la vérification a eu lieu le jour même.

Ce qui change par rapport à ADR-025 :

| Élément | Ce qui change |
|---|---|
| Tarif domicile | 4,99 € devient **7,49 €**, le prix coûtant |
| Seuil de gratuité | « tous modes » devient **Point Relais et Locker seulement** |
| Intégration | l'API Mondial Relay devient l'**API Sendcloud** |
| Corse | le point est **abandonné**, plus aucune vérification attendue |
| `.env.example` | `SHIPPING_HOME_RATE_CENTS` passe à 749 |
| `src/lib/livraison.ts` | la franchise devient conditionnelle au mode |

Ce qui ne change pas : les trois modes, le tarif Point Relais et Locker à 4,10 €,
le seuil à 39 €, le transporteur unique, le figement du mode dans la commande, la
contrainte liant le mode au point de retrait, et le remboursement intégral des
frais de livraison en cas de rétractation.

## Contexte

Le compte a été ouvert le 6 septembre 2026. Il n'est pas un compte Mondial Relay
direct : Mondial Relay redirige désormais son offre sans contrat vers
**Sendcloud**, agrégateur de transporteurs qui porte le contrat. Le compte
Sendcloud affiche « La formule Abonnement a été activée pour votre compte
Sendcloud par Mondial Relay », les étiquettes Mondial Relay sont sans frais de
plateforme, et les autres transporteurs coûtent 0,12 € par étiquette. L'onglet
« Mes contrats » ne porte aucun contrat propre : les tarifs appliqués sont ceux
négociés par Sendcloud.

### Grille réelle constatée

Relevée le 6 septembre 2026 dans le simulateur Sendcloud, France vers France.
Prix hors taxes, TTC calculé à 20 %.

| Tranche | Point Relais et Locker | Domicile Mondial Relay | Domicile Colissimo |
|---|---|---|---|
| 0,25 à 0,5 kg | 3,42 € HT, **4,10 €** TTC | 6,24 € HT, 7,49 € TTC | 8,35 € HT, 10,02 € TTC |
| 0,5 à 1 kg | 3,76 € HT, 4,51 € TTC | 7,90 € HT, 9,48 € TTC | 10,10 € HT, 12,12 € TTC |
| 1 à 2 kg | 5,27 € HT, 6,32 € TTC | 9,13 € HT, 10,96 € TTC | 11,33 € HT, 13,60 € TTC |

Le tarif Point Relais de 4,10 € décidé le 29 juillet **tombe juste** : 3,42 € HT
font 4,104 € TTC. La valeur avait été retenue en TTC sur la grille publique, et
la grille réelle la confirme au centime.

Le tarif domicile de 4,99 € était en revanche **très en dessous du coût réel**,
7,49 € TTC. Chaque livraison à domicile aurait coûté 2,50 € à l'exploitante, et
7,49 € au-dessus du seuil de gratuité, sur un panier moyen attendu entre dix et
trente euros.

## Décision

### Le domicile est facturé à son prix coûtant

**7,49 € TTC**, le tarif réel de la tranche 0,25 à 0,5 kg.

Le client arbitre lui-même entre 4,10 € en point de retrait et 7,49 € à domicile,
en connaissant l'écart. Décision de l'exploitante le 6 septembre 2026 : afficher
le prix réel plutôt que de subventionner un mode de confort.

### Le seuil de gratuité ne vaut plus que pour le Point Relais et le Locker

À partir de 39 €, la livraison est offerte **en Point Relais et en Locker
uniquement**. Le domicile reste facturé 7,49 € quel que soit le montant du panier.

Offrir un port de 4,10 € au-delà de 39 € se finance sur la marge. En offrir un de
7,49 € sur une commande de 40 € ne se finance pas. Le seuil garde son rôle
d'incitation à augmenter le panier, en dirigeant vers le mode le moins coûteux
pour tout le monde.

### La perte sur les colis lourds est assumée

À 7,49 €, un colis de plus de 500 g coûte plus cher qu'il n'est facturé : 9,48 €
entre 0,5 et 1 kg. Le tarif public reste **fixe**, sans grille par tranche, et
l'exploitante absorbe l'écart. Décision du 6 septembre 2026, cohérente avec
ADR-025 qui écarte tout moteur tarifaire.

Le cas est rare : un bijou et son emballage restent sous 500 g. Le même
raisonnement vaut pour le Point Relais, où la tranche supérieure coûte 4,51 €
pour 4,10 € facturés.

### Le délai du domicile est annoncé

Mondial Relay livre à domicile en **4 à 6 jours**, contre 2 à 4 jours en point de
retrait. Le délai est annoncé au tunnel et sur la page Livraison, jamais découvert
après la commande. Un délai plus long accepté en connaissance de cause ne produit
pas de réclamation, un délai subi si.

### L'intégration passe par l'API Sendcloud

La recherche de points de retrait, la création d'étiquettes et le suivi passent
par l'**API Sendcloud**, disponible sur le compte, et non par l'API Mondial Relay.

## Alternatives écartées

**Garder 4,99 € et absorber 2,50 € par colis.** Écartée par l'exploitante. Sur un
panier moyen de dix à trente euros, l'écart représente une part significative de
la marge d'une vente, pour un mode de confort que le client choisit librement.

**Basculer le domicile sur Colissimo**, 2 jours au lieu de 4 à 6. Écartée : le
tarif réel est de 10,02 € TTC, soit 2,53 € de plus que Mondial Relay pour la même
tranche. L'exploitante préfère annoncer un délai plus long qu'un prix plus élevé.
L'argument d'ADR-025 contre un second transporteur, deux comptes et deux
intégrations, ne tient d'ailleurs plus : Sendcloud fournit les deux depuis une
seule API. C'est donc le prix, et non la complexité technique, qui écarte
Colissimo aujourd'hui. Le champ `Expedition.transporteur` reste une chaîne libre.

**Une grille tarifaire par tranche de poids**, répercutant le coût réel. Écartée
pour le même motif qu'ADR-025 : un tarif variable découvert au tunnel dégrade la
conversion, et LS-27 exige l'affichage du tarif dès la fiche produit, ce qu'un
tarif dépendant du panier rend impossible.

**Afficher 7,99 € pour se ménager une marge sur les colis lourds.** Écartée par
Christophe : le prix réel a une valeur en soi, et le cas du colis lourd est rare.

## Conséquences

### Configuration

`SHIPPING_HOME_RATE_CENTS` passe de 499 à **749**. `SHIPPING_RELAY_RATE_CENTS` et
`SHIPPING_FREE_THRESHOLD_CENTS` sont inchangées.

### Calcul des frais de port

`calculerFraisPort` applique aujourd'hui la franchise **sans regarder le mode** :
un panier au-dessus du seuil rend zéro pour les trois modes. La franchise devient
conditionnelle, réservée aux modes qui exigent un point de retrait.

Le changement est petit mais il ne relève pas de la configuration : c'est une
règle de calcul, et elle se teste. Un test doit exercer un panier au-dessus du
seuil en mode `DOMICILE` et vérifier qu'il rend 749 et non 0.

### Affichage

La page Livraison, la foire aux questions et le tunnel annoncent désormais deux
régimes distincts : le seuil de gratuité ne vaut que pour le Point Relais et le
Locker. Un texte qui promet « livraison offerte dès 39 € » sans réserve devient
faux pour le domicile, et un tarif affiché divergeant du tarif facturé est une
information précontractuelle fausse, risque déjà énoncé dans LS-27.

Le délai de 4 à 6 jours du domicile s'affiche à l'étape du choix du mode.

### Rétractation

Le remboursement des frais de livraison reste **intégral**, au tarif réellement
payé. La faculté de plafonnement de l'article L221-24 alinéa 4 reste écartée,
décision d'ADR-025 inchangée. Une rétractation sur une commande livrée à domicile
rembourse donc 7,49 €.

L'écart entre modes passe de 0,89 € à 3,39 €, ce qui rend le plafonnement plus
tentant qu'en juillet. Il reste écarté pour le même motif : désigner un mode
standard dans les conditions générales et au tunnel, écrire une règle de
remboursement plafonné et la tester coûte plus que l'écart, pour un cas rare.
Confirmé le 6 septembre 2026.

### La Corse n'est plus un point ouvert

ADR-025 demandait de revérifier si la Corse porte un supplément, et interdisait de
trancher sans Christophe et l'exploitante. Le sujet est **abandonné** à leur
demande le 6 septembre 2026.

Le simulateur Sendcloud ne descend pas au code postal, il ne connaît que le pays :
la vérification aurait exigé de créer une étiquette réelle vers une adresse corse.
La Corse reste desservie au tarif France annoncé. Si un supplément apparaît sur
une facture réelle, le sujet se rouvrira sur pièce.

## Risques

**Le tarif domicile est constaté, non contractuel.** Le simulateur Sendcloud
avertit que ses prix sont des estimations et que le tarif définitif se fixe à la
création de l'étiquette. Le premier envoi réel confirmera ou infirmera les 6,24 €
HT, et c'est ce que LS-27 attend encore.

**Aucune étiquette n'a été achetée.** Les tarifs viennent du simulateur, pas d'une
facture. Le critère 1 de LS-27, « compte ouvert, étiquettes et formats testés
réellement », n'est donc pas rempli.

**7,49 € peut freiner le domicile.** C'est l'effet recherché, le point de retrait
étant moins coûteux pour tout le monde, mais un client sans point relais proche
n'a pas d'alternative bon marché. À surveiller sur les premières ventes.

**Le tarif fixe expose toujours à une perte unitaire** sur un colis de plus de
500 g, dans les deux régimes. Assumé, motif inchangé depuis ADR-025.

**Sendcloud devient une dépendance du parcours de commande.** ADR-025 avait prévu
le repli, `MODES_SANS_POINT_RETRAIT` : quand la liste des points de retrait ne
peut pas s'afficher, le domicile reste offert et la vente continue. Ce repli vaut
pour Sendcloud comme il valait pour Mondial Relay.

## Sources

- Simulateur de prix Sendcloud, compte de l'exploitante, consulté le 6 septembre
  2026, France vers France, tranches 0,5 kg, 1 kg et 2 kg
- Page Transporteurs du compte Sendcloud, mention de la formule Abonnement
  activée par Mondial Relay et des 0,12 € par étiquette hors Mondial Relay
- Article L221-24 du Code de la consommation, alinéa 4, faculté de plafonnement
  écartée
- ADR-025, modes de livraison, dont cet ADR prend la suite
