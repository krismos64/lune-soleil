/**
 * Panier rendu apres l'annulation d'une commande en attente, LS-315, ADR-050.
 *
 * AUCUNE BASE DE DONNEES : `fusionnerPanier` est pure, la suite unitaire tourne
 * sans Docker.
 */
import { describe, expect, it } from "vitest";

import {
  LIGNES_MAXIMUM,
  QUANTITE_MAXIMALE_PAR_LIGNE,
  fusionnerPanier,
} from "@/lib/panier-cookie";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

describe("fusionnerPanier", () => {
  it("rend les pieces dans un panier vide", () => {
    expect(fusionnerPanier([], [{ varianteId: A, quantite: 1 }])).toEqual([
      { varianteId: A, quantite: 1 },
    ]);
  });

  it("garde les pieces ajoutees depuis le passage au paiement", () => {
    expect(
      fusionnerPanier(
        [{ varianteId: B, quantite: 2 }],
        [{ varianteId: A, quantite: 1 }],
      ),
    ).toEqual([
      { varianteId: B, quantite: 2 },
      { varianteId: A, quantite: 1 },
    ]);
  });

  it("ne double pas une piece deja presente", () => {
    /*
     * LE CLIENT A REMIS LA MEME PIECE DANS SON PANIER entre-temps : c'est la
     * meme intention d'achat. Additionner lui ferait commander deux fois une
     * piece qu'il ne veut qu'une fois.
     */
    expect(
      fusionnerPanier(
        [{ varianteId: A, quantite: 1 }],
        [{ varianteId: A, quantite: 1 }],
      ),
    ).toEqual([{ varianteId: A, quantite: 1 }]);
  });

  it("tient les deux bornes du cookie", () => {
    const plein = Array.from({ length: LIGNES_MAXIMUM }, (_, rang) => ({
      varianteId: `00000000-0000-4000-8000-${String(rang).padStart(12, "0")}`,
      quantite: 1,
    }));

    // Au-dela, `decoderPanier` rejetterait le cookie entier.
    expect(fusionnerPanier(plein, [{ varianteId: A, quantite: 1 }])).toHaveLength(
      LIGNES_MAXIMUM,
    );
    expect(
      fusionnerPanier([], [{ varianteId: A, quantite: QUANTITE_MAXIMALE_PAR_LIGNE + 5 }]),
    ).toEqual([{ varianteId: A, quantite: QUANTITE_MAXIMALE_PAR_LIGNE }]);
  });
});
