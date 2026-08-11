/**
 * Ecran de reauthentification, LS-89, ADR-027 decision 3.
 *
 * QUAND IL APPARAIT. Une session ouverte prouve qu'on s'est connecte un jour,
 * pas que la personne devant l'ecran est l'exploitante maintenant. Quatre
 * familles d'actions redemandent donc une preuve recente, fenetre de quinze
 * minutes. Le scenario vise est l'ordinateur reste ouvert : quelqu'un s'assied
 * et rembourse, exporte le fichier client ou change les coordonnees bancaires.
 *
 * IL EXIGE DEJA UNE SESSION, et c'est la premiere chose verifiee. Se
 * reauthentifier n'a de sens que pour qui est deja connecte : sans session, la
 * reponse utile est le formulaire de connexion, pas celui-ci.
 *
 * IL N'ACCORDE RIEN PAR LUI-MEME. Etablir une preuve note un horodatage sur la
 * session ; c'est l'action sensible qui, ensuite, verifiera sa fraicheur cote
 * serveur. Invariant 2.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { lireIdentite } from "@/services/autorisation";
import { FENETRE_REAUTHENTIFICATION_MS } from "@/services/preuve-identite";

import { FormulaireReauthentification } from "./formulaire-reauthentification";
import styles from "./reauthentification.module.css";

export const metadata = {
  title: "Confirmer votre identité, administration",
  robots: { index: false, follow: false },
};

/**
 * Jamais de cache : la page depend de la session courante, et un rendu partage
 * entre deux visiteurs serait une confusion d'identite.
 */
export const dynamic = "force-dynamic";

const FENETRE_MINUTES = Math.round(FENETRE_REAUTHENTIFICATION_MS / 60_000);

export default async function PageReauthentification() {
  const identite = await lireIdentite(await headers());

  if (!identite) {
    // Pas de session du tout : c'est une connexion qu'il faut, pas une
    // reauthentification. La redirection ne dit pas si un compte existe.
    redirect("/administration/connexion");
  }

  return (
    <main className={styles.page}>
      <h1>Confirmer votre identité</h1>
      <p className={styles.introduction}>
        Cette action touche des données sensibles. Confirmez votre identité pour
        continuer ; la confirmation reste valable {FENETRE_MINUTES} minutes.
      </p>
      <FormulaireReauthentification email={identite.email} />
    </main>
  );
}
