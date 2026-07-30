-- Contraintes CHECK du modèle, LS-13.
--
-- Prisma ne génère pas les contraintes CHECK, rappel d'ADR-006. Ce fichier
-- s'applique après la migration générée, et son contenu doit être recopié dans
-- la migration Prisma correspondante en phase 1 pour que `prisma migrate deploy`
-- l'embarque.
--
-- Ces contraintes sont la dernière ligne de défense : elles tiennent même si le
-- code applicatif se trompe, là où une vérification applicative arrive toujours
-- trop tard sous concurrence.
--
-- Contrairement aux index partiels, que Prisma 7.9.1 génère depuis la
-- fonctionnalité partialIndexes, ces CHECK n'ont aucun équivalent déclaratif.

-- ---------------------------------------------------------------------------
-- Stock, les trois contraintes prouvées par le prototype d'ADR-006
-- ---------------------------------------------------------------------------

-- C5, la quantité physique ne devient jamais négative.
ALTER TABLE variante
  ADD CONSTRAINT chk_variante_physique_positif
  CHECK (quantite_physique >= 0);

-- C5, la quantité réservée non plus.
ALTER TABLE variante
  ADD CONSTRAINT chk_variante_reservee_positif
  CHECK (quantite_reservee >= 0);

-- C6, le coeur de la stratégie de réservation. Le prototype a démontré que
-- cette contrainte n'est pas théorique : avec la méthode naive, c'est elle qui
-- empêche la survente sur une pièce unique.
ALTER TABLE variante
  ADD CONSTRAINT chk_variante_pas_de_survente
  CHECK (quantite_physique - quantite_reservee >= 0);

-- Une réservation de zéro article n'a pas de sens et masquerait une erreur.
ALTER TABLE reservation
  ADD CONSTRAINT chk_reservation_quantite_positive
  CHECK (quantite > 0);

-- ---------------------------------------------------------------------------
-- Montants, invariant 1
-- ---------------------------------------------------------------------------

ALTER TABLE variante
  ADD CONSTRAINT chk_variante_prix_positif
  CHECK (prix_centimes >= 0);

ALTER TABLE ligne_commande
  ADD CONSTRAINT chk_ligne_quantite_positive
  CHECK (quantite > 0);

ALTER TABLE ligne_commande
  ADD CONSTRAINT chk_ligne_prix_positif
  CHECK (prix_fige_centimes >= 0);

ALTER TABLE commande
  ADD CONSTRAINT chk_commande_montants_positifs
  CHECK (
    sous_total_centimes >= 0
    AND frais_port_centimes >= 0
    AND total_centimes >= 0
    AND montant_taxe_centimes >= 0
  );

ALTER TABLE paiement
  ADD CONSTRAINT chk_paiement_montant_positif
  CHECK (montant_centimes >= 0);

-- Un remboursement ne dépasse jamais ce qui a été encaissé.
ALTER TABLE paiement
  ADD CONSTRAINT chk_paiement_rembourse_borne
  CHECK (montant_rembourse_centimes >= 0
     AND montant_rembourse_centimes <= montant_centimes);

-- ---------------------------------------------------------------------------
-- Montant d'une vente externe, LS-63
-- ---------------------------------------------------------------------------

-- Une vente externe porte toujours le prix réellement pratiqué.
--
-- Sans cette contrainte, le montant est facultatif, donc oublié : le formulaire
-- de vente de marché s'écrirait sans lui et le chiffre d'affaires des marchés
-- serait définitivement perdu pour les ventes déjà saisies. Un montant absent
-- ne se reconstitue pas après coup, le prix du catalogue ayant pu changer et une
-- remise de marché n'y figurant de toute façon jamais.
--
-- ATTENTION à la forme, une implication et non une équivalence. Écrire
-- `(type = 'VENTE_EXTERNE') = (prix IS NOT NULL)` interdirait de porter un
-- montant sur tout autre type, donc sur le mouvement compensateur qui corrige
-- une vente externe saisie à tort, décision LS-63 : un mouvement de stock étant
-- immuable, règle S4, une erreur se corrige par un mouvement inverse qui porte
-- le même prix. L'équivalence rendrait la correction impossible à écrire.
--
-- Les deux CHECK d'ADR-025 sur le mode de livraison sont, eux, de vraies
-- équivalences : un point de retrait sur une commande DOMICILE est une erreur,
-- alors qu'un prix sur un RETOUR est une information légitime.
ALTER TABLE mouvement_stock
  ADD CONSTRAINT chk_mouvement_vente_externe_prix
  CHECK (type <> 'VENTE_EXTERNE' OR prix_unitaire_fige_centimes IS NOT NULL);

