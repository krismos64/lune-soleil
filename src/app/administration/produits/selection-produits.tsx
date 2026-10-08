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
 * PUBLIER SE FAIT SANS CONFIRMATION, ARCHIVER NON, LS-278. Le 4 octobre 2026,
 * « Tout sélectionner » puis « Archiver » a vidé la boutique d'un geste, et le
 * site est resté deux jours fermé aux moteurs de recherche. L'archivage nomme
 * donc les articles avant de partir ; s'il vide la boutique, le serveur exige
 * en plus que leur nombre soit tapé.
 *
 * LE RETRAIT EN A UNE, LS-279 : seul le développeur le défait. Il n'existe que
 * dans la vue des archivés, la seule où il peut réussir, et la confirmation
 * nomme chaque article avant que rien ne parte.
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
    case "NON_ARCHIVE":
      return "n'est plus archivé, republié entre-temps";
    case "DEJA_RETIRE":
      return "déjà retiré de votre espace";
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

/** Le participe du bilan, accordé sur « produit ». */
const PARTICIPE: Record<string, [string, string]> = {
  publier: ["publié", "publiés"],
  archiver: ["archivé", "archivés"],
  retirer: ["retiré de votre espace", "retirés de votre espace"],
};

export function SelectionProduits({
  vueArchives = false,
}: {
  /** Vrai sur l'onglet Archivés, le seul qui propose le retrait, LS-279. */
  vueArchives?: boolean;
}) {
  const routeur = useRouter();
  const [enCours, demarrer] = useTransition();
  const [coches, setCoches] = useState(0);
  const [total, setTotal] = useState(0);
  const zoneBilan = useRef<HTMLDivElement>(null);
  const zoneRecapitulatif = useRef<HTMLElement>(null);
  const champPrix = useRef<HTMLInputElement>(null);
  const boutonPrix = useRef<HTMLButtonElement>(null);
  const boutonRetrait = useRef<HTMLButtonElement>(null);
  const zoneRetrait = useRef<HTMLElement>(null);
  /*
   * LA CONFIRMATION DU RETRAIT, LS-279 : les noms et le formulaire tels que
   * cochés au clic. Confirmer envoie exactement ce qui a été nommé, même si
   * une case change entre-temps, comme le récapitulatif du prix.
   */
  const [retrait, setRetrait] = useState<{
    noms: string[];
    formulaire: FormData;
  } | null>(null);
  /* Après « Annuler », le focus revient au bouton de retrait. */
  const retourAuRetrait = useRef(false);
  /*
   * LA CONFIRMATION D'ARCHIVAGE, LS-278 : même instantané que le retrait. Les
   * noms et le formulaire tels que cochés au clic.
   */
  const [archivage, setArchivage] = useState<{
    noms: string[];
    formulaire: FormData;
  } | null>(null);
  const boutonArchivage = useRef<HTMLButtonElement>(null);
  const zoneArchivage = useRef<HTMLElement>(null);
  const retourAArchivage = useRef(false);
  /*
   * LA CONFIRMATION RENFORCÉE, LS-278 : demandée par le SERVEUR quand la
   * sélection contient toutes les pièces publiées. `nombre` vient de lui, et
   * `essaiFaux` dit que le nombre tapé ne correspondait pas.
   */
  const [renforcee, setRenforcee] = useState<{
    nombre: number;
    formulaire: FormData;
    essaiFaux: boolean;
  } | null>(null);
  const champNombre = useRef<HTMLInputElement>(null);
  const boutonRenforcee = useRef<HTMLButtonElement>(null);
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
    if (retrait) {
      zoneRetrait.current?.focus();
    } else if (retourAuRetrait.current) {
      retourAuRetrait.current = false;
      boutonRetrait.current?.focus();
    }
  }, [retrait]);

  useEffect(() => {
    if (archivage) {
      zoneArchivage.current?.focus();
    } else if (retourAArchivage.current) {
      retourAArchivage.current = false;
      boutonArchivage.current?.focus();
    }
  }, [archivage]);

  /* Le focus va au champ du nombre, une fois l'envoi terminé. */
  useEffect(() => {
    if (renforcee && !enCours) champNombre.current?.focus();
  }, [renforcee, enCours]);

  useEffect(() => {
    if (recapitulatif) {
      zoneRecapitulatif.current?.focus();
    } else if (retourAuChamp.current) {
      retourAuChamp.current = false;
      champPrix.current?.focus();
    }
  }, [recapitulatif]);

  /*
   * LE FOCUS VA AU CHAMP EN ERREUR UNE FOIS L'ENVOI TERMINÉ : pendant l'envoi le
   * champ est désactivé, et un élément désactivé refuse le focus, mesuré par
   * le test de LS-265.
   */
  useEffect(() => {
    if (erreurPrix && !enCours) champPrix.current?.focus();
  }, [erreurPrix, enCours]);

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

  /**
   * Publier, archiver ou retirer la sélection, puis dire le bilan.
   *
   * LE FORMULAIRE EST UN INSTANTANÉ : pour le retrait, celui de la
   * confirmation, et non les cases telles qu'elles sont au moment du clic.
   */
  function envoyer(formulaire: FormData, operation: string) {
    setAttente("Enregistrement en cours…");
    demarrer(async () => {
      const resultat = await appliquerSelectionProduits(formulaire);

      // Le bouton desactive a perdu le focus : il va au bilan.
      zoneBilan.current?.focus();

      // La confirmation renforcée ne survit qu'à un nouveau refus, LS-278.
      if (resultat.statut !== "CONFIRMATION_REQUISE") setRenforcee(null);

      switch (resultat.statut) {
        case "SUCCES": {
          const [un, plusieurs] = PARTICIPE[operation] ?? ["traité", "traités"];
          setBilan({
            texte:
              resultat.reussis === 0
                ? "Aucun produit n'a changé."
                : `${resultat.reussis} produit${resultat.reussis > 1 ? "s" : ""} ${resultat.reussis > 1 ? plusieurs : un}.`,
            refus: resultat.refus,
            erreur: false,
          });
          routeur.refresh();
          break;
        }
        case "CONFIRMATION_REQUISE":
          /*
           * RIEN N'EST ARCHIVÉ : le serveur demande le nombre tapé. Le même
           * formulaire repartira avec lui, sans le nombre faux d'un essai
           * précédent.
           */
          {
            // Une COPIE sans le nombre : le formulaire envoyé ne se modifie
            // pas après coup.
            const sansNombre = new FormData();
            for (const [cle, valeur] of formulaire)
              if (cle !== "confirmationNombre") sansNombre.append(cle, valeur);
            setRenforcee((avant) => ({
              nombre: resultat.nombre,
              formulaire: sansNombre,
              essaiFaux: avant !== null,
            }));
          }
          break;
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
  }

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
        setRetrait(null);
        setArchivage(null);
        setRenforcee(null);
        setErreurPrix(null);

        if (operation === "archiver") {
          // LS-278 : rien ne part avant la confirmation, qui nomme les articles.
          setArchivage({
            noms: cases()
              .filter((element) => element.checked)
              .map((element) => element.dataset.nom ?? element.value),
            formulaire,
          });
          return;
        }

        if (operation === "retirer") {
          // Rien ne part avant la confirmation, qui nomme chaque article.
          setRetrait({
            noms: cases()
              .filter((element) => element.checked)
              .map((element) => element.dataset.nom ?? element.value),
            formulaire,
          });
          return;
        }

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

        envoyer(formulaire, operation);
      }}
    >
      {/*
       * DEUX LIGNES ET NON UNE, LS-279 : les gestes de statut sur la première,
       * le prix sur la seconde. Sur une seule ligne, le libellé du prix, plus
       * large que son champ, poussait « Appliquer ce prix » à l'écart et plus
       * bas que ses voisins.
       */}
      <div className={styles.ligneSelection}>
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
            ref={boutonArchivage}
            type="submit"
            value="archiver"
            className={styles.boutonSelection}
            disabled={coches === 0 || enCours}
          >
            Archiver ({coches})
          </button>
          {vueArchives ? (
            <button
              ref={boutonRetrait}
              type="submit"
              value="retirer"
              className={`${styles.boutonSelection} ${styles.boutonRetrait}`}
              disabled={coches === 0 || enCours}
            >
              Retirer de mon espace ({coches})
            </button>
          ) : null}
        </div>
      </div>

      {/*
       * UN MÊME PRIX POUR LA SÉLECTION, LS-265. Le bouton ne modifie rien : il
       * ouvre un récapitulatif, variante par variante, qu'il faut confirmer.
       *
       * LE LIBELLÉ AU-DESSUS, LE CHAMP ET SON BOUTON CÔTE À CÔTE, LS-279 : le
       * libellé est relié par `htmlFor` et n'enveloppe plus le champ, sans quoi
       * le bouton ne pouvait pas s'aligner sur lui.
       */}
      <div className={styles.prixSelection}>
        <label htmlFor="prix-selection" className={styles.libellePrix}>
          Prix pour la sélection, en euros
        </label>
        <div className={styles.lignePrix}>
          {/*
           * ENTRÉE SOUMET PAR « APPLIQUER CE PRIX », revue de LS-265. Sans
           * cela, le navigateur soumet par le premier bouton du formulaire,
           * « Publier », et la touche Entrée publiait la sélection sur la
           * boutique sans aucun récapitulatif.
           */}
          <input
            ref={champPrix}
            id="prix-selection"
            name="prixEuros"
            className={styles.champPrix}
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
          <button
            ref={boutonPrix}
            type="submit"
            value="prix"
            className={styles.boutonSelection}
            disabled={coches === 0 || enCours}
          >
            Appliquer ce prix ({coches})
          </button>
        </div>
        {erreurPrix ? (
          <p id="erreur-prix-selection" className={styles.bilanErreur}>
            {erreurPrix}
          </p>
        ) : null}
      </div>

      {archivage ? (
        <section
          ref={zoneArchivage}
          tabIndex={-1}
          className={styles.confirmationRetrait}
          role="alertdialog"
          aria-labelledby="titre-confirmation-archivage"
          aria-describedby="texte-confirmation-archivage"
          onKeyDown={(evenement) => {
            if (evenement.key === "Escape") {
              retourAArchivage.current = true;
              setArchivage(null);
            }
          }}
        >
          <h2
            id="titre-confirmation-archivage"
            className={styles.titreRecapitulatif}
          >
            {archivage.noms.length > 1
              ? `Archiver ces ${archivage.noms.length} articles\u202F?`
              : "Archiver cet article\u202F?"}
          </h2>
          <ul className={styles.listeRecapitulatif}>
            {archivage.noms.map((nom, rang) => (
              <li key={rang}>{nom}</li>
            ))}
          </ul>
          <p id="texte-confirmation-archivage">
            {archivage.noms.length > 1
              ? "Ils ne sont plus en vente sur la boutique"
              : "Il n'est plus en vente sur la boutique"}
            . Rien n&apos;est effacé : chaque article se republie depuis sa
            fiche.
          </p>
          <div className={styles.actionsSelection}>
            <button
              type="button"
              className={styles.boutonSelection}
              disabled={enCours}
              onClick={() => {
                const { formulaire } = archivage;
                setArchivage(null);
                envoyer(formulaire, "archiver");
              }}
            >
              Confirmer l&apos;archivage
            </button>
            <button
              type="button"
              className={styles.boutonSelection}
              disabled={enCours}
              onClick={() => {
                retourAArchivage.current = true;
                setArchivage(null);
              }}
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      {renforcee ? (
        <section
          className={styles.confirmationRetrait}
          role="alertdialog"
          aria-labelledby="titre-confirmation-renforcee"
          aria-describedby="texte-confirmation-renforcee"
          onKeyDown={(evenement) => {
            if (evenement.key === "Escape") {
              setRenforcee(null);
              boutonArchivage.current?.focus();
            }
          }}
        >
          <h2
            id="titre-confirmation-renforcee"
            className={styles.titreRecapitulatif}
          >
            {`Archiver les ${renforcee.nombre} pièces en vente, toute la boutique\u202F?`}
          </h2>
          <p id="texte-confirmation-renforcee">
            La boutique n&apos;aura plus aucune pièce en vente, et les moteurs
            de recherche cesseront de l&apos;indexer jusqu&apos;à la prochaine
            publication.
          </p>
          <label htmlFor="confirmation-nombre" className={styles.libellePrix}>
            {`Pour confirmer, taper ${renforcee.nombre}`}
          </label>
          <div className={styles.lignePrix}>
            <input
              ref={champNombre}
              id="confirmation-nombre"
              className={styles.champPrix}
              inputMode="numeric"
              autoComplete="off"
              disabled={enCours}
              aria-invalid={renforcee.essaiFaux ? true : undefined}
              aria-describedby={
                renforcee.essaiFaux ? "erreur-confirmation-nombre" : undefined
              }
              onKeyDown={(evenement) => {
                if (evenement.key !== "Enter") return;
                // Entrée confirme ici, jamais « Publier », premier bouton du
                // formulaire englobant.
                evenement.preventDefault();
                boutonRenforcee.current?.click();
              }}
            />
            <button
              ref={boutonRenforcee}
              type="button"
              className={`${styles.boutonSelection} ${styles.boutonRetrait}`}
              disabled={enCours}
              onClick={() => {
                const formulaire = new FormData();
                for (const [cle, valeur] of renforcee.formulaire)
                  formulaire.append(cle, valeur);
                formulaire.set(
                  "confirmationNombre",
                  champNombre.current?.value ?? "",
                );
                envoyer(formulaire, "archiver");
              }}
            >
              Archiver toute la boutique
            </button>
          </div>
          {renforcee.essaiFaux ? (
            <p id="erreur-confirmation-nombre" className={styles.bilanErreur}>
              {`Le nombre tapé ne correspond pas : taper ${renforcee.nombre}. Rien n'a été archivé.`}
            </p>
          ) : null}
          <div className={styles.actionsSelection}>
            <button
              type="button"
              className={styles.boutonSelection}
              disabled={enCours}
              onClick={() => {
                setRenforcee(null);
                boutonArchivage.current?.focus();
              }}
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      {retrait ? (
        <section
          ref={zoneRetrait}
          tabIndex={-1}
          className={styles.confirmationRetrait}
          role="alertdialog"
          aria-labelledby="titre-confirmation-retrait"
          aria-describedby="texte-confirmation-retrait"
          onKeyDown={(evenement) => {
            if (evenement.key === "Escape") {
              retourAuRetrait.current = true;
              setRetrait(null);
            }
          }}
        >
          <h2
            id="titre-confirmation-retrait"
            className={styles.titreRecapitulatif}
          >
            {retrait.noms.length > 1
              ? `Retirer ces ${retrait.noms.length} articles de votre espace\u202F?`
              : "Retirer cet article de votre espace\u202F?"}
          </h2>
          <ul className={styles.listeRecapitulatif}>
            {retrait.noms.map((nom, rang) => (
              <li key={rang}>{nom}</li>
            ))}
          </ul>
          {/*
           * LA PHRASE DE LS-266, au pluriel quand il le faut : rien n'est
           * effacé, et le retour ne se fait plus depuis cet écran.
           */}
          <p id="texte-confirmation-retrait">
            {retrait.noms.length > 1 ? "Ils disparaissent" : "Il disparaît"} de
            votre espace : listes, stocks et compteurs.{" "}
            {retrait.noms.length > 1
              ? "Ils ne sont pas effacés"
              : "Il n'est pas effacé"}{" "}
            : les commandes, factures et avis qui{" "}
            {retrait.noms.length > 1 ? "les citent" : "le citent"} ne changent
            pas, et les ventes passées restent dans vos statistiques. Seul le
            développeur pourra{" "}
            {retrait.noms.length > 1 ? "les récupérer" : "le récupérer"}.
          </p>
          <div className={styles.actionsSelection}>
            <button
              type="button"
              className={`${styles.boutonSelection} ${styles.boutonRetrait}`}
              disabled={enCours}
              onClick={() => {
                const { formulaire } = retrait;
                setRetrait(null);
                envoyer(formulaire, "retirer");
              }}
            >
              Confirmer le retrait
            </button>
            <button
              type="button"
              className={styles.boutonSelection}
              disabled={enCours}
              onClick={() => {
                retourAuRetrait.current = true;
                setRetrait(null);
              }}
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

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
