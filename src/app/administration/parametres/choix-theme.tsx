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
import { useActionState, useEffect, useRef, useState } from "react";

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
        libelle: "Noël discret",
        repere: "décembre",
        description:
          "Fond blanc neige et accents rouges : boules suspendues, neige, rubans et papier cadeau. Textes et boutons gardent leurs couleurs.",
      },
      {
        valeur: "NOEL_2",
        libelle: "Noël festif",
        repere: "décembre",
        description:
          "Bandeaux rouges à texte blanc, cartes encadrées de rouge, mêmes décors que Noël discret.",
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
        description: `Bleu de nuit et rouge : étiquettes et flocons. À activer avec la promotion, pendant les soldes seulement. ${AVEC_PROMOTION}`,
      },
      {
        valeur: "SOLDES_ETE",
        libelle: "Soldes d'été",
        repere: "dates légales des soldes d'été",
        description: `Rouge soleil et lagon : étiquettes et soleils. À activer avec la promotion, pendant les soldes seulement. ${AVEC_PROMOTION}`,
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
        : `Thème appliqué à l'accueil et au catalogue : ${LIBELLES_THEMES[resultat.theme]}.`;
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
  onApercu,
}: {
  choix: Choix;
  applique: ThemeSaisonnier;
  onApercu: (choix: Choix) => void;
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
            <span className={styles.repereTheme}>
              {majuscule(choix.repere)}.{" "}
            </span>
          )}
          {choix.description}
        </p>
        {choix.valeur === "AUCUN" ? null : (
          <button
            type="button"
            className={styles.boutonApercu}
            onClick={() => onApercu(choix)}
            aria-label={`Aperçu de ${choix.libelle}`}
          >
            Aperçu
          </button>
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
  const formulaire = useRef<HTMLFormElement>(null);
  const [apercu, setApercu] = useState<Choix | null>(null);

  return (
    <form
      ref={formulaire}
      action={action}
      className={styles.formulaire}
      id="theme-saisonnier"
      tabIndex={-1}
    >
      <fieldset className={styles.groupe} aria-describedby="theme-actif">
        <legend className={styles.legende}>Thème saisonnier</legend>
        <p id="theme-actif" className={styles.aide}>
          Ambiance actuelle : <strong>{LIBELLES_THEMES[applique]}</strong>. Elle
          habille l&apos;accueil et le catalogue.
        </p>

        <ul className={styles.themes}>
          <CarteTheme
            choix={SANS_THEME}
            applique={applique}
            onApercu={setApercu}
          />
        </ul>

        {FAMILLES.map((famille, rang) => (
          <div key={famille.titre} className={styles.famille}>
            <h3 id={`famille-theme-${rang}`} className={styles.titreFamille}>
              {famille.titre}
            </h3>
            <ul
              className={styles.themes}
              aria-labelledby={`famille-theme-${rang}`}
            >
              {famille.themes.map((choix) => (
                <CarteTheme
                  key={choix.valeur}
                  choix={choix}
                  applique={applique}
                  onApercu={setApercu}
                />
              ))}
            </ul>
          </div>
        ))}

        <p className={styles.aide}>
          Les aperçus ne sont visibles que par vous : ils ne changent rien pour
          les visiteurs tant que l&apos;ambiance n&apos;est pas appliquée.
        </p>
      </fieldset>

      <ApercuTheme
        choix={apercu}
        onFermer={() => setApercu(null)}
        onAppliquer={(valeur) => {
          const caseTheme = formulaire.current?.querySelector<HTMLInputElement>(
            `input[name="theme"][value="${valeur}"]`,
          );
          if (caseTheme) caseTheme.checked = true;
          formulaire.current?.requestSubmit();
        }}
      />

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

/**
 * L'APERÇU D'UNE AMBIANCE SANS QUITTER L'ÉCRAN, refonte du 22 novembre 2026 :
 * la vraie page d'accueil ou du catalogue, habillée de l'ambiance, dans une
 * fenêtre. Avant, chaque aperçu ouvrait la boutique à la place des Réglages,
 * et comparer trois ambiances demandait trois allers et retours.
 *
 * L'IFRAME EST ADMISE PAR `frame-ancestors 'self'`, ADR-038 amendé : seul le
 * site lui-même peut s'encadrer. L'aperçu reste réservé à la session de
 * l'administratrice, `themeDeLaPage` l'ignorant pour tout autre visiteur.
 *
 * `<dialog>` NATIF, ouvert par `showModal()` : le focus y entre, Échap le
 * ferme et le rend au bouton qui l'a ouvert, sans code d'accessibilité écrit à
 * la main. « Appliquer » coche l'ambiance et soumet le formulaire de l'écran,
 * la même action que le bouton du bas.
 */
function ApercuTheme({
  choix,
  onFermer,
  onAppliquer,
}: {
  choix: Choix | null;
  onFermer: () => void;
  onAppliquer: (valeur: ThemeSaisonnier) => void;
}) {
  const fenetre = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState<"accueil" | "catalogue">("accueil");
  const [format, setFormat] = useState<"bureau" | "mobile">("bureau");

  useEffect(() => {
    const element = fenetre.current;
    if (element === null) return;
    if (choix !== null && !element.open) element.showModal();
    if (choix === null && element.open) element.close();
  }, [choix]);

  const chemin =
    choix === null
      ? ""
      : `${page === "accueil" ? "/" : "/catalogue"}?apercu-theme=${choix.valeur}`;

  return (
    <dialog
      ref={fenetre}
      className={styles.fenetreApercu}
      aria-labelledby="titre-apercu"
      onClose={onFermer}
    >
      {choix === null ? null : (
        <div className={styles.corpsApercu}>
          <div className={styles.enteteApercu}>
            <h3 id="titre-apercu" className={styles.titreApercu}>
              Aperçu : {choix.libelle}
            </h3>
            <button
              type="button"
              className={styles.boutonDiscret}
              onClick={() => fenetre.current?.close()}
            >
              Fermer
            </button>
          </div>

          <div className={styles.reglagesApercu}>
            <div role="group" aria-label="Page montrée">
              {(["accueil", "catalogue"] as const).map((valeur) => (
                <button
                  key={valeur}
                  type="button"
                  className={styles.pastilleChoix}
                  aria-pressed={page === valeur}
                  onClick={() => setPage(valeur)}
                >
                  {valeur === "accueil" ? "Accueil" : "Catalogue"}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Largeur d'écran">
              {(["bureau", "mobile"] as const).map((valeur) => (
                <button
                  key={valeur}
                  type="button"
                  className={styles.pastilleChoix}
                  aria-pressed={format === valeur}
                  onClick={() => setFormat(valeur)}
                >
                  {valeur === "bureau" ? "Ordinateur" : "Mobile"}
                </button>
              ))}
            </div>
          </div>

          <iframe
            key={chemin}
            src={chemin}
            title={`Aperçu de ${choix.libelle}, ${page === "accueil" ? "page d'accueil" : "catalogue"}`}
            className={styles.cadreApercu}
            data-format={format}
          />

          <p className={styles.aide}>
            Cet aperçu n&apos;est visible que par vous. La boutique ne change
            qu&apos;après « Appliquer ».
          </p>

          <div className={styles.actionsApercu}>
            <Link href={chemin} className={styles.lienApercu} prefetch={false}>
              Ouvrir en grand
            </Link>
            <button
              type="button"
              className={styles.bouton}
              onClick={() => {
                onAppliquer(choix.valeur);
                fenetre.current?.close();
              }}
            >
              Appliquer cette ambiance
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
