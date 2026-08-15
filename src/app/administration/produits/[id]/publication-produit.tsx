"use client";

/**
 * Publication et archivage d'un produit, composant client. LS-103.
 *
 * DEUX PROPRIETES QUE CET ECRAN DOIT RENDRE VISIBLES :
 *
 * 1. CE QUI MANQUE SE VOIT AVANT DE CLIQUER, et non apres un refus. Le
 *    parcours 3 vise trois minutes au smartphone : decouvrir les conditions une
 *    a une, en publiant quatre fois, y contrevient directement. La liste est
 *    donc calculee au rendu ET relue par le service au moment d'ecrire, ce que
 *    l'ecran affiche n'autorisant rien, invariant 2.
 * 2. ARCHIVER NE DETRUIT NI COMMANDE NI STOCK, C11 et invariant 6. La
 *    confirmation le dit, parce que « retirer du catalogue » se lit facilement
 *    comme « effacer ».
 */

import { useEffect, useRef, useState, useTransition } from "react";

import {
  archiverProduitAction,
  publierProduitAction,
  type ResultatPublication,
} from "./actions-publication";
import styles from "./editeur.module.css";

/** Les trois valeurs de `StatutProduit`, telles que le service les rend. */
export type StatutProduitAffiche = "BROUILLON" | "ACTIF" | "ARCHIVE";

/** Motifs de refus, identiques a `MotifNonPubliable` du service. */
export type MotifAffiche =
  | "AUCUNE_VARIANTE"
  | "AUCUN_MEDIA_PRINCIPAL"
  | "MEDIA_NON_TRAITE"
  | "TEXTE_ALTERNATIF_MANQUANT";

/**
 * Ce que chaque motif dit a l'exploitante, ET CE QU'ELLE DOIT FAIRE.
 *
 * UN `Record` EXHAUSTIF, meme motif qu'en LS-100 et LS-102 : ajouter un motif
 * au service sans son libelle casse la compilation, au lieu d'afficher une
 * ligne vide dans la liste de ce qui manque.
 *
 * CHAQUE LIBELLE NOMME L'ACTION, jamais seulement le manque. « Aucune photo »
 * laisse deviner ; « Ajoutez au moins une photo » dit quoi faire, sur un ecran
 * ou les trois blocs concernes sont juste au-dessus.
 */
const MOTIF_AFFICHE: Record<MotifAffiche, string> = {
  AUCUNE_VARIANTE:
    "Ajoutez au moins une déclinaison : sans elle, la fiche n'a ni prix ni stock.",
  AUCUN_MEDIA_PRINCIPAL:
    "Ajoutez au moins une photo traitée : la première de la liste sera la photo principale.",
  MEDIA_NON_TRAITE:
    "Une photo n'a pas pu être traitée. Supprimez-la et téléversez-la à nouveau.",
  TEXTE_ALTERNATIF_MANQUANT:
    "Une photo n'a pas de description. Renseignez-la dans le bloc Photos.",
};

/**
 * Ce que l'ecran dit de chaque statut, et l'action qu'il propose.
 *
 * `Record` EXHAUSTIF SUR `StatutProduitAffiche` : ajouter une valeur a l'enum
 * casse la compilation. Le ticket nomme ce piege, deja rencontre deux fois sur
 * ce projet, sur un index partiel puis dans un ternaire du JSX.
 */
const ETAT_AFFICHE: Record<
  StatutProduitAffiche,
  { titre: string; explication: string }
> = {
  BROUILLON: {
    titre: "Brouillon",
    explication:
      "Cette fiche n'apparaît pas dans la boutique. Publiez-la quand elle est complète.",
  },
  ACTIF: {
    titre: "Publiée",
    explication:
      "Cette fiche est visible dans la boutique et ses déclinaisons sont achetables.",
  },
  ARCHIVE: {
    titre: "Archivée",
    explication:
      "Cette fiche est retirée de la boutique. Les commandes déjà passées ne changent pas, et le stock reste vendable en main propre.",
  },
};

/**
 * Traduit un refus de la Server Action en message.
 *
 * REND `null` SUR SUCCES, meme convention qu'en LS-100, LS-101 et LS-102.
 *
 * `NON_PUBLIABLE` NE PASSE PAS PAR ICI : ses motifs s'affichent en liste, pas
 * en phrase unique, et l'appelant les traite separement.
 */
