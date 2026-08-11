/**
 * Ecran de reauthentification, LS-89, ADR-027 decision 3.
 *
 * QUAND IL APPARAIT. Une session ouverte prouve qu'on s'est connecte un jour,
 * pas que la personne devant l'ecran est l'exploitante maintenant. Quatre
 * familles d'actions redemandent donc une preuve recente, fenetre de quinze
 * minutes. Le scenario vise est l'ordinateur reste ouvert : quelqu'un s'assied
 * et rembourse, exporte le fichier client ou change les coordonnees bancaires.
 *
 * IL EXIGE UNE SESSION D'ADMINISTRATION, et c'est la premiere chose verifiee.
 *
 * `exigerAdministratrice` ET NON `lireIdentite`, correction d'un defaut trouve
 * en relecture. La premiere version se contentait de constater qu'une session
 * existait : un client inscrit sur la boutique, role `CLIENT` par defaut,
 * pouvait ouvrir cet ecran, saisir SON mot de passe et repartir avec une preuve
 * d'identite fraiche sur sa session. `verifyPassword` verifie contre
 * `session.user.id`, donc il aurait reussi.
 *
 * Ce que cela ouvrait dependait entierement de la discipline des actions
 * sensibles, or `.claude/rules/securite.md` signale precisement ce couple comme
 * non mesure : « une action qui n'appelle que la premiere laisse un client
 * authentifie franchir la garde de fraicheur avec son propre mot de passe ».
 * Fabriquer la preuve sans filtrer le role, c'etait construire le trou en amont.
 *
 * IL N'ACCORDE RIEN PAR LUI-MEME. Etablir une preuve note un horodatage sur la
 * session ; c'est l'action sensible qui, ensuite, verifiera sa fraicheur cote
 * serveur. Invariant 2.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
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
  let identite;

  try {
    identite = await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      // Redirection et non page d'erreur : sans session d'administration, la
      // reponse utile est le formulaire de connexion. Le refus ne distingue pas
      // « pas de session » de « session sans le role », ce qui ne renseigne pas
      // sur l'existence du compte d'administration.
      redirect("/administration/connexion");
    }
    throw erreur;
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
