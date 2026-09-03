/**
 * EMAIL DE CONFIRMATION, PORTEUR DES DEUX LIENS SIGNES. LS-172, parcours 1
 * etape 9.
 *
 * CE QUI SE JOUE ICI EST LE SEUL CHEMIN par lequel la valeur en clair des
 * jetons atteint le client. La base ne garde que leur empreinte, regle L5, et
 * cette valeur n'existe qu'a l'instant de sa creation : sans ce message, un
 * acheteur sans compte n'a ni facture atteignable ni moyen de se retracter, ce
 * que l'article L221-21 impose et que L221-20 sanctionne par douze mois.
 *
 * LE TROU QUE CETTE STORY FERME etait invisible : les deux jetons etaient emis
 * a chaque commande depuis LS-132 et LS-134, puis perdus, aucun appelant ne
 * lisant `jetonAcces` ni `jetonRetractation`.
 *
 * LES DEUX LIENS SONT VERIFIES DISTINCTS, regle L6 : une fuite du lien de
 * facture ne doit pas donner le pouvoir de retracter la commande d'autrui.
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import type {
  EvenementPaiement,
  VerificateurSignature,
} from "@/integrations/stripe/evenements";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let rendreModele: typeof import("@/integrations/email/modeles").rendreModele;
let empreinteJeton: typeof import("@/lib/jeton-acces").empreinteJeton;

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

function verificateurDouble(
  evenement: EvenementPaiement,
): VerificateurSignature {
  return {
    async verifier() {
      return evenement;
    },
  };
}

function evenementReussi(commandeId: string): EvenementPaiement {
  return {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId,
    identifiantSession: `cs_test_${commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };
}

/** Passe une commande PAR LES SERVICES, jamais par un `INSERT`. */
async function commander(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return issue.commandeId;
}

/** Confirme par un evenement signe, chemin de production. */
async function confirmer(commandeId: string): Promise<void> {
  const evenement = evenementReussi(commandeId);

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });
}

/** L'intention d'envoi deposee pour une commande, s'il en existe une. */
async function lireEnvoi(commandeId: string): Promise<{
  modele: string;
  statut: string;
  destinataire: string;
  variables: Record<string, string>;
} | null> {
  const { rows } = await client.query<{
    modele: string;
    statut: string;
    destinataire: string;
    variables: Record<string, string>;
  }>(
    `SELECT modele, statut, destinataire, variables FROM envoi_en_attente
     WHERE commande_id = $1 AND modele = 'commande-confirmee'`,
    [commandeId],
  );

  return rows[0] ?? null;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ rendreModele } = await import("@/integrations/email/modeles"));
  ({ empreinteJeton } = await import("@/lib/jeton-acces"));
});

/*
 * LE NETTOYAGE VA JUSQU'AUX COMMANDES, lecon de LS-134 : un fichier qui laisse
 * des lignes ne casse que ses SUCCESSEURS, et seulement selon l'ordre
 * d'execution. Le test de concurrence sur la piece unique lit `reservation`
 * sans filtre et avait annonce vingt-cinq acheteurs servis.
 */
afterEach(async () => {
  await client.query("DELETE FROM envoi_en_attente");
  await client.query("DELETE FROM jeton_acces");
  await client.query(
    "TRUNCATE reservation, ligne_commande, paiement, evenement_fournisseur, mouvement_stock, historique_statut, facture, commande, variante, produit, categorie, compteur_numero CASCADE",
  );
});

afterAll(async () => {
  await client.end();
});

