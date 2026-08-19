# 19 août 2026, clôture des tickets restants de la phase 2

Session de vérification, sans code applicatif. Le journal du 18 août posait deux
chemins : clore ce qui est déjà fait, ou ouvrir la phase 3. Arbitrage de
Christophe : clore d'abord, pour que le découpage de LS-4 ne parte pas avec
quatre tickets qui mentent sur leur état.

Vingt-six critères d'acceptation confrontés au dépôt, un par un.

## Deux tickets clos, deux qui restent ouverts

| Ticket | Avant | Après | Motif |
|---|---|---|---|
| LS-63 | À faire | **Terminé** | les quatre critères en attente sont livrés par LS-106 |
| LS-87 | À faire | **Terminé** | les deux critères renvoyés à LS-105 sont vérifiables et remplis |
| LS-85 | À faire | En cours | trois critères portent sur le tunnel, qui n'existe pas |
| LS-84 | À faire | En cours | le contrôle automatique du critère 3 n'existe pas |

## Ce que la vérification a appris

**Un ticket renvoyé à une story future doit être rouvert quand elle arrive.**
LS-87 attendait LS-105 depuis le 14 août. LS-105 a été livrée le 18, et rien ne
l'a signalé : c'est la lecture des commentaires Jira qui l'a rattrapé, pas le
journal. Deux critères étaient remplis depuis la veille sans que personne le
sache.

**Le défaut de LS-84 est absent du code, et cela ne suffit pas à clore.**
`--ls-accent-terracotta` n'est employé nulle part comme valeur : ni en `color`,
ni en `background`. Seul `-deep` sert, en fond de badge. L'état est correct, mais
il n'est protégé par aucun contrôle. Rien n'empêche une session future de
réintroduire le jeton clair sur un petit texte, ce que le prototype fait 35 fois.

La distinction vaut d'être retenue : **un défaut absent et un défaut empêché ne
sont pas la même chose**. Clore sur le premier laisse le trou ouvert.

**Un critère peut être satisfait parce que rien ne l'exerce.** Le critère 9 de
LS-63 exige que le calcul du chiffre d'affaires ne lise jamais
`Variante.prixCentimes`. Aucun calcul de chiffre d'affaires n'existe : le critère
est vrai, vacuement. C'est écrit dans le commentaire de clôture plutôt que coché,
pour qu'une session future ne le tienne pas pour éprouvé.

## Ce qui reste sur les deux tickets ouverts

**LS-84** : écrire `scripts/verifier-contraste-terracotta.sh` sur le modèle de
`verifier-rendu-texte-simple.sh`, à deux sens, avec sa preuve d'ancrage. La
mutation doit porter sur les deux familles relevées le 13 août, le texte gras et
la graisse normale, et non sur le seul cas gras.

**LS-85** : `src/app/panier/` ne contient qu'un `actions.ts`. Ni page de panier,
ni tunnel. Le focus au changement d'étape, le test automatisé et la vérification
au lecteur d'écran attendent la phase 3. La story devient le rappel
d'accessibilité à porter au découpage de LS-4.

## État des epics

**LS-3, phase 2** : les huit stories du découpage LS-99 à LS-106 sont terminées,
plus LS-63 et LS-87 closes ce jour. Restent LS-84 et LS-85, toutes deux en cours
et toutes deux dépendantes de travaux futurs pour leur part restante.

## Prochaine étape

**Ouvrir la phase 3, epic LS-4**, panier, réservation et paiement. C'est le jalon
le plus risqué du projet, celui du test de concurrence sur une variante à un
exemplaire, à écrire avant le paiement.

Trois points connus l'attendent :

- le bouton d'ajout au panier de LS-105 retrouve son état actif
- la libération des réservations expirées, dont LS-106 a montré l'absence :
  `quantiteReservee` ne redescend jamais tant qu'elle n'existe pas
- les deux points d'accessibilité de LS-85, à porter dans les stories du tunnel
  plutôt qu'à traiter après coup

Le découpage de LS-4 est le travail immédiat.
