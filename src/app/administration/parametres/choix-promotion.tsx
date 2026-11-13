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
  enregistrerPeriodeAction,
  type ResultatPeriode,
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
        {blackWeek.taux}&nbsp;%. Vous l&apos;activez et la désactivez quand vous
        le souhaitez ; le bandeau annonce la période réglée ci-dessous.
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

function messagePeriode(resultat: ResultatPeriode | null): string {
  switch (resultat?.statut) {
    case undefined:
      return "";
    case "ENREGISTREE":
      return resultat.periode === null
        ? "Aucune date n'est plus annoncée par le bandeau."
        : `Le bandeau annonce désormais : ${resultat.periode}.`;
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "PARAMETRES_ABSENTS":
      return "Aucun paramètre n'est enregistré pour cette boutique.";
    case "INVALIDE":
      return resultat.message;
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

/**
 * La période annoncée par le bandeau, amendement d'ADR-051 du 13 novembre
 * 2026 : deux dates choisies par l'exploitante, indépendantes de
 * l'activation. Les deux vides, le bandeau n'annonce aucune date.
 */
export function PeriodePromotion({
  periode,
}: {
  periode: { debut: string; fin: string } | null;
}) {
  const [resultat, action, enCours] = useActionState<
    ResultatPeriode | null,
    FormData
  >(enregistrerPeriodeAction, null);

  return (
    <form
      action={action}
      className={styles.formulaire}
      id="periode-promotion"
      aria-labelledby="periode-titre"
    >
      <h2 id="periode-titre" className={styles.legende}>
        Période annoncée de la promotion
      </h2>
      <p id="periode-aide" className={styles.aide}>
        Le bandeau de la promotion écrit ces dates, par exemple « du lundi 23 au
        dimanche 29 novembre ». Laissez les deux champs vides pour
        n&apos;annoncer aucune date.
      </p>
      <div className={styles.champs}>
        <div className={styles.champ}>
          <label htmlFor="periode-debut" className={styles.libelle}>
            Premier jour
          </label>
          <input
            id="periode-debut"
            name="debut"
            type="date"
            defaultValue={periode?.debut ?? ""}
            className={styles.saisie}
            aria-describedby="periode-aide"
          />
        </div>
        <div className={styles.champ}>
          <label htmlFor="periode-fin" className={styles.libelle}>
            Dernier jour
          </label>
          <input
            id="periode-fin"
            name="fin"
            type="date"
            defaultValue={periode?.fin ?? ""}
            className={styles.saisie}
            aria-describedby="periode-aide"
          />
        </div>
      </div>
      <p
        role="status"
        aria-label="État de la période annoncée"
        className={styles.sortie}
      >
        {enCours ? "Enregistrement…" : messagePeriode(resultat)}
      </p>
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
      <button type="submit" className={styles.bouton} disabled={enCours}>
        Enregistrer la période
      </button>
    </form>
  );
}
