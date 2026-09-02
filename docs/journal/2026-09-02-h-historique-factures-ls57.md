# 2 septembre 2026, session H : LS-57, l'historique et les factures

Le client connecté voit ses commandes, leur suivi, et télécharge ses factures et
ses avoirs. C'est le motif principal de l'arbitrage du 28 juillet, et LS-56 vient
d'y faire entrer les commandes passées sans compte.

Le fil de la session : **les revues ont trouvé dix défauts, dont une faille de
gravité haute que ce travail n'a pas introduite mais rendue visible.**

## Ce que le schéma portait déjà

Aucune migration. `Commande.utilisateurId` est écrit depuis LS-56, `Facture` et
`Avoir` existent avec leur `cheminPdf`, et le volume de documents est distinct
de celui des médias depuis ADR-007.

## Le principe suivi, et sa limite

**L'autorisation vit dans le `where`, jamais dans une comparaison après coup.**
Une lecture suivie d'un `if (commande.utilisateurId !== moi)` laisse un chemin
où le `if` est oublié ; ici la requête ne trouve pas la ligne, il n'y a rien à
oublier.

La revue critique a nommé la limite exacte de ce principe, et c'est la phrase la
plus utile de la journée :

> Il protège les chemins qui passent par ta fonction, pas ceux qui atteignent la
> même donnée autrement.

Mes sept mutations ciblaient toutes des conditions de mes propres `where`. Aucune
ne pouvait rougir sur un chemin voisin.

## La faille, mesurée sur la base

**Un lien signé de facture survivait à la suppression du compte.**

```
AVANT session -> AUTORISE      APRES session -> REFUSE
AVANT jeton   -> AUTORISE      APRES jeton   -> AUTORISE
```

`JetonAcces` pend sur `Commande`, jamais sur `Utilisateur` : ni le `DELETE` ni
aucune politique de clé étrangère ne le touche. Un lien reçu par email restait
valide **jusqu'à trente jours** après que la personne ait exercé son droit à
l'effacement, et il sert un document portant son nom, son adresse figée et ses
montants. Sur une boîte partagée, revendue, ou un poste familial, c'est un tiers
qui l'ouvre.

Le défaut est **antérieur**, il vient de LS-132. LS-57 ne l'introduit pas, elle
le rend visible en filtrant `dissocieA` là où le chemin voisin ne le faisait pas.

### Deux lignes de défense, et chacune a son test

| Ligne | Où | Ce qu'elle ferme |
|---|---|---|
| révocation des jetons | transaction de suppression | les jetons émis avant |
| filtre `dissocieA` | `lireFactureAServir` | une révocation future oubliée |

**Trois mutations le prouvent** : retirer la première fait rougir le premier test
seul, retirer la seconde le second seul, retirer les deux fait rougir les deux.
Aucune ne masque l'autre, ce qui distingue une vraie redondance d'un filet non
éprouvé, motif déjà rencontré sur ce projet.

C'est le geste symétrique du point 8 des transactions critiques : remplacer ou
supprimer ce qui **désigne** un jeton ne touche pas le jeton lui-même.

## Ce que la revue frontend a trouvé

**Un mode de livraison ajouté aurait vidé le champ.** `LIBELLES_LIVRAISON` était
`Record<string, string>` : un mode absent de la table rend `undefined`, que React
affiche en chaîne vide. Prouvé par mutation, ajouter `CONSIGNE` à l'enum ne
faisait échouer que le tunnel.

Le typage exhaustif a ensuite révélé que **l'administration lisait
`modeLivraison` en `string`**, ce qui rendait sa propre table indexable par
n'importe quoi. Corrigé des deux côtés.

**Le mode réellement exécuté était lu et jamais affiché.** Le commentaire du
repository promettait « les deux sont affichés quand ils diffèrent », ADR-025, et
le rendu ne le faisait pas : un client rebasculé de domicile vers Point Relais
voyait « À domicile », sans aucun moyen d'apprendre où son colis était parti.

**La section de suivi pouvait être vide**, titre suivi d'une liste sans ligne :
ses quatre champs sont tous nullables, `livreA` l'étant toujours avant LS-33.

**L'adresse figée produisait des lignes vides** : seul `ligne2` était
conditionnel alors que le type déclare tous ses champs optionnels.

### Le contraste, corrigé deux fois et faux les deux fois

J'ai annoncé **7,49:1**, qui est le rapport sur sable. Corrigé en **5,19:1** en
croyant le bloc uniquement sur blanc. La revue a montré que la **même classe sert
sur deux fonds** : blanc dans la liste, crème dans le détail.

