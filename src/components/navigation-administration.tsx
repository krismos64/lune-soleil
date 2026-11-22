"use client";

/**
 * Navigation de l'administration, LS-162 puis LS-181.
 *
 * LE DEFAUT QUE LS-162 A FERME. Aucun ecran d'administration ne renvoyait vers
 * un autre : l'exploitante devait connaitre et saisir sept URL par coeur. Sur
 * smartphone, ou `frontend-design.md` fixe la cible « creer un produit complet
 * en moins de trois minutes », c'etait le premier obstacle avant meme
 * d'atteindre l'ecran.
 *
 * PERSONNE NE L'AVAIT VU parce que les tests de bout en bout appellent
 * `page.goto()` avec l'URL en dur : ils ne passent jamais par une navigation
 * reelle, donc l'absence de menu ne faisait rougir aucune assertion. Motif
 * « un defaut absent n'est pas un defaut empeche ».
 *
 * CE QUE LS-181 CHANGE, ET POURQUOI. La barre etait HORIZONTALE et defilait a
 * 320 px ; le prototype la veut LATERALE. Ce n'est pas qu'une affaire de gout :
 * une barre horizontale a defilement cache ses dernieres rubriques hors ecran
 * sans que rien ne le signale, defaut que LS-144 porte deja pour les filtres.
 * En colonne, les entrees, liens et rubriques a venir confondus, sont
 * toutes visibles d'un coup sur un ecran de bureau.
 *
 * SEPT RUBRIQUES ET LEURS ONGLETS, refonte de l'administration du 22 novembre
 * 2026 : seize entrées en cinq groupes demandaient de connaître la structure
 * pour trouver un écran. Chaque rubrique regroupe ses écrans en onglets,
 * `OngletsRubrique`, et TOUTES les adresses restent valides : un onglet est un
 * lien vers l'écran qui existait déjà. Le titre de chaque écran ne change pas.
 *
 * SOUS 768 px LA COLONNE SERAIT UN MUR. Une barre laterale permanente est un
 * motif de BUREAU, et le prototype ne montre jamais le cas mobile. Quinze
 * entrees empilees mangeraient l'ecran entier avant le contenu, ce qui est
 * exactement le defaut d'origine sous une autre forme. Elle se replie donc dans
 * un panneau que l'on ouvre, et le CSS porte le detail de ce choix.
 *
 * COMPOSANT CLIENT, ET C'EST IMPOSE PAR NEXT.JS, verifie via Context7 : UN
 * LAYOUT NE SE RE-REND PAS A LA NAVIGATION. Un chemin lu cote serveur et passe
 * en props resterait donc fige sur la premiere page ouverte, et le marqueur
 * d'ecran courant designerait la mauvaise rubrique apres chaque clic. Seul
 * `usePathname`, qui se re-rend, donne le chemin reel.
 *
 * LES COMPTAGES ARRIVENT EN PROPS, LUS PAR LE LAYOUT COTE SERVEUR. Ils ne sont
 * PAS lus ici : ce composant ne doit toucher ni la base ni une route d'API, et
 * une pastille n'est pas une raison d'ouvrir une frontiere de donnees dans du
 * code client. Ils changent a chaque navigation, donc le layout les relit a
 * chaque rendu de page.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";

import { IconeAdministration, type NomIcone } from "./icones-administration";
import styles from "./navigation-administration.module.css";
import { NOM_BOUTIQUE } from "@/lib/seo";
import { initialesClient } from "@/lib/nom-affiche";

/**
 * Les comptages que le layout lit côté serveur. Une pastille n'apparaît que si
 * son nombre dépasse zéro.
 */
export type Comptages = {
  commandesEnCours: number;
  variantesStockFaible: number;
  expeditionsEnTransit: number;
  messagesNonLus: number;
  retractationsEnCours: number;
  avisAModerer: number;
  alertesOuvertes: number;
};

/**
 * Un écran de la rubrique, affiché en onglet.
 *
 * `compteur` EST UNE CLÉ, PAS UN NOMBRE : le composant lit le comptage dans
 * l'objet que le layout lui passe, jamais une valeur écrite ici.
 */
export type Onglet = {
  chemin: string;
  libelle: string;
  compteur?: keyof Comptages;
};

/**
 * La couleur de la rubrique, posée sur l'écran par `data-famille` et lue par le
 * layout. Chaque clé y a son jeton, `--ls-famille-*`.
 */
export type CleRubrique =
  | "accueil"
  | "commandes"
  | "retours"
  | "catalogue"
  | "clients"
  | "statistiques"
  | "reglages";

/**
 * Une rubrique de la barre. Son lien mène à son PREMIER onglet ; elle est
 * courante dès que l'écran ouvert appartient à l'un de ses onglets.
 */
