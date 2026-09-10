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
import type { ClientExpedition } from "@/integrations/sendcloud/expedition";
import type { IssueEtiquette } from "@/services/expedition";
import { TransporteurIndisponibleError } from "@/integrations/sendcloud/index";

let client: Client;
let passerCommande: typeof import("@/services/commande").passerCommande;
let changerStatutCommande: typeof import("@/services/administration-commandes").changerStatutCommande;
let declarerExpedition: typeof import("@/services/expedition").declarerExpedition;
let creerEtiquetteExpedition: typeof import("@/services/expedition").creerEtiquetteExpedition;
let lireExpedition: typeof import("@/services/expedition").lireExpedition;
let listerCommandesAExpedier: typeof import("@/services/expedition").listerCommandesAExpedier;
let traiterEvenementPaiement: typeof import("@/services/webhook-paiement").traiterEvenementPaiement;
let synchroniserSuivi: typeof import("@/services/suivi-livraison").synchroniserSuivi;

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
  ({
    declarerExpedition,
    creerEtiquetteExpedition,
    lireExpedition,
    listerCommandesAExpedier,
  } = await import("@/services/expedition"));
  ({ traiterEvenementPaiement } = await import("@/services/webhook-paiement"));
  ({ synchroniserSuivi } = await import("@/services/suivi-livraison"));

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
  /*
   * TROIS STATUTS DEPUIS LS-181, contre le seul `EN_PREPARATION` d'avant.
   * L'ecran porte desormais trois colonnes, et cette liste les alimente toutes.
   *
   * UNE COMMANDE NON PAYEE RESTE EXCLUE, et c'est la garantie que ce test
   * conserve de sa version d'origine : elle existe en base des le tunnel, avant
   * tout paiement, et l'afficher ferait preparer un colis pour un panier
   * abandonne. Invariant 5.
   */
  it("liste les trois etats d'acheminement, jamais une commande non payee", async () => {
    const aExpedier = await commanderEtPreparer();

    const { varianteId } = await creerVarianteEnStock(client);
    const nonPayee = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const { commandes: liste } = await listerCommandesAExpedier();

    expect(liste.map((commande) => commande.id)).toEqual([aExpedier]);
    expect(liste.map((commande) => commande.id)).not.toContain(
      nonPayee.commandeId,
    );

    /*
     * LE STATUT EST LU ET NON DEDUIT : c'est lui qui decide de la colonne, et
     * l'ecran ne doit pas le recalculer depuis une autre donnee.
     */
    expect(liste[0]?.statut).toBe("EN_PREPARATION");

    /*
     * LE MODE AFFICHE DANS LA LISTE EST CELUI DE LA COMMANDE, ce que le client
     * a choisi : c'est l'information dont l'exploitante a besoin pour preparer
     * le colis. Le mode execute n'existe pas encore a ce stade.
     */
    expect(liste[0]?.modeLivraison).toBe("DOMICILE");
    expect(liste[0]?.nomClient).toBe("TEST Camille Dupont");
  });

  /*
   * UNE COMMANDE EXPEDIEE RESTE, EN CHANGEANT DE COLONNE, LS-181.
   *
   * CE TEST DISAIT L'INVERSE jusqu'au 4 septembre 2026, « retire une commande
   * de la liste une fois expediee », et il avait raison pour un ecran a une
   * seule file. Le tableau a trois colonnes montre desormais ce qui est chez le
   * transporteur : la faire disparaitre priverait l'exploitante du suivi.
   *
   * CE QUI SORT VRAIMENT DE LA LISTE, c'est `LIVREE` : un colis remis ne
   * demande plus rien.
   */
  it("garde une commande expediee, avec son statut change", async () => {
    const commandeId = await commanderEtPreparer();

    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    const { commandes: liste } = await listerCommandesAExpedier();

    expect(liste.map((commande) => commande.id)).toEqual([commandeId]);
    expect(liste[0]?.statut).toBe("EXPEDIEE");

    await client.query("UPDATE commande SET statut = 'LIVREE' WHERE id = $1", [
      commandeId,
    ]);

    /* LA FORME A CHANGE EN LS-163, la file portant desormais son drapeau de
     * troncature : l'etat vide reste un etat, jamais un incident. */
    expect(await listerCommandesAExpedier()).toEqual({
      commandes: [],
      tronquee: false,
    });
  });

  it("rend une liste vide sans commande, et non une erreur", async () => {
    expect(await listerCommandesAExpedier()).toEqual({
      commandes: [],
      tronquee: false,
    });
  });
});

