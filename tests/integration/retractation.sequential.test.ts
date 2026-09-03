/**
 * DEPOT D'UNE DEMANDE DE RETRACTATION, LS-134. Parcours 5, etapes 1 a 5.
 *
 * CE QUI SE JOUE ICI EST UN DROIT LEGAL, et il penche toujours du meme cote :
 * l'article L221-20 punit l'information incorrecte sur le droit de retractation
 * par un delai porte a DOUZE MOIS. Une demande legitime refusee coute donc
 * infiniment plus qu'une demande douteuse acceptee, et les tests d'etat le
 * verifient dans ce sens.
 *
 * LES QUATRE CONDITIONS DU JETON SE TESTENT SEPAREMENT, regle L9 et critere 5.
 * Modifie, expire, consomme, revoque : chacune a son test, et le piege
 * documente est de ne verifier que l'expiration, ce qui laisse utilisable
 * jusqu'a son terme un lien parti sur une adresse erronee.
 *
 * LE REFUS D'ACCES EST INDISCERNABLE, comme LS-132 : les cinq refus rendent la
 * MEME chose, sans quoi la route devient un oracle revelant qu'une commande
 * existe. Les refus METIER sont distincts, eux, le client ayant deja prouve son
 * droit d'acces quand ils surviennent.
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
let deposerRetractation: typeof import("@/services/retractation").deposerRetractation;
let lireEtatRetractation: typeof import("@/services/retractation").lireEtatRetractation;
let engendrerJeton: typeof import("@/lib/jeton-acces").engendrerJeton;

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

/**
 * Passe et confirme une commande PAR LES SERVICES, jamais par un `INSERT`.
 *
 * Reproduire la mecanique a la main verifierait la reproduction et non le
 * service, piege rencontre sur ce projet le 25 aout 2026.
 */
async function commanderEtConfirmer(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  const evenement = evenementReussi(issue.commandeId);

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  return issue.commandeId;
}

/**
 * Pose une expedition livree, ce que LS-131 fera en production.
 *
 * `livreA` EST LE SEUL DECLENCHEUR, article L221-18 : c'est la remise au
 * destinataire qui fait courir le delai, jamais l'expedition.
 */
async function poserLivraison(
  commandeId: string,
  livreA: Date | null,
): Promise<void> {
  await client.query(
    `INSERT INTO expedition (id, commande_id, transporteur, mode, expedie_a, livre_a, cree_a)
     VALUES ($1, $2, 'Mondial Relay', 'DOMICILE'::"ModeLivraison", now(), $3, now())`,
    [randomUUID(), commandeId, livreA],
  );

  await client.query(
    `UPDATE commande SET statut = 'LIVREE'::"StatutCommande" WHERE id = $1`,
    [commandeId],
  );
}

/**
 * Le jeton en base pour une commande, tel que la production l'ecrira.
 *
 * LA VALEUR EN CLAIR N'EXISTE PAS EN BASE, regle L5 : ce test l'engendre et
 * pose son empreinte, ce qui est exactement ce que fait le code de production.
 */
async function poserJeton(
  commandeId: string,
  options: {
    expireA?: Date;
    utiliseA?: Date | null;
    revoqueA?: Date | null;
    portee?: string;
  } = {},
): Promise<string> {
  const jeton = engendrerJeton();

  await client.query(
    `INSERT INTO jeton_acces (id, commande_id, empreinte, portee, expire_a, utilise_a, revoque_a)
     VALUES ($1, $2, $3, $4::"PorteeJeton", $5, $6, $7)`,
    [
      randomUUID(),
      commandeId,
      jeton.empreinte,
      options.portee ?? "RETRACTATION",
      options.expireA ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      options.utiliseA ?? null,
      options.revoqueA ?? null,
    ],
  );

  return jeton.valeur;
}

/** Une reception qui laisse le delai grand ouvert. */
function receptionRecente(): Date {
  return new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
}

/** Une reception assez ancienne pour que les quatorze jours soient passes. */
function receptionAncienne(): Date {
  return new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ deposerRetractation, lireEtatRetractation } =
    await import("@/services/retractation"));
  ({ engendrerJeton } = await import("@/lib/jeton-acces"));
});

