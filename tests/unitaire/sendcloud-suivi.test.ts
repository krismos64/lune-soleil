/**
 * Le client de suivi Sendcloud, LS-131. ADR-042.
 *
 * CE FICHIER EXERCE LA TRADUCTION ET LES PANNES, jamais le reseau : `fetch` est
 * injecte. La correspondance des statuts vit dans `statuts-livraison.test.ts`,
 * la regle metier dans le test d'integration.
 *
 * POURQUOI L'API v2 ET NON v3. Les identifiants numeriques du projet viennent
 * de `GET /api/v2/parcels/statuses`. L'API v3 rend un `parent_status` TEXTUEL :
 * melanger les deux comparerait des libelles a des identifiants, et un
 * changement de libelle chez le fournisseur casserait la regle en silence.
 *
 * LA FORME DE LA REPONSE EST CONSTATEE, non supposee : `{parcels: [...]}`,
 * verifie le 10 septembre 2026 sur le compte reel.
 */
import { describe, expect, it, vi } from "vitest";

import { TransporteurIndisponibleError } from "@/integrations/sendcloud";
import {
  creerClientSuiviSendcloud,
  lireHorodatageTransporteur,
} from "@/integrations/sendcloud/suivi";

const IDENTIFIANTS = { clePublique: "cle-publique", cleSecrete: "cle-secrete" };

/** Une reponse Sendcloud, forme constatee sur le compte reel. */
function reponseColis(statut: { id: number; message: string } | null) {
  return {
    next: null,
    previous: null,
    parcels: statut === null ? [] : [{ id: 1234, status: statut }],
  };
}

function fetchQuiRend(corps: unknown, init: { status?: number } = {}) {
  return vi.fn<typeof globalThis.fetch>(async () =>
    Promise.resolve(
      new Response(JSON.stringify(corps), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("creerClientSuiviSendcloud, lecture du statut", () => {
  it("rend l'identifiant et le libelle du statut", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(reponseColis({ id: 11, message: "Delivered" })),
    });

    expect(await client.lireStatut("ABC123")).toEqual({
      statut: 11,
      libelle: "Delivered",
    });
  });

  /*
   * UN NUMERO INCONNU REND `null`, ET CE N'EST PAS UNE PANNE.
   *
   * Constate le 10 septembre 2026 : l'API rend `{parcels: []}` avec un statut
   * HTTP 200 pour un numero qu'elle ne connait pas. Le cas est NORMAL au
   * premier cycle, le transporteur pouvant n'avoir pas encore enregistre le
   * colis. Le traiter en panne declencherait une alerte a chaque expedition
   * neuve.
   */
  it("rend null pour un numero que le transporteur ne connait pas", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(reponseColis(null)),
    });

    expect(await client.lireStatut("INEXISTANT")).toBeNull();
  });

  it("interroge le numero de suivi demande", async () => {
    const espion = fetchQuiRend(reponseColis({ id: 11, message: "Delivered" }));
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: espion,
    });

    await client.lireStatut("ABC123");

    const [url] = espion.mock.calls[0]!;
    expect(String(url)).toContain("tracking_number=ABC123");
  });

  /*
   * LES CLES VONT DANS L'EN-TETE, jamais dans l'URL, invariant 9 : une cle en
   * parametre de requete se retrouve dans les journaux de tout intermediaire,
   * et le depot est public.
   */
  it("authentifie par en-tete et jamais par l'URL", async () => {
    const espion = fetchQuiRend(reponseColis({ id: 11, message: "Delivered" }));
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: espion,
    });

    await client.lireStatut("ABC123");

    const [url, options] = espion.mock.calls[0]!;
    expect(String(url)).not.toContain("cle-secrete");

    const entetes = new Headers(options?.headers);
    expect(entetes.get("authorization")).toBe(
      `Basic ${Buffer.from("cle-publique:cle-secrete").toString("base64")}`,
    );
  });
});

