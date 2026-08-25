/**
 * Points de retrait Mondial Relay, LS-115. Etape 3b du parcours 1.
 *
 * CE FICHIER PORTE LE CRITERE 6, LE PLUS IMPORTANT DE LA STORY : « l'API
 * Mondial Relay indisponible n'empeche pas de commander a domicile ». Le
 * parcours 1 fonde la vente restante sur le fait qu'un mode au moins n'appelle
 * aucun service externe.
 *
 * LES TESTS SONT ECRITS AVANT L'IMPLEMENTATION. Une panne de transporteur qui
 * fermerait la boutique ne se verrait qu'en production, le jour ou l'API tombe.
 *
 * AUCUN APPEL RESEAU REEL. Le compte Mondial Relay n'existe pas encore, LS-27
 * et LS-18 l'attendant de l'ouverture du compte bancaire professionnel, et
 * LS-27 interdit tout identifiant fictif ou reponse d'API inventee. Ces tests
 * exercent le contrat de l'interface et le comportement en panne, jamais le
 * fournisseur.
 */
import { describe, expect, it } from "vitest";

import {
  TransporteurIndisponibleError,
  chercherPointsRetrait,
} from "@/integrations/mondial-relay";
import type { FournisseurPointsRetrait } from "@/integrations/mondial-relay";

/** Un point de retrait plausible, sans aucune donnee reelle de commerce. */
const POINT_EXEMPLE = {
  identifiant: "FR-000000",
  nom: "Point de retrait de démonstration",
  ligne1: "1 rue de la Démonstration",
  codePostal: "35000",
  ville: "Rennes",
};

/** Fournisseur qui repond normalement. */
const fournisseurQuiRepond: FournisseurPointsRetrait = {
  async rechercher() {
    return [POINT_EXEMPLE];
  },
};

/** Fournisseur en panne, le cas d'erreur du parcours 1. */
const fournisseurEnPanne: FournisseurPointsRetrait = {
  async rechercher() {
    throw new Error("connexion refusée");
  },
};

/** Fournisseur qui ne repond jamais, pour la borne de temps. */
const fournisseurQuiPend: FournisseurPointsRetrait = {
  async rechercher() {
    return new Promise(() => {
      /* ne se resout jamais */
    });
  },
};

describe("chercherPointsRetrait, cas nominal", () => {
  it("rend les points du fournisseur", async () => {
    const resultat = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurQuiRepond,
    });

    expect(resultat.disponible).toBe(true);
    expect(resultat.points).toEqual([POINT_EXEMPLE]);
  });
});

describe("chercherPointsRetrait, transporteur indisponible", () => {
  /*
   * LA PANNE REND UN RESULTAT, ELLE NE LEVE PAS.
   *
   * C'est la decision centrale de ce module. Une exception qui remonterait
   * jusqu'a la page ferait une erreur serveur, et le visiteur perdrait le
   * tunnel entier alors que le domicile reste commandable. Le parcours 1 exige
   * l'inverse : « le domicile reste propose, il n'exige aucun appel au
   * transporteur ».
   */
  it("ne leve pas quand le fournisseur echoue", async () => {
    await expect(
      chercherPointsRetrait({
        codePostal: "35000",
        mode: "POINT_RELAIS",
        fournisseur: fournisseurEnPanne,
      }),
    ).resolves.toBeDefined();
  });

  it("signale l'indisponibilite plutot que de rendre une liste vide", async () => {
    const resultat = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurEnPanne,
    });

    expect(resultat.disponible).toBe(false);
  });

  /*
   * UNE LISTE VIDE ET UNE PANNE NE SE DISENT PAS PAREIL.
   *
   * « Aucun point de retrait pres de ce code postal » est une reponse exacte du
   * transporteur, « le service est momentanement indisponible » un incident.
   * Les confondre ferait croire au visiteur qu'aucun relais n'existe chez lui
   * et le pousserait a renoncer, alors que reessayer suffirait.
   */
  it("distingue une panne d'une recherche sans resultat", async () => {
    const fournisseurSansResultat: FournisseurPointsRetrait = {
      async rechercher() {
        return [];
      },
    };

    const panne = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurEnPanne,
    });
    const vide = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurSansResultat,
    });

    expect(panne.disponible).toBe(false);
    expect(vide.disponible).toBe(true);
    expect(vide.points).toEqual([]);
  });

  /*
   * LE DOMICILE RESTE TOUJOURS PROPOSE, y compris en panne. Ce test lit la
   * meme propriete que `MODES_SANS_POINT_RETRAIT` mais depuis le resultat que
   * l'ecran consommera : c'est ce champ que le tunnel affichera, et une panne
   * qui le viderait fermerait la vente sans qu'aucun autre test ne le voie.
   */
  it("laisse le domicile proposable meme en panne", async () => {
    const resultat = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurEnPanne,
    });

    expect(resultat.modesEncoreProposables).toContain("DOMICILE");
  });

  /*
   * LE MESSAGE EST SANS JARGON TECHNIQUE, exigence explicite du parcours 1.
   * Un visiteur n'a rien a faire de « ECONNREFUSED » ni d'un code HTTP, et
   * afficher le message d'une exception laisserait fuiter la trace du
   * fournisseur.
   */
  it("ne laisse fuiter aucun detail technique du fournisseur", async () => {
    const resultat = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurEnPanne,
    });

    expect(resultat.message).toBeDefined();
    expect(resultat.message).not.toContain("connexion refusée");
  });
});

