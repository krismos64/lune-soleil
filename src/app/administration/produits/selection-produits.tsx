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
import { formaterMontant } from "@/lib/montant";
import type { VariantePourPrix } from "@/services/variante";
import {
  appliquerPrixSelection,
  appliquerSelectionProduits,
  previsualiserPrixSelection,
} from "./actions-selection";
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

/** Message d'échec du prix en masse, LS-265. */
function messagePrix(statut: string): string {
  switch (statut) {
    case "INVALIDE":
      return "Saisir un prix en euros supérieur à zéro, par exemple 24,90, et cocher entre un et cent produits.";
    case "SESSION_ABSENTE":
      return "Session expirée. Se reconnecter pour continuer.";
    case "PERIME":
      return "Une déclinaison a changé depuis le récapitulatif. Aucun prix n'a été modifié : relancer « Appliquer ce prix ».";
    default:
      return "Le service est momentanément indisponible. Aucun prix n'a été modifié, réessayer dans un instant.";
  }
}

export function SelectionProduits() {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [coches, setCoches] = useState(0);
  const [total, setTotal] = useState(0);
  const zoneBilan = useRef<HTMLDivElement>(null);
  const zoneRecapitulatif = useRef<HTMLElement>(null);
  const champPrix = useRef<HTMLInputElement>(null);
  const boutonPrix = useRef<HTMLButtonElement>(null);
  /*
   * CE QUE L'ATTENTE ANNONCE, revue de LS-265 : un récapitulatif ne modifie
   * rien, l'écran ne doit donc pas dire « Enregistrement » pendant qu'il se
   * prépare.
   */
  const [attente, setAttente] = useState("Enregistrement en cours…");
  /* Erreur de saisie du prix, reliée au champ et non au seul bilan. */
  const [erreurPrix, setErreurPrix] = useState<string | null>(null);
  /* Après « Annuler », le focus revient au champ prix, jamais à `body`. */
  const retourAuChamp = useRef(false);
  /*
   * LE RÉCAPITULATIF DU PRIX EN MASSE, LS-265 : la sélection et le prix tels
   * qu'ils ont été soumis, pour que la confirmation applique exactement ce
   * qui a été montré, même si une case change entre-temps.
   */
  const [recapitulatif, setRecapitulatif] = useState<{
    lignes: VariantePourPrix[];
    prixCentimes: number;
    formulaire: FormData;
  } | null>(null);
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

  /*
   * LE FOCUS SUIT LE RÉCAPITULATIF APRÈS SON MONTAGE, et non dans un
   * `requestAnimationFrame` posé après un `await`, qui pouvait passer avant la
   * section et perdre le focus sans bruit.
   */
  useEffect(() => {
    if (recapitulatif) {
      zoneRecapitulatif.current?.focus();
    } else if (retourAuChamp.current) {
      retourAuChamp.current = false;
      champPrix.current?.focus();
    }
  }, [recapitulatif]);

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
        setRecapitulatif(null);
        setErreurPrix(null);

        if (operation === "prix") {
          setAttente("Préparation du récapitulatif…");
          demarrer(async () => {
            const resultat = await previsualiserPrixSelection(formulaire);
            if (resultat.statut === "RECAPITULATIF") {
              setRecapitulatif({
                lignes: resultat.lignes,
                prixCentimes: resultat.prixCentimes,
                formulaire,
              });
              return;
            }
            if (resultat.statut === "INVALIDE") {
              // L'erreur est celle du champ : elle s'y rattache, et le focus
              // y retourne pour corriger.
              setErreurPrix(messagePrix(resultat.statut));
              champPrix.current?.focus();
              return;
            }
            zoneBilan.current?.focus();
            setBilan({
              texte: messagePrix(resultat.statut),
              refus: [],
              erreur: true,
            });
          });
          return;
        }

        setAttente("Enregistrement en cours…");
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

      {/*
       * UN MÊME PRIX POUR LA SÉLECTION, LS-265. Le bouton ne modifie rien : il
       * ouvre un récapitulatif, variante par variante, qu'il faut confirmer.
       */}
      <div className={styles.prixSelection}>
        <label className={styles.champPrix}>
          <span>Prix pour la sélection, en euros</span>
          {/*
           * ENTRÉE SOUMET PAR « APPLIQUER CE PRIX », revue de LS-265. Sans
           * cela, le navigateur soumet par le premier bouton du formulaire,
           * « Publier », et la touche Entrée publiait la sélection sur la
           * boutique sans aucun récapitulatif.
           */}
          <input
            ref={champPrix}
            name="prixEuros"
            inputMode="decimal"
            enterKeyHint="go"
            autoComplete="off"
            placeholder="24,90"
            disabled={enCours}
            aria-invalid={erreurPrix ? true : undefined}
            aria-describedby={erreurPrix ? "erreur-prix-selection" : undefined}
            onKeyDown={(evenement) => {
              if (evenement.key !== "Enter") return;
              evenement.preventDefault();
              if (boutonPrix.current && !boutonPrix.current.disabled) {
                evenement.currentTarget.form?.requestSubmit(boutonPrix.current);
              }
            }}
          />
        </label>
        <button
          ref={boutonPrix}
          type="submit"
          value="prix"
          className={styles.boutonSelection}
          disabled={coches === 0 || enCours}
        >
          Appliquer ce prix ({coches})
        </button>
        {erreurPrix ? (
          <p id="erreur-prix-selection" className={styles.bilanErreur}>
            {erreurPrix}
          </p>
        ) : null}
      </div>

      {recapitulatif ? (
        <section
          ref={zoneRecapitulatif}
          tabIndex={-1}
          className={styles.recapitulatifPrix}
          aria-labelledby="titre-recapitulatif-prix"
        >
          <h2
            id="titre-recapitulatif-prix"
            className={styles.titreRecapitulatif}
          >
            {recapitulatif.lignes.length === 0
              ? "Aucune déclinaison en vente dans la sélection."
              : `Passer ${recapitulatif.lignes.length} déclinaison${recapitulatif.lignes.length > 1 ? "s" : ""} à ${formaterMontant(recapitulatif.prixCentimes)}\u202F?`}
          </h2>
          {recapitulatif.lignes.length > 0 ? (
            <>
              <p>
                L&apos;ancien prix n&apos;est pas conservé : vérifier la liste
                avant de confirmer.
              </p>
              <ul className={styles.listeRecapitulatif}>
                {recapitulatif.lignes.map((ligne) => (
                  <li key={ligne.id}>
                    {ligne.produitNom}, {ligne.libelle}
                    {"\u202F: "}
                    {formaterMontant(ligne.prixCentimes)} devient{" "}
                    {formaterMontant(recapitulatif.prixCentimes)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className={styles.actionsSelection}>
            {recapitulatif.lignes.length > 0 ? (
              <button
                type="button"
                className={styles.boutonSelection}
                disabled={enCours}
                onClick={() => {
                  /*
                   * LES DÉCLINAISONS MONTRÉES PARTENT AVEC LA CONFIRMATION :
                   * le prix ne s'applique qu'à elles, revue critique de LS-265.
                   */
                  const montrees = recapitulatif.lignes.length;
                  const formulaire = new FormData();
                  for (const [cle, valeur] of recapitulatif.formulaire)
                    formulaire.append(cle, valeur);
                  for (const ligne of recapitulatif.lignes)
                    formulaire.append("varianteId", ligne.id);
                  setAttente("Enregistrement en cours…");
                  demarrer(async () => {
                    const resultat = await appliquerPrixSelection(formulaire);
                    setRecapitulatif(null);
                    zoneBilan.current?.focus();
                    if (resultat.statut === "APPLIQUE") {
                      const nombre = resultat.variantes;
                      setBilan({
                        texte:
                          nombre === 0
                            ? "Aucun prix n'a changé."
                            : `Prix de ${formaterMontant(resultat.prixCentimes)} appliqué à ${nombre} déclinaison${nombre > 1 ? "s" : ""}${nombre === montrees ? "." : `, sur ${montrees} montrées.`}`,
                        refus: [],
                        erreur: false,
                      });
                      routeur.refresh();
                      return;
                    }
                    setBilan({
                      texte: messagePrix(resultat.statut),
                      refus: [],
                      erreur: true,
                    });
                  });
                }}
              >
                Confirmer le prix
              </button>
            ) : null}
            <button
              type="button"
              className={styles.boutonSelection}
              disabled={enCours}
              onClick={() => {
                retourAuChamp.current = true;
                setRecapitulatif(null);
              }}
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      <div
        ref={zoneBilan}
        tabIndex={-1}
        className={styles.bilanSelection}
        role="status"
        aria-label="Bilan de la sélection"
      >
        {enCours ? (
          <p>{attente}</p>
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
