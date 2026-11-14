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

import { LIBELLES_THEMES, type ThemeSaisonnier } from "@/lib/theme-saisonnier";

import { choisirTheme, type ResultatTheme } from "./actions-theme";
import styles from "./parametres.module.css";

type Choix = {
  valeur: ThemeSaisonnier;
  libelle: string;
  /** Quand l'activer, dit à l'exploitante : repère, jamais affiché au public. */
  repere?: string;
  description: string;
};

const SANS_THEME: Choix = {
  valeur: "AUCUN",
  libelle: "Aucun thème",
  description: "L'habillage ordinaire de la boutique.",
};

/**
 * LES THÈMES RANGÉS PAR FAMILLE, LS-323 : seize choix en une seule liste ne se
 * parcouraient plus. L'ordre des familles suit l'usage, les fêtes de fin
 * d'année en tête. `(%)` de la liste de l'exploitante : ces thèmes portent un
 * bandeau qui reprend la promotion quand elle est active, et la description le
 * dit, sans jamais annoncer de réduction par elle-même.
 */
const AVEC_PROMOTION =
  "Son bandeau reprend le taux et la période de la promotion quand elle est active ; seul, il n'annonce aucune réduction.";

const FAMILLES: readonly { titre: string; themes: readonly Choix[] }[] = [
  {
    titre: "Fêtes de fin d'année",
    themes: [
      {
        valeur: "NOEL_1",
        libelle: "Noël 1 (sobre)",
        repere: "décembre",
        description:
          "Fond blanc neige et accents rouges : boules suspendues, neige, rubans et papier cadeau. Textes et boutons gardent leurs couleurs.",
      },
      {
        valeur: "NOEL_2",
        libelle: "Noël 2 (franc)",
        repere: "décembre",
        description:
          "Bandeaux rouges à texte blanc, cartes encadrées de rouge, mêmes décors que Noël 1.",
      },
      {
        valeur: "NOUVEL_AN",
        libelle: "Nouvel An",
        repere: "début janvier",
        description:
          "Indigo de minuit et or : feux d'artifice et étoiles qui scintillent, ruban « Bonne année ».",
      },
    ],
  },
  {
    titre: "Saisons",
    themes: [
      {
        valeur: "PRINTEMPS",
        libelle: "Printemps",
        repere: "mars à mai",
        description:
          "Vert tendre et rose : fleurs et feuilles qui tombent doucement.",
      },
      {
        valeur: "ETE",
        libelle: "Été",
        repere: "juin à août",
        description: "Corail et lagon : soleils et éclats qui scintillent.",
      },
      {
        valeur: "AUTOMNE",
        libelle: "Automne",
        repere: "septembre à novembre",
        description: "Rouille et lie-de-vin : feuilles qui tombent.",
      },
      {
        valeur: "HIVER",
        libelle: "Hiver",
        repere: "décembre à février, hors Noël",
        description:
          "Bleu glacier et ardoise : cristaux de neige, sans le rouge de Noël.",
      },
    ],
  },
  {
    titre: "Fêtes et journées",
    themes: [
      {
        valeur: "SAINT_VALENTIN",
        libelle: "Saint-Valentin",
        repere: "vers le 14 février",
        description: `Framboise et grenat : cœurs qui s'envolent. ${AVEC_PROMOTION}`,
      },
      {
        valeur: "JOURNEE_FEMMES",
        libelle: "Journée des droits des femmes",
        repere: "8 mars",
        description: `Violet et or : brins de mimosa. ${AVEC_PROMOTION}`,
      },
      {
        valeur: "PAQUES",
        libelle: "Pâques",
        repere: "mars ou avril",
        description:
          "Lilas et vert d'herbe : œufs décorés et fleurs, ruban « Joyeuses Pâques ».",
      },
      {
        valeur: "OCTOBRE_ROSE",
        libelle: "Octobre rose",
        repere: "octobre",
        description: `Rose : rubans et cœurs. Le thème dit le soutien à la sensibilisation, il n'annonce aucun don. ${AVEC_PROMOTION}`,
      },
      {
        valeur: "NOVEMBRE_BLEU",
        libelle: "Novembre bleu",
        repere: "novembre",
        description: `Bleu : rubans et moustaches. Le thème dit le soutien à la sensibilisation, il n'annonce aucun don. ${AVEC_PROMOTION}`,
      },
    ],
  },
  {
    titre: "Opérations commerciales",
    themes: [
      {
        valeur: "SOLDES_HIVER",
        libelle: "Soldes d'hiver",
        repere: "dates légales des soldes d'hiver",
        description: `Bleu de nuit et rouge : étiquettes et flocons. ${AVEC_PROMOTION}`,
      },
      {
        valeur: "SOLDES_ETE",
        libelle: "Soldes d'été",
        repere: "dates légales des soldes d'été",
        description: `Rouge soleil et lagon : étiquettes et soleils. ${AVEC_PROMOTION}`,
      },
      {
        valeur: "BLACK_WEEK",
        libelle: "Black Week",
        repere: "fin novembre",
        description:
          "Bandeaux de nuit, soleil et poussière d'or, boutons d'achat noirs. Le thème n'annonce aucune réduction.",
      },
    ],
  },
];

