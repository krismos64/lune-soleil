/**
 * EXPEDITION D'UNE COMMANDE, LS-130. Etape 11 du parcours 1.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur en zone critique : la
 * transition de statut, son historisation et l'unicite de l'expedition sont des
 * garanties de tracabilite, pas des details d'affichage.
 *
 * OU VIT LA PREUVE DE LA GARDE DE ROLE, ET POURQUOI PAS ICI. La Server Action
 * appelle `headers()` de Next.js, qui exige un contexte de requete : hors du
 * serveur elle leve avant d'atteindre la moindre verification, et ce fichier
 * mesurerait cette limite de l'outil plutot que la garde. Le controle textuel
 * `verifier-gardes-administration.sh` la verifie par fonction, meme raison
 * qu'en LS-121, et sa limite est ecrite dans son en-tete.
 *
 * CE FICHIER PROUVE CE QUI RESTE : les deux modes qui ne se confondent pas,
 * `livreA` inatteignable, l'unicite par commande, et l'atomicite de l'ecriture.
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
let changerStatutCommande: typeof import("@/services/administration-commandes").changerStatutCommande;
let declarerExpedition: typeof import("@/services/expedition").declarerExpedition;
let lireExpedition: typeof import("@/services/expedition").lireExpedition;
let listerCommandesAExpedier: typeof import("@/services/expedition").listerCommandesAExpedier;
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
  domicileCentimes: 499,
  seuilFranchiseCentimes: 3900,
};

const TOTAL_ATTENDU_CENTIMES = 4900;

/** Identifiant d'une administratrice reelle, pour renseigner `acteurId`. */
let administratriceId: string;

/**
 * Une commande `EN_PREPARATION`, seul etat depuis lequel on expedie.
 *
 * ELLE PASSE PAR LES CHEMINS REELS, paiement puis transition : partir d'un
 * `INSERT` direct testerait une commande qui n'existe dans aucun parcours, et
 * masquerait une incoherence entre ce que le webhook ecrit et ce que
 * l'expedition lit.
 */
async function commanderEtPreparer(): Promise<string> {
  const { varianteId } = await creerVarianteEnStock(client);

  const { commandeId } = await passerCommande({
    lignesCookie: [{ varianteId, quantite: 1 }],
    saisie: SAISIE_DOMICILE,
    configuration: CONFIGURATION,
  });

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

  await changerStatutCommande({
    commandeId,
    nouveauStatut: "EN_PREPARATION",
    acteurId: administratriceId,
  });

  return commandeId;
}

async function lireStatut(commandeId: string): Promise<string> {
  const { rows } = await client.query<{ statut: string }>(
    "SELECT statut FROM commande WHERE id = $1",
    [commandeId],
  );

  return rows[0]?.statut ?? "INTROUVABLE";
}

