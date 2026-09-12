/**
 * Creation d'un colis chez Sendcloud, LS-218.
 *
 * AUCUNE ETIQUETTE REELLE N'EST CREEE PAR CE FICHIER, et c'est une exigence et
 * non une commodite : Sendcloud n'a pas de mode test, chaque creation aboutie
 * est FACTUREE, 4,10 € en point relais et 7,49 € au domicile, ADR-035. Le
 * `fetch` est injecte partout, et l'implementation reelle n'est jamais jointe.
 *
 * CE QUI SE PROUVE ICI EST LA FORME DE CE QUI PART, et ce que le module fait de
 * ce qui revient. Le chemin nominal contre l'API vivante ne sera exerce qu'une
 * fois, au premier envoi reel, critere 10 de la story.
 */
import { describe, expect, it, vi } from "vitest";

import { TransporteurIndisponibleError } from "@/integrations/sendcloud/index";
import { creerClientExpeditionSendcloud } from "@/integrations/sendcloud/expedition";
import type { DemandeExpedition } from "@/integrations/sendcloud/expedition";

const ADRESSE = {
  nom: "TEST Camille Dupont",
  ligne1: "12 rue de Test",
  ligne2: null,
  codePostal: "64170",
  ville: "TESTVILLE",
  pays: "FR",
  email: "test@example.invalid",
  telephone: null,
};

/*
 * LE POIDS ARRIVE PAR LA DEMANDE DEPUIS LS-218 critere 11, il n'est plus une
 * constante du module. La valeur employee ici n'est PAS le defaut de la colonne,
 * 200 g, et c'est deliberé : un test ecrit avec la valeur par defaut passerait
 * a l'identique si le module se remettait a lire une constante, donc il ne
 * prouverait pas la propagation.
 */
const POIDS_DEMANDE = 180;

const DEMANDE_DOMICILE: DemandeExpedition = {
  reference: "C-TEST-0001",
  mode: "DOMICILE",
  adresse: ADRESSE,
  pointRetraitId: null,
  poidsGrammes: POIDS_DEMANDE,
};

const DEMANDE_RELAIS: DemandeExpedition = {
  reference: "C-TEST-0002",
  mode: "POINT_RELAIS",
  adresse: ADRESSE,
  pointRetraitId: "123456",
  poidsGrammes: POIDS_DEMANDE,
};

