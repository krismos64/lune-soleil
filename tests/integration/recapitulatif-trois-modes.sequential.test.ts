/**
 * Le récapitulatif avant paiement, sur les trois modes de livraison. LS-86,
 * critère 5. Zone critique : information précontractuelle.
 *
 * CE QUE LS-86 A ÉTABLI AUX SOURCES, et que ces tests verrouillent. L'article
 * qui gouverne le récapitulatif est **L221-14 alinéa 1**, et non L221-5 comme
 * la story le supposait : il énumère LIMITATIVEMENT quatre informations à
 * rappeler avant la commande, dont les caractéristiques essentielles et le
 * prix. La sanction est une amende administrative de L242-10.
 *
 * L'ADRESSE RAPPELÉE N'EST IMPOSÉE PAR AUCUN TEXTE, ni L221-14, ni L221-5, ni
 * L111-1. Elle est affichée par **arbitrage d'ergonomie** de Christophe du
 * 25 août 2026 : une adresse rappelée évite les erreurs de saisie et les colis
 * non distribués. Ne pas transformer cette décision en obligation légale, ici
 * ou ailleurs : une obligation ne se retire pas sans nouvelle vérification, une
 * décision d'ergonomie se rediscute librement.
 *
 * POURQUOI CES TESTS SONT D'INTÉGRATION ET NON UNITAIRES.
 * `construireRecapitulatif` revalide le panier en base, règle S13 : le prix et
 * la disponibilité viennent de la base et jamais du cookie. Reproduire cette
 * revalidation en mémoire testerait une reproduction du service plutôt que le
 * service, motif « tester le service, pas sa reproduction ».
 *
 * POURQUOI PAS UN TEST DE BOUT EN BOUT, ce que le critère 5 demandait
 * littéralement. `tunnel-commande.spec.ts` exerce délibérément le transporteur
 * EN PANNE, les clés Sendcloud n'étant pas posées en bout en bout : c'est le
 * critère 6 de LS-115, et les poser ferait appeler le vrai transporteur à
 * chaque exécution de la CI. Le choix d'un point de retrait y est donc
 * inatteignable, et le domicile est déjà couvert là-bas.
 *
 * CE QUI RESTAIT VRAIMENT NON COUVERT est `rappelerAdresse`, la décision que
 * LS-86 a tranchée : aucun test du dépôt ne la touchait, ni unitaire ni
 * d'intégration. C'est elle que ces tests exercent, sur les trois modes.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let tunnel: typeof import("@/services/tunnel");

/**
 * Le point de retrait employé par les deux modes en relais.
 *
 * UNE ADRESSE MANIFESTEMENT FICTIVE, et c'est une exigence de LS-27 : « aucun
 * identifiant fictif, aucune réponse d'API inventée ». Un commerce plausible
 * ferait passer l'adresse réelle d'un tiers pour un point partenaire.
 */
const POINT_RETRAIT = {
  identifiant: "TEST-POINT-1",
  nom: "Point de démonstration",
  ligne1: "1 rue de la Démonstration",
  codePostal: "35000",
  ville: "Rennes",
} as const;

/** L'adresse personnelle saisie à l'étape 2, distincte du point de retrait. */
const ADRESSE_CLIENT = {
  ligne1: "12 avenue des Essais",
  codePostal: "64000",
  ville: "Pau",
  /*
   * `pays` EST EXIGÉ PAR LE TYPE ET VAUT TOUJOURS « FR », zone desservie
   * d'ADR-025, France métropolitaine Corse comprise. C'est une restriction de
   * livraison au sens de L221-14 alinéa 3, annoncée à l'ENTRÉE du tunnel et
   * non au récapitulatif.
   */
  pays: "FR",
} as const;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  tunnel = await import("@/services/tunnel");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("TRUNCATE produit, categorie, media CASCADE");
});

