/**
 * Bandeau de réassurance, LS-236.
 *
 * LE SEUIL VIENT DU PARAMÈTRE, JAMAIS DU COMPOSANT : un seuil de 55 € doit
 * s'afficher 55 €. Un montant figé dans le composant, 39 € par exemple, ferait
 * échouer ce test, ce qui est la preuve exigée par le critère 2.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BandeauReassurance } from "@/components/bandeau-reassurance";

describe("BandeauReassurance", () => {
  test("affiche les six éléments, la gratuité au seuil reçu", () => {
    render(<BandeauReassurance seuilFranchiseCentimes={5500} />);

    const bandeau = screen.getByRole("region", {
      name: "Engagements de la boutique",
    });
    expect(within(bandeau).getAllByRole("listitem")).toHaveLength(6);
    expect(bandeau.textContent).toMatch(/Livraison offerte dès 55,00\s€/);
  });

  test("n'annonce la gratuité qu'en Point Relais et Locker", () => {
    render(<BandeauReassurance seuilFranchiseCentimes={3900} />);

    const texte = screen.getByRole("region", {
      name: "Engagements de la boutique",
    }).textContent;
    expect(texte).toMatch(
      /En Point Relais et Locker, le domicile reste payant/,
    );
    expect(texte).not.toMatch(/tous (les )?modes|quel que soit le mode/i);
  });

  test("annonce les frais de retour avec la rétractation, article L221-20", () => {
    render(<BandeauReassurance seuilFranchiseCentimes={3900} />);

    expect(
      screen.getByRole("region", { name: "Engagements de la boutique" })
        .textContent,
    ).toMatch(/14 jours pour changer d.avis\s*Frais de retour à votre charge/);
  });

  test("se tait sur la gratuité quand il n'y a pas de seuil", () => {
    render(<BandeauReassurance seuilFranchiseCentimes={null} />);

    const bandeau = screen.getByRole("region", {
      name: "Engagements de la boutique",
    });
    expect(within(bandeau).getAllByRole("listitem")).toHaveLength(5);
    expect(bandeau.textContent).not.toMatch(/offerte/);
  });
});
