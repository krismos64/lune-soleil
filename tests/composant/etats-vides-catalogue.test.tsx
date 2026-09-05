/**
 * Les deux etats vides que la suite de bout en bout ne peut pas atteindre,
 * LS-113, critere 1.
 *
 * ------------------------------------------------------------------
 * POURQUOI CES DEUX-LA NE SONT PAS TESTES EN BOUT EN BOUT, ET POURQUOI CE
 * N'EST PAS UN CONTOURNEMENT.
 *
 * Les deux dependent d'une liste GLOBALEMENT vide : « aucune categorie »
 * s'affiche quand la table entiere est vide, pas quand une categorie manque
 * quelque part. Or `poserProduitDeControle` en insere une, et la suite entiere
 * en depend pour rendre l'editeur de fiche.
 *
 * VIDER LA TABLE EN COURS DE SUITE NE MARCHE PAS. La base est partagee entre
 * les travailleurs Playwright : un test qui supprime les categories les fait
 * disparaitre pour ses voisins, qui mesurent alors un ecran vide en croyant
 * mesurer une liste. Le projet a deja rencontre cette forme avec `ordre` en
 * LS-160.
 *
 * CE QUE CE FICHIER MESURE EST LE RENDU REEL DU COMPOSANT, pas une
 * reproduction : il importe `GestionCategories` et `FormulaireProduit` tels que
 * les pages les montent, et leur passe la seule entree dont l'etat depend.
 *
 * L'ETAT VIDE EST CE QUE L'EXPLOITANTE VERRA EN PREMIER sur une boutique qui
 * demarre. C'est l'ecran le plus certain d'etre vu, et il etait le seul que
 * rien ne protegeait.
 * ------------------------------------------------------------------
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

/*
 * LES SERVER ACTIONS SONT REMPLACEES A L'IMPORT, ET SEULEMENT A L'IMPORT.
 *
 * Les deux composants les importent en tete de fichier. Sous Vitest, ce module
 * serait charge pour de vrai : il porte la directive `"use server"` et tire le
 * service, donc Prisma, donc une connexion a une base qui n'existe pas ici.
 *
 * AUCUNE DE CES FONCTIONS N'EST APPELEE PAR LES TESTS DE CE FICHIER, qui ne
 * font que rendre un etat vide : les remplacer ne masque aucun comportement
 * mesure. Un test qui cliquerait un bouton devrait, lui, verifier ce que
 * l'action recoit.
 */
vi.mock("@/app/administration/categories/actions", () => ({
  creerCategorieAction: vi.fn(),
  renommerCategorieAction: vi.fn(),
  reordonnerCategoriesAction: vi.fn(),
  supprimerCategorieAction: vi.fn(),
}));

vi.mock("@/app/administration/produits/nouveau/actions", () => ({
  creerProduitAction: vi.fn(),
}));

const { GestionCategories } =
  await import("@/app/administration/categories/gestion-categories");
const { FormulaireProduit } =
  await import("@/app/administration/produits/nouveau/formulaire-produit");

describe("etat vide de l'ecran Categories", () => {
  test("sans aucune categorie, l'ecran dit quoi faire et ou", () => {
    render(<GestionCategories categories={[]} />);

    /*
     * LE TEXTE EST ASSERTE, PAS SEULEMENT L'ABSENCE DE LISTE. Un ecran qui
     * n'afficherait RIEN passerait un test qui se contenterait de compter zero
     * element : c'est exactement le defaut que l'etat vide existe pour eviter,
     * une page blanche que l'exploitante prendrait pour une panne.
     */
    expect(
      screen.getByText(/Aucune catégorie pour le moment/),
    ).toBeInTheDocument();

    /*
     * L'ETAT VIDE DOIT DIRE QUOI FAIRE. « Créez la première ci-dessus » renvoie
     * au formulaire que le meme ecran porte : sans cette phrase, l'exploitante
     * voit un ecran vide sans savoir qu'un champ l'attend plus haut.
     */
    expect(screen.getByText(/Créez la première/)).toBeInTheDocument();
  });

  test("avec une categorie, l'etat vide disparait", () => {
    /*
     * LE CAS NEGATIF EST LA MOITIE DU TEST. Sans lui, un composant qui
     * afficherait le message EN PERMANENCE passerait le cas ci-dessus : le
     * message serait la, et l'assertion verte, sur un ecran faux.
     */
    render(
      <GestionCategories
        categories={[
          {
            id: "c1",
            nom: "Colliers",
            slug: "colliers",
            ordre: 1,
            nombreProduits: 0,
          },
        ]}
      />,
    );

    expect(screen.queryByText(/Aucune catégorie pour le moment/)).toBeNull();
  });
});

describe("etat vide de l'ecran Nouveau produit", () => {
  test("sans aucune categorie, l'ecran renvoie vers l'ecran qui en cree", () => {
    render(<FormulaireProduit categories={[]} />);

    expect(
      screen.getByText(/Aucune catégorie n'existe encore/),
    ).toBeInTheDocument();

    /*
     * LE LIEN EST VERIFIE, ET C'EST LE POINT DE CET ETAT VIDE. Il ne se
     * contente pas de constater l'absence, il mene a l'ecran qui la comble :
     * sans lui, l'exploitante reste bloquee sur un formulaire inutilisable.
     */
    const lien = screen.getByRole("link", { name: /gérer les catégories/ });
    expect(lien).toHaveAttribute("href", "/administration/categories");
  });

  test("avec une categorie, le formulaire est rendu a la place", () => {
    render(<FormulaireProduit categories={[{ id: "c1", nom: "Colliers" }]} />);

    expect(screen.queryByText(/Aucune catégorie n'existe encore/)).toBeNull();

    /*
     * LE FORMULAIRE EST BIEN LA, et pas seulement le message absent. Un
     * composant qui ne rendrait RIEN passerait l'assertion ci-dessus.
     */
    expect(
      screen.getByRole("textbox", { name: /nom du produit/i }),
    ).toBeInTheDocument();
  });
});
