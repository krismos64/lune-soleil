/**
 * LE TEST PHARE DU PROJET, LS-116. Le jalon qui compte de `CLAUDE.md`.
 *
 * Deux acheteurs se disputent le DERNIER exemplaire d'une piece unique. Un seul
 * doit repartir avec, l'autre doit lire une phrase compréhensible, et le stock
 * ne doit jamais devenir negatif.
 *
 * IL PASSE PAR LE SERVICE, jamais par du SQL reecrit ici, et c'est la raison
 * d'etre de ce fichier. `reservation.sequential.test.ts` prouve deja la
 * primitive SQL depuis LS-68, mais il ecrit lui-meme l'`UPDATE` conditionnel :
 * il valide donc le SQL DU TEST. Son en-tete l'annonce, « ce que ce fichier ne
 * teste pas : le service applicatif de reservation... il n'existe pas encore ».
 * Il existe depuis LS-71, et cette reserve est levee ici.
 *
 * La distinction n'est pas theorique. Deux defauts de LS-71 etaient invisibles
 * depuis une reproduction SQL : le rejeu sur interblocage qui ne se declenchait
 * jamais par le chemin reellement emprunte, et la validation qui laissait
 * remonter une erreur brute. Un test qui recopie la mecanique valide sa copie.
 *
 * IL EST ECRIT AVANT LE PAIEMENT, exigence du plan directeur. Ecrit apres, il se
 * conformerait a ce que le code fait deja ; ecrit maintenant, il dit ce que
 * LS-117 et LS-118 devront faire.
 *
 * SUFFIXE `.sequential` : ces tests mesurent de la concurrence sur un serveur
 * PostgreSQL partage. Les executer en parallele avec d'autres fichiers rendrait
 * leurs mesures dependantes de la charge des voisins.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { creerCommande, creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let reserverPanier: typeof import("@/services/reservation").reserverPanier;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Le service lit `DATABASE_URL` a l'evaluation du module `@/lib/prisma`,
  // d'ou l'import differe : le renseigner apres coup n'aurait aucun effet.
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ reserverPanier } = await import("@/services/reservation"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE reservation, commande, variante, produit, categorie CASCADE",
  );
});

/**
 * Cree une variante disponible et une epuisee, DANS CET ORDRE d'identifiant.
 *
 * SANS CETTE GARANTIE LE TEST DE ROLLBACK NE TESTE RIEN. `ordonnerLignes` trie
 * par identifiant croissant : quand l'epuisee passe la premiere, le refus tombe
 * AVANT qu'aucune reservation ne soit ecrite, et le rollback n'a rien a
 * defaire. Mesure le 25 aout 2026 sur 40 couples, l'ordre voulu ne sort que 15
 * fois, soit 37 pour cent des executions.
 *
 * Confirme par mutation : avec la garde de disponibilite retiree, les six
 * autres tests rougissent et celui-la restait vert.
 *
 * Le meme outil existe dans `reservation-service.sequential.test.ts`, avec le
 * meme commentaire. Le recopier plutot que de l'extraire garde chaque fichier
 * de test lisible seul, ce que le projet prefere pour les tests.
 */
async function creerCoupleOrdonne() {
  for (let essai = 0; essai < 20; essai += 1) {
    const disponible = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const epuisee = await creerVarianteEnStock(client, { quantitePhysique: 0 });

    if (disponible.varianteId < epuisee.varianteId) {
      return { disponible: disponible.varianteId, epuisee: epuisee.varianteId };
    }

    await client.query("TRUNCATE variante, produit, categorie CASCADE");
  }

  throw new Error("Impossible d'engendrer un couple d'identifiants ordonne");
}

/** Etat du stock et des ecritures, lu en base et non deduit des reponses. */
async function lireEtat(varianteId: string) {
  const { rows } = await client.query<{
    quantite_physique: number;
    quantite_reservee: number;
    reservations: string;
    commandes: string[] | null;
  }>(
    `SELECT v.quantite_physique,
            v.quantite_reservee,
            (SELECT count(*) FROM reservation r WHERE r.variante_id = v.id)
              AS reservations,
            (SELECT array_agg(r.commande_id) FROM reservation r
              WHERE r.variante_id = v.id) AS commandes
       FROM variante v WHERE v.id = $1`,
    [varianteId],
  );

  const ligne = rows[0];

  if (ligne === undefined) {
    throw new Error("variante introuvable, le test ne mesure rien");
  }

  return {
    quantitePhysique: ligne.quantite_physique,
    quantiteReservee: ligne.quantite_reservee,
    reservations: Number(ligne.reservations),
    /*
     * LES IDENTIFIANTS ET NON LEUR NOMBRE.
     *
     * La premiere version comptait les `commande_id` distincts, ce qui valait
     * 1 PAR CONSTRUCTION des lors qu'une seule reservation subsiste : le test
     * mesurait la cardinalite et jamais la propriete. Mesure le 25 aout 2026,
     * une mutation ecrivant un `commande_id` arbitraire laissait les sept tests
     * verts, alors qu'elle attache la piece a la commande PERDANTE : le
     * webhook du gagnant ne trouverait rien a convertir, et la piece resterait
     * immobilisee trente minutes pour une commande jamais payee.
     */
    commandes: ligne.commandes ?? [],
  };
}

