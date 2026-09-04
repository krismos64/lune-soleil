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
 * En colonne, les onze rubriques sont toutes visibles d'un coup sur un ecran de
 * bureau.
 *
 * SOUS 768 px LA COLONNE SERAIT UN MUR. Une barre laterale permanente est un
 * motif de BUREAU, et le prototype ne montre jamais le cas mobile. Onze
 * rubriques empilees mangeraient l'ecran entier avant le contenu, ce qui est
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
import { useId, useState } from "react";

import styles from "./navigation-administration.module.css";

/**
 * Ce qu'une rubrique de la barre porte.
 *
 * `compteur` EST UNE CLE, PAS UN NOMBRE. Le composant ne recoit jamais « 4 » en
 * dur : il recoit le nom du comptage a lire dans l'objet que le layout lui
 * passe. C'est ce qui tient le critere 2 de la story, « leur nombre vient des
 * donnees, jamais d'une valeur ecrite en dur » : aucune valeur numerique ne
 * peut s'ecrire dans ce fichier sans casser le type.
 */
export type Rubrique = {
  chemin: string;
  libelle: string;
  compteur?: keyof Comptages;
};

/** Les comptages que la barre sait afficher, sous-ensemble de ceux du service. */
export type Comptages = {
  commandesEnCours: number;
  variantesStockFaible: number;
  expeditionsEnTransit: number;
  messagesNonLus: number;
  retractationsEnCours: number;
};

/**
 * Les rubriques LIVREES, dans l'ordre du travail quotidien.
 *
 * L'ORDRE SUIT LA JOURNEE DE L'EXPLOITANTE : ce qui arrive en premier est ce
 * qu'elle regarde en premier. Les commandes payees ouvrent la liste, les
 * expeditions suivent parce qu'elles en decoulent, les messages viennent
 * ensuite. Le catalogue et les stocks sont du travail de fond, le journal des
 * connexions une verification occasionnelle.
 *
 * QUATRE ROUTES SONT DELIBEREMENT ABSENTES, et le controle le sait :
 *
 *   /administration/connexion             on n'y est pas connecte
 *   /administration/reauthentification    on y arrive par une action, jamais par choix
 *   /administration/commandes/[id]        et /produits/[id], ecrans de detail
 *
 * Un ecran de detail n'a pas de place dans une navigation : son URL contient un
 * identifiant, et il s'atteint depuis sa liste.
 *
 * `/administration/produits/nouveau` RESTE UNE RUBRIQUE bien que le prototype
 * en fasse un bouton d'action. La raison est le controle d'atteignabilite : la
 * route existe, et toute route doit etre navigable ou exclue en disant
 * pourquoi. La transformer en bouton demanderait un ecran « Catalogue » qui le
 * porte, ce que LS-87 livrera.
 */
export const RUBRIQUES: readonly Rubrique[] = [
  { chemin: "/administration", libelle: "Tableau de bord" },
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
  {
    chemin: "/administration/retractations",
    libelle: "Rétractations",
    compteur: "retractationsEnCours",
  },
  {
    chemin: "/administration/messages",
    libelle: "Messages",
    compteur: "messagesNonLus",
  },
  { chemin: "/administration/produits/nouveau", libelle: "Nouveau produit" },
  { chemin: "/administration/categories", libelle: "Catégories" },
  {
    chemin: "/administration/stocks",
    libelle: "Stocks et marchés",
    compteur: "variantesStockFaible",
  },
  { chemin: "/administration/journal-connexions", libelle: "Connexions" },
] as const;