describe("chercherPointsRetrait, borne de temps", () => {
  /*
   * UN FOURNISSEUR QUI NE REPOND PAS EST UNE PANNE, pas une attente infinie.
   *
   * Sans borne, une page serveur resterait suspendue sur l'appel et le visiteur
   * verrait un ecran vide jusqu'au delai du navigateur. Le comportement attendu
   * est le meme que pour une erreur : degrader le choix, garder la vente.
   */
  it("traite une absence de reponse comme une indisponibilite", async () => {
    const resultat = await chercherPointsRetrait({
      codePostal: "35000",
      mode: "POINT_RELAIS",
      fournisseur: fournisseurQuiPend,
      delaiMaximumMs: 20,
    });

    expect(resultat.disponible).toBe(false);
  });
});

describe("chercherPointsRetrait, entrees hors domaine", () => {
  /*
   * LE MODE DOMICILE N'A PAS DE POINT DE RETRAIT, contrainte
   * `chk_commande_mode_point_relais`. Appeler le transporteur pour lui serait
   * une depense inutile et surtout un signe que l'appelant confond les modes :
   * mieux vaut lever qu'accepter en silence.
   */
  it("refuse d'etre appele pour le mode DOMICILE", async () => {
    await expect(
      chercherPointsRetrait({
        codePostal: "35000",
        mode: "DOMICILE",
        fournisseur: fournisseurQuiRepond,
      }),
    ).rejects.toThrow(RangeError);
  });

  /*
   * UN CODE POSTAL HORS METROPOLE N'ATTEINT PAS LE TRANSPORTEUR. Le meme
   * filtre que `schemaCodePostalMetropole` : promettre une livraison que le
   * tarif d'ADR-025 ne couvre pas serait une information precontractuelle
   * fausse.
   */
  it.each(["97400", "98000", "abcde", "350"])(
    "refuse le code postal %s",
    async (codePostal) => {
      await expect(
        chercherPointsRetrait({
          codePostal,
          mode: "POINT_RELAIS",
          fournisseur: fournisseurQuiRepond,
        }),
      ).rejects.toThrow(RangeError);
    },
  );
});

describe("TransporteurIndisponibleError", () => {
  /*
   * L'ERREUR EXISTE MEME SI `chercherPointsRetrait` NE LA PROPAGE PAS.
   *
   * Elle est ce que l'implementation reelle levera quand le compte Mondial
   * Relay existera, et ce que la fonction attrape pour rendre son resultat
   * degrade. La nommer maintenant evite qu'un appel reel invente sa propre
   * facon d'echouer, comme `FournisseurEmailIndisponibleError` le fait pour
   * ADR-008.
   */
  it("porte son nom, pour etre distinguee d'une erreur de programmation", () => {
    const erreur = new TransporteurIndisponibleError();

    expect(erreur.name).toBe("TransporteurIndisponibleError");
    expect(erreur).toBeInstanceOf(Error);
  });
});
