/**
 * Le formulaire de modification d'un avis, LS-225.
 *
 * ------------------------------------------------------------------
 * POURQUOI CES CAS SONT ICI ET NON EN BOUT EN BOUT.
 *
 * Ils portent sur le COMPORTEMENT du composant apres la reponse de l'action :
 * le bloc se referme sur un succes, il reste ouvert sur un refus, et le texte
 * du refus est REELLEMENT rendu. Aucun ne depend d'une largeur de viewport ni
 * d'une session, et les mesurer en Playwright demanderait un compte, un avis
 * publie et une livraison constatee.
 *
 * LE TEXTE EST LU, JAMAIS LA SEULE PRESENCE DU NOEUD, et c'est le point de ces
 * tests. La region live existe dans les deux cas, vide ou remplie : une
 * assertion sur son existence resterait verte sur le defaut que ce fichier
 * cherche. Motif « set apres await dans une transition », mesure sur LS-56, ou
 * une region restait bloquee sur son message d'attente sans qu'aucun
 * avertissement ne le signale.
 * ------------------------------------------------------------------
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

/*
 * L'ACTION EST REMPLACEE, ET SEULEMENT ELLE. Le composant rendu est le vrai :
 * reproduire sa mecanique mesurerait la reproduction et non le code servi,
 * motif « cible de mutation, le fichier servi » de ce depot.
 */
const modifierAvis = vi.hoisted(() => vi.fn());

vi.mock("@/app/(boutique)/compte/avis/actions", () => ({ modifierAvis }));

const { FormulaireModification } =
  await import("@/app/(boutique)/compte/avis/formulaire-modification");

function rendre() {
  return render(
    <FormulaireModification
      avisId="11111111-1111-4111-8111-111111111111"
      note={4}
      commentaire="Un bracelet très fin, reçu rapidement."
      produitNom="Bracelet en argent martelé"
    />,
  );
}

/**
 * Le bloc d'edition, designe par le bouton qui le commande.
 *
 * LE BOUTON EST CHERCHE PAR SON `aria-controls` ET NON PAR SON LIBELLE, qui
 * CHANGE a l'ouverture : « Modifier cet avis » devient « Annuler la
 * modification ». Un utilitaire ancre sur le libelle fermé ne trouverait plus
 * rien des que le bloc est ouvert, c'est-a-dire dans tous les cas qui comptent.
 */
function blocEdition(): HTMLElement {
  const bouton = document.querySelector("button[aria-controls]");
  const identifiant = bouton?.getAttribute("aria-controls");
  const bloc = document.getElementById(identifiant ?? "");

  if (bloc === null) {
    throw new Error("aria-controls ne designe aucun element du document");
  }

  return bloc;
}

