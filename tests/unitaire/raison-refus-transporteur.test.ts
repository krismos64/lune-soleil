/**
 * Traduction des refus du transporteur, LS-296.
 *
 * L'ECRAN NE MONTRE JAMAIS LE TEXTE ANGLAIS DE SENDCLOUD, ni une valeur de la
 * commande : une raison connue devient une phrase, une raison inconnue est
 * nommee par son code, qui appartient a une liste fermee.
 */
import { describe, expect, it } from "vitest";

import { raisonDuRefus } from "@/services/expedition";

describe("raisonDuRefus", () => {
  it("traduit l'absence de moyen de paiement, refus de la recette", () => {
    expect(raisonDuRefus(["no_valid_payment_method"])).toBe(
      "aucun moyen de paiement valide n'est enregistré sur le compte Sendcloud",
    );
  });

  it("prefere une raison connue parmi plusieurs codes", () => {
    expect(raisonDuRefus(["invalid", "no_valid_payment_method"])).toBe(
      "aucun moyen de paiement valide n'est enregistré sur le compte Sendcloud",
    );
  });

  it("nomme un code inconnu plutot que de le taire", () => {
    expect(raisonDuRefus(["invalid", "required"])).toBe(
      "Sendcloud a refusé la demande (code invalid, required)",
    );
  });

  it("dit l'absence de raison quand aucun code n'est rendu", () => {
    expect(raisonDuRefus([])).toBe(
      "Sendcloud a refusé la demande sans en donner la raison",
    );
  });

  // Une cle heritee du prototype ne doit pas passer pour une raison connue.
  it("ignore une cle du prototype", () => {
    expect(raisonDuRefus(["constructor"])).toBe(
      "Sendcloud a refusé la demande (code constructor)",
    );
  });
});
