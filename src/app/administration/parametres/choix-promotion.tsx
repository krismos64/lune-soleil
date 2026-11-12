"use client";

/**
 * L'activation de la promotion, ADR-051, LS-319, aux côtés du thème.
 *
 * AUCUN TAUX NI TEXTE À SAISIR : la promotion, son taux et sa période sont
 * écrits dans le code, `src/lib/promotion.ts`. L'écran active et désactive.
 *
 * L'ÉTAT AFFICHÉ VIENT DU SERVEUR, rendu à chaque requête, et l'issue de la
 * dernière action le complète sans le remplacer : après une activation, la
 * page se revalide et rend l'état réel.
 */
import Link from "next/link";
import { useActionState } from "react";

import { PROMOTIONS } from "@/lib/promotion";
import {
  basculerPromotionAction,
  type ResultatPromotion,
} from "./actions-promotion";
import styles from "./parametres.module.css";

export type EtatPromotionAffiche = {
  libelle: string;
  taux: number;
  activeDepuis: string;
  exclues: number;
} | null;

function messageDe(resultat: ResultatPromotion | null): string {
  switch (resultat?.statut) {
    case undefined:
      return "";
    case "ACTIVEE":
      return `${resultat.libelle} est active : les prix réduits s'appliquent aux nouvelles commandes.`;
    case "DESACTIVEE":
      return "Promotion désactivée : les prix catalogue s'appliquent de nouveau.";
    case "AUCUNE_ACTIVE":
      return "Aucune promotion n'était active.";
    case "DEJA_ACTIVE":
      return "Une promotion est déjà active.";
    case "CARENCE":
      return `Une promotion récente interdit d'en activer une nouvelle avant le ${resultat.finCarence} : le prix réduit est devenu le prix le plus bas des trente derniers jours.`;
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "REAUTHENTIFICATION_REQUISE":
      return "Confirmez votre identité pour changer les prix de la boutique.";
    case "INVALIDE":
      return "Cette promotion n'existe pas. Rechargez la page.";
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

export function ChoixPromotion({ etat }: { etat: EtatPromotionAffiche }) {
  const [resultat, action, enCours] = useActionState<
    ResultatPromotion | null,
    FormData
  >(basculerPromotionAction, null);
  const blackWeek = PROMOTIONS.BLACK_WEEK;

  return (
    <form action={action} className={styles.formulaire} id="promotion">
      <fieldset className={styles.groupe} aria-describedby="promotion-etat">
        <legend className={styles.legende}>Promotion</legend>
        <p id="promotion-etat" className={styles.aide}>
          {etat === null ? (
            <>
              Aucune promotion active. {blackWeek.libelle} réduit les prix de{" "}
              {blackWeek.taux}&nbsp;% et s&apos;annonce{" "}
              {blackWeek.periodeAnnoncee} : à activer et à désactiver à ces
              dates.
            </>
          ) : (
            <>
              <strong>
                {etat.libelle}, -{etat.taux}&nbsp;%, active depuis le{" "}
                {etat.activeDepuis}.
              </strong>{" "}
              {etat.exclues === 0
                ? "Toutes les pièces en vente sont réduites."
                : `${etat.exclues} pièce${etat.exclues > 1 ? "s" : ""} en vente ${etat.exclues > 1 ? "restent" : "reste"} au prix catalogue : en vente depuis moins de trente jours, ou prix modifié dans ces trente jours.`}{" "}
              Les prix sont gelés tant qu&apos;elle est active.
            </>
          )}
        </p>
        <input type="hidden" name="code" value="BLACK_WEEK" />
        <input
          type="hidden"
          name="action"
          value={etat === null ? "ACTIVER" : "DESACTIVER"}
        />
      </fieldset>

      <p
        role="status"
        aria-label="État de la promotion"
        className={styles.sortie}
      >
        {enCours ? "Application…" : messageDe(resultat)}
      </p>

      {resultat?.statut === "REAUTHENTIFICATION_REQUISE" && (
        <p className={styles.sortie}>
          <Link
            href="/administration/reauthentification?retour=parametres"
            prefetch={false}
          >
            Confirmer mon identité
          </Link>
        </p>
      )}

      <button type="submit" className={styles.bouton} disabled={enCours}>
        {etat === null
          ? `Activer ${blackWeek.libelle}, -${blackWeek.taux} %`
          : "Désactiver la promotion"}
      </button>
    </form>
  );
}
