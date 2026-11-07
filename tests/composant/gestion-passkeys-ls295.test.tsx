/**
 * Ecran des passkeys selon la preuve d'identite, LS-295.
 *
 * POURQUOI UN TEST DE COMPOSANT ET NON DE BOUT EN BOUT. La suite de bout en
 * bout partage UNE session d'administration entre ses largeurs, qui tournent en
 * parallele : retirer la preuve pour un test l'oterait aux autres en pleine
 * execution. L'etat sans preuve se rend donc ici, et la route elle-meme est
 * gardee en integration, `passkey-preuve-recente.sequential.test.ts`.
 *
 * Ce qui est verifie est ce que l'ecran PROPOSE. Il n'autorise rien, la route
 * refusant d'elle-meme : un bouton affiche par erreur menerait a un refus, pas a
 * une passkey enregistree.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const addPasskey = vi.fn();
const deletePasskey = vi.fn();
const refresh = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: { passkey: { addPasskey, deletePasskey } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const PASSKEY = {
  id: "pk-1",
  nom: "iPhone",
  creeA: new Date("2026-11-01T10:00:00Z"),
};

async function rendre(preuveRecente: boolean) {
  const { GestionPasskeys } =
    await import("@/app/administration/passkeys/gestion-passkeys");
  return render(
    <GestionPasskeys passkeys={[PASSKEY]} preuveRecente={preuveRecente} />,
  );
}

describe("ecran des passkeys sans preuve recente", () => {
  test("propose la confirmation d'identite avec retour sur l'ecran", async () => {
    await rendre(false);

    const lien = screen.getByRole("link", { name: "Confirmer mon identité" });
    expect(lien).toHaveAttribute(
      "href",
      "/administration/reauthentification?retour=passkeys",
    );
  });

  test("ne propose ni l'ajout ni le retrait, mais garde la liste", async () => {
    await rendre(false);

    expect(
      screen.queryByRole("button", { name: "Enregistrer cet appareil" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Retirer" })).toBeNull();
    expect(screen.getByText("iPhone")).toBeVisible();
  });
});

describe("ecran des passkeys avec preuve recente", () => {
  test("propose l'ajout et le retrait, sans lien de confirmation", async () => {
    await rendre(true);

    expect(
      screen.getByRole("button", { name: "Enregistrer cet appareil" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retirer" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Confirmer mon identité" }),
    ).toBeNull();
  });

  /**
   * LA PREUVE EXPIRE PENDANT QUE L'ECRAN EST OUVERT. Le refus de la garde porte
   * son code : l'ecran bascule vers la confirmation au lieu d'afficher
   * « l'enregistrement n'a pas abouti », qui ferait recommencer en vain.
   */
  test("bascule vers la confirmation quand la route refuse faute de preuve", async () => {
    addPasskey.mockResolvedValueOnce({
      error: { code: "REAUTHENTIFICATION_REQUISE", status: 403 },
    });
    await rendre(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer cet appareil" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Confirmer mon identité" }),
      ).toBeVisible(),
    );
    expect(screen.getByText(/a expiré/)).toBeVisible();
    expect(screen.queryByText(/n'a pas abouti/)).toBeNull();
  });

  test("garde le message d'echec pour toute autre erreur", async () => {
    addPasskey.mockResolvedValueOnce({
      error: { code: "AUTRE", status: 400 },
    });
    await rendre(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Enregistrer cet appareil" }),
    );

    await waitFor(() =>
      expect(screen.getByText(/n'a pas abouti/)).toBeVisible(),
    );
    expect(
      screen.queryByRole("link", { name: "Confirmer mon identité" }),
    ).toBeNull();
  });
});
