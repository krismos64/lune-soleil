/**
 * LES GARDES DE LA DEMANDE DE REMBOURSEMENT, LS-160. Zone critique :
 * autorisation et sortie d'argent.
 *
 * CE QUE CETTE SUITE PROUVE, ET QUE `avoir.sequential.test.ts` NE PROUVE PAS.
 * LS-128 a livre `rembourserCommande` et l'a exerce sans aucune garde : le
 * service n'avait alors AUCUN appelant, donc aucune surface HTTP, et son
 * critere 6 a ete reporte ici faute de page a garder. `demanderRemboursement`
 * est la fonction qui porte les deux gardes, et c'est elle qui est exercee ici.
 *
 * « VERIFIE ACTION PAR ACTION ET NON PAR LA PRESENCE D'UN APPEL », meme exigence
 * qu'en LS-95. `verifier-actions-sensibles.sh` prouve que le texte de l'appel
 * figure dans le corps de la fonction marquee, propriete du FICHIER. Il ne dit
 * rien de l'execution : une garde placee APRES l'appel au prestataire le
 * satisferait mot pour mot en laissant partir l'argent.
 *
 * CHAQUE REFUS REGARDE L'ETAT DE LA BASE ET LE DOUBLE DU PRESTATAIRE, jamais
 * seulement la valeur rendue. Un refus et une panne laissent le meme statut :
 * c'est l'absence d'avoir ET l'absence d'appel sortant qui prouvent que la
 * garde precede l'effet. Une garde qui refuserait apres avoir rembourse rendrait
 * exactement la meme valeur.
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
import type {
  DemandeRemboursement,
  FournisseurPaiement,
  IssueRemboursement,
} from "@/integrations/stripe/fournisseur";

let client: Client;
let auth: typeof import("@/lib/auth").auth;
let passerCommande: typeof import("@/services/commande").passerCommande;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let demanderRemboursement: typeof import("@/services/avoir").demanderRemboursement;
let enregistrerPreuveIdentite: typeof import("@/services/reauthentification").enregistrerPreuveIdentite;
let FENETRE_REAUTHENTIFICATION_MS: typeof import("@/services/reauthentification").FENETRE_REAUTHENTIFICATION_MS;

const MOT_DE_PASSE_VALIDE = "phrase-de-passe1";
const EMAIL_ADMINISTRATRICE = "exploitante@exemple.fr";
const EMAIL_CLIENT = "client@exemple.fr";

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

/** La variante vaut 4900, au-dessus du seuil : livraison offerte, total 4900. */
const TOTAL_CENTIMES = 4900;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "secret-de-test-uniquement-non-production";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.FACTURE_RAISON_SOCIALE ??= "TEST Lune et Soleil";
  process.env.FACTURE_SIRET ??= "12345678901234";
  process.env.FACTURE_ADRESSE ??= "1 rue de Test, 75001 TESTVILLE";
  process.env.FACTURE_EMAIL_CONTACT ??= "test-emetteur@example.invalid";

  client = new Client({ connectionString: url });
  await client.connect();

  ({ auth } = await import("@/lib/auth"));
  ({ passerCommande } = await import("@/services/commande"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ demanderRemboursement } = await import("@/services/avoir"));
  ({ enregistrerPreuveIdentite, FENETRE_REAUTHENTIFICATION_MS } =
    await import("@/services/reauthentification"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_connexion, session, compte, verification, passkey,
              intention_remboursement, avoir, facture, paiement,
              evenement_fournisseur, historique_statut, mouvement_stock,
              reservation, ligne_commande, commande, envoi_en_attente,
              journal_email, alerte_critique, compteur_numero,
              variante, produit, categorie, utilisateur CASCADE`,
  );
});

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
 * Double du prestataire, qui ENREGISTRE SES APPELS.
 *
 * LE COMPTE D'APPELS EST LA PREUVE CENTRALE DE CE FICHIER. Une garde qui
 * refuserait apres avoir appele le prestataire rendrait la meme valeur et
 * laisserait la meme base : seul ce compteur distingue « l'argent n'est pas
 * parti » de « l'argent est parti et on l'a cache ».
 */
function fournisseurDouble(
  reponse: (demande: DemandeRemboursement) => Promise<IssueRemboursement>,
): FournisseurPaiement & { appels: DemandeRemboursement[] } {
  const appels: DemandeRemboursement[] = [];

  return {
    appels,
    async creerSession(): Promise<never> {
      throw new Error("creerSession n'a pas sa place dans ces tests");
    },
    async expirerSession() {
      return "DEJA_FERMEE" as const;
    },
    async lireSession(): Promise<never> {
      throw new Error("lireSession n'a pas sa place dans ces tests");
    },
    async rembourser(demande: DemandeRemboursement) {
      appels.push(demande);
      return reponse(demande);
    },
  };
}

function fournisseurQuiRembourse(): ReturnType<typeof fournisseurDouble> {
  return fournisseurDouble(async (demande) => ({
    issue: "REMBOURSE",
    identifiantRemboursement: `re_test_${randomUUID().slice(0, 8)}`,
    montantCentimes: demande.montantCentimes,
  }));
}

/**
 * Ouvre une session et rend ses en-tetes.
 *
 * LE ROLE SE POSE EN SQL, jamais par une interface : ADR-023, aucun ecran ne
 * promeut un compte en `ADMINISTRATRICE`.
 */
async function ouvrirSession(
  email: string,
  role: "CLIENT" | "ADMINISTRATRICE",
): Promise<{ enTetes: Headers; sessionId: string }> {
  await auth.api.signUpEmail({
    body: { email, password: MOT_DE_PASSE_VALIDE, name: "Compte Test" },
  });

  if (role === "ADMINISTRATRICE") {
    await client.query(
      "UPDATE utilisateur SET role = 'ADMINISTRATRICE' WHERE email = $1",
      [email],
    );
  }

  const reponse = await auth.api.signInEmail({
    body: { email, password: MOT_DE_PASSE_VALIDE },
    asResponse: true,
  });
  const enTetes = new Headers({ cookie: reponse.headers.get("set-cookie")! });

  const session = await auth.api.getSession({ headers: enTetes });
  if (!session?.session) {
    throw new Error("La session de test n'a pas ete creee");
  }

  return { enTetes, sessionId: session.session.id };
}

/** Ouvre une session d'administratrice ayant deja prouve son identite. */
async function sessionAdministratricePreuveFraiche(): Promise<Headers> {
  const { enTetes, sessionId } = await ouvrirSession(
    EMAIL_ADMINISTRATRICE,
    "ADMINISTRATRICE",
  );
  await enregistrerPreuveIdentite(sessionId);
  return enTetes;
}

/** Passe une commande, la confirme, et rend son identifiant. */
async function commanderEtConfirmer(): Promise<{
  commandeId: string;
  factureId: string;
}> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  const evenement: EvenementPaiement = {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId: issue.commandeId,
    identifiantSession: `cs_test_${issue.commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_CENTIMES,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM facture WHERE commande_id = $1",
    [issue.commandeId],
  );

  const facture = rows[0];

  if (facture === undefined) {
    throw new Error("aucune facture emise par la confirmation");
  }

  return { commandeId: issue.commandeId, factureId: facture.id };
}

async function compterAvoirs(factureId: string): Promise<number> {
  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM avoir WHERE facture_id = $1",
    [factureId],
  );
  return rows[0].n as number;
}

