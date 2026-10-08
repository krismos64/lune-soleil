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

  /*
   * LS-251, UN SOUS-ENSEMBLE PAR ECRAN. Le texte reste celui du bandeau
   * entier : ces tests verifient qu'un ecran choisit ses elements sans en
   * reformuler aucun.
   */
  test("ne rend que les éléments demandés, dans l'ordre du bandeau entier", () => {
    render(
      <BandeauReassurance
        seuilFranchiseCentimes={3900}
        elements={["gratuite", "livraison"]}
        nom="Informations de livraison"
      />,
    );

    const bandeau = screen.getByRole("region", {
      name: "Informations de livraison",
    });
    const elements = within(bandeau).getAllByRole("listitem");
    expect(elements).toHaveLength(2);
    expect(elements[0]!.textContent).toMatch(/^Livraison Mondial Relay/);
    expect(elements[1]!.textContent).toMatch(/^Livraison offerte dès 39,00\s€/);
    expect(bandeau.textContent).not.toMatch(/Faits main|Stripe|14 jours/);
  });

  test("garde la réserve des frais de retour dans un sous-ensemble", () => {
    render(
      <BandeauReassurance
        seuilFranchiseCentimes={null}
        elements={["paiement", "retractation", "contact"]}
      />,
    );

    const bandeau = screen.getByRole("region", {
      name: "Engagements de la boutique",
    });
    expect(within(bandeau).getAllByRole("listitem")).toHaveLength(3);
    expect(bandeau.textContent).toMatch(
      /14 jours pour changer d.avis\s*Frais de retour à votre charge/,
    );
  });

  test("ne rend aucune région quand aucun élément ne reste à afficher", () => {
    const { container } = render(
      <BandeauReassurance
        seuilFranchiseCentimes={null}
        elements={["gratuite"]}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  /*
   * LS-260, refonte du 8 octobre 2026 : une icône par engagement, décorative,
   * et l'animation réservée aux pages vitrines. Le tunnel de commande emploie
   * ce composant SANS l'option : rien n'y bouge, `frontend-design.md`.
   */
  test("porte une icône décorative par engagement, que les lecteurs d'écran ignorent", () => {
    render(<BandeauReassurance seuilFranchiseCentimes={3900} />);

    const bandeau = screen.getByRole("region", {
      name: "Engagements de la boutique",
    });
    const medaillons = bandeau.querySelectorAll('[aria-hidden="true"] svg');
    expect(medaillons).toHaveLength(6);
    // Le nom des éléments reste le texte : aucune icône ne s'y ajoute.
    expect(within(bandeau).getAllByRole("listitem")[1]?.textContent).toBe(
      "Paiement sécuriséPar carte, via Stripe",
    );
  });

  test("ne s'inscrit à l'animation bornée qu'avec l'option anime", () => {
    const { rerender } = render(
      <BandeauReassurance seuilFranchiseCentimes={3900} />,
    );
    const region = () =>
      screen.getByRole("region", { name: "Engagements de la boutique" });

    expect(region().hasAttribute("data-borne")).toBe(false);

    rerender(<BandeauReassurance seuilFranchiseCentimes={3900} anime />);
    expect(region().getAttribute("data-borne")).toBe("");
  });
});