const majuscule = (texte: string): string =>
  texte.charAt(0).toUpperCase() + texte.slice(1);

function messageDe(resultat: ResultatTheme | null): string {
  switch (resultat?.statut) {
    case undefined:
      return "";
    case "SUCCES":
      return resultat.theme === "AUCUN"
        ? "Habillage ordinaire rétabli sur l'accueil et le catalogue."
        : `${majuscule(LIBELLES_THEMES[resultat.theme])} est appliqué à l'accueil et au catalogue.`;
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

/**
 * Un choix de thème : la case, son nom, quand l'activer, ce qu'il fait, et ses
 * deux aperçus. Les pastilles reprennent les jetons du thème par l'attribut
 * `data-theme`, décor seul ; rien ne s'anime dans l'administration, ADR-045.
 */
function CarteTheme({
  choix,
  applique,
}: {
  choix: Choix;
  applique: ThemeSaisonnier;
}) {
  const id = `theme-${choix.valeur}`;
  return (
    <li className={styles.carteTheme}>
      <input
        type="radio"
        id={id}
        name="theme"
        value={choix.valeur}
        defaultChecked={choix.valeur === applique}
        className={styles.caseACocher}
        aria-describedby={`${id}-aide`}
      />
      <div className={styles.corpsTheme}>
        <label htmlFor={id} className={styles.libelleCase}>
          {choix.valeur === "AUCUN" ? null : (
            <span
              className={styles.pastilles}
              data-theme={choix.valeur.toLowerCase()}
              aria-hidden="true"
            >
              <span className={styles.pastilleUn} />
              <span className={styles.pastilleDeux} />
            </span>
          )}
          {choix.libelle}
        </label>
        <p
          id={`${id}-aide`}
          className={`${styles.aide} ${styles.descriptionTheme}`}
        >
          {choix.repere === undefined ? null : (
            <span className={styles.repereTheme}>{choix.repere}. </span>
          )}
          {choix.description}
        </p>
        {choix.valeur === "AUCUN" ? null : (
          <p className={`${styles.aide} ${styles.descriptionTheme}`}>
            Aperçu :{" "}
            <Link
              href={`/?apercu-theme=${choix.valeur}`}
              className={styles.lienApercu}
              prefetch={false}
              aria-label={`l'accueil, aperçu du thème ${choix.libelle}`}
            >
              l&apos;accueil
            </Link>{" "}
            et{" "}
            <Link
              href={`/catalogue?apercu-theme=${choix.valeur}`}
              className={styles.lienApercu}
              prefetch={false}
              aria-label={`le catalogue, aperçu du thème ${choix.libelle}`}
            >
              le catalogue
            </Link>
          </p>
        )}
      </div>
    </li>
  );
}

export function ChoixTheme({ actif }: { actif: ThemeSaisonnier }) {
  const [resultat, action, enCours] = useActionState<
    ResultatTheme | null,
    FormData
  >(choisirTheme, null);
  const applique = resultat?.statut === "SUCCES" ? resultat.theme : actif;

  return (
    <form
      action={action}
      className={styles.formulaire}
      id="theme-saisonnier"
      tabIndex={-1}
    >
      <fieldset className={styles.groupe} aria-describedby="theme-actif">
        <legend className={styles.legende}>Thème saisonnier</legend>
        <p id="theme-actif" className={styles.aide}>
          Thème actif : <strong>{LIBELLES_THEMES[applique]}</strong>. Un thème
          habille l&apos;accueil et le catalogue seulement, et aucun texte
          n&apos;est à saisir.
        </p>

        <ul className={styles.themes}>
          <CarteTheme choix={SANS_THEME} applique={applique} />
        </ul>

        {FAMILLES.map((famille, rang) => (
          <div key={famille.titre} className={styles.famille}>
            <p id={`famille-theme-${rang}`} className={styles.titreFamille}>
              {famille.titre}
            </p>
            <ul
              className={styles.themes}
              aria-labelledby={`famille-theme-${rang}`}
            >
              {famille.themes.map((choix) => (
                <CarteTheme
                  key={choix.valeur}
                  choix={choix}
                  applique={applique}
                />
              ))}
            </ul>
          </div>
        ))}

        <p className={styles.aide}>
          Les aperçus s&apos;ouvrent pour votre session seulement : ils ne
          changent rien pour les visiteurs tant que le thème n&apos;est pas
          appliqué.
        </p>
      </fieldset>

      <p
        role="status"
        aria-label="État du thème saisonnier"
        className={styles.sortie}
      >
        {enCours ? "Application du thème…" : messageDe(resultat)}
      </p>

      <button type="submit" className={styles.bouton} disabled={enCours}>
        Appliquer ce thème
      </button>
    </form>
  );
}