afterEach(async () => {
  await client.query("DELETE FROM envoi_en_attente");
  await client.query("DELETE FROM demande_retractation");
  await client.query("DELETE FROM jeton_acces");
  await client.query("DELETE FROM expedition");
});

afterAll(async () => {
  await client.end();
});

describe("depot par jeton signe, le cas sans compte", () => {
  /* CRITERE 1. */
  it("depose une demande sans compte, par jeton signe", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: "La chaine est trop courte" },
    );

    expect(issue.statut).toBe("DEPOSEE");
  });

  /*
   * CRITERE 2. LE MOTIF EST FACULTATIF, le droit etant INCONDITIONNEL, article
   * L221-18. Exiger un motif le conditionnerait.
   */
  it("accepte une demande sans motif", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("DEPOSEE");

    const { rows } = await client.query<{ motif_client: string | null }>(
      "SELECT motif_client FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows[0]?.motif_client).toBeNull();
  });

  /* Une saisie vide vaut `null`, jamais la chaine vide : deux representations
   * de « rien » feraient diverger l'affichage cote administration. */
  it("range une saisie vide en motif absent", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: "   " },
    );

    const { rows } = await client.query<{ motif_client: string | null }>(
      "SELECT motif_client FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows[0]?.motif_client).toBeNull();
  });

  /*
   * CRITERE 3. `DEPOSEE` avec `deposeeA` horodatee, et l'accuse depose dans
   * l'outbox. LE STATUT RESTE `DEPOSEE` ICI, `ACCUSEE` appartenant a l'envoi
   * reel : l'affirmer avant que le message parte serait une trace fausse.
   */
  it("cree la demande en DEPOSEE et depose l'accuse dans l'outbox", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    const demande = await client.query<{
      statut: string;
      deposee_a: Date | null;
    }>(
      "SELECT statut, deposee_a FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(demande.rows[0]?.statut).toBe("DEPOSEE");
    expect(demande.rows[0]?.deposee_a).not.toBeNull();

    const envoi = await client.query<{ modele: string; statut: string }>(
      "SELECT modele, statut FROM envoi_en_attente WHERE commande_id = $1",
      [commandeId],
    );

    expect(envoi.rows[0]?.modele).toBe("retractation-accusee");
    expect(envoi.rows[0]?.statut).toBe("EN_ATTENTE");
  });

  /*
   * CRITERE 7, LA PANNE D'EMAIL. La demande est PERSISTEE AVANT tout envoi :
   * ce test ne simule aucune panne SMTP parce que le service n'appelle jamais
   * le fournisseur. L'intention est deposee dans la transaction, donc l'accuse
   * reste rejouable indefiniment et la declaration n'est jamais perdue.
   *
   * C'est la propriete structurelle qui remplace la simulation : il n'y a rien
   * a faire tomber, l'appel reseau n'existe pas sur ce chemin.
   */
  it("ne perd jamais la declaration, aucun appel au fournisseur sur ce chemin", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    // La demande ET son intention d'envoi existent ensemble, ou aucune des deux.
    const demandes = await client.query(
      "SELECT 1 FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );
    const envois = await client.query(
      "SELECT 1 FROM envoi_en_attente WHERE commande_id = $1",
      [commandeId],
    );

    expect(demandes.rowCount).toBe(1);
    expect(envois.rowCount).toBe(1);

    // Aucune ligne de journal d'envoi : rien n'est parti, tout est rejouable.
    const journal = await client.query(
      "SELECT 1 FROM journal_email WHERE commande_id = $1",
      [commandeId],
    );

    expect(journal.rowCount).toBe(0);
  });

  /* Le jeton est consomme, regle L9 et L10 : le lien ne sert pas deux fois. */
  it("consomme le jeton dans la transaction du depot", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    /*
     * LA PORTEE EST DANS LA CLAUSE, ET C'EST LE POINT DU TEST. La confirmation
     * de paiement emet DEJA un jeton `DOCUMENT` pour la facture, LS-132 : une
     * commande en porte donc deux, et lire « le premier jeton de la commande »
     * tombait sur celui de la facture, jamais consomme. Le test echouait sur un
     * code pourtant correct, et sa premiere version accusait le service.
     */
    const consomme = await client.query<{ utilise_a: Date | null }>(
      `SELECT utilise_a FROM jeton_acces
       WHERE commande_id = $1 AND portee = 'RETRACTATION'::"PorteeJeton"`,
      [commandeId],
    );

    expect(consomme.rowCount).toBe(1);
    expect(consomme.rows[0]?.utilise_a).not.toBeNull();

    /*
     * ET LE JETON DE FACTURE RESTE INTACT, regle L6 : consommer la retractation
     * ne doit pas fermer l'acces au document, qui est une consultation
     * repetable. Sans cette assertion, une consommation trop large passerait.
     */
    const document = await client.query<{ utilise_a: Date | null }>(
      `SELECT utilise_a FROM jeton_acces
       WHERE commande_id = $1 AND portee = 'DOCUMENT'::"PorteeJeton"`,
      [commandeId],
    );

    expect(document.rows[0]?.utilise_a).toBeNull();
  });
});

