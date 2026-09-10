/**
 * AVIS VERIFIES, LS-61. Invitation apres livraison, depot, moderation.
 *
 * ZONE CRITIQUE : autorisation par jeton, transaction, obligation legale.
 *
 * CE QUE CETTE SUITE PROUVE AVANT TOUT, ET QUI EST LE COEUR DE LA STORY : le
 * depot consomme le jeton DANS LA MEME TRANSACTION, point 7 des transactions
 * critiques. Un rejeu ne cree pas de second avis, et le test le mesure en
 * comptant les lignes plutot qu'en lisant un statut de retour : un service qui
 * rendrait « deja depose » apres avoir ecrit passerait un test de statut.
 *
 * LE TEST DE REVOCATION EST LE SECOND EN IMPORTANCE, critere 3. Un renvoi qui
 * deplacerait le pointeur sans revoquer laisse l'ancien lien valide jusqu'a son
 * terme : sur une boite partagee, le premier lien depose l'avis a la place du
 * client. La revocation ferme le chemin NOMINAL, pas une panne.
 *
 * TOUT PASSE PAR LES SERVICES, jamais par un `INSERT` de commande : reproduire
 * la mecanique a la main testerait la reproduction, piege rencontre le 25 aout
 * 2026 sur ce depot.
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
let inviterApresLivraison: typeof import("@/services/avis").inviterApresLivraison;
let lireEtatDepot: typeof import("@/services/avis").lireEtatDepot;
let deposerAvis: typeof import("@/services/avis").deposerAvis;
let modererAvis: typeof import("@/services/avis").modererAvis;
let lireAvisPublies: typeof import("@/services/avis").lireAvisPublies;
let listerAvisAModerer: typeof import("@/services/avis").listerAvisAModerer;
let signalerAvis: typeof import("@/services/avis").signalerAvis;
let listerSignalementsAExaminer: typeof import("@/services/avis").listerSignalementsAExaminer;
let cloturerSignalementAvis: typeof import("@/services/avis").cloturerSignalementAvis;
let engendrerJeton: typeof import("@/lib/jeton-acces").engendrerJeton;
let empreinteJeton: typeof import("@/lib/jeton-acces").empreinteJeton;

const ADRESSE = {
  ligne1: "1 rue de Test",
  codePostal: "75001",
  ville: "TESTVILLE",
  pays: "FR" as const,
};

const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 749,
  seuilFranchiseCentimes: 3900,
};

const PRIX_VARIANTE_CENTIMES = 2000;

function saisieCommande(email: string) {
  return {
    nomClient: "TEST Camille Dupont",
    email,
    telephone: null,
    adresse: ADRESSE,
    mode: "DOMICILE" as const,
    pointRetrait: null,
  };
}

function verificateurDouble(
  evenement: EvenementPaiement,
): VerificateurSignature {
  return {
    async verifier() {
      return evenement;
    },
  };
}

/**
 * Passe une commande payee, portant le nombre de pieces demande.
 *
 * LE NOMBRE DE PIECES EST UN PARAMETRE PARCE QUE LE GROUPEMENT EN DEPEND. Une
 * commande a une seule ligne ne peut pas reveler le defaut que la cle
 * d'idempotence des emails fait courir : c'est a trois lignes que deux
 * intentions seraient avalees en silence.
 */
