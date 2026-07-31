-- Contraintes que Prisma ne genere pas, LS-67.
--
-- POURQUOI CETTE MIGRATION EXISTE. Prisma 7 ne genere ni les contraintes CHECK,
-- ADR-006, ni une contrainte UNIQUE DEFERRABLE, ADR-026. Jusqu'a LS-67 elles ne
-- vivaient que dans prisma/sql-manuel/, applique a la main en developpement :
-- `prisma migrate deploy` produisait donc en production un schema SANS elles.
-- Mesure sur une base issue de la seule migration initiale, avant cette
-- migration : 0 contrainte CHECK et 0 unicite differable.
--
-- Ces contraintes sont la derniere ligne de defense. Elles tiennent meme si le
-- code applicatif se trompe, la ou une verification applicative arrive toujours
-- trop tard sous concurrence.
--
-- LES PREDICATS SONT RECOPIES A L'IDENTIQUE depuis prisma/sql-manuel/. La forme
-- de chaque CHECK porte une decision : une implication `a <> x OR b` n'interdit
-- pas ce qu'une equivalence `(a = x) = (b)` interdit. Confondre les deux a deja
-- casse la correction d'une vente externe, LS-63. Ne pas « harmoniser » ces
-- formes, chacune est celle que sa regle exige.
--
-- AUCUN `IF NOT EXISTS` ici, volontairement. L'unicite d'application est
-- garantie par la table d'historique de Prisma, `_prisma_migrations`. Un
-- `IF NOT EXISTS` masquerait un echec reel au lieu de le signaler.
--
-- Apres cette migration, les fichiers de prisma/sql-manuel/ restent une source
-- de CONCEPTION ET DE CONTROLE, lue par verifier-schema.sh. Ils ne constituent
-- plus un mecanisme de deploiement.

-- ---------------------------------------------------------------------------
-- Stock, les trois contraintes prouvees par le prototype d'ADR-006
-- ---------------------------------------------------------------------------

-- C5, la quantite physique ne devient jamais negative.
ALTER TABLE "variante"
  ADD CONSTRAINT "chk_variante_physique_positif"
  CHECK (quantite_physique >= 0);

-- C5, la quantite reservee non plus.
ALTER TABLE "variante"
  ADD CONSTRAINT "chk_variante_reservee_positif"
  CHECK (quantite_reservee >= 0);

-- C6, le coeur de la strategie de reservation. Le prototype a demontre que
-- cette contrainte n'est pas theorique : avec la methode naive, c'est elle qui
-- empeche la survente sur une piece unique.
ALTER TABLE "variante"
  ADD CONSTRAINT "chk_variante_pas_de_survente"
  CHECK (quantite_physique - quantite_reservee >= 0);

-- Une reservation de zero article n'a pas de sens et masquerait une erreur.
ALTER TABLE "reservation"
  ADD CONSTRAINT "chk_reservation_quantite_positive"
  CHECK (quantite > 0);

-- ---------------------------------------------------------------------------
-- Montants, invariant 1
-- ---------------------------------------------------------------------------

ALTER TABLE "variante"
  ADD CONSTRAINT "chk_variante_prix_positif"
  CHECK (prix_centimes >= 0);

ALTER TABLE "ligne_commande"
  ADD CONSTRAINT "chk_ligne_quantite_positive"
  CHECK (quantite > 0);

ALTER TABLE "ligne_commande"
  ADD CONSTRAINT "chk_ligne_prix_positif"
  CHECK (prix_fige_centimes >= 0);

ALTER TABLE "commande"
  ADD CONSTRAINT "chk_commande_montants_positifs"
  CHECK (
    sous_total_centimes >= 0
    AND frais_port_centimes >= 0
    AND total_centimes >= 0
    AND montant_taxe_centimes >= 0
  );

ALTER TABLE "paiement"
  ADD CONSTRAINT "chk_paiement_montant_positif"
  CHECK (montant_centimes >= 0);

-- Un remboursement ne depasse jamais ce qui a ete encaisse.
ALTER TABLE "paiement"
  ADD CONSTRAINT "chk_paiement_rembourse_borne"
  CHECK (montant_rembourse_centimes >= 0
     AND montant_rembourse_centimes <= montant_centimes);

-- ---------------------------------------------------------------------------
-- Montant d'une vente externe, LS-63
-- ---------------------------------------------------------------------------

-- Une vente externe porte toujours le prix reellement pratique. Sans cette
-- contrainte le montant est facultatif, donc oublie, et le chiffre d'affaires
-- des marches serait definitivement perdu pour les ventes deja saisies.
--
-- ATTENTION a la forme, une IMPLICATION et non une equivalence. Ecrire
-- `(type = 'VENTE_EXTERNE') = (prix IS NOT NULL)` interdirait de porter un
-- montant sur tout autre type, donc sur le mouvement compensateur qui corrige
-- une vente externe saisie a tort. Un mouvement de stock etant immuable, regle
-- S4, une erreur se corrige par un mouvement inverse portant le meme prix :
-- l'equivalence rendrait la correction impossible a ecrire.
ALTER TABLE "mouvement_stock"
  ADD CONSTRAINT "chk_mouvement_vente_externe_prix"
  CHECK (type <> 'VENTE_EXTERNE' OR prix_unitaire_fige_centimes IS NOT NULL);

