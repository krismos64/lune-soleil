# 13 novembre 2026 : promotion de la Black Week codée, LS-319

## Demande

Christophe valide les trois propositions de l'ADR-051 (« ok ») : une pièce
créée ou dont le prix a changé dans les trente jours est exclue ; réactivation
permise dans les 24 heures, puis trente jours de carence ; la réduction figure
sur la facture. ADR passé en Accepté, puis code, tests d'abord.

## Fait

- **Migration additive** `20261113090000_promotion` : tables `promotion` (une
  ligne par activation, l'historique) et `historique_prix_variante`, colonnes
  `prix_reference_fige_centimes` et `promotion_id` sur `ligne_commande`, six
  CHECK et l'index unique d'une seule promotion active. SQL manuels,
  `verifier-schema.sh` (13 cas neufs), registre des traitements.
- **Calcul et éligibilité uniques** : `prixDeVente` au centime inférieur,
  `CONDITION_ELIGIBLE` partagée par l'affichage et la commande.
- **`passerCommande`** lit la promotion une fois dans sa transaction et fige
  prix réduit, référence et promotion ; Stripe, facture, avoir et
  remboursement lisent le prix figé.
- **Gel des prix et historique** sur les deux chemins d'écriture des prix,
  sous un verrou consultatif commun avec l'activation.
- **Affichage** : composant unique `PrixPromotion` (carte, fiche, panier,
  tunnel), mention L112-1-1 sur la fiche, `AnnoncePromotion` sur l'accueil et
  le catalogue, « toute la boutique » seulement si aucune pièce n'est exclue.
- **Administration** : activation et désactivation dans Paramètres, rôle et
  réauthentification exigés (`@sensible PARAMETRES_BOUTIQUE`).
- **Facture** en instantané version 3, la réduction sur chaque ligne, rendue
  dans le PDF.
- Documentation : `payments.md`, `database.md`, `frontend-design.md`,
  `MODELE-LOGIQUE.md`, `VALIDATION.md`, ADR-051 et `REFERENCES.md`.

## Ce qui a dérapé

- **Un premier test de concurrence ne prouvait rien** : il désactivait la
  promotion après que les lignes étaient figées. Remplacé par la bascule entre
  la commande et le paiement, où Stripe doit recevoir le prix figé.
- **Une mutation manuelle a effacé du travail non commité** (`git checkout` sur
  `panier.ts`), réappliqué ensuite. Fiche mémoire enrichie.
- **Une mutation a d'abord cassé la syntaxe** au lieu de retirer l'appel, et
  le rapport disait « détecté » avec zéro test en échec ; rejouée proprement.
- **`verifier-propagation-docs.sh` coupait les noms au premier chiffre**,
  `schemaLigneInstantaneV3` devenant `schemaLigneInstantaneV`. Motif corrigé
  et prouvé ; même défaut que `noel_1` en LS-277, fiche mémoire enrichie.
- **`ls-critical-reviewer`** : aucun chemin où l'encaissé diverge, trois défauts
  corrigés et prouvés par mutation (déclinaison suspendue qui faisait barrer la
  carte, activation concurrente d'un changement de prix, onglet périmé sans
  trace dans l'historique).
- **`ls-frontend-revue`** : contrastes et débordement bons partout, dix points
  corrigés (« l'unité » perdue au panier, tunnel hors composant commun et
  total calculé dans le navigateur, écran d'administration sans lien de
  reconnexion, bouton non décrit, chute de toute la page sur une lecture en
  échec, signe moins U+2212 lu « moins », annonce collée au héros, prix barré à
  11,9 px). Le PDF garde le trait d'union.
- **Pas de test de bout en bout de l'affichage sous promotion** : la promotion
  est un état global de la base partagée par les quatre largeurs. Couvert par
  six tests de composant prouvés par mutation, le montant par l'intégration,
  et un rendu vérifié en local à 320 px.

## Preuves

- Vitest complet : 2071 tests, 128 fichiers. `promotion.sequential` : 23 cas,
  dont seize mutations détectées par le test visé.
- Bout en bout complet : 2854 passés ; puis neuf fichiers touchés rejoués sur
  le code final, 439 passés.
- Mise en forme, lint, types, `verifier-regles`, contrastes, rédaction,
  registre, actions sensibles, propagation : tous au vert.

## Prochaine étape

Mise en production sur accord de Christophe : migration additive par
`migrate-production.sh` (lecture de `DATABASE_URL` à autoriser), puis
déploiement. Aucune promotion activée par le déploiement. L'exploitante active
le thème et la promotion le lundi 23 novembre 2026.

## État des tickets

- **LS-319** : En cours, code fusionné après cette PR, production à faire.
