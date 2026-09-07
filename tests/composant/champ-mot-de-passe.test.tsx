/**
 * La bascule de lisibilite du mot de passe, LS-179.
 *
 * ------------------------------------------------------------------
 * POURQUOI CES CRITERES SONT ICI ET NON EN BOUT EN BOUT.
 *
 * Cinq des sept criteres portent sur le COMPORTEMENT du composant : le nom
 * accessible qui dit l'etat, la valeur et le curseur qui survivent, l'etat par
 * defaut masque, `autocomplete` preserve. Aucun ne depend d'une largeur de
 * viewport ni d'une session.
 *
 * LES MESURER EN PLAYWRIGHT COUTERAIT TROIS FOIS LEUR PRIX, la suite tournant
 * sur trois largeurs, et deux des cinq ecrans demandent une session etablie.
 * Le critere 3, les 44 px et le non-debordement a 320 px, reste en bout en bout
 * ou il a du sens : une `min-height` annulee par un parent ne se voit que sur
 * un rendu reel.
 *
 * CE FICHIER REND LE COMPOSANT REEL, jamais une reproduction de sa mecanique.
 * ------------------------------------------------------------------
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test } from "vitest";

import { ChampMotDePasse } from "@/components/champ-mot-de-passe";

/**
 * Enveloppe controlee, la forme des quatre ecrans du parcours.
 *
 * ELLE TIENT L'ETAT COMME LES ECRANS REELS le font : rendre le composant avec
 * une `value` figee mesurerait un cas qui n'existe nulle part, ou la frappe ne
 * remonte pas.
 */
function ChampControle({ valeurInitiale = "" }: { valeurInitiale?: string }) {
  const [valeur, setValeur] = useState(valeurInitiale);
  return (
    <ChampMotDePasse
      id="mot-de-passe"
      name="mot-de-passe"
      autoComplete="current-password"
      value={valeur}
      onChange={setValeur}
    />
  );
}

const champ = () => screen.getByLabelText<HTMLInputElement>("Mot de passe");
const bouton = () => screen.getByRole("button");

/** Le label vit chez l'appelant, ce rendu le pose comme les ecrans reels. */
function rendre(enfant: React.ReactNode) {
  return render(
    <>
      <label htmlFor="mot-de-passe">Mot de passe</label>
      {enfant}
    </>,
  );
}

describe("etat par defaut", () => {
  test("le mot de passe est masque tant que rien n'est demande", () => {
    rendre(<ChampControle />);

    expect(champ()).toHaveAttribute("type", "password");
  });

  /*
   * CRITERE 5, LE VERSANT QUI SE PERIME EN SILENCE. L'etat ne se memorise pas
   * d'un ecran a l'autre : un composant remonte repart masque. Une future
   * version qui stockerait le choix dans `localStorage` ferait rougir ce test,
   * et c'est exactement ce qu'on veut interdire.
   */
  test("un composant remonte repart masque, meme apres une bascule", () => {
    const { unmount } = rendre(<ChampControle />);
    fireEvent.click(bouton());
    expect(champ()).toHaveAttribute("type", "text");

    unmount();
    rendre(<ChampControle />);

    expect(champ()).toHaveAttribute("type", "password");
  });
});

describe("le nom accessible dit l'etat, critere 2", () => {
  test("il annonce l'action a faire, dans les deux sens", () => {
    rendre(<ChampControle />);

    expect(
      screen.getByRole("button", { name: "Afficher le mot de passe" }),
    ).toBeVisible();

    fireEvent.click(bouton());

    expect(
      screen.getByRole("button", { name: "Masquer le mot de passe" }),
    ).toBeVisible();
  });

  /*
   * LE BOUTON EST UN VRAI BOUTON, pas une icone cliquable. `getByRole` echoue
   * sur un `<span onClick>`, ce qui est le defaut que le ticket nomme.
   */
  test("il est atteignable au clavier", () => {
    rendre(<ChampControle />);

    bouton().focus();

    expect(bouton()).toHaveFocus();
    /*
     * `type="button"` ET NON `submit` : sans lui, afficher son mot de passe
     * SOUMETTRAIT le formulaire, un bouton sans type valant `submit` en HTML.
     */
    expect(bouton()).toHaveAttribute("type", "button");
  });

  test("le changement est annonce dans une region live", () => {
    rendre(<ChampControle />);

    expect(screen.getByRole("status")).toHaveTextContent("Mot de passe masqué");

    fireEvent.click(bouton());

    expect(screen.getByRole("status")).toHaveTextContent(
      "Mot de passe visible",
    );
  });
});