async function commanderEtPayer(
  nombrePieces = 1,
  email = "client-avis@exemple.fr",
): Promise<{ commandeId: string; varianteIds: string[] }> {
  const varianteIds: string[] = [];
  const lignesCookie: { varianteId: string; quantite: number }[] = [];

  for (let index = 0; index < nombrePieces; index += 1) {
    const { varianteId } = await creerVarianteEnStock(client);

    await client.query("UPDATE variante SET prix_centimes = $1 WHERE id = $2", [
      PRIX_VARIANTE_CENTIMES,
      varianteId,
    ]);

    varianteIds.push(varianteId);
    lignesCookie.push({ varianteId, quantite: 1 });
  }

  const issue = await passerCommande({
    lignesCookie,
    saisie: saisieCommande(email),
    configuration: CONFIGURATION,
  });

  const { rows } = await client.query<{ total_centimes: number }>(
    "SELECT total_centimes FROM commande WHERE id = $1",
    [issue.commandeId],
  );

  const evenement: EvenementPaiement = {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId: issue.commandeId,
    identifiantSession: `cs_test_${issue.commandeId.slice(0, 8)}`,
    montantCentimes: rows[0]!.total_centimes,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  return { commandeId: issue.commandeId, varianteIds };
}

/**
 * Ecrit une expedition livree sur une commande.
 *
 * `livreA` EST POSE DIRECTEMENT PLUTOT QUE PAR `synchroniserSuivi`, et c'est un
 * ecart assume : la tache de suivi appelle le transporteur, dont le double vit
 * dans une autre suite. Ce qui est mesure ici est ce que la DATE declenche, pas
 * la facon dont elle est obtenue.
 */
async function marquerLivree(
  commandeId: string,
  livreA: Date = new Date(),
): Promise<void> {
  await client.query(
    `INSERT INTO expedition (id, commande_id, transporteur, mode, livre_a, cree_a)
     VALUES ($1, $2, 'Sendcloud', 'DOMICILE'::"ModeLivraison", $3, now())`,
    [randomUUID(), commandeId, livreA],
  );
}

/** Ecrit une expedition NON livree, `livreA` restant nul. */
async function marquerExpediee(commandeId: string): Promise<void> {
  await client.query(
    `INSERT INTO expedition (id, commande_id, transporteur, mode, expedie_a, cree_a)
     VALUES ($1, $2, 'Sendcloud', 'DOMICILE'::"ModeLivraison", now(), now())`,
    [randomUUID(), commandeId],
  );
}

/**
 * La valeur de jeton d'une commande, telle que l'email l'aurait portee.
 *
 * ELLE NE PEUT PAS SE LIRE EN BASE, l'empreinte seule y etant stockee, regle
 * L5. Le test la retrouve dans les VARIABLES de l'intention d'envoi, c'est-a-
 * dire exactement par ou le client la recoit : le lien de l'email. C'est ce qui
 * fait de ce test un test du parcours et non de la mecanique.
 */
async function valeurJetonDeCommande(commandeId: string): Promise<string> {
  const { rows } = await client.query<{ variables: { lien: string } }>(
    `SELECT variables FROM envoi_en_attente
     WHERE commande_id = $1 AND modele = 'invitation-avis'`,
    [commandeId],
  );

  if (rows.length === 0) {
    throw new Error("Aucune intention d'invitation pour cette commande");
  }

  const lien = rows[0]!.variables.lien;

  return lien.slice(lien.lastIndexOf("/") + 1);
}

async function compterAvis(commandeId: string): Promise<number> {
  const { rows } = await client.query<{ nombre: string }>(
    `SELECT count(*)::text AS nombre FROM avis a
     JOIN ligne_commande l ON l.id = a.ligne_commande_id
     WHERE l.commande_id = $1`,
    [commandeId],
  );

  return Number(rows[0]!.nombre);
}

/**
 * Le jeton PORTE PAR LE LIEN, retrouve par son empreinte.
 *
 * IL SE SELECTIONNE PAR EMPREINTE ET NON PAR EXPIRATION, correction de la revue
 * critique du 11 septembre 2026. Sa premiere version prenait `ORDER BY expire_a
 * DESC LIMIT 1` : sur une commande multi-lignes, les jetons naissent dans la
 * MEME transaction a la milliseconde pres, donc l'ordre est indetermine et
 * l'assertion pouvait porter sur un jeton autre que celui du lien. Le defaut
 * etait invisible tant que tous les tests portaient sur une seule ligne.
 */
async function lireJetonDuLien(valeurJeton: string): Promise<{
  id: string;
  utilise_a: Date | null;
  revoque_a: Date | null;
}> {
  const { rows } = await client.query<{
    id: string;
    utilise_a: Date | null;
    revoque_a: Date | null;
  }>(`SELECT id, utilise_a, revoque_a FROM jeton_acces WHERE empreinte = $1`, [
    empreinteJeton(valeurJeton),
  ]);

  return rows[0]!;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  /*
   * `NEXT_PUBLIC_SITE_URL` EST INDISPENSABLE ICI, `lienAvis` ayant un defaut
   * FERME : sans elle le service leve plutot que de composer un lien qui
   * emporterait le jeton hors du domaine.
   */
  process.env.NEXT_PUBLIC_SITE_URL ??= "https://test.invalid";
  process.env.FACTURE_RAISON_SOCIALE ??= "TEST Lune et Soleil";
  process.env.FACTURE_SIRET ??= "12345678901234";
  process.env.FACTURE_ADRESSE ??= "1 rue de Test, 75001 TESTVILLE";
  process.env.FACTURE_EMAIL_CONTACT ??= "test-emetteur@example.invalid";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({
    inviterApresLivraison,
    lireEtatDepot,
    deposerAvis,
    modererAvis,
    lireAvisPublies,
    listerAvisAModerer,
    signalerAvis,
    listerSignalementsAExaminer,
    cloturerSignalementAvis,
  } = await import("@/services/avis"));
  ({ engendrerJeton, empreinteJeton } = await import("@/lib/jeton-acces"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  /*
   * L'ORDRE DE SUPPRESSION SUIT LES CLES ETRANGERES, toutes en `RESTRICT` sur
   * ce domaine : une table effacee trop tot ferait echouer le nettoyage et
   * polluerait les tests suivants plutot que le test courant.
   */
  await client.query("DELETE FROM signalement_avis");
  await client.query("DELETE FROM avis");
  await client.query("DELETE FROM invitation_avis");
  await client.query("DELETE FROM jeton_acces");
  await client.query("DELETE FROM rate_limit");
  await client.query("DELETE FROM envoi_en_attente");
  await client.query("DELETE FROM journal_email");
  await client.query("DELETE FROM expedition");
  await client.query("DELETE FROM facture");
  await client.query("DELETE FROM mouvement_stock");
  await client.query("DELETE FROM reservation");
  await client.query("DELETE FROM paiement");
  await client.query("DELETE FROM historique_statut");
  await client.query("DELETE FROM ligne_commande");
  await client.query("DELETE FROM commande");
});

describe("invitation apres livraison, critere 1", () => {
  it("n'invite pas une commande dont la livraison n'est pas constatee", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerExpediee(commandeId);

    const issue = await inviterApresLivraison();

    expect(issue.invitees).toBe(0);

    /*
     * L'ASSERTION PORTE SUR LA BASE ET NON SUR LE COMPTE RENDU. Un service qui
     * ecrirait l'invitation puis rendrait zero passerait le premier test.
     */
    const { rows } = await client.query(
      `SELECT 1 FROM invitation_avis i
       JOIN ligne_commande l ON l.id = i.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    expect(rows).toHaveLength(0);
  });

  it("invite une commande livree, une invitation par ligne", async () => {
    const { commandeId } = await commanderEtPayer(3);
    await marquerLivree(commandeId);

    const issue = await inviterApresLivraison();

    expect(issue.invitees).toBe(1);

    const { rows } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM invitation_avis i
       JOIN ligne_commande l ON l.id = i.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    /*
     * TROIS INVITATIONS, REGLE R16, POUR UN SEUL EMAIL. C'est la propriete que
     * le groupement doit tenir : le droit de deposer reste par ligne, l'envoi
     * est groupe. Un service qui creerait une seule invitation ferait perdre
     * deux avis sur trois.
     */
    expect(Number(rows[0]!.nombre)).toBe(3);
  });

  it("depose une seule intention d'email pour une commande a trois pieces", async () => {
    const { commandeId } = await commanderEtPayer(3);
    await marquerLivree(commandeId);

    await inviterApresLivraison();

    const { rows } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM envoi_en_attente
       WHERE commande_id = $1 AND modele = 'invitation-avis'`,
      [commandeId],
    );

    /*
     * UNE SEULE INTENTION, ET C'EST LA RAISON D'ETRE DU GROUPEMENT.
     * `envoi_en_attente_actif_unique` porte sur `(commandeId, modele)` : trois
     * intentions verraient les deux dernieres AVALEES par `deposerEnvoi`, qui
     * traite P2002 comme un doublon normal. Le client recevrait un email sur
     * trois et rien ne rougirait. Ce test fixe l'invariant dans l'autre sens.
     */
    expect(Number(rows[0]!.nombre)).toBe(1);
  });

  it("n'invite pas deux fois la meme commande, idempotence sur l'effet", async () => {
    const { commandeId } = await commanderEtPayer(2);
    await marquerLivree(commandeId);

    await inviterApresLivraison();
    const second = await inviterApresLivraison();

    expect(second.invitees).toBe(0);
    expect(second.echecs).toBe(0);

    const { rows } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM invitation_avis i
       JOIN ligne_commande l ON l.id = i.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    expect(Number(rows[0]!.nombre)).toBe(2);
  });

  it("n'invite pas une commande dont le compte a ete supprime", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await client.query("UPDATE commande SET dissocie_a = now() WHERE id = $1", [
      commandeId,
    ]);

    const issue = await inviterApresLivraison();

    expect(issue.invitees).toBe(0);
  });

  it("engendre un jeton de portee AVIS et non d'une autre portee", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);

    await inviterApresLivraison();

    /*
     * LE FILTRE SUR LA PORTEE EST INDISPENSABLE, et son absence a fait rougir
     * ce test a juste titre : la commande porte deja un jeton `DOCUMENT` et un
     * jeton `RETRACTATION`, poses par la confirmation de paiement. Compter TOUS
     * les jetons de la commande mesurait autre chose que ce que le test annonce.
     */
    const { rows } = await client.query<{ portee: string }>(
      `SELECT portee FROM jeton_acces
       WHERE commande_id = $1 AND portee = 'AVIS'::"PorteeJeton"`,
      [commandeId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.portee).toBe("AVIS");
  });
});