/*
 * CRITERE 5, LE TEST NEGATIF DE SECURITE. Les quatre conditions separement,
 * plus la portee et le numero de commande nu.
 */
describe("les quatre conditions du jeton, testees separement", () => {
  it("refuse un jeton dont la signature ne tient pas, regle L9 modifie", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    // Un caractere change, la signature ne verifie plus.
    const falsifie = `${valeur.slice(0, -1)}${valeur.endsWith("a") ? "b" : "a"}`;

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: falsifie },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_ACCES");
  });

  it("refuse un jeton expire", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId, {
      expireA: new Date(Date.now() - 1000),
    });

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_ACCES");
  });

  it("refuse un jeton deja consomme", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId, { utiliseA: new Date() });

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_ACCES");
  });

  /*
   * LE CAS QUE LE PIEGE DOCUMENTE VISE : un lien parti sur une adresse erronee
   * est revoque mais NON expire. Ne verifier que l'expiration le laisserait
   * utilisable jusqu'a son terme.
   */
  it("refuse un jeton revoque bien qu'il ne soit pas expire", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId, { revoqueA: new Date() });

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_ACCES");
  });

  /* Regle L6, moindre privilege : un jeton de facture n'ouvre pas ce chemin. */
  it("refuse un jeton de portee DOCUMENT", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId, { portee: "DOCUMENT" });

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_ACCES");
  });

  /*
   * REGLE L4, LE COEUR DU CRITERE 5 : un numero de commande seul n'identifie
   * jamais un contrat. Le type `PreuveAcces` rend meme impossible de passer un
   * identifiant nu, mais le test le verifie par le chemin qui s'en approche le
   * plus, une session qui n'est pas proprietaire.
   */
  it("refuse une session qui n'est pas proprietaire de la commande", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());

    const issue = await deposerRetractation(
      {
        voie: "SESSION",
        utilisateurId: randomUUID(),
        commandeId,
      },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_ACCES");

    const { rowCount } = await client.query(
      "SELECT 1 FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(rowCount).toBe(0);
  });

  /* Les cinq refus d'acces sont INDISCERNABLES, sans quoi la route est un
   * oracle : « ce jeton a expire » revele qu'une commande existe. */
  it("rend le meme refus quelle que soit la condition qui echoue", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());

    const expire = await poserJeton(commandeId, {
      expireA: new Date(Date.now() - 1000),
    });
    const inexistant = engendrerJeton().valeur;

    const refusExpire = await deposerRetractation(
      { voie: "JETON", valeurJeton: expire },
      { motif: null },
    );
    const refusInexistant = await deposerRetractation(
      { voie: "JETON", valeurJeton: inexistant },
      { motif: null },
    );

    expect(refusExpire).toEqual(refusInexistant);
  });
});

