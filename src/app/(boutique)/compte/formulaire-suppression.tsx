"use client";

/**
 * Confirmation de suppression de compte. LS-95, critere 1.
 *
 * COMPOSANT CLIENT PAR NECESSITE : la confirmation demande une saisie et un
 * etat local. Rien de ce qui decide n'est ici, la Server Action verifie la
 * session et la fraicheur de la preuve cote serveur, invariant 2.
 *
 * PAS DE `window.confirm`, ET CE N'EST PAS UN CHOIX DE STYLE. Une boite native
 * ne se lit pas correctement au lecteur d'ecran selon les navigateurs, ne
 * respecte pas la palette, et surtout se valide par la touche Entree tenue
 * enfoncee. Pour une action irreversible, la confirmation doit demander un
 * geste DIFFERENT du geste initial : ici, recopier un mot.
 */
import { useState } from "react";

import { supprimerCompteAction } from "./actions";
import styles from "./compte.module.css";

/**
 * Le mot a recopier.
 *
 * EN FRANÇAIS ET NON « DELETE » : la personne doit comprendre ce qu'elle ecrit.
 * Un mot dans une langue etrangere se recopie machinalement, ce qui detruit
 * l'interet de la confirmation.
 */
const MOT_DE_CONFIRMATION = "SUPPRIMER";

/**
 * `reauthentification` EST UN ETAT A PART ENTIERE, LS-164, et non un cas
 * d'`erreur`.
 *
 * La distinction est fonctionnelle : une erreur se relit et se corrige sur
 * place, ce refus-ci se leve AILLEURS, par une preuve d'identite. Les confondre
 * afficherait un lien de confirmation sous « la suppression est momentanement
 * indisponible », ou il n'aurait aucun sens.
 */
type Etat = "repos" | "en-cours" | "erreur" | "reauthentification" | "supprime";

export function FormulaireSuppressionCompte({
  minutesDeFraicheur,
}: {
  minutesDeFraicheur: number;
}) {
  const [etat, setEtat] = useState<Etat>("repos");
  const [saisie, setSaisie] = useState("");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  const motCorrect = saisie.trim().toUpperCase() === MOT_DE_CONFIRMATION;
  const enCours = etat === "en-cours";

  const soumettre = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();

    // GARDE D'INTERFACE SEULEMENT. Le serveur ne fait aucune confiance a cette
    // condition : il verifie la session et la preuve d'identite de son cote.
    if (!motCorrect) {
      return;
    }

    setEtat("en-cours");
    setMessageErreur(null);

    const resultat = await supprimerCompteAction();

    switch (resultat.statut) {
      case "SUPPRIME":
        setEtat("supprime");
        return;

      case "REAUTHENTIFICATION_REQUISE":
        /**
         * LE CAS QUI FAIT DE CETTE ACTION UNE ACTION SENSIBLE. La session est
         * valide, mais la preuve d'identite manque ou date de plus de
         * `minutesDeFraicheur`. Le message le dit clairement : sans cela, la
         * personne croirait a une panne et recommencerait.
         *
         * IL MENE DESORMAIS QUELQUE PART, LS-164 critere 2. Jusqu'ici ce texte
         * demandait une action impossible : aucun ecran de reauthentification
         * client n'existait, et le seul disponible exigeait le role
         * `ADMINISTRATRICE`. Le message etait donc une impasse, et il privait
         * le client du droit a l'effacement, RGPD article 17.
         */
        setEtat("reauthentification");
        setMessageErreur(
          `Pour votre sécurité, confirmez votre identité avant de supprimer votre compte. Votre confirmation reste valable ${minutesDeFraicheur} minutes.`,
        );
        return;

      case "SESSION_ABSENTE":
        /*
         * VERS LA CONNEXION CLIENT DEPUIS LS-54, second des deux chemins
         * corriges ensemble. Celui-ci se declenche quand la session expire
         * PENDANT que le formulaire est ouvert, cas plus frequent qu'il n'y
         * parait sur un ecran ou l'on hesite. Corriger la page sans lui aurait
         * laisse un client renvoye vers l'administration au pire moment.
         */
        window.location.href = "/compte/connexion";
        return;

      case "REFUSEE":
        setEtat("erreur");
        setMessageErreur(
          "Ce compte ne peut pas être supprimé automatiquement. Contactez la boutique par email.",
        );
        return;

      default:
        setEtat("erreur");
        setMessageErreur(
          "La suppression est momentanément indisponible. Réessayez dans un instant.",
        );
    }
  };

  if (etat === "supprime") {
    return (
      <p className={styles.succes} role="status">
        Votre compte a été supprimé. Vos commandes et vos factures restent
        conservées, comme la loi l&apos;impose, mais ne vous sont plus
        rattachées.
      </p>
    );
  }

  return (
    <form className={styles.formulaire} onSubmit={soumettre}>
      <div className={styles.champ}>
        <label htmlFor="confirmation-suppression">
          Pour confirmer, saisissez {MOT_DE_CONFIRMATION}
        </label>
        <input
          id="confirmation-suppression"
          name="confirmation-suppression"
          type="text"
          // `off` : rien ici ne doit etre memorise ni suggere par le
          // navigateur, la saisie n'ayant aucune valeur reutilisable.
          autoComplete="off"
          value={saisie}
          onChange={(evenement) => setSaisie(evenement.target.value)}
          disabled={enCours}
          aria-describedby="aide-confirmation"
        />
        <p id="aide-confirmation" className={styles.aide}>
          Cette action est définitive.
        </p>
      </div>

      <button
        type="submit"
        className={styles.actionDanger}
        // DESACTIVE TANT QUE LE MOT N'EST PAS EXACT : le geste de confirmation
        // doit etre volontaire, pas un second clic au meme endroit.
        disabled={!motCorrect || enCours}
      >
        {enCours ? "Suppression en cours…" : "Supprimer définitivement"}
      </button>

      {messageErreur && (
        // `role="alert"` et non une couleur : l'echec doit parvenir au lecteur
        // d'ecran sans que la personne ait a le rechercher.
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}

      {/*
       * LE CHEMIN POUR LEVER LE REFUS, LS-164 critere 2.
       *
       * UN LIEN ET NON UN BOUTON : c'est une navigation vers un autre ecran,
       * pas une action sur celui-ci. Un `<button>` qui navigue prive du clic
       * milieu, du menu contextuel et de l'annonce « lien » au lecteur d'ecran.
       *
       * HORS DU BLOC `role="alert"`, et c'est delibere. Un lien place DANS une
       * region live est annonce avec le message mais reste difficile a
       * atteindre : plusieurs lecteurs d'ecran lisent le contenu d'une alerte
       * sans y deplacer le curseur virtuel. Le sortir le rend navigable a la
       * tabulation, juste apres le message.
       *
       * `?retour=compte` RAMENE ICI apres la confirmation, par une CLE et
       * jamais par un chemin : la page de reauthentification n'accepte aucune
       * URL fournie, ce qui ferme la redirection ouverte.
       */}
      {etat === "reauthentification" && (
        <a
          className={styles.lien}
          href="/compte/reauthentification?retour=compte"
        >
          Confirmer mon identité
        </a>
      )}
    </form>
  );
}
