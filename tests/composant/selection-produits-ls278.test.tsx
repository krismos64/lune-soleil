/**
 * L'archivage groupé et sa confirmation renforcée, LS-278.
 *
 * POURQUOI ICI ET NON EN BOUT EN BOUT. Le refus qui exige de taper le nombre
 * ne se produit que si la sélection contient TOUTES les pièces publiées. La
 * base de bout en bout est partagée entre fichiers et largeurs : y archiver
 * toute la boutique casserait les autres tests. La règle serveur est prouvée en
 * intégration, `publication-produit.sequential.test.ts` ; ce fichier prouve
 * que l'écran la rend utilisable, l'action étant simulée et le composant réel.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const appliquerSelectionProduits = vi.hoisted(() => vi.fn());

vi.mock("@/app/administration/produits/actions-selection", () => ({
  appliquerSelectionProduits,
  appliquerPrixSelection: vi.fn(),
  previsualiserPrixSelection: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { SelectionProduits, FORMULAIRE_SELECTION_PRODUITS } =
  await import("@/app/administration/produits/selection-produits");

const PIECES = [
  { id: "11111111-1111-4111-8111-111111111111", nom: "Boucles Étoile" },
  { id: "22222222-2222-4222-8222-222222222222", nom: "Collier Lune" },
];

function rendre() {
  return render(
    <>
      {PIECES.map((piece) => (
        <input
          key={piece.id}
          type="checkbox"
          name="produitId"
          value={piece.id}
          form={FORMULAIRE_SELECTION_PRODUITS}
          data-nom={piece.nom}
          aria-label={`Sélectionner ${piece.nom}`}
          defaultChecked
        />
      ))}
      <SelectionProduits />
    </>,
  );
}

/** Ce que l'action a reçu à son appel numéro `rang`, à partir de zéro. */
function envoye(rang: number): FormData {
  return appliquerSelectionProduits.mock.calls[rang]?.[0] as FormData;
}

describe("archivage groupé, LS-278", () => {
  beforeEach(() => {
    appliquerSelectionProduits.mockReset();
  });

  test("rien ne part avant la confirmation, qui nomme chaque article", async () => {
    rendre();

    fireEvent.click(
      await screen.findByRole("button", { name: "Archiver (2)" }),
    );

    const confirmation = screen.getByRole("alertdialog", {
      name: "Archiver ces 2 articles ?",
    });
    expect(confirmation).toHaveTextContent("Boucles Étoile");
    expect(confirmation).toHaveTextContent("Collier Lune");
    expect(appliquerSelectionProduits).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(appliquerSelectionProduits).not.toHaveBeenCalled();
  });

  test("vider la boutique demande le nombre, refuse un nombre faux, et aboutit avec le bon", async () => {
    appliquerSelectionProduits
      .mockResolvedValueOnce({ statut: "CONFIRMATION_REQUISE", nombre: 2 })
      .mockResolvedValueOnce({ statut: "CONFIRMATION_REQUISE", nombre: 2 })
      .mockResolvedValueOnce({ statut: "SUCCES", reussis: 2, refus: [] });

    rendre();

    fireEvent.click(
      await screen.findByRole("button", { name: "Archiver (2)" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmer l'archivage" }),
    );

    // Le serveur a refusé sans le nombre : l'écran le demande.
    const renforcee = await screen.findByRole("alertdialog", {
      name: "Archiver les 2 pièces en vente, toute la boutique ?",
    });
    expect(envoye(0).get("operation")).toBe("archiver");
    expect(envoye(0).get("confirmationNombre")).toBeNull();
    expect(renforcee).toHaveTextContent("moteurs de recherche");

    const champ = screen.getByLabelText("Pour confirmer, taper 2");
    await waitFor(() => expect(champ).toHaveFocus());

    // Un nombre faux : renvoyé tel quel, refusé, et l'écran le dit.
    fireEvent.change(champ, { target: { value: "3" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Archiver toute la boutique" }),
    );
    await screen.findByText(
      "Le nombre tapé ne correspond pas : taper 2. Rien n'a été archivé.",
    );
    expect(envoye(1).get("confirmationNombre")).toBe("3");
    expect(envoye(1).getAll("produitId")).toEqual(PIECES.map((p) => p.id));

    // Le bon nombre : l'archivage aboutit et la confirmation se ferme.
    fireEvent.change(screen.getByLabelText("Pour confirmer, taper 2"), {
      target: { value: "2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Archiver toute la boutique" }),
    );

    await screen.findByText("2 produits archivés.");
    expect(envoye(2).get("confirmationNombre")).toBe("2");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