-- Un prix negatif fausserait toute somme sans qu'aucun controle ne le voie. Le
-- signe de l'operation est porte par `quantite`, jamais par le prix : une vente
-- est une quantite negative a prix positif. Zero reste autorise, une piece
-- offerte sur un stand est un cas reel et son mouvement de stock existe.
ALTER TABLE "mouvement_stock"
  ADD CONSTRAINT "chk_mouvement_prix_positif"
  CHECK (prix_unitaire_fige_centimes IS NULL OR prix_unitaire_fige_centimes >= 0);

-- ---------------------------------------------------------------------------
-- Comptabilite, invariant 4
-- ---------------------------------------------------------------------------

ALTER TABLE "facture"
  ADD CONSTRAINT "chk_facture_montant_positif"
  CHECK (montant_total_centimes >= 0);

-- Le total denormalise des avoirs ne depasse jamais le montant de la facture.
--
-- Portee exacte : cette contrainte borne la colonne `montant_avoir_centimes`,
-- elle ne compare rien a la table `avoir`, un CHECK ne pouvant pas agreger une
-- autre table. Ce qui garantit que la colonne reflete la somme reelle est la
-- transaction qui cree l'avoir et met la facture a jour ensemble, regle F9.
ALTER TABLE "facture"
  ADD CONSTRAINT "chk_facture_avoir_borne"
  CHECK (montant_avoir_centimes >= 0
     AND montant_avoir_centimes <= montant_total_centimes);

ALTER TABLE "avoir"
  ADD CONSTRAINT "chk_avoir_montant_positif"
  CHECK (montant_centimes >= 0);

ALTER TABLE "demande_retractation"
  ADD CONSTRAINT "chk_retractation_montant_positif"
  CHECK (montant_rembourse_centimes IS NULL OR montant_rembourse_centimes >= 0);

-- ---------------------------------------------------------------------------
-- Avis, obligation d'affichage
-- ---------------------------------------------------------------------------

-- La note est bornee. Une note hors bareme rendrait toute moyenne fausse.
ALTER TABLE "avis"
  ADD CONSTRAINT "chk_avis_note_bornee"
  CHECK (note BETWEEN 1 AND 5);

-- ---------------------------------------------------------------------------
-- Exploitation
-- ---------------------------------------------------------------------------

-- Le compteur d'envois compte des tentatives, il ne decroit jamais.
ALTER TABLE "invitation_avis"
  ADD CONSTRAINT "chk_invitation_envois_positif"
  CHECK (nombre_envois >= 0);

-- ---------------------------------------------------------------------------
-- Evenement du prestataire de paiement, LS-45
-- ---------------------------------------------------------------------------

-- `statut_traitement` et `traite_a` decrivent le meme fait. Sans cette
-- contrainte, deux colonnes libres finissent par diverger, et la divergence
-- tombe sur le chemin d'idempotence.
--
-- Le cas dangereux est `TRAITE` avec `traite_a` nul : une reprise qui
-- selectionne `WHERE traite_a IS NULL` rejoue un evenement deja traite, donc
-- recree un mouvement de stock ou une facture sur un rejeu du prestataire. Le
-- cas inverse, `RECU` avec un horodatage, fait ignorer un evenement en attente.
--
-- EQUIVALENCE : les trois etats terminaux exigent l'horodatage, RECU l'interdit.
ALTER TABLE "evenement_fournisseur"
  ADD CONSTRAINT "chk_evenement_traitement_coherent"
  CHECK ((statut_traitement IN ('TRAITE', 'IGNORE', 'ECHOUE')) = (traite_a IS NOT NULL));

-- ---------------------------------------------------------------------------
-- Mode de livraison, ADR-025
-- ---------------------------------------------------------------------------

-- Le point de retrait et le mode decrivent un meme choix commercial, et deux
-- colonnes libres finissent par diverger. Le cas dangereux est une commande
-- `DOMICILE` portant un point de retrait : l'etiquette serait creee pour un
-- relais alors que le client a paye pour etre livre chez lui, et l'incoherence
-- n'apparaitrait qu'au moment de l'expedition. Le cas inverse, `POINT_RELAIS`
-- sans identifiant, produit une expedition impossible a creer.
--
-- EQUIVALENCE : les deux modes de retrait exigent l'identifiant, le domicile
-- l'interdit.
ALTER TABLE "commande"
  ADD CONSTRAINT "chk_commande_mode_point_relais"
  CHECK ((mode_livraison IN ('POINT_RELAIS', 'LOCKER')) = (point_relais_id IS NOT NULL));