function messageDe(resultat: ResultatPublication): string | null {
  switch (resultat.statut) {
    case "SUCCES":
      return null;
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return resultat.message;
    case "INTROUVABLE":
      return "Cette fiche n'existe plus. Rechargez la page.";
    case "NON_PUBLIABLE":
      return null;
    case "TRANSITION_INVALIDE":
      return "L'état de la fiche a changé entre-temps. Rechargez la page.";
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

export function PublicationProduit({
  produitId,
  statut,
  motifs,
}: {
  produitId: string;
  statut: StatutProduitAffiche;
  /** Ce qui manque, calculé côté serveur au rendu. Vide si publiable. */
  motifs: MotifAffiche[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [refuses, setRefuses] = useState<MotifAffiche[] | null>(null);
  const [aArchiver, setAArchiver] = useState(false);

  /*
   * LE FOCUS ENTRE DANS LE PANNEAU A SON OUVERTURE, et revient au bouton qui
   * l'a ouvert a sa fermeture. Defaut corrige en LS-101 : sans cela, la plupart
   * des lecteurs d'ecran n'annoncent pas l'`alertdialog`, et Echap ne sert a
   * rien puisque son gestionnaire ne recoit jamais l'evenement.
   */
  const panneau = useRef<HTMLDivElement | null>(null);
  const declencheur = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (aArchiver) {
      panneau.current?.focus();
    } else {
      declencheur.current?.focus();
      declencheur.current = null;
    }
  }, [aArchiver]);

  const etat = ETAT_AFFICHE[statut];

  /*
   * LES MOTIFS AFFICHES SONT CEUX DU DERNIER REFUS S'IL Y EN A EU UN, sinon
   * ceux calcules au rendu. La distinction compte : apres un refus, l'ecran
   * doit montrer ce que le SERVEUR a refuse, qui peut differer de ce que la
   * page avait calcule si l'etat a change entre les deux.
   */
  const manquants = refuses ?? motifs;

  function jouer(
    action: () => Promise<ResultatPublication>,
    messageSucces: string,
    apres?: () => void,
  ) {
    setErreur(null);
    setSucces(null);

    demarrer(async () => {
      const resultat = await action();

      if (resultat.statut === "NON_PUBLIABLE") {
        setRefuses(resultat.motifs);
        setErreur(
          "La fiche n'est pas complète : corrigez les points ci-dessous avant de publier.",
        );
        return;
      }

      const message = messageDe(resultat);
      if (message) {
        setErreur(message);
        return;
      }

      setRefuses(null);
      setSucces(messageSucces);
      apres?.();
    });
  }

  return (
    <section className={styles.editeur} aria-labelledby="titre-publication">
      <h2 className={styles.sousTitre} id="titre-publication">
        Publication
      </h2>

      <div className={styles.carte}>
        <div className={styles.enTeteVariante}>
          <h3 className={styles.referenceVariante}>{etat.titre}</h3>
        </div>
        <p className={styles.aide}>{etat.explication}</p>

        {manquants.length > 0 && statut !== "ACTIF" && (
          /*
           * CE QUI MANQUE EST AFFICHE AVANT TOUTE TENTATIVE, et c'est le point
           * de cet ecran. Attendre le refus obligerait l'exploitante a publier
           * quatre fois pour decouvrir quatre conditions.
           *
           * `.avertissement` ET NON `.erreur` : rien n'a echoue, la fiche est
           * en cours de constitution. Le rouge ferait croire a une panne.
           */
          <div className={styles.avertissement}>
            <p>Il manque encore :</p>
            <ul>
              {manquants.map((motif) => (
                <li key={motif}>{MOTIF_AFFICHE[motif]}</li>
              ))}
            </ul>
          </div>
        )}

        <p className={styles.erreur} role="alert">
          {erreur ?? ""}
        </p>
        <p className={styles.succes} role="status">
          {succes ?? ""}
        </p>

        <div className={styles.actions}>
          {statut !== "ACTIF" && (
            <button
              type="button"
              className={styles.bouton}
              /*
               * LE BOUTON N'EST PAS DESACTIVE QUAND IL MANQUE QUELQUE CHOSE, et
               * c'est delibere : un bouton grise n'explique rien, et l'ecran
               * porte deja la liste juste au-dessus. Le refus serveur reste la
               * garantie, la liste n'etant qu'un confort.
               */
              disabled={enCours}
              onClick={() =>
                jouer(
                  () => publierProduitAction(produitId),
                  statut === "ARCHIVE"
                    ? "Fiche republiée."
                    : "Fiche publiée, elle est visible dans la boutique.",
                )
              }
            >
              {statut === "ARCHIVE" ? "Republier la fiche" : "Publier la fiche"}
            </button>
          )}

          {statut !== "ARCHIVE" && (
            <button
              type="button"
              className={styles.boutonDanger}
              disabled={enCours}
              onClick={(evenement) => {
                declencheur.current = evenement.currentTarget;
                setAArchiver(true);
              }}
            >
              Archiver la fiche
            </button>
          )}
        </div>

        {aArchiver && (
          <div
            className={styles.confirmation}
            role="alertdialog"
            aria-labelledby="confirmation-archivage-titre"
            aria-describedby="confirmation-archivage-texte"
            ref={panneau}
            tabIndex={-1}
            onKeyDown={(evenement) => {
              if (evenement.key === "Escape") {
                setAArchiver(false);
              }
            }}
          >
            <p
              className={styles.confirmationTitre}
              id="confirmation-archivage-titre"
            >
              Archiver cette fiche ?
            </p>
            {/*
             * LA CONFIRMATION DIT CE QUI NE CHANGE PAS, et pas seulement ce qui
             * change. « Retirer du catalogue » se lit facilement comme
             * « effacer » : les commandes passées restent intactes, C11, et le
             * stock physique ne bouge pas, invariant 6.
             */}
            <p
              className={styles.confirmationTexte}
              id="confirmation-archivage-texte"
            >
              La fiche sort de la boutique. Les commandes déjà passées ne
              changent pas, et le stock reste vendable en main propre. Vous
              pourrez la republier plus tard.
            </p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.boutonDanger}
                disabled={enCours}
                onClick={() =>
                  jouer(
                    () => archiverProduitAction(produitId),
                    "Fiche archivée.",
                    () => setAArchiver(false),
                  )
                }
              >
                Archiver la fiche
              </button>
              <button
                type="button"
                className={styles.boutonSecondaire}
                disabled={enCours}
                onClick={() => setAArchiver(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