describe("le dernier exemplaire, deux acheteurs simultanes", () => {
  /*
   * LE COEUR DE LA STORY, et le seul test dont l'echec doit arreter une
   * livraison. Tous les autres cas de ce fichier en decoulent.
   *
   * LES DEUX APPELS PARTENT SANS AUCUN DELAI ENTRE EUX. Un `setTimeout` de N
   * millisecondes fabriquerait une fenetre de course au lieu de mesurer la
   * vraie, piege deja rencontre sur ce projet. `Promise.all` les lance dans le
   * meme tour de boucle, et c'est PostgreSQL qui les serialise.
   */
  it("sert exactement un acheteur, l'autre recoit un refus metier", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const commandeA = await creerCommande(client);
    const commandeB = await creerCommande(client);

    const [issueA, issueB] = await Promise.all([
      reserverPanier([{ varianteId, quantite: 1 }], commandeA),
      reserverPanier([{ varianteId, quantite: 1 }], commandeB),
    ]);

    const issues = [issueA.statut, issueB.statut].sort();

    /*
     * UN SERVI ET UN REFUSE, dans un ordre indifferent : lequel des deux gagne
     * depend de l'ordonnancement de PostgreSQL, et l'exiger rendrait le test
     * instable sans rien prouver de plus.
     */
    expect(issues).toEqual(["REFUSE", "SERVI"]);

    /*
     * LE REFUS EST METIER ET NOMME LA PIECE, ce qui permet a l'interface
     * d'ecrire « cette piece vient d'etre vendue » plutot qu'une erreur
     * technique. Un rejet par exception aurait produit une page d'erreur.
     */
    const refusee = issueA.statut === "REFUSE" ? issueA : issueB;

    expect(refusee).toEqual({ statut: "REFUSE", varianteRefusee: varianteId });
  });

  /*
   * L'ETAT EN BASE EST LA SEULE PREUVE QUI COMPTE, critere 2. Deux reponses
   * coherentes sur une base incoherente resteraient un echec, et c'est
   * exactement ce qu'une survente produirait : deux clients contents, un seul
   * bijou.
   */
  it("laisse une seule reservation et un stock exact", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const commandeA = await creerCommande(client);
    const commandeB = await creerCommande(client);

    const [issueA, issueB] = await Promise.all([
      reserverPanier([{ varianteId, quantite: 1 }], commandeA),
      reserverPanier([{ varianteId, quantite: 1 }], commandeB),
    ]);

    const etat = await lireEtat(varianteId);

    expect(etat.quantiteReservee).toBe(1);
    expect(etat.reservations).toBe(1);
    expect(etat.quantitePhysique).toBe(1);

    /*
     * LA RESERVATION APPARTIENT A LA COMMANDE SERVIE, et c'est une identite
     * qu'on verifie, pas un nombre.
     *
     * Compter les commandes distinctes rendait 1 quoi qu'il arrive : une seule
     * reservation subsiste, donc un seul `commande_id`, meme si c'est le
     * mauvais. La piece serait alors attachee a la commande PERDANTE, qui ne
     * sera jamais payee, pendant que le webhook du gagnant ne trouverait rien
     * a convertir.
     */
    /*
     * EXACTEMENT UNE SERVIE, verifie avant d'en deduire la gagnante. Sans cette
     * assertion, `issueB` n'etait jamais lue et un double SERVI passait : la
     * deduction ci-dessous aurait alors nomme `commandeA` sans que rien ne
     * signale que les deux acheteurs avaient obtenu la piece. Le stock, lui, est
     * rattrape par le CHECK, mais l'issue rendue au client ne l'etait pas.
     */
    const servies = [issueA, issueB].filter(
      (issue) => issue.statut === "SERVI",
    );
    expect(servies).toHaveLength(1);

    const gagnante = issueA.statut === "SERVI" ? commandeA : commandeB;

    expect(etat.commandes).toEqual([gagnante]);
  });

  /*
   * LA MEME EXIGENCE A VINGT ACHETEURS. Deux tentatives laissent une chance
   * qu'un ordonnancement chanceux masque un defaut ; vingt la reduisent
   * fortement, et le cout reste d'une seconde.
   *
   * DIX TRANSACTIONS SONT EN VOL, PAS VINGT, et il vaut mieux le savoir que
   * monter le nombre en croyant renforcer la preuve. Le pool de `pg` plafonne a
   * dix connexions par defaut, `PrismaPg` ne passant pas de `max` : les dix
   * autres attendent une connexion libre. Mesure du 25 aout 2026, jusqu'a sept
   * transactions simultanement en attente de verrou sur la meme ligne, ce qui
   * est une contention largement suffisante.
   */
  it("sert exactement un acheteur sur vingt simultanes", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    const commandes = await Promise.all(
      Array.from({ length: 20 }, () => creerCommande(client)),
    );

    const issues = await Promise.all(
      commandes.map((commandeId) =>
        reserverPanier([{ varianteId, quantite: 1 }], commandeId),
      ),
    );

    const servis = issues.filter((issue) => issue.statut === "SERVI");

    expect(servis).toHaveLength(1);

    const etat = await lireEtat(varianteId);

    expect(etat.quantiteReservee).toBe(1);
    expect(etat.reservations).toBe(1);
  });

  /*
   * TROIS EXEMPLAIRES SERVENT TROIS ACHETEURS, ni deux ni quatre.
   *
   * CE QU'IL PROUVE : le compte servi suit le stock, et non un plafond fixe. Un
   * defaut qui servirait un seul acheteur sur trois exemplaires ferait perdre
   * des ventes sans qu'aucune alerte ne se declenche.
   *
   * CE QU'IL NE PROUVE PAS, et la premiere version de ce commentaire l'affirmait
   * a tort : il ne ferme pas la serialisation excessive. Mesure le 25 aout 2026,
   * un `pg_advisory_xact_lock` global pose avant la boucle laisse les sept tests
   * verts. La raison est structurelle : les dix acheteurs se disputent LA MEME
   * variante, ou une serialisation globale est indiscernable de la contention
   * legitime sur la ligne. C'est le test suivant qui ferme ce defaut.
   */
  it("sert exactement trois acheteurs quand trois exemplaires existent", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 3,
    });

    const commandes = await Promise.all(
      Array.from({ length: 10 }, () => creerCommande(client)),
    );

    const issues = await Promise.all(
      commandes.map((commandeId) =>
        reserverPanier([{ varianteId, quantite: 1 }], commandeId),
      ),
    );

    expect(issues.filter((issue) => issue.statut === "SERVI")).toHaveLength(3);

    const etat = await lireEtat(varianteId);

    expect(etat.quantiteReservee).toBe(3);
    expect(etat.reservations).toBe(3);
  });
});