describe("depot d'un avis, criteres 2 et 6", () => {
  it("depose l'avis et consomme le jeton dans la meme transaction", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);

    expect(etat.statut).toBe("OUVERT");
    if (etat.statut !== "OUVERT") return;

    const issue = await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 5,
        commentaire: "Une très jolie pièce, conforme aux photographies.",
      },
    ]);

    expect(issue).toEqual({ statut: "DEPOSE", nombre: 1 });
    expect(await compterAvis(commandeId)).toBe(1);

    const jeton = await lireJetonDuLien(valeur);
    expect(jeton.utilise_a).not.toBeNull();

    /*
     * `revoqueA` RESTE NUL, regle L10. Un jeton consomme n'est pas un jeton
     * revoque : les confondre ferait afficher « lien remplace » a un client
     * qui vient de deposer son avis.
     */
    expect(jeton.revoque_a).toBeNull();
  });

  it("un rejeu du meme lien ne cree pas de second avis, critere 2", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    const saisie = {
      ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
      note: 4,
      commentaire: null,
    };

    await deposerAvis(valeur, [saisie]);
    const rejeu = await deposerAvis(valeur, [saisie]);

    expect(rejeu.statut).toBe("DEJA_DEPOSE");

    /*
     * LE COMPTE EST L'ASSERTION QUI COMPTE. Un service qui ecrirait le second
     * avis puis rendrait « deja depose » passerait une assertion de statut :
     * c'est exactement le defaut que le point 7 existe pour fermer.
     */
    expect(await compterAvis(commandeId)).toBe(1);
  });

  it("deux depots concurrents ne creent qu'un seul avis, critere 6", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    const saisie = {
      ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
      note: 5,
      commentaire: null,
    };

    /*
     * LES DEUX PARTENT ENSEMBLE, sans `await` intercalaire : les deux passent
     * `resoudreJeton`, qui lit avant d'ecrire, et la course se joue sur la
     * clause `utiliseA: null` du repository. Un test sequentiel mesurerait le
     * rejeu, pas la concurrence.
     */
    const [a, b] = await Promise.all([
      deposerAvis(valeur, [saisie]),
      deposerAvis(valeur, [saisie]),
    ]);

    const deposes = [a, b].filter((issue) => issue.statut === "DEPOSE");

    expect(deposes).toHaveLength(1);
    expect(await compterAvis(commandeId)).toBe(1);
  });

  it("refuse une ligne de commande qui n'appartient pas au jeton", async () => {
    const premiere = await commanderEtPayer();
    const seconde = await commanderEtPayer(1, "autre-client@exemple.fr");
    await marquerLivree(premiere.commandeId);
    await marquerLivree(seconde.commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(premiere.commandeId);

    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM ligne_commande WHERE commande_id = $1",
      [seconde.commandeId],
    );

    /*
     * LE DEFAUT QUE CE TEST FERME : `ligneCommandeId` arrive du formulaire,
     * donc d'une entree non fiable. Sans recoupement avec les invitations de
     * la commande du jeton, un client deposerait un avis sur l'achat d'un
     * tiers en changeant une valeur de champ cache, invariant 2.
     */
    const issue = await deposerAvis(valeur, [
      { ligneCommandeId: rows[0]!.id, note: 1, commentaire: "Injection" },
    ]);

    expect(issue.statut).toBe("REFUSE_PIECE_INCONNUE");
    expect(await compterAvis(seconde.commandeId)).toBe(0);
  });

  it("refuse un jeton d'une autre portee, regle L6", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);

    const jeton = engendrerJeton();
    await client.query(
      `INSERT INTO jeton_acces (id, commande_id, empreinte, portee, expire_a)
       VALUES ($1, $2, $3, 'DOCUMENT'::"PorteeJeton", now() + interval '30 days')`,
      [randomUUID(), commandeId, empreinteJeton(jeton.valeur)],
    );

    const etat = await lireEtatDepot(jeton.valeur);

    expect(etat.statut).toBe("INDISPONIBLE");
  });

  it("refuse une valeur forgee sans toucher la base", async () => {
    const etat = await lireEtatDepot("valeur-inventee.signature-fausse");

    expect(etat.statut).toBe("INDISPONIBLE");
  });

  it("ecrit experienceA depuis livreA et jamais depuis l'horloge", async () => {
    const { commandeId } = await commanderEtPayer();

    /*
     * UNE DATE FRANCHEMENT PASSEE, ET C'EST CE QUI REND L'ASSERTION REELLE. Une
     * date proche de maintenant serait indistinguable de `new Date()` : le test
     * passerait sur une implementation qui date l'avis au jour de la saisie, ce
     * que l'article D111-10 interdit.
     */
    const livreA = new Date("2026-08-01T10:00:00.000Z");
    await marquerLivree(commandeId, livreA);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 5,
        commentaire: null,
      },
    ]);

    const { rows } = await client.query<{ experience_a: Date }>(
      `SELECT a.experience_a FROM avis a
       JOIN ligne_commande l ON l.id = a.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    expect(rows[0]!.experience_a.toISOString()).toBe(livreA.toISOString());
  });

  it("depose l'avis au statut DEPOSE, jamais publie d'emblee, regle R4", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 5,
        commentaire: null,
      },
    ]);

    const { rows } = await client.query<{
      statut: string;
      publie_a: Date | null;
    }>(
      `SELECT a.statut, a.publie_a FROM avis a
       JOIN ligne_commande l ON l.id = a.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    expect(rows[0]!.statut).toBe("DEPOSE");
    expect(rows[0]!.publie_a).toBeNull();
  });
});