describe("creerClientSuiviSendcloud, pannes", () => {
  it("traduit un refus HTTP en TransporteurIndisponibleError", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(reponseColis(null), { status: 401 }),
    });

    await expect(client.lireStatut("ABC123")).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("traduit une panne reseau en TransporteurIndisponibleError", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: vi.fn<typeof globalThis.fetch>(async () => {
        throw new Error("connexion refusée");
      }),
    });

    await expect(client.lireStatut("ABC123")).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("traite un corps illisible comme une panne", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: vi.fn<typeof globalThis.fetch>(async () =>
        Promise.resolve(new Response("<html>maintenance</html>")),
      ),
    });

    await expect(client.lireStatut("ABC123")).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  /*
   * UN COLIS SANS STATUT EXPLOITABLE EST UNE PANNE, pas un colis inconnu.
   *
   * `{parcels: []}` dit « je ne connais pas ce numero », un colis dont le
   * `status.id` manque dit que la reponse n'a pas la forme attendue. Les
   * confondre ferait passer une API en derive pour un suivi normal, et
   * `synchroniseA` cesserait de detecter le blocage qu'il existe pour voir.
   */
  it("traite un colis sans identifiant de statut comme une panne", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend({ parcels: [{ id: 1234, status: {} }] }),
    });

    await expect(client.lireStatut("ABC123")).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("ne laisse fuiter aucun identifiant dans l'erreur", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(reponseColis(null), { status: 401 }),
    });

    const erreur = await client.lireStatut("ABC123").catch((c: unknown) => c);
    const texte = JSON.stringify(
      erreur,
      Object.getOwnPropertyNames(erreur as object),
    );

    expect(texte).not.toContain("cle-secrete");
    expect(texte).not.toContain("cle-publique");
  });
});

/**
 * L'historique de suivi, LS-311.
 *
 * LA FORME VIENT DU COLIS REEL de C-2026-0001, relue le 4 novembre 2026 sur
 * `GET /api/v2/tracking/{numero}` : evenements du plus ancien au plus recent,
 * et un `picked-up-by-driver` parasite une seconde APRES la remise. Les
 * messages et identifiants d'historique sont omis, le code ne les lit pas.
 */
function historique(
  evenements: [horodatage: string, parentStatus: string][],
  options: { estRetour?: boolean } = {},
) {
  return {
    parcel_id: 1234,
    carrier_code: "mondial_relay",
    is_return: options.estRetour ?? false,
    is_to_service_point: true,
    statuses: evenements.map(([carrier_update_timestamp, parent_status]) => ({
      carrier_update_timestamp,
      parent_status,
      carrier_message: "",
    })),
  };
}

/** La fin de l'historique reel, retrait au Locker le 3 novembre 2026. */
const HISTORIQUE_LOCKER: [string, string][] = [
  ["2026-10-29 18:14:05.627604+00:00", "no-label"],
  ["2026-10-30 16:53:00+00:00", "picked-up-by-driver"],
  ["2026-11-02 13:54:31+00:00", "awaiting-customer-pickup"],
  ["2026-11-02 13:57:32+00:00", "picked-up-by-driver"],
  ["2026-11-02 13:57:32+00:00", "awaiting-customer-pickup"],
  ["2026-11-03 14:52:55+00:00", "delivered"],
  ["2026-11-03 14:52:55+00:00", "delivered"],
  ["2026-11-03 14:52:56+00:00", "picked-up-by-driver"],
];

const REMISE_LOCKER = new Date("2026-11-03T14:52:55.000Z");

