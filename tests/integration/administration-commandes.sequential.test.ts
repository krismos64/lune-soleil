/**
 * ADMINISTRATION DES COMMANDES, LS-121. Etapes 10 a 12 du parcours 1.
 *
 * ECRIT AVANT L'ECRAN, exigence du plan directeur en zone critique : la garde de
 * role et l'historisation sont des garanties de securite et de tracabilite, pas
 * des details d'affichage.
 *
 * OU VIT LA PREUVE DE LA GARDE DE ROLE, ET POURQUOI PAS ICI. La Server Action
 * appelle `headers()` de Next.js, qui exige un contexte de requete : hors du
 * serveur, elle leve avant d'atteindre la moindre verification, et un test
 * d'integration mesurerait cette limite de l'outil plutot que la garde.
 *
 * Le test negatif vit donc dans `tests/e2e/catalogue-administration.spec.ts`,
 * qui invoque les routes d'administration par HTTP sans session, exactement
 * comme un attaquant le ferait. C'est le motif de LS-89, retrouve en LS-106 :
 * un ecran qui n'affiche pas un bouton n'empeche personne d'invoquer l'action.
 *
 * CE FICHIER PROUVE CE QUI RESTE, et qui n'est pas moindre : la table des
 * transitions, l'historisation avec son acteur, et le figement des lignes.
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

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let listerCommandes: typeof import("@/services/administration-commandes").listerCommandes;
let lireDetailCommande: typeof import("@/services/administration-commandes").lireDetailCommande;
let changerStatutCommande: typeof import("@/services/administration-commandes").changerStatutCommande;
let TRANSITIONS_ADMINISTRATRICE: typeof import("@/services/administration-commandes").TRANSITIONS_ADMINISTRATRICE;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;

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
  domicileCentimes: 749,
  seuilFranchiseCentimes: 3900,
};

/*
 * DEUX NOMBRES ET NON UN. Ils ont longtemps ete confondus sous une constante
 * unique, ce qui marchait tant que la livraison etait offerte : le prix de la
 * ligne et le total de la commande valaient tous deux 4900.
 *
 * ADR-035 les separe, le domicile n'etant plus jamais offert. Les garder
 * confondus ferait passer une assertion de prix FIGE pour une assertion de
 * total, alors que l'invariant 3 porte precisement sur leur independance.
 */
const PRIX_LIGNE_FIGE_CENTIMES = 4900;
const TOTAL_ATTENDU_CENTIMES = PRIX_LIGNE_FIGE_CENTIMES + 749;

/** Identifiant d'une administratrice reelle, pour renseigner `acteurId`. */
let administratriceId: string;

async function commanderUnePiece(): Promise<{
  commandeId: string;
  varianteId: string;
}> {
  const { varianteId } = await creerVarianteEnStock(client);

  const issue = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

  return { commandeId: issue.commandeId, varianteId };
}

/** Confirme la commande par le chemin reel, LS-119, pour partir de CONFIRMEE. */
async function confirmer(commandeId: string): Promise<void> {
  const evenement: EvenementPaiement = {
    identifiant: `evt_${randomUUID()}`,
    type: "PAIEMENT_REUSSI",
    commandeId,
    identifiantSession: `cs_${commandeId.slice(0, 8)}`,
    montantCentimes: TOTAL_ATTENDU_CENTIMES,
    montantRembourseCentimes: 0,
    charge: {},
  };

  await traiterEvenementPaiement({
    corpsBrut: JSON.stringify(evenement),
    signature: "signature-de-test",
    verificateur: {
      async verifier() {
        return evenement;
      },
    },
  });
}