/** Une saisie valide, que chaque test derive pour n'en changer qu'un point. */
const SAISIE_EXPEDITION = {
  transporteur: "Mondial Relay",
  mode: "DOMICILE" as const,
  numeroSuivi: "MR000111222",
  pointRelaisId: null,
};

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ passerCommande } = await import("@/services/commande"));
  ({ changerStatutCommande } =
    await import("@/services/administration-commandes"));
  ({ declarerExpedition, lireExpedition, listerCommandesAExpedier } =
    await import("@/services/expedition"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));

  administratriceId = randomUUID();
  await client.query(
    `INSERT INTO utilisateur (id, email, email_verifie, nom, role, cree_a, mis_a_jour_a)
     VALUES ($1, 'admin-expedition@example.invalid', true, 'TEST Administratrice', 'ADMINISTRATRICE', now(), now())`,
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
     evenement_fournisseur, paiement, reservation, expedition, ligne_commande,
     commande, variante, produit, categorie, compteur_numero CASCADE`,
  );
});

describe("declarerExpedition", () => {
  it("ecrit l'expedition, horodate expedieA et fait passer la commande a EXPEDIEE", async () => {
    const commandeId = await commanderEtPreparer();

    const avant = new Date();
    const issue = await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    expect(issue.statut).toBe("EXPEDIEE");

    const { rows } = await client.query<{
      transporteur: string;
      mode: string;
      numero_suivi: string | null;
      point_relais_id: string | null;
      expedie_a: Date | null;
      livre_a: Date | null;
    }>(
      `SELECT transporteur, mode, numero_suivi, point_relais_id, expedie_a, livre_a
       FROM expedition WHERE commande_id = $1`,
      [commandeId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.transporteur).toBe("Mondial Relay");
    expect(rows[0]?.mode).toBe("DOMICILE");
    expect(rows[0]?.numero_suivi).toBe("MR000111222");
    expect(rows[0]?.point_relais_id).toBeNull();

    /*
     * CRITERE 1, `expedieA` EST HORODATE PAR LE SERVEUR et non saisi. Une date
     * venue de l'interface serait une date choisie : le fait a dater est
     * l'instant ou l'exploitante declare, pas celui qu'elle affirme.
     */
    const expedieA = rows[0]?.expedie_a;
    expect(expedieA).not.toBeNull();
    expect(expedieA?.getTime()).toBeGreaterThanOrEqual(avant.getTime() - 1000);

    /*
     * CRITERE 3, `livreA` RESTE NUL. Aucun chemin de cet ecran ne l'atteint :
     * il vient du suivi automatique de LS-131, et l'inventer ferait courir le
     * delai de retractation depuis une date fausse.
     */
    expect(rows[0]?.livre_a).toBeNull();

    expect(await lireStatut(commandeId)).toBe("EXPEDIEE");
  });

  it("historise la transition avec l'acteur et l'origine ADMIN", async () => {
    const commandeId = await commanderEtPreparer();

    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    const { rows } = await client.query<{
      statut_precedent: string | null;
      statut_nouveau: string;
      origine: string;
      acteur_id: string | null;
    }>(
      `SELECT statut_precedent, statut_nouveau, origine, acteur_id
       FROM historique_statut WHERE commande_id = $1
       ORDER BY cree_a ASC`,
      [commandeId],
    );

    /*
     * LA DERNIERE ENTREE EST CELLE DE L'EXPEDITION, les precedentes venant du
     * webhook puis de la mise en preparation. C'est elle qui doit porter
     * `ADMIN` et un acteur nomme, regle S9 : savoir six mois plus tard si un
     * colis a ete declare parti par une personne ou par une tache est
     * precisement ce qu'on vient chercher dans ce journal.
     */
    const derniere = rows.at(-1);
    expect(derniere).toEqual({
      statut_precedent: "EN_PREPARATION",
      statut_nouveau: "EXPEDIEE",
      origine: "ADMIN",
      acteur_id: administratriceId,
    });
  });

  it("accepte un mode execute DIFFERENT de celui de la commande, sans reecrire la commande", async () => {
    const commandeId = await commanderEtPreparer();

    /*
     * CRITERE 2, LE COEUR DE CETTE STORY. Un echec de livraison a domicile est
     * rebascule vers un Point Relais : `Expedition.mode` change, la commande
     * NON. Ce que le client a choisi et paye est un fait acquis, ADR-025 et
     * `PARCOURS.md`. Les confondre ferait mentir la facture sur ce qui a ete
     * vendu.
     */
    await declarerExpedition({
      commandeId,
      saisie: {
        transporteur: "Mondial Relay",
        mode: "POINT_RELAIS",
        numeroSuivi: "MR000333444",
        pointRelaisId: "FR-12345",
      },
      acteurId: administratriceId,
    });

    const { rows } = await client.query<{
      mode_execute: string;
      point_relais_execute: string | null;
      mode_commande: string;
      point_relais_commande: string | null;
    }>(
      `SELECT e.mode AS mode_execute,
              e.point_relais_id AS point_relais_execute,
              c.mode_livraison AS mode_commande,
              c.point_relais_id AS point_relais_commande
       FROM expedition e
       JOIN commande c ON c.id = e.commande_id
       WHERE e.commande_id = $1`,
      [commandeId],
    );

    expect(rows[0]).toEqual({
      mode_execute: "POINT_RELAIS",
      point_relais_execute: "FR-12345",
      /*
       * LA COMMANDE RESTE `DOMICILE`, ET SANS POINT DE RETRAIT. C'est cette
       * ligne que la mutation du critere 7 fait rougir : ecrire le mode de la
       * commande au lieu du mode saisi rendrait `mode_execute` egal a
       * `DOMICILE`, et l'assertion ci-dessus tomberait.
       */
      mode_commande: "DOMICILE",
      point_relais_commande: null,
    });
  });

  it("refuse une seconde expedition sur la meme commande", async () => {
    const commandeId = await commanderEtPreparer();

    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    /*
     * CRITERE 4, CAS SEQUENTIEL, ET IL SORT PAR LA GARDE DE STATUT. La commande
     * est desormais `EXPEDIEE`, donc elle n'est plus dans un etat d'ou l'on
     * expedie : le refus arrive AVANT que l'unicite `commande_id` ne soit
     * atteinte.
     *
     * CE N'EST PAS UN CONTOURNEMENT DE L'UNICITE MAIS UN REFUS PLUS PRECOCE ET
     * PLUS INFORMATIF, qui rend l'etat reel a l'ecran. Le motif « deux cles, un
     * seul chemin » est ici assume et ecrit : la seconde garde ne s'exerce que
     * dans la course, et le test qui suit construit exactement cet etat.
     */
    const seconde = await declarerExpedition({
      commandeId,
      saisie: {
        transporteur: "Colissimo",
        mode: "DOMICILE",
        numeroSuivi: "6A99887766",
        pointRelaisId: null,
      },
      acteurId: administratriceId,
    });

    expect(seconde).toEqual({
      statut: "STATUT_INCOMPATIBLE",
      statutActuel: "EXPEDIEE",
    });

    const { rows } = await client.query<{ transporteur: string }>(
      "SELECT transporteur FROM expedition WHERE commande_id = $1",
      [commandeId],
    );

    /*
     * LA PREMIERE EXPEDITION EST INTACTE. Un second appel qui ecraserait le
     * transporteur ferait perdre le numero de suivi communique au client.
     */
    expect(rows).toEqual([{ transporteur: "Mondial Relay" }]);
  });

  it("refuse deux declarations CONCURRENTES, une seule expedition subsiste", async () => {
    const commandeId = await commanderEtPreparer();

    /*
     * DEUX ONGLETS OUVERTS, LE CAS REEL. Le motif est celui mesure le
     * 1er septembre 2026 sur le remboursement : une lecture prealable hors
     * verrou laisse passer deux appels qui se jugent tous deux legitimes.
     *
     * ICI L'UNICITE `commande_id` SERIALISE VRAIMENT, parce que les deux
     * ecritures visent la MEME cle : c'est la difference avec la cle
     * d'idempotence du remboursement, que deux references distinctes
     * contournaient.
     */
    const [premiere, seconde] = await Promise.all([
      declarerExpedition({
        commandeId,
        saisie: SAISIE_EXPEDITION,
        acteurId: administratriceId,
      }),
      declarerExpedition({
        commandeId,
        saisie: { ...SAISIE_EXPEDITION, transporteur: "Colissimo" },
        acteurId: administratriceId,
      }),
    ]);

    const issues = [premiere.statut, seconde.statut].sort();

    /*
     * EXACTEMENT UNE GAGNANTE, ET LE REFUS N'EST PAS NOMME. Le perdant sort
     * soit en `DEJA_EXPEDIEE`, l'unicite ayant tranche, soit en
     * `STATUT_INCOMPATIBLE`, sa lecture ayant deja vu `EXPEDIEE` : lequel des
     * deux depend de l'ordonnancement de PostgreSQL et du pool, qui referme la
     * fenetre quand il est chaud.
     *
     * EXIGER UN REFUS PRECIS RENDRAIT LE TEST INSTABLE SANS RIEN PROUVER DE
     * PLUS, piege « assertion qui suppose un ordre » deja rencontre ici. Ce qui
     * doit etre vrai dans les deux cas est plus bas : une seule expedition, un
     * seul historique.
     */
    expect(issues.filter((issue) => issue === "EXPEDIEE")).toHaveLength(1);
    expect(
      issues.filter(
        (issue) => issue === "DEJA_EXPEDIEE" || issue === "STATUT_INCOMPATIBLE",
      ),
    ).toHaveLength(1);

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]?.nombre).toBe("1");

    /*
     * UN SEUL HISTORIQUE D'EXPEDITION, et c'est ce qui prouve l'atomicite : si
     * la transition vivait hors de la transaction de l'expedition, le perdant
     * aurait pu historiser une transition qu'il n'a pas faite.
     */
    const { rows: historiques } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM historique_statut
       WHERE commande_id = $1 AND statut_nouveau = 'EXPEDIEE'`,
      [commandeId],
    );
    expect(historiques[0]?.nombre).toBe("1");
  });

  it("refuse une expedition en doublon meme quand la garde de statut ne joue pas", async () => {
    const commandeId = await commanderEtPreparer();

    /*
     * L'ETAT OU LA PREMIERE GARDE NE JOUE PAS, seul chemin par lequel l'unicite
     * `commande_id` s'exerce vraiment. Sans lui, la garde de statut sort
     * toujours en premier et cette contrainte n'est JAMAIS atteinte : neutraliser
     * l'unicite laisserait alors toute la suite verte, motif « deux cles, un
     * seul chemin ».
     *
     * IL EST ATTEIGNABLE EN VRAI, ce n'est pas un montage de laboratoire : deux
     * declarations concurrentes lisent toutes deux `EN_PREPARATION` avant que
     * l'une des deux ne commite. L'ecrire a la main le rend deterministe la ou
     * `Promise.all` depend du pool.
     */
    await client.query(
      `INSERT INTO expedition (id, commande_id, transporteur, mode, expedie_a, cree_a)
       VALUES ($1, $2, 'Colissimo', 'DOMICILE', now(), now())`,
      [randomUUID(), commandeId],
    );

    const issue = await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    expect(issue.statut).toBe("DEJA_EXPEDIEE");

    /*
     * LA COMMANDE N'A PAS BOUGE, et c'est ce que la transaction garantit : le
     * refus arrive sur l'ecriture de l'expedition, donc le `updateMany` du
     * statut et l'historisation sont annules avec elle.
     */
    expect(await lireStatut(commandeId)).toBe("EN_PREPARATION");

    const { rows } = await client.query<{ transporteur: string }>(
      "SELECT transporteur FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows).toEqual([{ transporteur: "Colissimo" }]);

    const { rows: historiques } = await client.query<{ nombre: string }>(
      `SELECT count(*)::text AS nombre FROM historique_statut
       WHERE commande_id = $1 AND statut_nouveau = 'EXPEDIEE'`,
      [commandeId],
    );
    expect(historiques[0]?.nombre).toBe("0");
  });

  it("refuse d'expedier une commande qui n'est pas EN_PREPARATION", async () => {
    const { varianteId } = await creerVarianteEnStock(client);

    const { commandeId } = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    /*
     * LA COMMANDE EST `EN_ATTENTE_PAIEMENT`. Expedier sans encaissement ferait
     * partir une piece non payee, et la table `TRANSITIONS_ADMINISTRATRICE` de
     * LS-121 est la SEULE source de ce qui est permis : ce service la consulte
     * plutot que de reecrire sa propre liste, qui divergerait.
     */
    const issue = await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    expect(issue).toEqual({
      statut: "STATUT_INCOMPATIBLE",
      statutActuel: "EN_ATTENTE_PAIEMENT",
    });

    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]?.nombre).toBe("0");
    expect(await lireStatut(commandeId)).toBe("EN_ATTENTE_PAIEMENT");
  });

  it("refuse un mode de retrait sans point, et un domicile qui en porte un", async () => {
    const commandeId = await commanderEtPreparer();

    /*
     * L'EQUIVALENCE DE `chk_expedition_mode_point_relais`, DANS LES DEUX SENS.
     * Tester une seule direction laisserait passer l'autre : le piege
     * « implication et non equivalence » a deja casse une contrainte de ce
     * depot en recopiant la forme du CHECK voisin.
     */
    const sansPoint = await declarerExpedition({
      commandeId,
      saisie: {
        ...SAISIE_EXPEDITION,
        mode: "POINT_RELAIS",
        pointRelaisId: null,
      },
      acteurId: administratriceId,
    });
    expect(sansPoint.statut).toBe("INVALIDE");

    const domicileAvecPoint = await declarerExpedition({
      commandeId,
      saisie: {
        ...SAISIE_EXPEDITION,
        mode: "DOMICILE",
        pointRelaisId: "FR-12345",
      },
      acteurId: administratriceId,
    });
    expect(domicileAvecPoint.statut).toBe("INVALIDE");

    const locker = await declarerExpedition({
      commandeId,
      saisie: { ...SAISIE_EXPEDITION, mode: "LOCKER", pointRelaisId: null },
      acteurId: administratriceId,
    });
    expect(locker.statut).toBe("INVALIDE");

    /*
     * AUCUN REFUS N'A RIEN ECRIT, et la commande n'a pas bouge. Un refus qui
     * laisserait la commande `EXPEDIEE` sans expedition serait pire que le
     * refus lui-meme.
     */
    const { rows } = await client.query<{ nombre: string }>(
      "SELECT count(*)::text AS nombre FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]?.nombre).toBe("0");
    expect(await lireStatut(commandeId)).toBe("EN_PREPARATION");
  });

  it("refuse une commande inexistante et un identifiant difforme", async () => {
    const inexistante = await declarerExpedition({
      commandeId: randomUUID(),
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });
    expect(inexistante.statut).toBe("INTROUVABLE");

    /*
     * L'IDENTIFIANT DIFFORME EST REFUSE AVANT TOUTE LECTURE, invariant 7 : il
     * vient d'un formulaire, donc de n'importe qui.
     */
    await expect(
      declarerExpedition({
        commandeId: "pas-un-identifiant",
        saisie: SAISIE_EXPEDITION,
        acteurId: administratriceId,
      }),
    ).rejects.toThrow();
  });

  it("refuse un transporteur vide et un numero de suivi demesure", async () => {
    const commandeId = await commanderEtPreparer();

    const sansTransporteur = await declarerExpedition({
      commandeId,
      saisie: { ...SAISIE_EXPEDITION, transporteur: "   " },
      acteurId: administratriceId,
    });
    expect(sansTransporteur.statut).toBe("INVALIDE");

    /*
     * LE NUMERO DE SUIVI FINIT DANS UN EMAIL ET DANS UNE URL DE SUIVI, LS-131 :
     * une chaine demesuree y entrerait telle quelle. La borne est appliquee sur
     * l'entree non fiable, invariant 7.
     */
    const suiviDemesure = await declarerExpedition({
      commandeId,
      saisie: { ...SAISIE_EXPEDITION, numeroSuivi: "X".repeat(200) },
      acteurId: administratriceId,
    });
    expect(suiviDemesure.statut).toBe("INVALIDE");

    expect(await lireStatut(commandeId)).toBe("EN_PREPARATION");
  });

  it("ramene a nul un numero de suivi sans lettre ni chiffre", async () => {
    const commandeId = await commanderEtPreparer();

    /*
     * L'ESPACE SANS CHASSE, U+200B, TRAVERSE `trim()` : `"\u200B".trim()` ne
     * rend PAS la chaine vide, mesure. Un copier-coller depuis l'interface web
     * d'un transporteur ramene couramment ce caractere, et l'exploitante croit
     * avoir laisse le champ vide.
     *
     * PERSISTE TEL QUEL, IL MENTIRAIT : la colonne serait non nulle, l'ecran
     * afficherait un numero invisible, et LS-131 construirait une URL de suivi
     * sur du vide. « Aucun numero » et « un numero qu'on ne voit pas » sont
     * deux etats distincts, et un seul des deux est vrai.
     */
    const issue = await declarerExpedition({
      commandeId,
      saisie: { ...SAISIE_EXPEDITION, numeroSuivi: "\u200B \u00A0" },
      acteurId: administratriceId,
    });

    expect(issue.statut).toBe("EXPEDIEE");

    const { rows } = await client.query<{ numero_suivi: string | null }>(
      "SELECT numero_suivi FROM expedition WHERE commande_id = $1",
      [commandeId],
    );

    expect(rows[0]?.numero_suivi).toBeNull();
  });

  it("accepte une expedition sans numero de suivi, le transporteur ne le donne pas toujours", async () => {
    const commandeId = await commanderEtPreparer();

    /*
     * LE NUMERO EST FACULTATIF EN BASE, et il doit le rester ici : un depot en
     * bureau de poste ne rend pas toujours un numero immediatement, et exiger
     * ce champ empecherait de declarer un colis reellement parti. Le fait
     * « le colis est parti » ne depend pas de la disponibilite du numero.
     */
    const issue = await declarerExpedition({
      commandeId,
      saisie: { ...SAISIE_EXPEDITION, numeroSuivi: null },
      acteurId: administratriceId,
    });

    expect(issue.statut).toBe("EXPEDIEE");
    expect(await lireStatut(commandeId)).toBe("EXPEDIEE");
  });
});

