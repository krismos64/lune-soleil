/**
 * RETRAIT D'UN AVIS PAR SON AUTEUR, ET ANONYMISATION DES TRACES. LS-305, R19.
 *
 * ------------------------------------------------------------------
 * LES DEUX SENS, TOUJOURS. Un retrait qui n'efface rien et un retrait qui
 * supprime la ligne passeraient chacun la moitie des cas : l'avis doit
 * disparaitre de la vue de son auteur ET la ligne survivre, ancree sur sa ligne
 * de commande, arbitrage LS-246.
 *
 * LE TEST NEGATIF PORTE L'INVARIANT 2 : un compte ne retire pas l'avis d'autrui.
 * ------------------------------------------------------------------
 *
 * SUFFIXE `.sequential` : base PostgreSQL partagee entre fichiers.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let services: typeof import("@/services/avis");
let purge: typeof import("@/services/purge-journaux");
let auth: typeof import("@/lib/auth").auth;

const MOT_DE_PASSE = "Mot2Passe-Test-LS305-Suffisamment-Long";

type LigneAvis = {
  statut: string;
  note: number | null;
  commentaire: string | null;
  utilisateur_id: string | null;
  motif_decision: string | null;
  efface_a: Date | null;
  decide_a: Date | null;
};

async function creerClient(): Promise<string> {
  const email = `ls305-${randomUUID()}@exemple.test`;

  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE, name: "Client Test" },
  });

  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM utilisateur WHERE email = $1",
    [email],
  );

  const utilisateur = rows[0];

  if (utilisateur === undefined) {
    throw new Error("le compte de test n'a pas ete cree");
  }

  return utilisateur.id;
}

/**
 * Ecrit un avis en SQL, meme raison que `mes-avis.sequential.test.ts` : le
 * depot par jeton est eprouve ailleurs, ce fichier ne porte que le retrait.
 */
