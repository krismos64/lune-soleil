"use client";

/**
 * Barre de selection du catalogue d'administration, LS-242.
 *
 * DEMANDE DE L'EXPLOITANTE EN RECETTE : publier ou archiver plusieurs produits
 * d'un geste. Meme mecanique que les messages, LS-243 : les cases vivent dans
 * les cartes et se rattachent a ce formulaire par l'attribut `form`.
 *
 * LE BILAN NOMME CHAQUE REFUS. Une publication groupee passe par les memes
 * gardes que le geste unitaire : un produit sans photo reste en brouillon, et
 * l'ecran dit lequel et pourquoi, plutot qu'un compte global qui mentirait.
 *
 * PAS DE CONFIRMATION : publier et archiver sont reversibles depuis la fiche
 * de chaque produit, et le nombre coche est dans le libelle des boutons.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import type { MotifNonPubliable, RefusGroupe } from "@/services/catalogue";
import { appliquerSelectionProduits } from "./actions-selection";
import styles from "./catalogue.module.css";

export const FORMULAIRE_SELECTION_PRODUITS = "selection-produits";

/** Libelles courts : le detail de chaque motif est sur la fiche du produit. */
const MOTIF_COURT: Record<MotifNonPubliable, string> = {
  AUCUNE_VARIANTE: "aucune déclinaison",
  AUCUN_MEDIA_PRINCIPAL: "aucune photo traitée",
  MEDIA_NON_TRAITE: "une photo n'a pas pu être traitée",
  TEXTE_ALTERNATIF_MANQUANT: "une photo sans description",
};

function raison(refus: RefusGroupe): string {
  switch (refus.raison) {
    case "NON_PUBLIABLE":
      return refus.motifs.map((motif) => MOTIF_COURT[motif]).join(", ");
    case "DEJA_DANS_CET_ETAT":
      return "déjà dans cet état";
    case "INTROUVABLE":
      return "n'existe plus";
  }
}

export function SelectionProduits() {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [coches, setCoches] = useState(0);
  const [total, setTotal] = useState(0);
  const zoneBilan = useRef<HTMLDivElement>(null);
  const [bilan, setBilan] = useState<{
    texte: string;
    refus: RefusGroupe[];
    erreur: boolean;
  } | null>(null);

  function cases(): HTMLInputElement[] {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        `input[type="checkbox"][form="${FORMULAIRE_SELECTION_PRODUITS}"]`,
      ),
    );
  }

  useEffect(() => {
    function recompter() {
      const toutes = cases();
      setTotal(toutes.length);
      setCoches(toutes.filter((element) => element.checked).length);
    }

    recompter();
    document.addEventListener("change", recompter);

    // Les cases retirees par un rafraichissement n'emettent aucun `change`.
    const observateur = new MutationObserver(recompter);
    observateur.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("change", recompter);
      observateur.disconnect();
    };
  }, []);

  return (
    <form
      id={FORMULAIRE_SELECTION_PRODUITS}
      className={styles.selection}
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const soumetteur = (evenement.nativeEvent as SubmitEvent).submitter;
        const operation =
          soumetteur instanceof HTMLButtonElement ? soumetteur.value : "";
        const formulaire = new FormData(evenement.currentTarget);
        formulaire.set("operation", operation);

        setBilan(null);
        demarrer(async () => {
          const resultat = await appliquerSelectionProduits(formulaire);

          // Le bouton desactive a perdu le focus : il va au bilan.
          zoneBilan.current?.focus();

          switch (resultat.statut) {
            case "SUCCES": {
              const participe = operation === "publier" ? "publié" : "archivé";
              setBilan({
                texte:
                  resultat.reussis === 0
                    ? "Aucun produit n'a changé."
                    : `${resultat.reussis} produit${resultat.reussis > 1 ? "s" : ""} ${participe}${resultat.reussis > 1 ? "s" : ""}.`,
                refus: resultat.refus,
                erreur: false,
              });
              routeur.refresh();
              break;
            }
            case "INVALIDE":
              setBilan({
                texte: "Cocher au moins un produit, cent au plus.",
                refus: [],
                erreur: true,
              });
              break;
            case "SESSION_ABSENTE":
              setBilan({
                texte: "Session expirée. Se reconnecter pour continuer.",
                refus: [],
                erreur: true,
              });
              break;
            case "INDISPONIBLE":
              setBilan({
                texte:
                  "Le service est momentanément indisponible. Une partie de la sélection a pu être traitée : vérifier la liste avant de réessayer.",
                refus: [],
                erreur: true,
              });
              // La liste doit refleter ce qui a ete traite avant la panne.
              routeur.refresh();
              break;
          }
        });
      }}
    >
      <label className={styles.toutCocher}>
        <input
          type="checkbox"
          checked={total > 0 && coches === total}
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

      <div className={styles.actionsSelection}>
        <button
          type="submit"
          value="publier"
          className={styles.boutonSelection}
          disabled={coches === 0 || enCours}
        >
          Publier ({coches})
        </button>
        <button
          type="submit"
          value="archiver"
          className={styles.boutonSelection}
          disabled={coches === 0 || enCours}
        >
          Archiver ({coches})
        </button>
      </div>

      <div
        ref={zoneBilan}
        tabIndex={-1}
        className={styles.bilanSelection}
        role="status"
        aria-label="Bilan de la sélection"
      >
        {enCours ? (
          <p>Enregistrement en cours…</p>
        ) : bilan ? (
          <>
            <p className={bilan.erreur ? styles.bilanErreur : undefined}>
              {bilan.texte}
            </p>
            {bilan.refus.length > 0 ? (
              <>
                <p>
                  {bilan.refus.length} refusé
                  {bilan.refus.length > 1 ? "s" : ""} :
                </p>
                <ul className={styles.listeRefus}>
                  {bilan.refus.map((refus) => (
                    <li key={refus.id}>
                      {refus.nom} : {raison(refus)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </form>
  );
}