/**
 * SYNCHRONISATION DU SUIVI, LS-131. ADR-042.
 *
 * ECRIT AVANT LE SERVICE, exigence du plan directeur : `livreA` ouvre le delai
 * de retractation, article L221-18, et l'article L221-20 le porte a DOUZE MOIS
 * quand l'information sur ce droit est incorrecte. Un statut mal classe ne se
 * voit pas a l'ecran, il se voit dans un litige.
 *
 * LE CLIENT DE SUIVI EST INJECTE, aucun appel reseau ici : ces tests exercent la
 * REGLE, pas le fournisseur, dont la traduction vit dans `sendcloud-suivi`.
 */
describe("synchroniserSuivi, ce qui renseigne livreA", () => {
  /** Une expedition prete a etre suivie, avec son numero. */
  async function expedier(): Promise<string> {
    const commandeId = await commanderEtPreparer();
    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });
    return commandeId;
  }

  /** Un client de suivi qui rend toujours le meme statut. */
  function suiviFixe(statut: number, libelle: string) {
    return {
      async lireStatut() {
        return { statut, libelle };
      },
    };
  }

  async function lireExpeditionBrute(commandeId: string) {
    const { rows } = await client.query<{
      livre_a: Date | null;
      statut_transporteur: string | null;
      synchronise_a: Date | null;
    }>(
      `SELECT livre_a, statut_transporteur, synchronise_a
       FROM expedition WHERE commande_id = $1`,
      [commandeId],
    );
    return rows[0];
  }

  it("11, Delivered, renseigne livreA sur une livraison a domicile", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({ client: suiviFixe(11, "Delivered") });

    expect((await lireExpeditionBrute(commandeId))?.livre_a).toBeInstanceOf(
      Date,
    );
  });

  it("93, Shipment collected by customer, renseigne livreA", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({
      client: suiviFixe(93, "Shipment collected by customer"),
    });

    expect((await lireExpeditionBrute(commandeId))?.livre_a).toBeInstanceOf(
      Date,
    );
  });

  /*
   * LE TEST NEGATIF EXIGE PAR LA STORY, et le plus important du fichier.
   *
   * Un colis peut rester une SEMAINE en relais avant retrait. Prendre l'arrivee
   * au point pour une remise eteindrait le droit du client sept jours trop tot.
   */
  it("12, Awaiting customer pickup, ne renseigne PAS livreA", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({
      client: suiviFixe(12, "Awaiting customer pickup"),
    });

    expect((await lireExpeditionBrute(commandeId))?.livre_a).toBeNull();
  });

  it("8, Delivery attempt failed, ne renseigne PAS livreA", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({
      client: suiviFixe(8, "Delivery attempt failed"),
    });

    expect((await lireExpeditionBrute(commandeId))?.livre_a).toBeNull();
  });

  it("91, Parcel en route, ne renseigne PAS livreA", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({ client: suiviFixe(91, "Parcel en route") });

    expect((await lireExpeditionBrute(commandeId))?.livre_a).toBeNull();
  });

  /*
   * `livreA` NE SE REECRIT JAMAIS. La date de reception est le point de depart
   * d'un delai legal : la deplacer a chaque cycle repousserait indefiniment la
   * fin du droit de retractation, et la commande porterait une date de
   * reception qui n'est pas celle vecue par le client.
   */
  it("ne deplace pas livreA a un second passage", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({ client: suiviFixe(11, "Delivered") });
    const premier = (await lireExpeditionBrute(commandeId))?.livre_a;

    await synchroniserSuivi({ client: suiviFixe(11, "Delivered") });
    const second = (await lireExpeditionBrute(commandeId))?.livre_a;

    expect(second).toEqual(premier);
  });

  it("stocke le libelle du statut et non son identifiant, decision 5", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({ client: suiviFixe(11, "Delivered") });

    expect((await lireExpeditionBrute(commandeId))?.statut_transporteur).toBe(
      "Delivered",
    );
  });

  /*
   * `synchroniseA` A CHAQUE PASSAGE, MEME SANS EVENEMENT NEUF : c'est ce qui
   * distingue un colis qui n'avance pas d'une tache qui ne tourne plus. Sans
   * lui, un suivi bloque et une tache morte sont indistinguables.
   */
  it("renseigne synchroniseA meme quand le statut ne change pas", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({ client: suiviFixe(91, "Parcel en route") });

    expect(
      (await lireExpeditionBrute(commandeId))?.synchronise_a,
    ).toBeInstanceOf(Date);
  });

  /*
   * UN NUMERO INCONNU DU TRANSPORTEUR N'EST PAS UNE PANNE, cas NORMAL au
   * premier cycle : le colis remis la veille peut n'etre pas encore enregistre.
   */
  it("un colis inconnu du transporteur laisse livreA nul sans echouer", async () => {
    const commandeId = await expedier();

    const issue = await synchroniserSuivi({
      client: {
        async lireStatut() {
          return null;
        },
      },
    });

    expect(issue.echecs).toBe(0);
    expect((await lireExpeditionBrute(commandeId))?.livre_a).toBeNull();
  });
});