async function ecrireAvis(options: {
  utilisateurId?: string | null;
  statut?: string;
  motif?: string | null;
  decideA?: Date | null;
}): Promise<string> {
  const {
    utilisateurId = null,
    statut = "PUBLIE",
    motif = null,
    decideA = null,
  } = options;

  const { varianteId } = await creerVarianteEnStock(client);
  const commandeId = randomUUID();
  const ligneId = randomUUID();
  const avisId = randomUUID();

  await client.query(
    `INSERT INTO commande (
       id, numero, statut, email_normalise, nom_client, total_centimes,
       sous_total_centimes, frais_port_centimes, mode_livraison,
       adresse_livraison, adresse_facturation, cgv_acceptees_a, cgv_version,
       cree_a
     ) VALUES ($1, $2, 'LIVREE', $3, 'TEST Client', 4900, 4900, 0, 'DOMICILE',
       $4, $4, now(), 'v1', now())`,
    [
      commandeId,
      `C-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
      `ls305-${randomUUID()}@exemple.test`,
      JSON.stringify({
        ligne1: "1 rue de Test",
        codePostal: "75001",
        ville: "TESTVILLE",
        pays: "FR",
      }),
    ],
  );

  await client.query(
    `INSERT INTO ligne_commande (
       id, commande_id, variante_id, reference_figee, libelle_produit_fige,
       libelle_variante_fige, prix_fige_centimes, quantite
     ) VALUES ($1, $2, $3, 'REF-TEST', 'Bracelet de test',
       'Taille unique', 4900, 1)`,
    [ligneId, commandeId, varianteId],
  );

  await client.query(
    `INSERT INTO avis (
       id, ligne_commande_id, utilisateur_id, note, commentaire, statut,
       motif_decision, experience_a, depose_a, publie_a, decide_a
     ) VALUES ($1, $2, $3, 4, 'Texte de son auteur', $4::"StatutAvis", $5,
       now(), now(), CASE WHEN $4 = 'PUBLIE' THEN now() ELSE NULL END, $6)`,
    [avisId, ligneId, utilisateurId, statut, motif, decideA],
  );

  return avisId;
}

async function lireAvis(avisId: string): Promise<LigneAvis | undefined> {
  const { rows } = await client.query<LigneAvis>(
    `SELECT statut, note, commentaire, utilisateur_id, motif_decision,
       efface_a, decide_a FROM avis WHERE id = $1`,
    [avisId],
  );

  return rows[0];
}

beforeAll(async () => {
  process.env[VARIABLE_URL_TEST] = inject("DATABASE_URL_TEST");
  process.env.DATABASE_URL = inject("DATABASE_URL_TEST");

  client = new Client({ connectionString: inject("DATABASE_URL_TEST") });
  await client.connect();

  services = await import("@/services/avis");
  purge = await import("@/services/purge-journaux");
  ({ auth } = await import("@/lib/auth"));
});

afterEach(async () => {
  await client.query("DELETE FROM avis");
  await client.query(
    "DELETE FROM envoi_en_attente WHERE modele = 'avis-non-publie'",
  );
});

afterAll(async () => {
  await client.end();
});

describe("retirerMonAvis, le retrait par l'auteur, LS-305", () => {
  it("retire un avis publie, efface son texte et son auteur, garde la ligne", async () => {
    const moi = await creerClient();
    const avisId = await ecrireAvis({ utilisateurId: moi });

    const issue = await services.retirerMonAvis({ avisId, utilisateurId: moi });

    expect(issue.statut).toBe("RETIRE");

    const avis = await lireAvis(avisId);
    expect(avis, "la ligne a ete supprimee").toBeDefined();
    expect(avis?.statut).toBe("RETIRE");
    expect(avis?.commentaire).toBeNull();
    expect(avis?.note, "LS-306, la note part avec le texte").toBeNull();
    expect(avis?.utilisateur_id).toBeNull();
    expect(avis?.efface_a).not.toBeNull();
    expect(avis?.decide_a).not.toBeNull();
    expect(avis?.motif_decision).toBe("Retiré à la demande de son auteur.");

    expect(await services.listerMesAvis(moi)).toEqual([]);
  });

  /**
   * LE TEST NEGATIF DE SECURITE, invariant 2. L'identifiant d'avis vient du
   * formulaire : sans le recoupement avec la session, tout compte effacerait
   * l'avis de n'importe qui.
   */
  it("refuse de retirer l'avis d'autrui et le laisse intact", async () => {
    const moi = await creerClient();
    const autre = await creerClient();
    const avisId = await ecrireAvis({ utilisateurId: moi });

    const issue = await services.retirerMonAvis({
      avisId,
      utilisateurId: autre,
    });

    expect(issue.statut).toBe("REFUSE_INTROUVABLE");

    const avis = await lireAvis(avisId);
    expect(avis?.statut).toBe("PUBLIE");
    expect(avis?.commentaire).toBe("Texte de son auteur");
    expect(avis?.utilisateur_id).toBe(moi);
    expect(avis?.note).toBe(4);
    expect(avis?.efface_a).toBeNull();
  });

  it("rejoue sans effet supplementaire", async () => {
    const moi = await creerClient();
    const avisId = await ecrireAvis({ utilisateurId: moi });

    await services.retirerMonAvis({ avisId, utilisateurId: moi });
    const premier = await lireAvis(avisId);

    const second = await services.retirerMonAvis({
      avisId,
      utilisateurId: moi,
    });

    expect(second.statut).toBe("REFUSE_INTROUVABLE");
    expect((await lireAvis(avisId))?.efface_a).toEqual(premier?.efface_a);
  });

  it("garde la decision et le motif d'un avis refuse", async () => {
    const moi = await creerClient();
    const avisId = await ecrireAvis({
      utilisateurId: moi,
      statut: "REFUSE",
      motif: "Hors sujet",
      decideA: new Date("2026-10-01T10:00:00Z"),
    });

    expect(
      (await services.retirerMonAvis({ avisId, utilisateurId: moi })).statut,
    ).toBe("RETIRE");

    const avis = await lireAvis(avisId);
    expect(avis?.statut).toBe("REFUSE");
    expect(avis?.motif_decision).toBe("Hors sujet");
    expect(avis?.decide_a).toEqual(new Date("2026-10-01T10:00:00Z"));
    expect(avis?.commentaire).toBeNull();
  });

  it("refuse un identifiant mal forme sans rien ecrire", async () => {
    const moi = await creerClient();

    await expect(
      services.retirerMonAvis({ avisId: "pas-un-uuid", utilisateurId: moi }),
    ).rejects.toThrow();
  });
});

describe("modererAvis, un avis efface ne se republie pas, R19", () => {
  it("refuse la publication d'un avis efface par son auteur", async () => {
    const moi = await creerClient();
    const avisId = await ecrireAvis({ utilisateurId: moi });

    await services.retirerMonAvis({ avisId, utilisateurId: moi });

    const issue = await services.modererAvis({
      avisId,
      statut: "PUBLIE",
      motifDecision: null,
    });

    expect(issue.statut).toBe("REFUSE_INTROUVABLE");
    expect((await lireAvis(avisId))?.statut).toBe("RETIRE");
  });

  /**
   * L'AUTRE SENS : un avis sans auteur n'est pas pour autant efface. Celui
   * d'un compte supprime reste moderable, sans quoi la garde serait posee sur
   * `utilisateurId` au lieu de `effaceA`.
   */
  it("publie toujours l'avis d'un compte supprime, non efface", async () => {
    const avisId = await ecrireAvis({ utilisateurId: null, statut: "DEPOSE" });

    const issue = await services.modererAvis({
      avisId,
      statut: "PUBLIE",
      motifDecision: null,
    });

    expect(issue.statut).toBe("APPLIQUEE");
  });
});

/**
 * LA COURSE AVEC LA MODERATION, relevee par la revue critique. Le retrait tient
 * le verrou de ligne jusqu'a son `COMMIT` ; une republication lancee pendant ce
 * temps attend, puis PostgreSQL reevalue `efface_a IS NULL` sur la ligne
 * validee et n'ecrit rien.
 *
 * LE VERROU EST TENU A LA MAIN, par une transaction ouverte sur une seconde
 * connexion : c'est la seule facon de placer la moderation DANS la fenetre. Le
 * test prouve aussi ce qu'aucune lecture ne prouvait, que `update` de Prisma 7
 * avec `effaceA: null` est une seule instruction et non une lecture suivie
 * d'une ecriture par identifiant.
 */
describe("retrait et moderation concurrents, LS-305", () => {
  it("une republication lancee pendant le retrait n'ecrit rien", async () => {
    const moi = await creerClient();
    const avisId = await ecrireAvis({ utilisateurId: moi, statut: "DEPOSE" });

    const verrou = new Client({
      connectionString: inject("DATABASE_URL_TEST"),
    });
    await verrou.connect();

    try {
      await verrou.query("BEGIN");
      await verrou.query(
        `UPDATE avis SET commentaire = NULL, note = NULL, utilisateur_id = NULL,
           efface_a = now() WHERE id = $1`,
        [avisId],
      );

      let terminee = false;
      const moderation = services
        .modererAvis({ avisId, statut: "PUBLIE", motifDecision: null })
        .finally(() => {
          terminee = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(terminee, "la moderation n'a pas attendu le verrou").toBe(false);

      await verrou.query("COMMIT");

      expect((await moderation).statut).toBe("REFUSE_INTROUVABLE");
    } finally {
      await verrou.end();
    }

    const avis = await lireAvis(avisId);
    expect(avis?.statut).toBe("DEPOSE");
    expect(avis?.efface_a).not.toBeNull();
  });
});

describe("anonymiserTracesAvisEchues, cinq ans apres la decision, LS-305", () => {
  const maintenant = new Date("2031-11-01T12:00:00Z");
  const limite = new Date("2026-11-01T12:00:00Z");
  const avant = new Date(limite.getTime() - 1);

  it("anonymise la trace d'un avis refuse ou retire depuis plus de cinq ans", async () => {
    const refuse = await ecrireAvis({
      utilisateurId: await creerClient(),
      statut: "REFUSE",
      motif: "Injurieux",
      decideA: avant,
    });
    const retire = await ecrireAvis({
      statut: "RETIRE",
      motif: "Hors sujet",
      decideA: avant,
    });

    const compte = await purge.anonymiserTracesAvisEchues(maintenant);

    expect(compte).toBe(2);

    for (const avisId of [refuse, retire]) {
      const avis = await lireAvis(avisId);
      expect(avis?.commentaire).toBeNull();
      expect(avis?.note).toBeNull();
      expect(avis?.utilisateur_id).toBeNull();
      expect(avis?.efface_a).toEqual(maintenant);
      expect(avis?.motif_decision).not.toBeNull();
    }
  });

  it("ne touche ni un avis publie ni une trace de cinq ans tout juste", async () => {
    const auteur = await creerClient();
    const publie = await ecrireAvis({
      utilisateurId: auteur,
      decideA: new Date("2020-01-01T00:00:00Z"),
    });
    const frontiere = await ecrireAvis({
      utilisateurId: auteur,
      statut: "RETIRE",
      motif: "Hors sujet",
      decideA: limite,
    });

    expect(await purge.anonymiserTracesAvisEchues(maintenant)).toBe(0);

    expect((await lireAvis(publie))?.commentaire).toBe("Texte de son auteur");
    expect((await lireAvis(frontiere))?.commentaire).toBe(
      "Texte de son auteur",
    );
  });

  it("figure dans la purge quotidienne", async () => {
    const resultats = await purge.purgerJournaux();

    expect(resultats.find((r) => r.table === "Avis")).toEqual({
      table: "Avis",
      supprimees: expect.any(Number),
      echec: false,
    });
  });
});

/**
 * L'AUTEUR RECOIT LE MOTIF, article D111-12, LS-306. L'email part a l'adresse
 * de la COMMANDE, compte ou non, et seulement sur une decision qui ecarte
 * l'avis.
 */
describe("modererAvis informe l'auteur du motif, D111-12", () => {
  async function envoisDuMotif(): Promise<
    { destinataire: string; variables: Record<string, string> }[]
  > {
    const { rows } = await client.query(
      `SELECT destinataire, variables FROM envoi_en_attente
       WHERE modele = 'avis-non-publie'`,
    );

    return rows as {
      destinataire: string;
      variables: Record<string, string>;
    }[];
  }

  async function emailDeLaCommande(avisId: string): Promise<string> {
    const { rows } = await client.query(
      `SELECT c.email_normalise FROM avis a
       JOIN ligne_commande l ON l.id = a.ligne_commande_id
       JOIN commande c ON c.id = l.commande_id WHERE a.id = $1`,
      [avisId],
    );

    return rows[0].email_normalise as string;
  }

  it("un refus depose le motif a l'adresse de la commande, sans compte", async () => {
    const avisId = await ecrireAvis({ utilisateurId: null, statut: "DEPOSE" });

    const issue = await services.modererAvis({
      avisId,
      statut: "REFUSE",
      motifDecision: "L'avis ne porte pas sur la pièce achetée.",
    });

    expect(issue.statut).toBe("APPLIQUEE");

    const envois = await envoisDuMotif();
    expect(envois).toHaveLength(1);
    expect(envois[0]?.destinataire).toBe(await emailDeLaCommande(avisId));
    expect(envois[0]?.variables).toMatchObject({
      decision: "refuse",
      piece: "Bracelet de test",
      motif: "L'avis ne porte pas sur la pièce achetée.",
    });
  });

  it("un retrait apres publication le dit", async () => {
    const avisId = await ecrireAvis({ utilisateurId: await creerClient() });

    await services.modererAvis({
      avisId,
      statut: "RETIRE",
      motifDecision: "Données personnelles",
    });

    const envois = await envoisDuMotif();
    expect(envois).toHaveLength(1);
    expect(envois[0]?.variables.decision).toBe("retire");
  });

  it("une publication n'envoie rien", async () => {
    const avisId = await ecrireAvis({ statut: "DEPOSE" });

    /*
     * UN MOTIF SAISI PUIS « PUBLIER » : le formulaire envoie le champ avec la
     * publication. Sans motif ici, le test restait vert sur un envoi
     * declenche par la publication, mutation mesuree.
     */
    await services.modererAvis({
      avisId,
      statut: "PUBLIE",
      motifDecision: "Texte laissé dans le champ",
    });

    expect((await lireAvis(avisId))?.statut).toBe("PUBLIE");
    expect(await envoisDuMotif()).toHaveLength(0);
  });

  it("un refus sans motif n'ecrit ni la decision ni l'envoi", async () => {
    const avisId = await ecrireAvis({ statut: "DEPOSE" });

    const issue = await services.modererAvis({
      avisId,
      statut: "REFUSE",
      motifDecision: "  ",
    });

    expect(issue.statut).toBe("REFUSE_MOTIF_MANQUANT");
    expect((await lireAvis(avisId))?.statut).toBe("DEPOSE");
    expect(await envoisDuMotif()).toHaveLength(0);
  });

  it("le retrait par l'auteur n'envoie rien, et un avis efface ne se modere plus", async () => {
    const moi = await creerClient();
    const avisId = await ecrireAvis({ utilisateurId: moi });

    await services.retirerMonAvis({ avisId, utilisateurId: moi });
    const issue = await services.modererAvis({
      avisId,
      statut: "REFUSE",
      motifDecision: "Hors sujet",
    });

    expect(issue.statut).toBe("REFUSE_INTROUVABLE");
    expect(await envoisDuMotif()).toHaveLength(0);
  });
});
