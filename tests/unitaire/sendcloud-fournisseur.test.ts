/**
 * Le fournisseur reel de points de retrait, LS-200. Etape 3b du parcours 1.
 *
 * CE QUE CE FICHIER EXERCE, ET QUE `points-retrait.test.ts` N'EXERCE PAS : la
 * TRADUCTION de la reponse Sendcloud vers le type du projet, et la traduction
 * de ses pannes. L'autre fichier porte le contrat et la degradation, avec des
 * fournisseurs de test qui rendent deja le bon type.
 *
 * AUCUN APPEL RESEAU REEL. `fetch` est injecte, ce qui rend ces tests
 * deterministes et executables sans les cles. L'appel reel a ete constate a la
 * main le 10 septembre 2026, quatre points rendus autour du 64170, et cette
 * verification vit dans le ticket, pas dans la suite.
 *
 * LES DONNEES DE REPONSE SONT REELLES DE FORME ET FICTIVES DE FOND : la forme
 * vient de l'appel constate, les noms et adresses sont inventes. LS-27 interdit
 * d'inventer une reponse d'API, pas de proteger l'adresse d'un commerce tiers.
 */
import { describe, expect, it, vi } from "vitest";

import { TransporteurIndisponibleError } from "@/integrations/sendcloud";
import { creerFournisseurSendcloud } from "@/integrations/sendcloud/fournisseur";

/**
 * Une reponse Sendcloud, telle que l'API la rend vraiment.
 *
 * `id` EST UN ENTIER et `house_number` une chaine SEPAREE de `street` : forme
 * constatee sur 1040 points le 10 septembre 2026, et c'est ce que la traduction
 * doit absorber.
 */
const REPONSE_SENDCLOUD = [
  {
    id: 10858167,
    name: "Commerce de démonstration",
    street: "AVENUE DE LA DEMONSTRATION",
    house_number: "911",
    postal_code: "64170",
    city: "ARTIX",
    country: "FR",
    carrier: "mondial_relay",
    shop_type: "1",
  },
];

/** Identifiants factices, ces tests n'appellent aucun reseau. */
const IDENTIFIANTS = { clePublique: "cle-publique", cleSecrete: "cle-secrete" };

/**
 * Un `fetch` qui rend la reponse donnee, et retient l'appel recu.
 *
 * LA SIGNATURE EST CELLE DE `fetch` ET NON `async () =>`, sans quoi Vitest type
 * `mock.calls` en tuples VIDES : les assertions sur l'URL et les en-tetes ne
 * compilent pas, et les contourner masquerait ce qu'elles verifient.
 */
function fetchQuiRend(corps: unknown, init: { status?: number } = {}) {
  return vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify(corps), {
        status: init.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

describe("creerFournisseurSendcloud, traduction de la reponse", () => {
  it("traduit un point Sendcloud vers le type du projet", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(REPONSE_SENDCLOUD),
    });

    const points = await fournisseur.rechercher({
      codePostal: "64170",
      mode: "POINT_RELAIS",
    });

    expect(points).toEqual([
      {
        identifiant: "10858167",
        nom: "Commerce de démonstration",
        ligne1: "911 AVENUE DE LA DEMONSTRATION",
        codePostal: "64170",
        ville: "ARTIX",
      },
    ]);
  });

  /*
   * L'IDENTIFIANT DEVIENT UNE CHAINE, et le type du fournisseur ne fuit jamais.
   *
   * `PointRetrait.identifiant` est declare `string`, et LS-117 le fige dans
   * `Commande.pointRelaisAdresse`. Laisser passer un entier ferait diverger la
   * valeur stockee selon le chemin, et une comparaison stricte echouerait plus
   * tard sans que rien ne l'explique.
   */
  it("rend un identifiant en chaine, jamais l'entier de Sendcloud", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend(REPONSE_SENDCLOUD),
    });

    const points = await fournisseur.rechercher({
      codePostal: "64170",
      mode: "POINT_RELAIS",
    });
    const point = points[0]!;

    expect(typeof point.identifiant).toBe("string");
  });

  /*
   * UNE VOIE DONT LE NOM CONTIENT UN NOMBRE GARDE SON NUMERO, cas reel mesure
   * le 10 septembre 2026 : « RUE DU 8 MAI 1945 » avec un `house_number` de
   * « 8 ». Une version precedente cherchait le numero dans la voie avant de
   * l'ajouter, et ce cas lui faisait perdre le vrai numero de rue.
   *
   * L'ADRESSE EST FIGEE DANS LA COMMANDE par LS-117 : une ligne fausse le reste
   * pour toujours sur un document qu'aucune correction ne modifie.
   */
  it("garde le numero quand le nom de la voie contient un nombre", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend([
        {
          ...REPONSE_SENDCLOUD[0],
          street: "RUE DU 8 MAI 1945",
          house_number: "8",
        },
      ]),
    });

    const points = await fournisseur.rechercher({
      codePostal: "64170",
      mode: "POINT_RELAIS",
    });
    const point = points[0]!;

    expect(point.ligne1).toBe("8 RUE DU 8 MAI 1945");
  });

  /*
   * LE NUMERO VIDE EXISTE, 16 cas sur les 1040 points mesures, dont « RUE
   * JULES VALLES » a Rennes. Sans ce repli la ligne commencerait par une
   * espace, sur une adresse figee.
   */
  it("rend la voie seule quand le numero est absent", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend([
        {
          ...REPONSE_SENDCLOUD[0],
          street: "RUE JULES VALLES",
          house_number: "",
        },
      ]),
    });

    const points = await fournisseur.rechercher({
      codePostal: "64170",
      mode: "POINT_RELAIS",
    });
    const point = points[0]!;

    expect(point.ligne1).toBe("RUE JULES VALLES");
  });
});

