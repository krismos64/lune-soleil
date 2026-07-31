/**
 * Le test phare du projet : la reservation du dernier exemplaire, LS-68.
 *
 * Portage de docs/prototypes/reservation-test.sh dans la suite automatisee. Le
 * prototype prouvait la strategie sur un schema jouet ; ce test l'exerce sur le
 * SCHEMA REEL, migrations et contraintes comprises.
 *
 * TROIS ECARTS AVEC LE PROTOTYPE, tous des consequences du schema qui a evolue
 * depuis ADR-006 :
 *
 * 1. `commande_id` est obligatoire sur une reservation, ADR-024 et LS-53. Le
 *    prototype inserait une reservation sans commande, ce que le schema reel
 *    n'accepte plus. Chaque acheteur simule porte donc sa propre commande.
 * 2. `archivee_a IS NULL` entre dans la condition. La colonne n'existait pas au
 *    moment du prototype. `.claude/rules/database.md` l'exige : archivee
 *    l'emporte toujours, y compris sur `vente_web_activee = true`.
 * 3. Les identifiants sont des UUID et non des entiers.
 *
 * CE QUE CE FICHIER NE TESTE PAS, et pourquoi ce n'est pas un oubli : le service
 * applicatif de reservation, sa transaction et son mouvement de stock. Il
 * n'existe pas encore, il releve de la phase 2. LS-68 couvre la primitive SQL,
 * seul niveau ou la garantie est reellement portee.
 *
 * SUFFIXE `.sequential` : ces tests partagent un serveur PostgreSQL et mesurent
 * de la concurrence. Les executer en parallele avec d'autres fichiers rendrait
 * leurs mesures dependantes de la charge des voisins.
 */
import { Client, Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { creerCommande, creerVarianteEnStock } from "../aide/donnees-test";
import { VARIABLE_URL_TEST } from "../aide/base-ephemere";
import {
  SQL_CONVERTIR_EN_VENTE,
  SQL_LIBERER_EXPIREES,
  SQL_RESERVER,
} from "../aide/reservation-sql";

const DUREE_RESERVATION_MINUTES = "30";

let pool: Pool;
let client: Client;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);

  // Un pool et non une connexion unique : la concurrence exige des connexions
  // distinctes. Deux requetes envoyees sur la MEME connexion sont serialisees
  // par le protocole PostgreSQL, le test passerait alors sans rien prouver.
  pool = new Pool({ connectionString: url, max: 25 });

  // Connexion dediee aux preparations et aux mesures, pour ne jamais disputer
  // une connexion du pool aux acheteurs simules.
  client = new Client({ connectionString: url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await pool.end();
});

// Chaque test repart d'une base vide. L'ordre respecte les cles etrangeres :
// reservation avant commande et variante, variante avant produit.
afterEach(async () => {
  await client.query(
    "TRUNCATE reservation, commande, variante, produit, categorie CASCADE",
  );
});

/**
 * Issue d'une tentative de reservation. Trois cas, jamais deux.
 *
 * `SERVIE`   : la piece est obtenue.
 * `REFUSEE`  : refus metier propre, l'`UPDATE` conditionnel n'a trouve aucune
 *              ligne. Aucune erreur n'est levee, c'est le comportement attendu.
 * `VIOLATION`: la contrainte CHECK a rejete l'ecriture. L'`UPDATE` a donc laisse
 *              passer une survente que seule la base a arretee.
 *
 * POURQUOI CETTE DISTINCTION EXISTE, et pourquoi elle n'est pas un raffinement.
 * Sans elle, ce fichier ne detecte pas la mutation exigee par LS-68. Mesure sur
 * la base reelle : en retirant la condition de disponibilite de l'`UPDATE`, sur
 * vingt acheteurs simultanes, un seul obtient la piece et dix-neuf sont rejetes
 * par `chk_variante_pas_de_survente`. L'ETAT FINAL EST ALORS RIGOUREUSEMENT
 * IDENTIQUE au cas correct : une reservation, quantite reservee a 1, stock
 * jamais negatif. Compter les reservations ne prouve donc rien, pas plus que
 * verifier que le stock reste positif.
 *
 * Ce qui change sous mutation est la NATURE du refus, pas son resultat. Un refus
 * metier ne leve aucune erreur ; une violation de contrainte en leve dix-neuf.
 * Traduire les deux en `false`, ce que faisait la premiere version de ce
 * fichier, effacait le seul signal observable.
 */
type IssueReservation = "SERVIE" | "REFUSEE" | "VIOLATION";