describe("lireExpedition", () => {
  it("rend null tant qu'aucune expedition n'existe", async () => {
    const commandeId = await commanderEtPreparer();

    expect(await lireExpedition(commandeId)).toBeNull();
  });

  it("rend l'expedition declaree", async () => {
    const commandeId = await commanderEtPreparer();

    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    const expedition = await lireExpedition(commandeId);

    expect(expedition?.transporteur).toBe("Mondial Relay");
    expect(expedition?.mode).toBe("DOMICILE");
    expect(expedition?.numeroSuivi).toBe("MR000111222");
    expect(expedition?.livreA).toBeNull();
  });
});

describe("listerCommandesAExpedier", () => {
  it("ne liste que les commandes EN_PREPARATION, avec le mode CHOISI par le client", async () => {
    const aExpedier = await commanderEtPreparer();

    const { varianteId } = await creerVarianteEnStock(client);
    await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const liste = await listerCommandesAExpedier();

    expect(liste.map((commande) => commande.id)).toEqual([aExpedier]);
    /*
     * LE MODE AFFICHE DANS LA LISTE EST CELUI DE LA COMMANDE, ce que le client
     * a choisi : c'est l'information dont l'exploitante a besoin pour preparer
     * le colis. Le mode execute n'existe pas encore a ce stade.
     */
    expect(liste[0]?.modeLivraison).toBe("DOMICILE");
    expect(liste[0]?.nomClient).toBe("TEST Camille Dupont");
  });

  it("retire une commande de la liste une fois expediee", async () => {
    const commandeId = await commanderEtPreparer();

    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    expect(await listerCommandesAExpedier()).toEqual([]);
  });

  it("rend une liste vide sans commande, et non une erreur", async () => {
    expect(await listerCommandesAExpedier()).toEqual([]);
  });
});