async function lireStatut(commandeId: string): Promise<string> {
  const { rows } = await client.query<{ statut: string }>(
    "SELECT statut FROM commande WHERE id = $1",
    [commandeId],
  );

  return rows[0]?.statut ?? "INTROUVABLE";
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({
    listerCommandes,
    lireDetailCommande,
    changerStatutCommande,
    TRANSITIONS_ADMINISTRATRICE,
  } = await import("@/services/administration-commandes"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));

  administratriceId = randomUUID();
  await client.query(
    `INSERT INTO utilisateur (id, email, email_verifie, nom, role, cree_a, mis_a_jour_a)
     VALUES ($1, 'admin-test@example.invalid', true, 'TEST Administratrice', 'ADMINISTRATRICE', now(), now())`,
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

describe("listerCommandes", () => {
  it("montre les commandes en attente, avec leur etat d'encaissement", async () => {
    const enAttente = await commanderUnePiece();
    const payee = await commanderUnePiece();
    await confirmer(payee.commandeId);

    const { commandes } = await listerCommandes();

    /*
     * LES COMMANDES EN ATTENTE SONT VISIBLES, et c'est demande : elles disent a
     * l'exploitante ce qui se passe en ce moment, et une accumulation soudaine
     * est le signe d'une panne de paiement.
     */
    const parId = new Map(commandes.map((c) => [c.id, c]));

    expect(parId.get(enAttente.commandeId)?.statut).toBe("EN_ATTENTE_PAIEMENT");
    expect(parId.get(payee.commandeId)?.statut).toBe("CONFIRMEE");

    /*
     * `encaissee` EST UN AXE DISTINCT DU STATUT, `payments.md`. Une commande
     * peut etre encaissee sans que le statut ait suivi, fenetre que LS-118
     * documente : l'ecran doit pouvoir montrer les deux.
     */
    expect(parId.get(enAttente.commandeId)?.encaissee).toBe(false);
    expect(parId.get(payee.commandeId)?.encaissee).toBe(true);
  });

  it("filtre par statut", async () => {
    const enAttente = await commanderUnePiece();
    const payee = await commanderUnePiece();
    await confirmer(payee.commandeId);

    const { commandes: confirmees } = await listerCommandes({
      statut: "CONFIRMEE",
    });

    expect(confirmees.map((c) => c.id)).toEqual([payee.commandeId]);
    expect(confirmees.map((c) => c.id)).not.toContain(enAttente.commandeId);
  });

  it("rend une liste vide sans commande, et non une erreur", async () => {
    // L'ETAT VIDE EST UN ETAT, pas un incident : l'ecran affiche un message.
    /* LA FORME A CHANGE EN LS-163, la liste portant desormais son drapeau de
     * troncature : l'etat vide reste un etat, jamais un incident. */
    await expect(listerCommandes()).resolves.toEqual({
      commandes: [],
      tronquee: false,
    });
  });
});

describe("lireDetailCommande", () => {
  it("montre les lignes FIGEES, jamais le catalogue actuel", async () => {
    const { commandeId, varianteId } = await commanderUnePiece();

    const avant = await lireDetailCommande(commandeId);
    const ligneAvant = avant?.lignes[0];

    /*
     * LE CATALOGUE CHANGE APRES LA COMMANDE : prix double, libelle reecrit.
     * C'est le scenario que l'invariant 3 existe pour couvrir, et le seul qui
     * distingue une copie figee d'une jointure.
     */
    await client.query(
      "UPDATE variante SET prix_centimes = 9800, libelle = 'LIBELLE REECRIT' WHERE id = $1",
      [varianteId],
    );

    const apres = await lireDetailCommande(commandeId);
    const ligneApres = apres?.lignes[0];

    expect(ligneApres).toEqual(ligneAvant);
    expect(ligneApres?.prixFigeCentimes).toBe(PRIX_LIGNE_FIGE_CENTIMES);
    expect(ligneApres?.libelleVarianteFige).not.toBe("LIBELLE REECRIT");

    // Le total de la commande ne bouge pas non plus.
    expect(apres?.totalCentimes).toBe(TOTAL_ATTENDU_CENTIMES);
  });

  it("porte les transitions permises depuis l'etat courant", async () => {
    const { commandeId } = await commanderUnePiece();

    const enAttente = await lireDetailCommande(commandeId);

    /*
     * AUCUNE TRANSITION MANUELLE DEPUIS `EN_ATTENTE_PAIEMENT`. Confirmer a la
     * main une commande non payee ferait expedier une piece sans encaissement.
     */
    expect(enAttente?.transitionsPossibles).toEqual([]);

    await confirmer(commandeId);
    const confirmee = await lireDetailCommande(commandeId);

    expect(confirmee?.transitionsPossibles).toEqual([
      "EN_PREPARATION",
      "ANNULEE",
    ]);
  });

  it("rend null sur une commande inexistante", async () => {
    await expect(lireDetailCommande(randomUUID())).resolves.toBeNull();
  });
});

describe("changerStatutCommande", () => {
  it("fait avancer la commande et historise avec l'acteur", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    const issue = await changerStatutCommande({
      commandeId,
      nouveauStatut: "EN_PREPARATION",
      acteurId: administratriceId,
    });

    expect(issue).toEqual({
      statut: "SUCCES",
      nouveauStatut: "EN_PREPARATION",
    });
    expect(await lireStatut(commandeId)).toBe("EN_PREPARATION");

    const { rows } = await client.query<{
      statut_precedent: string | null;
      statut_nouveau: string;
      acteur_id: string | null;
      origine: string;
    }>(
      `SELECT statut_precedent, statut_nouveau, acteur_id, origine
       FROM historique_statut WHERE commande_id = $1 ORDER BY cree_a`,
      [commandeId],
    );

    /*
     * DEUX LIGNES : celle du webhook, puis celle de l'exploitante. C'est la
     * distinction qui permet de savoir, six mois plus tard, si une commande a
     * ete avancee par une personne ou par une tache, regle S9.
     */
    expect(rows).toEqual([
      {
        statut_precedent: "EN_ATTENTE_PAIEMENT",
        statut_nouveau: "CONFIRMEE",
        acteur_id: null,
        origine: "SYSTEME",
      },
      {
        statut_precedent: "CONFIRMEE",
        statut_nouveau: "EN_PREPARATION",
        acteur_id: administratriceId,
        origine: "ADMIN",
      },
    ]);
  });

  it("refuse une transition non permise sans rien ecrire", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    /*
     * `EXPEDIEE` DEPUIS `CONFIRMEE` SAUTE LA PREPARATION. Le refus porte l'etat
     * REEL, pour que l'ecran puisse le dire plutot qu'un message opaque.
     */
    const issue = await changerStatutCommande({
      commandeId,
      nouveauStatut: "EXPEDIEE",
      acteurId: administratriceId,
    });

    expect(issue).toEqual({
      statut: "TRANSITION_REFUSEE",
      statutActuel: "CONFIRMEE",
    });
    expect(await lireStatut(commandeId)).toBe("CONFIRMEE");

    // AUCUN HISTORIQUE INVENTE : seule la ligne du webhook subsiste.
    const { rows } = await client.query(
      "SELECT id FROM historique_statut WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows).toHaveLength(1);
  });

  it("n'atteint JAMAIS LIVREE, quel que soit l'etat de depart", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    await changerStatutCommande({
      commandeId,
      nouveauStatut: "EN_PREPARATION",
      acteurId: administratriceId,
    });
    await changerStatutCommande({
      commandeId,
      nouveauStatut: "EXPEDIEE",
      acteurId: administratriceId,
    });

    /*
     * CRITERE 4, ET C'EST UNE REGLE JURIDIQUE AUTANT QUE TECHNIQUE. `LIVREE`
     * ne se suppose jamais sans source fiable, `payments.md` : la date de
     * livraison fait courir le delai de retractation, et l'inventer d'un clic
     * ferait partir ce delai d'une date fausse. Comment le site l'apprend est
     * la decision de LS-33, non prise.
     */
    const issue = await changerStatutCommande({
      commandeId,
      nouveauStatut: "LIVREE",
      acteurId: administratriceId,
    });

    expect(issue).toEqual({
      statut: "TRANSITION_REFUSEE",
      statutActuel: "EXPEDIEE",
    });
    expect(await lireStatut(commandeId)).toBe("EXPEDIEE");

    // La table elle-meme ne propose LIVREE nulle part.
    const cibles = Object.values(TRANSITIONS_ADMINISTRATRICE).flat();
    expect(cibles).not.toContain("LIVREE");
  });

  it("ne touche pas au statut de paiement, axes distincts", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    await changerStatutCommande({
      commandeId,
      nouveauStatut: "ANNULEE",
      acteurId: administratriceId,
    });

    /*
     * LA COMMANDE EST ANNULEE, LE PAIEMENT RESTE `REUSSI`. L'argent a bien ete
     * encaisse : forcer le paiement a un autre etat ferait mentir la
     * comptabilite, et le remboursement est un geste distinct, ADR-032.
     */
    expect(await lireStatut(commandeId)).toBe("ANNULEE");

    const { rows } = await client.query<{ statut: string }>(
      "SELECT statut FROM paiement WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows).toEqual([{ statut: "REUSSI" }]);
  });

  it("refuse un identifiant qui n'est pas une commande", async () => {
    await expect(
      changerStatutCommande({
        commandeId: randomUUID(),
        nouveauStatut: "EN_PREPARATION",
        acteurId: administratriceId,
      }),
    ).resolves.toEqual({ statut: "INTROUVABLE" });
  });

  it("rejette un identifiant difforme avant toute lecture", async () => {
    /*
     * INVARIANT 7 : l'entree non fiable est validee cote serveur. L'identifiant
     * vient d'une URL ou d'un formulaire, donc il n'autorise rien et doit
     * d'abord etre reconnu comme identifiant.
     */
    await expect(
      changerStatutCommande({
        commandeId: "pas-un-identifiant",
        nouveauStatut: "EN_PREPARATION",
        acteurId: administratriceId,
      }),
    ).rejects.toThrow();
  });
});