export type Rubrique = {
  cle: CleRubrique;
  libelle: string;
  /** Icône décorative, le libellé la nomme. */
  icone: NomIcone;
  /** Ce que la rubrique contient, pour la palette « Aller à ». */
  precision: string;
  onglets: readonly Onglet[];
};

/**
 * LES SEPT RUBRIQUES, ET TOUS LES ÉCRANS LIVRÉS PAR LEURS ONGLETS.
 * `scripts/verifier-navigation-administration.sh` confronte chaque `chemin`
 * aux routes du dépôt dans les deux sens : un écran ajouté entre ici.
 *
 * LE PASSKEY S'APPELLE « APPAREILS DE CONNEXION » dans la barre : le mot
 * anglais ne disait rien à l'exploitante. L'écran garde son titre.
 */
export const RUBRIQUES: readonly Rubrique[] = [
  {
    cle: "accueil",
    libelle: "Accueil",
    icone: "bord",
    precision: "Ce qui vous attend aujourd'hui",
    onglets: [
      { chemin: "/administration", libelle: "Aujourd'hui" },
      {
        chemin: "/administration/alertes",
        libelle: "Alertes",
        compteur: "alertesOuvertes",
      },
    ],
  },
  {
    cle: "commandes",
    libelle: "Commandes",
    icone: "commandes",
    precision: "Préparer et expédier",
    onglets: [
      {
        chemin: "/administration/commandes",
        libelle: "Commandes",
        compteur: "commandesEnCours",
      },
      {
        chemin: "/administration/expeditions",
        libelle: "Expéditions",
        compteur: "expeditionsEnTransit",
      },
    ],
  },
  {
    cle: "retours",
    libelle: "Retours et factures",
    icone: "retractations",
    precision: "Rétractations, remboursements, factures",
    onglets: [
      {
        chemin: "/administration/retractations",
        libelle: "Retours",
        compteur: "retractationsEnCours",
      },
      { chemin: "/administration/factures", libelle: "Factures et avoirs" },
    ],
  },
  {
    cle: "catalogue",
    libelle: "Catalogue",
    icone: "produits",
    precision: "Produits, catégories, stock et marchés",
    onglets: [
      { chemin: "/administration/produits", libelle: "Produits" },
      { chemin: "/administration/categories", libelle: "Catégories" },
      {
        chemin: "/administration/stocks",
        libelle: "Stock et marchés",
        compteur: "variantesStockFaible",
      },
    ],
  },
  {
    cle: "clients",
    libelle: "Clients et avis",
    icone: "messages",
    precision: "Messages, avis et comptes",
    onglets: [
      {
        chemin: "/administration/messages",
        libelle: "Messages",
        compteur: "messagesNonLus",
      },
      {
        chemin: "/administration/avis",
        libelle: "Avis",
        compteur: "avisAModerer",
      },
      { chemin: "/administration/clients", libelle: "Comptes clients" },
    ],
  },
  {
    cle: "statistiques",
    libelle: "Statistiques",
    icone: "statistiques",
    precision: "Ventes et encaissements",
    onglets: [
      { chemin: "/administration/statistiques", libelle: "Statistiques" },
    ],
  },
  {
    cle: "reglages",
    libelle: "Réglages",
    icone: "parametres",
    precision: "Livraison, ambiance, promotion, sécurité",
    onglets: [
      { chemin: "/administration/parametres", libelle: "Paramètres" },
      {
        chemin: "/administration/passkeys",
        libelle: "Appareils de connexion",
      },
      {
        chemin: "/administration/journal-connexions",
        libelle: "Connexions",
      },
    ],
  },
] as const;

/**
 * Les rubriques annoncées et non livrées. VIDE depuis LS-98 : le contrôle de
 * navigation interdit qu'une entrée y porte un chemin.
 */
export const RUBRIQUES_A_VENIR: readonly {
  libelle: string;
  ticket: string;
}[] = [
  /*
   * VIDE DEPUIS LS-98. Une entrée ajoutée ici n'a pas de `chemin` : le contrôle
   * de navigation le refuse, un écran non livré ne se lie pas. Ce commentaire
   * garde aussi la liste sur plusieurs lignes, forme que le contrôle lit.
   */
] as const;

/**
 * `true` si `chemin` est l'écran `ecran` ou l'un de ses détails.
 *
 * L'ACCUEIL SE COMPARE À L'ÉGALITÉ : tout chemin de l'administration commence
 * par `/administration`, et un préfixe le marquerait courant partout.
 */
export function estRubriqueCourante(chemin: string, ecran: string): boolean {
  if (ecran === "/administration") {
    return chemin === ecran;
  }

  return chemin === ecran || chemin.startsWith(`${ecran}/`);
}