describe("la saisie survit a la bascule, critere 4", () => {
  test("la valeur est conservee dans les deux sens", () => {
    rendre(<ChampControle />);

    fireEvent.change(champ(), { target: { value: "phrase de passe seize" } });

    fireEvent.click(bouton());
    expect(champ()).toHaveValue("phrase de passe seize");
    expect(champ()).toHaveAttribute("type", "text");

    fireEvent.click(bouton());
    expect(champ()).toHaveValue("phrase de passe seize");
    expect(champ()).toHaveAttribute("type", "password");
  });

  /*
   * L'ELEMENT N'EST PAS REMONTE, et c'est la cause du defaut que le critere 4
   * vise : remplacer l'input par un autre selon le type ferait perdre valeur,
   * focus et curseur. Comparer l'identite du nœud le prouve directement, la
   * valeur pouvant survivre par ailleurs a un remontage bien fait.
   */
  test("c'est le meme element, jamais deux inputs echanges", () => {
    const { container } = rendre(<ChampControle />);
    const avant = champ();

    fireEvent.click(bouton());

    expect(champ()).toBe(avant);
    /*
     * LE COMPTE EN PLUS DE L'IDENTITE. `getByLabelText` cible par le `htmlFor`
     * du label : un SECOND input rendu a cote, sans `id`, lui reste invisible,
     * et l'assertion d'identite ci-dessus passe au vert sur un composant qui en
     * rend deux. Mesure par mutation, LS-179.
     *
     * Deux champs de mot de passe cote a cote enverraient deux valeurs sous le
     * meme `name` dans le `FormData` du profil.
     */
    expect(container.querySelectorAll("input")).toHaveLength(1);
  });

  test("la position du curseur est reposee au milieu de la saisie", async () => {
    rendre(<ChampControle />);
    const saisie = champ();

    fireEvent.change(saisie, { target: { value: "phrase de passe" } });
    saisie.setSelectionRange(6, 6);

    fireEvent.click(bouton());

    /*
     * LA REPOSE PASSE PAR `requestAnimationFrame`, il faut donc laisser passer
     * une frame. jsdom l'implemente sur un `setTimeout` de 16 ms.
     */
    await new Promise((resoudre) => {
      requestAnimationFrame(() => resoudre(null));
    });

    expect(saisie.selectionStart).toBe(6);
    expect(saisie.selectionEnd).toBe(6);
    expect(saisie).toHaveFocus();
  });
});

describe("ce que le composant ne casse pas", () => {
  /*
   * CRITERE 6. `autocomplete` est ce qui fait fonctionner un gestionnaire de
   * mots de passe : le perdre en passant en `type="text"` reintroduirait la
   * saisie manuelle de seize caracteres que la story cherche a eviter.
   */
  test("autocomplete survit a la bascule", () => {
    rendre(<ChampControle />);

    expect(champ()).toHaveAttribute("autocomplete", "current-password");

    fireEvent.click(bouton());

    expect(champ()).toHaveAttribute("autocomplete", "current-password");
  });

  /*
   * L'AIDE DE L'APPELANT N'EST PAS ECRASEE, motif de LS-161 : le composant
   * ajoute son annonce d'etat a `aria-describedby` au lieu de le remplacer.
   * « Seize caracteres minimum » doit rester lu au moment de la saisie.
   */
  test("l'aide de l'appelant survit a l'annonce d'etat", () => {
    render(
      <>
        <label htmlFor="mot-de-passe">Mot de passe</label>
        <ChampMotDePasse
          id="mot-de-passe"
          name="mot-de-passe"
          autoComplete="new-password"
          value=""
          onChange={() => {}}
          aria-describedby="aide"
        />
        <p id="aide">16 caractères minimum.</p>
      </>,
    );

    expect(champ().getAttribute("aria-describedby")).toContain("aide");
    expect(champ()).toHaveAccessibleDescription(/16 caractères minimum/);
  });

  /*
   * AUCUNE VALEUR DE MOT DE PASSE N'EST EXPOSEE, critere 7 et invariant 9.
   * L'annonce dit l'etat du champ, jamais son contenu : une region live qui
   * porterait la valeur la ferait LIRE A VOIX HAUTE par le lecteur d'ecran.
   */
  test("aucun texte rendu ne porte la valeur saisie", () => {
    const { container } = rendre(<ChampControle />);

    fireEvent.change(champ(), { target: { value: "secret-a-ne-pas-dire" } });
    fireEvent.click(bouton());

    /*
     * TOUT LE TEXTE RENDU, et non la seule region live. Viser `role="status"`
     * laisserait passer une fuite par le `aria-label` du bouton, par un titre,
     * ou par un futur texte d'aide : la valeur ne doit apparaitre NULLE PART
     * ailleurs que dans le champ lui-meme.
     */
    expect(container.textContent).not.toContain("secret-a-ne-pas-dire");

    /*
     * LES ATTRIBUTS AUSSI, que `textContent` ne voit pas. C'est par la qu'une
     * fuite passerait le plus discretement, un `aria-label` engendre a partir
     * de la valeur.
     */
    for (const element of container.querySelectorAll("*")) {
      for (const attribut of element.attributes) {
        if (attribut.name === "value") {
          continue;
        }
        expect(attribut.value).not.toContain("secret-a-ne-pas-dire");
      }
    }

    // Le champ, lui, porte bien la valeur : sans quoi le test ci-dessus
    // passerait au vert sur un composant qui n'affiche rien du tout.
    expect(champ()).toHaveValue("secret-a-ne-pas-dire");
  });

  /*
   * LE MODE NON CONTROLE EST CELUI DU PROFIL, qui lit son `FormData` a la
   * soumission. Le tester ici plutot que de le supposer : c'est la forme que la
   * description du ticket avait oubliee.
   */
  test("en mode non controle, la frappe et la bascule fonctionnent", () => {
    render(
      <>
        <label htmlFor="mot-de-passe">Mot de passe</label>
        <ChampMotDePasse
          id="mot-de-passe"
          name="mot-de-passe"
          autoComplete="current-password"
        />
      </>,
    );

    fireEvent.change(champ(), { target: { value: "saisie libre" } });
    fireEvent.click(bouton());

    expect(champ()).toHaveValue("saisie libre");
    expect(champ()).toHaveAttribute("type", "text");
  });

  test("l'etat desactive desactive aussi le bouton", () => {
    render(
      <>
        <label htmlFor="mot-de-passe">Mot de passe</label>
        <ChampMotDePasse
          id="mot-de-passe"
          name="mot-de-passe"
          autoComplete="current-password"
          value=""
          onChange={() => {}}
          disabled
        />
      </>,
    );

    /*
     * UN BOUTON ACTIF SUR UN CHAMP DESACTIVE laisserait afficher le mot de
     * passe pendant la soumission, moment ou la personne n'a plus la main.
     */
    expect(bouton()).toBeDisabled();
  });
});
