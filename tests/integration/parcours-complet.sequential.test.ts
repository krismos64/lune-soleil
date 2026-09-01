/**
 * LA PORTE DE SORTIE DE LA PHASE 3, LS-121. Le parcours 1 de bout en bout.
 *
 * CE QUE CE FICHIER PROUVE, ET QU'AUCUN AUTRE NE PROUVE. Chaque maillon est
 * teste chez lui : le panier en LS-114, le tunnel en LS-115, la commande en
 * LS-117, la session de paiement en LS-118, la confirmation en LS-119, les
 * taches en LS-120, l'administration ici meme. Aucun ne traverse la CHAINE.
 *
 * Or c'est precisement ce que la porte de sortie exige : « le flux de paiement
 * en mode test doit etre reproductible de bout en bout, panier, tunnel,
 * commande, reservation, paiement, webhook, confirmation, et la commande
 * visible en administration ».
 *
 * POURQUOI UNE CHAINE PEUT CASSER QUAND CHAQUE MAILLON TIENT. Les defauts de la
 * journee du 27 aout 2026 sont tous de cette famille : les metadonnees posees
 * sur la session mais absentes de la charge, l'ordre des verrous oppose entre
 * deux services corrects pris isolement. Rien dans un test de maillon ne les
 * voyait.
 *
 * IL PASSE PAR LES SERVICES REELS, jamais par du SQL reecrit ici, meme regle que
 * le jalon de LS-116 : un test qui recopie la mecanique valide sa copie.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import type { EvenementPaiement } from "@/integrations/stripe/evenements";
import type { FournisseurPaiement } from "@/integrations/stripe/fournisseur";

let client: Client;
let revaliderPanier: typeof import("@/services/panier").revalider;
let passerCommandeEtDemarrerPaiement: typeof import("@/services/paiement").passerCommandeEtDemarrerPaiement;
let lireEtatCommande: typeof import("@/services/paiement").lireEtatCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let listerCommandes: typeof import("@/services/administration-commandes").listerCommandes;
let lireDetailCommande: typeof import("@/services/administration-commandes").lireDetailCommande;
let changerStatutCommande: typeof import("@/services/administration-commandes").changerStatutCommande;
let libererReservationsExpirees: typeof import("@/services/liberation-reservations").libererReservationsExpirees;

const SAISIE_DOMICILE = {
  nomClient: "TEST Camille Dupont",
  email: "test@example.invalid",
  telephone: null,
  adresse: {
    ligne1: "1 rue de Test",
    codePostal: "75001",
    ville: "TESTVILLE",
    pays: "FR" as const,
  },
  mode: "DOMICILE" as const,
  pointRetrait: null,
};

const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

const TOTAL_ATTENDU_CENTIMES = 4900;

let administratriceId: string;

/** Double du prestataire : il cree une session et sait la relire. */
function fournisseurDouble(): FournisseurPaiement {
  const sessions = new Map<string, string>();

  return {
    async creerSession(demande) {
      const identifiant = `cs_test_${demande.commandeId.slice(0, 8)}`;
      sessions.set(identifiant, demande.commandeId);

      return {
        identifiant,
        url: `https://paiement.example.invalid/${identifiant}`,
      };
    },
    async expirerSession() {
      return "DEJA_FERMEE";
    },
    /*
     * `rembourser` N'EST PAS EXERCEE PAR CE FICHIER, LS-128. Elle LEVE plutot
     * que de rendre un succes muet : un appel inattendu doit se voir, la ou un
     * double complaisant ferait passer un remboursement fantome pour normal.
     */
    async rembourser(): Promise<never> {
      throw new Error("rembourser n'a pas sa place dans ces tests");
    },
    async lireSession(identifiant) {
      return {
        etat: "PAYEE",
        identifiantSession: identifiant,
        montantCentimes: TOTAL_ATTENDU_CENTIMES,
        charge: {},
      };
    },
  };
}

