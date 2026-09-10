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
  COMMANDE_A_EXPEDIER_TEST,
  COMMANDE_SANS_SUIVI_TEST,
  COMMANDE_SUIVIE_TEST,
  DEMANDE_RETRACTATION_TEST,
  COMMANDE_FACTUREE_TEST,
  COMMANDE_TEST,
  FICHIER_COMMANDE,
  SECONDE_COMMANDE_A_EXPEDIER_TEST,
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
          /*
           * L'INSTANTANE EST COMPLET, ET C'ETAIT LA VRAIE CAUSE DE TROIS CI
           * ROUGES. Une premiere version n'ecrivait que `version` et
           * `mentions`.
           *
           * `lireFacturePourAvoir` REVALIDE CETTE COLONNE a la relecture,
           * `schemaInstantaneLegal.parse`, et le schema est un `strictObject` :
           * emetteur, client, commande, lignes et les trois totaux sont
           * exiges. Un instantane partiel fait LEVER la lecture, donc la page
           * de detail rend une erreur : l'URL reste bonne, le titre manque, et
           * le symptome est indiscernable d'une commande absente.
           *
           * LE DEFAUT ETAIT INVISIBLE EN LOCAL parce que la facture y avait ete
           * creee par une execution reelle, avec son instantane complet :
           * `ON CONFLICT (id) DO NOTHING` laissait alors la bonne ligne en place
           * et n'ecrivait jamais la version partielle.
           */
          JSON.stringify({
            version: 1,
            emetteur: {
              raisonSociale: "TEST Lune et Soleil",
              siret: "12345678901234",
              adresse: "1 rue de Test, 35000 TESTVILLE",
              emailContact: "test-emetteur@example.invalid",
            },
            client: {
              nom: "TEST Dominique",
              email: "e2e-ls160@exemple.test",
              adresseFacturation: {
                nom: "TEST Dominique",
                ligne1: "2 rue de Test",
                codePostal: "35000",
                ville: "TESTVILLE",
                pays: "FR",
              },
            },
            commande: {
              numero: COMMANDE_FACTUREE_TEST.numero,
              passeeA: "2026-09-01T10:00:00.000Z",
            },
            lignes: [
              {
                referenceFigee: "TEST-LS160",
                libelleProduit: "TEST Pièce facturée",
                libelleVariante: "TEST Déclinaison",
                prixUnitaireCentimes: 5400,
                quantite: 1,
              },
            ],
            sousTotalCentimes: 5400,
            fraisPortCentimes: 0,
            totalCentimes: 5400,
            mentions: ["TVA non applicable, article 293 B du CGI"],
          }),
        ],
      );

      /*
       * L'AMORCE VERIFIE SON PROPRE RESULTAT, et cette ligne existe parce que son
       * absence a coute trois executions de CI.
       *
       * `ON CONFLICT ... DO NOTHING` REND UNE AMORCE SILENCIEUSEMENT INEFFICACE.
       * Si un INSERT ne cree pas ce qu'on croit, la preparation sort en SUCCES et
       * ce sont les tests d'ecran qui echouent trois minutes plus tard, sur un
       * titre introuvable : le diagnostic part alors sur le rendu, jamais sur
       * l'amorce, et il y reste.
       *
       * ELLE ECHOUE ICI, AU PLUS PRES DE LA CAUSE, et nomme ce qui manque.
       */
      const { rows } = await client.query<{
        numero: string;
        statut: string;
        paiements: string;
        factures: string;
      }>(
        `SELECT c.numero, c.statut,
                (SELECT count(*) FROM paiement p WHERE p.commande_id = c.id) AS paiements,
                (SELECT count(*) FROM facture f WHERE f.commande_id = c.id) AS factures
         FROM commande c WHERE c.id = $1`,
        [COMMANDE_FACTUREE_TEST.commandeId],
      );

      const amorcee = rows[0];

      if (
        amorcee === undefined ||
        amorcee.numero !== COMMANDE_FACTUREE_TEST.numero ||
        amorcee.statut !== "CONFIRMEE" ||
        Number(amorcee.paiements) !== 1 ||
        Number(amorcee.factures) !== 1
      ) {
        throw new Error(
          "Amorce de la commande facturee incomplete : " +
            JSON.stringify(amorcee ?? { commande: "absente" }) +
            `. Attendu numero ${COMMANDE_FACTUREE_TEST.numero}, statut ` +
            "CONFIRMEE, un paiement et une facture.",
        );
      }

      /*
       * LA DEMANDE DE RETRACTATION DE LS-135, greffee sur la commande facturee.
       *
       * ELLE REUTILISE CETTE COMMANDE plutot que d'en creer une : le
       * remboursement d'une retractation exige un paiement encaisse ET une
       * facture, que celle-ci porte deja. Une commande neuve dupliquerait
       * cinquante lignes d'amorce pour le meme etat.
       *
       * ELLE EST `RETOUR_ATTENDU` ET NON `DEPOSEE`, ce qui est l'etat le plus
       * DENSE de l'ecran : c'est le seul ou les quatre gestes coexistent, la
       * preuve d'expedition, la reception, le remboursement et le refus. Une
       * demande `DEPOSEE` n'en rendrait qu'un, et le debordement a 320 px ne
       * serait mesure sur rien. Motif rencontre trois fois, LS-121, LS-160 puis
       * LS-130.
       *
       * `recue_a` EST RENSEIGNE pour que le bouton de remboursement, avec son
       * champ de montant, soit REELLEMENT rendu : sans l'un des deux faits de
       * l'article L221-24, le formulaire n'apparait pas.
       */
      await client.query(
        `INSERT INTO demande_retractation (
           id, commande_id, statut, motif_client, retour_attendu_a, recue_a,
           deposee_a
         )
         VALUES ($1, $2, 'RETOUR_ATTENDU'::"StatutRetractation",
                 'TEST La taille ne convient pas.', now(), now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [
          DEMANDE_RETRACTATION_TEST.demandeId,
          COMMANDE_FACTUREE_TEST.commandeId,
        ],
      );

      /* L'AMORCE VERIFIE SON PROPRE RESULTAT, meme motif que ci-dessus. */
      const { rows: retractation } = await client.query<{ statut: string }>(
        "SELECT statut FROM demande_retractation WHERE id = $1",
        [DEMANDE_RETRACTATION_TEST.demandeId],
      );

      if (retractation[0]?.statut !== "RETOUR_ATTENDU") {
        throw new Error(
          "Amorce de la demande de retractation incomplete : " +
            JSON.stringify(retractation[0] ?? { demande: "absente" }) +
            ". Attendu statut RETOUR_ATTENDU.",
        );
      }

      /*
       * LA COMMANDE `EN_PREPARATION` DE LA FILE D'EXPEDITION, LS-130.
       *
       * `ordre` FIXE ET RESERVE, 9130, meme motif que les amorces ci-dessus :
       * les preparations tournent EN PARALLELE, deux workers en CI, et deriver
       * `max(ordre) + 1` sur une base vierge fait lire le meme maximum a deux
       * amorces. C24 pose une unicite DEFERRABLE sur cette colonne, donc la
       * violation ne se manifeste qu'au COMMIT et emporte toute l'amorce.
       */
      await client.query(
        `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie LS130', 'test-categorie-ls130', 9130, now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_A_EXPEDIER_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, 'TEST Pièce à expédier', 'test-piece-a-expedier-ls130',
               'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_A_EXPEDIER_TEST.produitId,
          COMMANDE_A_EXPEDIER_TEST.categorieId,
        ],
      );

      await client.query(
        `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'TEST-LS130', 'TEST Déclinaison', 4200, 1, 0, true, now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_A_EXPEDIER_TEST.varianteId,
          COMMANDE_A_EXPEDIER_TEST.produitId,
        ],
      );

      /*
       * `EN_PREPARATION` EST L'ETAT QUI COMPTE, et c'est le seul depuis lequel
       * `TRANSITIONS_ADMINISTRATRICE` mene a `EXPEDIEE`. L'amorcer directement
       * dans cet etat evite de rejouer webhook puis transition, qui feraient
       * dependre cette preparation de deux services au lieu d'une insertion.
       *
       * LE MODE EST `DOMICILE`, ET IL SERT AU TEST DU REBASCULEMENT : le
       * formulaire propose ce mode par defaut, et c'est en le changeant vers
       * Point Relais que le champ de point de retrait apparait.
       */
      await client.query(
        `INSERT INTO commande (
         id, numero, statut, email_normalise, nom_client,
         adresse_livraison, adresse_facturation,
         sous_total_centimes, mode_livraison, frais_port_centimes,
         total_centimes, montant_taxe_centimes,
         cgv_acceptees_a, cgv_version, cree_a
       )
       VALUES (
         $1, $2, 'EN_PREPARATION', 'e2e-ls130@exemple.test', 'TEST Sacha',
         $3::jsonb, $3::jsonb,
         4200, 'DOMICILE', 499,
         4699, 0,
         now(), 'test', now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_A_EXPEDIER_TEST.commandeId,
          COMMANDE_A_EXPEDIER_TEST.numero,
          JSON.stringify({
            nom: "TEST Sacha",
            ligne1: "3 rue de Test",
            codePostal: "44000",
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
       VALUES ($1, $2, $3, 'TEST-LS130', 'TEST Pièce à expédier',
               'TEST Déclinaison', 4200, 1)
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_A_EXPEDIER_TEST.ligneId,
          COMMANDE_A_EXPEDIER_TEST.commandeId,
          COMMANDE_A_EXPEDIER_TEST.varianteId,
        ],
      );

      /*
       * LE PAIEMENT EXISTE PARCE QU'UNE COMMANDE EN PREPARATION A ETE PAYEE.
       * Il n'est lu par aucun test d'expedition, mais une commande en
       * preparation sans encaissement serait un etat que le parcours ne produit
       * jamais : amorcer un etat impossible ferait mesurer un ecran sur des
       * donnees qui mentent.
       */
      await client.query(
        `INSERT INTO paiement (
         id, commande_id, statut, montant_centimes,
         montant_rembourse_centimes, identifiant_fournisseur, confirme_a, cree_a
       )
       VALUES ($1, $2, 'REUSSI', 4699, 0, 'cs_test_ls130', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_A_EXPEDIER_TEST.paiementId,
          COMMANDE_A_EXPEDIER_TEST.commandeId,
        ],
      );

      /*
       * L'AMORCE VERIFIE SON PROPRE RESULTAT, regle etablie par LS-160.
       *
       * ELLE VERIFIE AUSSI L'ABSENCE D'EXPEDITION, et pas seulement le statut :
       * une execution precedente qui aurait declare l'expedition laisserait la
       * commande hors de la file, `ON CONFLICT (id) DO NOTHING` ne la remettant
       * jamais en preparation. Le test mesurerait alors l'etat vide en croyant
       * mesurer le formulaire, exactement le defaut que cette commande existe
       * pour eviter.
       */
      const { rows: aExpedier } = await client.query<{
        numero: string;
        statut: string;
        expeditions: string;
      }>(
        `SELECT c.numero, c.statut,
                (SELECT count(*) FROM expedition e WHERE e.commande_id = c.id) AS expeditions
         FROM commande c WHERE c.id = $1`,
        [COMMANDE_A_EXPEDIER_TEST.commandeId],
      );

      const preparee = aExpedier[0];

      if (
        preparee === undefined ||
        preparee.numero !== COMMANDE_A_EXPEDIER_TEST.numero ||
        preparee.statut !== "EN_PREPARATION" ||
        Number(preparee.expeditions) !== 0
      ) {
        throw new Error(
          "Amorce de la commande a expedier incomplete : " +
            JSON.stringify(preparee ?? { commande: "absente" }) +
            `. Attendu numero ${COMMANDE_A_EXPEDIER_TEST.numero}, statut ` +
            "EN_PREPARATION et aucune expedition.",
        );
      }

      /*
       * LA SECONDE COMMANDE `EN_PREPARATION`, ET ELLE N'EST PAS UN DOUBLON.
       *
       * La file rend un formulaire PAR commande : avec UNE carte, un test qui
       * atteint un champ par son libelle passe quel que soit l'etat des `id`.
       * Mesure faite le 2 septembre 2026, identifiants remplaces par des
       * constantes fixes : les trois tests restaient verts. Cette carte est ce
       * qui rend l'assertion capable d'echouer.
       *
       * SON MODE EST `POINT_RELAIS`, donc son formulaire rend d'entree le champ
       * de point de retrait que la premiere carte n'affiche pas : les deux
       * formulaires sont dans des etats distincts, et leurs identifiants se
       * croisent reellement.
       *
       * `ordre` 9131, reserve comme les precedents.
       */
      await client.query(
        `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie LS130 bis', 'test-categorie-ls130-bis', 9131, now())
       ON CONFLICT (id) DO NOTHING`,
        [SECONDE_COMMANDE_A_EXPEDIER_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, 'TEST Seconde pièce à expédier',
               'test-seconde-piece-a-expedier-ls130', 'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [
          SECONDE_COMMANDE_A_EXPEDIER_TEST.produitId,
          SECONDE_COMMANDE_A_EXPEDIER_TEST.categorieId,
        ],
      );

      await client.query(
        `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'TEST-LS130-BIS', 'TEST Déclinaison', 3800, 1, 0, true, now())
       ON CONFLICT (id) DO NOTHING`,
        [
          SECONDE_COMMANDE_A_EXPEDIER_TEST.varianteId,
          SECONDE_COMMANDE_A_EXPEDIER_TEST.produitId,
        ],
      );

      /*
       * `point_relais_id` EST OBLIGATOIRE SUR CE MODE, contrainte
       * `chk_commande_mode_point_relais` : c'est une EQUIVALENCE, un
       * `POINT_RELAIS` sans point n'atteint jamais la base. Amorcer sans lui
       * ferait echouer la preparation entiere, pas seulement ce test.
       */
      await client.query(
        `INSERT INTO commande (
         id, numero, statut, email_normalise, nom_client,
         adresse_livraison, adresse_facturation,
         point_relais_id, point_relais_adresse,
         sous_total_centimes, mode_livraison, frais_port_centimes,
         total_centimes, montant_taxe_centimes,
         cgv_acceptees_a, cgv_version, cree_a
       )
       VALUES (
         $1, $2, 'EN_PREPARATION', 'e2e-ls130-bis@exemple.test', 'TEST Alix',
         $3::jsonb, $3::jsonb,
         $4, $5::jsonb,
         3800, 'POINT_RELAIS', 410,
         4210, 0,
         now(), 'test', now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          SECONDE_COMMANDE_A_EXPEDIER_TEST.commandeId,
          SECONDE_COMMANDE_A_EXPEDIER_TEST.numero,
          JSON.stringify({
            nom: "TEST Alix",
            ligne1: "4 rue de Test",
            codePostal: "69000",
            ville: "TESTVILLE",
            pays: "FR",
          }),
          SECONDE_COMMANDE_A_EXPEDIER_TEST.pointRelaisId,
          JSON.stringify({
            identifiant: SECONDE_COMMANDE_A_EXPEDIER_TEST.pointRelaisId,
            nom: "TEST Point relais",
            ligne1: "5 place de Test",
            codePostal: "69000",
            ville: "TESTVILLE",
          }),
        ],
      );

      await client.query(
        `INSERT INTO ligne_commande (
         id, commande_id, variante_id, reference_figee,
         libelle_produit_fige, libelle_variante_fige,
         prix_fige_centimes, quantite
       )
       VALUES ($1, $2, $3, 'TEST-LS130-BIS', 'TEST Seconde pièce à expédier',
               'TEST Déclinaison', 3800, 1)
       ON CONFLICT (id) DO NOTHING`,
        [
          SECONDE_COMMANDE_A_EXPEDIER_TEST.ligneId,
          SECONDE_COMMANDE_A_EXPEDIER_TEST.commandeId,
          SECONDE_COMMANDE_A_EXPEDIER_TEST.varianteId,
        ],
      );

      await client.query(
        `INSERT INTO paiement (
         id, commande_id, statut, montant_centimes,
         montant_rembourse_centimes, identifiant_fournisseur, confirme_a, cree_a
       )
       VALUES ($1, $2, 'REUSSI', 4210, 0, 'cs_test_ls130_bis', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [
          SECONDE_COMMANDE_A_EXPEDIER_TEST.paiementId,
          SECONDE_COMMANDE_A_EXPEDIER_TEST.commandeId,
        ],
      );

      /*
       * LA COMMANDE EXPEDIEE AU SUIVI SYNCHRONISE, LS-216 et LS-58. Elle rend
       * le bloc d'acheminement, son signalement de suivi bloque et son
       * rebasculement de mode, trois branches qu'aucune autre donnee de test ne
       * produit.
       */
      await client.query(
        `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie LS216', 'test-categorie-ls216', 9216, now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_SUIVIE_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, 'TEST Pièce suivie', 'test-piece-suivie-ls216',
               'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_SUIVIE_TEST.produitId, COMMANDE_SUIVIE_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'TEST-LS216', 'TEST Déclinaison', 5100, 1, 0, true, now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_SUIVIE_TEST.varianteId, COMMANDE_SUIVIE_TEST.produitId],
      );

      /*
       * `EXPEDIEE` ET `DOMICILE` : le colis est parti, et c'est ce que le
       * client a paye. Le mode de l'EXPEDITION differera plus bas, ce qui est
       * precisement le rebasculement que le critere 5 demande de rendre
       * visible sans jamais reecrire la commande, ADR-025.
       */
      await client.query(
        `INSERT INTO commande (
         id, numero, statut, email_normalise, nom_client,
         adresse_livraison, adresse_facturation,
         sous_total_centimes, mode_livraison, frais_port_centimes,
         total_centimes, montant_taxe_centimes,
         cgv_acceptees_a, cgv_version, cree_a
       )
       VALUES (
         $1, $2, 'EXPEDIEE', 'e2e-ls216@exemple.test', 'TEST Dominique',
         $3::jsonb, $3::jsonb,
         5100, 'DOMICILE', 749,
         5849, 0,
         now(), 'test', now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SUIVIE_TEST.commandeId,
          COMMANDE_SUIVIE_TEST.numero,
          JSON.stringify({
            nom: "TEST Dominique",
            ligne1: "8 rue de Test",
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
       VALUES ($1, $2, $3, 'TEST-LS216', 'TEST Pièce suivie',
               'TEST Déclinaison', 5100, 1)
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SUIVIE_TEST.ligneId,
          COMMANDE_SUIVIE_TEST.commandeId,
          COMMANDE_SUIVIE_TEST.varianteId,
        ],
      );

      await client.query(
        `INSERT INTO paiement (
         id, commande_id, statut, montant_centimes,
         montant_rembourse_centimes, identifiant_fournisseur, confirme_a, cree_a
       )
       VALUES ($1, $2, 'REUSSI', 5849, 0, 'cs_test_ls216', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_SUIVIE_TEST.paiementId, COMMANDE_SUIVIE_TEST.commandeId],
      );

      /*
       * L'EXPEDITION DANS L'ETAT OU LA SYNCHRONISATION L'AURAIT LAISSEE.
       *
       * `synchronise_a` A TROIS JOURS, ce qui depasse le seuil de vingt-quatre
       * heures : c'est ce qui rend le signalement de suivi bloque VISIBLE,
       * critere 4. Une date relative et non figee, pour que le cas reste vrai
       * quelle que soit la date d'execution de la suite.
       *
       * `livre_a` RESTE NUL, et il le doit : `fraicheurSuivi` rend « frais »
       * des qu'il est renseigne, ce qui eteindrait le signalement que ce jeu de
       * donnees existe pour produire.
       *
       * `statut_transporteur` EST UN FAUX AMI DELIBERE. « Awaiting customer
       * pickup » annonce un colis disponible au relais, que la table d'ADR-042
       * ne tient PAS pour une livraison : l'ecran doit afficher « Pas encore
       * constatée » en face de la remise, critere 3.
       */
      await client.query(
        `INSERT INTO expedition (
         id, commande_id, transporteur, mode, numero_suivi, point_relais_id,
         statut_transporteur, expedie_a, livre_a, synchronise_a, cree_a
       )
       VALUES (
         $1, $2, 'Sendcloud', 'POINT_RELAIS', $3, $4,
         $5, now() - interval '5 days', NULL, now() - interval '3 days', now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SUIVIE_TEST.expeditionId,
          COMMANDE_SUIVIE_TEST.commandeId,
          COMMANDE_SUIVIE_TEST.numeroSuivi,
          COMMANDE_SUIVIE_TEST.pointRelaisId,
          COMMANDE_SUIVIE_TEST.statutTransporteur,
        ],
      );

      /*
       * LA COMMANDE EXPEDIEE SANS NUMERO DE SUIVI, LS-216 et LS-58. Elle rend
       * les deux paragraphes de signalement qu'aucune autre donnee de test ne
       * produit : le numero manquant est DEFINITIF, `listerASuivre` filtrant
       * sur `numeroSuivi: { not: null }`.
       */
      await client.query(
        `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
       VALUES ($1, 'TEST Catégorie LS217', 'test-categorie-ls217', 9217, now())
       ON CONFLICT (id) DO NOTHING`,
        [COMMANDE_SANS_SUIVI_TEST.categorieId],
      );

      await client.query(
        `INSERT INTO produit (id, categorie_id, nom, slug, statut, cree_a, modifie_a)
       VALUES ($1, $2, 'TEST Pièce sans suivi', 'test-piece-sans-suivi-ls217',
               'BROUILLON', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SANS_SUIVI_TEST.produitId,
          COMMANDE_SANS_SUIVI_TEST.categorieId,
        ],
      );

      await client.query(
        `INSERT INTO variante (
         id, produit_id, reference, libelle, prix_centimes,
         quantite_physique, quantite_reservee, vente_web_activee, cree_a
       )
       VALUES ($1, $2, 'TEST-LS217', 'TEST Déclinaison', 3300, 1, 0, true, now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SANS_SUIVI_TEST.varianteId,
          COMMANDE_SANS_SUIVI_TEST.produitId,
        ],
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
         $1, $2, 'EXPEDIEE', 'e2e-ls217@exemple.test', 'TEST Camille',
         $3::jsonb, $3::jsonb,
         3300, 'DOMICILE', 749,
         4049, 0,
         now(), 'test', now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SANS_SUIVI_TEST.commandeId,
          COMMANDE_SANS_SUIVI_TEST.numero,
          JSON.stringify({
            nom: "TEST Camille",
            ligne1: "12 rue de Test",
            codePostal: "29200",
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
       VALUES ($1, $2, $3, 'TEST-LS217', 'TEST Pièce sans suivi',
               'TEST Déclinaison', 3300, 1)
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SANS_SUIVI_TEST.ligneId,
          COMMANDE_SANS_SUIVI_TEST.commandeId,
          COMMANDE_SANS_SUIVI_TEST.varianteId,
        ],
      );

      await client.query(
        `INSERT INTO paiement (
         id, commande_id, statut, montant_centimes,
         montant_rembourse_centimes, identifiant_fournisseur, confirme_a, cree_a
       )
       VALUES ($1, $2, 'REUSSI', 4049, 0, 'cs_test_ls217', now(), now())
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SANS_SUIVI_TEST.paiementId,
          COMMANDE_SANS_SUIVI_TEST.commandeId,
        ],
      );

      /*
       * `numero_suivi` NUL, ET TOUT CE QUI EN DECOULE. `statut_transporteur` et
       * `synchronise_a` restent nuls PAR CONSEQUENCE et non par choix : la
       * tache horaire ne lira jamais cette ligne.
       */
      await client.query(
        `INSERT INTO expedition (
         id, commande_id, transporteur, mode, numero_suivi, point_relais_id,
         statut_transporteur, expedie_a, livre_a, synchronise_a, cree_a
       )
       VALUES (
         $1, $2, 'Sendcloud', 'DOMICILE', NULL, NULL,
         NULL, now() - interval '2 days', NULL, NULL, now()
       )
       ON CONFLICT (id) DO NOTHING`,
        [
          COMMANDE_SANS_SUIVI_TEST.expeditionId,
          COMMANDE_SANS_SUIVI_TEST.commandeId,
        ],
      );

      /*
       * LE JEU DE DONNEES EST VERIFIE PLUTOT QUE SUPPOSE, meme motif que le
       * compte de la file plus bas. Un `ON CONFLICT DO NOTHING` qui n'ecrit
       * rien laisserait les tests d'acheminement mesurer une section absente,
       * donc passer en ne prouvant rien.
       */
      const { rows: suivie } = await client.query<{
        modeCommande: string;
        modeExpedition: string;
        ageHeures: string;
      }>(
        `SELECT c.mode_livraison AS "modeCommande",
                e.mode           AS "modeExpedition",
                round(extract(epoch from (now() - e.synchronise_a)) / 3600)::text
                                 AS "ageHeures"
           FROM commande c JOIN expedition e ON e.commande_id = c.id
          WHERE c.id = $1`,
        [COMMANDE_SUIVIE_TEST.commandeId],
      );

      if (suivie.length === 0) {
        throw new Error(
          "Commande suivie LS-216 absente : le bloc d'acheminement ne serait " +
            "rendu a aucune largeur, et ses tests passeraient sans rien prouver.",
        );
      }

      if (suivie[0]!.modeCommande === suivie[0]!.modeExpedition) {
        throw new Error(
          "Commande suivie LS-216 : les deux modes coincident, le " +
            "rebasculement du critere 5 ne serait pas rendu.",
        );
      }

      if (Number(suivie[0]!.ageHeures) <= 24) {
        throw new Error(
          `Commande suivie LS-216 : suivi vieux de ${suivie[0]!.ageHeures} h, ` +
            "plus de 24 attendues. Le signalement de suivi bloque ne serait pas rendu.",
        );
      }

      /*
       * LA COMMANDE SANS NUMERO EST VERIFIEE AUSSI, et sur le champ qui compte :
       * un `numero_suivi` renseigne par megarde eteindrait les deux paragraphes
       * de signalement, et leurs tests passeraient en ne prouvant rien.
       */
      const { rows: sansSuivi } = await client.query<{
        numeroSuivi: string | null;
      }>(
        `SELECT e.numero_suivi AS "numeroSuivi"
           FROM commande c JOIN expedition e ON e.commande_id = c.id
          WHERE c.id = $1`,
        [COMMANDE_SANS_SUIVI_TEST.commandeId],
      );

      if (sansSuivi.length === 0) {
        throw new Error(
          "Commande sans suivi LS-216 absente : les deux paragraphes de " +
            "signalement ne seraient rendus a aucune largeur.",
        );
      }

      if (sansSuivi[0]!.numeroSuivi !== null) {
        throw new Error(
          "Commande sans suivi LS-216 : un numero de suivi est renseigne, " +
            "le signalement ne serait pas rendu et ses tests ne prouveraient rien.",
        );
      }

      /*
       * LES DEUX CARTES SONT VERIFIEES ENSEMBLE, et le compte porte sur la FILE
       * entiere : c'est lui qui garantit ce que les tests mesurent. Une seule
       * carte les rendrait incapables d'echouer sans qu'aucune assertion ne le
       * signale.
       */
      const { rows: file } = await client.query<{ nombre: string }>(
        `SELECT count(*)::text AS nombre FROM commande c
         WHERE c.statut = 'EN_PREPARATION'
           AND NOT EXISTS (SELECT 1 FROM expedition e WHERE e.commande_id = c.id)`,
      );

      if (Number(file[0]?.nombre) < 2) {
        throw new Error(
          `File de preparation incomplete : ${file[0]?.nombre ?? "0"} commande(s) ` +
            "en attente d'expedition, deux attendues. Les tests d'unicite des " +
            "identifiants passeraient sans rien prouver.",
        );
      }
    } finally {
      await client.end();
    }
  },
);