async function cumulRembourse(commandeId: string): Promise<number> {
  const { rows } = await client.query(
    "SELECT montant_rembourse_centimes AS n FROM paiement WHERE commande_id = $1",
    [commandeId],
  );
  return rows[0]?.n ?? 0;
}

describe("demanderRemboursement, garde de role", () => {
  /**
   * LE TEST NEGATIF DE SECURITE, critere 1. C'est celui qui rougit si la garde
   * de role disparait.
   *
   * UN COMPTE `CLIENT` ET NON UNE ABSENCE DE SESSION, et la nuance est tout
   * l'objet du cas : une session existe, elle est valide, elle a meme prouve
   * son identite. Seul le ROLE manque. C'est le defaut reel de LS-89, ou un
   * client inscrit sur la boutique franchissait la garde de fraicheur avec son
   * propre mot de passe.
   */
  it("refuse un appelant sans le role administratrice", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const { enTetes, sessionId } = await ouvrirSession(EMAIL_CLIENT, "CLIENT");

    // LA PREUVE EST FRAICHE : sans cela le refus pourrait venir de la garde de
    // fraicheur, et le test ne prouverait rien sur le role.
    await enregistrerPreuveIdentite(sessionId);

    const fournisseur = fournisseurQuiRembourse();

    const issue = await demanderRemboursement(enTetes, {
      commandeId,
      montantCentimes: 2000,
      motif: "Test de refus",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("SESSION_ABSENTE");

    // LE PRESTATAIRE N'A PAS ETE APPELE. Sans cette assertion, une garde qui
    // refuse APRES avoir rembourse passerait : l'argent serait parti et la
    // valeur rendue serait identique.
    expect(fournisseur.appels).toHaveLength(0);
    expect(await compterAvoirs(factureId)).toBe(0);
    expect(await cumulRembourse(commandeId)).toBe(0);
  });

  /** Aucune session du tout, le cas le plus simple et le plus banal. */
  it("refuse un appelant sans session", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const fournisseur = fournisseurQuiRembourse();

    const issue = await demanderRemboursement(new Headers(), {
      commandeId,
      montantCentimes: 2000,
      motif: "Test sans session",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("SESSION_ABSENTE");
    expect(fournisseur.appels).toHaveLength(0);
    expect(await compterAvoirs(factureId)).toBe(0);
  });

  /**
   * LA GARDE DE FRAICHEUR, distincte de celle du role, ADR-027.
   *
   * Le role est le bon, la session est valide : tout est reuni SAUF la preuve
   * recente. C'est le scenario de l'ordinateur laisse ouvert.
   */
  it("refuse sans preuve d'identite recente", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const { enTetes } = await ouvrirSession(
      EMAIL_ADMINISTRATRICE,
      "ADMINISTRATRICE",
    );

    const fournisseur = fournisseurQuiRembourse();

    const issue = await demanderRemboursement(enTetes, {
      commandeId,
      montantCentimes: 2000,
      motif: "Test sans preuve",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REAUTHENTIFICATION_REQUISE");
    expect(fournisseur.appels).toHaveLength(0);
    expect(await compterAvoirs(factureId)).toBe(0);
  });

  /**
   * LA FENETRE S'APPLIQUE A CETTE ACTION, et pas seulement au service isole.
   *
   * La preuve EXISTE, elle est trop ancienne. Sans ce cas, une garde qui
   * testerait la seule PRESENCE de `reauthentifieeLe` passerait.
   */
  it("refuse une preuve depassant la fenetre de validite", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const { enTetes, sessionId } = await ouvrirSession(
      EMAIL_ADMINISTRATRICE,
      "ADMINISTRATRICE",
    );

    await enregistrerPreuveIdentite(
      sessionId,
      new Date(Date.now() - FENETRE_REAUTHENTIFICATION_MS - 3_000),
    );

    const fournisseur = fournisseurQuiRembourse();

    const issue = await demanderRemboursement(enTetes, {
      commandeId,
      montantCentimes: 2000,
      motif: "Test preuve perimee",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REAUTHENTIFICATION_REQUISE");
    expect(fournisseur.appels).toHaveLength(0);
    expect(await compterAvoirs(factureId)).toBe(0);
  });

  /**
   * LE PENDANT POSITIF, sans lequel les quatre cas precedents seraient
   * satisfaits par une fonction qui refuse TOUT.
   *
   * Une garde bloquee en position fermee protege parfaitement et rend le
   * remboursement impossible : c'est le motif « defaut ferme invisible au
   * nominal », deja rencontre sur ce depot.
   */
  it("accepte une administratrice ayant prouve son identite", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const enTetes = await sessionAdministratricePreuveFraiche();
    const fournisseur = fournisseurQuiRembourse();

    const issue = await demanderRemboursement(enTetes, {
      commandeId,
      montantCentimes: 2000,
      motif: "Geste commercial",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REMBOURSE");
    expect(fournisseur.appels).toHaveLength(1);
    expect(await compterAvoirs(factureId)).toBe(1);
    expect(await cumulRembourse(commandeId)).toBe(2000);
  });
});

describe("demanderRemboursement, reference de demande", () => {
  /**
   * LE DOUBLE CLIC, critere 3. C'est le cas qui coute de l'argent reel.
   *
   * LES DEUX APPELS PORTENT LA MEME REFERENCE, ce que fait l'ecran : elle est
   * engendree une fois au rendu de la page et renvoyee a l'identique. Le second
   * doit sortir en `DEJA_DEMANDE` SANS appeler le prestataire.
   *
   * LES DEUX APPELS SONT SUCCESSIFS ET NON CONCURRENTS, et c'est deliberement
   * le cas le plus DUR pour la reference. Entre les deux, le premier avoir est
   * ecrit et le cumul de la facture a bouge : une cle derivee de ce cumul
   * changerait donc de valeur et laisserait partir un SECOND remboursement
   * reel. C'est le defaut mesure le 1er septembre 2026, 4000 centimes rendus
   * pour 2000 voulus, et ce test le ferme.
   */
  it("ne rembourse qu'une fois sur deux envois de la meme reference", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const enTetes = await sessionAdministratricePreuveFraiche();
    const fournisseur = fournisseurQuiRembourse();

    const reference = randomUUID();
    const demande = {
      commandeId,
      montantCentimes: 2000,
      motif: "Article abime",
      fournisseur,
      referenceDemande: reference,
    };

    const premier = await demanderRemboursement(enTetes, demande);
    const second = await demanderRemboursement(enTetes, demande);

    expect(premier.statut).toBe("REMBOURSE");
    expect(second.statut).toBe("DEJA_DEMANDE");

    // LE PRESTATAIRE N'A ETE APPELE QU'UNE FOIS : c'est la sortie d'argent qui
    // compte, et elle se mesure ici, pas dans le statut rendu.
    expect(fournisseur.appels).toHaveLength(1);
    expect(await compterAvoirs(factureId)).toBe(1);
    expect(await cumulRembourse(commandeId)).toBe(2000);
  });

  /**
   * LE PENDANT INDISPENSABLE DU PRECEDENT : une demande LEGITIME plus tard doit
   * partir.
   *
   * Sans ce cas, une implementation qui refuserait tout second remboursement
   * satisferait le test du double clic tout en rendant impossible un second
   * geste commercial parfaitement legitime. Deux references distinctes designent
   * deux INTENTIONS distinctes.
   */
  it("laisse partir une seconde demande portant une reference neuve", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const enTetes = await sessionAdministratricePreuveFraiche();
    const fournisseur = fournisseurQuiRembourse();

    const premier = await demanderRemboursement(enTetes, {
      commandeId,
      montantCentimes: 2000,
      motif: "Premier geste",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    const second = await demanderRemboursement(enTetes, {
      commandeId,
      montantCentimes: 1000,
      motif: "Second geste",
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(premier.statut).toBe("REMBOURSE");
    expect(second.statut).toBe("REMBOURSE");
    expect(fournisseur.appels).toHaveLength(2);
    expect(await compterAvoirs(factureId)).toBe(2);
    expect(await cumulRembourse(commandeId)).toBe(3000);
  });

  /**
   * DEUX DEMANDES CONCURRENTES PORTANT LA MEME REFERENCE.
   *
   * DISTINCT DU DOUBLE CLIC SUCCESSIF : ici les deux partent ensemble, aucune
   * ne voit l'avoir de l'autre, et c'est l'unicite
   * `(facture_id, cle_idempotence)` de `intention_remboursement` qui tranche,
   * ecrite AVANT tout appel reseau.
   *
   * L'ASSERTION NE NOMME PAS LE GAGNANT, une course n'ayant pas d'ordre garanti :
   * elle compte les issues. Nommer le gagnant rendrait ce test intermittent,
   * motif deja rencontre sur ce depot.
   */
  it("ne rembourse qu'une fois sur deux demandes concurrentes identiques", async () => {
    const { commandeId, factureId } = await commanderEtConfirmer();
    const enTetes = await sessionAdministratricePreuveFraiche();
    const fournisseur = fournisseurQuiRembourse();

    const reference = randomUUID();
    const demande = {
      commandeId,
      montantCentimes: 2000,
      motif: "Double clic simultane",
      fournisseur,
      referenceDemande: reference,
    };

    const issues = await Promise.all([
      demanderRemboursement(enTetes, demande),
      demanderRemboursement(enTetes, demande),
    ]);

    const statuts = issues.map((issue) => issue.statut).sort();

    expect(statuts).toEqual(["DEJA_DEMANDE", "REMBOURSE"]);
    expect(fournisseur.appels).toHaveLength(1);
    expect(await compterAvoirs(factureId)).toBe(1);
    expect(await cumulRembourse(commandeId)).toBe(2000);
  });
});