describe("depot de la confirmation a la commande payee", () => {
  /* CRITERE 1 : l'email part par l'outbox, dans la transaction. */
  it("depose une intention d'envoi a la confirmation", async () => {
    const commandeId = await commander();
    await confirmer(commandeId);

    const envoi = await lireEnvoi(commandeId);

    expect(envoi).not.toBeNull();
    expect(envoi?.statut).toBe("EN_ATTENTE");
    expect(envoi?.destinataire).toBe(SAISIE_DOMICILE.email);
  });

  /*
   * CRITERE 2 ET 3 : les deux liens, et ils sont DISTINCTS. Une fuite du lien
   * de facture ne doit pas donner le pouvoir de retracter, regle L6.
   */
  it("porte deux liens distincts, facture et retractation", async () => {
    const commandeId = await commander();
    await confirmer(commandeId);

    const envoi = await lireEnvoi(commandeId);
    if (envoi === null) {
      throw new Error("aucune intention d'envoi deposee");
    }

    const { lienFacture, lienRetractation } = envoi.variables;

    expect(lienFacture).toContain("/facture/");
    expect(lienRetractation).toContain("/retractation/");
    expect(lienFacture).not.toBe(lienRetractation);
  });

  /*
   * LES LIENS PORTENT LES JETONS REELLEMENT EN BASE, et c'est ce qui prouve
   * qu'ils fonctionneront. Comparer les empreintes plutot que les valeurs :
   * la base ne garde que l'empreinte, regle L5.
   */
  it("compose les liens sur les jetons reellement ecrits en base", async () => {
    const commandeId = await commander();
    await confirmer(commandeId);

    const envoi = await lireEnvoi(commandeId);

    if (envoi === null) {
      throw new Error("aucune intention d'envoi deposee");
    }

    /*
     * LES DEUX LIENS SONT GARDES AVANT D'ETRE DECOUPES. `variables` est un
     * `Record<string, string>`, donc chaque acces est possiblement `undefined`
     * sous `noUncheckedIndexedAccess` : une assertion `!` masquerait un lien
     * absent, et le test comparerait alors `undefined` a une empreinte.
     */
    const { lienFacture, lienRetractation } = envoi.variables;

    if (lienFacture === undefined || lienRetractation === undefined) {
      throw new Error("intention d'envoi sans lien");
    }

    // LE DERNIER SEGMENT DU LIEN EST LA VALEUR DU JETON.
    const valeurFacture = lienFacture.split("/").at(-1);
    const valeurRetractation = lienRetractation.split("/").at(-1);

    if (valeurFacture === undefined || valeurRetractation === undefined) {
      throw new Error("lien sans segment de jeton");
    }

    const { rows } = await client.query<{ portee: string; empreinte: string }>(
      "SELECT portee, empreinte FROM jeton_acces WHERE commande_id = $1",
      [commandeId],
    );

    const document = rows.find((ligne) => ligne.portee === "DOCUMENT");
    const retractation = rows.find((ligne) => ligne.portee === "RETRACTATION");

    expect(document?.empreinte).toBe(empreinteJeton(valeurFacture));
    expect(retractation?.empreinte).toBe(empreinteJeton(valeurRetractation));
  });

  /*
   * CRITERE 5, LE REJEU. `emettreFacture` ressort sur la facture existante sans
   * reengendrer de jeton, donc aucun second email n'est depose. C'est la
   * premiere des deux protections, la seconde etant l'unicite de l'outbox.
   */
  it("ne depose rien de plus quand l'evenement est rejoue", async () => {
    const commandeId = await commander();
    await confirmer(commandeId);
    await confirmer(commandeId);

    const { rows } = await client.query(
      `SELECT 1 FROM envoi_en_attente
       WHERE commande_id = $1 AND modele = 'commande-confirmee'`,
      [commandeId],
    );

    expect(rows).toHaveLength(1);
  });

  /*
   * LE REJEU APRES ENVOI REEL, ET C'EST LA GARDE DES DEUX JETONS QUI LE FERME.
   *
   * DEFAUT TROUVE PAR MUTATION : retirer la garde laissait les huit tests
   * VERTS, parce que `deposerEnvoi` absorbe le `P2002` de
   * `envoi_en_attente_actif_unique`. La SECONDE ligne de defense masquait
   * l'absence de la premiere, motif deja en fiche sur ce depot.
   *
   * MAIS CET INDEX EST PARTIEL, filtre sur `EN_ATTENTE` et `ENVOI_EN_COURS` :
   * une fois le message REELLEMENT PARTI, statut `ENVOYE`, il ne protege plus
   * rien. Un rejeu deposerait alors un SECOND email portant
   * `/facture/undefined` et `/retractation/undefined`, mesure : les jetons sont
   * absents sur un rejeu et `lienDocument` ne leve pas sur `undefined`.
   *
   * Le client recevrait deux fois le meme message, le second avec deux liens
   * morts vers son propre droit de retractation.
   */
  it("ne depose rien apres un rejeu, meme le message deja envoye", async () => {
    const commandeId = await commander();
    await confirmer(commandeId);

    // L'envoi est reellement parti : l'index partiel ne protege plus.
    await client.query(
      `UPDATE envoi_en_attente SET statut = 'ENVOYE'::"StatutEnvoi"
       WHERE commande_id = $1 AND modele = 'commande-confirmee'`,
      [commandeId],
    );

    await confirmer(commandeId);

    const { rows } = await client.query<{ statut: string }>(
      `SELECT statut FROM envoi_en_attente
       WHERE commande_id = $1 AND modele = 'commande-confirmee'`,
      [commandeId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.statut).toBe("ENVOYE");
  });

  /*
   * CRITERE 6, LA PANNE DU FOURNISSEUR. Ce chemin n'appelle JAMAIS le
   * fournisseur : l'intention est deposee dans la transaction metier, donc
   * l'envoi reste rejouable et aucune commande n'est perdue. Il n'y a rien a
   * faire tomber, c'est une propriete structurelle et non une simulation.
   */
  it("n'ecrit aucune trace d'envoi, le message n'etant pas encore parti", async () => {
    const commandeId = await commander();
    await confirmer(commandeId);

    const journal = await client.query(
      "SELECT 1 FROM journal_email WHERE commande_id = $1",
      [commandeId],
    );

    expect(journal.rowCount).toBe(0);

    // La commande est confirmee malgre tout : l'email ne conditionne rien.
    const { rows } = await client.query<{ statut: string }>(
      "SELECT statut FROM commande WHERE id = $1",
      [commandeId],
    );

    expect(rows[0]?.statut).toBe("CONFIRMEE");
  });
});

describe("rendu du modele", () => {
  /*
   * LE MESSAGE PORTE LES DEUX LIENS ET LA MENTION DES FRAIS DE RETOUR, article
   * L221-23 : sans cette mention, ces frais reviennent au vendeur et la charge
   * de la preuve pese sur lui.
   */
  it("rend un corps portant les deux liens et les frais de retour", () => {
    const rendu = rendreModele({
      destinataire: "test@example.invalid",
      modele: "commande-confirmee",
      variables: {
        numero: "C-2026-0001",
        lienFacture: "https://exemple.invalid/facture/aaa.bbb",
        lienRetractation: "https://exemple.invalid/retractation/ccc.ddd",
      },
    });

    expect(rendu.objet).toContain("C-2026-0001");
    expect(rendu.texte).toContain("https://exemple.invalid/facture/aaa.bbb");
    expect(rendu.texte).toContain(
      "https://exemple.invalid/retractation/ccc.ddd",
    );
    expect(rendu.texte).toContain("frais de retour sont à votre charge");
    expect(rendu.texte).toContain("14 jours");
  });

  /*
   * UN LIEN ABSENT LEVE, il ne produit pas un message poli et inutilisable dont
   * la trace dirait `ENVOYE`. Le defaut serait invisible des deux cotes.
   */
  it("refuse de rendre un message auquel il manque un lien", () => {
    expect(() =>
      rendreModele({
        destinataire: "test@example.invalid",
        modele: "commande-confirmee",
        variables: {
          numero: "C-2026-0001",
          lienFacture: "https://exemple.invalid/facture/aaa.bbb",
        },
      }),
    ).toThrow(/lienRetractation/);

    expect(() =>
      rendreModele({
        destinataire: "test@example.invalid",
        modele: "commande-confirmee",
        variables: {
          numero: "C-2026-0001",
          lienRetractation: "https://exemple.invalid/retractation/ccc.ddd",
        },
      }),
    ).toThrow(/lienFacture/);
  });

  /*
   * AUCUN DELAI D'ACHEMINEMENT CHIFFRE. Le transporteur n'est pas branche,
   * LS-131, et annoncer « sous 48 heures » serait une information
   * precontractuelle fausse. Le seul nombre de jours admis est le delai LEGAL
   * de retractation.
   */
  it("n'annonce aucun delai de livraison invente", () => {
    const rendu = rendreModele({
      destinataire: "test@example.invalid",
      modele: "commande-confirmee",
      variables: {
        numero: "C-2026-0001",
        lienFacture: "https://exemple.invalid/facture/aaa.bbb",
        lienRetractation: "https://exemple.invalid/retractation/ccc.ddd",
      },
    });

    expect(rendu.texte).not.toMatch(/48\s*(heures|h)/i);
    expect(rendu.texte).not.toMatch(/sous \d+ jours? ouvr/i);
  });
});
