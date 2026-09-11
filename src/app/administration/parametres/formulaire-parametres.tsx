"use client";

/**
 * Formulaire des parametres commerciaux, LS-98, ADR-043.
 *
 * COMPOSANT CLIENT PARCE QU'IL PORTE UNE INTERACTION REELLE : l'etat de la
 * soumission et l'annonce du resultat. Il ne requete rien lui-meme, la page
 * serveur lui passant les valeurs.
 *
 * LES MONTANTS SE SAISISSENT EN EUROS ET VIVENT EN CENTIMES, invariant 1. La
 * conversion se fait dans la Server Action, jamais ici : un calcul monetaire
 * dans le navigateur est exactement ce que `frontend-design.md` ecarte.
 *
 * LA REGION LIVE PORTE L'ATTENTE ET LE RESULTAT, et le libelle du bouton reste
 * FIXE. C'est la lecon de la revue frontend de LS-61 : un bouton `disabled`
 * perd le focus, donc un lecteur d'ecran ne revient pas lire un nom qui vient de
 * changer, et l'action la plus lente de l'ecran n'annoncerait rien.
 */
import Link from "next/link";
import { useActionState } from "react";

import { centimesVersSaisie } from "@/lib/montant";
import type { ParametresLus } from "@/services/parametres";
import { type ResultatParametres, enregistrer } from "./actions";
import styles from "./parametres.module.css";

/** Les cinq interrupteurs du prototype, avec ce que chacun declenche. */
const ALERTES = [
  {
    nom: "alerteCommandePayee",
    cle: "alerteCommandePayee",
    libelle: "Une commande est payée",
  },
  {
    nom: "alertePaiementAnnule",
    cle: "alertePaiementAnnule",
    libelle: "Un paiement est annulé",
  },
  {
    nom: "alerteStockFaible",
    cle: "alerteStockFaible",
    libelle: "Une pièce passe sous le seuil de stock",
  },
  {
    nom: "alerteMessageRecu",
    cle: "alerteMessageRecu",
    libelle: "Un message arrive par le formulaire de contact",
  },
  {
    nom: "alerteAvisAModerer",
    cle: "alerteAvisAModerer",
    libelle: "Un avis attend une relecture",
  },
] as const satisfies readonly {
  nom: string;
  cle: keyof ParametresLus;
  libelle: string;
}[];

/**
 * Ce que la region live annonce, selon l'issue.
 *
 * CHAQUE REFUS DIT CE QUI RESTE POSSIBLE, jamais seulement ce qui a echoue.
 * `PLAFOND` de LS-61 a montre le cout d'un refus sans sortie : l'exploitante
 * reclique et conclut a une panne.
 */
function messageDe(
  resultat: ResultatParametres | null,
  enCours: boolean,
): string {
  if (enCours) {
    return "Enregistrement en cours…";
  }

  if (resultat === null) {
    return "";
  }

  switch (resultat.statut) {
    case "SUCCES":
      return "Les paramètres sont enregistrés. Ils s'appliquent aux commandes à venir.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour enregistrer.";
    case "REAUTHENTIFICATION_REQUISE":
      return "Confirmez votre identité pour enregistrer ces paramètres.";
    case "INVALIDE":
      return resultat.message;
  }
}