-- Un prix négatif fausserait toute somme sans qu'aucun contrôle ne le voie.
-- Le signe de l'opération est porté par `quantite`, jamais par le prix : une
-- vente est une quantité négative à prix positif. Zéro reste autorisé, une pièce
-- offerte sur un stand est un cas réel et son mouvement de stock existe.
ALTER TABLE mouvement_stock
  ADD CONSTRAINT chk_mouvement_prix_positif
  CHECK (prix_unitaire_fige_centimes IS NULL OR prix_unitaire_fige_centimes >= 0);

-- ---------------------------------------------------------------------------
-- Comptabilité, invariant 4
-- ---------------------------------------------------------------------------

ALTER TABLE facture
  ADD CONSTRAINT chk_facture_montant_positif
  CHECK (montant_total_centimes >= 0);

-- Le total dénormalisé des avoirs ne dépasse jamais le montant de la facture.
--
-- Attention à la portée exacte, précisée après la revue de LS-13 : cette
-- contrainte borne la colonne `montant_avoir_centimes`, elle ne compare rien à
-- la table `avoir`. Un CHECK ne peut pas agréger une autre table.
--
-- Ce qui garantit que la colonne reflète la somme réelle est la transaction qui
-- crée l'avoir et met la facture à jour ensemble, règle F9, niveau 2 du
-- récapitulatif. Un avoir écrit sans mise à jour de la facture passerait cette
-- contrainte : c'est le code de la transaction qui doit être testé, pas la base.
ALTER TABLE facture
  ADD CONSTRAINT chk_facture_avoir_borne
  CHECK (montant_avoir_centimes >= 0
     AND montant_avoir_centimes <= montant_total_centimes);

ALTER TABLE avoir
  ADD CONSTRAINT chk_avoir_montant_positif
  CHECK (montant_centimes >= 0);

ALTER TABLE demande_retractation
  ADD CONSTRAINT chk_retractation_montant_positif
  CHECK (montant_rembourse_centimes IS NULL OR montant_rembourse_centimes >= 0);

-- ---------------------------------------------------------------------------
-- Avis, obligation d'affichage
-- ---------------------------------------------------------------------------

-- La note est bornée. Une note hors barème rendrait toute moyenne fausse.
ALTER TABLE avis
  ADD CONSTRAINT chk_avis_note_bornee
  CHECK (note BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- Exploitation
-- ---------------------------------------------------------------------------

-- Le compteur d'envois compte des tentatives, il ne décroît jamais.
ALTER TABLE invitation_avis
  ADD CONSTRAINT chk_invitation_envois_positif
  CHECK (nombre_envois >= 0);

-- ---------------------------------------------------------------------------
-- Événement du prestataire de paiement, LS-45
-- ---------------------------------------------------------------------------

-- `statut_traitement` et `traite_a` décrivent le même fait. Sans cette
-- contrainte, deux colonnes libres finissent par diverger, et la divergence
-- tombe sur le chemin d'idempotence.
--
-- Le cas dangereux est `TRAITE` avec `traite_a` nul : une reprise qui
-- sélectionne `WHERE traite_a IS NULL` rejoue un événement déjà traité, donc
-- recrée un mouvement de stock ou une facture sur un rejeu du prestataire. Le
-- cas inverse, `RECU` avec un horodatage, fait ignorer un événement en attente.
--
-- L'équivalence est écrite comme telle : les trois états terminaux exigent
-- l'horodatage, RECU l'interdit.
ALTER TABLE evenement_fournisseur
  ADD CONSTRAINT chk_evenement_traitement_coherent
  CHECK ((statut_traitement IN ('TRAITE', 'IGNORE', 'ECHOUE')) = (traite_a IS NOT NULL));

-- ---------------------------------------------------------------------------
-- Mode de livraison, ADR-025
-- ---------------------------------------------------------------------------

-- Le point de retrait et le mode décrivent un même choix commercial, et deux
-- colonnes libres finissent par diverger. Le cas dangereux est une commande
-- `DOMICILE` portant un point de retrait : l'étiquette serait créée pour un
-- relais alors que le client a payé 4,99 € pour être livré chez lui, et
-- l'incohérence n'apparaîtrait qu'au moment de l'expédition.
--
-- Le cas inverse, `POINT_RELAIS` sans identifiant, produit une expédition
-- impossible à créer : le transporteur exige la destination.
--
-- L'équivalence est écrite comme telle, les deux modes de retrait exigent
-- l'identifiant, le domicile l'interdit.
ALTER TABLE commande
  ADD CONSTRAINT chk_commande_mode_point_relais
  CHECK ((mode_livraison IN ('POINT_RELAIS', 'LOCKER')) = (point_relais_id IS NOT NULL));

-- Même règle sur l'expédition, qui porte le mode réellement exécuté. Il peut
-- différer de celui de la commande après un échec de livraison rebasculé vers
-- un relais, mais il reste soumis à la même cohérence interne.
ALTER TABLE expedition
  ADD CONSTRAINT chk_expedition_mode_point_relais
  CHECK ((mode IN ('POINT_RELAIS', 'LOCKER')) = (point_relais_id IS NOT NULL));