describe("synchroniserSuivi, les echecs definitifs alertent", () => {
  async function expedier(): Promise<string> {
    const commandeId = await commanderEtPreparer();
    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });
    return commandeId;
  }

  function suiviFixe(statut: number, libelle: string) {
    return {
      async lireStatut() {
        return { statut, libelle };
      },
    };
  }

  async function compterAlertes(): Promise<number> {
    const { rows } = await client.query<{ nb: string }>(
      "SELECT count(*) AS nb FROM alerte_critique WHERE type = 'LIVRAISON_EN_ECHEC'",
    );
    return Number(rows[0]?.nb ?? 0);
  }

  it("62991, Refused by recipient, leve une alerte", async () => {
    await expedier();

    await synchroniserSuivi({
      client: suiviFixe(62991, "Refused by recipient"),
    });

    expect(await compterAlertes()).toBe(1);
  });

  it("62992, Returned to sender, leve une alerte", async () => {
    await expedier();

    await synchroniserSuivi({ client: suiviFixe(62992, "Returned to sender") });

    expect(await compterAlertes()).toBe(1);
  });

  /*
   * UN ECHEC NE LIVRE PAS. Le client n'a rien recu, donc aucun delai de
   * retractation ne court et aucune invitation a deposer un avis ne partira.
   */
  it("un echec definitif ne renseigne jamais livreA", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({ client: suiviFixe(80, "Unable to deliver") });

    const { rows } = await client.query<{ livre_a: Date | null }>(
      "SELECT livre_a FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]?.livre_a).toBeNull();
  });

  /*
   * L'IDEMPOTENCE EST ANCREE SUR L'EFFET, invariant 5. La tache tourne toutes
   * les heures et reverrait le meme statut a chaque passage : sans cette garde,
   * un colis refuse produirait vingt-quatre alertes par jour.
   */
  it("ne leve qu'une alerte malgre trois cycles sur le meme statut", async () => {
    await expedier();

    const suivi = suiviFixe(62991, "Refused by recipient");
    await synchroniserSuivi({ client: suivi });
    await synchroniserSuivi({ client: suivi });
    await synchroniserSuivi({ client: suivi });

    expect(await compterAlertes()).toBe(1);
  });

  /*
   * UNE ALERTE ACQUITTEE LIBERE LA PLACE : un probleme traite puis resurgi doit
   * pouvoir alerter de nouveau, sans quoi le second incident resterait muet.
   */
  it("une alerte acquittee n'empeche pas qu'une nouvelle soit levee", async () => {
    await expedier();

    const suivi = suiviFixe(62991, "Refused by recipient");
    await synchroniserSuivi({ client: suivi });

    await client.query(
      "UPDATE alerte_critique SET acquittee_a = now() WHERE type = 'LIVRAISON_EN_ECHEC'",
    );

    await synchroniserSuivi({ client: suivi });

    expect(await compterAlertes()).toBe(2);
  });

  it("aucun mouvement de stock n'est ecrit, ADR-030", async () => {
    await expedier();

    await synchroniserSuivi({ client: suiviFixe(62992, "Returned to sender") });

    const { rows } = await client.query<{ nb: string }>(
      "SELECT count(*) AS nb FROM mouvement_stock WHERE motif = 'RETOUR'",
    );
    expect(Number(rows[0]?.nb ?? 0)).toBe(0);
  });
});

