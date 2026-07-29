# ADR-025 : modes de livraison, ajout du domicile au Go-Live

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 29 juillet 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-27, LS-33 |

## Ce que cet ADR remplace

**Aucun ADR.** Il n'existait pas d'ADR de livraison avant celui-ci : la décision
du 28 juillet 2026 vivait uniquement dans deux tickets Jira, LS-27 pour les
tarifs et LS-33 pour le suivi. C'est précisément la lacune que cet ADR corrige,
une décision structurante devant produire un ADR.

Il **modifie** les éléments suivants, qui limitaient la livraison au Point Relais
et au Locker :

| Élément | Ce qui change |
|---|---|
| LS-27 | « Point Relais et Locker » devient trois modes, tarif unique 4,10 € devient deux tarifs |
| LS-33 | les événements de suivi couvrent aussi la remise à domicile |
| `PARCOURS.md`, parcours 1 | une étape de choix du mode de livraison entre le panier et la commande |
| `MODELE-CONCEPTUEL.md` | l'expédition porte un mode explicite |
| `prisma/schema.prisma` | `Expedition.mode`, enum `ModeLivraison` |
| `.claude/rules/legal.md` | le tableau des événements de suivi |

La phrase de LS-27 « la livraison à domicile pourra être ajoutée ensuite » est
caduque : elle est ajoutée maintenant, avant l'ouverture.

## Contexte

La décision du 28 juillet 2026 retenait Mondial Relay en Point Relais et Locker,
à 4,10 €, offerts dès 39 €. Le domicile était renvoyé à plus tard.

Deux éléments justifient de l'avancer. Le retrait en Point Relais suppose un
déplacement et des horaires d'ouverture, ce qui écarte une part des acheteurs,
notamment ceux qui offrent un bijou et ne veulent pas d'une contrainte de
retrait. Et l'ajouter après l'ouverture coûterait plus cher qu'au moment de la
conception : le mode de livraison touche le tunnel, la commande, l'expédition,
l'administration, l'espace client, les emails et les documents commerciaux. Un
champ ajouté après coup sur des commandes existantes impose une migration et une
valeur de repli arbitraire pour l'historique.

Le schéma actuel ne porte **aucun mode de livraison**. `Expedition` a un
`pointRelaisId` nullable, dont la seule présence ou absence servirait à deviner
le mode. Deviner un fait commercial à partir d'une colonne nullable est
exactement le défaut corrigé en LS-49 sur d'autres champs.

## Décision

Trois modes de livraison au Go-Live, transporteur unique Mondial Relay, offre
Start : **Point Relais, Locker et domicile**. Aucun second transporteur.

Le mode choisi est **figé dans la commande**, avec les frais de port
correspondants, au même titre que l'adresse et le prix. Il n'est jamais recalculé
depuis la configuration courante.

### Politique tarifaire publique

| Panier | Point Relais | Locker | Domicile |
|---|---|---|---|
| Sous 39 € | 4,10 € | 4,10 € | 4,99 € |
| À partir de 39 € | offert | offert | offert |

Le tarif facturé au client **ne varie jamais selon le poids, le volume ou la
destination**. Si le coût réel facturé par Mondial Relay dépasse le tarif public,
la différence est absorbée par l'exploitante. Aucun moteur tarifaire, aucune
grille par tranche, aucune tarification variable côté client.

Ces valeurs restent des **paramètres de configuration**, jamais des constantes de
code, et sont vérifiées côté serveur. Le seuil de gratuité est modifiable et
désactivable, conformément à LS-27.

### Zone desservie

France métropolitaine, **Corse comprise**, hors zones surtaxées.

La Corse est incluse au tarif France chez Mondial Relay, sans supplément et pour
les trois modes. Vérifié le 29 juillet 2026 sur la documentation tarifaire du
transporteur. Aucun arbitrage d'exclusion n'a donc été nécessaire.

Ce point est à **revérifier à l'ouverture réelle du compte** : une grille
professionnelle peut différer de la grille publique, et un supplément insulaire
apparu ultérieurement rouvrirait la question. Dans ce cas, l'arbitrage revient à
Christophe et à l'exploitante, entre absorber le supplément, restreindre la Corse
au Point Relais et au Locker, ou exclure le domicile sur les codes postaux
concernés. Ne pas trancher ce point sans eux.

### Rétractation et frais de livraison

Les frais de livraison réellement payés sont remboursés en cas de rétractation,
quel que soit le mode choisi.

L'article L221-24 alinéa 4 permettrait de ne pas rembourser le surcoût d'un mode
« plus coûteux que le mode de livraison standard proposé par le professionnel ».
Cette faculté n'est **pas retenue** : l'écart est de 0,89 €, et l'exercer
imposerait de désigner un mode standard dans les conditions générales et au
tunnel, d'écrire une règle de remboursement plafonné et de la tester. Le coût de
la complexité dépasse l'enjeu.

Les frais de **retour** restent à la charge du client, décision inchangée de
LS-27, avec l'obligation d'information préalable de l'article L221-5.

## Alternatives écartées

