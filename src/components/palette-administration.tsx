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
  libelle: string;
  precision: string;
  chemin: string;
  icone: NomIcone;
};

const TITRE_GROUPE = new Map<string, string>(
  GROUPES.map((groupe) => [groupe.cle, groupe.titre]),
);

/** Les actions d'abord, puis les rubriques dans l'ordre de la barre. */
const ENTREES: readonly Entree[] = [
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
    return cherche === ""
      ? ENTREES
      : ENTREES.filter((entree) =>
          normaliser(`${entree.libelle} ${entree.precision}`).includes(cherche),
        );
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
    const surTouche = (evenement: KeyboardEvent) => {
      if (
        (evenement.ctrlKey || evenement.metaKey) &&
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
          Ctrl K
        </kbd>
      </button>

      <dialog
        ref={dialogue}
        className={styles.dialogue}
        aria-label="Aller à une rubrique ou à une action"
        onClose={() => setOuverte(false)}
        onClick={(evenement) => {
          // Un clic sur le voile, hors du panneau, ferme la palette.
          if (evenement.target === dialogue.current) fermer();
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
                  resultats.length > 0
                    ? `${identifiant}-option-${optionActive}`
                    : undefined
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
                    aller(resultats[optionActive]);
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
                  id={`${identifiant}-option-${rang}`}
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

            <p className={styles.etat} role="status">
              {resultats.length === 0
                ? "Aucune rubrique ne correspond. Essayez un autre mot."
                : ""}
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