describe("commande a plusieurs pieces, defauts de la revue critique", () => {
  /**
   * Ouvre une commande a deux pieces, livree et invitee, et rend son lien.
   *
   * DEUX PIECES ET NON UNE, ET C'EST TOUT L'OBJET DE CE BLOC. Les quatre
   * defauts trouves par la revue critique du 11 septembre 2026 vivent
   * exactement dans l'ecart entre « une piece » et « plusieurs » : les cinq
   * mutations jouees la veille s'exerçaient toutes sur des commandes a une
   * seule ligne, ou `retenues.length` vaut toujours le nombre total de pieces.
   * Elles seraient toutes restees vertes sur ces quatre defauts.
   */
  async function commandeDeuxPiecesInvitee(): Promise<{
    commandeId: string;
    valeur: string;
    lignes: string[];
  }> {
    const { commandeId } = await commanderEtPayer(2);
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    return {
      commandeId,
      valeur,
      lignes: etat.pieces.map((piece) => piece.ligneCommandeId),
    };
  }

  it("laisse revenir noter la seconde piece apres un depot partiel", async () => {
    const { commandeId, valeur, lignes } = await commandeDeuxPiecesInvitee();

    const premier = await deposerAvis(valeur, [
      { ligneCommandeId: lignes[0]!, note: 5, commentaire: null },
    ]);

    expect(premier).toEqual({ statut: "DEPOSE", nombre: 1 });

    /*
     * LE JETON N'EST PAS CONSOMME, et c'est la propriete que ce test fixe. Le
     * defaut mesure par la revue : il l'etait, donc le client revenant deux
     * jours plus tard lisait « un avis a deja ete depose pour cette commande »
     * alors que sa seconde piece n'etait pas notee, et le devenait DEFINITIVEMENT
     * innotable, aucun autre chemin d'ecriture n'existant.
     */
    const jeton = await lireJetonDuLien(valeur);
    expect(jeton.utilise_a).toBeNull();

    const retour = await lireEtatDepot(valeur);
    expect(retour.statut).toBe("OUVERT");

    const second = await deposerAvis(valeur, [
      { ligneCommandeId: lignes[1]!, note: 4, commentaire: null },
    ]);

    expect(second).toEqual({ statut: "DEPOSE", nombre: 1 });
    expect(await compterAvis(commandeId)).toBe(2);

    /* LA COMMANDE ENTIEREMENT NOTEE CONSOMME ENFIN LE JETON. */
    const apres = await lireJetonDuLien(valeur);
    expect(apres.utilise_a).not.toBeNull();
  });

  it("consomme le jeton quand toutes les pieces sont notees d'un coup", async () => {
    const { commandeId, valeur, lignes } = await commandeDeuxPiecesInvitee();

    const issue = await deposerAvis(
      valeur,
      lignes.map((ligneCommandeId) => ({
        ligneCommandeId,
        note: 5,
        commentaire: null,
      })),
    );

    expect(issue).toEqual({ statut: "DEPOSE", nombre: 2 });
    expect(await compterAvis(commandeId)).toBe(2);

    const jeton = await lireJetonDuLien(valeur);
    expect(jeton.utilise_a).not.toBeNull();
  });

  it("ne perd pas les avis sinceres d'un envoi portant une ligne repetee", async () => {
    const { commandeId, valeur, lignes } = await commandeDeuxPiecesInvitee();

    /*
     * LE DEFAUT MESURE PAR LA REVUE : la ligne repetee faisait lever `P2002`
     * DANS la transaction, qui etait annulee en entier. Trois saisies, deux
     * sinceres, ZERO avis ecrit, et le client lisait « avis deja depose » sur
     * un avis qui n'existait pas. `schemaDepotAvis` accepte vingt entrees sans
     * contrainte d'unicite, donc rien en amont ne filtre.
     */
    const issue = await deposerAvis(valeur, [
      { ligneCommandeId: lignes[0]!, note: 5, commentaire: "Avis sincère 1" },
      { ligneCommandeId: lignes[1]!, note: 4, commentaire: "Avis sincère 2" },
      { ligneCommandeId: lignes[0]!, note: 1, commentaire: "Doublon" },
    ]);

    expect(issue).toEqual({ statut: "DEPOSE", nombre: 2 });
    expect(await compterAvis(commandeId)).toBe(2);

    /* LA PREMIERE SAISIE L'EMPORTE, celle que l'ecran a rendue en premier. */
    const { rows } = await client.query<{ note: number }>(
      "SELECT note FROM avis WHERE ligne_commande_id = $1",
      [lignes[0]!],
    );

    expect(rows[0]!.note).toBe(5);
  });

  it("ne renvoie pas d'email quand un cycle rattrape une ligne oubliee", async () => {
    const { commandeId, lignes } = await commandeDeuxPiecesInvitee();

    /*
     * L'ETAT QUE LA REVUE A MESURE : le premier email est parti, donc sa ligne
     * `envoi_en_attente` est passee a `ENVOYE`, et l'unicite partielle
     * `envoi_en_attente_actif_unique` ne la voit plus. Une invitation qui
     * manque ensuite fait rentrer la commande dans le cycle suivant.
     */
    await client.query(
      `UPDATE envoi_en_attente SET statut = 'ENVOYE'::"StatutEnvoi"
       WHERE commande_id = $1 AND modele = 'invitation-avis'`,
      [commandeId],
    );

    await client.query(
      "DELETE FROM invitation_avis WHERE ligne_commande_id = $1",
      [lignes[1]!],
    );

    const issue = await inviterApresLivraison();

    expect(issue.invitees).toBe(1);

    const { rows } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM envoi_en_attente
       WHERE commande_id = $1 AND modele = 'invitation-avis'`,
      [commandeId],
    );

    /*
     * UNE SEULE LIGNE D'ENVOI, celle deja partie. Sans la correction, le client
     * recevait DEUX fois la meme sollicitation pour la meme commande.
     */
    expect(Number(rows[0]!.nombre)).toBe(1);

    /* L'INVITATION MANQUANTE EST BIEN RATTRAPEE, elle. */
    const { rows: invitations } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM invitation_avis i
       JOIN ligne_commande l ON l.id = i.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    expect(Number(invitations[0]!.nombre)).toBe(2);
  });
});

describe("jeton revoque, criteres 3 et 4", () => {
  it("distingue un lien remplace d'un avis deja depose", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);

    await client.query(
      `UPDATE jeton_acces SET revoque_a = now()
       WHERE commande_id = $1 AND portee = 'AVIS'::"PorteeJeton"`,
      [commandeId],
    );

    const etat = await lireEtatDepot(valeur);

    /*
     * CRITERE 4, ET IL N'EST PAS COSMETIQUE. Un jeton revoque correspond a un
     * client LEGITIME dont le lien a ete remplace par un renvoi : lui afficher
     * « avis deja depose » lui ferait croire qu'il a ecrit quelque chose, et
     * lui afficher un refus generique le laisserait sans recours alors qu'un
     * email plus recent l'attend.
     */
    expect(etat.statut).toBe("LIEN_REMPLACE");

    const depot = await deposerAvis(valeur, [
      { ligneCommandeId: randomUUID(), note: 5, commentaire: null },
    ]);

    expect(depot.statut).toBe("LIEN_REMPLACE");
    expect(await compterAvis(commandeId)).toBe(0);
  });

  it("un ancien lien revoque n'ecrit rien, critere 3", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const ancienne = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(ancienne);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");
    const ligneCommandeId = etat.pieces[0]!.ligneCommandeId;

    await client.query(
      `UPDATE jeton_acces SET revoque_a = now()
       WHERE commande_id = $1 AND portee = 'AVIS'::"PorteeJeton"`,
      [commandeId],
    );

    const depot = await deposerAvis(ancienne, [
      { ligneCommandeId, note: 1, commentaire: "Depose par le mauvais lien" },
    ]);

    expect(depot.statut).toBe("LIEN_REMPLACE");
    expect(await compterAvis(commandeId)).toBe(0);
  });

  it("un jeton expire refuse le depot, regle L9", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);

    await client.query(
      `UPDATE jeton_acces SET expire_a = now() - interval '1 day'
       WHERE commande_id = $1 AND portee = 'AVIS'::"PorteeJeton"`,
      [commandeId],
    );

    const etat = await lireEtatDepot(valeur);

    expect(etat.statut).toBe("INDISPONIBLE");
  });
});

describe("moderation, regles R4, R5, R7 et R9", () => {
  async function deposerUnAvis(): Promise<{
    commandeId: string;
    avisId: string;
  }> {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 5,
        commentaire: "Très satisfait de cet achat.",
      },
    ]);

    const { rows } = await client.query<{ id: string }>(
      `SELECT a.id FROM avis a
       JOIN ligne_commande l ON l.id = a.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    return { commandeId, avisId: rows[0]!.id };
  }

  it("un avis depose n'est jamais visible publiquement, regle R4", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 5,
        commentaire: null,
      },
    ]);

    const { rows } = await client.query<{ variante_id: string }>(
      "SELECT variante_id FROM ligne_commande WHERE commande_id = $1",
      [commandeId],
    );

    const publies = await lireAvisPublies([rows[0]!.variante_id]);

    expect(publies).toHaveLength(0);
  });

  it("refuse un retrait sans motif, regle R5", async () => {
    const { avisId } = await deposerUnAvis();

    const issue = await modererAvis({
      avisId,
      statut: "RETIRE",
      motifDecision: null,
    });

    expect(issue.statut).toBe("REFUSE_MOTIF_MANQUANT");

    const { rows } = await client.query<{ statut: string }>(
      "SELECT statut FROM avis WHERE id = $1",
      [avisId],
    );

    /*
     * L'AVIS N'A PAS BOUGE. Un service qui refuserait apres avoir ecrit
     * passerait l'assertion de statut de retour.
     */
    expect(rows[0]!.statut).toBe("DEPOSE");
  });

  it("publie un avis, ecrit publieA et decideA ensemble, regle R9", async () => {
    const { commandeId, avisId } = await deposerUnAvis();

    const issue = await modererAvis({
      avisId,
      statut: "PUBLIE",
      motifDecision: null,
    });

    expect(issue.statut).toBe("APPLIQUEE");

    const { rows } = await client.query<{
      statut: string;
      publie_a: Date | null;
      decide_a: Date | null;
    }>("SELECT statut, publie_a, decide_a FROM avis WHERE id = $1", [avisId]);

    expect(rows[0]!.statut).toBe("PUBLIE");
    expect(rows[0]!.publie_a).not.toBeNull();
    expect(rows[0]!.decide_a).not.toBeNull();

    const { rows: lignes } = await client.query<{ variante_id: string }>(
      "SELECT variante_id FROM ligne_commande WHERE commande_id = $1",
      [commandeId],
    );

    const publies = await lireAvisPublies([lignes[0]!.variante_id]);

    expect(publies).toHaveLength(1);
    expect(publies[0]!.note).toBe(5);
  });

  it("une republication n'efface pas le motif du retrait precedent", async () => {
    const { avisId } = await deposerUnAvis();

    await modererAvis({ avisId, statut: "PUBLIE", motifDecision: null });
    await modererAvis({
      avisId,
      statut: "RETIRE",
      motifDecision: "Contenu sans rapport avec la pièce.",
    });
    await modererAvis({ avisId, statut: "PUBLIE", motifDecision: null });

    const { rows } = await client.query<{ motif_decision: string | null }>(
      "SELECT motif_decision FROM avis WHERE id = $1",
      [avisId],
    );

    /*
     * LE MOTIF SURVIT A LA REPUBLICATION, defaut mesure par la revue critique
     * du 11 septembre 2026. Il etait ecrit inconditionnellement : une
     * republication, qui n'a legitimement aucun motif a porter, ecrasait par
     * `null` la SEULE trace de la raison du retrait, que la regle R5 existe
     * pour exiger.
     *
     * L'ASYMETRIE AVEC `publieA` ETAIT LE PIEGE : les deux colonnes sont
     * ecrites par la meme fonction, l'une protegee par sa clause et l'autre
     * pas. Muter la clause protegee ne revele jamais l'absence de protection
     * sur la voisine, motif « regle a deux versants ».
     */
    expect(rows[0]!.motif_decision).toBe("Contenu sans rapport avec la pièce.");
  });

  it("une republication garde la date de premiere publication, regle R7", async () => {
    const { avisId } = await deposerUnAvis();

    await modererAvis({ avisId, statut: "PUBLIE", motifDecision: null });

    const { rows: premiere } = await client.query<{ publie_a: Date }>(
      "SELECT publie_a FROM avis WHERE id = $1",
      [avisId],
    );

    await modererAvis({
      avisId,
      statut: "RETIRE",
      motifDecision: "Retiré à la demande de l'auteur.",
    });
    await modererAvis({ avisId, statut: "PUBLIE", motifDecision: null });

    const { rows: seconde } = await client.query<{ publie_a: Date }>(
      "SELECT publie_a FROM avis WHERE id = $1",
      [avisId],
    );

    /*
     * LA DATE NE BOUGE PAS, regle R7. Sans la clause `publieA: null`, chaque
     * republication rajeunirait l'avis et fausserait le classement
     * chronologique que l'article D111-10 impose d'annoncer.
     */
    expect(seconde[0]!.publie_a.toISOString()).toBe(
      premiere[0]!.publie_a.toISOString(),
    );
  });

  it("un avis retire cesse d'etre visible, sans etre supprime, regle R6", async () => {
    const { commandeId, avisId } = await deposerUnAvis();

    await modererAvis({ avisId, statut: "PUBLIE", motifDecision: null });
    await modererAvis({
      avisId,
      statut: "RETIRE",
      motifDecision: "Contenu sans rapport avec la pièce.",
    });

    const { rows: lignes } = await client.query<{ variante_id: string }>(
      "SELECT variante_id FROM ligne_commande WHERE commande_id = $1",
      [commandeId],
    );

    expect(await lireAvisPublies([lignes[0]!.variante_id])).toHaveLength(0);

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM avis WHERE id = $1",
      [avisId],
    );

    expect(Number(rows[0]!.nombre)).toBe(1);
  });

  it("la file de moderation ne porte que les avis a relire", async () => {
    const { avisId } = await deposerUnAvis();

    expect(await listerAvisAModerer()).toHaveLength(1);

    await modererAvis({ avisId, statut: "PUBLIE", motifDecision: null });

    expect(await listerAvisAModerer()).toHaveLength(0);
  });
});