async function reserver(
  varianteId: string,
  commandeId: string,
): Promise<IssueReservation> {
  try {
    const resultat = await pool.query(SQL_RESERVER, [
      varianteId,
      commandeId,
      1,
      DUREE_RESERVATION_MINUTES,
    ]);
    return resultat.rowCount === 1 ? "SERVIE" : "REFUSEE";
  } catch (erreur) {
    const code = (erreur as { code?: string }).code;
    // 23514 : violation de CHECK, la derniere ligne de defense a joue.
    if (code === "23514") {
      return "VIOLATION";
    }
    // 40P01 : interblocage. Connu et non corrige sur panier multi-articles,
    // LS-50, mais il n'a rien a faire sur une variante unique : le laisser
    // remonter plutot que l'absorber, un interblocage inattendu ici serait un
    // defaut a voir et non un refus a compter.
    throw erreur;
  }
}

function compter(
  issues: readonly IssueReservation[],
  cherchee: IssueReservation,
): number {
  return issues.filter((issue) => issue === cherchee).length;
}

/**
 * Cree n commandes, une par une.
 *
 * SEQUENTIEL A DESSEIN. Ces creations passent par la connexion unique de
 * preparation, qui ne traite qu'une requete a la fois : un `Promise.all` sur
 * cette connexion serait serialise par le pilote de toute facon, avec un
 * avertissement de depreciation en prime. La concurrence de ce fichier vit dans
 * les reservations, pas dans leur preparation.
 */
async function creerCommandes(nombre: number): Promise<string[]> {
  const commandes: string[] = [];
  for (let index = 0; index < nombre; index += 1) {
    commandes.push(await creerCommande(client));
  }
  return commandes;
}

async function compterReservations(varianteId: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    "SELECT count(*) AS n FROM reservation WHERE variante_id = $1",
    [varianteId],
  );
  return Number(rows[0]?.n ?? 0);
}

async function lireVariante(varianteId: string) {
  const { rows } = await client.query<{
    quantite_physique: number;
    quantite_reservee: number;
  }>(
    "SELECT quantite_physique, quantite_reservee FROM variante WHERE id = $1",
    [varianteId],
  );
  const ligne = rows[0];
  if (!ligne) {
    throw new Error(`Variante ${varianteId} introuvable`);
  }
  return ligne;
}

