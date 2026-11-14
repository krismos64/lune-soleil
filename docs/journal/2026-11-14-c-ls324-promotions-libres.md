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
  formulaire déplié sans débordement, refus rendus par le serveur.

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

- Revues `ls-critical-reviewer` et `ls-frontend-revue`, puis fusion.
- Production : migration classée destructive (retrait puis pose de
  `chk_promotion_code_connu`), sur accord de Christophe.
- Point ouvert de LS-323 : « Soldes » affiché sans promotion active.

## État des tickets

- LS-323 : Terminé, déployé.
- LS-324 : En cours.
