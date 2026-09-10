/**
 * FRISE D'ETAPES DU DETAIL DE COMMANDE, LS-190, criteres 3 et 4.
 *
 * CE QUE CETTE SUITE PROUVE, ET QUI EST LA RAISON D'ETRE DE LA STORY : la frise
 * n'affiche QUE des etapes que le code sait renseigner, et une etape inconnue
 * est ABSENTE plutot que rendue en attente perpetuelle.
 *
 * LA NUANCE PORTE. « En attente » affirme que l'etape VIENDRA : sur un colis
 * dont le transporteur se tait, c'est un suivi FIGE que le client lit comme un
 * blocage, et c'est precisement ce que LS-190 a attendu LS-58 et LS-131 pour
 * eviter.
 *
 * ELLE TESTE LA DERIVATION ET NON LE RENDU, deliberement. La regle vit dans le
 * choix des etapes : un test de composant prouverait le balisage et laisserait
 * la regle sans preuve.
 */
import { describe, expect, it } from "vitest";

import { derriverEtapes } from "@/app/(boutique)/compte/commandes/[id]/frise-etapes";

const CREEE_A = new Date("2026-09-01T10:00:00.000Z");
const EXPEDIEE_A = new Date("2026-09-03T09:00:00.000Z");
const LIVREE_A = new Date("2026-09-05T14:00:00.000Z");

describe("etats non nominaux, critere 4", () => {
  it("ne rend aucune etape sur une commande annulee", () => {
    const etapes = derriverEtapes({
      statut: "ANNULEE",
      creeA: CREEE_A,
      expedition: null,
    });

    /*
     * AFFICHER « CONFIRMEE » PUIS S'ARRETER laisserait croire a une livraison
     * en attente, alors que rien ne viendra. Le statut, affiche juste au-dessus
     * par le recapitulatif, dit deja ce qui s'est passe.
     */
    expect(etapes).toEqual([]);
  });

  it("ne rend aucune etape sur une commande non payee", () => {
    const etapes = derriverEtapes({
      statut: "EN_ATTENTE_PAIEMENT",
      creeA: CREEE_A,
      expedition: null,
    });

    expect(etapes).toEqual([]);
  });

  it("s'arrete a la confirmation quand aucun colis n'est parti", () => {
    const etapes = derriverEtapes({
      statut: "CONFIRMEE",
      creeA: CREEE_A,
      expedition: null,
    });

    expect(etapes).toHaveLength(1);
    expect(etapes[0]!.cle).toBe("confirmee");
    expect(etapes[0]!.faite).toBe(true);
  });

  it("n'affiche aucune remise sur une expedition sans suivi, critere 3", () => {
    const etapes = derriverEtapes({
      statut: "EXPEDIEE",
      creeA: CREEE_A,
      expedition: {
        expedieA: EXPEDIEE_A,
        statutTransporteur: null,
        livreA: null,
      },
    });

    /*
     * LE COEUR DU CRITERE 3. Une etape « remise au destinataire » rendue en
     * attente sur un colis dont le transporteur se tait est le suivi FIGE que
     * cette story existe pour eviter : le client la lit comme un blocage.
     */
    expect(etapes.map((etape) => etape.cle)).toEqual(["confirmee", "expediee"]);
  });

  it("garde l'etape d'expedition quand sa date manque", () => {
    const etapes = derriverEtapes({
      statut: "EXPEDIEE",
      creeA: CREEE_A,
      expedition: {
        expedieA: null,
        statutTransporteur: null,
        livreA: null,
      },
    });

    /*
     * L'ETAPE EST VRAIE, SA DATE NE L'EST PAS. Une expedition saisie sans date
     * existe : la taire effacerait un fait, et afficher une date inventee en
     * poserait un faux.
     */
    expect(etapes).toHaveLength(2);
    expect(etapes[1]!.cle).toBe("expediee");
    expect(etapes[1]!.date).toBeNull();
  });
});

describe("chemin nominal", () => {
  it("rend le statut du transporteur en cours tant que la remise n'est pas constatee", () => {
    const etapes = derriverEtapes({
      statut: "EXPEDIEE",
      creeA: CREEE_A,
      expedition: {
        expedieA: EXPEDIEE_A,
        statutTransporteur: "En attente de retrait au point de service",
        livreA: null,
      },
    });

    expect(etapes.map((etape) => etape.cle)).toEqual([
      "confirmee",
      "expediee",
      "transport",
    ]);

    /*
     * SEUL EMPLOI DE `faite: false` DE CETTE FRISE, et il est juste : le colis
     * est chez le transporteur, l'etape est en cours et non franchie.
     *
     * LE LIBELLE VIENT DU TRANSPORTEUR, jamais d'une table du site : ADR-042
     * refuse de deduire une remise d'un libelle, donc « en attente de retrait »
     * ne produit AUCUNE etape de remise.
     */
    expect(etapes[2]!.faite).toBe(false);
    expect(etapes[2]!.libelle).toBe(
      "En attente de retrait au point de service",
    );
  });

  it("rend les quatre etapes une fois la remise constatee", () => {
    const etapes = derriverEtapes({
      statut: "LIVREE",
      creeA: CREEE_A,
      expedition: {
        expedieA: EXPEDIEE_A,
        statutTransporteur: "Livré",
        livreA: LIVREE_A,
      },
    });

    expect(etapes.map((etape) => etape.cle)).toEqual([
      "confirmee",
      "expediee",
      "transport",
      "livree",
    ]);

    expect(etapes.every((etape) => etape.faite)).toBe(true);
    expect(etapes[3]!.date).toEqual(LIVREE_A);
  });

  it("date la remise depuis livreA et jamais depuis le statut", () => {
    const etapes = derriverEtapes({
      statut: "LIVREE",
      creeA: CREEE_A,
      expedition: {
        expedieA: EXPEDIEE_A,
        statutTransporteur: "Livré",
        livreA: LIVREE_A,
      },
    });

    const remise = etapes.find((etape) => etape.cle === "livree");

    /*
     * `livreA` EST LA DATE QUI OUVRE LE DELAI DE RETRACTATION, article L221-18.
     * L'afficher depuis une autre source ferait diverger la frise de ce que
     * l'ecran de retractation calcule.
     */
    expect(remise?.date).toEqual(LIVREE_A);
  });
});