describe("reservation de stock, primitive SQL", () => {
  /**
   * LE TEST QUI COMPTE. Vingt acheteurs, un exemplaire, un seul servi.
   *
   * L'ASSERTION DECISIVE EST L'ABSENCE DE VIOLATION, pas le nombre de
   * reservations. Les dix-neuf perdants doivent essuyer un refus METIER, sans
   * qu'aucune erreur de base ne soit levee : c'est ce qui distingue un `UPDATE`
   * conditionnel qui fait son travail d'une contrainte CHECK qui le rattrape.
   *
   * Les assertions sur le compte de reservations et sur l'etat de la variante
   * restent utiles mais ne suffisent pas : elles sont satisfaites AUSSI sous
   * mutation, la contrainte produisant exactement le meme etat final.
   */
  it("sert exactement un acheteur sur vingt simultanes, sans aucune violation", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const commandes = await creerCommandes(20);

    const issues = await Promise.all(
      commandes.map((commandeId) => reserver(varianteId, commandeId)),
    );

    expect(compter(issues, "SERVIE")).toBe(1);
    // Les dix-neuf autres sont refuses proprement par la condition de l'UPDATE.
    expect(compter(issues, "REFUSEE")).toBe(19);
    // L'assertion qui detecte la mutation : aucun acheteur ne doit atteindre la
    // contrainte CHECK. Si l'UPDATE laisse passer, ce compte devient non nul.
    expect(compter(issues, "VIOLATION")).toBe(0);

    expect(await compterReservations(varianteId)).toBe(1);
    const variante = await lireVariante(varianteId);
    expect(variante.quantite_reservee).toBe(1);
    expect(variante.quantite_physique - variante.quantite_reservee).toBe(0);
  });

  it("sert un seul acheteur sur deux simultanes, sans aucune violation", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const [premiere, seconde] = await creerCommandes(2);

    const issues = await Promise.all([
      reserver(varianteId, premiere!),
      reserver(varianteId, seconde!),
    ]);

    expect(compter(issues, "SERVIE")).toBe(1);
    expect(compter(issues, "REFUSEE")).toBe(1);
    expect(compter(issues, "VIOLATION")).toBe(0);
    expect(await compterReservations(varianteId)).toBe(1);
  });

  /**
   * Trois exemplaires, dix acheteurs. Ce cas complete le precedent : sur une
   * piece unique, une contrainte trop stricte donnerait le bon resultat pour la
   * mauvaise raison, en refusant tout le monde apres le premier. Ici, exactement
   * trois doivent passer, ni deux ni quatre.
   */
  it("sert exactement trois acheteurs quand trois exemplaires existent", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 3,
    });
    const commandes = await creerCommandes(10);

    const issues = await Promise.all(
      commandes.map((commandeId) => reserver(varianteId, commandeId)),
    );

    expect(compter(issues, "SERVIE")).toBe(3);
    expect(compter(issues, "REFUSEE")).toBe(7);
    expect(compter(issues, "VIOLATION")).toBe(0);
    expect(await compterReservations(varianteId)).toBe(3);
    expect((await lireVariante(varianteId)).quantite_reservee).toBe(3);
  });

  /**
   * Le cas du marche : la piece est physiquement presente, mais retiree de la
   * vente en ligne le temps du stand. Aucun mouvement de stock, invariant 6.
   */
  it("refuse la reservation quand la vente web est desactivee", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
      venteWebActivee: false,
    });
    const commandeId = await creerCommande(client);

    expect(await reserver(varianteId, commandeId)).toBe("REFUSEE");
    expect(await compterReservations(varianteId)).toBe(0);
    // Suspendre la vente web ne touche jamais le stock physique.
    expect((await lireVariante(varianteId)).quantite_physique).toBe(1);
  });

  /**
   * Absent du prototype, la colonne n'existait pas alors.
   *
   * `archivee_a` l'emporte sur `vente_web_activee`, meme quand celle-ci vaut
   * `true` : c'est precisement la combinaison dangereuse, une variante retiree
   * du catalogue dont le drapeau operationnel n'a pas ete rabaisse. Sans cette
   * condition dans le `WHERE`, un client ayant la fiche ouverte reserverait une
   * piece qui n'est plus au catalogue.
   */
  it("refuse la reservation d'une variante archivee, meme vente web activee", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
      venteWebActivee: true,
      archivee: true,
    });
    const commandeId = await creerCommande(client);

    expect(await reserver(varianteId, commandeId)).toBe("REFUSEE");
    expect(await compterReservations(varianteId)).toBe(0);
  });

  it("libere une reservation expiree et la piece redevient disponible", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const premiere = await creerCommande(client);
    expect(await reserver(varianteId, premiere)).toBe("SERVIE");

    // Expiration forcee : attendre trente minutes n'est pas une option, et
    // avancer l'horloge du serveur affecterait toute la suite.
    await client.query(
      "UPDATE reservation SET expire_a = now() - interval '1 minute' WHERE variante_id = $1",
      [varianteId],
    );

    const suivante = await creerCommande(client);
    expect(await reserver(varianteId, suivante)).toBe("REFUSEE");

    await client.query(SQL_LIBERER_EXPIREES);

    expect(await compterReservations(varianteId)).toBe(0);
    expect((await lireVariante(varianteId)).quantite_reservee).toBe(0);
    expect(await reserver(varianteId, suivante)).toBe("SERVIE");
  });

  it("rend la piece definitivement indisponible apres conversion en vente", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });
    const commandeId = await creerCommande(client);
    expect(await reserver(varianteId, commandeId)).toBe("SERVIE");

    await client.query(SQL_CONVERTIR_EN_VENTE, [commandeId]);

    const variante = await lireVariante(varianteId);
    expect(variante.quantite_physique).toBe(0);
    expect(variante.quantite_reservee).toBe(0);

    const tardive = await creerCommande(client);
    expect(await reserver(varianteId, tardive)).toBe("REFUSEE");
  });

  /**
   * La derniere ligne de defense, verifiee pour elle-meme.
   *
   * Ce test ne passe par aucune requete applicative : il tente d'ecrire
   * directement une survente. Il prouve que meme si le code se trompe, la base
   * refuse. C'est ce qui rend le test de concurrence ci-dessus non redondant :
   * l'un couvre l'`UPDATE` conditionnel, l'autre le CHECK.
   */
  it("refuse en base une quantite reservee superieure au stock physique", async () => {
    const { varianteId } = await creerVarianteEnStock(client, {
      quantitePhysique: 1,
    });

    await expect(
      client.query("UPDATE variante SET quantite_reservee = 2 WHERE id = $1", [
        varianteId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
