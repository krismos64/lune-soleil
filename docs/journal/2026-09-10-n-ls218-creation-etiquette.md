# 10 septembre 2026, n : LS-218, la création d'étiquette

Un chantier décidé le 28 juillet, jamais ticketé, trouvé en cherchant ce qui
restait sur Sendcloud après LS-216 et LS-58.

## Le trou de backlog, et c'est le deuxième du même ticket

LS-33 énonce **quatre chantiers** d'intégration du transporteur. Trois étaient
livrés, le deuxième n'avait aucun ticket :

| Chantier | Story |
|---|---|
| Choix du point de retrait au tunnel | LS-200 |
| **Création de l'expédition et étiquette** | **aucune, jusqu'à LS-218** |
| Synchronisation des statuts | LS-131 |
| Affichage du suivi | LS-58, LS-216 |

LS-200 l'avait **différé** en renvoyant à LS-153, dont la description ne
mentionne les étiquettes nulle part. Motif « dette annoncée hors outil ».

C'est le **deuxième** trou né de LS-33 : LS-216 était le premier, découvert la
veille. Un ticket qui énumère des chantiers dans sa prose les perd au découpage.

## Ce que l'exploitante faisait, mesuré

Aucun appel de création de colis n'existait dans `src/`. Elle ouvrait Sendcloud
dans un autre onglet, **ressaisissait l'adresse** que la commande porte déjà,
imprimait, puis revenait **recopier** le numéro de suivi.

Deux ressaisies par colis, dont une adresse postale : le geste le plus exposé à
l'erreur du parcours d'expédition, et une adresse fautive produit un colis perdu
dont le risque reste à la charge du vendeur jusqu'à la remise.

## Un manque que le ticket n'avait pas vu

`GET /api/v2/shipping_methods?to_country=FR` révèle que **la méthode dépend du
poids**, par tranches strictes. Or aucun poids n'existe au schéma, ni sur
`Produit` ni sur `Variante`.

**Arbitrage de Christophe** : poids forfaitaire, les pièces étant des boucles
d'oreilles sous 250 g. **200 g et non 250** : la tranche s'arrête à 0,251 kg, et
poser la valeur à sa limite ferait basculer de tranche au premier emballage un
peu lourd, avec un rattrapage facturé. Les cinquante grammes couvrent le carton
et le papier de soie.

Le forfait reste **lisible et configurable**. Une pièce plus lourde au catalogue
rouvrira le sujet, et le poids par variante deviendra une story.

## L'ordre des trois étapes est le cœur du service

```
1. VERIFIER en base que la commande est expediable et sans expedition
2. APPELER le transporteur, ce qui DEPENSE de l'argent
3. ECRIRE l'expedition avec le numero obtenu
```

Vérifier avant de payer est la seule protection contre une étiquette achetée
pour rien. Trois tests comptent les appels d'un transporteur simulé et exigent
**zéro** sur les cas refusés : vérifier seulement le refus laisserait passer un
service qui paie d'abord.

**Une fenêtre subsiste et aucun verrou applicatif ne la ferme.** Deux clics
simultanés passent tous deux l'étape 1, achètent tous deux une étiquette, et le
second échoue à l'étape 3 sur `commande_id` unique. C'est un colis payé en trop,
pas une base corrompue : la fenêtre vit chez le fournisseur. Le cas est
**journalisé**, seul moyen de retrouver le colis orphelin dont le numéro n'est
nulle part en base, et le test de concurrence le montre.

## Le risque que les tests eux-mêmes faisaient courir

`webServer` de Playwright hérite de l'environnement du processus parent, donc du
`.env` de développement, qui porte les clés Sendcloud depuis LS-200. **Un test
cliquant sur le bouton aurait acheté un envoi facturé à chaque exécution de la
suite**, sans que rien ne le signale avant la facture du mois.

Mesuré avant de corriger : **zéro colis sur les deux comptes**, la garde
« vérifier avant de payer » ayant refusé avant l'appel. La chance n'est pas une
protection : les clés sont neutralisées explicitement dans la configuration.

