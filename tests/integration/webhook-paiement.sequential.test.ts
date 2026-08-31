/**
 * L'EVENEMENT SIGNE CONFIRME LE PAIEMENT, LS-119, etape 7 du parcours 1.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur en zone critique. Ce
 * fichier dit ce que `traiterEvenementPaiement` doit garantir, pas ce qu'il
 * fait.
 *
 * LE SUJET N'EST PAS LE REJEU DU MEME EVENEMENT, que la contrainte `UNIQUE` sur
 * `identifiant_fournisseur` suffit a fermer. C'est le CROISEMENT DE DEUX
 * CHEMINS vers le meme effet, le webhook et la reconciliation : un evenement
 * tardif porte un identifiant JAMAIS VU, donc rien dans l'idempotence par
 * identifiant ne le rejette, et il recree tout. Sur une variante a plusieurs
 * exemplaires rien n'echoue et le stock est faux EN SILENCE, demonstration de
 * LS-12. C'est le test « evenement tardif apres regularisation » qui porte cette
 * garantie, et lui seul.
 *
 * VERIFIER UNE IDENTITE ET NON UNE CARDINALITE, piege mesure le 25 aout 2026 :
 * ces tests nomment la quantite attendue, le statut attendu, l'identifiant
 * attendu, plutot que de compter des lignes. Un `toHaveLength(1)` resterait vert
 * sur un mouvement ecrit deux fois puis compense.
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
let SignatureInvalideError: typeof import("@/integrations/stripe/evenements").SignatureInvalideError;

/** Saisie minimale d'un client, mode DOMICILE, aucun point de retrait. */
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

/** Configuration tarifaire figee, pour ne dependre d'aucune variable. */
const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

/**
 * Total attendu : la variante vaut 4900 centimes, au-dessus du seuil de
 * franchise a 3900, donc la livraison est OFFERTE et le total vaut 4900.
 */
const TOTAL_ATTENDU_CENTIMES = 4900;

/**
 * Double du verificateur de signature.
 *
 * IL SEPARE LA SIGNATURE DU CONTENU, ce que le vrai verificateur fait aussi :
 * le corps brut et l'en-tete entrent, un evenement typé sort ou une exception
 * est levee. Le test negatif passe par `signatureValide: false`, jamais par un
 * corps malforme : c'est bien le REFUS DE SIGNATURE qui doit tout arreter.
 */
function verificateurDouble(
  evenement: EvenementPaiement,
  options: { signatureValide?: boolean } = {},
): VerificateurSignature {
  return {
    async verifier() {
      if (options.signatureValide === false) {
        throw new SignatureInvalideError(
          new Error("signature de test refusee"),
        );
      }

      return evenement;
    },
  };
}

/**
 * Corps brut correspondant a un evenement, tel que le prestataire l'enverrait.
 *
 * IL EST TOUJOURS DU JSON EXPLOITABLE, et ce n'est pas cosmetique : c'est ce qui
 * rend le test negatif probant. Si les corps etaient illisibles, une mutation
 * remplacant la verification de signature par un simple decodage ferait rougir
 * TOUTE la suite sur des erreurs de decodage, sans rien prouver de la signature.
 * Avec un corps valide partout, seul le test negatif change de comportement, et
 * la mutation est detectee par le test qui porte precisement cette garantie.
 */
function corpsDe(evenement: EvenementPaiement): string {
  return JSON.stringify(evenement);
}