/**
 * Les rubriques du prototype QUE LE CODE NE PORTE PAS ENCORE.
 *
 * ARBITRAGE DE CHRISTOPHE, 4 septembre 2026 : les montrer inertes plutot que
 * les cacher. La barre annonce alors la structure complete de l'outil, et
 * l'exploitante sait ou chaque fonction se trouvera au lieu de la chercher.
 *
 * ELLES NE SONT PAS DES LIENS, et c'est la seule chose qui compte pour la
 * correction. Un `<span>` sans `href` ne peut pas rendre un 404, ne prend pas
 * le focus au clavier et n'est pas annonce comme un lien par un lecteur
 * d'ecran. Le controle `verifier-navigation-administration.sh` les lit dans un
 * tableau SEPARE, ce qui l'empeche de les confondre avec des rubriques
 * navigables : une entree qui passerait de cette liste a l'autre sans que sa
 * route existe ferait echouer le sens 1.
 *
 * LE TICKET QUI LIVRERA CHACUNE EST ECRIT, pour que cette liste ne devienne pas
 * un cimetiere : une entree sans ticket n'a rien a faire ici.
 *
 * TROIS D'ENTRE ELLES N'ONT AUCUN TICKET, constate dans Jira le 4 septembre
 * 2026 et non suppose : Catalogue, Factures et avoirs, et Clients. Le METIER
 * existe pourtant, LS-126, LS-128 et LS-129 ayant livre factures et avoirs, et
 * LS-95 la suppression de compte : ce sont les ECRANS d'administration qui
 * manquent, personne ne pouvant aujourd'hui lister une facture ni un client.
 * LS-182 porte ce constat, cree en livrant cette story.
 *
 * NE PAS INVENTER DE CLE ICI POUR COMBLER LA COLONNE. Un renvoi vers un ticket
 * qui porte autre chose est pire qu'un « sans ticket » : trois des six clefs
 * ecrites de memoire en premiere intention designaient des stories closes ou
 * hors sujet, et c'est la verification dans Jira qui l'a montre.
 */
export const RUBRIQUES_A_VENIR = [
  { libelle: "Statistiques", ticket: "LS-64" },
  { libelle: "Catalogue", ticket: "LS-182" },
  { libelle: "Factures et avoirs", ticket: "LS-182" },
  { libelle: "Clients", ticket: "LS-182" },
  { libelle: "Avis", ticket: "LS-61" },
  { libelle: "Paramètres", ticket: "LS-98" },
] as const;

/**
 * L'ecran courant, deduit du chemin.
 *
 * LA COMPARAISON N'EST PAS UNE EGALITE STRICTE. `/administration/commandes/abc`
 * est le detail d'une commande : la rubrique « Commandes » doit s'y marquer
 * courante, sans quoi l'exploitante perd son reperage des qu'elle ouvre un
 * detail. Le prefixe suivi d'une barre est ce qui distingue un enfant reel
 * d'un homonyme, `/administration/commandes-archivees` n'etant pas un enfant
 * de `/administration/commandes`.
 *
 * `/administration` EST LE CAS PARTICULIER, ajoute par LS-181 qui en fait une
 * rubrique. Tout chemin de l'administration commence par lui : la regle du
 * prefixe le marquerait courant sur TOUS les ecrans. Le tableau de bord se
 * reconnait donc a l'egalite stricte, et lui seul.
 */
export function estRubriqueCourante(chemin: string, rubrique: string): boolean {
  if (rubrique === "/administration") {
    return chemin === rubrique;
  }

  return chemin === rubrique || chemin.startsWith(`${rubrique}/`);
}

