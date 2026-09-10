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
import { creerClientSuiviSendcloud } from "@/integrations/sendcloud/suivi";

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
    const client = creerClientSuiviSendcloud({ ...IDENTIFIANTS, fetch: espion });

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
    const client = creerClientSuiviSendcloud({ ...IDENTIFIANTS, fetch: espion });

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
