/**
 * TRAITEMENT D'UNE DEMANDE DE RETRACTATION, LS-135. Parcours 5, etapes 6 a 9.
 *
 * ZONE CRITIQUE : sortie d'argent, document comptable, autorisation.
 *
 * CE QUE CETTE SUITE PROUVE AVANT TOUT, ET QUI EST UNE OBLIGATION LEGALE : le
 * remboursement est du au PREMIER des deux faits de l'article L221-24, preuve
 * d'expedition OU reception. Les deux chemins ont donc leur test, et celui du
 * retour SANS numero de suivi est le plus important : c'est le cas courant d'un
 * colis depose en point relais, et une implementation qui exigerait
 * `EXPEDITION_PROUVEE` le bloquerait indefiniment sur un droit qui est du.
 *
 * LA RECEPTION EST TESTEE HORS STATUT, regle L12. Un test qui se contenterait
 * de verifier `recueA` non nul passerait aussi sur une implementation qui pose
 * un statut au passage : l'assertion porte donc sur le statut INCHANGE, y
 * compris sur une demande deja `REMBOURSEE`, cas que LS-41 a rendu possible en
 * supprimant `RECUE`.
 *
 * LES DEUX TARIFS SONT EXERCES REELLEMENT, 410 et 499, sur des commandes SOUS
 * LE SEUIL DE FRANCHISE. Une commande au-dessus du seuil a des frais de port
 * nuls : elle rendrait le critere 4 vert sans rien prouver, les deux tarifs
 * valant alors zero tous les deux.
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
let enregistrerPreuveIdentite: typeof import("@/services/reauthentification").enregistrerPreuveIdentite;
let ouvrirAttenteRetour: typeof import("@/services/traitement-retractation").ouvrirAttenteRetour;
let enregistrerPreuveExpedition: typeof import("@/services/traitement-retractation").enregistrerPreuveExpedition;
let constaterReception: typeof import("@/services/traitement-retractation").constaterReception;
let rembourserRetractation: typeof import("@/services/traitement-retractation").rembourserRetractation;
let refuserRetractation: typeof import("@/services/traitement-retractation").refuserRetractation;
let lireMontantDu: typeof import("@/services/traitement-retractation").lireMontantDu;
let alerterRetoursJamaisRecus: typeof import("@/services/traitement-retractation").alerterRetoursJamaisRecus;
let SEUIL_RETOUR_JAMAIS_RECU_JOURS: typeof import("@/services/traitement-retractation").SEUIL_RETOUR_JAMAIS_RECU_JOURS;

const MOT_DE_PASSE_VALIDE = "phrase-de-passe1";
const EMAIL_ADMINISTRATRICE = "exploitante@exemple.fr";
const EMAIL_CLIENT = "client@exemple.fr";

/**
 * Prix de la variante, DELIBEREMENT SOUS LE SEUIL DE FRANCHISE de 3900.
 *
 * C'EST CE QUI REND LE CRITERE 4 REEL. Au-dessus du seuil la livraison est
 * offerte : les deux tarifs vaudraient zero, et un plafonnement fautif des
 * frais de port passerait inapercu.
 */
const PRIX_VARIANTE_CENTIMES = 2000;

const ADRESSE = {
  ligne1: "1 rue de Test",
  codePostal: "75001",
  ville: "TESTVILLE",
  pays: "FR" as const,
};