/** Une reponse de creation reussie, forme minimale que le module lit. */
function reponseCreee(id = 42, suivi = "3STEST000001"): Response {
  return new Response(
    JSON.stringify({ parcel: { id, tracking_number: suivi } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Un `fetch` simule qui rend une reponse NEUVE a chaque appel.
 *
 * UN `Response` NE SE LIT QU'UNE FOIS, son corps etant un flux. Rendre la MEME
 * instance a deux appels fait echouer le second sur « réponse illisible », ce
 * qui accuse le module d'un defaut appartenant au test. Piege rencontre en
 * ecrivant ce fichier.
 */
function fetchSimule(fabrique: () => Response = () => reponseCreee()) {
  return vi.fn().mockImplementation(async () => fabrique());
}

function client(fetchSimule: typeof globalThis.fetch) {
  return creerClientExpeditionSendcloud({
    clePublique: "cle-publique-de-test",
    cleSecrete: "cle-secrete-de-test",
    fetch: fetchSimule,
  });
}

describe("creation d'un colis", () => {
  it("rend l'identifiant de colis et le numero de suivi", async () => {
    const appel = vi.fn().mockResolvedValue(reponseCreee(77, "3SABCD999"));

    const issue = await client(appel).creer(DEMANDE_DOMICILE);

    expect(issue).toEqual({
      identifiantColis: 77,
      numeroSuivi: "3SABCD999",
    });
  });

  /*
   * L'ADRESSE PART TELLE QUE LA COMMANDE LA PORTE, critere 1. C'est le gain
   * central de la story : aujourd'hui l'exploitante la RESSAISIT chez Sendcloud,
   * et une adresse fautive produit un colis perdu dont le risque reste a la
   * charge du vendeur jusqu'a la remise.
   */
  it("envoie l'adresse de la commande, sans ressaisie", async () => {
    const appel = vi.fn().mockResolvedValue(reponseCreee());

    await client(appel).creer(DEMANDE_DOMICILE);

    const corps = JSON.parse(appel.mock.calls[0]![1]!.body as string);

    expect(corps.parcel).toMatchObject({
      name: "TEST Camille Dupont",
      address: "12 rue de Test",
      postal_code: "64170",
      city: "TESTVILLE",
      country: "FR",
      order_number: "C-TEST-0001",
    });
  });

  /*
   * CRITERE 4, LA METHODE VIENT DU MODE ET N'EST JAMAIS DEVINEE. Un identifiant
   * faux cree une etiquette au mauvais tarif : la creation REUSSIT, l'etiquette
   * sort, et l'ecart ne se lit que sur la facture du mois.
   */
  it("choisit la methode Mondial Relay du mode demande", async () => {
    const appel = fetchSimule();

    await client(appel).creer(DEMANDE_DOMICILE);
    const domicile = JSON.parse(appel.mock.calls[0]![1]!.body as string);
    expect(domicile.parcel.shipment).toEqual({ id: 27755 });

    await client(appel).creer(DEMANDE_RELAIS);
    const relais = JSON.parse(appel.mock.calls[1]![1]!.body as string);
    expect(relais.parcel.shipment).toEqual({ id: 28035 });
  });

  /*
   * LE POINT DE RETRAIT N'EST POSE QUE QUAND IL EXISTE. Envoyer le champ a
   * `null` au domicile fait echouer la creation chez le fournisseur, et
   * l'echec revient APRES l'appel reseau, donc plus tard et moins lisiblement.
   */
  it("porte le point de retrait en relais et l'omet au domicile", async () => {
    const appel = fetchSimule();

    await client(appel).creer(DEMANDE_RELAIS);
    const relais = JSON.parse(appel.mock.calls[0]![1]!.body as string);
    expect(relais.parcel.to_service_point).toBe(123456);

    await client(appel).creer(DEMANDE_DOMICILE);
    const domicile = JSON.parse(appel.mock.calls[1]![1]!.body as string);
    expect(domicile.parcel).not.toHaveProperty("to_service_point");
  });

  /*
   * LE POIDS PART EN KILOGRAMMES, forme attendue par Sendcloud, quand le projet
   * raisonne en grammes. La conversion vit au bord et nulle part ailleurs : la
   * dupliquer ferait diverger les deux unites au premier ajustement.
   *
   * CE TEST PROUVE DEUX CHOSES DEPUIS LS-218 critere 11, et la seconde est
   * neuve : la conversion, et le fait que le poids EMPLOYE soit celui de la
   * demande. La valeur attendue derive de `POIDS_DEMANDE` plutot que d'etre
   * ecrite en dur, sans quoi remettre une constante dans le module laisserait
   * ce test vert.
   */
  it("convertit en kilogrammes le poids recu dans la demande", async () => {
    const appel = vi.fn().mockResolvedValue(reponseCreee());

    await client(appel).creer(DEMANDE_DOMICILE);
    const corps = JSON.parse(appel.mock.calls[0]![1]!.body as string);

    expect(corps.parcel.weight).toBe((POIDS_DEMANDE / 1000).toFixed(3));
    expect(corps.parcel.weight).toBe("0.180");
  });

  /*
   * L'ETIQUETTE EST DEMANDEE DANS LE MEME APPEL. Sans `request_label`, le colis
   * existe et est facture, mais aucune etiquette n'est produite : il faudrait
   * un second appel, pendant lequel un colis paye reste inexpediable.
   */
  it("demande l'etiquette a la creation", async () => {
    const appel = vi.fn().mockResolvedValue(reponseCreee());

    await client(appel).creer(DEMANDE_DOMICILE);
    const corps = JSON.parse(appel.mock.calls[0]![1]!.body as string);

    expect(corps.parcel.request_label).toBe(true);
  });

  /*
   * LE DOMAINE EST `panel.sendcloud.sc` ET NON `servicepoints.sendcloud.sc`,
   * qui porte les points de retrait. Se tromper d'hote rend un 404 qu'on lit a
   * tort comme une cle invalide, mesure le 10 septembre 2026 sur ce projet.
   */
  it("appelle le domaine du panneau et non celui des points de retrait", async () => {
    const appel = vi.fn().mockResolvedValue(reponseCreee());

    await client(appel).creer(DEMANDE_DOMICILE);

    expect(String(appel.mock.calls[0]![0])).toBe(
      "https://panel.sendcloud.sc/api/v2/parcels",
    );
  });

  it("envoie la requete en POST", async () => {
    const appel = vi.fn().mockResolvedValue(reponseCreee());

    await client(appel).creer(DEMANDE_DOMICILE);

    expect(appel.mock.calls[0]![1]!.method).toBe("POST");
  });
});

describe("pannes du transporteur", () => {
  /*
   * TOUTE PANNE LEVE `TransporteurIndisponibleError`, jamais une erreur brute :
   * le service la traduit en refus lisible et la saisie manuelle reste
   * possible, meme regle de degradation qu'ADR-025.
   */
  it("traduit une panne reseau", async () => {
    const appel = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(client(appel).creer(DEMANDE_DOMICILE)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("traduit un refus du transporteur", async () => {
    const appel = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 400 }));

    await expect(client(appel).creer(DEMANDE_DOMICILE)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  /*
   * LE MESSAGE NE REPREND NI L'ADRESSE NI LES CLES, invariant 9, le depot etant
   * public. Sendcloud renvoie les champs refuses dans son corps d'erreur, donc
   * l'adresse du client : seul le code sort.
   */
  it("ne fait fuiter ni adresse ni identifiants dans le message", async () => {
    const corpsFuitant = JSON.stringify({
      error: { message: "invalid address 12 rue de Test 64170 TESTVILLE" },
    });
    const appel = fetchSimule(
      () => new Response(corpsFuitant, { status: 400 }),
    );

    const erreur = (await client(appel)
      .creer(DEMANDE_DOMICILE)
      .catch((e: unknown) => e)) as Error;

    /*
     * LE MESSAGE EST FIXE, ET C'EST LA CLASSE QUI L'IMPOSE.
     * `TransporteurIndisponibleError` prend une CAUSE et non un message : son
     * `super()` porte toujours « Transporteur indisponible ». Le detail passe
     * par `cause`, qui ne s'affiche jamais a l'ecran ni au journal.
     *
     * Ma premiere version de ce test attendait « réponse 400 » dans le message,
     * ce qui supposait une classe qu'on peut personnaliser : la forme reelle est
     * PLUS sure, aucun appelant ne pouvant faire fuiter un detail par megarde.
     */
    expect(erreur.message).toBe("Transporteur indisponible");
    expect(erreur.message).not.toContain("rue de Test");
    expect(erreur.message).not.toContain("cle-secrete-de-test");
    expect(erreur.message).not.toContain("cle-publique-de-test");

    /*
     * LA CAUSE NE PORTE PAS DAVANTAGE L'ADRESSE. Le module n'y met que le code
     * HTTP : reprendre le corps d'erreur de Sendcloud y ferait entrer l'adresse
     * du client, et une cause finit dans un journal, invariant 9.
     */
    expect(JSON.stringify(erreur.cause ?? "")).not.toContain("rue de Test");
  });

  /*
   * UN COLIS SANS NUMERO DE SUIVI EST PAYE MAIS INTROUVABLE : la tache horaire
   * ne pourra jamais le lire, donc `livreA` restera nul, donc le delai de
   * retractation ne demarrera pas et l'invitation a deposer un avis ne partira
   * pas. Mieux vaut lever que d'enregistrer une expedition muette.
   */
  it("refuse une reponse sans numero de suivi", async () => {
    const appel = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ parcel: { id: 42 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(client(appel).creer(DEMANDE_DOMICILE)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("refuse une reponse sans identifiant de colis", async () => {
    const appel = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ parcel: { tracking_number: "3S1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(client(appel).creer(DEMANDE_DOMICILE)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  it("refuse une reponse illisible", async () => {
    const appel = vi
      .fn()
      .mockResolvedValue(new Response("pas du json", { status: 200 }));

    await expect(client(appel).creer(DEMANDE_DOMICILE)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });

  /*
   * LE DELAI EST BORNE. Sans lui, un fournisseur qui ne repond jamais tiendrait
   * la Server Action ouverte, et l'exploitante resterait devant un ecran fige
   * sans savoir si son colis est cree.
   */
  it("abandonne au-dela du delai maximum", async () => {
    const jamais = vi.fn().mockImplementation(() => new Promise(() => {}));
    const clientBref = creerClientExpeditionSendcloud({
      clePublique: "p",
      cleSecrete: "s",
      fetch: jamais as unknown as typeof globalThis.fetch,
      delaiMaximumMs: 10,
    });

    await expect(clientBref.creer(DEMANDE_DOMICILE)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });
});

describe("lecture d'une etiquette", () => {
  /*
   * SEPAREE DE LA CREATION, ET C'EST DELIBERE : une etiquette se reimprime,
   * papier bourre ou imprimante eteinte. Fusionner les deux obligerait a
   * recreer un colis pour ravoir son etiquette, donc a payer deux fois.
   */
  it("rend le PDF du colis demande", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const appel = vi.fn().mockResolvedValue(new Response(pdf, { status: 200 }));

    const contenu = await client(appel).lireEtiquette(42);

    expect(new Uint8Array(contenu)).toEqual(pdf);
    expect(String(appel.mock.calls[0]![0])).toContain(
      "/labels/normal_printer/42",
    );
  });

  it("traduit une panne en indisponibilite", async () => {
    const appel = vi.fn().mockResolvedValue(new Response("", { status: 500 }));

    await expect(client(appel).lireEtiquette(42)).rejects.toBeInstanceOf(
      TransporteurIndisponibleError,
    );
  });
});