**Garder le Point Relais seul jusqu'après l'ouverture.** C'était la décision du
28 juillet. Écartée parce que le mode de livraison est structurant : il traverse
sept surfaces du produit, et l'ajouter après coup impose une migration sur des
commandes réelles avec une valeur de repli inventée pour l'historique.

**Un second transporteur pour le domicile**, Colissimo par exemple. Écarté : deux
comptes, deux intégrations, deux formats d'étiquette, deux systèmes de suivi à
réconcilier, pour un catalogue de 10 à 40 références. L'offre Start couvre les
trois modes. Le champ `Expedition.transporteur` reste néanmoins une chaîne libre,
ce qui laisse la porte ouverte sans rien coder aujourd'hui.

**Répercuter le coût réel du transporteur** selon le poids et la destination.
Écarté : le prix moyen d'une paire est d'environ dix euros, les bijoux sont
légers et le poids ne fera pas varier la tranche tarifaire. Un moteur tarifaire
serait une complexité pure, et un tarif variable découvert au tunnel dégrade la
conversion. LS-27 exige d'ailleurs l'affichage du tarif dès la fiche produit, ce
qu'un tarif dépendant du panier rendrait impossible.

**Déduire le mode de `pointRelaisId`.** Écarté : une colonne nullable qui sert à
la fois de donnée et de discriminant est ambiguë. Un `pointRelaisId` nul
signifierait « domicile » mais aussi « relais non encore choisi » ou « donnée
perdue ». La distinction se code en enum explicite.

## Conséquences

### Modèle de données

Un enum `ModeLivraison` à trois valeurs, `POINT_RELAIS`, `LOCKER`, `DOMICILE`.

`Commande.modeLivraison` porte le choix **figé**, non nul, au même titre que
`fraisPortCentimes` déjà présent. Le figer sur la commande et non seulement sur
l'expédition est nécessaire : une commande existe et affiche son mode avant
qu'aucune expédition n'existe, entre le paiement et la préparation.

`Expedition.mode` porte le mode réellement exécuté. Il vaut normalement celui de
la commande, et peut en différer après un échec de livraison rebasculé en Point
Relais. Deux champs, deux faits distincts : ce que le client a choisi et payé,
ce que le transporteur a exécuté.

Une contrainte lie le mode à l'adresse : `pointRelaisId` est **obligatoire** pour
`POINT_RELAIS` et `LOCKER`, et **nul** pour `DOMICILE`. Elle s'écrit en `CHECK`,
donc dans la migration manuelle, Prisma 7 ne générant pas les `CHECK`.

L'adresse postale complète est déjà exigée pour la facturation, `adresseLivraison`
et `adresseFacturation` étant deux copies figées distinctes. Le domicile n'ajoute
donc aucun champ d'adresse.

### Tunnel de commande

Une étape de choix du mode s'insère entre le panier et la validation, avant le
calcul du total : les frais de port en dépendent. Le choix du point de retrait ne
s'affiche que pour `POINT_RELAIS` et `LOCKER`.

### Suivi

Les événements de suivi diffèrent selon le mode. La règle de LS-33 reste entière
et s'étend : seul un événement signifiant que le client détient physiquement le
colis renseigne `Expedition.livreA`. Pour le domicile, c'est la remise au
destinataire ; une mise en distribution ou un avis de passage ne vaut rien.

Un échec de livraison à domicile peut produire une bascule vers un Point Relais.
L'expédition change alors de `mode` et reçoit un `pointRelaisId`, la commande ne
change pas : le client a payé le domicile, ce fait est acquis.

### Ce qui ne change pas

Réservation de stock, paiement, idempotence, facturation, calcul du délai de
rétractation, authentification, carnet d'adresses et avis vérifiés sont
inchangés. Le mode de livraison n'intervient dans aucun de ces mécanismes.

## Risques

**Le compte Mondial Relay n'est pas ouvert**, bloqué par le compte bancaire
professionnel. Les identifiants réels sont une dépendance externe. Aucune réponse
d'API ne doit être inventée, aucun secret factice créé. Le domicile est conçu
maintenant et vérifié réellement quand le compte existe.

**La grille professionnelle peut différer de la grille publique.** Si le domicile
en Corse s'avère surtaxé, l'arbitrage remonte à Christophe, voir plus haut.

**Le tarif public fixe expose à une perte unitaire** si un colis dépasse la
tranche prévue. Assumé : bijoux légers, écart faible, et la marge se pilote au
seuil de gratuité qui reste configurable.

**Trois modes à tester plutôt qu'un.** Les tests de tunnel et d'expédition se
déclinent en trois cas, dont deux partagent le point de retrait. La contrainte
`CHECK` liant mode et point de retrait est la garantie qui empêche une
combinaison incohérente d'atteindre la base.

## Sources

- Article L221-24 du Code de la consommation, remboursement des frais de
  livraison et faculté de ne pas rembourser le surcoût d'un mode plus coûteux
- Article L221-5, information préalable sur les frais de renvoi
- Documentation tarifaire Mondial Relay, Corse incluse au tarif France,
  consultée le 29 juillet 2026