describe("FormulaireModification", () => {
  test("le bloc est replie au depart, et le bouton le dit", () => {
    rendre();

    const bouton = screen.getByRole("button", { name: /Modifier cet avis/ });

    expect(bouton).toHaveAttribute("aria-expanded", "false");
    expect(blocEdition()).toHaveAttribute("hidden");
  });

  test("l'ouverture montre l'avertissement avant toute validation", async () => {
    rendre();

    fireEvent.click(screen.getByRole("button", { name: /Modifier cet avis/ }));

    /*
     * LE CRITERE 5 DE LS-225 EST ICI. L'ecran doit dire ce que la modification
     * declenche AVANT que le client valide : sans cette phrase, il verrait son
     * avis disparaitre de la fiche produit et conclurait a une suppression.
     */
    expect(blocEdition()).not.toHaveAttribute("hidden");
    expect(
      screen.getByText(/relu avant d'être publié à nouveau/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/n'apparaîtra pas sur la fiche/),
    ).toBeInTheDocument();
  });

  test("la note et le commentaire portent les valeurs existantes", async () => {
    rendre();

    fireEvent.click(screen.getByRole("button", { name: /Modifier cet avis/ }));

    /*
     * LE FORMULAIRE PART DE CE QUI EXISTE, jamais d'un formulaire vide. Une
     * modification qui obligerait a tout ressaisir ferait perdre le texte a
     * qui veut corriger un mot.
     */
    expect(
      screen.getByRole("radio", { name: /4 étoiles sur 5/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("textbox", { name: /Votre commentaire/ }),
    ).toHaveValue("Un bracelet très fin, reçu rapidement.");
  });

  test("un succes referme le bloc", async () => {
    modifierAvis.mockResolvedValue({ statut: "FAIT" });
    rendre();

    fireEvent.click(screen.getByRole("button", { name: /Modifier cet avis/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Enregistrer la modification/ }),
    );

    /*
     * LE `set` SUIT UN `await` DANS LA TRANSITION DE `useActionState`, et c'est
     * exactement la forme qui avait laisse une region bloquee sur LS-56. Ce
     * test rougit si la fermeture n'est pas rattachee a la transition.
     */
    await waitFor(() => {
      expect(blocEdition()).toHaveAttribute("hidden");
    });
  });

  test("un succes ANNONCE l'enregistrement, hors du bloc referme", async () => {
    modifierAvis.mockResolvedValue({ statut: "FAIT" });
    rendre();

    fireEvent.click(screen.getByRole("button", { name: /Modifier cet avis/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Enregistrer la modification/ }),
    );

    /*
     * CE TEST FERME LE DEFAUT QUE `ls-frontend-revue` A TROUVE le 12 septembre
     * 2026 : la premiere version refermait le bloc SANS RIEN DIRE. La carte se
     * re-rendait avec la nouvelle note, ce qui se lit comme un effet de bord, et
     * un lecteur d'ecran n'annoncait rien, la region live restant vide.
     *
     * LA REGION DOIT VIVRE HORS DU BLOC REPLIABLE, et l'assertion suivante le
     * prouve : une region posee DEDANS passerait `hidden` a l'instant meme ou
     * elle recoit le message, donc le seul etat qu'elle n'annoncerait jamais
     * serait la reussite.
     */
    const annonce = await screen.findByText(/Modification enregistrée/);

    expect(annonce).toBeVisible();
    expect(blocEdition()).toHaveAttribute("hidden");
    expect(blocEdition().contains(annonce)).toBe(false);
  });

  test("un refus laisse le bloc ouvert et AFFICHE le motif", async () => {
    modifierAvis.mockResolvedValue({ statut: "REFUSE_NON_MODIFIABLE" });
    rendre();

    fireEvent.click(screen.getByRole("button", { name: /Modifier cet avis/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Enregistrer la modification/ }),
    );

    /*
     * LES DEUX ASSERTIONS SONT NECESSAIRES, ET LA SECONDE EST CELLE QUI COMPTE.
     * La region live existe des le premier rendu : verifier sa presence
     * resterait vert sur un composant qui n'affiche jamais rien. Seul son TEXTE
     * separe les deux versions.
     */
    await waitFor(() => {
      expect(screen.getByText(/ne peut plus être modifié/)).toBeInTheDocument();
    });

    expect(blocEdition()).not.toHaveAttribute("hidden");
  });

  test("l'identifiant de l'avis part avec la soumission", async () => {
    modifierAvis.mockResolvedValue({ statut: "FAIT" });
    rendre();

    fireEvent.click(screen.getByRole("button", { name: /Modifier cet avis/ }));
    fireEvent.click(screen.getByRole("radio", { name: /2 étoiles sur 5/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Enregistrer la modification/ }),
    );

    await waitFor(() => {
      expect(modifierAvis).toHaveBeenCalled();
    });

    /*
     * LE SECOND ARGUMENT EST LE `FormData`, le premier etant l'etat precedent
     * de `useActionState`. L'identifiant y voyage par un champ cache : il ne
     * PROUVE rien, le service recoupant l'auteur, mais son absence rendrait
     * toute modification impossible.
     */
    const donnees = modifierAvis.mock.calls.at(-1)?.[1] as FormData;

    expect(donnees.get("avisId")).toBe("11111111-1111-4111-8111-111111111111");
    expect(donnees.get("note")).toBe("2");
  });
});