async function lireStock(
  varianteId: string,
): Promise<{ physique: number; reservee: number }> {
  const { rows } = await client.query<{
    quantite_physique: number;
    quantite_reservee: number;
  }>(
    "SELECT quantite_physique, quantite_reservee FROM variante WHERE id = $1",
    [varianteId],
  );

  const ligne = rows[0];

  if (ligne === undefined) {
    throw new Error("variante introuvable");
  }

  return {
    physique: ligne.quantite_physique,
    reservee: ligne.quantite_reservee,
  };
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ revalider: revaliderPanier } = await import("@/services/panier"));
  ({ passerCommandeEtDemarrerPaiement, lireEtatCommande } =
    await import("@/services/paiement"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ listerCommandes, lireDetailCommande, changerStatutCommande } =
    await import("@/services/administration-commandes"));
  ({ libererReservationsExpirees } =
    await import("@/services/liberation-reservations"));

  administratriceId = randomUUID();
  await client.query(
    `INSERT INTO utilisateur (id, email, email_verifie, nom, role, cree_a, mis_a_jour_a)
     VALUES ($1, 'admin-parcours@example.invalid', true, 'TEST Administratrice', 'ADMINISTRATRICE', now(), now())`,
    [administratriceId],
  );
});

afterAll(async () => {
  await client.query("DELETE FROM utilisateur WHERE id = $1", [
    administratriceId,
  ]);
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, reservation, ligne_commande, commande,
     variante, produit, categorie, compteur_numero CASCADE`,
  );
});

describe("porte de sortie de la phase 3, le parcours 1 de bout en bout", () => {
  it("traverse panier, commande, paiement, confirmation et administration", async () => {
    /*
     * SUR UNE PIECE UNIQUE, et c'est le jalon du projet : « un achat de bout en
     * bout sur une variante en stock a un exemplaire ».
     */
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    // ---------------------------------------------------------------- etape 3
    // LE PANIER EST REVALIDE CONTRE LA BASE. Aucun montant ne vient du cookie,
    // invariant 2 : le prix affiche est celui du serveur.
    const panier = await revaliderPanier([{ varianteId, quantite: 1 }]);

    expect(panier.lignes).toHaveLength(1);
    expect(panier.lignes[0]?.prixUnitaireCentimes).toBe(TOTAL_ATTENDU_CENTIMES);

    // ------------------------------------------------------------ etapes 4, 5
    // LA COMMANDE ET SA RESERVATION DANS UNE SEULE TRANSACTION, ADR-024, puis
    // la session de paiement APRES le commit.
    const fournisseur = fournisseurDouble();

    const { commande, paiement } = await passerCommandeEtDemarrerPaiement({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      fournisseur,
      configuration: CONFIGURATION,
    });

    /*
     * `passerCommande` REFUSE PAR EXCEPTION et non par une valeur : une
     * commande rendue est donc une commande servie. Verifier un statut
     * inexistant ferait croire a un controle qui n'en est pas un.
     */
    expect(commande.commandeId).toBeTruthy();
    expect(commande.totalCentimes).toBe(TOTAL_ATTENDU_CENTIMES);
    expect(paiement.statut).toBe("REDIRECTION");

    /*
     * LA PIECE EST RESERVEE MAIS PAS ENCORE SORTIE, invariant 6 : disponibilite
     * web et quantite physique sont deux notions distinctes.
     */
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });

    // ---------------------------------------------------------------- etape 6
    // LA PAGE DE CONFIRMATION DIT L'ETAT REEL : rien n'est encaisse tant que
    // l'evenement signe n'est pas arrive, invariant 5.
    const avantWebhook = await lireEtatCommande(commande.commandeId);

    expect(avantWebhook?.statut).toBe("EN_ATTENTE_PAIEMENT");
    expect(avantWebhook?.encaissee).toBe(false);

    // ---------------------------------------------------------------- etape 7
    // L'EVENEMENT SIGNE CONFIRME. C'est le seul chemin qui le fait, le retour
    // navigateur ne prouvant rien.
    const evenement: EvenementPaiement = {
      identifiant: `evt_${randomUUID()}`,
      type: "PAIEMENT_REUSSI",
      commandeId: commande.commandeId,
      identifiantSession: `cs_test_${commande.commandeId.slice(0, 8)}`,
      montantCentimes: TOTAL_ATTENDU_CENTIMES,
      montantRembourseCentimes: 0,
      charge: {},
    };

    const issue = await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(evenement),
      signature: "signature-de-test",
      verificateur: {
        async verifier() {
          return evenement;
        },
      },
    });

    expect(issue).toEqual({ statut: "TRAITE" });

    /*
     * LA RESERVATION EST DEVENUE UN MOUVEMENT, et le stock physique est sorti
     * UNE SEULE FOIS. C'est le jalon du projet, verifie ici sur la chaine
     * entiere plutot que sur le seul service de confirmation.
     */
    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });

    const apresWebhook = await lireEtatCommande(commande.commandeId);
    expect(apresWebhook?.statut).toBe("CONFIRMEE");
    expect(apresWebhook?.encaissee).toBe(true);

    /*
     * LA TACHE DE LIBERATION NE REND RIEN, la reservation ayant ete consommee.
     * Sans cette verification, une pièce vendue pourrait repartir au catalogue
     * au cycle suivant, defaut que LS-120 ferme et que seule la chaine expose.
     */
    expect(await libererReservationsExpirees()).toBe(0);
    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });

    // ------------------------------------------------------------ etapes 10 a 12
    // LA COMMANDE EST VISIBLE EN ADMINISTRATION, avec son encaissement.
    const enListe = await listerCommandes();
    const ligneListe = enListe.find((c) => c.id === commande.commandeId);

    expect(ligneListe?.statut).toBe("CONFIRMEE");
    expect(ligneListe?.encaissee).toBe(true);
    expect(ligneListe?.totalCentimes).toBe(TOTAL_ATTENDU_CENTIMES);

    const detail = await lireDetailCommande(commande.commandeId);

    expect(detail?.lignes).toHaveLength(1);
    expect(detail?.paiements[0]?.statut).toBe("REUSSI");
    expect(detail?.transitionsPossibles).toEqual(["EN_PREPARATION", "ANNULEE"]);

    // L'EXPLOITANTE FAIT AVANCER LA COMMANDE, et la transition est historisee.
    await changerStatutCommande({
      commandeId: commande.commandeId,
      nouveauStatut: "EN_PREPARATION",
      acteurId: administratriceId,
    });

    await changerStatutCommande({
      commandeId: commande.commandeId,
      nouveauStatut: "EXPEDIEE",
      acteurId: administratriceId,
    });

    const final = await lireDetailCommande(commande.commandeId);

    expect(final?.statut).toBe("EXPEDIEE");

    /*
     * L'HISTORIQUE PORTE LA CHAINE ENTIERE : la confirmation par le systeme,
     * puis les deux gestes de l'exploitante avec son identifiant. C'est ce qui
     * permet de reconstituer le parcours six mois plus tard.
     */
    expect(final?.historiques.map((h) => [h.statutNouveau, h.origine])).toEqual(
      [
        ["CONFIRMEE", "SYSTEME"],
        ["EN_PREPARATION", "ADMIN"],
        ["EXPEDIEE", "ADMIN"],
      ],
    );

    /*
     * UN SEUL MOUVEMENT DE STOCK SUR TOUTE LA CHAINE. Les deux transitions
     * d'administration n'en produisent aucun : expedier n'est pas vendre une
     * seconde fois.
     */
    const { rows: mouvements } = await client.query(
      "SELECT id FROM mouvement_stock WHERE commande_id = $1",
      [commande.commandeId],
    );
    expect(mouvements).toHaveLength(1);
  });

  it("laisse le stock intact quand le paiement n'arrive jamais", async () => {
    /*
     * LE CHEMIN D'ABANDON, cas d'erreur du parcours 1. Il traverse les memes
     * maillons, mais sans evenement : c'est la tache de liberation qui doit
     * rendre la piece, et elle seule.
     */
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    const { commande } = await passerCommandeEtDemarrerPaiement({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      fournisseur: fournisseurDouble(),
      configuration: CONFIGURATION,
    });

    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });

    // Le client ferme l'onglet. Trente minutes passent.
    await client.query(
      "UPDATE reservation SET expire_a = now() - interval '1 minute' WHERE commande_id = $1",
      [commande.commandeId],
    );

    expect(await libererReservationsExpirees()).toBe(1);

    /*
     * LA PIECE EST RENDUE AU CATALOGUE, intacte : elle n'a jamais ete vendue,
     * donc aucun mouvement de stock n'existe.
     */
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 0 });

    const { rows: mouvements } = await client.query(
      "SELECT id FROM mouvement_stock WHERE commande_id = $1",
      [commande.commandeId],
    );
    expect(mouvements).toEqual([]);

    // La commande reste visible en administration, avec son etat reel.
    const detail = await lireDetailCommande(commande.commandeId);
    expect(detail?.statut).toBe("EN_ATTENTE_PAIEMENT");
    expect(detail?.transitionsPossibles).toEqual([]);
  });
});
