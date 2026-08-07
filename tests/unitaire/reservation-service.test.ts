/**
 * Tri deterministe et rejeu borne du service de reservation, LS-50.
 *
 * CE FICHIER COMPLETE `reservation-panier.sequential`, il ne le double pas. Le
 * test d'integration prouve qu'aucun interblocage ne se produit sur une vraie
 * base ; celui-ci prouve les deux mecanismes qui l'evitent, la ou une base ne
 * peut pas les montrer :
 *
 * - L'ORDRE REEL des appels au repository, invisible depuis l'etat final.
 * - LE REJEU sur interblocage, qu'aucune base ne declenche a la demande. Le
 *   simuler est le seul moyen de l'exercer, et un rejeu jamais exerce est un
 *   rejeu non teste.
 */
import { describe, expect, it, vi } from "vitest";

import {
  InterblocagePersistantError,
  ordonnerLignes,
  reserverPanier,
} from "@/services/reservation";

const reserverVariante = vi.hoisted(() => vi.fn());

// Les deux doubles sont en place avant l'evaluation du service : `vi.mock` est
// hisse au-dessus des imports par Vitest, malgre sa position dans le fichier.
//
// Le repository est double parce que ce fichier teste l'orchestration, pas le
// SQL, qui a son propre test sur base reelle.
vi.mock("@/repositories/stock", () => ({ reserverVariante }));

// Le client Prisma est double lui aussi : l'importer pour de vrai exigerait une
// DATABASE_URL, or le projet unitaire doit rester lancable sans Docker.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

/**
 * Client transactionnel minimal.
 *
 * `$transaction` execute la fonction et propage son resultat, ce que fait
 * Prisma. `erreursAJeter` permet de faire echouer les N premieres tentatives,
 * seule facon de declencher le rejeu de facon reproductible.
 */
function clientDouble(options: { erreursAJeter?: unknown[] } = {}) {
  const restantes = [...(options.erreursAJeter ?? [])];
  const appels = { transactions: 0 };

  return {
    appels,
    client: {
      $transaction: async (
        action: (transaction: unknown) => Promise<unknown>,
      ) => {
        appels.transactions += 1;
        const erreur = restantes.shift();
        if (erreur) throw erreur;
        return action({});
      },
    } as never,
  };
}

function erreurAvecCode(code: string): Error & { code: string } {
  return Object.assign(new Error(`erreur simulee ${code}`), { code });
}

/**
 * IDENTIFIANTS AU FORMAT UUID, exige par le socle de validation de LS-71.
 *
 * Ces tests employaient des etiquettes lisibles, « variante-a », refusees depuis
 * que `reserverPanier` valide la FORME de ses entrees. Les remplacer par des
 * UUID n'affaiblit rien : ces tests portent sur l'ORDRE des appels et sur le
 * REJEU, pas sur les identifiants eux-memes.
 *
 * LEUR ORDRE LEXICOGRAPHIQUE EST DELIBERE, `1111` < `2222` < `3333` sur le
 * premier bloc, ce qui garde l'assertion de tri lisible : A avant B avant C.
 * Les nommer par leur rang plutot que par leur valeur preserve l'intention du
 * test d'origine.
 */
const VARIANTE_A = "11111111-1111-4111-8111-111111111111";
const VARIANTE_B = "22222222-2222-4222-8222-222222222222";
const VARIANTE_C = "33333333-3333-4333-8333-333333333333";
const COMMANDE = "99999999-9999-4999-8999-999999999999";

describe("ordonnerLignes", () => {
  it("trie par identifiant de variante croissant", () => {
    const trie = ordonnerLignes([
      { varianteId: "c", quantite: 1 },
      { varianteId: "a", quantite: 1 },
      { varianteId: "b", quantite: 1 },
    ]);

    expect(trie.map((ligne) => ligne.varianteId)).toEqual(["a", "b", "c"]);
  });

  it("ne modifie pas le tableau recu", () => {
    const origine = [
      { varianteId: "b", quantite: 1 },
      { varianteId: "a", quantite: 1 },
    ];

    ordonnerLignes(origine);

    // Un tri en place modifierait le panier de l'appelant, qui peut encore
    // servir a l'affichage dans l'ordre de saisie.
    expect(origine.map((ligne) => ligne.varianteId)).toEqual(["b", "a"]);
  });

  it("conserve les doublons de variante", () => {
    const trie = ordonnerLignes([
      { varianteId: "b", quantite: 1 },
      { varianteId: "a", quantite: 2 },
      { varianteId: "a", quantite: 3 },
    ]);

    expect(trie.map((ligne) => ligne.varianteId)).toEqual(["a", "a", "b"]);
  });
});

describe("reserverPanier, ordre des reservations", () => {
  /**
   * L'ASSERTION QUE SEUL UN DOUBLE PEUT PORTER. Sur une base reelle, deux
   * paniers servis dans un ordre ou dans l'autre produisent le meme etat final :
   * l'ordre des appels ne laisse aucune trace. Ici il est observable.
   */
  it("appelle le repository dans l'ordre croissant, quel que soit l'ordre de saisie", async () => {
    reserverVariante.mockReset();
    reserverVariante.mockResolvedValue(true);
    const { client } = clientDouble();

    const issue = await reserverPanier(
      [
        { varianteId: VARIANTE_C, quantite: 1 },
        { varianteId: VARIANTE_A, quantite: 1 },
        { varianteId: VARIANTE_B, quantite: 1 },
      ],
      COMMANDE,
      { client },
    );

    expect(issue).toEqual({ statut: "SERVI" });
    expect(
      reserverVariante.mock.calls.map(
        ([, parametres]) => parametres.varianteId,
      ),
    ).toEqual([VARIANTE_A, VARIANTE_B, VARIANTE_C]);
  });

  it("s'arrete a la premiere ligne indisponible et la nomme", async () => {
    reserverVariante.mockReset();
    // La premiere passe, la seconde manque : la troisieme ne doit jamais etre
    // tentee, la transaction etant condamnee.
    reserverVariante
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const { client } = clientDouble();

    const issue = await reserverPanier(
      [
        { varianteId: VARIANTE_A, quantite: 1 },
        { varianteId: VARIANTE_B, quantite: 1 },
        { varianteId: VARIANTE_C, quantite: 1 },
      ],
      COMMANDE,
      { client },
    );

    expect(issue).toEqual({
      statut: "REFUSE",
      varianteRefusee: VARIANTE_B,
    });
    expect(reserverVariante).toHaveBeenCalledTimes(2);
  });
});