/**
 * ACHEMINEMENT DU COLIS SUR LE DETAIL, LS-216.
 *
 * CE QUI SE PROUVE ICI EST LA LECTURE, et c'est ce dont l'ecran depend : quatre
 * champs ecrits par la tache de LS-131 doivent remonter jusqu'au rendu. Ils
 * n'etaient lus par AUCUN ecran d'administration avant cette story, mesure du
 * 10 septembre 2026 : l'exploitante saisissait un numero de suivi et ne le
 * revoyait jamais.
 *
 * L'EXPEDITION EST ECRITE EN SQL ET NON PAR `declarerExpedition`, DELIBEREMENT.
 * Le service refuse d'ecrire `statutTransporteur`, `livreA` et `synchroniseA`,
 * qui appartiennent au suivi automatique : passer par lui rendrait ces trois
 * colonnes nulles, donc intestables. Ce que ces cas eprouvent est l'etat de la
 * base APRES un cycle de synchronisation, pas le chemin qui l'a produit.
 */
describe("acheminement du colis sur le detail de commande", () => {
  /**
   * Ecrit une expedition dans l'etat ou la synchronisation la laisserait.
   *
   * `pointRelaisId` SUIT LE MODE ET N'EST PAS UN PARAMETRE LIBRE.
   * `chk_expedition_mode_point_relais` est une EQUIVALENCE portant sur les DEUX
   * modes de retrait, `POINT_RELAIS` ET `LOCKER` : le nom de la contrainte ne
   * cite que le premier, ce qui laisse croire que le second en est exempt. Il
   * ne l'est pas, mesure ici le 10 septembre 2026 sur un `INSERT` refuse.
   *
   * Le deduire du mode plutot que de le passer ferme le cas des deux cotes :
   * un retrait sans point viole la contrainte, un domicile AVEC point la viole
   * aussi.
   */
  async function poserExpedition(
    commandeId: string,
    champs: {
      mode?: string;
      numeroSuivi?: string | null;
      statutTransporteur?: string | null;
      livreA?: Date | null;
      synchroniseA?: Date | null;
    } = {},
  ): Promise<void> {
    const mode = champs.mode ?? "DOMICILE";
    const pointRelaisId =
      mode === "POINT_RELAIS" || mode === "LOCKER" ? "FR-12345" : null;

    await client.query(
      `INSERT INTO expedition
         (id, commande_id, transporteur, mode, numero_suivi, point_relais_id,
          statut_transporteur, expedie_a, livre_a, synchronise_a, cree_a)
       VALUES ($1, $2, 'Sendcloud', $3::"ModeLivraison", $4, $5, $6, now(), $7, $8, now())`,
      [
        randomUUID(),
        commandeId,
        mode,
        champs.numeroSuivi === undefined ? "3SABCD1234567" : champs.numeroSuivi,
        pointRelaisId,
        champs.statutTransporteur === undefined
          ? null
          : champs.statutTransporteur,
        champs.livreA ?? null,
        champs.synchroniseA ?? null,
      ],
    );
  }

  it("remonte les quatre champs du suivi jusqu'au detail", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    const livreA = new Date("2026-09-09T10:00:00.000Z");
    const synchroniseA = new Date("2026-09-09T10:05:00.000Z");

    await poserExpedition(commandeId, {
      numeroSuivi: "3SABCD7654321",
      statutTransporteur: "Delivered",
      livreA,
      synchroniseA,
    });

    const detail = await lireDetailCommande(commandeId);

    expect(detail?.expedition).toMatchObject({
      transporteur: "Sendcloud",
      mode: "DOMICILE",
      numeroSuivi: "3SABCD7654321",
      statutTransporteur: "Delivered",
    });
    expect(detail?.expedition?.livreA?.toISOString()).toBe(
      livreA.toISOString(),
    );
    expect(detail?.expedition?.synchroniseA?.toISOString()).toBe(
      synchroniseA.toISOString(),
    );
  });

  /*
   * LE CAS QUI DISTINGUE CETTE STORY DE SON APPARENCE. Sans `synchroniseA`
   * remonte, l'ecran ne peut pas distinguer « lu il y a dix minutes » de « plus
   * rien depuis trois jours », et le critere 4 devient invérifiable : les deux
   * afficheraient le meme dernier statut connu.
   */
  it("remonte synchroniseA meme quand le colis n'est pas livre", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    const synchroniseA = new Date("2026-09-01T08:00:00.000Z");

    await poserExpedition(commandeId, {
      statutTransporteur: "Awaiting customer pickup",
      livreA: null,
      synchroniseA,
    });

    const detail = await lireDetailCommande(commandeId);

    expect(detail?.expedition?.livreA).toBeNull();
    expect(detail?.expedition?.synchroniseA?.toISOString()).toBe(
      synchroniseA.toISOString(),
    );
  });

  /*
   * CRITERE 3, ET C'EST LE PLUS COUTEUX S'IL EST FAUX. Trois statuts
   * intermediaires annoncent un colis presque arrive sans que personne ne le
   * detienne. Si l'un d'eux renseignait `livreA`, le delai de retractation
   * serait annonce comme couru alors qu'il n'a pas commence, et l'article
   * L221-20 porte le delai a DOUZE MOIS quand l'information est incorrecte.
   *
   * LA PREUVE PORTE SUR LA TABLE DE CORRESPONDANCE, seule a decider. Ecrire ici
   * un `livreA` a la main prouverait que la colonne se remplit, jamais qu'un
   * statut la remplit a tort.
   */
  it("ne tient aucun evenement intermediaire pour une livraison", async () => {
    const { estLivre } = await import("@/integrations/sendcloud/statuts");

    /*
     * LES TROIS IDENTIFIANTS VIENNENT DE L'API REELLE, releves le 10 septembre
     * 2026 et figes par `tests/unitaire/statuts-livraison.test.ts`. Les
     * inventer aurait rendu ce test vert pour la mauvaise raison : un
     * identifiant absent de la liste blanche ne livre pas, donc un NUMERO
     * QUELCONQUE passe. Ce qui est eprouve ici est que les statuts REELLEMENT
     * emis pendant l'acheminement ne livrent pas.
     */
    /* `Awaiting customer pickup`, le colis attend au relais. */
    expect(estLivre(12)).toBe(false);
    /* `Delivery attempt failed`, personne n'etait la. */
    expect(estLivre(8)).toBe(false);
    /* `Parcel en route`, en cours d'acheminement. */
    expect(estLivre(91)).toBe(false);

    /* LES DEUX SEULS QUI LIVRENT, ADR-042 decision 1. */
    expect(estLivre(11)).toBe(true);
    expect(estLivre(93)).toBe(true);
  });

  /*
   * CRITERE 5, LE REPORT SE LIT SANS QUE RIEN NE SOIT REECRIT. `Commande.
   * modeLivraison` reste ce que le client a choisi et paye, ADR-025 : c'est
   * l'ECART entre les deux modes qui porte l'information, et l'ecran n'a aucun
   * autre moyen de savoir qu'un report a eu lieu.
   */
  it("laisse le mode de la commande intact quand l'expedition est reportee", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    /*
     * LE CAS ECRIT ICI EST CELUI D'UNE EXPEDITION CREEE VERS UN RELAIS, avec
     * son identifiant, sur une commande payee a domicile. Il exerce l'ECART de
     * modes, qui est ce que le critere 5 demande de rendre visible.
     *
     * CE N'EST PAS LE REPORT AUTOMATIQUE DE SENDCLOUD, et la nuance est
     * documentee par ADR-042 : sur un report apres echec, le transporteur ne
     * rend AUCUN identifiant de point, donc `Expedition.mode` ne peut pas
     * passer a `POINT_RELAIS` sans violer `chk_expedition_mode_point_relais`.
     * Ce report-la se lit sur le STATUT, `Awaiting customer pickup` sur une
     * expedition `DOMICILE`, et `estDeposeEnPointRetrait` porte cette lecture.
     */
    await poserExpedition(commandeId, {
      mode: "POINT_RELAIS",
      statutTransporteur: "Awaiting customer pickup",
    });

    const detail = await lireDetailCommande(commandeId);

    expect(detail?.modeLivraison).toBe("DOMICILE");
    expect(detail?.expedition?.mode).toBe("POINT_RELAIS");
  });

  /*
   * UNE COMMANDE SANS COLIS PARTI N'A PAS D'EXPEDITION, et l'ecran doit pouvoir
   * ne rien afficher plutot qu'un titre suivi d'une liste vide. Le cas est le
   * plus frequent de tous : toute commande en preparation est dans cet etat.
   */
  it("rend une expedition nulle tant qu'aucun colis n'est parti", async () => {
    const { commandeId } = await commanderUnePiece();
    await confirmer(commandeId);

    const detail = await lireDetailCommande(commandeId);

    expect(detail?.expedition).toBeNull();
  });
});