describe("creerFournisseurSendcloud, appel emis", () => {
  it("demande Mondial Relay et non un autre transporteur", async () => {
    const fetchEspion = fetchQuiRend(REPONSE_SENDCLOUD);
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchEspion,
    });

    await fournisseur.rechercher({ codePostal: "64170", mode: "POINT_RELAIS" });

    const [url] = fetchEspion.mock.calls[0]!;
    expect(String(url)).toContain("carrier=mondial_relay");
    expect(String(url)).toContain("country=FR");
  });

  /*
   * LES CLES NE VONT PAS DANS L'URL, elles vont dans l'en-tete.
   *
   * Une cle en parametre de requete se retrouve dans les journaux de tout
   * intermediaire, et le depot est public, invariant 9. Ce test echouerait si
   * quelqu'un passait aux parametres `public_key` que d'anciennes versions de
   * l'API acceptaient.
   */
  it("authentifie par en-tete et jamais par l'URL", async () => {
    const fetchEspion = fetchQuiRend(REPONSE_SENDCLOUD);
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchEspion,
    });

    await fournisseur.rechercher({ codePostal: "64170", mode: "POINT_RELAIS" });

    const [url, options] = fetchEspion.mock.calls[0]!;
    expect(String(url)).not.toContain("cle-secrete");
    expect(String(url)).not.toContain("cle-publique");

    const entetes = new Headers(options?.headers);
    expect(entetes.get("authorization")).toBe(
      `Basic ${Buffer.from("cle-publique:cle-secrete").toString("base64")}`,
    );
  });
});

describe("creerFournisseurSendcloud, pannes du fournisseur", () => {
  /*
   * TOUTE PANNE DEVIENT `TransporteurIndisponibleError`, jamais l'erreur brute.
   *
   * `chercherPointsRetrait` degrade sur n'importe quelle exception, mais le
   * type nomme la nature de l'incident et evite qu'un message de reseau
   * remonte tel quel. C'est la traduction attendue d'`integrations/`.
   */
  it("traduit un refus HTTP en TransporteurIndisponibleError", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend({ error: "unauthorized" }, { status: 401 }),
    });

    await expect(
      fournisseur.rechercher({ codePostal: "64170", mode: "POINT_RELAIS" }),
    ).rejects.toBeInstanceOf(TransporteurIndisponibleError);
  });

  it("traduit une panne reseau en TransporteurIndisponibleError", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: vi.fn(async () => {
        throw new Error("connexion refusée");
      }),
    });

    await expect(
      fournisseur.rechercher({ codePostal: "64170", mode: "POINT_RELAIS" }),
    ).rejects.toBeInstanceOf(TransporteurIndisponibleError);
  });

  /*
   * UN CORPS QUI N'EST PAS UNE LISTE EST UNE PANNE, pas une liste vide.
   *
   * Une passerelle qui rend une page HTML d'erreur avec un code 200 existe, et
   * la traiter comme « aucun point » ferait renoncer un visiteur qui a bien un
   * relais chez lui, defaut que le contrat distingue explicitement.
   */
  it("traite un corps inattendu comme une panne", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend({ message: "maintenance" }),
    });

    await expect(
      fournisseur.rechercher({ codePostal: "64170", mode: "POINT_RELAIS" }),
    ).rejects.toBeInstanceOf(TransporteurIndisponibleError);
  });

  /*
   * LE MESSAGE D'ERREUR NE PORTE JAMAIS LES IDENTIFIANTS, invariant 9.
   *
   * Une exception remonte au journal technique, et le depot est public. Ce
   * test echouerait si quelqu'un incluait l'URL complete ou l'en-tete dans la
   * cause pour faciliter le diagnostic.
   */
  it("ne laisse fuiter aucun identifiant dans l'erreur", async () => {
    const fournisseur = creerFournisseurSendcloud({
      ...IDENTIFIANTS,
      fetch: fetchQuiRend({ error: "unauthorized" }, { status: 401 }),
    });

    const erreur = await fournisseur
      .rechercher({ codePostal: "64170", mode: "POINT_RELAIS" })
      .catch((cause: unknown) => cause);

    const texte = JSON.stringify(
      erreur,
      Object.getOwnPropertyNames(erreur as object),
    );
    expect(texte).not.toContain("cle-secrete");
    expect(texte).not.toContain("cle-publique");
  });
});

describe("creerFournisseurSendcloud, configuration absente", () => {
  /*
   * UNE CLE MANQUANTE EST UNE PANNE DE CONFIGURATION, et elle se voit tout de
   * suite. Appeler l'API sans identifiants produirait un 401 que le tunnel
   * degraderait en silence : la boutique vendrait a domicile pour toujours,
   * sans que rien ne signale la cause. Meme motif que
   * `ConfigurationEmailIncompleteError`.
   */
  it("leve sans appeler le reseau quand une cle manque", async () => {
    const fetchEspion = fetchQuiRend(REPONSE_SENDCLOUD);

    expect(() =>
      creerFournisseurSendcloud({
        clePublique: "",
        cleSecrete: "cle-secrete",
        fetch: fetchEspion,
      }),
    ).toThrow();

    expect(fetchEspion).not.toHaveBeenCalled();
  });
});
