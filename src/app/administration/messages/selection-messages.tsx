"use client";

/**
 * Barre de selection des messages, LS-243.
 *
 * RELEVE PAR L'EXPLOITANTE EN RECETTE : traiter ses messages un par un etait
 * trop long. Elle coche, ou coche tout, puis archive d'un geste. Arbitrage de
 * Christophe du 23 septembre 2026 : ARCHIVER et non supprimer, rien ne
 * s'efface en base de production.
 *
 * LES CASES VIVENT DANS LES CARTES, CE FORMULAIRE EST ICI. Chaque carte porte
 * deja les boutons de classement, et un formulaire ne s'imbrique pas dans un
 * autre. Les cases se rattachent donc a ce formulaire par l'attribut `form`,
 * standard HTML : sans JavaScript, cocher puis envoyer fonctionne encore.
 *
 * PAS DE CONFIRMATION AVANT D'ARCHIVER, et c'est delibere : le geste est
 * reversible depuis le filtre « Archivés ». Le nombre de messages coches est
 * dans le libelle du bouton, ce qui dit avant le clic ce que le clic fera.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { archiverSelection } from "./actions";
import styles from "./messages.module.css";

/** Identifiant du formulaire, que les cases des cartes designent. */
export const FORMULAIRE_SELECTION = "selection-messages";

export function SelectionMessages({
  mode,
}: {
  /** `desarchiver` sur la vue des archives, `archiver` partout ailleurs. */
  mode: "archiver" | "desarchiver";
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [coches, setCoches] = useState(0);
  const [total, setTotal] = useState(0);
  const bilan = useRef<HTMLDivElement>(null);
  const [annonce, setAnnonce] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  function cases(): HTMLInputElement[] {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `input[type="checkbox"][form="${FORMULAIRE_SELECTION}"]`,
      ),
    );
  }

  /*
   * LE COMPTE SE RELIT SUR LE DOM A CHAQUE CHANGEMENT, les cases etant rendues
   * par le composant serveur. Un seul ecouteur delegue sur le document : il
   * suit aussi les cases qui apparaissent apres un rafraichissement.
   */
  useEffect(() => {
    function recompter() {
      const toutes = cases();
      setTotal(toutes.length);
      setCoches(toutes.filter((element) => element.checked).length);
    }

    recompter();
    document.addEventListener("change", recompter);

    /*
     * LES CASES RETIREES PAR UN RAFRAICHISSEMENT n'emettent aucun `change` :
     * sans cet observateur, le bouton annoncait encore « (2) » apres que les
     * deux messages archives avaient quitte la liste.
     */
    const observateur = new MutationObserver(recompter);
    observateur.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("change", recompter);
      observateur.disconnect();
    };
  }, []);

  const toutCoche = total > 0 && coches === total;
  const verbe = mode === "archiver" ? "Archiver" : "Désarchiver";

  return (
    <form
      id={FORMULAIRE_SELECTION}
      className={styles.selection}
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const formulaire = new FormData(evenement.currentTarget);
        formulaire.set("mode", mode);

        demarrer(async () => {
          const resultat = await archiverSelection(formulaire);

          /*
           * LE FOCUS VA AU BILAN, releve par `ls-frontend-revue` : le bouton
           * desactive pendant l'envoi a perdu le focus, qui retombait sur
           * `body`. Meme parade que `classement-message.tsx`.
           */
          bilan.current?.focus();

          switch (resultat.statut) {
            case "SUCCES":
              setAnnonce({
                texte:
                  resultat.nombre > 1
                    ? `${resultat.nombre} messages ${mode === "archiver" ? "archivés" : "désarchivés"}.`
                    : resultat.nombre === 1
                      ? `1 message ${mode === "archiver" ? "archivé" : "désarchivé"}.`
                      : "Aucun message n'a changé.",
                erreur: false,
              });
              routeur.refresh();
              break;
            case "INVALIDE":
              setAnnonce({
                texte: "Cocher au moins un message, cent au plus.",
                erreur: true,
              });
              break;
            case "SESSION_ABSENTE":
              setAnnonce({
                texte: "Session expirée. Se reconnecter pour continuer.",
                erreur: true,
              });
              break;
            case "INDISPONIBLE":
              setAnnonce({
                texte: "Le service est momentanément indisponible. Réessayer.",
                erreur: true,
              });
              break;
          }
        });
      }}
    >
      <label className={styles.toutCocher}>
        <input
          type="checkbox"
          checked={toutCoche}
          disabled={total === 0 || enCours}
          onChange={(evenement) => {
            for (const element of cases()) {
              element.checked = evenement.target.checked;
            }
            setCoches(evenement.target.checked ? total : 0);
          }}
        />
        Tout sélectionner
      </label>

      <button
        type="submit"
        className={styles.bouton}
        disabled={coches === 0 || enCours}
      >
        {verbe} la sélection ({coches})
      </button>

      <div ref={bilan} tabIndex={-1} className={styles.message}>
        <p
          className={
            annonce?.erreur === true ? styles.messageErreur : undefined
          }
          role="status"
          aria-label="Bilan de la sélection"
        >
          {enCours ? "Enregistrement en cours…" : (annonce?.texte ?? "")}
        </p>
      </div>
    </form>
  );
}