Plusieurs commentaires du dépôt affirmaient que ces clés « ne sont pas posées
dans l'environnement de bout en bout ». C'était vrai **en CI**, faux en local.
Une propriété acquise par l'environnement n'est pas une garantie.

**Le geste vaudra pour Stripe** en mode réel, à LS-153.

## La revue frontend a trouvé cinq défauts

Le plus coûteux : **l'identifiant de colis ne vivait que dans l'état du
composant**. La carte d'une commande `EXPEDIEE` ne rend plus le formulaire, donc
un rafraîchissement rendait une étiquette **payée** introuvable autrement qu'en
retournant sur Sendcloud, ce que la story existe pour supprimer. Le message de
succès demandait même de rafraîchir la page.

Corrigé par une migration additive et un lien porté par la **carte** plutôt que
par le formulaire.

**Deux défauts trouvés en corrigeant le premier.** L'identifiant glissé dans
`saisie` faisait échouer `schemaSaisieExpedition`, un `strictObject`, en « 1
champ non reconnu », que le service traduisait en `ADRESSE_INEXPLOITABLE` : un
message **faux** sur une adresse parfaite. Et mon diagnostic intermédiaire a
accusé `nomClient` à tort, l'adresse figée portant bien un nom — corrigé après
mesure sur la base plutôt que sur le type.

Les trois autres : `--ls-text-muted` à 4,35:1 sur le paragraphe portant le mot
« facturée » en gras, le lien sans zone tactile de 44 px, la région live qui
n'annonçait rien pendant l'appel, et `justify-self` inopérant dans un conteneur
flex.

## Un contrôle qui ne voyait pas ma classe

`verifier-contraste.sh` ne mesure qu'une paire **colocalisée**, `color` et
`background` dans le même bloc. Ma classe déclarait une couleur sur un fond
hérité : elle échappait entièrement au contrôle.

Prouvé par mutation : un `--ls-accent-gold` à **2,31:1** y passait au vert, et le
compte de paires ne bougeait pas. Le fond est redéclaré, 193 paires au lieu de
191, et la mutation rougit désormais.

## Vérifications

```
npm run type-check                    vert
npm run lint                          vert
npm run format:check                  vert
verifier-regles.sh                    règles conformes au schéma
verifier-contraste.sh                 193 paires, toutes conformes
verifier-bordure-controle.sh          seuil 3:1 tenu
verifier-actions-sensibles.sh         cohérentes
verifier-ponctuation-chargement.sh    17 annonces, C35
npm run db:verifier                   117 réussites, 0 échec
npm run test                          90 fichiers, 1432 tests, tous verts
vitest expedition (intégration)       45 tests
playwright administration-connectee    9 tests d'écran sur mobile-320
playwright catalogue-administration    8 tests de route, dont le négatif
```

## Ce qui reste ouvert, et pourquoi la story ne se clôt pas

**Le critère 10 exige un premier envoi réel** dont le tarif facturé soit relevé.
Il ne peut pas être rempli sans une vraie commande à expédier, et il ferme aussi
le critère 1 de LS-27, qui attend cette mesure depuis juillet.

La story reste donc **en cours**. Tout le reste est livré et prouvé.

**Aucune étiquette n'a été créée pendant ce travail**, vérifié sur les deux
comptes Sendcloud.

## État des tickets

**LS-218 créée, développée et FUSIONNÉE** le 10 septembre 2026 au soir, PR #379,
les huit contrôles de CONTRIBUTING au vert. Epic LS-5, bloquée par LS-153.

**Elle reste « En cours » et non close**, délibérément : neuf critères sur dix
sont remplis, et le dixième exige un premier envoi réel dont le tarif facturé
soit relevé. Le code est sur `main`, la story ne l'est pas encore.

Le compte passe à **173 sur 208** : le dénominateur a bougé de 207 à 208 dans la
soirée, LS-218 étant née de ce trou de backlog.

## Prochaine étape

**LS-61**, les avis vérifiés, débloquée par `livreA` désormais renseigné et
affiché. Ou **LS-190**, la frise d'étapes, débloquée par LS-58.
