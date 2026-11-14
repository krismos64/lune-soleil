# 14 novembre 2026 : LS-324, promotions libres

## Demande

À la suite de LS-323, Christophe arbitre : « je veux que l'exploitante puisse
avoir le choix sur les pourcentages à mettre quand elle veut et sur les
articles qu'elle veut ou tout le site ». Quatre réponses rendues le même jour :

1. taux saisi librement, borné (5 à 70 %) ;
2. un taux par article, plusieurs taux dans la même promotion ;
3. toute la boutique, ou des articles cochés un par un ;
4. nom de l'opération choisi dans une liste fermée.

Cela renverse le taux fixe de 30 % et la portée « tout le catalogue »
d'ADR-051. Zone critique : prix figé, facture.

## Les quinze questions, en bref

Périmètre : entré par arbitrage explicite, LS-324. Modèle : une table de plus,
`promotion_produit`, et le taux figé sur la ligne. Transaction : la promotion
et ses articles s'écrivent ensemble, sous le verrou consultatif existant.
Contraintes de base : portée et taux général liés, taux d'article borné, taux
figé seulement sous promotion. Autorisation : rôle puis réauthentification,
inchangés ; un identifiant d'article n'autorise rien, la clé étrangère refuse
l'inconnu. Idempotence : `promotion_active_unique`, inchangée. Historisation :
`taux_reduction_fige` sur la ligne, aucune ligne existante réécrite.
Fournisseur indisponible : sans objet, aucun appel externe. 320 px : écran
Paramètres mesuré. ADR : ADR-051 amendé avant le code.

## Fait

- **ADR-051 amendé** avant le code, sept points et trois risques nommés.
- **Migration** `20261114200000_promotions_libres` : `promotion.portee`,
  `taux_pourcentage` facultatif, table `promotion_produit`,
  `ligne_commande.taux_reduction_fige`, quatre contraintes, liste des noms
  élargie. Aucune donnée existante modifiée.
- **Socle** `src/lib/promotion.ts` : neuf noms en liste fermée, bornes,
  `schemaDemandePromotion`.
- **Dépôt et service** : une seule expression SQL pour le taux d'une
  déclinaison, `coalesce(promotion_produit.taux, promotion.taux)`, employée
  par l'affichage et par la commande ; `PromotionEnVigueur` porte un taux par
  déclinaison ; une promotion qui ne réduit aucune pièce n'annonce rien.
- **Commande et facture** : le taux de la ligne est figé avec son prix, la
  facture l'écrit ; une ligne d'avant LS-324 se lit sur sa promotion.
- **Affichage** : badge au taux de la pièce, « jusqu'à −X % » sous plusieurs
  taux, sur l'annonce et les deux bandeaux d'accueil.
- **Paramètres** : nom, portée, taux général, articles par catégorie avec un
  taux chacun, raccourci « Tout cocher », récapitulatif avant d'activer.
- Registre des traitements, modèle logique, `database.md`,
  `frontend-design.md`, `REFERENCES.md`, `verifier-schema.sh`.

## Preuves

- `promotion.sequential.test.ts` : 34 cas, dont 9 neufs (articles choisis à
  deux taux figés et encaissés, taux général avec exception, taux unique,
  article exclu, onze demandes refusées sans rien écrire, article inconnu,
  contraintes de base, facture à deux taux, ligne d'avant LS-324).
- **Six mutations, six détectées** : taux figé nul, `coalesce` inversé,
  facture lisant le taux de la promotion, facture ignorant la promotion d'une
  ligne ancienne, borne haute relâchée, promotion sans pièce réduite annoncée.
- `npm run test` : 2099 passés. `db:verifier` : 172 réussites.
  `verifier-registre-traitements.sh` : 43 tables rangées.
- Bout en bout, `parametres-administration` : 69 passés aux quatre largeurs,
  formulaire déplié sans débordement, refus rendus par le serveur ; avec les
  suites des thèmes, 189 passés après les corrections de revue.

## Revues

**`ls-critical-reviewer` : aucun défaut bloquant ni à corriger.** Les deux
requêtes, affichage et commande, rejouées en base sur sept pièces et sous les
deux portées, donnent le même taux pour toute pièce que le catalogue montre.
Une commande ne peut pas voir une promotion sans ses articles, les deux étant
écrits dans une transaction et lus par une instruction. Deux suites données :

- la requête de commande attribuait un taux à une pièce archivée ou d'un
  produit non actif, que la réservation refusait ensuite : elle porte
  désormais les mêmes filtres que l'affichage ;
- `EXPLOITATION.md` : désactiver la promotion avant tout retour à une image
  d'avant LS-324, qui ignore les taux par article.

**`ls-frontend-revue` : un défaut bloquant, corrigé.** React 19 remet un
formulaire à ses valeurs de départ à la fin de chaque action portée par
`action={…}`, refus compris. Après un refus, le nom revenait à « Promotion » et
les cases se décochaient dans la page pendant que l'état les montrait cochées :
un second clic pouvait activer autre chose que ce qui était affiché. L'envoi
passe désormais par `onSubmit` dans une transition, tous les champs sont
contrôlés, et le test de bout en bout vérifie le nom, la portée et la case
après chaque refus. **Mutation** : `onSubmit` retiré, le test rougit sur
`Expected "SOLDES_ETE", Received "PROMOTION"`, puis restauré. La période
annoncée portait le même défaut depuis LS-319, corrigé de même.

Corrigé aussi : focus rendu au formulaire après une bascule, liste d'articles
illisible distinguée de « aucun article », champs fautifs marqués
`aria-invalid`, rappel des périodes légales sous le nom « Soldes », écran
relu après « déjà active », résumé exact quand rien n'est réduit, Entrée dans
un champ de taux n'active plus, « jusqu'à » insécable, catégories dans l'ordre
de la boutique.

Laissé, signalé : le message de refus ne nomme pas l'article fautif (le champ
est marqué) ; sous le thème Black Week, l'accueil titre du nom du thème quand
le catalogue et la facture portent le nom de la promotion, ADR-051 point 4 ;
« jusqu'à −X % » quand le taux le plus haut ne vise qu'une pièce, pratique à
vérifier aux sources.

## Ce qui a dérapé

- **Les tests ont été écrits avec le service, et non avant lui** : l'ordre
  exigé en zone critique n'a pas été tenu à la lettre. Les six mutations
  montrent que chaque garantie neuve fait rougir son test.
- Le test de bout en bout a montré que le navigateur bloquait lui-même l'envoi
  d'un taux à 80, sans aucun message dans la page : le formulaire passe en
  `noValidate`, le refus vient du serveur.
- `verifier-registre-traitements.sh` a rougi sur `PromotionProduit`, non
  rangée : rangée parmi les tables sans donnée personnelle.

## Reste

- Fusion, puis production : accord de Christophe donné le 14 novembre 2026
  (« ok mets en prod »). Migration classée destructive (retrait puis pose de
  `chk_promotion_code_connu`).
- Point ouvert de LS-323 : « Soldes » affiché sans promotion active.

## État des tickets

- LS-323 : Terminé, déployé.
- LS-324 : En cours.
