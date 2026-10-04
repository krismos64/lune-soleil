"use client";

/**
 * Choix du thème saisonnier, ADR-046, LS-267.
 *
 * L'EXPLOITANTE CHOISIT, ELLE NE RÉDIGE PAS : chaque thème est écrit dans le
 * code, ses phrases comprises. L'écran dit donc ce que fait chaque thème, et
 * offre un aperçu de l'accueil et du catalogue AVANT d'appliquer, honoré pour
 * sa seule session.
 */
import Link from "next/link";
import { useActionState } from "react";

import type { ThemeSaisonnier } from "@/services/theme-saisonnier";

import { choisirTheme, type ResultatTheme } from "./actions-theme";
import styles from "./parametres.module.css";

const THEMES: readonly {
  valeur: ThemeSaisonnier;
  libelle: string;
  description: string;
}[] = [
  {
    valeur: "AUCUN",
    libelle: "Aucun thème",
    description: "L'habillage ordinaire de la boutique.",
  },
  {
    valeur: "NOEL",
    libelle: "Noël",
    description:
      "Ruban « Fêtes de fin d'année », houx et neige sur l'accueil, guirlande sur le catalogue.",
  },
];

const NOMS: Record<ThemeSaisonnier, string> = {
  AUCUN: "aucun thème",
  NOEL: "le thème de Noël",
};

function messageDe(resultat: ResultatTheme | null): string {
  switch (resultat?.statut) {
    case undefined:
      return "";
    case "SUCCES":
      return resultat.theme === "AUCUN"
        ? "Habillage ordinaire rétabli sur l'accueil et le catalogue."
        : "Le thème de Noël est appliqué à l'accueil et au catalogue.";
    case "SESSION_ABSENTE":
      return "Votre session a expiré. Reconnectez-vous pour continuer.";
    case "INVALIDE":
      return "Ce thème n'existe pas. Rechargez la page.";
    case "PARAMETRES_ABSENTS":
      return "Aucun paramètre n'est enregistré pour cette boutique.";
    case "INDISPONIBLE":
      return "Le service est momentanément indisponible. Réessayez dans un instant.";
  }
}

export function ChoixTheme({ actif }: { actif: ThemeSaisonnier }) {
  const [resultat, action, enCours] = useActionState<
    ResultatTheme | null,
    FormData
  >(choisirTheme, null);
  const applique = resultat?.statut === "SUCCES" ? resultat.theme : actif;

  return (
    <form action={action} className={styles.formulaire}>
      <fieldset className={styles.groupe} aria-describedby="theme-actif">
        <legend className={styles.legende}>Thème saisonnier</legend>
        <p id="theme-actif" className={styles.aide}>
          Thème actif : <strong>{NOMS[applique]}</strong>. Un thème habille
          l&apos;accueil et le catalogue seulement, et aucun texte n&apos;est à
          saisir.
        </p>

        <ul className={styles.interrupteurs}>
          {THEMES.map((theme) => (
            <li key={theme.valeur} className={styles.interrupteur}>
              <input
                type="radio"
                id={`theme-${theme.valeur}`}
                name="theme"
                value={theme.valeur}
                defaultChecked={theme.valeur === applique}
                className={styles.caseACocher}
                aria-describedby={`theme-${theme.valeur}-aide`}
              />
              <div>
                <label
                  htmlFor={`theme-${theme.valeur}`}
                  className={styles.libelleCase}
                >
                  {theme.libelle}
                </label>
                <p
                  id={`theme-${theme.valeur}-aide`}
                  className={`${styles.aide} ${styles.descriptionTheme}`}
                >
                  {theme.description}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className={styles.aide}>
          Aperçu avant d&apos;appliquer, réservé à votre session :{" "}
          <Link
            href="/?apercu-theme=NOEL"
            className={styles.lienApercu}
            prefetch={false}
          >
            l&apos;accueil
          </Link>{" "}
          et{" "}
          <Link
            href="/catalogue?apercu-theme=NOEL"
            className={styles.lienApercu}
            prefetch={false}
          >
            le catalogue
          </Link>{" "}
          en thème de Noël.
        </p>
      </fieldset>

      <p role="status" className={styles.sortie}>
        {enCours ? "Application du thème…" : messageDe(resultat)}
      </p>

      <button type="submit" className={styles.bouton} disabled={enCours}>
        Appliquer ce thème
      </button>
    </form>
  );
}
