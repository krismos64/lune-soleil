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
import { COMMANDE_TEST, FICHIER_COMMANDE } from "./chemin-session";

preparation("commande en attente de paiement amorcee", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(
      `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie commande', 'e2e-ls118-categorie',
               (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())
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