describe("synchroniserSuivi, panne du fournisseur", () => {
  async function expedier(): Promise<string> {
    const commandeId = await commanderEtPreparer();
    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });
    return commandeId;
  }

  /*
   * LA PANNE NE BLOQUE PAS, critere explicite de la story : elle laisse
   * `livreA` nul et la tache se termine. Une exception qui remonterait
   * arreterait le cycle entier sur la premiere expedition en echec.
   */
  it("une API indisponible laisse livreA nul et ne leve pas", async () => {
    const commandeId = await expedier();

    const issue = await synchroniserSuivi({
      client: {
        async lireStatut() {
          throw new Error("transporteur muet");
        },
      },
    });

    expect(issue.echecs).toBe(1);

    const { rows } = await client.query<{ livre_a: Date | null }>(
      "SELECT livre_a FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]?.livre_a).toBeNull();
  });

  /*
   * L'ECHEC EST PORTE EXPEDITION PAR EXPEDITION, jamais par lot : une commande
   * dont le suivi echoue ne doit pas empecher les autres d'avancer. Meme motif
   * que `purge-journaux` et la reconciliation de LS-120.
   */
  it("une expedition en echec n'empeche pas le traitement des suivantes", async () => {
    const premiere = await expedier();
    const seconde = await expedier();

    let appels = 0;

    const issue = await synchroniserSuivi({
      client: {
        async lireStatut() {
          appels += 1;
          if (appels === 1) {
            throw new Error("transporteur muet");
          }
          return { statut: 11, libelle: "Delivered" };
        },
      },
    });

    expect(issue.echecs).toBe(1);
    expect(issue.traitees).toBe(2);

    const { rows } = await client.query<{ nb: string }>(
      "SELECT count(*) AS nb FROM expedition WHERE livre_a IS NOT NULL AND commande_id IN ($1, $2)",
      [premiere, seconde],
    );
    expect(Number(rows[0]?.nb ?? 0)).toBe(1);
  });

  /*
   * UNE PANNE NE RENSEIGNE PAS `synchroniseA`, et c'est ce qui rend ce champ
   * utile : le renseigner malgre l'echec ferait passer un suivi jamais lu pour
   * un suivi a jour, et l'ecran de LS-216 annoncerait une fraicheur fausse.
   */
  it("une panne ne renseigne pas synchroniseA", async () => {
    const commandeId = await expedier();

    await synchroniserSuivi({
      client: {
        async lireStatut() {
          throw new Error("transporteur muet");
        },
      },
    });

    const { rows } = await client.query<{ synchronise_a: Date | null }>(
      "SELECT synchronise_a FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]?.synchronise_a).toBeNull();
  });
});

/**
 * CREATION D'ETIQUETTE PAR L'API, LS-218.
 *
 * AUCUNE ETIQUETTE REELLE N'EST CREEE, et c'est une exigence, critere 7 :
 * Sendcloud n'a PAS de mode test, chaque creation aboutie est FACTUREE. Le
 * client transporteur est injecte, et l'implementation reelle n'est jamais
 * jointe par ce fichier.
 *
 * CE QUI SE PROUVE ICI EST L'ORDRE DES TROIS ETAPES, qui est le coeur du
 * service : verifier en base, PUIS payer, PUIS ecrire. Verifier avant de payer
 * est la seule protection contre une etiquette achetee pour rien, et aucun test
 * unitaire ne peut le montrer, la garde vivant en base.
 */
