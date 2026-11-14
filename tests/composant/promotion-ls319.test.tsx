/**
 * Affichage de la promotion, ADR-051, LS-319.
 *
 * POURQUOI DES TESTS DE COMPOSANT ET NON DE BOUT EN BOUT : la promotion est un
 * état GLOBAL de la base, partagée par les quatre largeurs. L'activer pour un
 * test changerait les prix et l'annonce sous les pieds des autres fichiers.
 * Le montant encaissé est prouvé en intégration, `promotion.sequential` ; ces
 * tests prouvent ce que l'écran en dit.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AnnoncePromotion } from "@/components/annonce-promotion";
import { BandeauBlackWeek } from "@/components/decor-black-week";
import { BandeauOperation } from "@/components/decor-saison";
import { AMBIANCES } from "@/lib/theme-saisonnier";
import { PrixPromotion } from "@/components/prix-promotion";

const ANNONCE = {
  libelle: "Black Week",
  taux: 30,
  periodeAnnoncee: "du lundi 23 au dimanche 29 novembre",
  toutLeCatalogue: true,
};

describe("bloc de prix", () => {
  test("sans prix de référence, le prix seul, comme avant la promotion", () => {
    const { container } = render(
      <PrixPromotion
        prixCentimes={4900}
        prixReferenceCentimes={null}
        taux={30}
      />,
    );
    expect(container.textContent).toBe("49,00 €");
    expect(container.querySelector("s")).toBeNull();
    expect(screen.queryByText(/30/)).toBeNull();
  });

  test("sous promotion, prix barré, prix réduit et badge, dits au lecteur d'écran", () => {
    const { container } = render(
      <PrixPromotion
        prixCentimes={3430}
        prixReferenceCentimes={4900}
        taux={30}
      />,
    );
    expect(container.querySelector("s")?.textContent).toBe("49,00 €");
    expect(container.textContent).toContain("Prix initial");
    expect(container.textContent).toContain("prix réduit");
    expect(container.textContent).toContain("34,30 €");
    expect(container.textContent).toContain("−30 %");
  });

  test("au panier, le prix barré sans badge", () => {
    const { container } = render(
      <PrixPromotion prixCentimes={3430} prixReferenceCentimes={4900} />,
    );
    expect(container.querySelector("s")).not.toBeNull();
    expect(container.textContent).not.toContain("%");
  });
});

describe("annonce de la promotion", () => {
  test("rien sans promotion active", () => {
    const { container } = render(<AnnoncePromotion promotion={null} />);
    expect(container.textContent).toBe("");
  });

  test("toute la boutique et la période annoncée", () => {
    render(<AnnoncePromotion promotion={ANNONCE} />);
    const region = screen.getByRole("region", { name: "Promotion en cours" });
    expect(region.textContent).toContain("Black Week : −30 %");
    expect(region.textContent).toContain("sur toute la boutique");
    expect(region.textContent).toContain("du lundi 23 au dimanche 29 novembre");
  });

  /*
   * SANS PÉRIODE RÉGLÉE, AUCUNE DATE, amendement d'ADR-051 : l'annonce ne
   * ment pas sur une période que l'exploitante n'a pas fixée.
   */
  test("sans période réglée, l'annonce ne donne aucune date", () => {
    render(
      <AnnoncePromotion promotion={{ ...ANNONCE, periodeAnnoncee: null }} />,
    );
    const region = screen.getByRole("region", { name: "Promotion en cours" });
    expect(region.textContent).toContain("sur toute la boutique.");
    expect(region.textContent).not.toContain("novembre");
  });

  /*
   * UNE PIÈCE EXCLUE SUFFIT À RENDRE « TOUTE LA BOUTIQUE » FAUX, arbitrage 1
   * d'ADR-051 : l'annonce le dit autrement.
   */
  test("une pièce exclue, l'annonce dit « les pièces signalées »", () => {
    render(
      <AnnoncePromotion promotion={{ ...ANNONCE, toutLeCatalogue: false }} />,
    );
    const region = screen.getByRole("region", { name: "Promotion en cours" });
    expect(region.textContent).toContain("sur les pièces signalées");
    expect(region.textContent).not.toContain("toute la boutique");
  });
});

/*
 * LE BANDEAU DE L'ACCUEIL, LS-322 : le taux, la portée et la période ne
 * viennent que de la promotion active ; sans elle, l'événement seul.
 */
describe("bandeau Black Week de l'accueil", () => {
  test("sans promotion, le nom de l'événement seul", () => {
    const { container } = render(<BandeauBlackWeek promotion={null} />);
    expect(container.textContent).toBe("Black Week");
    expect(screen.queryByRole("region")).toBeNull();
  });

  test("sous promotion, le taux, la portée calculée et la période", () => {
    const { container } = render(
      <BandeauBlackWeek promotion={{ ...ANNONCE, toutLeCatalogue: false }} />,
    );
    expect(
      screen.getByRole("region", { name: "Promotion en cours" }),
    ).toBeTruthy();
    // Espace insécable entre le taux et le signe, signe moins U+2212.
    expect(container.textContent).toContain("−30\u00a0%");
    expect(container.textContent).toContain("sur les pièces signalées");
    expect(container.textContent).toContain(
      "du lundi 23 au dimanche 29 novembre",
    );
  });
});

/*
 * LE BANDEAU D'OPÉRATION DES THÈMES D'AMBIANCE, LS-323 : même contrat que le
 * bandeau Black Week. Le thème n'écrit aucun taux, il reprend la promotion
 * active ; sans elle, le nom de l'événement seul.
 */
describe("bandeau d'opération d'un thème d'ambiance", () => {
  const ambiance = AMBIANCES.SOLDES_ETE;

  test("sans promotion, le nom de l'événement seul", () => {
    const { container } = render(
      <BandeauOperation ambiance={ambiance} promotion={null} />,
    );
    expect(container.textContent).toBe("Soldes d'été");
    expect(screen.queryByRole("region")).toBeNull();
  });

  test("sous promotion, le taux, la portée calculée et la période", () => {
    const { container } = render(
      <BandeauOperation
        ambiance={ambiance}
        promotion={{ ...ANNONCE, toutLeCatalogue: false }}
      />,
    );
    expect(
      screen.getByRole("region", { name: "Promotion en cours" }),
    ).toBeTruthy();
    expect(container.textContent).toContain("−30\u00a0%");
    expect(container.textContent).toContain("sur les pièces signalées");
    expect(container.textContent).toContain(
      "du lundi 23 au dimanche 29 novembre",
    );
  });
});