/** Les initiales affichees en pied de barre, deux lettres au plus. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);

  if (mots.length === 0) {
    return "?";
  }

  return mots
    .slice(0, 2)
    .map((mot) => mot[0]?.toUpperCase() ?? "")
    .join("");
}

export function NavigationAdministration({
  comptages,
  nom,
  deconnexion,
}: {
  comptages: Comptages;
  nom: string;
  /** Rendu par le layout : la deconnexion est une action serveur, pas un lien. */
  deconnexion: React.ReactNode;
}) {
  const chemin = usePathname();
  const [ouverte, setOuverte] = useState(false);
  const identifiantPanneau = useId();

  return (
    <>
      {/*
       * LE BOUTON D'OUVERTURE N'EXISTE QUE SOUS 768 px, masque en CSS au-dela.
       * Il est rendu dans les deux cas plutot que conditionne en JavaScript :
       * une largeur lue au rendu serait fausse au premier affichage et
       * provoquerait un saut visible, et `window` n'existe pas au rendu serveur.
       */}
      <button
        type="button"
        className={styles.bascule}
        aria-expanded={ouverte}
        aria-controls={identifiantPanneau}
        onClick={() => setOuverte((etat) => !etat)}
      >
        <span className={styles.basculeIcone} aria-hidden="true">
          {ouverte ? "✕" : "☰"}
        </span>
        {ouverte ? "Fermer le menu" : "Menu"}
      </button>

      <nav
        id={identifiantPanneau}
        className={`${styles.barre} ${ouverte ? styles.barreOuverte : ""}`}
        aria-label="Sections de l'administration"
      >
        <div className={styles.enseigne}>
          <span className={styles.enseigneNom}>Lune &amp; Soleil</span>
          <span className={styles.enseigneRole}>Administration</span>
        </div>

        <ul className={styles.liste}>
          {RUBRIQUES.map((rubrique) => {
            const courante = estRubriqueCourante(chemin, rubrique.chemin);
            const valeur = rubrique.compteur
              ? comptages[rubrique.compteur]
              : undefined;

            return (
              <li key={rubrique.chemin}>
                <Link
                  href={rubrique.chemin}
                  className={styles.lien}
                  /*
                   * `aria-current="page"` PORTE L'INFORMATION, la couleur et le
                   * filet vertical ne font que l'appuyer : `frontend-design.md`
                   * interdit qu'une information passe par la seule couleur.
                   */
                  aria-current={courante ? "page" : undefined}
                  onClick={() => setOuverte(false)}
                >
                  <span className={styles.lienLibelle}>{rubrique.libelle}</span>

                  {/*
                   * UNE PASTILLE A ZERO NE S'AFFICHE PAS. « 0 messages » n'est
                   * pas une information, c'est du bruit sur onze lignes : la
                   * pastille doit vouloir dire « il y a quelque chose ici ».
                   *
                   * LE NOMBRE EST DOUBLE D'UN TEXTE POUR LES LECTEURS D'ECRAN.
                   * Lu seul, « Commandes 4 » est ambigu : quatre quoi ? Le
                   * `aria-hidden` sur le chiffre et le texte masque a cote
                   * donnent « Commandes, 4 en attente » a l'oreille, sans
                   * changer ce que l'oeil voit.
                   */}
                  {valeur !== undefined && valeur > 0 ? (
                    <>
                      <span className={styles.pastille} aria-hidden="true">
                        {valeur}
                      </span>
                      {/*
                       * L'ESPACE AVANT LA VIRGULE EST INDISPENSABLE, et il a
                       * ete trouve par le test clavier : sans lui le nom
                       * accessible vaut « Commandes3, 3 en attente », le
                       * chiffre colle au libelle. Les noeuds de texte JSX se
                       * concatenent sans separateur, et `aria-hidden` retire
                       * l'element de l'arbre SANS ajouter de frontiere de mot.
                       *
                       * Une virgule seule ne suffit pas : c'est le « 3 » de la
                       * pastille, pourtant masque, qui colle au libelle dans
                       * le calcul du nom accessible.
                       */}
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

        {/*
         * LES RUBRIQUES A VENIR, hors de la liste navigable.
         *
         * Elles vivent dans un `<ul>` distinct sous un titre qui dit leur etat,
         * plutot que grisees au milieu des autres : melangees, elles feraient
         * onze cibles dont quatre repondent par rien, et l'exploitante
         * cliquerait avant de comprendre. Separees et annoncees, elles se
         * lisent comme ce qu'elles sont, une feuille de route.
         */}
        <div className={styles.aVenir}>
          <h2 className={styles.aVenirTitre}>Bientôt disponible</h2>
          <ul className={styles.aVenirListe}>
            {RUBRIQUES_A_VENIR.map((rubrique) => (
              <li key={rubrique.libelle} className={styles.aVenirEntree}>
                {rubrique.libelle}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.identite}>
          <span className={styles.identiteInitiales} aria-hidden="true">
            {initiales(nom)}
          </span>
          <span className={styles.identiteTextes}>
            <span className={styles.identiteNom}>{nom}</span>
            <span className={styles.identiteRole}>Administratrice</span>
          </span>
          {deconnexion}
        </div>
      </nav>
    </>
  );
}
