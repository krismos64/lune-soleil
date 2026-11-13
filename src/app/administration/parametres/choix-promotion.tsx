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
 *
 * LE BOUTON EST DÉCRIT PAR L'ÉTAT, `aria-describedby`, revue d'interface de
 * LS-319 : au focus, le lecteur d'écran dit les pièces exclues et le gel des
 * prix, avant l'action la plus lourde de l'écran. La cible ne porte aucun
 * `aria-label`, C39.
 */
import Link from "next/link";
import { useActionState } from "react";

import { PROMOTIONS } from "@/lib/promotion";
import {
  basculerPromotionAction,
  type ResultatPromotion,
} from "./actions-promotion";
import styles from "./parametres.module.css";

/**
 * `INDISPONIBLE` : la lecture a échoué. L'écran des paramètres reste
 * utilisable, et ce bloc le dit sans proposer d'action.
 */
export type EtatPromotionAffiche =
  | "INDISPONIBLE"
  | {
      libelle: string;
      taux: number;
      activeDepuis: string;
      exclues: number;
    }
  | null;

/** Le signe moins typographique, lu « moins » et non « tiret ». */
const MOINS = "−";

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

function texteEtat(etat: Exclude<EtatPromotionAffiche, "INDISPONIBLE">) {
  const blackWeek = PROMOTIONS.BLACK_WEEK;
  if (etat === null) {
    return (
      <>
        Aucune promotion active. {blackWeek.libelle} réduit les prix de{" "}
        {blackWeek.taux}&nbsp;% et s&apos;annonce {blackWeek.periodeAnnoncee} :
        à activer et à désactiver à ces dates.
      </>
    );
  }
  return (
    <>
      <strong>
        {etat.libelle}, {MOINS}
        {etat.taux}&nbsp;%, active depuis le {etat.activeDepuis}.
      </strong>{" "}
      {etat.exclues === 0
        ? "Toutes les pièces en vente sont réduites."
        : `${etat.exclues} pièce${etat.exclues > 1 ? "s" : ""} ${etat.exclues > 1 ? "restent" : "reste"} au prix catalogue : en vente depuis moins de trente jours, ou prix modifié dans ces trente jours.`}{" "}
      Les prix sont gelés tant qu&apos;elle est active.
    </>
  );
}

export function ChoixPromotion({ etat }: { etat: EtatPromotionAffiche }) {
  const [resultat, action, enCours] = useActionState<
    ResultatPromotion | null,
    FormData
  >(basculerPromotionAction, null);
  const blackWeek = PROMOTIONS.BLACK_WEEK;

  if (etat === "INDISPONIBLE") {
    return (
      <section
        className={styles.formulaire}
        id="promotion"
        aria-labelledby="promotion-titre"
      >
        <h2 id="promotion-titre" className={styles.legende}>
          Promotion
        </h2>
        <p className={styles.aide}>
          L&apos;état de la promotion n&apos;a pas pu être lu. Rechargez la page
          dans un instant ; les autres réglages restent utilisables.
        </p>
      </section>
    );
  }

  return (
    <form
      action={action}
      className={styles.formulaire}
      id="promotion"
      aria-labelledby="promotion-titre"
    >
      <h2 id="promotion-titre" className={styles.legende}>
        Promotion
      </h2>
      <p id="promotion-etat" className={styles.aide}>
        {texteEtat(etat)}
      </p>
      <input type="hidden" name="code" value="BLACK_WEEK" />
      <input
        type="hidden"
        name="action"
        value={etat === null ? "ACTIVER" : "DESACTIVER"}
      />

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
            className={styles.lienSortie}
          >
            Confirmer mon identité
          </Link>
        </p>
      )}

      {resultat?.statut === "SESSION_ABSENTE" && (
        <p className={styles.sortie}>
          <Link
            href="/administration/connexion"
            prefetch={false}
            className={styles.lienSortie}
          >
            Se reconnecter
          </Link>
        </p>
      )}

      <button
        type="submit"
        className={styles.bouton}
        disabled={enCours}
        aria-describedby="promotion-etat"
      >
        {etat === null
          ? `Activer ${blackWeek.libelle}, ${MOINS}${blackWeek.taux} %`
          : "Désactiver la promotion"}
      </button>
    </form>
  );
}
