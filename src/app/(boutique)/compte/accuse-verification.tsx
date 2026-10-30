/**
 * Accuse du lien de verification d'adresse email, LS-298.
 *
 * DEUX ECRANS D'ARRIVEE. Le lien ramene a `/compte` ; ouvert sur un autre
 * appareil, sans session, `/compte` renvoie a la connexion, et l'accuse doit
 * l'y suivre plutot que de disparaitre dans la redirection.
 *
 * REGION LIVE NOMMEE, C39 : une region autonome du parcours de compte, que la
 * navigation par regions doit pouvoir distinguer du reste de l'ecran.
 */
import Link from "next/link";

import type { IssueVerification } from "@/lib/retour-verification-email";

import { EffacerParametresRetour } from "./effacer-parametres-retour";
import styles from "./compte.module.css";

/** Les parametres d'un retour de lien, retires de l'adresse apres lecture. */
const PARAMETRES_RETOUR = ["verifie", "error"] as const;

export function AccuseVerification({
  issue,
  confirmee,
}: {
  issue: IssueVerification | null;
  /**
   * L'etat lu en base, ou `null` sans session. Un succes que la base dement
   * n'est pas affiche : le parametre se tape a la main.
   */
  confirmee: boolean | null;
}) {
  if (issue === null) {
    return null;
  }

  return (
    <>
      <EffacerParametresRetour parametres={PARAMETRES_RETOUR} />

      {issue === "REUSSIE" && confirmee !== false && (
        <p
          className={`${styles.succes} ${styles.accuse}`}
          role="status"
          aria-label="Vérification de l'adresse email"
        >
          Adresse email vérifiée.
          {confirmee === null && " Connectez-vous pour accéder à votre compte."}
        </p>
      )}

      {issue !== "REUSSIE" && (
        <div
          className={`${styles.erreur} ${styles.accuse}`}
          role="status"
          aria-label="Vérification de l'adresse email"
        >
          <p className={styles.texteErreur}>
            {issue === "EXPIREE"
              ? "Ce lien de vérification a expiré."
              : "Ce lien de vérification n'est pas valide."}{" "}
            {confirmee === true
              ? "Votre adresse est déjà vérifiée, rien d'autre à faire."
              : confirmee === false
                ? "Un nouveau lien peut vous être envoyé."
                : "Demandez un nouveau lien depuis votre compte."}
          </p>
          {confirmee === false && (
            <Link href="/compte/verification" className={styles.lienRetour}>
              Recevoir un nouveau lien
            </Link>
          )}
        </div>
      )}
    </>
  );
}
