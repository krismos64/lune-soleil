/**
 * Consultation du journal des connexions, LS-80, ADR-027 decision 2.
 *
 * Critere 6 : derriere `exigerAdministratrice`, appele AVANT tout rendu, selon
 * le motif pose par LS-70. Aucune verification dans un composant enfant, aucun
 * rendu conditionnel sur un role lu cote client.
 *
 * COMPOSANT SERVEUR, sans aucune interaction : la page lit et affiche. Rien ici
 * ne justifie du JavaScript dans le navigateur, et une donnee de securite n'a
 * pas a transiter par une API cliente pour etre montree.
 *
 * CE QUE CET ECRAN MONTRE VOLONTAIREMENT : les echecs autant que les reussites,
 * regle E13. Dix echecs suivis d'une reussite est le motif qu'il doit rendre
 * lisible d'un coup d'oeil, d'ou le badge sur l'issue.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import styles from "./journal-connexions.module.css";
import {
  CONSERVATION_JOURNAL_MOIS,
  lireTentativesRecentes,
  type LigneJournalConnexion,
} from "@/services/journal-connexion";

export const metadata = {
  title: "Journal des connexions, administration",
  robots: { index: false, follow: false },
};

/**
 * La page lit la base a chaque affichage.
 *
 * Sans cela, Next.js pourrait servir un rendu mis en cache : un journal de
 * securite qui montre l'etat d'il y a une heure repondrait a cote de la
 * question qu'on lui pose.
 */
export const dynamic = "force-dynamic";

/**
 * Affichage d'un horodatage, invariant 8 et critere 7.
 *
 * PERSISTE EN UTC, CONVERTI ICI SEULEMENT. `timeZone` est explicite plutot que
 * laisse au fuseau du serveur : le conteneur de production tourne en UTC, et
 * sans cette ligne l'exploitante lirait des heures decalees de deux heures en
 * ete sans qu'aucune erreur n'apparaisse.
 */
function formaterHorodatage(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Paris",
  }).format(date);
}

function libelleMoyen(moyen: LigneJournalConnexion["moyen"]): string {
  return moyen === "PASSKEY" ? "Passkey" : "Mot de passe";
}

export default async function PageJournalConnexions() {
  try {
    await exigerAdministratrice(await headers());
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      redirect("/administration/connexion");
    }
    throw erreur;
  }

  const tentatives = await lireTentativesRecentes();

  return (
    <main className={styles["journal-connexions"]}>
      <h1>Journal des connexions</h1>
      <p className={styles.introduction}>
        Tentatives de connexion, réussies comme échouées, sur les comptes
        d&apos;administration et les comptes clients. Les lignes de plus de{" "}
        {CONSERVATION_JOURNAL_MOIS} mois sont supprimées automatiquement.
      </p>

      {tentatives.length === 0 ? (
        <p className={styles.vide}>
          Aucune tentative de connexion enregistrée.
        </p>
      ) : (
        <ul className={styles.liste}>
          {tentatives.map((tentative) => (
            <li key={tentative.id} className={styles.tentative}>
              <div className={styles.entete}>
                <span
                  className={
                    tentative.issue === "REUSSITE"
                      ? `${styles.issue} ${styles["issue--reussite"]}`
                      : `${styles.issue} ${styles["issue--echec"]}`
                  }
                >
                  {tentative.issue === "REUSSITE" ? "Réussite" : "Échec"}
                </span>
                <time
                  className={styles.date}
                  dateTime={tentative.creeA.toISOString()}
                >
                  {formaterHorodatage(tentative.creeA)}
                </time>
              </div>

              <dl className={styles.details}>
                <div className={styles.champ}>
                  <dt>Adresse saisie</dt>
                  <dd>{tentative.emailTente}</dd>
                </div>
                <div className={styles.champ}>
                  <dt>Moyen</dt>
                  <dd>{libelleMoyen(tentative.moyen)}</dd>
                </div>
                <div className={styles.champ}>
                  <dt>Compte</dt>
                  <dd>
                    {tentative.emailCompte ?? (
                      /* Nul sur un echec contre une adresse sans compte, cas
                         normal et revelateur : c'est le motif d'un balayage. */
                      <span className={styles.absent}>
                        aucun compte correspondant
                      </span>
                    )}
                  </dd>
                </div>
                <div className={styles.champ}>
                  <dt>Adresse IP</dt>
                  <dd>
                    {tentative.adresseIp ?? (
                      <span className={styles.absent}>non déterminée</span>
                    )}
                  </dd>
                </div>
                <div className={`${styles.champ} ${styles["champ--large"]}`}>
                  <dt>Navigateur</dt>
                  <dd>
                    {tentative.agentUtilisateur ?? (
                      <span className={styles.absent}>non transmis</span>
                    )}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