export function FormulaireParametres({
  parametres,
}: {
  parametres: ParametresLus;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatParametres | null,
    FormData
  >(enregistrer, null);

  const annonce = messageDe(resultat, enCours);

  return (
    <form action={action} className={styles.formulaire}>
      <fieldset className={styles.groupe}>
        <legend className={styles.legende}>Livraison</legend>

        <div className={styles.champ}>
          <label htmlFor="tarifRelais" className={styles.libelle}>
            Point Relais et Locker, en euros
          </label>
          <p id="aide-relais" className={styles.aide}>
            Le même tarif s&apos;applique aux deux modes de retrait.
          </p>
          <input
            id="tarifRelais"
            name="tarifRelais"
            type="text"
            inputMode="decimal"
            defaultValue={centimesVersSaisie(parametres.tarifRelaisCentimes)}
            aria-describedby="aide-relais"
            className={styles.saisie}
            required
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="tarifDomicile" className={styles.libelle}>
            Livraison à domicile, en euros
          </label>
          <input
            id="tarifDomicile"
            name="tarifDomicile"
            type="text"
            inputMode="decimal"
            defaultValue={centimesVersSaisie(parametres.tarifDomicileCentimes)}
            className={styles.saisie}
            required
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="seuilFranchise" className={styles.libelle}>
            Livraison offerte à partir de, en euros
          </label>
          {/*
           * LE CHAMP VIDE A UN SENS, ET IL EST DIT. Trois etats se saisissent
           * ici, et les confondre change le montant facture : vide desactive,
           * zero offre toujours, un montant fixe le seuil.
           */}
          <p id="aide-seuil" className={styles.aide}>
            Laissez vide pour ne rien offrir. Zéro offre la livraison en Point
            Relais quel que soit le montant. La livraison à domicile n&apos;est
            jamais offerte.
          </p>
          <input
            id="seuilFranchise"
            name="seuilFranchise"
            type="text"
            inputMode="decimal"
            defaultValue={
              parametres.seuilFranchiseCentimes === null
                ? ""
                : centimesVersSaisie(parametres.seuilFranchiseCentimes)
            }
            aria-describedby="aide-seuil"
            className={styles.saisie}
          />
        </div>
      </fieldset>

      <fieldset className={styles.groupe}>
        <legend className={styles.legende}>Alertes</legend>

        <div className={styles.champ}>
          <label htmlFor="emailAlertes" className={styles.libelle}>
            Adresse qui reçoit les alertes
          </label>
          <p id="aide-email" className={styles.aide}>
            Une seule adresse pour toutes les alertes ci-dessous.
          </p>
          <input
            id="emailAlertes"
            name="emailAlertes"
            type="email"
            defaultValue={parametres.emailAlertes}
            aria-describedby="aide-email"
            className={styles.saisie}
            required
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="seuilStockFaible" className={styles.libelle}>
            Alerter quand une pièce descend à ce nombre d&apos;exemplaires
          </label>
          <input
            id="seuilStockFaible"
            name="seuilStockFaible"
            type="number"
            min={1}
            step={1}
            defaultValue={parametres.seuilStockFaible}
            className={styles.saisie}
            required
          />
        </div>

        <ul className={styles.interrupteurs}>
          {ALERTES.map((alerte) => (
            <li key={alerte.nom} className={styles.interrupteur}>
              <input
                id={alerte.nom}
                name={alerte.nom}
                type="checkbox"
                defaultChecked={parametres[alerte.cle] === true}
                className={styles.caseACocher}
              />
              <label htmlFor={alerte.nom} className={styles.libelleCase}>
                {alerte.libelle}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {/*
       * LA REGION LIVE PORTE L'ATTENTE ET LE RESULTAT, comme les trois ecrans
       * voisins. Elle est nommee : une region anonyme s'annonce « status » sans
       * rien dire de plus a la navigation par regions, C39.
       */}
      <p
        role="status"
        aria-live="polite"
        aria-label="État de l'enregistrement des paramètres"
        className={styles.annonce}
      >
        {annonce}
      </p>

      {resultat?.statut === "REAUTHENTIFICATION_REQUISE" && (
        <p className={styles.sortie}>
          <Link href="/administration/reauthentification">
            Confirmer mon identité
          </Link>
        </p>
      )}

      {/*
       * LE LIBELLE EST FIXE, jamais « Enregistrement… ». Un bouton `disabled`
       * perd le focus : un lecteur d'ecran n'y reviendrait pas pour lire le nom
       * qui vient de changer, et l'attente ne serait annoncee nulle part. Lecon
       * de la revue frontend de LS-61.
       */}
      <button type="submit" className={styles.bouton} disabled={enCours}>
        Enregistrer
      </button>
    </form>
  );
}