/** Evenement de paiement reussi pour une commande, forme neutre du domaine. */
function evenementReussi(
  commandeId: string,
  options: { identifiant?: string; montantCentimes?: number } = {},
): EvenementPaiement {
  return {
    identifiant: options.identifiant ?? `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId,
    identifiantSession: `cs_test_${commandeId.slice(0, 8)}`,
    montantCentimes: options.montantCentimes ?? TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };
}

/** Evenement de remboursement, partiel ou total selon le montant. */
function evenementRembourse(
  commandeId: string,
  montantRembourseCentimes: number,
  options: { identifiant?: string } = {},
): EvenementPaiement {
  return {
    identifiant: options.identifiant ?? `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REMBOURSE",
    commandeId,
    identifiantSession: `cs_test_${commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes,
    charge: { source: "test" },
  };
}

/**
 * Ecrit une commande reelle par le service, et rend de quoi l'observer.
 *
 * LA COMMANDE PASSE PAR `passerCommande`, jamais par un `INSERT` a la main : la
 * reservation, le numero et le figement doivent etre ceux de la production,
 * sans quoi le test verifierait sa propre reproduction du mecanisme et non le
 * mecanisme. Piege rencontre le 25 aout 2026.
 */
async function commanderUnePiece(
  options: { quantitePhysique?: number } = {},
): Promise<{ commandeId: string; varianteId: string }> {
  const { varianteId } = await creerVarianteEnStock(client, {
    ...(options.quantitePhysique === undefined
      ? {}
      : { quantitePhysique: options.quantitePhysique }),
  });

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return { commandeId: issue.commandeId, varianteId };
}

/** Etat de stock d'une variante, les deux quantites qui doivent bouger. */
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

/** Statut de la commande, axe distinct de celui du paiement. */
async function lireStatutCommande(commandeId: string): Promise<string> {
  const { rows } = await client.query<{ statut: string }>(
    "SELECT statut FROM commande WHERE id = $1",
    [commandeId],
  );

  return rows[0]?.statut ?? "INTROUVABLE";
}

/** Les paiements d'une commande, avec leur statut et leur date de confirmation. */
async function lirePaiements(commandeId: string): Promise<
  {
    id: string;
    statut: string;
    montant_centimes: number;
    montant_rembourse_centimes: number;
    confirme_a: Date | null;
  }[]
> {
  const { rows } = await client.query(
    `SELECT id, statut, montant_centimes, montant_rembourse_centimes, confirme_a
     FROM paiement WHERE commande_id = $1 ORDER BY cree_a`,
    [commandeId],
  );

  return rows;
}

/** Les mouvements de stock d'une commande. */
async function lireMouvements(
  commandeId: string,
): Promise<
  { variante_id: string; type: string; quantite: number; origine: string }[]
> {
  const { rows } = await client.query(
    `SELECT variante_id, type, quantite, origine
     FROM mouvement_stock WHERE commande_id = $1 ORDER BY cree_a`,
    [commandeId],
  );

  return rows;
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Les services lisent `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou les imports differes : le renseigner apres coup n'aurait aucun effet.
  process.env.DATABASE_URL = url;

  /*
   * L'EMETTEUR EST CONFIGURE, LS-126 : depuis l'emission de la facture, une
   * confirmation complete ecrit un document comptable, et l'absence de ces
   * quatre variables leverait une alerte `FACTURE_NON_EMISE` qui fausserait les
   * comptes d'alertes de ce fichier. Valeurs inventees, prefixe `TEST`.
   */
  process.env.FACTURE_RAISON_SOCIALE = "TEST Lune et Soleil";
  process.env.FACTURE_SIRET = "12345678901234";
  process.env.FACTURE_ADRESSE = "1 rue de Test, 75001 TESTVILLE";
  process.env.FACTURE_EMAIL_CONTACT = "test-emetteur@example.invalid";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ SignatureInvalideError } =
    await import("@/integrations/stripe/evenements"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE alerte_critique, historique_statut, mouvement_stock,
     evenement_fournisseur, paiement, avoir, facture, reservation,
     ligne_commande, commande, variante, produit, categorie, compteur_numero
     CASCADE`,
  );
});

describe("traiterEvenementPaiement, cas nominal", () => {
  it("confirme la commande, consomme la reservation et decremente le stock une seule fois", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    // La reservation existe et le stock physique n'a PAS encore bouge : c'est
    // exactement la distinction de l'invariant 6, disponibilite web contre
    // quantite physique.
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });

    const evenement = evenementReussi(commandeId);

    const issue = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    expect(issue).toEqual({ statut: "TRAITE" });

    // CRITERE 6 : la commande passe CONFIRMEE, la reservation devient un
    // mouvement, `quantitePhysique` decremente UNE SEULE FOIS.
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");
    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });

    // La reservation est consommee, elle ne doit plus pouvoir etre liberee par
    // la tache de LS-120 : la piece partirait deux fois.
    const { rows: reservations } = await client.query(
      "SELECT id FROM reservation WHERE commande_id = $1",
      [commandeId],
    );
    expect(reservations).toEqual([]);

    const mouvements = await lireMouvements(commandeId);
    expect(mouvements).toEqual([
      {
        variante_id: varianteId,
        type: "VENTE_WEB",
        // NEGATIF : le stock SORT. Un mouvement positif ferait remonter le
        // stock dans toute somme du journal, et S9 exige le signe selon le type.
        quantite: -1,
        // S9, un webhook n'est pas une personne : origine SYSTEME, acteur nul.
        origine: "SYSTEME",
      },
    ]);

    // CRITERE 7 : statut de paiement et statut de commande restent distincts.
    const paiements = await lirePaiements(commandeId);
    expect(paiements).toHaveLength(1);
    expect(paiements[0]?.statut).toBe("REUSSI");
    expect(paiements[0]?.montant_centimes).toBe(TOTAL_ATTENDU_CENTIMES);
    // LS-76 : `confirmeA` date l'encaissement EFFECTIF, jamais la creation de
    // la tentative. Il est renseigne ici, et une seule fois.
    expect(paiements[0]?.confirme_a).not.toBeNull();
  });

  it("historise la transition avec l'ancien statut, le nouveau et l'origine", async () => {
    const { commandeId } = await commanderUnePiece();

    await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementReussi(commandeId)),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementReussi(commandeId)),
    });

    // CRITERE 8. L'acteur est NUL et ce n'est pas un oubli : le webhook n'est
    // pas une personne, S9. Ecrire l'identifiant de l'exploitante ferait porter
    // a une administratrice une transition qu'elle n'a pas decidee.
    const { rows } = await client.query<{
      statut_precedent: string | null;
      statut_nouveau: string;
      acteur_id: string | null;
      origine: string;
    }>(
      `SELECT statut_precedent, statut_nouveau, acteur_id, origine
       FROM historique_statut WHERE commande_id = $1`,
      [commandeId],
    );

    expect(rows).toEqual([
      {
        statut_precedent: "EN_ATTENTE_PAIEMENT",
        statut_nouveau: "CONFIRMEE",
        acteur_id: null,
        origine: "SYSTEME",
      },
    ]);
  });

  it("persiste l'identifiant d'evenement dans la meme transaction que les effets", async () => {
    const { commandeId } = await commanderUnePiece();
    const evenement = evenementReussi(commandeId, { identifiant: "evt_ancre" });

    await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    // CRITERE 2. L'evenement est TRAITE et rattache a la tentative de paiement :
    // persiste hors transaction, une panne entre les deux ecritures laisserait
    // un evenement traite sans effet, ou des effets sans trace de leur cause.
    const { rows } = await client.query<{
      statut_traitement: string;
      traite_a: Date | null;
      paiement_id: string | null;
    }>(
      `SELECT statut_traitement, traite_a, paiement_id
       FROM evenement_fournisseur WHERE identifiant_fournisseur = $1`,
      ["evt_ancre"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.statut_traitement).toBe("TRAITE");
    expect(rows[0]?.traite_a).not.toBeNull();
    expect(rows[0]?.paiement_id).not.toBeNull();
  });
});

describe("traiterEvenementPaiement, signature", () => {
  it("ne produit AUCUN effet quand la signature est invalide", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();
    const evenement = evenementReussi(commandeId, {
      identifiant: "evt_non_signe",
    });

    /*
     * LE CORPS PORTE UN EVENEMENT COMPLET ET EXPLOITABLE, et ce detail rend le
     * test probant. Un corps illisible ferait echouer n'importe quelle mutation
     * sur une erreur de decodage, sans rien dire de la signature : le test
     * passerait pour la mauvaise raison. Ici tout est valide SAUF la signature,
     * donc un service qui cesserait de la verifier confirmerait la commande.
     */
    const issue = await traiterEvenementPaiement({
      corpsBrut: JSON.stringify(evenement),
      signature: "signature-falsifiee",
      verificateur: verificateurDouble(evenement, { signatureValide: false }),
    });

    expect(issue).toEqual({ statut: "SIGNATURE_INVALIDE" });

    /*
     * CRITERE 1, ET C'EST LE TEST QUE LA MUTATION DOIT FAIRE ROUGIR. Rien n'a
     * bouge : ni statut, ni stock, ni paiement, ni evenement persiste. Le
     * dernier point compte autant que les autres : persister un evenement non
     * signe donnerait a un attaquant le moyen de remplir la table, et surtout
     * de faire refuser plus tard le VRAI evenement portant le meme identifiant.
     */
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
    expect(await lireStock(varianteId)).toEqual({ physique: 1, reservee: 1 });
    expect(await lireMouvements(commandeId)).toEqual([]);

    const paiements = await lirePaiements(commandeId);
    expect(paiements.every((p) => p.statut === "EN_ATTENTE")).toBe(true);

    const { rows: evenements } = await client.query(
      "SELECT id FROM evenement_fournisseur WHERE identifiant_fournisseur = $1",
      ["evt_non_signe"],
    );
    expect(evenements).toEqual([]);
  });
});

describe("traiterEvenementPaiement, idempotence", () => {
  it("ne produit aucun effet supplementaire au rejeu du MEME evenement", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();
    const evenement = evenementReussi(commandeId, { identifiant: "evt_rejeu" });

    const premier = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });
    expect(premier).toEqual({ statut: "TRAITE" });

    const confirmeApresPremier = (await lirePaiements(commandeId))[0]
      ?.confirme_a;

    // Le MEME evenement, mot pour mot, comme le prestataire le rejoue apres un
    // 500 ou un delai depasse.
    const second = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    // CRITERE 3. Le rejeu est reconnu et ne retraite rien.
    expect(second).toEqual({ statut: "DEJA_TRAITE" });

    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });
    expect(await lireMouvements(commandeId)).toHaveLength(1);

    const paiements = await lirePaiements(commandeId);
    expect(paiements).toHaveLength(1);
    expect(paiements[0]?.statut).toBe("REUSSI");
    // LA DATE COMPTABLE NE BOUGE PAS AU REJEU, LS-76 : elle est ecrite une
    // seule fois. Un second passage qui la reecrirait deplacerait la vente
    // dans le temps, et pourrait changer son mois d'imputation.
    expect(paiements[0]?.confirme_a).toEqual(confirmeApresPremier);

    // Une seule transition historisee : la commande n'est pas passee deux fois
    // de EN_ATTENTE_PAIEMENT a CONFIRMEE.
    const { rows: historiques } = await client.query(
      "SELECT id FROM historique_statut WHERE commande_id = $1",
      [commandeId],
    );
    expect(historiques).toHaveLength(1);
  });

  /*
   * LE TEST QUI PORTE LE COEUR DE LA STORY, et le seul que la contrainte
   * `UNIQUE` sur l'identifiant d'evenement NE PEUT PAS satisfaire.
   *
   * La reconciliation de LS-120 a deja regularise la commande : paiement,
   * mouvement, statut. L'evenement du webhook arrive ensuite, avec un
   * identifiant JAMAIS VU. Rien dans l'idempotence par identifiant ne le
   * rejette. Ce sont les quatre cles par EFFET qui doivent l'arreter.
   */
  it("ne recree rien quand l'evenement arrive apres une regularisation", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      // TROIS EXEMPLAIRES ET NON UN SEUL, ET C'EST LE POINT. Sur une piece
      // unique le CHECK `quantite_physique >= 0` ferait echouer la seconde
      // ecriture, donnant un vert accidentel qui ne prouverait pas
      // l'idempotence. A trois exemplaires, rien en base ne s'oppose au second
      // mouvement : seule la cle d'effet le refuse, et si elle manque le stock
      // est faux en silence, exactement la demonstration de LS-12.
      quantitePhysique: 3,
    });

    // La reconciliation regularise d'abord, par le MEME service : elle porte
    // l'origine RECONCILIATION, second chemin d'entree de la decision D.
    const evenementRegularisation = evenementReussi(commandeId, {
      identifiant: "evt_reconciliation",
    });
    const regularisation = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementRegularisation),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementRegularisation),
      origine: "RECONCILIATION",
    });
    expect(regularisation).toEqual({ statut: "TRAITE" });

    const stockApresRegularisation = await lireStock(varianteId);
    expect(stockApresRegularisation).toEqual({ physique: 2, reservee: 0 });

    // QUARANTE SECONDES PLUS TARD, le webhook arrive enfin. Identifiant neuf.
    const evenementTardif = evenementReussi(commandeId, {
      identifiant: "evt_tardif_jamais_vu",
    });
    const tardif = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementTardif),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementTardif),
    });

    // CRITERE 4. L'evenement est reconnu comme sans effet a produire.
    expect(tardif).toEqual({ statut: "DEJA_TRAITE" });

    // LE STOCK N'A PAS BOUGE UNE SECONDE FOIS. C'est l'assertion qui echoue si
    // la cle `mouvement_vente_web_unique` est retiree, et elle echouerait en
    // SILENCE en production : aucune erreur, un stock faux.
    expect(await lireStock(varianteId)).toEqual(stockApresRegularisation);
    expect(await lireMouvements(commandeId)).toHaveLength(1);

    const paiements = await lirePaiements(commandeId);
    expect(paiements).toHaveLength(1);
    expect(paiements[0]?.statut).toBe("REUSSI");

    // L'evenement tardif EST persiste malgre tout : il a ete recu et signe, et
    // ne pas le tracer le ferait rejouer indefiniment par le prestataire.
    const { rows } = await client.query<{ statut_traitement: string }>(
      `SELECT statut_traitement FROM evenement_fournisseur
       WHERE identifiant_fournisseur = $1`,
      ["evt_tardif_jamais_vu"],
    );
    expect(rows[0]?.statut_traitement).toBe("IGNORE");
  });

  /*
   * LE SCENARIO DE LS-12 A DEUX VERROUS, ET LE TEST PRECEDENT N'EN EXERCE QU'UN.
   * Mesure par mutation le 27 aout 2026 : quand la regularisation a tout ecrit,
   * c'est la cle du PAIEMENT qui arrete l'evenement tardif, et le service sort
   * avant meme d'atteindre la boucle des mouvements. Neutraliser la garde du
   * mouvement laissait donc le test precedent VERT.
   *
   * CE TEST-CI ATTEINT LA BOUCLE, en partant d'une regularisation INCOMPLETE :
   * le mouvement de stock est ecrit, le paiement ne l'est pas. C'est l'etat que
   * laisse une panne entre deux ecritures d'un chemin qui ne serait pas
   * transactionnel, et c'est le seul par lequel la seconde cle se prouve.
   */
  it("ne sort pas le stock deux fois quand le mouvement existe deja sans paiement encaisse", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      quantitePhysique: 3,
    });

    // Un mouvement de vente web existe deja pour cette commande et cette
    // variante, sans qu'aucun paiement ne soit encaisse.
    await client.query(
      `INSERT INTO mouvement_stock (id, variante_id, commande_id, type, quantite, origine, cree_a)
       VALUES (gen_random_uuid(), $1, $2, 'VENTE_WEB', -1, 'RECONCILIATION', now())`,
      [varianteId, commandeId],
    );
    await client.query(
      "UPDATE variante SET quantite_physique = 2 WHERE id = $1",
      [varianteId],
    );

    const stockAvant = await lireStock(varianteId);

    const evenement = evenementReussi(commandeId, {
      identifiant: "evt_mouvement_deja_la",
    });
    const issue = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    // Le paiement, lui, n'avait pas ete encaisse : il l'est maintenant.
    expect(issue).toEqual({ statut: "TRAITE" });
    expect((await lirePaiements(commandeId))[0]?.statut).toBe("REUSSI");

    // LE STOCK N'A PAS BOUGE UNE SECONDE FOIS, et c'est l'assertion que la
    // mutation de la garde du mouvement doit faire rougir.
    expect(await lireStock(varianteId)).toEqual(stockAvant);
    expect(await lireMouvements(commandeId)).toHaveLength(1);
  });

  it("alerte et n'encaisse pas deux fois quand une SECONDE session est payee", async () => {
    const { commandeId, varianteId } = await commanderUnePiece({
      quantitePhysique: 3,
    });

    const premierEvenement = evenementReussi(commandeId, {
      identifiant: "evt_session_1",
    });
    await traiterEvenementPaiement({
      corpsBrut: corpsDe(premierEvenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(premierEvenement),
    });

    /*
     * LE DOUBLE ENCAISSEMENT D'ADR-032 : deux sessions payees, deux evenements
     * distincts, deux identifiants de session distincts. La prevention de
     * LS-118 a echoue, ou l'onglet ouvert a ete paye malgre elle.
     */
    const secondEvenement = {
      ...evenementReussi(commandeId, { identifiant: "evt_session_2" }),
      identifiantSession: "cs_test_seconde_session",
    };
    const second = await traiterEvenementPaiement({
      corpsBrut: corpsDe(secondEvenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(secondEvenement),
    });

    expect(second).toEqual({ statut: "DOUBLE_ENCAISSEMENT" });

    // AUCUN SECOND EFFET : un seul paiement encaisse, un seul mouvement.
    expect(await lireStock(varianteId)).toEqual({ physique: 2, reservee: 0 });
    expect(await lireMouvements(commandeId)).toHaveLength(1);

    const encaisses = (await lirePaiements(commandeId)).filter(
      (p) => p.statut === "REUSSI",
    );
    expect(encaisses).toHaveLength(1);

    /*
     * ADR-032, DETECTION : le refus ne se journalise pas silencieusement, il
     * produit une AlerteCritique CRITIQUE. Sans elle, l'exploitante ne saurait
     * jamais qu'un client a paye deux fois, et l'argent resterait encaisse.
     */
    const { rows: alertes } = await client.query<{
      type: string;
      gravite: string;
      type_cible: string | null;
      id_cible: string | null;
      message: string;
    }>(
      `SELECT type, gravite, type_cible, id_cible, message
       FROM alerte_critique`,
    );

    expect(alertes).toHaveLength(1);
    expect(alertes[0]?.gravite).toBe("CRITIQUE");
    expect(alertes[0]?.type_cible).toBe("Paiement");
    expect(alertes[0]?.id_cible).not.toBeNull();
    // LE MONTANT EN TROP EST DANS LE MESSAGE, ADR-032 : sans lui, l'exploitante
    // devrait aller le chercher chez le prestataire pour rembourser.
    expect(alertes[0]?.message).toContain(String(TOTAL_ATTENDU_CENTIMES));

    /*
     * AUCUN REMBOURSEMENT AUTOMATIQUE, ADR-032 : le traitement est MANUEL,
     * depuis le tableau de bord. Le chemin qui decide « ce paiement est en
     * trop » est celui qui, s'il se trompe, rend l'argent d'une commande
     * valide. Le paiement en trop reste donc en base, non encaisse ici.
     */
    const nonEncaisses = (await lirePaiements(commandeId)).filter(
      (p) => p.statut !== "REUSSI",
    );
    expect(nonEncaisses.length).toBeGreaterThan(0);
  });
});

describe("traiterEvenementPaiement, montant encaisse", () => {
  /*
   * LE MONTANT DE L'EVENEMENT DOIT ETRE CONFRONTE AU TOTAL DE LA COMMANDE.
   * Sans cette garde, un montant different de celui attendu est ecrit tel quel
   * et la comptabilite est fausse EN SILENCE : la commande porte 4900, le
   * paiement en porte 2000, et rien ne le signale. Les causes possibles sont
   * reelles, une session creee sur un total perime ou une charge portant un
   * autre paiement.
   *
   * LA CONFIRMATION N'EST PAS BLOQUEE POUR AUTANT, meme raison que le stock
   * epuise : l'argent est encaisse, refuser laisserait de l'argent sans
   * commande. L'ecart est alerte, et l'exploitante tranche.
   */
  it("confirme mais alerte quand le montant encaisse differe du total de la commande", async () => {
    const { commandeId } = await commanderUnePiece();

    const evenement = evenementReussi(commandeId, {
      identifiant: "evt_montant_incoherent",
      montantCentimes: 2000,
    });

    const issue = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenement),
    });

    expect(issue).toEqual({ statut: "TRAITE" });
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");

    const { rows: alertes } = await client.query<{
      type: string;
      gravite: string;
      type_cible: string | null;
      message: string;
    }>("SELECT type, gravite, type_cible, message FROM alerte_critique");

    expect(alertes).toHaveLength(1);
    expect(alertes[0]?.gravite).toBe("CRITIQUE");
    expect(alertes[0]?.type_cible).toBe("Paiement");
    // LES DEUX MONTANTS SONT NOMMES : sans eux l'exploitante devrait aller
    // chercher l'ecart chez le prestataire pour comprendre l'alerte.
    expect(alertes[0]?.message).toContain("2000");
    expect(alertes[0]?.message).toContain(String(TOTAL_ATTENDU_CENTIMES));
  });

  it("n'alerte pas quand le montant encaisse vaut le total de la commande", async () => {
    const { commandeId } = await commanderUnePiece();

    await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementReussi(commandeId)),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementReussi(commandeId)),
    });

    /*
     * LE CAS NOMINAL NE DOIT PRODUIRE AUCUNE ALERTE, sans quoi l'ecran
     * d'alertes se remplirait a chaque vente et l'exploitante apprendrait a les
     * ignorer, ce qui noierait celles qui comptent.
     */
    const { rows } = await client.query("SELECT id FROM alerte_critique");
    expect(rows).toEqual([]);
  });
});

describe("traiterEvenementPaiement, remboursements", () => {
  it("passe le paiement en PARTIELLEMENT_REMBOURSE sans toucher au statut logistique", async () => {
    const { commandeId } = await commanderUnePiece();

    await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementReussi(commandeId)),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementReussi(commandeId)),
    });

    // La commande avance dans sa vie logistique, independamment du paiement.
    await client.query(
      "UPDATE commande SET statut = 'EXPEDIEE' WHERE id = $1",
      [commandeId],
    );

    const remboursement = evenementRembourse(commandeId, 1000, {
      identifiant: "evt_remboursement_partiel",
    });
    const issue = await traiterEvenementPaiement({
      corpsBrut: corpsDe(remboursement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(remboursement),
    });

    expect(issue).toEqual({ statut: "TRAITE" });

    const paiements = await lirePaiements(commandeId);
    expect(paiements[0]?.statut).toBe("PARTIELLEMENT_REMBOURSE");
    expect(paiements[0]?.montant_rembourse_centimes).toBe(1000);

    /*
     * CRITERE 9, ET C'EST LE POINT DE LA SEPARATION DES AXES : le colis est
     * parti, la commande reste EXPEDIEE. Forcer ANNULEE sur un remboursement
     * ferait mentir la logistique, et `payments.md` l'interdit.
     */
    expect(await lireStatutCommande(commandeId)).toBe("EXPEDIEE");
  });

  it("passe le paiement en REMBOURSE quand le remboursement est total", async () => {
    const { commandeId } = await commanderUnePiece();

    await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementReussi(commandeId)),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementReussi(commandeId)),
    });

    const premierRemboursement = evenementRembourse(commandeId, 1000, {
      identifiant: "evt_r1",
    });
    await traiterEvenementPaiement({
      corpsBrut: corpsDe(premierRemboursement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(premierRemboursement),
    });

    // SECOND REMBOURSEMENT, cumule : le montant du prestataire est TOTAL, pas
    // incremental. 4900 sur 4900, le paiement est integralement rembourse.
    const secondRemboursement = evenementRembourse(
      commandeId,
      TOTAL_ATTENDU_CENTIMES,
      { identifiant: "evt_r2" },
    );
    await traiterEvenementPaiement({
      corpsBrut: corpsDe(secondRemboursement),
      signature: "signature-de-test",
      verificateur: verificateurDouble(secondRemboursement),
    });

    const paiements = await lirePaiements(commandeId);
    expect(paiements[0]?.statut).toBe("REMBOURSE");
    expect(paiements[0]?.montant_rembourse_centimes).toBe(
      TOTAL_ATTENDU_CENTIMES,
    );

    /*
     * LE PAIEMENT RESTE DANS LE FILTRE DE `paiement_reussi_unique`, LS-45 : ses
     * trois etats d'encaissement comprennent REMBOURSE. Un remboursement ne
     * rend pas la commande impayee, et un second REUSSI ne doit pas redevenir
     * inserable. Le mouvement de stock, lui, ne se defait pas ici : le retour
     * physique de la piece est un mouvement RETOUR, phase 4.
     */
    const mouvements = await lireMouvements(commandeId);
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0]?.type).toBe("VENTE_WEB");
  });

  it("ignore un remboursement portant sur une commande sans paiement encaisse", async () => {
    const { commandeId } = await commanderUnePiece();

    // Aucun paiement encaisse : un remboursement n'a rien a rembourser. Le cas
    // vient de l'ORDRE D'ARRIVEE INATTENDU exige par `payments.md`.
    const orphelin = evenementRembourse(commandeId, 1000, {
      identifiant: "evt_orphelin",
    });
    const issue = await traiterEvenementPaiement({
      corpsBrut: corpsDe(orphelin),
      signature: "signature-de-test",
      verificateur: verificateurDouble(orphelin),
    });

    expect(issue).toEqual({ statut: "SANS_EFFET" });
    expect(await lireStatutCommande(commandeId)).toBe("EN_ATTENTE_PAIEMENT");

    // L'evenement reste trace, il ne doit pas etre rejoue indefiniment.
    const { rows } = await client.query<{ statut_traitement: string }>(
      `SELECT statut_traitement FROM evenement_fournisseur
       WHERE identifiant_fournisseur = $1`,
      ["evt_orphelin"],
    );
    expect(rows[0]?.statut_traitement).toBe("IGNORE");
  });
});

describe("traiterEvenementPaiement, stock reparti au catalogue", () => {
  /*
   * ARBITRAGE DE CHRISTOPHE, 27 aout 2026 : CONFIRMER ET ALERTER. Le client a
   * paye, la reservation a expire et la tache de liberation a rendu la piece au
   * catalogue, qui l'a peut-etre revendue. Refuser laisserait de l'argent
   * encaisse sans commande confirmee, ce qui est pire : la commande est donc
   * confirmee, et une AlerteCritique appelle l'exploitante a rembourser ou
   * reapprovisionner a la main.
   *
   * LE PLANCHER A ZERO N'EST PAS UN CHOIX, c'est `chk_variante_physique_positif`
   * en base, contrainte C5 non contournable. Decrementer sous zero ferait lever
   * la transaction, donc perdrait l'evenement et le rejouerait indefiniment.
   */
  it("confirme la commande et alerte quand la reservation a ete liberee et le stock epuise", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    // La tache de liberation de LS-120 est passee : reservation supprimee,
    // quantite reservee rendue. Puis la piece a ete vendue sur un marche.
    await client.query("DELETE FROM reservation WHERE commande_id = $1", [
      commandeId,
    ]);
    await client.query(
      "UPDATE variante SET quantite_reservee = 0, quantite_physique = 0 WHERE id = $1",
      [varianteId],
    );

    const issue = await traiterEvenementPaiement({
      corpsBrut: corpsDe(evenementReussi(commandeId)),
      signature: "signature-de-test",
      verificateur: verificateurDouble(evenementReussi(commandeId)),
    });

    expect(issue).toEqual({ statut: "TRAITE" });

    // LA COMMANDE EST CONFIRMEE : l'argent est encaisse, la commande existe.
    expect(await lireStatutCommande(commandeId)).toBe("CONFIRMEE");
    expect((await lirePaiements(commandeId))[0]?.statut).toBe("REUSSI");

    // LE STOCK NE DESCEND PAS SOUS ZERO, la contrainte C5 l'interdit.
    expect(await lireStock(varianteId)).toEqual({ physique: 0, reservee: 0 });

    // Le mouvement est ecrit malgre tout : la vente a eu lieu, et le journal
    // des mouvements doit la porter pour que les statistiques soient justes.
    expect(await lireMouvements(commandeId)).toHaveLength(1);

    const { rows: alertes } = await client.query<{
      gravite: string;
      type_cible: string | null;
      message: string;
    }>("SELECT gravite, type_cible, message FROM alerte_critique");

    expect(alertes).toHaveLength(1);
    expect(alertes[0]?.gravite).toBe("CRITIQUE");
    expect(alertes[0]?.type_cible).toBe("Variante");
  });
});
