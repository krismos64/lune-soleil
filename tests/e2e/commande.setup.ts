/**
 * Amorce la commande EN_ATTENTE_PAIEMENT de la page de confirmation, LS-118.
 *
 * POURQUOI EN BASE ET NON PAR LE TUNNEL. Cliquer « Commander » ici reserverait
 * une piece du catalogue de test a chaque largeur et a chaque execution :
 * trois reservations de trente minutes par passage, jusqu'a faire basculer le
 * badge « En stock » d'un test voisin, et un stock epuise en relance rapide.
 * La commande amorcee porte sa PROPRE variante, produit en `BROUILLON`
 * invisible du catalogue, et ne touche a rien de partage.
 *
 * LE COOKIE EST FABRIQUE ICI, PAR LE CODE SERVEUR DU PROJET. C'est le meme
 * geste que la copie figee : `encoderCommandeEnCours` signe avec le secret de
 * `.env`, celui-la meme que le serveur de test emploie. Un fichier de largeur
 * lit l'artefact et n'importe aucun code serveur.
 *
 * LA RESERVATION EST REMISE A TRENTE MINUTES A CHAQUE EXECUTION, `ON CONFLICT
 * DO UPDATE` et non `DO NOTHING` : conservee telle quelle, elle serait expiree
 * a la relance suivante et le bouton de paiement repondrait « reservation
 * expiree » au lieu du cas nominal.
 */
import "dotenv/config";

import { writeFileSync } from "node:fs";

import { test as preparation } from "@playwright/test";
import { Client } from "pg";

import { encoderCommandeEnCours } from "@/lib/commande-cookie";
import {
  COMMANDE_FACTUREE_TEST,
  COMMANDE_TEST,
  FICHIER_COMMANDE,
} from "./chemin-session";