describe("signalement d'un avis, LS-77, article L111-7-2", () => {
  /**
   * Depose un avis et le PUBLIE, seul etat ou il est signalable.
   *
   * LA PUBLICATION EST INDISPENSABLE : un avis `DEPOSE` est deliberement
   * introuvable pour le formulaire de signalement, sans quoi celui-ci
   * deviendrait un oracle sur la file de moderation.
   */
  async function avisPublie(): Promise<string> {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 5,
        commentaire: "Un avis dont on va douter.",
      },
    ]);

    const { rows } = await client.query<{ id: string }>(
      `SELECT a.id FROM avis a
       JOIN ligne_commande l ON l.id = a.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    await modererAvis({
      avisId: rows[0]!.id,
      statut: "PUBLIE",
      motifDecision: null,
    });

    return rows[0]!.id;
  }

  /** Une saisie valide, dont le delai anti-robot est deja ecoule. */
  function saisieValide(avisId: string) {
    return {
      avisId,
      qualite: "Créatrice de la pièce concernée",
      email: "tiers@exemple.fr",
      motif: "Cette pièce est une de mes créations, cet avis me semble faux.",
      piege: "",
      ouvertA: Date.now() - 10_000,
    };
  }

  it("enregistre un signalement motive sur un avis publie", async () => {
    const avisId = await avisPublie();

    const issue = await signalerAvis({
      saisie: saisieValide(avisId),
      adresseIp: "203.0.113.10",
    });

    expect(issue.statut).toBe("ENREGISTRE");

    const { rows } = await client.query<{ statut: string; motif: string }>(
      "SELECT statut, motif FROM signalement_avis WHERE avis_id = $1",
      [avisId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.statut).toBe("NOUVEAU");
  });

  it("ne depublie pas l'avis signale", async () => {
    const avisId = await avisPublie();

    await signalerAvis({
      saisie: saisieValide(avisId),
      adresseIp: "203.0.113.11",
    });

    const { rows } = await client.query<{ statut: string }>(
      "SELECT statut FROM avis WHERE id = $1",
      [avisId],
    );

    /*
     * LA PROPRIETE LA PLUS IMPORTANTE DE CETTE FONCTIONNALITE. Un signalement
     * n'est pas une decision de moderation : depublier automatiquement ferait
     * de ce formulaire PUBLIC un moyen de retirer les avis d'un concurrent.
     */
    expect(rows[0]!.statut).toBe("PUBLIE");
  });

  it("refuse un signalement sur un avis non publie, sans reveler son existence", async () => {
    const { commandeId } = await commanderEtPayer();
    await marquerLivree(commandeId);
    await inviterApresLivraison();

    const valeur = await valeurJetonDeCommande(commandeId);
    const etat = await lireEtatDepot(valeur);
    if (etat.statut !== "OUVERT") throw new Error("etat inattendu");

    await deposerAvis(valeur, [
      {
        ligneCommandeId: etat.pieces[0]!.ligneCommandeId,
        note: 2,
        commentaire: null,
      },
    ]);

    const { rows } = await client.query<{ id: string }>(
      `SELECT a.id FROM avis a
       JOIN ligne_commande l ON l.id = a.ligne_commande_id
       WHERE l.commande_id = $1`,
      [commandeId],
    );

    const issue = await signalerAvis({
      saisie: saisieValide(rows[0]!.id),
      adresseIp: "203.0.113.12",
    });

    /*
     * MEME REPONSE QU'UN IDENTIFIANT INCONNU, et c'est voulu. Distinguer les
     * deux confirmerait qu'un avis existe a quelqu'un qui n'a pas pu le lire.
     */
    expect(issue.statut).toBe("AVIS_INTROUVABLE");

    const { rows: signalements } = await client.query(
      "SELECT 1 FROM signalement_avis WHERE avis_id = $1",
      [rows[0]!.id],
    );

    expect(signalements).toHaveLength(0);
  });

  it("refuse un motif vide, la loi conditionnant le signalement a sa motivation", async () => {
    const avisId = await avisPublie();

    const issue = await signalerAvis({
      saisie: { ...saisieValide(avisId), motif: "   " },
      adresseIp: "203.0.113.13",
    });

    expect(issue.statut).toBe("INVALIDE");

    const { rows } = await client.query(
      "SELECT 1 FROM signalement_avis WHERE avis_id = $1",
      [avisId],
    );

    expect(rows).toHaveLength(0);
  });

  it("ecarte une soumission instantanee sans le dire au robot", async () => {
    const avisId = await avisPublie();

    const issue = await signalerAvis({
      saisie: { ...saisieValide(avisId), ouvertA: Date.now() },
      adresseIp: "203.0.113.14",
    });

    /*
     * `ENREGISTRE` ET NON UN REFUS : dire « refuse » a un robot lui apprend
     * l'existence de la couche. Rien n'est ecrit pour autant.
     */
    expect(issue.statut).toBe("ENREGISTRE");

    const { rows } = await client.query(
      "SELECT 1 FROM signalement_avis WHERE avis_id = $1",
      [avisId],
    );

    expect(rows).toHaveLength(0);
  });

  it("ecarte un champ piege rempli sans le dire au robot", async () => {
    const avisId = await avisPublie();

    const issue = await signalerAvis({
      saisie: { ...saisieValide(avisId), piege: "rempli par un script" },
      adresseIp: "203.0.113.15",
    });

    expect(issue.statut).toBe("ENREGISTRE");

    const { rows } = await client.query(
      "SELECT 1 FROM signalement_avis WHERE avis_id = $1",
      [avisId],
    );

    expect(rows).toHaveLength(0);
  });

  it("plafonne les signalements d'une meme adresse", async () => {
    const avisId = await avisPublie();
    const adresseIp = "203.0.113.16";

    for (let index = 0; index < 3; index += 1) {
      const issue = await signalerAvis({
        saisie: saisieValide(avisId),
        adresseIp,
      });
      expect(issue.statut).toBe("ENREGISTRE");
    }

    const quatrieme = await signalerAvis({
      saisie: saisieValide(avisId),
      adresseIp,
    });

    expect(quatrieme.statut).toBe("TROP_DE_SIGNALEMENTS");

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM signalement_avis WHERE avis_id = $1",
      [avisId],
    );

    expect(Number(rows[0]!.nombre)).toBe(3);
  });

  it("clot un signalement en ecrivant statut et date ensemble, C43", async () => {
    const avisId = await avisPublie();

    await signalerAvis({
      saisie: saisieValide(avisId),
      adresseIp: "203.0.113.17",
    });

    const enAttente = await listerSignalementsAExaminer();
    expect(enAttente).toHaveLength(1);
    expect(enAttente[0]!.noteAvis).toBe(5);

    const issue = await cloturerSignalementAvis({
      signalementId: enAttente[0]!.id,
      statut: "ECARTE",
      suiteDonnee: "Achat vérifié, l'avis est authentique.",
    });

    expect(issue.statut).toBe("APPLIQUEE");

    const { rows } = await client.query<{
      statut: string;
      examine_a: Date | null;
      suite_donnee: string | null;
    }>(
      "SELECT statut, examine_a, suite_donnee FROM signalement_avis WHERE id = $1",
      [enAttente[0]!.id],
    );

    expect(rows[0]!.statut).toBe("ECARTE");
    expect(rows[0]!.examine_a).not.toBeNull();
    expect(await listerSignalementsAExaminer()).toHaveLength(0);
  });

  it("une seconde cloture n'efface pas la suite donnee ni la date", async () => {
    const avisId = await avisPublie();

    await signalerAvis({
      saisie: saisieValide(avisId),
      adresseIp: "203.0.113.18",
    });

    const [signalement] = await listerSignalementsAExaminer();

    await cloturerSignalementAvis({
      signalementId: signalement!.id,
      statut: "ECARTE",
      suiteDonnee: "Achat vérifié.",
    });

    const { rows: premiere } = await client.query<{ examine_a: Date }>(
      "SELECT examine_a FROM signalement_avis WHERE id = $1",
      [signalement!.id],
    );

    await cloturerSignalementAvis({
      signalementId: signalement!.id,
      statut: "RETENU",
      suiteDonnee: null,
    });

    const { rows: seconde } = await client.query<{
      examine_a: Date;
      suite_donnee: string | null;
    }>("SELECT examine_a, suite_donnee FROM signalement_avis WHERE id = $1", [
      signalement!.id,
    ]);

    /*
     * DEUX PROPRIETES ENSEMBLE, et la seconde vient du defaut mesure sur la
     * moderation le 11 septembre 2026 : `examineA` porte le PREMIER examen, et
     * une cloture sans suite n'efface pas celle qui existait.
     */
    expect(seconde[0]!.examine_a.toISOString()).toBe(
      premiere[0]!.examine_a.toISOString(),
    );
    expect(seconde[0]!.suite_donnee).toBe("Achat vérifié.");
  });
});