/** La rubrique de l'écran ouvert, ou `undefined` hors de la table. */
export function rubriqueDe(chemin: string): Rubrique | undefined {
  return RUBRIQUES.find((rubrique) =>
    rubrique.onglets.some((onglet) =>
      estRubriqueCourante(chemin, onglet.chemin),
    ),
  );
}

/** La somme des comptages des onglets, pastille de la rubrique. */
export function compteRubrique(
  rubrique: Rubrique,
  comptages: Comptages,
): number {
  return rubrique.onglets.reduce(
    (total, onglet) =>
      total + (onglet.compteur ? comptages[onglet.compteur] : 0),
    0,
  );
}

export function NavigationAdministration({
  comptages,
  nom,
  deconnexion,
}: {
  comptages: Comptages;
  nom: string;
  deconnexion: React.ReactNode;
}) {
  const chemin = usePathname();
  const [ouverte, setOuverte] = useState(false);
  const identifiantPanneau = useId();
  const bascule = useRef<HTMLButtonElement>(null);
  const courante = rubriqueDe(chemin);

  function fermer() {
    setOuverte(false);
    bascule.current?.focus();
  }

  return (
    <div
      className={styles.enveloppe}
      onKeyDown={(evenement) => {
        if (evenement.key === "Escape" && ouverte) {
          fermer();
        }
      }}
    >
      {/*
       * LA BASCULE N'EXISTE QU'EN DESSOUS DE 768 px, le CSS la masque au-delà.
       * `aria-expanded` dit l'état, `aria-controls` désigne le panneau.
       */}
      <button
        ref={bascule}
        type="button"
        className={styles.bascule}
        aria-expanded={ouverte}
        aria-controls={identifiantPanneau}
        onClick={() => setOuverte((etat) => !etat)}
      >
        <IconeAdministration
          nom={ouverte ? "fermer" : "menu"}
          className={styles.basculeIcone}
        />
        {ouverte ? "Fermer le menu" : "Menu"}
      </button>

      <nav
        id={identifiantPanneau}
        className={`${styles.barre} ${ouverte ? styles.barreOuverte : ""}`}
        aria-label="Sections de l'administration"
      >
        <div className={styles.enseigne}>
          {/* La lune et le soleil de la marque, en trait : décor seul. */}
          <svg
            className={styles.enseigneMarque}
            viewBox="0 0 40 40"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className={styles.marqueLune}
              d="M17 6C9 6 4 12.5 5 20c1 7 7.5 11.5 14.5 9.5C13 29 9 24.5 9.5 18.5 10 12.5 13 8.5 17 6Z"
            />
            <circle className={styles.marqueSoleil} cx="25" cy="17" r="5.5" />
            <path
              className={styles.marqueRayons}
              d="M25 7.5v2M25 24.5v2M15.5 17h2M32.5 17h2M18.3 10.3l1.4 1.4M30.3 22.3l1.4 1.4M31.7 10.3l-1.4 1.4M19.7 22.3l-1.4 1.4"
            />
          </svg>
          <span className={styles.enseigneTextes}>
            <span className={styles.enseigneNom}>{NOM_BOUTIQUE}</span>
            <span className={styles.enseigneRole}>Administration</span>
          </span>
        </div>

        <ul className={styles.liste}>
          {RUBRIQUES.map((rubrique) => {
            const valeur = compteRubrique(rubrique, comptages);

            return (
              <li key={rubrique.cle}>
                <Link
                  href={rubrique.onglets[0]?.chemin ?? "/administration"}
                  className={styles.lien}
                  data-famille={rubrique.cle}
                  prefetch={false}
                  aria-current={courante === rubrique ? "page" : undefined}
                  onClick={fermer}
                >
                  <span className={styles.lienPuce} aria-hidden="true">
                    <IconeAdministration
                      nom={rubrique.icone}
                      className={styles.lienIcone}
                    />
                  </span>
                  <span className={styles.lienLibelle}>{rubrique.libelle}</span>

                  {/*
                   * LE NOMBRE EST VISIBLE ET DIT EN CLAIR : la pastille seule
                   * serait lue « Commandes 4 », sans dire ce que compte 4.
                   */}
                  {valeur > 0 ? (
                    <>
                      <span className={styles.pastille} aria-hidden="true">
                        {valeur}
                      </span>
                      <span className={styles.invisible}>
                        {" "}
                        ({valeur} en attente)
                      </span>
                    </>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={styles.identite}>
          <span className={styles.identiteInitiales} aria-hidden="true">
            {initialesClient(nom)}
          </span>
          <span className={styles.identiteTextes}>
            <span className={styles.identiteNom}>{nom}</span>
            <span className={styles.identiteRole}>Administratrice</span>
          </span>
          {deconnexion}
        </div>
      </nav>
    </div>
  );
}