/**
 * Erreur telle que Prisma 7 la rend sur une requete BRUTE en interblocage.
 *
 * FORME MESUREE, non inventee : une sonde a provoque un vrai interblocage contre
 * une transaction adverse, et c'est exactement ce que le service a recu. Le code
 * de surface vaut `P2010`, generique, et le `SQLSTATE` d'origine n'apparait que
 * dans la cause de l'adaptateur.
 */
function erreurBruteInterblocage(): Error {
  return Object.assign(new Error("Raw query failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2010",
    meta: {
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          code: "40P01",
          message: "deadlock detected",
          kind: "postgres",
        },
      },
    },
  });
}

describe("reserverPanier, rejeu sur interblocage", () => {
  /**
   * `40P01` est le SQLSTATE brut rendu par le pilote `pg`, `P2034` la traduction
   * de Prisma pour l'API typee. Le meme evenement porte plusieurs codes selon le
   * chemin d'acces : n'en traiter qu'un laisserait passer les autres.
   */
  it.each(["40P01", "P2034"])(
    "rejoue la transaction apres un interblocage de code %s",
    async (code) => {
      reserverVariante.mockReset();
      reserverVariante.mockResolvedValue(true);
      const { client, appels } = clientDouble({
        erreursAJeter: [erreurAvecCode(code)],
      });

      const issue = await reserverPanier(
        [{ varianteId: VARIANTE_A, quantite: 1 }],
        COMMANDE,
        { client },
      );

      expect(issue).toEqual({ statut: "SERVI" });
      expect(appels.transactions).toBe(2);
    },
  );

  /**
   * LE CAS QUI COMPTE, parce que c'est le seul que ce service rencontre
   * reellement : sa reservation passe par `$queryRawUnsafe`.
   *
   * La premiere version du service ne testait que `40P01` et `P2034`, et ce test
   * n'existait pas. Le rejeu etait donc inatteignable par le seul chemin qu'il
   * emprunte, alors que les deux tests ci-dessus etaient verts : ils validaient
   * des formes d'erreur que le code ne recoit jamais.
   */
  it("rejoue sur une erreur de requete brute, P2010 portant 40P01 en cause", async () => {
    reserverVariante.mockReset();
    reserverVariante.mockResolvedValue(true);
    const { client, appels } = clientDouble({
      erreursAJeter: [erreurBruteInterblocage()],
    });

    const issue = await reserverPanier(
      [{ varianteId: VARIANTE_A, quantite: 1 }],
      COMMANDE,
      { client },
    );

    expect(issue).toEqual({ statut: "SERVI" });
    expect(appels.transactions).toBe(2);
  });

  /**
   * Contre-epreuve du precedent : `P2010` seul, sans interblocage en cause, est
   * une requete brute en echec pour une autre raison. La rejouer masquerait un
   * defaut de SQL derriere trois tentatives identiques.
   */
  it("ne rejoue pas une erreur brute dont la cause n'est pas un interblocage", async () => {
    reserverVariante.mockReset();
    reserverVariante.mockResolvedValue(true);
    const autreEchec = Object.assign(new Error("Raw query failed"), {
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { code: "42703", message: "column does not exist" },
        },
      },
    });
    const { client, appels } = clientDouble({ erreursAJeter: [autreEchec] });

    await expect(
      reserverPanier([{ varianteId: VARIANTE_A, quantite: 1 }], COMMANDE, {
        client,
      }),
    ).rejects.toBe(autreEchec);

    expect(appels.transactions).toBe(1);
  });

  it("abandonne apres trois tentatives et ne boucle pas", async () => {
    reserverVariante.mockReset();
    reserverVariante.mockResolvedValue(true);
    const { client, appels } = clientDouble({
      erreursAJeter: [
        erreurAvecCode("40P01"),
        erreurAvecCode("40P01"),
        erreurAvecCode("40P01"),
      ],
    });

    await expect(
      reserverPanier([{ varianteId: VARIANTE_A, quantite: 1 }], COMMANDE, {
        client,
      }),
    ).rejects.toBeInstanceOf(InterblocagePersistantError);

    // La borne est le sujet : un rejeu non borne tiendrait une connexion pour
    // toujours au lieu de remonter l'echec.
    expect(appels.transactions).toBe(3);
  });

  it("ne rejoue jamais une erreur qui n'est pas un interblocage", async () => {
    reserverVariante.mockReset();
    reserverVariante.mockResolvedValue(true);
    // 23514 : violation de CHECK. La rejouer masquerait un defaut de code
    // derriere des tentatives repetees, et le meme echec se reproduirait.
    const violation = erreurAvecCode("23514");
    const { client, appels } = clientDouble({ erreursAJeter: [violation] });

    await expect(
      reserverPanier([{ varianteId: VARIANTE_A, quantite: 1 }], COMMANDE, {
        client,
      }),
    ).rejects.toBe(violation);

    expect(appels.transactions).toBe(1);
  });
});