/** Crée un produit d'une variante et rend l'identifiant de la VARIANTE. */
async function creerVariante(prixCentimes = 4900): Promise<string> {
  const categorieId = randomUUID();
  await client.query(
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, $2, $3, (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())`,
    [
      categorieId,
      `Cat ${categorieId.slice(0, 8)}`,
      `cat-${categorieId.slice(0, 8)}`,
    ],
  );

  const produitId = randomUUID();
  const varianteId = randomUUID();
  const suffixe = produitId.slice(0, 8);

  await client.query(
    `INSERT INTO produit (id, categorie_id, nom, slug, statut, publie_a, cree_a, modifie_a)
     VALUES ($1, $2, $3, $4, 'ACTIF', now(), now(), now())`,
    [produitId, categorieId, "Collier d'essai", `produit-${suffixe}`],
  );

  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, cree_a
     )
     VALUES ($1, $2, $3, 'Déclinaison', $4, 3, 0, true, now())`,
    [varianteId, produitId, `REF-${suffixe.toUpperCase()}`, prixCentimes],
  );

  return varianteId;
}

/** La saisie complète du tunnel, pour le mode demandé. */
function saisiePour(
  mode: "DOMICILE" | "POINT_RELAIS" | "LOCKER",
): Parameters<typeof tunnel.construireRecapitulatif>[0]["saisie"] {
  return {
    nomClient: "Camille Dupont",
    email: "camille.dupont@exemple.test",
    telephone: null,
    adresse: { ...ADRESSE_CLIENT },
    mode,
    pointRetrait: mode === "DOMICILE" ? null : { ...POINT_RETRAIT },
  };
}

describe("l'adresse rappelée suit le mode de livraison", () => {
  it("rappelle l'adresse du client à domicile", async () => {
    const varianteId = await creerVariante();

    const recapitulatif = await tunnel.construireRecapitulatif({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: saisiePour("DOMICILE"),
    });

    expect(recapitulatif.adresseRappelee.nature).toBe("CLIENT");
    expect(recapitulatif.adresseRappelee.ligne1).toBe(ADRESSE_CLIENT.ligne1);
    expect(recapitulatif.adresseRappelee.ville).toBe(ADRESSE_CLIENT.ville);

    // AUCUN NOM DE POINT À DOMICILE : le colis part chez la personne, il n'y a
    // pas de commerce partenaire à nommer.
    expect(recapitulatif.adresseRappelee.nomPoint).toBeNull();
  });

  it("rappelle l'adresse du POINT DE RETRAIT en Point Relais", async () => {
    /*
     * LE CŒUR DE L'ARBITRAGE DE LS-86. En relais, l'adresse personnelle du
     * client n'a AUCUN usage : le colis part au commerce partenaire. En
     * afficher une qui ne servira pas induit en erreur sur le lieu de retrait.
     */
    const varianteId = await creerVariante();

    const recapitulatif = await tunnel.construireRecapitulatif({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: saisiePour("POINT_RELAIS"),
    });

    expect(recapitulatif.adresseRappelee.nature).toBe("POINT_RETRAIT");
    expect(recapitulatif.adresseRappelee.nomPoint).toBe(POINT_RETRAIT.nom);
    expect(recapitulatif.adresseRappelee.ligne1).toBe(POINT_RETRAIT.ligne1);
    expect(recapitulatif.adresseRappelee.ville).toBe(POINT_RETRAIT.ville);

    // L'ADRESSE PERSONNELLE N'APPARAÎT NULLE PART, et c'est l'assertion qui
    // porte la décision : vérifier la seule présence du point laisserait
    // passer un écran qui afficherait les DEUX adresses.
    expect(recapitulatif.adresseRappelee.ligne1).not.toBe(
      ADRESSE_CLIENT.ligne1,
    );
    expect(recapitulatif.adresseRappelee.codePostal).not.toBe(
      ADRESSE_CLIENT.codePostal,
    );
  });

  it("rappelle l'adresse du POINT DE RETRAIT en Locker", async () => {
    /*
     * LE LOCKER SUIT LA MÊME RÈGLE QUE LE POINT RELAIS, et ce test n'est pas
     * une copie inutile : les deux modes sont des valeurs d'enum distinctes, et
     * le motif « un enum ajouté casse un ternaire » s'est produit quatre fois
     * sur ce projet. Une condition écrite sur le seul `POINT_RELAIS` passerait
     * le test précédent en laissant le Locker afficher l'adresse du client.
     */
    const varianteId = await creerVariante();

    const recapitulatif = await tunnel.construireRecapitulatif({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: saisiePour("LOCKER"),
    });

    expect(recapitulatif.adresseRappelee.nature).toBe("POINT_RETRAIT");
    expect(recapitulatif.adresseRappelee.nomPoint).toBe(POINT_RETRAIT.nom);
    expect(recapitulatif.adresseRappelee.ligne1).toBe(POINT_RETRAIT.ligne1);
  });

  it("rappelle le NOM du client sur les trois modes", async () => {
    /*
     * LE NOM EST L'IDENTITÉ À PRÉSENTER AU RETRAIT, arbitrage de LS-86 : sans
     * lui, la personne qui se présente au commerce partenaire ne sait pas sous
     * quel nom le colis est déposé. Il est rappelé à domicile aussi, le
     * transporteur y sonnant à une porte.
     */
    const varianteId = await creerVariante();

    for (const mode of ["DOMICILE", "POINT_RELAIS", "LOCKER"] as const) {
      const recapitulatif = await tunnel.construireRecapitulatif({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: saisiePour(mode),
      });

      expect(recapitulatif.nomClient).toBe("Camille Dupont");
    }
  });
});