describe("les refus metier", () => {
  /* CRITERE 4. Le delai vient de LS-133, jamais d'un calcul local. */
  it("refuse une demande hors delai et nomme le jour limite", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionAncienne());
    const valeur = await poserJeton(commandeId);

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("REFUSE_HORS_DELAI");

    const { rowCount } = await client.query(
      "SELECT 1 FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(rowCount).toBe(0);
  });

  /*
   * CRITERE 6. L'unicite est tenue par la base, `commande_id` etant unique. La
   * garde applicative rend le refus lisible, la contrainte reste la seconde
   * ligne de defense.
   */
  it("refuse une seconde demande sur la meme commande", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const premier = await poserJeton(commandeId);
    const second = await poserJeton(commandeId);

    const un = await deposerRetractation(
      { voie: "JETON", valeurJeton: premier },
      { motif: null },
    );
    const deux = await deposerRetractation(
      { voie: "JETON", valeurJeton: second },
      { motif: null },
    );

    expect(un.statut).toBe("DEPOSEE");
    expect(deux.statut).toBe("REFUSE_DEJA_DEPOSEE");

    const { rowCount } = await client.query(
      "SELECT 1 FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(rowCount).toBe(1);
  });

  /*
   * DEUX DEPOTS SIMULTANES, la fenetre que la garde applicative ne ferme pas :
   * les deux lisent l'absence de demande avant que l'une ecrive. C'est la
   * contrainte d'unicite qui tranche, et le service traduit `P2002` en refus
   * lisible plutot que de laisser remonter une exception.
   */
  it("ne cree qu'une demande quand deux depots se croisent", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const premier = await poserJeton(commandeId);
    const second = await poserJeton(commandeId);

    const [un, deux] = await Promise.all([
      deposerRetractation(
        { voie: "JETON", valeurJeton: premier },
        { motif: null },
      ),
      deposerRetractation(
        { voie: "JETON", valeurJeton: second },
        { motif: null },
      ),
    ]);

    const statuts = [un.statut, deux.statut].sort();
    expect(statuts).toEqual(["DEPOSEE", "REFUSE_DEJA_DEPOSEE"]);

    const { rowCount } = await client.query(
      "SELECT 1 FROM demande_retractation WHERE commande_id = $1",
      [commandeId],
    );

    expect(rowCount).toBe(1);
  });
});

describe("etat du droit avant le formulaire", () => {
  it("annonce le droit ouvert et son jour limite", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const valeur = await poserJeton(commandeId);

    const etat = await lireEtatRetractation({
      voie: "JETON",
      valeurJeton: valeur,
    });

    expect(etat.statut).toBe("OUVERTE");
  });

  /*
   * LE CAS QUI PENCHE DU BON COTE. Sans `livreA`, le delai n'a pas commence :
   * l'etat doit etre `AVANT_RECEPTION` et surtout PAS `EXPIREE`, sans quoi un
   * droit entier serait presente comme eteint. `livreA` reste nul tant que
   * LS-131 n'existe pas, donc c'est l'etat de TOUTE commande aujourd'hui.
   */
  it("distingue une reception inconnue d'un delai expire", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, null);
    const valeur = await poserJeton(commandeId);

    const etat = await lireEtatRetractation({
      voie: "JETON",
      valeurJeton: valeur,
    });

    expect(etat.statut).toBe("AVANT_RECEPTION");
  });

  /* Et le depot reste POSSIBLE dans cet etat : le droit court des la
   * conclusion du contrat, article L221-18. */
  it("accepte un depot avant meme la reception du bien", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, null);
    const valeur = await poserJeton(commandeId);

    const issue = await deposerRetractation(
      { voie: "JETON", valeurJeton: valeur },
      { motif: null },
    );

    expect(issue.statut).toBe("DEPOSEE");
  });

  it("annonce le delai expire avec son jour limite", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionAncienne());
    const valeur = await poserJeton(commandeId);

    const etat = await lireEtatRetractation({
      voie: "JETON",
      valeurJeton: valeur,
    });

    expect(etat.statut).toBe("EXPIREE");
  });

  it("annonce une demande deja deposee", async () => {
    const commandeId = await commanderEtConfirmer();
    await poserLivraison(commandeId, receptionRecente());
    const premier = await poserJeton(commandeId);
    const second = await poserJeton(commandeId);

    await deposerRetractation(
      { voie: "JETON", valeurJeton: premier },
      { motif: null },
    );

    const etat = await lireEtatRetractation({
      voie: "JETON",
      valeurJeton: second,
    });

    expect(etat.statut).toBe("DEJA_DEPOSEE");
  });

  it("rend INDISPONIBLE sur un acces refuse, sans rien reveler", async () => {
    const etat = await lireEtatRetractation({
      voie: "JETON",
      valeurJeton: engendrerJeton().valeur,
    });

    expect(etat).toEqual({ statut: "INDISPONIBLE" });
  });
});
