# 6 septembre 2026, g : le compte de livraison est ouvert, les tarifs réels contredisent le domicile

Session menée avec l'exploitante, présente pendant l'arbitrage. Point de départ :
« nous venons de créer le compte Mondial Relay Start ».

## Le compte n'est pas celui qu'on croyait

L'exploitante était sur `app.sendcloud.com` et demandait si c'était le bon
endroit. Ça l'est : Mondial Relay redirige désormais son offre sans contrat vers
**Sendcloud**, agrégateur qui porte le contrat. La redirection n'était pas une
erreur de parcours.

La page Transporteurs le confirme : « La formule Abonnement a été activée pour
votre compte Sendcloud par Mondial Relay », étiquettes Mondial Relay sans frais
de plateforme, 0,12 € par étiquette pour les autres transporteurs. L'onglet
« Mes contrats » ne porte **aucun contrat propre** : les tarifs appliqués sont
ceux négociés par Sendcloud.

Le compte affiche trois transporteurs actifs, Colissimo et Mondial Relay sur les
tarifs Sendcloud, Chronopost disponible et désactivé.

## La grille réelle, relevée au simulateur

France vers France, hors taxes, TTC calculé à 20 %.

| Tranche | Point Relais et Locker | Domicile MR | Domicile Colissimo |
|---|---|---|---|
| 0,25 à 0,5 kg | 3,42 € HT, **4,10 €** TTC | 6,24 € HT, 7,49 € TTC | 8,35 € HT, 10,02 € TTC |
| 0,5 à 1 kg | 3,76 € HT, 4,51 € TTC | 7,90 € HT, 9,48 € TTC | 10,10 € HT, 12,12 € TTC |
| 1 à 2 kg | 5,27 € HT, 6,32 € TTC | 9,13 € HT, 10,96 € TTC | 11,33 € HT, 13,60 € TTC |

**Le relais tombe juste au centime.** 3,42 × 1,20 = 4,104. Le 4,10 € décidé le
29 juillet sur la grille publique était un prix TTC, et il est confirmé. J'ai
d'ailleurs annoncé prématurément que l'ADR-025 était à réviser sur ce point avant
d'avoir ouvert la répartition du prix : le simulateur affiche du HT, la
confusion a duré le temps d'un clic.

**Le domicile ne tombait pas.** 4,99 € annoncés contre 7,49 € réels, soit 2,50 €
perdus par colis sous le seuil, et 7,49 € au-dessus, sur un panier moyen attendu
entre dix et trente euros.

## Ce que l'exploitante a tranché

Questions posées en langage courant, réponses immédiates :

- **le domicile est facturé à son prix réel, 7,49 €.** « C'est le client qui
  décidera s'il est prêt à payer plus cher que le locker »
- **Colissimo est écarté**, plus rapide mais 10,02 € : « beaucoup plus cher »
- **le délai de 4 à 6 jours est assumé** et sera annoncé sur le site et dans le
  délai estimé
- **le seuil de gratuité ne vaut plus que pour le Point Relais et le Locker**
- **la Corse est abandonnée** comme sujet
- **la perte sur les colis de plus de 500 g est acceptée**, le tarif reste fixe

Christophe a validé deux points signalés : la perte au-delà de 500 g plutôt
qu'un affichage à 7,99 €, et le remboursement intégral des frais de port en
rétractation, qui rembourse désormais 7,49 € sur une commande à domicile.

## Ce qui est livré

**ADR-035** prend la suite d'ADR-025 sur quatre points. ADR-025 garde son contenu
intact et passe en « partiellement remplacé » : il enregistre une décision prise
le 29 juillet sur la grille publique, et la réécrire effacerait ce qui a été
appris. C'est le premier ADR du projet à en remplacer un autre, la forme est
donc établie ici : une table de ce qui est périmé, une phrase de ce qui reste.

`calculerFraisPort` porte la réserve de franchise. Elle n'est **pas** un
paramètre d'environnement, délibérément : aucune variable ne rend le domicile
gratuit au seuil.