| Classe | Fond réel | Rapport |
|---|---|---|
| `.variante` en liste | blanc, `.commande` | 5,19:1 |
| `.variante` en détail | crème, héritée du body | 4,86:1 |

Les deux passent AA, la seconde avec 0,36 de marge. C31 dit que ce qui se mesure
est une paire : **cela vaut aussi quand la couleur ne bouge pas.**

`verifier-contraste.sh` ne voit ni l'une ni l'autre, ces classes ne déclarant pas
de fond : elles sont dans les 166 déclarations que le script assume ne pas voir.
Seul `axe-core` les mesure, au rendu.

## La fixture qui ne pouvait pas voir ce qu'elle mesurait

Le test de débordement à 320 px tournait sur « Client verifie », « 1 rue du
Test » et 49,99 €. **Aucune de ces valeurs ne peut faire déborder quoi que ce
soit.**

C'est le motif du contrôle qui n'a jamais échoué sur le défaut qu'il prétend
attraper. La fixture porte désormais un libellé de quarante caractères sans
espace, des montants à trois chiffres, et une adresse à cinq lignes.

Elle se **recrée** à chaque exécution : `ON CONFLICT DO NOTHING` ne remplace
jamais une fixture durcie, et onze tests ont rougi en cherchant des valeurs que
la ligne conservée ne portait pas.

## Un fichier de sonde entré par un `git add` large

`ls-critical-reviewer` avait écrit une sonde pour interroger la base, et un
`git add -A` lancé **pendant** qu'elle travaillait l'a commitée.

Retirée par un commit dédié plutôt que par une réécriture d'historique : la trace
de l'incident vaut mieux que son effacement. **Le motif à retenir est que
`git add -A` en présence d'un agent concurrent commite ses fichiers de travail.**

## Vérifications

```
npm run type-check                                  OK
npm run lint                                        OK
npm run format:check                                All matched files use Prettier code style!
npm run build                                       4 routes dynamiques
npm run test                                        974 passed, 63 fichiers
npx playwright test                                 625 passed, 4 skipped
./scripts/verifier-contraste.sh                     OK
./scripts/verifier-regles.sh                        OK
./scripts/verifier-loading-et-404.sh                OK
./scripts/verifier-actions-sensibles.sh             OK
./scripts/verifier-gardes-administration.sh         OK
```

**Douze mutations, douze détectées :**

| Mutation | Test qui rougit |
|---|---|
| `utilisateurId` retiré de la liste | les commandes du voisin apparaissent |
| `utilisateurId` retiré du détail | l'URL manipulée ouvre celle d'un tiers |
| `dissocieA` retiré de la liste | une commande dissociée réapparaît |
| `utilisateurId` retiré de la facture | la facture d'un tiers est servie |
| maillon commande sauté sur l'avoir | l'avoir d'un tiers est servi |
| garde du PDF absent affaiblie | un chemin nul serait servi |
| `dissocieA` retiré de l'avoir | les documents d'un compte supprimé |
| révocation des jetons retirée | le lien signé survit, test 1 seul |
| filtre `dissocieA` de LS-132 retiré | la révocation oubliée, test 2 seul |
| les deux retirées | les deux tests |
| `LIBELLES_LIVRAISON` en `Record<string,…>` | le type-check du tunnel |

## Ce qui reste

**Aucune dette ouverte par cette story.**

Deux tickets créés en chemin, tous deux hors périmètre :

- **LS-165**, le contrôle d'atteignabilité des écrans de la boutique. Rien ne
  vérifie qu'un écran est désigné par un lien, alors que le défaut s'est produit
  deux fois, LS-162 et `/compte/verification`
- **LS-166**, la largeur 768 px, exigée par l'invariant 10 et mesurée par aucun
  projet Playwright depuis le début

## Prochaine étape

**LS-59**, le carnet d'adresses. L'index partiel `adresse_defaut_unique` existe
en base et n'est **pas différable** : l'ordre des écritures est imposé, retirer
le drapeau de l'ancienne avant de le poser sur la nouvelle, point 9 des
transactions critiques.

Puis **LS-60** le profil, qui activera `user.changeEmail` et rendra `emailVerifie`
atteignable par un troisième chemin, dépendance tracée dans `REFERENCES.md`.
Enfin **LS-164** la réauthentification client et **LS-62** les droits RGPD.

## État des tickets

LS-57 livrée, PR à ouvrir. LS-165 et LS-166 créées, rattachées à LS-3.
