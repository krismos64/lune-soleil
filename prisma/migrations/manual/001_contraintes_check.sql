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