describe("creerClientSuiviSendcloud, lecture de la remise dans l'historique", () => {
  it("rend l'instant de la remise sur l'historique reel du Locker", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(historique(HISTORIQUE_LOCKER)),
    });

    expect(await client.lireLivraison("75023180")).toEqual({
      etat: "remise",
      a: REMISE_LOCKER,
    });
  });

  /*
   * L'ORDRE N'EST PAS DOCUMENTE : l'exemple officiel va du plus recent au plus
   * ancien, la reponse reelle de l'inverse. Le resultat ne doit pas en dependre.
   */
  it("rend la meme remise quand l'historique est servi a l'envers", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(historique([...HISTORIQUE_LOCKER].reverse())),
    });

    expect(await client.lireLivraison("75023180")).toEqual({
      etat: "remise",
      a: REMISE_LOCKER,
    });
  });

  it("retient la premiere remise quand l'historique en porte deux", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(
        historique([
          ["2026-11-04 08:00:00+00:00", "delivered"],
          ["2026-11-03 14:52:55+00:00", "delivered"],
        ]),
      ),
    });

    expect(await client.lireLivraison("75023180")).toEqual({
      etat: "remise",
      a: REMISE_LOCKER,
    });
  });

  /*
   * CRITERE 3. Le colis attend au Locker depuis le 2 novembre : ni l'arrivee au
   * point ni le passage du chauffeur ne sont une remise, et un colis peut y
   * rester une semaine.
   */
  it("rend null tant que l'historique ne porte que l'attente et le chauffeur", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(historique(HISTORIQUE_LOCKER.slice(0, 5))),
    });

    expect(await client.lireLivraison("75023180")).toEqual({ etat: "aucune" });
  });

  it("rend null pour un colis retour, revenu a l'atelier et non remis au client", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(historique(HISTORIQUE_LOCKER, { estRetour: true })),
    });

    expect(await client.lireLivraison("75023180")).toEqual({ etat: "retour" });
  });

  it("rend null pour un numero que l'historique ne connait pas, 404", async () => {
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend({}, { status: 404 }),
    });

    expect(await client.lireLivraison("INEXISTANT")).toEqual({
      etat: "aucune",
    });
  });

  it("interroge l'historique par le chemin, numero encode, cles en en-tete", async () => {
    const espion = fetchQuiRend(historique(HISTORIQUE_LOCKER));
    const client = creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: espion,
    });

    await client.lireLivraison("75/023 180");

    const [url, options] = espion.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://panel.sendcloud.sc/api/v2/tracking/75%2F023%20180",
    );
    expect(String(url)).not.toContain("cle-secrete");
    expect(new Headers(options?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("cle-publique:cle-secrete").toString("base64")}`,
    );
  });
});

describe("creerClientSuiviSendcloud, pannes de l'historique", () => {
  async function lireAvec(corps: unknown, status = 200) {
    return creerClientSuiviSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(corps, { status }),
    }).lireLivraison("75023180");
  }

  it("traduit un refus HTTP en TransporteurIndisponibleError", async () => {
    await expect(lireAvec({}, 500)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("traite un historique sans liste d'evenements comme une panne", async () => {
    await expect(lireAvec({ parcel_id: 1234 })).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  /*
   * UNE REMISE SANS FUSEAU EST UNE DERIVE, invariant 8 : lue dans le fuseau du
   * conteneur, la date legale glisserait d'une heure sans aucun signe.
   */
  it("refuse une remise dont l'horodatage n'a pas de decalage", async () => {
    await expect(
      lireAvec(historique([["2026-11-03 14:52:55", "delivered"]])),
    ).rejects.toBeInstanceOf(TransporteurIndisponibleError);
  });

  it("refuse une remise datee du futur", async () => {
    const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    await expect(
      lireAvec(historique([[demain, "delivered"]])),
    ).rejects.toBeInstanceOf(TransporteurIndisponibleError);
  });

  it("ne laisse fuiter aucun identifiant dans l'erreur", async () => {
    const erreur = await lireAvec({}, 401).catch((c: unknown) => c);
    const texte = JSON.stringify(
      erreur,
      Object.getOwnPropertyNames(erreur as object),
    );

    expect(texte).not.toContain("cle-secrete");
    expect(texte).not.toContain("75023180");
  });
});

describe("lireHorodatageTransporteur", () => {
  it("lit les microsecondes en les tronquant au millieme", () => {
    expect(
      lireHorodatageTransporteur("2026-10-29 18:14:05.627604+00:00"),
    ).toEqual(new Date("2026-10-29T18:14:05.627Z"));
  });

  it("convertit un decalage non nul en UTC", () => {
    expect(lireHorodatageTransporteur("2026-11-03 15:52:55+01:00")).toEqual(
      REMISE_LOCKER,
    );
  });

  it("accepte la forme ISO avec Z", () => {
    expect(lireHorodatageTransporteur("2026-11-03T14:52:55Z")).toEqual(
      REMISE_LOCKER,
    );
  });

  it.each([
    ["sans decalage", "2026-11-03 14:52:55"],
    ["vide", ""],
    ["non textuel", 1762181575],
    ["date impossible", "2026-13-45 99:00:00+00:00"],
  ])("rend null pour un horodatage %s", (_cas, valeur) => {
    expect(lireHorodatageTransporteur(valeur)).toBeNull();
  });
});