const CONFIGURATION = {
  relaisCentimes: 410,
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

function saisie(mode: "DOMICILE" | "POINT_RELAIS") {
  return {
    nomClient: "TEST Camille Dupont",
    email: "test@example.invalid",
    telephone: null,
    adresse: ADRESSE,
    mode,
    /*
     * LE POINT DE RETRAIT EST PLAT, jamais une adresse imbriquee.
     * `schemaPointRetrait` est un `strictObject` : une forme inventee compile
     * dans un test, Vitest ne type-checkant pas, et n'echoue qu'au
     * `npm run type-check`. Corrige le 3 septembre 2026.
     */
    pointRetrait:
      mode === "POINT_RELAIS"
        ? {
            identifiant: "FR-012345",
            nom: "TEST Relais du centre",
            ligne1: ADRESSE.ligne1,
            codePostal: ADRESSE.codePostal,
            ville: ADRESSE.ville,
          }
        : null,
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
 * Prestataire double qui enregistre ses appels.
 *
 * `appels` EST CE QUI PROUVE L'ABSENCE D'EFFET sur un refus : une valeur rendue
 * ne distingue pas « refuse avant l'appel » de « refuse apres avoir rembourse ».
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

/** Prestataire qui rembourse exactement ce qu'on lui demande. */
function fournisseurQuiRembourse(): ReturnType<typeof fournisseurDouble> {
  return fournisseurDouble(async (demande) => ({
    issue: "REMBOURSE",
    identifiantRemboursement: `re_test_${randomUUID().slice(0, 8)}`,
    montantCentimes: demande.montantCentimes,
  }));
}

/**
 * Ouvre une session, et promeut le compte si le role le demande.
 *
 * REPRIS DE `remboursement-garde.sequential.test.ts` : la session est une VRAIE
 * session Better Auth, le cookie etant signe HMAC. Le fabriquer a la main
 * testerait la fabrication et non la garde.
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

/** Session d'administratrice ayant deja prouve son identite. */
async function sessionAdministratrice(): Promise<Headers> {
  const { enTetes, sessionId } = await ouvrirSession(
    EMAIL_ADMINISTRATRICE,
    "ADMINISTRATRICE",
  );
  await enregistrerPreuveIdentite(sessionId);
  return enTetes;
}

/**
 * Passe une commande sous le seuil, la confirme, et depose une retractation.
 *
 * TOUT PASSE PAR LES SERVICES, jamais par un `INSERT` : reproduire la mecanique
 * a la main testerait la reproduction, piege rencontre le 25 aout 2026.
 */
async function commanderEtDeposer(
  mode: "DOMICILE" | "POINT_RELAIS" = "DOMICILE",
): Promise<{
  commandeId: string;
  demandeId: string;
  fraisPortCentimes: number;
  totalCentimes: number;
}> {
  const { varianteId } = await creerVarianteEnStock(client);

  /*
   * LE PRIX EST BAISSE APRES CREATION, l'aide partagee ne l'exposant pas. C'est
   * une fixture : ce que le test mesure est le montant rembourse, pas le prix.
   */
  await client.query("UPDATE variante SET prix_centimes = $1 WHERE id = $2", [
    PRIX_VARIANTE_CENTIMES,
    varianteId,
  ]);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: saisie(mode),
    configuration: CONFIGURATION,
  });

  const { rows: avant } = await client.query<{
    frais_port_centimes: number;
    total_centimes: number;
  }>("SELECT frais_port_centimes, total_centimes FROM commande WHERE id = $1", [
    issue.commandeId,
  ]);

  const evenement: EvenementPaiement = {
    identifiant: `evt_test_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId: issue.commandeId,
    identifiantSession: `cs_test_${issue.commandeId.slice(0, 8)}`,
    montantCentimes: avant[0]!.total_centimes,
    montantRembourseCentimes: 0,
    charge: { source: "test" },
  };

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: verificateurDouble(evenement),
  });

  const demandeId = randomUUID();
  await client.query(
    `INSERT INTO demande_retractation (id, commande_id, statut, deposee_a)
     VALUES ($1, $2, 'DEPOSEE'::"StatutRetractation", now())`,
    [demandeId, issue.commandeId],
  );

  return {
    commandeId: issue.commandeId,
    demandeId,
    fraisPortCentimes: avant[0]!.frais_port_centimes,
    totalCentimes: avant[0]!.total_centimes,
  };
}

/** Le statut et les horodatages d'une demande, lus en base. */
async function lireDemande(demandeId: string): Promise<{
  statut: string;
  recue_a: Date | null;
  preuve_expedition_a: Date | null;
  montant_rembourse_centimes: number | null;
  motif_decision: string | null;
}> {
  const { rows } = await client.query(
    `SELECT statut, recue_a, preuve_expedition_a, montant_rembourse_centimes,
            motif_decision
     FROM demande_retractation WHERE id = $1`,
    [demandeId],
  );

  return rows[0]!;
}

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
  ({ enregistrerPreuveIdentite } =
    await import("@/services/reauthentification"));
  ({
    ouvrirAttenteRetour,
    enregistrerPreuveExpedition,
    constaterReception,
    rembourserRetractation,
    refuserRetractation,
    lireMontantDu,
    alerterRetoursJamaisRecus,
    SEUIL_RETOUR_JAMAIS_RECU_JOURS,
  } = await import("@/services/traitement-retractation"));
});

/*
 * LE NETTOYAGE VA JUSQU'AUX COMMANDES, defaut reel trouve par la CI sur le
 * fichier voisin : un fichier qui laisse des lignes derriere lui casse ses
 * successeurs, et seulement selon l'ordre d'execution.
 */
afterEach(async () => {
  await client.query("DELETE FROM alerte_critique");
  await client.query("DELETE FROM envoi_en_attente");
  await client.query("DELETE FROM avoir");
  await client.query("DELETE FROM intention_remboursement");
  await client.query("DELETE FROM demande_retractation");
  await client.query("DELETE FROM jeton_acces");
  await client.query("DELETE FROM expedition");
  /*
   * LA TABLE S'APPELLE `compte`, JAMAIS `account`. Better Auth nomme son modele
   * `Account`, et le schema le mappe en francais comme le reste du projet : un
   * `DELETE FROM account` echoue en « relation does not exist » et fait rougir
   * TOUS les tests du fichier, y compris ceux qui n'ouvrent aucune session.
   */
  await client.query("DELETE FROM session");
  await client.query("DELETE FROM compte");
  await client.query("DELETE FROM utilisateur");
  await client.query(
    "TRUNCATE reservation, ligne_commande, paiement, evenement_fournisseur, mouvement_stock, historique_statut, facture, commande, variante, produit, categorie, compteur_numero CASCADE",
  );
});

afterAll(async () => {
  await client.end();
});

describe("le remboursement est du au premier des deux faits, L221-24", () => {
  /*
   * CRITERE 1, ET C'EST LE TEST LE PLUS IMPORTANT DE CETTE SUITE.
   *
   * Il exerce le retour SANS numero de suivi, cas courant du colis depose en
   * point relais. Une implementation qui exigerait `EXPEDITION_PROUVEE` avant
   * de rembourser le bloquerait indefiniment, sur un droit qui est du.
   */
  it("rembourse un retour recu SANS jamais voir EXPEDITION_PROUVEE", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REMBOURSE");

    const demande = await lireDemande(demandeId);
    expect(demande.statut).toBe("REMBOURSEE");
    /*
     * L'ASSERTION QUI PORTE LE CRITERE : la preuve d'expedition n'a JAMAIS ete
     * renseignee. Un code qui la poserait pour « debloquer la transition »
     * detruirait sa valeur probatoire, et ce test le verrait.
     */
    expect(demande.preuve_expedition_a).toBeNull();
    expect(demande.montant_rembourse_centimes).toBe(totalCentimes);
  });

  /* CRITERE 2, l'autre fait de L221-24, sans que le colis soit arrive. */
  it("rembourse sur preuve d'expedition seule, colis non recu", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await enregistrerPreuveExpedition(demandeId, "1Z-TEST-SUIVI");

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REMBOURSE");

    const demande = await lireDemande(demandeId);
    expect(demande.statut).toBe("REMBOURSEE");
    /* LE COLIS N'EST TOUJOURS PAS LA, et le remboursement est pourtant parti. */
    expect(demande.recue_a).toBeNull();
  });

  /*
   * LE SEUL CAS OU LE REMBOURSEMENT SE DIFFERE LEGITIMEMENT, cas d'erreur du
   * parcours 5 : aucun des deux faits n'est survenu.
   */
  it("differe le remboursement quand aucun des deux faits n'est survenu", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("AUCUN_FAIT_DECLENCHEUR");
    /* AUCUN APPEL SORTANT : la valeur rendue ne le prouverait pas seule. */
    expect(fournisseur.appels).toHaveLength(0);

    const demande = await lireDemande(demandeId);
    expect(demande.statut).toBe("RETOUR_ATTENDU");
    expect(demande.montant_rembourse_centimes).toBeNull();
  });
});

describe("la reception se constate hors statut, regle L12", () => {
  /*
   * CRITERE 3, ET IL PORTE LE PIEGE QUE LS-41 A FERME.
   *
   * Un test qui verifierait seulement `recueA` non nul passerait aussi sur une
   * implementation qui pose un statut : l'assertion porte donc sur le statut
   * INCHANGE apres reception sur une demande DEJA remboursee.
   */
  it("horodate recueA sur une demande REMBOURSEE sans faire regresser son statut", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await enregistrerPreuveExpedition(demandeId, "1Z-TEST-SUIVI");
    await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect((await lireDemande(demandeId)).statut).toBe("REMBOURSEE");

    /* LE COLIS ARRIVE APRES LE VERSEMENT, cas que le modele autorise. */
    const issue = await constaterReception(demandeId);

    expect(issue.statut).toBe("HORODATEE");

    const demande = await lireDemande(demandeId);
    expect(demande.recue_a).not.toBeNull();
    /*
     * L'ASSERTION CENTRALE. Un statut `RECUE` ferait disparaitre cette demande
     * de toute liste filtree sur `REMBOURSEE`, et l'exploitante la croirait
     * non remboursee.
     */
    expect(demande.statut).toBe("REMBOURSEE");
  });

  it("refuse une seconde reception, un colis ne se recoit qu'une fois", async () => {
    const { demandeId } = await commanderEtDeposer();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    const premiere = await lireDemande(demandeId);
    const issue = await constaterReception(demandeId);

    expect(issue.statut).toBe("DEJA_RECUE");

    /* LA DATE N'A PAS BOUGE : elle declenche le mouvement de stock, regle S8. */
    const seconde = await lireDemande(demandeId);
    expect(seconde.recue_a?.getTime()).toBe(premiere.recue_a?.getTime());
  });

  it("constate la reception sans ecrire le moindre mouvement de stock", async () => {
    const { commandeId, demandeId } = await commanderEtDeposer();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    /*
     * ADR-030 ET REGLE S8 : la reintegration depend de l'ETAT REEL de la piece,
     * que seule l'exploitante constate. Un bijou revenu casse ne retourne pas
     * au catalogue.
     */
    const { rows } = await client.query(
      "SELECT type FROM mouvement_stock WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows.map((ligne) => ligne.type)).toEqual(["VENTE_WEB"]);
  });
});

describe("les frais de livraison se remboursent au tarif reellement paye", () => {
  /*
   * CRITERE 4, SUR LES DEUX TARIFS REELS.
   *
   * L'article L221-24 alinea 4 permettrait de plafonner au mode standard :
   * `legal.md` ecarte cette faculte. Un plafonnement au tarif le plus bas
   * rendrait 410 sur une commande a domicile, et ce test le verrait.
   */
  it("rembourse 410 de frais de port en point relais", async () => {
    const { commandeId, fraisPortCentimes } =
      await commanderEtDeposer("POINT_RELAIS");

    expect(fraisPortCentimes).toBe(410);

    const montant = await lireMontantDu(commandeId);

    expect(montant?.fraisPortCentimes).toBe(410);
    expect(montant?.totalCentimes).toBe(PRIX_VARIANTE_CENTIMES + 410);
  });

  it("rembourse 499 de frais de port a domicile, sans plafonner au tarif relais", async () => {
    const { commandeId, fraisPortCentimes } =
      await commanderEtDeposer("DOMICILE");

    expect(fraisPortCentimes).toBe(499);

    const montant = await lireMontantDu(commandeId);

    /*
     * L'ASSERTION QUI FERME LE PLAFONNEMENT : 499 et non 410. Rendre le tarif
     * relais ici serait l'infraction que `legal.md` nomme.
     */
    expect(montant?.fraisPortCentimes).toBe(499);
    expect(montant?.totalCentimes).toBe(PRIX_VARIANTE_CENTIMES + 499);
  });

  it("rembourse reellement le total frais de port compris", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer("DOMICILE");
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REMBOURSE");
    /* L'ARGENT REELLEMENT DEMANDE AU PRESTATAIRE porte les frais de port. */
    expect(fournisseur.appels[0]?.montantCentimes).toBe(
      PRIX_VARIANTE_CENTIMES + 499,
    );
  });

  it("refuse un montant superieur au total paye", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes + 1,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("MONTANT_SUPERIEUR_AU_DU");
    expect(fournisseur.appels).toHaveLength(0);
  });
});

describe("un remboursement produit un avoir, jamais une facture modifiee", () => {
  /* CRITERE 5, invariant 4. */
  it("emet un avoir et laisse la facture intacte", async () => {
    const enTetes = await sessionAdministratrice();
    const { commandeId, demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    const { rows: avant } = await client.query(
      "SELECT id, numero, montant_total_centimes FROM facture WHERE commande_id = $1",
      [commandeId],
    );

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);
    await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    const { rows: avoirs } = await client.query(
      "SELECT numero, montant_centimes FROM avoir WHERE facture_id = $1",
      [avant[0]!.id],
    );

    expect(avoirs).toHaveLength(1);
    /* SEQUENCE DISTINCTE, regle F4 : `A-` et non `F-`. */
    expect(avoirs[0]!.numero).toMatch(/^A-\d{4}-\d{4}$/);
    expect(avoirs[0]!.montant_centimes).toBe(totalCentimes);

    const { rows: apres } = await client.query(
      "SELECT numero, montant_total_centimes FROM facture WHERE commande_id = $1",
      [commandeId],
    );

    /* LA FACTURE N'A PAS BOUGE D'UN OCTET, invariant 4. */
    expect(apres[0]!.numero).toBe(avant[0]!.numero);
    expect(apres[0]!.montant_total_centimes).toBe(
      avant[0]!.montant_total_centimes,
    );
  });
});

describe("le refus exige son motif, regle L2", () => {
  /* CRITERE 6. */
  it("refuse un refus sans motif", async () => {
    const { demandeId } = await commanderEtDeposer();

    const issue = await refuserRetractation(demandeId, "   ");

    expect(issue.statut).toBe("MOTIF_REQUIS");

    /* LE STATUT N'A PAS BOUGE : aucune demande refusee sans sa justification. */
    expect((await lireDemande(demandeId)).statut).toBe("DEPOSEE");
  });

  it("accepte un refus motive et conserve le motif", async () => {
    const { demandeId } = await commanderEtDeposer();

    const issue = await refuserRetractation(
      demandeId,
      "Piece personnalisee a la demande, article L221-28 3",
    );

    expect(issue.statut).toBe("APPLIQUEE");

    const demande = await lireDemande(demandeId);
    expect(demande.statut).toBe("REFUSEE");
    expect(demande.motif_decision).toContain("L221-28");
  });

  it("ne refuse plus une demande deja remboursee", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);
    await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    const issue = await refuserRetractation(demandeId, "Motif quelconque");

    /* L'ARGENT EST PARTI : un refus contredirait un versement reel. */
    expect(issue.statut).toBe("STATUT_INCOMPATIBLE");
    expect((await lireDemande(demandeId)).statut).toBe("REMBOURSEE");
  });
});

describe("le colis jamais revenu produit une alerte, regle L13", () => {
  /* CRITERE 7. */
  it("alerte sur une demande remboursee dont le colis n'est jamais arrive", async () => {
    const enTetes = await sessionAdministratrice();
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await enregistrerPreuveExpedition(demandeId, "1Z-TEST-SUIVI");
    await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    /* LE SEUIL EST FRANCHI EN VIEILLISSANT `retourAttenduA`, jamais en dormant. */
    await client.query(
      `UPDATE demande_retractation
       SET retour_attendu_a = now() - make_interval(days => $1)
       WHERE id = $2`,
      [SEUIL_RETOUR_JAMAIS_RECU_JOURS + 1, demandeId],
    );

    const { alertees } = await alerterRetoursJamaisRecus();

    expect(alertees).toBe(1);

    const { rows } = await client.query(
      "SELECT type, gravite, id_cible FROM alerte_critique WHERE type = 'RETOUR_JAMAIS_RECU'",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id_cible).toBe(demandeId);
    expect(rows[0]!.gravite).toBe("CRITIQUE");
  });

  it("n'ecrit aucun mouvement de stock en alertant", async () => {
    const enTetes = await sessionAdministratrice();
    const { commandeId, demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);
    await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    await client.query(
      `UPDATE demande_retractation
       SET retour_attendu_a = now() - make_interval(days => $1), recue_a = NULL
       WHERE id = $2`,
      [SEUIL_RETOUR_JAMAIS_RECU_JOURS + 1, demandeId],
    );

    await alerterRetoursJamaisRecus();

    /* AUCUN `RETOUR` ECRIT : un colis peut arriver trois semaines plus tard. */
    const { rows } = await client.query(
      "SELECT type FROM mouvement_stock WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows.map((ligne) => ligne.type)).toEqual(["VENTE_WEB"]);
  });

  it("n'alerte pas sur un retour recu, ni sur un seuil non atteint", async () => {
    const enTetes = await sessionAdministratrice();
    const recu = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(recu.demandeId);
    await constaterReception(recu.demandeId);
    await rembourserRetractation(enTetes, {
      demandeId: recu.demandeId,
      montantCentimes: recu.totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    /* VIEILLI AU-DELA DU SEUIL, MAIS LE COLIS EST LA. */
    await client.query(
      `UPDATE demande_retractation
       SET retour_attendu_a = now() - make_interval(days => $1)
       WHERE id = $2`,
      [SEUIL_RETOUR_JAMAIS_RECU_JOURS + 1, recu.demandeId],
    );

    const { alertees } = await alerterRetoursJamaisRecus();

    expect(alertees).toBe(0);
  });
});

describe("test negatif de securite, la garde vit dans le service", () => {
  /*
   * CRITERE 8. Il exerce `rembourserRetractation`, qui delegue les deux gardes
   * a `demanderRemboursement` : un test qui n'exercerait que cette derniere ne
   * dirait rien du chemin reellement emprunte par l'ecran.
   */
  it("refuse un remboursement sans aucune session", async () => {
    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    const issue = await rembourserRetractation(new Headers(), {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("SESSION_ABSENTE");
    expect(fournisseur.appels).toHaveLength(0);
    expect((await lireDemande(demandeId)).statut).toBe("DEPOSEE");
  });

  it("refuse un remboursement demande par un compte CLIENT", async () => {
    const { enTetes, sessionId } = await ouvrirSession(EMAIL_CLIENT, "CLIENT");
    await enregistrerPreuveIdentite(sessionId);

    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    /*
     * UN CLIENT A UNE PREUVE D'IDENTITE FRAICHE ET NE PASSE PAS : c'est le role
     * qui manque, et les deux gardes repondent bien a deux questions distinctes.
     */
    expect(issue.statut).toBe("SESSION_ABSENTE");
    expect(fournisseur.appels).toHaveLength(0);
  });

  it("refuse un remboursement sans preuve d'identite recente", async () => {
    const { enTetes } = await ouvrirSession(
      EMAIL_ADMINISTRATRICE,
      "ADMINISTRATRICE",
    );

    const { demandeId, totalCentimes } = await commanderEtDeposer();
    const fournisseur = fournisseurQuiRembourse();

    await ouvrirAttenteRetour(demandeId);
    await constaterReception(demandeId);

    const issue = await rembourserRetractation(enTetes, {
      demandeId,
      montantCentimes: totalCentimes,
      fournisseur,
      referenceDemande: randomUUID(),
    });

    expect(issue.statut).toBe("REAUTHENTIFICATION_REQUISE");
    expect(fournisseur.appels).toHaveLength(0);
  });
});

describe("les transitions sont conditionnees a l'etat lu", () => {
  it("refuse une preuve d'expedition sur une demande non en attente de retour", async () => {
    const { demandeId } = await commanderEtDeposer();

    const issue = await enregistrerPreuveExpedition(demandeId, "1Z-TEST");

    expect(issue.statut).toBe("STATUT_INCOMPATIBLE");
    if (issue.statut === "STATUT_INCOMPATIBLE") {
      expect(issue.statutActuel).toBe("DEPOSEE");
    }
  });

  it("rend INTROUVABLE sur une demande inexistante", async () => {
    const issue = await ouvrirAttenteRetour(randomUUID());

    expect(issue.statut).toBe("INTROUVABLE");
  });

  it("ne rejoue pas une transition deja appliquee", async () => {
    const { demandeId } = await commanderEtDeposer();

    await ouvrirAttenteRetour(demandeId);
    const premiere = await client.query<{ retour_attendu_a: Date }>(
      "SELECT retour_attendu_a FROM demande_retractation WHERE id = $1",
      [demandeId],
    );

    const issue = await ouvrirAttenteRetour(demandeId);

    expect(issue.statut).toBe("STATUT_INCOMPATIBLE");

    /*
     * L'HORODATAGE N'A PAS BOUGE, regle L8. Un `update` sur l'identifiant seul
     * l'aurait reecrit, et le seuil d'alerte serait reparti de zero.
     */
    const seconde = await client.query<{ retour_attendu_a: Date }>(
      "SELECT retour_attendu_a FROM demande_retractation WHERE id = $1",
      [demandeId],
    );

    expect(seconde.rows[0]!.retour_attendu_a.getTime()).toBe(
      premiere.rows[0]!.retour_attendu_a.getTime(),
    );
  });
});