La condition porte sur `exigePointRetrait(mode)` et non sur `mode !== "DOMICILE"`.
La seconde forme accorderait la franchise en silence à une quatrième valeur
d'enum ajoutée plus tard, piège déjà rencontré deux fois sur ce projet, sur un
prédicat d'index partiel puis sur un affichage.

Documents propagés : `.env.example`, `PARCOURS.md`, `PROTOTYPE.md`,
`frontend-design.md` où « offerte dès 39 €, tous modes » serait devenu une
information précontractuelle fausse, `legal.md` où l'écart justifiant d'écarter
le plafonnement passe de 0,89 € à 3,39 €, et `REFERENCES.md`.

## Le test disait l'inverse de la règle

`it.each([...])("offre la livraison au seuil pour %s")` portait les trois modes,
`DOMICILE` compris. Il ne suffisait pas d'ajouter un cas, il fallait retirer
celui qui affirmait le contraire, sans quoi la suite se serait contredite.

Deux cas ont été ajoutés au-delà du strict nécessaire, chacun fermant une
implémentation fautive qui passerait sinon : le domicile facturé à 100 000
centimes, très au-dessus du seuil et pas seulement dessus, et le relais facturé
quand la franchise est désactivée.

**Mutation** : `exigePointRetrait(mode) &&` remplacé par `true &&` fait rougir
**3 tests sur 28**, ceux qui portent la règle. Ni un vert silencieux, ni une
suite entière qui s'effondre, ce qui aurait relevé du défaut « mutation trop
brutale ».

## Un commentaire qui énumérait des valeurs

`montantRemboursable` disait « le tarif REELLEMENT PAYE, 410 ou 499 selon le
mode ». L'énumération est devenue fausse le jour où 499 est devenu 749, alors que
la phrase qu'elle illustrait, lire la commande plutôt que recalculer, est
précisément ce qui rend le changement sans conséquence sur les commandes
passées. Une commande d'avant ce jour porte toujours 499, invariant 3.

L'énumération est retirée. Le motif est plus général : **un commentaire qui
illustre une règle par la liste des valeurs du moment se périme avec elles**,
alors que la règle tient.

## Vérifications

```
npm run type-check    vert
npm run lint          vert
vitest --project unitaire   504 tests, 30 fichiers, tous verts
verifier-regles.sh    conforme, 71 dossiers couverts
npm run format:check  propre
```

Mutation exercée et fichier restauré, vert reconfirmé après restauration.

## Dérives et limites

**Claude in Chrome a refusé de se connecter trois fois** avant de fonctionner,
sur un profil où l'extension était pourtant installée, activée et autorisée sur
tous les sites. Réveiller le service worker n'a rien changé. Ce qui a débloqué
n'a pas été identifié. J'ai relancé la même commande trois fois avant de
proposer un contournement, ce qui était une fois de trop.

**Deux URL de réglages ont été devinées et redirigeaient au tableau de bord.**
Passer par les menus aurait été plus rapide.

**La Corse n'a pas été vérifiée techniquement.** Le simulateur ne descend pas au
code postal, il ne connaît que le pays. La seule voie depuis l'interface était de
créer une étiquette réelle vers une adresse corse, ce qui écrit sur le compte.
Le sujet est abandonné par décision, pas par constat.

**Aucune étiquette n'a été achetée.** Les tarifs viennent du simulateur, qui
avertit lui-même que le prix définitif se fixe à la création de l'étiquette. Le
critère 1 de LS-27 reste ouvert.

## État des tickets

**LS-27** reste `À faire`. Le blocage du compte est levé, la grille est
confrontée, mais le critère 1 exige des étiquettes testées réellement. Deux
critères sur cinq restent hors d'atteinte sans un envoi réel.

## Prochaine étape

**LS-199** garde sa priorité, un contrôle rouge que personne ne regarde laisse
chaque story suivante livrer sur une base fausse.

À ouvrir ensuite, non ticketé à ce jour : **l'intégration de l'API Sendcloud**,
qui remplace l'API Mondial Relay prévue. Le repli existe déjà,
`MODES_SANS_POINT_RETRAIT`, et il vaut pour Sendcloud comme il valait pour
Mondial Relay.

À vérifier au premier envoi réel : que 6,24 € HT est bien le montant facturé.