preparation("commande en attente de paiement amorcee", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      /*
       * `ordre` FIXE ET RESERVE, 9118, meme motif que l'amorce LS-160 plus bas :
       * deux preparations concurrentes qui derivent `max(ordre) + 1` sur une
       * base VIERGE lisent le meme maximum et violent C24 au COMMIT.
       */
      `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie commande', 'e2e-ls118-categorie', 9118, now())
       ON CONFLICT (id) DO NOTHING`,
      [COMMANDE_TEST.categorieId],
    );

    // BROUILLON : la piece n'apparait dans aucun catalogue, aucune fiche.
    await client.query(
      `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, 'TEST Pièce commandée', 'e2e-ls118-piece-commandee',
               'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [COMMANDE_TEST.produitId, COMMANDE_TEST.categorieId],
    );

    /*
     * PHYSIQUE 1, RESERVEE 1 : l'etat exact d'une piece unique dont la
     * commande detient la reservation, coherent avec les CHECK de stock.
     */
    await client.query(
      `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'TEST-LS118', 'TEST Déclinaison', 5400, 1, 1, true, now())
       ON CONFLICT (id) DO NOTHING`,
      [COMMANDE_TEST.varianteId, COMMANDE_TEST.produitId],
    );

    await client.query(
      `INSERT INTO commande (
         id, numero, statut, email_normalise, nom_client,
         adresse_livraison, adresse_facturation,
         sous_total_centimes, mode_livraison, frais_port_centimes,
         total_centimes, montant_taxe_centimes,
         cgv_acceptees_a, cgv_version, cree_a
       )
       VALUES (
         $1, $2, 'EN_ATTENTE_PAIEMENT', 'e2e-ls118@exemple.test', 'TEST Camille',
         $3::jsonb, $3::jsonb,
         5400, 'DOMICILE', 0,
         5400, 0,
         now(), 'test', now()
       )
       ON CONFLICT (id) DO NOTHING`,
      [
        COMMANDE_TEST.commandeId,
        COMMANDE_TEST.numero,
        JSON.stringify({
          nom: "TEST Camille",
          ligne1: "1 rue de Test",
          codePostal: "35000",
          ville: "TESTVILLE",
          pays: "FR",
        }),
      ],
    );

    await client.query(
      `INSERT INTO ligne_commande (
         id, commande_id, variante_id, reference_figee,
         libelle_produit_fige, libelle_variante_fige,
         prix_fige_centimes, quantite
       )
       VALUES ($1, $2, $3, 'TEST-LS118', 'TEST Pièce commandée',
               'TEST Déclinaison', 5400, 1)
       ON CONFLICT (id) DO NOTHING`,
      [
        COMMANDE_TEST.ligneId,
        COMMANDE_TEST.commandeId,
        COMMANDE_TEST.varianteId,
      ],
    );

    await client.query(
      `INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
       VALUES ($1, $2, $3, 1, now() + interval '30 minutes', now())
       ON CONFLICT (id) DO UPDATE SET expire_a = now() + interval '30 minutes'`,
      [
        COMMANDE_TEST.reservationId,
        COMMANDE_TEST.varianteId,
        COMMANDE_TEST.commandeId,
      ],
    );

    /*
     * TOUTE TENTATIVE DE PAIEMENT D'UNE EXECUTION PRECEDENTE EST EFFACEE : le
     * clic sur « Payer » sous cle absente n'en ecrit aucune, mais un futur
     * changement pourrait en laisser, et la page afficherait alors un etat
     * herite au lieu de celui du test.
     */
    await client.query(`DELETE FROM paiement WHERE commande_id = $1`, [
      COMMANDE_TEST.commandeId,
    ]);
  } finally {
    await client.end();
  }

  writeFileSync(
    FICHIER_COMMANDE,
    JSON.stringify({
      valeur: encoderCommandeEnCours({
        commandeId: COMMANDE_TEST.commandeId,
      }),
    }),
  );
});

/**
 * Amorce la commande CONFIRMEE et FACTUREE de l'ecran de remboursement, LS-160.
 *
 * SANS ELLE, LE FORMULAIRE N'EST MESURE A AUCUNE LARGEUR. `COMMANDE_TEST` est
 * `EN_ATTENTE_PAIEMENT`, donc l'ecran y rend la branche « aucune facture
 * emise », un simple paragraphe : les deux champs, l'avertissement et le bouton
 * ne seraient jamais rendus, et un debordement a 320 px passerait inapercu.
 *
 * C'est le motif deja rencontre en LS-121, ou un contraste a 4,04:1 a echappe
 * a `axe-core` parce que le chemin n'etait jamais rendu, faute de commande
 * remboursee en donnees de test.
 *
 * AUCUN AVOIR N'EST AMORCE, deliberement : l'ecran doit etre mesure dans son
 * etat le PLUS CHARGE, formulaire complet et restant entier. Un avoir amorce le
 * reduirait, voire le ferait disparaitre si le restant tombait a zero.
 *
 * ELLE NE PORTE AUCUNE RESERVATION : la commande est confirmee, sa reservation
 * a ete convertie en mouvement de stock. En amorcer une laisserait croire a une
 * piece bloquee, et fausserait la tache de liberation d'un test voisin.
 */
preparation(
  "commande facturee amorcee pour l'ecran de remboursement",
  async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try {
      await client.query(
        /*
         * `ordre` EST FIXE ET RESERVE, PAS DERIVE DU MAXIMUM, et l'inverse a
         * casse la CI le 1er septembre 2026.
         *
         * LES PREPARATIONS TOURNENT EN PARALLELE. Quatre amorces inserent une
         * categorie, et toutes calculaient `max(ordre) + 1` : sur une base
         * VIERGE, deux d'entre elles lisent le meme maximum et derivent le meme
         * rang. C24 pose une unicite sur cette colonne, DEFERRABLE, donc la
         * violation ne se manifeste qu'au COMMIT.
         *
         * `ON CONFLICT (id) DO NOTHING` NE RATTRAPE RIEN ICI : le conflit porte
         * sur `ordre`, jamais sur `id`.
         *
         * LE DEFAUT ETAIT INVISIBLE EN LOCAL, ou les categories des executions
         * precedentes subsistent : l'amorce sortait sur le conflit d'`id` avant
         * meme d'evaluer le rang. Seule une base vierge le revele, ce qui est
         * exactement l'etat de la CI.
         *
         * 9160 EST HORS DE PORTEE DU MAXIMUM DERIVE, donc il ne collisionne avec
         * aucune amorce qui, elle, continue de deriver. Une valeur reservee vaut
         * mieux qu'un calcul concurrent quand la ligne est FIGEE et connue.
         *
         * PAS DE `modifie_a` : la colonne n'existe pas sur `categorie`, elle
         * avait ete recopiee par mimetisme depuis `produit`.
         */
        `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie LS160', 'test-categorie-ls160', 9160, now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_FACTUREE_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, 'TEST Pièce facturée', 'test-piece-facturee-ls160',
               'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_FACTUREE_TEST.produitId, COMMANDE_FACTUREE_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'TEST-LS160', 'TEST Déclinaison', 5400, 1, 0, true, now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_FACTUREE_TEST.varianteId, COMMANDE_FACTUREE_TEST.produitId],
      );

      await client.query(
        `INSERT INTO commande (
         id, numero, statut, email_normalise, nom_client,
         adresse_livraison, adresse_facturation,
         sous_total_centimes, mode_livraison, frais_port_centimes,
         total_centimes, montant_taxe_centimes,
         cgv_acceptees_a, cgv_version, cree_a
       )
       VALUES (
         $1, $2, 'CONFIRMEE', 'e2e-ls160@exemple.test', 'TEST Dominique',
         $3::jsonb, $3::jsonb,
         5400, 'DOMICILE', 0,
         5400, 0,
         now(), 'test', now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_FACTUREE_TEST.commandeId,
          COMMANDE_FACTUREE_TEST.numero,
          JSON.stringify({
            nom: "TEST Dominique",
            ligne1: "2 rue de Test",
            codePostal: "35000",
            ville: "TESTVILLE",
            pays: "FR",
          }),
        ],
      );

      await client.query(
        `INSERT INTO ligne_commande (
         id, commande_id, variante_id, reference_figee,
         libelle_produit_fige, libelle_variante_fige,
         prix_fige_centimes, quantite
       )
       VALUES ($1, $2, $3, 'TEST-LS160', 'TEST Pièce facturée',
               'TEST Déclinaison', 5400, 1)
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_FACTUREE_TEST.ligneId,
          COMMANDE_FACTUREE_TEST.commandeId,
          COMMANDE_FACTUREE_TEST.varianteId,
        ],
      );

      /*
       * `identifiant_fournisseur` EST OBLIGATOIRE POUR QUE LE PAIEMENT SOIT LU :
       * `lirePaiementEncaisse` filtre dessus. Un paiement REUSSI sans lui rendrait
       * `AUCUN_PAIEMENT`, et l'ecran mesurerait encore la mauvaise branche.
       */
      await client.query(
        `INSERT INTO paiement (
         id, commande_id, statut, montant_centimes,
         montant_rembourse_centimes, identifiant_fournisseur, confirme_a, cree_a
       )
       VALUES ($1, $2, 'REUSSI', 5400, 0, 'cs_test_ls160', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_FACTUREE_TEST.paiementId, COMMANDE_FACTUREE_TEST.commandeId],
      );

      /*
       * LE NUMERO EST `F-TEST-0160` ET NON `F-2026-xxxx`, deliberement hors de la
       * sequence reelle : amorcer un numero de la sequence sans toucher au
       * compteur ferait entrer en collision la premiere facture emise par un
       * autre test, ADR-031.
       */
      await client.query(
        `INSERT INTO facture (
         id, commande_id, numero, montant_total_centimes,
         montant_avoir_centimes, instantane_legal, emise_a
       )
       VALUES ($1, $2, $3, 5400, 0, $4::jsonb, now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_FACTUREE_TEST.factureId,
          COMMANDE_FACTUREE_TEST.commandeId,
          COMMANDE_FACTUREE_TEST.numeroFacture,
          JSON.stringify({
            version: 1,
            mentions: ["TVA non applicable, article 293 B du CGI"],
          }),
        ],
      );
    } finally {
      await client.end();
    }
  },
);