describe("deux ventes independantes ne s'attendent pas", () => {
  /*
   * LE CAS QUI FERME LA SERIALISATION EXCESSIVE, celui que le test a trois
   * exemplaires ne ferme pas.
   *
   * Deux acheteurs, deux variantes DIFFERENTES a un exemplaire chacune : les
   * deux doivent etre servis. Sur des variantes independantes, aucun verrou
   * legitime n'est en jeu, donc toute attente observee vient d'une
   * serialisation ajoutee a la main.
   *
   * Un verrou global passerait ce test sur le seul compte de servis, mais il
   * ferait apparaitre une attente de verrou la ou il n'y en a aucune : c'est
   * `pg_stat_activity` qui le mesure, et non le resultat des issues.
   */
  it("sert les deux acheteurs sur deux variantes distinctes", async () => {
    const premiere = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const seconde = await creerVarianteEnStock(client, { quantitePhysique: 1 });
    const commandeA = await creerCommande(client);
    const commandeB = await creerCommande(client);

    let attentesVerrou = 0;
    const sonde = setInterval(() => {
      void client
        .query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database()
              AND wait_event_type = 'Lock'`,
        )
        .then(({ rows }) => {
          attentesVerrou = Math.max(attentesVerrou, rows[0]?.n ?? 0);
        })
        .catch(() => {
          /* la sonde ne doit jamais faire echouer le test qu'elle observe */
        });
    }, 2);

    const [issueA, issueB] = await Promise.all([
      reserverPanier(
        [{ varianteId: premiere.varianteId, quantite: 1 }],
        commandeA,
      ),
      reserverPanier(
        [{ varianteId: seconde.varianteId, quantite: 1 }],
        commandeB,
      ),
    ]);

    clearInterval(sonde);

    expect(issueA.statut).toBe("SERVI");
    expect(issueB.statut).toBe("SERVI");

    const etatPremiere = await lireEtat(premiere.varianteId);
    const etatSeconde = await lireEtat(seconde.varianteId);

    expect(etatPremiere.commandes).toEqual([commandeA]);
    expect(etatSeconde.commandes).toEqual([commandeB]);

    /*
     * AUCUNE ATTENTE DE VERROU. Deux pieces distinctes n'ont aucune raison de
     * se bloquer : une attente ici signale un verrou pris plus large que la
     * ligne, qui ferait defiler toutes les ventes de la boutique une par une.
     */
    expect(attentesVerrou).toBe(0);
  });
});

describe("aucun stock negatif, quelle que soit la contention", () => {
  /*
   * `chk_variante_pas_de_survente` EST LA DERNIERE LIGNE DE DEFENSE, et ce test
   * verifie qu'on ne l'atteint JAMAIS.
   *
   * La nuance compte : une contrainte qui rejette prouve que la base tient, pas
   * que le code est correct. Un service qui survendrait recevrait une erreur
   * `23514` et rendrait une page d'erreur au client, alors que le stock etait
   * reellement disponible pour l'un des deux.
   */
  it("ne laisse jamais la quantite reservee depasser le physique", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 2,
    });

    const commandes = await Promise.all(
      Array.from({ length: 12 }, () => creerCommande(client)),
    );

    const issues = await Promise.all(
      commandes.map((commandeId) =>
        reserverPanier([{ varianteId, quantite: 1 }], commandeId),
      ),
    );

    /*
     * AUCUNE EXCEPTION N'A TRAVERSE : toutes les tentatives ont rendu une issue
     * metier. Une erreur brute ici signifierait que la contrainte a rattrape ce
     * que le service aurait du refuser proprement.
     */
    for (const issue of issues) {
      expect(["SERVI", "REFUSE"]).toContain(issue.statut);
    }

    const etat = await lireEtat(varianteId);

    expect(etat.quantiteReservee).toBeLessThanOrEqual(etat.quantitePhysique);
    expect(etat.quantiteReservee).toBe(2);
  });
});

describe("les quatre conditions du WHERE, par le service", () => {
  /*
   * DEUX CONDITIONS MANQUAIENT A CE FICHIER, releve par `ls-critical-reviewer`.
   *
   * `reservation.sequential.test.ts` les couvre depuis LS-68, mais en SQL
   * reecrit dans le test : c'est exactement la reserve que ce fichier existe
   * pour lever. Les exercer par le service coute deux tests courts.
   */
  it("refuse une variante dont la vente web est desactivee", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
      venteWebActivee: false,
    });
    const commandeId = await creerCommande(client);

    const issue = await reserverPanier(
      [{ varianteId, quantite: 1 }],
      commandeId,
    );

    expect(issue).toEqual({ statut: "REFUSE", varianteRefusee: varianteId });

    /*
     * SUSPENDRE LA VENTE WEB NE CREE AUCUN MOUVEMENT DE STOCK, invariant 6. La
     * piece reste physiquement la, elle cesse simplement d'etre vendable en
     * ligne : c'est le cas de l'exploitante qui part sur un marche.
     */
    const etat = await lireEtat(varianteId);

    expect(etat.quantitePhysique).toBe(1);
    expect(etat.quantiteReservee).toBe(0);
  });

  /*
   * ARCHIVEE L'EMPORTE TOUJOURS, y compris sur `vente_web_activee = true`,
   * regle de `database.md`. La condition est dans le `WHERE` et non dans une
   * lecture prealable : entre une lecture et l'ecriture, l'archivage peut
   * survenir, et un client ayant la fiche ouverte reserverait une piece retiree
   * du catalogue.
   */
  it("refuse une variante archivee, meme vente web activee", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
      venteWebActivee: true,
      archivee: true,
    });
    const commandeId = await creerCommande(client);

    const issue = await reserverPanier(
      [{ varianteId, quantite: 1 }],
      commandeId,
    );

    expect(issue).toEqual({ statut: "REFUSE", varianteRefusee: varianteId });

    const etat = await lireEtat(varianteId);

    expect(etat.quantiteReservee).toBe(0);
  });
});

describe("un panier a plusieurs pieces, sous contention", () => {
  /*
   * DEUX PANIERS EN ORDRE OPPOSE ABOUTISSENT, sans interblocage ni survente.
   *
   * CE TEST NE PROUVE PAS QUE LE TRI SERT, et il faut le dire plutot que de le
   * laisser croire. Mesure le 25 aout 2026 : `ordonnerLignes` neutralisee,
   * `return [...lignes]`, ce test reste VERT, et celui de LS-50 aussi.
   *
   * La raison est structurelle. Les deux `UPDATE` du service s'enchainent sans
   * rien entre eux : la premiere ligne refuse le second panier avant qu'il
   * n'atteigne la seconde, donc les verrous ne se croisent jamais. Mesure sur
   * 30 essais a stock 1 puis 60 a stock 5, zero interblocage dans les deux cas.
   *
   * Le test de LS-50 qui, lui, rougit sans le tri emploie `reserverPanierSql`
   * avec `pauseMs: 300`, une reproduction locale qui FABRIQUE la fenetre. Il
   * prouve que le defaut existe et que le tri le ferme, sur une mecanique
   * recopiee ; aucun test n'exerce aujourd'hui ce tri dans le service reel.
   *
   * Ce que ce test garantit reellement : le parcours a plusieurs pieces aboutit
   * sous contention, sans exception ni panier a moitie servi. C'est utile et
   * insuffisant, et la dette est tracee pour LS-117.
   */
  it("ne produit aucun interblocage sur deux paniers en ordre oppose", async () => {
    const premiere = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const seconde = await creerVarianteEnStock(client, { quantitePhysique: 1 });
    const commandeA = await creerCommande(client);
    const commandeB = await creerCommande(client);

    const [issueA, issueB] = await Promise.all([
      reserverPanier(
        [
          { varianteId: premiere.varianteId, quantite: 1 },
          { varianteId: seconde.varianteId, quantite: 1 },
        ],
        commandeA,
      ),
      reserverPanier(
        [
          { varianteId: seconde.varianteId, quantite: 1 },
          { varianteId: premiere.varianteId, quantite: 1 },
        ],
        commandeB,
      ),
    ]);

    /*
     * L'UN SERT, L'AUTRE EST REFUSE, et surtout aucune exception : un
     * interblocage non traite aurait leve `InterblocagePersistantError` apres
     * les trois tentatives.
     */
    expect([issueA.statut, issueB.statut].sort()).toEqual(["REFUSE", "SERVI"]);

    const etatPremiere = await lireEtat(premiere.varianteId);
    const etatSeconde = await lireEtat(seconde.varianteId);

    expect(etatPremiere.quantiteReservee).toBe(1);
    expect(etatSeconde.quantiteReservee).toBe(1);

    /*
     * LES DEUX PIECES APPARTIENNENT A LA COMMANDE SERVIE. Un panier se sert
     * entierement ou pas du tout, ADR-024 : une piece de chaque commande
     * signifierait deux paniers a moitie servis, donc deux clients qui paient
     * pour un article qu'ils n'ont pas commande seul.
     *
     * L'IDENTITE EST VERIFIEE, pas le nombre : compter les commandes distinctes
     * rendait 1 y compris quand les deux pieces partaient sur la commande
     * refusee.
     */
    const gagnante = issueA.statut === "SERVI" ? commandeA : commandeB;

    expect(etatPremiere.commandes).toEqual([gagnante]);
    expect(etatSeconde.commandes).toEqual([gagnante]);
  });

  /*
   * UNE SEULE PIECE INDISPONIBLE ANNULE TOUT LE PANIER, ADR-024. La piece
   * disponible ne reste pas reservee pour une commande qui n'aboutira pas :
   * elle serait immobilisee trente minutes pour rien.
   */
  it("annule tout le panier quand une seule piece est indisponible", async () => {
    const { disponible, epuisee } = await creerCoupleOrdonne();
    const commandeId = await creerCommande(client);

    const issue = await reserverPanier(
      [
        { varianteId: disponible, quantite: 1 },
        { varianteId: epuisee, quantite: 1 },
      ],
      commandeId,
    );

    expect(issue).toEqual({ statut: "REFUSE", varianteRefusee: epuisee });

    const etat = await lireEtat(disponible);

    expect(etat.quantiteReservee).toBe(0);
    expect(etat.reservations).toBe(0);
  });
});
