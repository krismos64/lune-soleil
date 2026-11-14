"use client";

/**
 * La palette « Aller à… » de l'administration, LS-325 : atteindre une
 * rubrique ou une action en tapant quelques lettres, au clavier comme au
 * doigt. Ouverte par son bouton du bandeau, ou par Ctrl+K et Cmd+K.
 *
 * UN `<dialog>` NATIF, ouvert par `showModal()` : le navigateur porte le
 * piège de focus, la fermeture par Échap et le retour du focus au bouton.
 * Aucune bibliothèque, `frontend-design.md`.
 *
 * LE MOTIF EST CELUI D'UNE LISTE DÉROULANTE À SAISIE, WAI-ARIA : le champ
 * garde le focus, les flèches déplacent l'option active annoncée par
 * `aria-activedescendant`, Entrée y va. Les options ne sont pas des liens :
 * elles ne doublent donc aucun lien de la barre latérale.
 *
 * ELLE NE DONNE AUCUN DROIT : chaque destination est un écran gardé par son
 * propre contrôle de rôle, et le layout ne rend ce composant que pour une
 * session administratrice.
 */
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ACTIONS_RAPIDES } from "./actions-administration";
import { IconeAdministration, type NomIcone } from "./icones-administration";
import { GROUPES, RUBRIQUES } from "./navigation-administration";
import styles from "./palette-administration.module.css";

type Entree = {
  /** Rang dans `ENTREES` : l'identifiant de l'option ne change pas au filtre. */
  rang: number;
  libelle: string;
  precision: string;
  chemin: string;
  icone: NomIcone;
};

const TITRE_GROUPE = new Map<string, string>(
  GROUPES.map((groupe) => [groupe.cle, groupe.titre]),
);

/** Les actions d'abord, puis les rubriques dans l'ordre de la barre. */
const SANS_RANG: readonly Omit<Entree, "rang">[] = [
  ...ACTIONS_RAPIDES,
  ...RUBRIQUES.map((rubrique) => ({
    libelle: rubrique.libelle,
    precision: TITRE_GROUPE.get(rubrique.groupe) ?? "",
    chemin: rubrique.chemin,
    icone: rubrique.icone,
  })),
  {
    libelle: "Voir la boutique",
    precision: "Le site tel que les visiteurs le voient",
    chemin: "/",
    icone: "boutique",
  },
];

const ENTREES: readonly Entree[] = SANS_RANG.map((entree, rang) => ({
  ...entree,
  rang,
}));

/**
 * Le rang d'une entrée pour une recherche : son nom qui COMMENCE par le mot,
 * puis son nom qui le contient, puis sa précision. Sans ce classement,
 * « stock » proposait d'abord « Créer un produit », dont la précision cite le
 * stock, et Entrée y menait, revue d'interface de LS-325.
 */
function pertinence(entree: Entree, cherche: string): number | null {
  const nom = normaliser(entree.libelle);
  if (nom.startsWith(cherche)) return 0;
  if (nom.includes(cherche)) return 1;
  return normaliser(entree.precision).includes(cherche) ? 2 : null;
}