describe("creerEtiquetteExpedition", () => {
  /** Un transporteur simule qui compte ses appels, sans reseau ni frais. */
  function transporteurSimule(
    numeroSuivi = "3STEST218000001",
  ): ClientExpedition & { appels: number } {
    const simule = {
      appels: 0,
      async creer() {
        simule.appels += 1;
        return { identifiantColis: 4242, numeroSuivi };
      },
      async lireEtiquette() {
        return new ArrayBuffer(4);
      },
    };

    return simule;
  }

  it("cree le colis et ecrit l'expedition avec le numero rendu", async () => {
    const commandeId = await commanderEtPreparer();
    const transporteur = transporteurSimule("3SABCD777");

    const issue = await creerEtiquetteExpedition({
      commandeId,
      acteurId: administratriceId,
      clientTransporteur: transporteur,
    });

    expect(issue).toEqual({
      statut: "CREEE",
      numeroSuivi: "3SABCD777",
      identifiantColis: 4242,
    });

    const { rows } = await client.query<{
      numeroSuivi: string;
      transporteur: string;
    }>(
      `SELECT numero_suivi AS "numeroSuivi", transporteur
         FROM expedition WHERE commande_id = $1`,
      [commandeId],
    );

    expect(rows[0]).toEqual({
      numeroSuivi: "3SABCD777",
      transporteur: "Sendcloud",
    });
    expect(await lireStatut(commandeId)).toBe("EXPEDIEE");
  });

  /*
   * L'ORDRE EST LE POINT DE LA STORY, ET CE TEST LE PROUVE. Une commande deja
   * expediee ne doit RIEN coûter : si l'appel partait avant la garde, une
   * etiquette serait achetee puis jetee, et Sendcloud ne rembourse pas.
   *
   * `appels` A ZERO EST L'ASSERTION QUI COMPTE. Verifier seulement le refus
   * laisserait passer un service qui paie d'abord et refuse ensuite.
   */
  it("n'appelle PAS le transporteur sur une commande deja expediee", async () => {
    const commandeId = await commanderEtPreparer();

    await declarerExpedition({
      commandeId,
      saisie: SAISIE_EXPEDITION,
      acteurId: administratriceId,
    });

    const transporteur = transporteurSimule();

    const issue = await creerEtiquetteExpedition({
      commandeId,
      acteurId: administratriceId,
      clientTransporteur: transporteur,
    });

    expect(issue).toEqual({ statut: "DEJA_EXPEDIEE" });
    expect(transporteur.appels).toBe(0);
  });

  /*
   * MEME MOTIF SUR UN STATUT INCOMPATIBLE. Une commande en attente de paiement
   * n'a rien a expedier : payer une etiquette dessus serait une perte seche.
   */
  it("n'appelle PAS le transporteur sur une commande non expediable", async () => {
    const { varianteId } = await creerVarianteEnStock(client);
    const { commandeId } = await passerCommande({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: SAISIE_DOMICILE,
      configuration: CONFIGURATION,
    });

    const transporteur = transporteurSimule();

    const issue = await creerEtiquetteExpedition({
      commandeId,
      acteurId: administratriceId,
      clientTransporteur: transporteur,
    });

    expect(issue).toMatchObject({ statut: "STATUT_INCOMPATIBLE" });
    expect(transporteur.appels).toBe(0);
  });

  it("n'appelle PAS le transporteur sur une commande inexistante", async () => {
    const transporteur = transporteurSimule();

    const issue = await creerEtiquetteExpedition({
      commandeId: randomUUID(),
      acteurId: administratriceId,
      clientTransporteur: transporteur,
    });

    expect(issue).toEqual({ statut: "INTROUVABLE" });
    expect(transporteur.appels).toBe(0);
  });

  /*
   * UNE PANNE DU TRANSPORTEUR N'ECRIT RIEN ET NE FAIT PAS AVANCER LA COMMANDE,
   * critere 6 : la saisie manuelle reste utilisable, meme regle de degradation
   * qu'ADR-025. Une commande passee `EXPEDIEE` sans expedition serait pire que
   * l'echec lui-meme, l'exploitante la croyant partie.
   */
  it("laisse la commande intacte quand le transporteur est indisponible", async () => {
    const commandeId = await commanderEtPreparer();

    const enPanne: ClientExpedition = {
      async creer() {
        throw new TransporteurIndisponibleError("panne simulée");
      },
      async lireEtiquette() {
        throw new TransporteurIndisponibleError("panne simulée");
      },
    };

    const issue = await creerEtiquetteExpedition({
      commandeId,
      acteurId: administratriceId,
      clientTransporteur: enPanne,
    });

    expect(issue).toEqual({ statut: "TRANSPORTEUR_INDISPONIBLE" });
    expect(await lireStatut(commandeId)).toBe("EN_PREPARATION");

    const { rows } = await client.query(
      "SELECT count(*)::text AS nombre FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]).toEqual({ nombre: "0" });
  });

  /*
   * L'ADRESSE PART DE LA COMMANDE, critere 1, et c'est le gain central de la
   * story : l'exploitante la RESSAISIT aujourd'hui chez le transporteur, et une
   * adresse fautive produit un colis perdu dont le risque reste a sa charge.
   */
  it("envoie l'adresse figee de la commande, jamais une saisie", async () => {
    const commandeId = await commanderEtPreparer();
    let recue: unknown;

    const espion: ClientExpedition = {
      async creer(demande) {
        recue = demande;
        return { identifiantColis: 1, numeroSuivi: "3S1" };
      },
      async lireEtiquette() {
        return new ArrayBuffer(0);
      },
    };

    await creerEtiquetteExpedition({
      commandeId,
      acteurId: administratriceId,
      clientTransporteur: espion,
    });

    expect(recue).toMatchObject({
      mode: "DOMICILE",
      adresse: {
        ligne1: SAISIE_DOMICILE.adresse.ligne1,
        codePostal: SAISIE_DOMICILE.adresse.codePostal,
        ville: SAISIE_DOMICILE.adresse.ville,
      },
    });
  });

  /*
   * LE MODE VIENT DE LA COMMANDE ET N'EST JAMAIS DEVINE, critere 4. Le laisser
   * choisir a l'expedition ferait partir un colis par un mode qui n'a pas ete
   * facture au client.
   */
  it("porte le mode et la reference de la commande", async () => {
    const commandeId = await commanderEtPreparer();
    let recue: { reference?: string; mode?: string } = {};

    const espion: ClientExpedition = {
      async creer(demande) {
        recue = demande;
        return { identifiantColis: 1, numeroSuivi: "3S1" };
      },
      async lireEtiquette() {
        return new ArrayBuffer(0);
      },
    };

    await creerEtiquetteExpedition({
      commandeId,
      acteurId: administratriceId,
      clientTransporteur: espion,
    });

    const { rows } = await client.query<{ numero: string }>(
      "SELECT numero FROM commande WHERE id = $1",
      [commandeId],
    );

    expect(recue.reference).toBe(rows[0]!.numero);
    expect(recue.mode).toBe("DOMICILE");
  });

  /*
   * DEUX CLICS SIMULTANES N'ECRIVENT QU'UNE EXPEDITION, critere 5. La garde vit
   * en base, `commande_id` etant unique : les deux passent la verification, les
   * deux appellent le transporteur, et le second echoue a l'ecriture.
   *
   * CE TEST NE PRETEND PAS QUE RIEN N'EST PAYE EN TROP, et c'est important : la
   * fenetre vit chez le fournisseur, aucun verrou applicatif ne la ferme. Ce
   * qu'il prouve est que la BASE reste coherente, une seule expedition et un
   * seul statut, ce qui est la garantie tenable.
   */
  it("deux creations concurrentes n'ecrivent qu'une expedition", async () => {
    const commandeId = await commanderEtPreparer();

    const [a, b] = await Promise.allSettled([
      creerEtiquetteExpedition({
        commandeId,
        acteurId: administratriceId,
        clientTransporteur: transporteurSimule("3SA"),
      }),
      creerEtiquetteExpedition({
        commandeId,
        acteurId: administratriceId,
        clientTransporteur: transporteurSimule("3SB"),
      }),
    ]);

    const issues = [a, b]
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<IssueEtiquette>).value.statut);

    expect(issues).toContain("CREEE");
    expect(issues.filter((s) => s === "CREEE")).toHaveLength(1);

    const { rows } = await client.query(
      "SELECT count(*)::text AS nombre FROM expedition WHERE commande_id = $1",
      [commandeId],
    );
    expect(rows[0]).toEqual({ nombre: "1" });
  });
});