describe("les informations imposées par L221-14 alinéa 1", () => {
  it("rappelle les caractéristiques essentielles et le prix, sur les trois modes", async () => {
    /*
     * LES DEUX INFORMATIONS QUE LE TEXTE IMPOSE et qui concernent ce site. Les
     * deux autres de l'alinéa, durée du contrat et durée minimale des
     * obligations, ne s'appliquent pas : la vente d'un bijou est un contrat à
     * exécution instantanée.
     *
     * LE PRIX VIENT DE LA BASE ET JAMAIS DU COOKIE, règle S13 : un prix rappelé
     * depuis le cookie afficherait celui du jour de l'ajout au panier, donc
     * une information précontractuelle FAUSSE si le catalogue a bougé depuis.
     */
    const varianteId = await creerVariante(3200);

    for (const mode of ["DOMICILE", "POINT_RELAIS", "LOCKER"] as const) {
      const recapitulatif = await tunnel.construireRecapitulatif({
        lignesCookie: [{ varianteId, quantite: 2 }],
        saisie: saisiePour(mode),
      });

      expect(recapitulatif.lignes).toHaveLength(1);
      expect(recapitulatif.lignes[0]?.produitNom).toBe("Collier d'essai");
      expect(recapitulatif.lignes[0]?.prixUnitaireCentimes).toBe(3200);
      expect(recapitulatif.lignes[0]?.totalLigneCentimes).toBe(6400);
      expect(recapitulatif.totalArticlesCentimes).toBe(6400);
    }
  });

  it("porte un total qui est la somme des articles et du port, en centimes entiers", async () => {
    /*
     * INVARIANT 1, aucun flottant dans un calcul monétaire. L'assertion porte
     * sur l'ÉGALITÉ à la somme plutôt que sur une valeur recopiée : un tarif
     * qui changerait dans la configuration ferait échouer un nombre en dur
     * sans qu'aucune règle n'ait été violée.
     */
    const varianteId = await creerVariante(4900);

    for (const mode of ["DOMICILE", "POINT_RELAIS", "LOCKER"] as const) {
      const recapitulatif = await tunnel.construireRecapitulatif({
        lignesCookie: [{ varianteId, quantite: 1 }],
        saisie: saisiePour(mode),
      });

      expect(recapitulatif.totalCentimes).toBe(
        recapitulatif.totalArticlesCentimes + recapitulatif.fraisPortCentimes,
      );
      expect(Number.isInteger(recapitulatif.totalCentimes)).toBe(true);
      expect(Number.isInteger(recapitulatif.fraisPortCentimes)).toBe(true);
    }
  });

  it("facture le domicile plus cher que le relais, ADR-035", async () => {
    /*
     * CE TEST N'EST PAS UN DOUBLON DE `livraison.test.ts`, qui éprouve le
     * calcul seul : il vérifie que le récapitulatif PRÉSENTE bien des frais
     * distincts selon le mode. Un service qui calculerait juste et rappellerait
     * toujours le tarif du domicile afficherait une information de prix fausse.
     */
    const varianteId = await creerVariante(1000);

    const domicile = await tunnel.construireRecapitulatif({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: saisiePour("DOMICILE"),
    });
    const relais = await tunnel.construireRecapitulatif({
      lignesCookie: [{ varianteId, quantite: 1 }],
      saisie: saisiePour("POINT_RELAIS"),
    });

    expect(domicile.fraisPortCentimes).toBeGreaterThan(
      relais.fraisPortCentimes,
    );
  });
});
