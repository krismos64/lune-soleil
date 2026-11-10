# 10 novembre 2026 : reprendre ou annuler une commande en attente, LS-315

Suite du diagnostic du matin, `2026-11-10-a-ls315-diagnostic-panier-vide.md`.

## Fait

**ADR-050**, accepté : le client annule sa commande en attente, et l'annulation
rend le stock. Ordre décidé : sessions expirées chez Stripe hors transaction,
puis variantes, commande et réservations dans une transaction. Arbitrages de
Christophe : origine `CLIENT` ajoutée à l'enum, aucune alerte à l'exploitante.

**Code**, branche `feat/LS-315-reprise-annulation` :

- `services/annulation-commande.ts` : `annulerCommandeEnAttente` et
  `lireCommandeEnAttente`, repositories associés dans `stock.ts`,
  `commande.ts` et `paiement.ts` ;
- migration additive `20261110170000_origine_client` ;
- `demarrerPaiement` : le rattachement relit le statut sous verrou et expire la
  session neuve d'une commande annulée entre-temps ; un `DEJA_FERMEE` sur la
  session précédente se lève par une lecture, une session payée ne se rouvre
  pas ;
- action `annulerCommandeAction` sans argument, panier reconstruit par
  `fusionnerPanier`, `redirect("/panier?annulation=1")` ;
- bandeau « Une commande vous attend » sur `/panier` et sur la fiche d'une
  pièce que la commande tient, bouton d'annulation sur la confirmation,
  annonce de l'annulation confirmée par la base, heure « 16 h 18 ».

**Preuves** : 2032 tests unitaires et d'intégration, 241 de bout en bout aux
quatre largeurs (3 sauts conditionnels anciens de `fiche-produit.spec.ts`),
types et lint au vert. Onze mutations ajoutées à `verifier-tests-mutation.sh`,
toutes détectées par le vrai mécanisme du script ; trois mutations de bout en
bout détectées à la main.

**Revues** : `ls-critical-reviewer` deux fois, aucun défaut atteignable ;
`ls-frontend-revue` une fois, défauts corrigés.

**Documentation** : `payments.md`, `database.md` (transaction critique 14),
`frontend-design.md`, `PARCOURS.md` (parcours 1, étape 6), `REFERENCES.md`.

## Ce qui a dérapé, et pourquoi

- **Deux mutations ont d'abord raté.** Le verrou des variantes retiré, le
  croisement avec la libération restait vert : PostgreSQL tuait l'annulation,
  et son rejeu la faisait aboutir. Rendu observable par une seconde connexion
  qui imite la libération sous `lock_timeout`. La garde de lecture de l'étape 1
  était masquée par celle de la transaction : le test porte désormais une
  ancienne tentative restée en attente.
- **`ls-frontend-revue` a trouvé un vrai défaut de paiement**, hors de son
  domaine : le bandeau rendait atteignable, par un lien proposé, un chemin
  qui ouvrait une seconde session payable sur une session déjà payée. Corrigé
  dans `demarrerPaiement`.
- **`redirect` ou rechargement** : le rechargement complet déclenchait un
  avertissement ESLint. `redirect` a été mesuré avant d'être retenu, la page
  panier lit bien le nouveau cookie, prouvé par une mutation de bout en bout.
- **`npm run test:unitaire` seul échoue sur `main`** :
  `raison-refus-transporteur.test.ts` (LS-296) importe un service qui charge
  Prisma, qui exige `DATABASE_URL` à l'import. `npm run test` passe, le projet
  d'intégration la fournissant. Le script de mutation lance la référence
  unitaire seule et bute là en local. Non corrigé, hors de LS-315.
- **Une référence d'intégration rouge, une fois**, au premier lancement du
  script de mutation réduit, verte aux deux suivants. Une seule occurrence, rien
  de conclu.

## Ce qui reste ouvert

- **La fiche produit n'a pas de test de bout en bout du bandeau**, ni de son
  cas négatif : il faudrait un produit `ACTIF` dans la base partagée, qui
  perturberait les comptes du catalogue. La lecture qu'elle emploie a ses tests
  d'intégration.
- **L'annonce peut mentir dans un cas rare**, relevé par la seconde revue : un
  retour sur `/panier?annulation=1` après une annulation par la réconciliation
  dit « les pièces sont de retour » sans que le panier ait été rempli. Aucun
  effet sur l'argent ni les données.
- **LS-316** : le webhook sur commande annulée, filet non étanche relevé par la
  première revue.

## Mise en production

- PR #650, CI verte au quatrième passage, fusionnée en rebase :
  `aa7679f..18d7a7b`, 18 commits. Les trois rejets venaient de contrôles non
  lancés comme la CI les lance : `verifier-config-claude.sh` sans `--strict`
  (compte de mutations de `INTEGRATION-CONTINUE.md` périmé), une mutation
  ancienne du verrou de rattachement que la relecture du statut rendait sans
  effet (9s octies), et quatre fichiers modifiés par script hors de Prettier.
  Fiche mémoire « Lancer tous les contrôles de la CI » complétée.
- **Migration** par `migrate-production.sh`, sur autorisation ponctuelle de
  Christophe (la procédure lit `DATABASE_URL` du fichier d'environnement) :
  28 puis 29 migrations, enum relu en base
  `SYSTEME,ADMIN,RECONCILIATION,CLIENT`, sauvegarde vérifiée conservée sur le
  poste, relais et tunnel fermés.
- **Déploiement** run 42895868158 : `ghcr.io/krismos64/lune-soleil:18d7a7b…`,
  aucune erreur au journal, `/`, `/panier`, `/catalogue`,
  `/commande/confirmation` et `/api/sante` en 200.

## Prochaine étape

1. Le rendu du bandeau sur la fiche produit, seul critère de LS-315 non mesuré.
2. LS-316, puis LS-291.

## État des tickets

- **LS-315** : En cours, en production ; reste le rendu mesuré du bandeau sur
  la fiche produit.
- **LS-316** : créé, À faire.
- **#647** : nocturne, toujours à confirmer après la nuit.