-- Meme regle sur l'expedition, qui porte le mode reellement execute. Il peut
-- differer de celui de la commande apres un echec de livraison rebascule vers
-- un relais, mais il reste soumis a la meme coherence interne.
ALTER TABLE "expedition"
  ADD CONSTRAINT "chk_expedition_mode_point_relais"
  CHECK ((mode IN ('POINT_RELAIS', 'LOCKER')) = (point_relais_id IS NOT NULL));

-- ---------------------------------------------------------------------------
-- Confirmation du paiement, LS-76
-- ---------------------------------------------------------------------------

-- `confirme_a` date la confirmation effective de l'encaissement et sert de date
-- de rattachement des ventes en ligne dans les statistiques. Sa presence doit
-- correspondre exactement a l'etat du paiement, sans quoi une vente encaissee
-- serait absente d'un agregat, ou une tentative echouee y entrerait.
--
-- LES TROIS ETATS D'ENCAISSEMENT, jamais le seul REUSSI. C'est la lecon de
-- LS-45, deja apprise sur l'index partiel `paiement_reussi_unique` : un
-- remboursement ne rend pas la commande impayee. Un paiement passant a
-- PARTIELLEMENT_REMBOURSE ou REMBOURSE reste une vente encaissee, il conserve
-- donc sa date de confirmation. Filtrer sur REUSSI seul rendrait la contrainte
-- fausse des le premier remboursement.
--
-- Si un etat d'encaissement est ajoute a l'enum StatutPaiement, il doit entrer
-- dans ce predicat, comme dans celui de l'index partiel.
--
-- EQUIVALENCE et non implication, contrairement a
-- `chk_mouvement_vente_externe_prix`. Ici les deux sens sont voulus : un etat
-- d'encaissement exige la date, et un etat non encaisse l'interdit. Une
-- tentative EN_ATTENTE ou ECHOUE portant une date de confirmation serait une
-- vente fantome dans les statistiques.
ALTER TABLE "paiement"
  ADD CONSTRAINT "chk_paiement_confirmation_coherente"
  CHECK ((statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')) = (confirme_a IS NOT NULL));

-- ---------------------------------------------------------------------------
-- Sections de fiche produit, ADR-026, LS-76
-- ---------------------------------------------------------------------------

-- C22, l'ordre est un rang d'affichage, il commence a 1. Un rang nul ou negatif
-- n'a pas de sens et trahirait un calcul de reordonnancement fautif, du type
-- decrement sous zero.
ALTER TABLE "section_produit"
  ADD CONSTRAINT "chk_section_ordre_positif"
  CHECK (ordre >= 1);

-- C20, la cle technique n'est jamais vide. Une chaine vide passerait l'unicite
-- une premiere fois puis bloquerait toute autre section sans cle, avec un
-- message incomprehensible pour l'administratrice.
ALTER TABLE "section_produit"
  ADD CONSTRAINT "chk_section_cle_non_vide"
  CHECK (length(trim(cle)) > 0);

-- C23, un titre vide produirait une section sans intitule sur la fiche
-- publique. Le contenu, lui, PEUT etre vide : c'est l'etat normal d'une section
-- proposee mais pas encore remplie, et la regle d'affichage veut qu'une section
-- sans contenu ne s'affiche pas du tout, titre compris.
ALTER TABLE "section_produit"
  ADD CONSTRAINT "chk_section_titre_non_vide"
  CHECK (length(trim(titre)) > 0);

-- ---------------------------------------------------------------------------
-- C22, ordre d'affichage unique par produit, DIFFERABLE, ADR-026
-- ---------------------------------------------------------------------------

-- POURQUOI DIFFERABLE, et pourquoi une transaction seule ne suffit pas.
--
-- Une contrainte UNIQUE ordinaire est verifiee A CHAQUE INSTRUCTION, pas au
-- COMMIT. L'echange de deux positions viole donc la contrainte sur la premiere
-- des deux mises a jour, avant que la seconde ne retablisse la coherence. La
-- transaction garantit l'atomicite, elle ne repousse pas la verification.
-- Mesure sur PostgreSQL 18.4 le 30 juillet 2026, ADR-026.
--
-- Le differe deplace le moment de la verification, il ne la supprime pas : un
-- doublon reste refuse au COMMIT, en UPDATE comme en INSERT.
--
-- DEUX CONSEQUENCES A CONNAITRE AVANT D'ECRIRE DU CODE :
--
-- 1. Aucun `@@unique([produitId, ordre])` dans schema.prisma. Il creerait une
--    seconde contrainte NON differable sur les memes colonnes, qui rejetterait
--    l'echange et annulerait tout le benefice.
--
-- 2. Une contrainte differable NE PEUT PAS arbitrer un ON CONFLICT, PostgreSQL
--    le refusant explicitement. Le reordonnancement s'ecrit donc en UPDATE dans
--    une transaction, jamais en upsert.
ALTER TABLE "section_produit"
  ADD CONSTRAINT "section_produit_ordre_unique"
  UNIQUE (produit_id, ordre) DEFERRABLE INITIALLY DEFERRED;
