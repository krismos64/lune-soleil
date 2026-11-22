# 22 novembre 2026 : barre de recherche du catalogue, et LS-335, les acheteurs sans compte

## Demandes

Christophe, dans la même session :

1. Search Console, après LS-334 : quelle page indexer. Réponse : la fiche
   contrôlée en production, `/produit/boucles-d-oreilles-bonhommes-de-neige-pailletes`,
   puis « Valider la correction » sur l'alerte `deliveryTime`. Fait par
   Christophe, commentaire posté sur LS-334.
2. « Une barre de recherche sur la page des créations, sans ticket ni test,
   jolie et intuitive. »
3. La commande à 1 € de la semaine (test voulu) n'apparaît pas dans Clients :
   normal ?
4. L'exploitante voudrait voir les acheteurs sans compte dans Clients :
   **LS-335**, puis « fais tout sans interruption ».

## 1. Barre de recherche du catalogue, sans ticket

Arbitrage de Christophe : la recherche interne passe de Could V1.x à livrée,
sans ticket ni test commité. `frontend-design.md` le dit désormais.

- `BarreRecherche`, formulaire `GET` sans JavaScript, pilule blanche, loupe,
  bouton, lien « Effacer la recherche » ; catégorie conservée en champ caché.
- Filtre SQL paramétré, sans accent ni casse (`translate` côté base,
  `motsDeRecherche` côté Node), chaque mot exigé dans le nom, la présentation
  courte, la catégorie ou une section visible ; `%` et `_` échappés.
- Compte, pagination et 404 hors borne suivent le terme. Page de recherche en
  `noindex, follow`, canonical inchangée.
- Preuves : service éprouvé sur base éphémère par un test **jetable, non
  commité** ; e2e catalogue public, pages d'erreur et gabarit de titre, 302
  passés ; rendu 320 à 1280 sans débordement.
- PR #711, production : `?recherche=boucle` rend 68 pièces sur 6 pages.

## 2. C-2026-0006 absente de Clients

Lecture seule en production : commande du 16 novembre, `LIVREE`, 1,00 € plus
4,10 € de port, **sans compte**, aucun compte à cette adresse. L'écran ne
lisait que `utilisateur` : comportement voulu, d'où LS-335.

## 3. LS-335, onglet « Sans compte »

Contrôle avant zone critique (données personnelles, autorisation) répondu
dans le ticket.

**Fait**

- `listerAcheteursSansCompte` (`repositories/commande.ts`) : regroupement par
  `email_normalise` des commandes sans `utilisateur_id` ni `dissocie_a`,
  adresses portant un compte exclues (`lower(trim(email))`), nom de la plus
  récente, nombre toutes commandes, montant hors annulées (règle de LS-317),
  recherche par `HAVING bool_or` sur tout le groupe, plafond de 100.
- Écran Clients : onglets « Avec compte » / « Sans compte », `?vue=` validé
  par `z.literal`, terme conservé d'un onglet à l'autre, champ caché dans le
  formulaire.
- Commandes : filtre `?acheteur=` en **égalité stricte**, validé par
  `schemaEmailClient`, mêmes exclusions que la carte ; rappel et retour.
- Registre T11 étendu (personnes, catégories, exclusions, limite connue).

**Preuves**

- Intégration, `acheteurs-sans-compte.sequential.test.ts`, 9 cas ;
  `npm run test` 131 fichiers, 2 119 tests.
- Mutations à la main, chacune rouge sur son cas : dissociées incluses,
  adresse à compte incluse, annulées sommées, nom de la plus ancienne, jokers
  non échappés, plafond sans `+1`, tri inversé, `bool_and` pour `bool_or`,
  filtre `contains` pour l'égalité, exclusions retirées du filtre. Garde de
  rôle retirée de la page : les 8 cas négatifs (anonyme et client connecté,
  quatre largeurs) rougissent, réponse brute sans redirection comprise.
- e2e de l'administration, 653 passés aux quatre largeurs ; captures à 320 et
  1280 relues.

**Revues**

- `ls-critical-reviewer` : un défaut. La suppression de compte ne dissocie
  que les commandes **rattachées** : un achat sans compte de même adresse,
  jamais rattaché, réapparaît dans « Sans compte » après suppression, et reste
  rattachable par quiconque recrée un compte sur l'adresse (trou préexistant,
  V15). L'étendre coupe aussi l'accès à la facture par jeton et à l'avis :
  portée du droit à l'effacement, **non tranchée ici**. Texte de l'écran,
  dépôt et T11 disent la limite ; **LS-336** ouvert avec les deux options.
- `ls-frontend-revue` : le lien « Voir sa commande » passait par la recherche
  libre, qui cherche par contenu (`ana@` ramenait `diana@`). Corrigé par le
  filtre strict. Deux points laissés à Christophe : l'onglet de rubrique
  s'appelle encore « Comptes clients », et les formulaires de Clients ne
  passent pas par `RechercheListe` (écart antérieur).

## Dérives

- La première version du lien réutilisait la recherche libre de Commandes,
  pratique et fausse : une recherche par contenu n'est pas un filtre
  d'identité. Vue par la revue, pas par les tests, qui posaient une seule
  adresse.

## État des tickets

- LS-335 : close à la fusion et au déploiement.
- LS-336 : ouvert, arbitrage de Christophe attendu.
- LS-334 : alerte Search Console en validation chez Google.

## Prochaine étape

Arbitrer LS-336. Relever le verdict de validation `deliveryTime` dans la
Search Console. Nocturne suivant : premier passage des mutations sur le code
refondu.