/** Un Mac, un iPhone ou un iPad : le raccourci y est Cmd+K et non Ctrl+K. */
const estMac = (): boolean =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/** Minuscules sans accents : « reglages » trouve « Réglages ». */
const normaliser = (texte: string): string =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PaletteAdministration() {
  const routeur = useRouter();
  const dialogue = useRef<HTMLDialogElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const identifiant = useId();
  const [ouverte, setOuverte] = useState(false);
  const [requete, setRequete] = useState("");
  const [active, setActive] = useState(0);

  const resultats = useMemo(() => {
    const cherche = normaliser(requete.trim());
    if (cherche === "") return ENTREES;
    return ENTREES.flatMap((entree) => {
      const rang = pertinence(entree, cherche);
      return rang === null ? [] : [{ entree, rang }];
    })
      .sort((a, b) => a.rang - b.rang || a.entree.rang - b.entree.rang)
      .map(({ entree }) => entree);
  }, [requete]);

  const ouvrir = () => {
    setRequete("");
    setActive(0);
    setOuverte(true);
  };

  /*
   * LE DIALOGUE S'OUVRE APRÈS LE RENDU DE SON CONTENU, et le champ prend le
   * focus alors : demandé dans le même geste que `setOuverte`, le champ
   * n'existait pas encore et le focus restait sur le bouton, relevé par le
   * test de bout en bout.
   */
  useEffect(() => {
    if (!ouverte) return;
    if (dialogue.current && !dialogue.current.open) {
      dialogue.current.showModal();
    }
    champ.current?.focus();
  }, [ouverte]);

  const fermer = () => dialogue.current?.close();

  /*
   * LE RACCOURCI CLAVIER, Ctrl+K ou Cmd+K, écouté sur le document et retiré
   * au démontage. `preventDefault` : le navigateur porte sur cette touche le
   * focus de sa barre d'adresse.
   */
  useEffect(() => {
    /*
     * Cmd+K SUR MAC, Ctrl+K AILLEURS, et jamais les deux, revue d'interface
     * de LS-325 : sur macOS, Ctrl+K efface la fin de la ligne dans un champ
     * de texte, geste que l'exploitante garde. Ni Maj ni Alt : Ctrl+Maj+K
     * ouvre la console de Firefox. Rien pendant une composition de saisie.
     */
    const mac = estMac();
    const surTouche = (evenement: KeyboardEvent) => {
      const modificateur = mac
        ? evenement.metaKey && !evenement.ctrlKey
        : evenement.ctrlKey && !evenement.metaKey;
      if (
        modificateur &&
        !evenement.altKey &&
        !evenement.shiftKey &&
        !evenement.isComposing &&
        evenement.key.toLowerCase() === "k"
      ) {
        evenement.preventDefault();
        if (dialogue.current?.open) {
          dialogue.current.close();
        } else {
          setRequete("");
          setActive(0);
          setOuverte(true);
        }
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, []);

  const aller = (entree: Entree | undefined) => {
    if (entree === undefined) return;
    fermer();
    routeur.push(entree.chemin);
  };

  const optionActive = Math.min(active, Math.max(resultats.length - 1, 0));
  const entreeActive = resultats[optionActive];
  const idOption = (entree: Entree) => `${identifiant}-option-${entree.rang}`;

  /*
   * L'OPTION ACTIVE RESTE VISIBLE, revue d'interface de LS-325 : la liste
   * défile, et au clavier l'option active sortait de sa zone visible dès la
   * huitième. `nearest` ne déplace rien si elle est déjà à l'écran.
   */
  const rangActif = entreeActive?.rang;
  useEffect(() => {
    if (!ouverte || rangActif === undefined) return;
    document
      .getElementById(`${identifiant}-option-${rangActif}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [ouverte, rangActif, identifiant]);

  /* Le rappel du raccourci dit la touche du poste, lue après le montage. */
  const [touche, setTouche] = useState("Ctrl K");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (estMac()) setTouche("⌘ K");
  }, []);

  /* Le clic qui ferme doit avoir COMMENCÉ sur le voile, pas dans le champ. */
  const appuiSurVoile = useRef(false);

  return (
    <>
      <button
        type="button"
        className={styles.declencheur}
        onClick={ouvrir}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <IconeAdministration nom="recherche" className={styles.loupe} />
        <span>Aller à…</span>
        <kbd className={styles.touche} aria-hidden="true">
          {touche}
        </kbd>
      </button>

      <dialog
        ref={dialogue}
        className={styles.dialogue}
        aria-label="Aller à une rubrique ou à une action"
        onClose={() => setOuverte(false)}
        onPointerDown={(evenement) => {
          appuiSurVoile.current = evenement.target === dialogue.current;
        }}
        onClick={(evenement) => {
          // Un clic sur le voile, hors du panneau, ferme la palette. Un
          // glisser de sélection parti du champ et relâché sur le voile ne
          // la ferme pas.
          if (evenement.target === dialogue.current && appuiSurVoile.current) {
            fermer();
          }
        }}
      >
        {/* Le contenu n'existe qu'ouverte : rien à parcourir sinon. */}
        {ouverte ? (
          <div className={styles.panneau}>
            <div className={styles.saisie}>
              <IconeAdministration nom="recherche" className={styles.loupe} />
              <input
                ref={champ}
                className={styles.champ}
                type="text"
                role="combobox"
                aria-label="Chercher une rubrique ou une action"
                aria-expanded="true"
                aria-controls={`${identifiant}-liste`}
                aria-activedescendant={
                  entreeActive === undefined
                    ? undefined
                    : idOption(entreeActive)
                }
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                placeholder="Commandes, produits, promotion…"
                value={requete}
                onChange={(evenement) => {
                  setRequete(evenement.target.value);
                  setActive(0);
                }}
                onKeyDown={(evenement) => {
                  if (evenement.key === "ArrowDown") {
                    evenement.preventDefault();
                    setActive(
                      (optionActive + 1) % Math.max(resultats.length, 1),
                    );
                  } else if (evenement.key === "ArrowUp") {
                    evenement.preventDefault();
                    setActive(
                      (optionActive - 1 + resultats.length) %
                        Math.max(resultats.length, 1),
                    );
                  } else if (evenement.key === "Enter") {
                    evenement.preventDefault();
                    aller(entreeActive);
                  }
                }}
              />
              <button
                type="button"
                className={styles.fermeture}
                onClick={fermer}
                aria-label="Fermer"
              >
                <IconeAdministration nom="fermer" />
              </button>
            </div>

            <ul
              id={`${identifiant}-liste`}
              className={styles.liste}
              role="listbox"
              aria-label="Résultats"
            >
              {resultats.map((entree, rang) => (
                <li
                  key={entree.libelle}
                  id={idOption(entree)}
                  role="option"
                  aria-selected={rang === optionActive}
                  className={styles.option}
                  onClick={() => aller(entree)}
                  onPointerMove={() => setActive(rang)}
                >
                  <IconeAdministration
                    nom={entree.icone}
                    className={styles.optionIcone}
                  />
                  <span className={styles.optionTextes}>
                    <span className={styles.optionLibelle}>
                      {entree.libelle}
                    </span>
                    <span className={styles.optionPrecision}>
                      {entree.precision}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {/*
             * LE NOMBRE DE RÉSULTATS EST ANNONCÉ pendant la saisie : sans
             * lui, un lecteur d'écran n'apprenait rien tant qu'il restait
             * un résultat. Visible seulement quand il n'y en a aucun.
             */}
            <p
              className={
                resultats.length === 0 ? styles.etat : styles.etatDiscret
              }
              role="status"
              aria-label="Résultats de la recherche"
            >
              {resultats.length === 0
                ? "Aucune rubrique ne correspond. Essayez un autre mot."
                : requete.trim() === ""
                  ? ""
                  : `${resultats.length} ${resultats.length > 1 ? "résultats" : "résultat"}`}
            </p>
            <p className={styles.aide} aria-hidden="true">
              Flèches pour choisir, Entrée pour y aller, Échap pour fermer
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
