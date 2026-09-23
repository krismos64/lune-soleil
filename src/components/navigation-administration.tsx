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

import styles from "./navigation-administration.module.css";
import { NOM_BOUTIQUE } from "@/lib/seo";
import { initialesClient } from "@/lib/nom-affiche";

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
  groupe: CleGroupe;
  compteur?: keyof Comptages;
};

/**
 * Les groupes de la barre, dans l'ordre d'affichage, LS-245.
 *
 * RELEVE PAR L'EXPLOITANTE EN RECETTE, le 23 septembre 2026 : seize entrees en
 * une seule colonne, rangees par l'ordre de sa journee, ne se retrouvaient pas
 * a l'oeil. Categories et Catalogue etaient separees par Factures et Clients.
 * Christophe a delegue l'ordre et demande un regroupement par theme, arrete en
 * commentaire de LS-245.
 *
 * LE TITRE D'UN GROUPE N'EST PAS UN LIEN. C'est un `<p>` qui nomme sa liste par
 * `aria-labelledby`, le motif deja employe pour les rubriques a venir : un
 * lecteur d'ecran annonce « Ventes, liste, 4 elements », et la tabulation ne
 * s'y arrete pas.
 */
export const GROUPES = [
  { cle: "ensemble", titre: "Vue d'ensemble" },
  { cle: "ventes", titre: "Ventes" },
  { cle: "clients", titre: "Relation client" },
  { cle: "catalogue", titre: "Catalogue" },
  { cle: "reglages", titre: "Réglages" },
] as const;

export type CleGroupe = (typeof GROUPES)[number]["cle"];

/** Les comptages que la barre sait afficher, sous-ensemble de ceux du service. */
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
 * Les rubriques LIVREES, rangees par groupe, LS-245.
 *
 * L'ORDRE DES GROUPES VA DU PLUS URGENT AU PLUS RARE. La vue d'ensemble ouvre la
 * barre : les alertes y sont, parce qu'une alerte ouverte signale un incident de
 * paiement, le geste le plus urgent de l'outil. Les ventes suivent, puis ce que
 * les clients ecrivent, puis le catalogue, travail de fond. Les reglages ferment
 * la barre, comme dans le prototype : ils se consultent rarement.
 *
 * DANS UN GROUPE, L'ORDRE SUIT LE FLUX : une commande precede son expedition,
 * une retractation precede son avoir. Les rubriques d'un meme groupe sont
 * CONTIGUES dans ce tableau, et l'ordre de tabulation est celui du tableau.
 *
 * DEUX LIBELLES IDENTIQUES L'UN SOUS L'AUTRE NE DISENT RIEN. « Catalogue » est
 * donc devenu « Produits », titre deja porte par l'ecran atteint, et le groupe
 * des messages, avis et clients s'appelle « Relation client » et non
 * « Clients », defaut releve par `ls-frontend-revue`.
 *
 * LES COMPTEURS NE COMPTENT QUE CE QUI ATTEND UN GESTE. Statistiques n'en porte
 * aucun, un chiffre d'affaires n'attendant rien, LS-64. Les avis en portent un,
 * le delai de publication etant annonce au client, article D111-10 2°, LS-61.
 *
 * QUATRE ROUTES SONT DELIBEREMENT ABSENTES, et le controle le sait :
 *
 *   /administration/connexion             on n'y est pas connecte
 *   /administration/reauthentification    on y arrive par une action, jamais par choix
 *   /administration/produits/nouveau      bouton d'action de l'ecran Produits, LS-183
 *   /administration/commandes/[id]        et /produits/[id], ecrans de detail
 *
 * « VOS PASSKEYS » EST DANS LA BARRE POUR UNE RAISON DE SECURITE, LS-175 :
 * ADR-021 fait de la passkey le chemin principal de l'administration, et un
 * ecran atteignable seulement par son URL ne se retrouve pas le jour ou
 * l'exploitante change de telephone.
 */
export const RUBRIQUES: readonly Rubrique[] = [
  { chemin: "/administration", libelle: "Tableau de bord", groupe: "ensemble" },
  {
    chemin: "/administration/alertes",
    libelle: "Alertes",
    groupe: "ensemble",
    compteur: "alertesOuvertes",
  },
  {
    chemin: "/administration/statistiques",
    libelle: "Statistiques",
    groupe: "ensemble",
  },
  {
    chemin: "/administration/commandes",
    libelle: "Commandes",
    groupe: "ventes",
    compteur: "commandesEnCours",
  },
  {
    chemin: "/administration/expeditions",
    libelle: "Expéditions",
    groupe: "ventes",
    compteur: "expeditionsEnTransit",
  },
  {
    chemin: "/administration/retractations",
    libelle: "Rétractations",
    groupe: "ventes",
    compteur: "retractationsEnCours",
  },
  {
    chemin: "/administration/factures",
    libelle: "Factures et avoirs",
    groupe: "ventes",
  },
  {
    chemin: "/administration/messages",
    libelle: "Messages",
    groupe: "clients",
    compteur: "messagesNonLus",
  },
  {
    chemin: "/administration/avis",
    libelle: "Avis",
    groupe: "clients",
    compteur: "avisAModerer",
  },
  { chemin: "/administration/clients", libelle: "Clients", groupe: "clients" },
  {
    chemin: "/administration/produits",
    libelle: "Produits",
    groupe: "catalogue",
  },
  {
    chemin: "/administration/categories",
    libelle: "Catégories",
    groupe: "catalogue",
  },
  {
    chemin: "/administration/stocks",
    libelle: "Stocks et marchés",
    groupe: "catalogue",
    compteur: "variantesStockFaible",
  },
  {
    chemin: "/administration/parametres",
    libelle: "Paramètres",
    groupe: "reglages",
  },
  {
    chemin: "/administration/passkeys",
    libelle: "Vos passkeys",
    groupe: "reglages",
  },
  {
    chemin: "/administration/journal-connexions",
    libelle: "Connexions",
    groupe: "reglages",
  },
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
 * TROIS D'ENTRE ELLES N'AVAIENT AUCUN TICKET, constate dans Jira le 4 septembre
 * 2026 et non suppose : Catalogue, Factures et avoirs, et Clients. Le METIER
 * existe pourtant, LS-126, LS-128 et LS-129 ayant livre factures et avoirs, et
 * LS-95 la suppression de compte : ce sont les ECRANS d'administration qui
 * manquaient.
 *
 * LS-182 a porte ce constat puis a ete DECOUPEE le meme jour en LS-183, LS-184
 * et LS-185, une par ecran. Les clefs ci-dessous designent donc chacune la
 * story qui livrera SA rubrique, et non le ticket de constat : c'est la forme
 * utile, celle qui repond a « quand cette rubrique arrive-t-elle ».
 *
 * TROIS ENTREES ONT QUITTE CETTE LISTE EN TROIS JOURS, Catalogue avec LS-183,
 * Factures et avoirs avec LS-184, Clients avec LS-185 : une entree y reste tant
 * que son ecran n'existe pas, et pas une minute de plus. Le sens 1 du
 * controle d'atteignabilite le verifie dans l'autre sens, en refusant une
 * rubrique navigable sans route.
 *
 * NE PAS INVENTER DE CLE ICI POUR COMBLER LA COLONNE. Un renvoi vers un ticket
 * qui porte autre chose est pire qu'un « sans ticket » : trois des six clefs
 * ecrites de memoire en premiere intention designaient des stories closes ou
 * hors sujet, et c'est la verification dans Jira qui l'a montre.
 */
export const RUBRIQUES_A_VENIR: readonly {
  libelle: string;
  ticket: string;
}[] = [
  /*
   * ------------------------------------------------------------------
   * CETTE LISTE EST VIDE DEPUIS LE 11 SEPTEMBRE 2026, LS-98, et c'est la fin
   * d'un dispositif plutot que son abandon.
   *
   * « Parametres » a ete la CINQUIEME et derniere entree a la quitter, apres
   * Catalogue avec LS-183, Factures et avoirs avec LS-184, Clients avec LS-185
   * et Avis avec LS-61. Les onze rubriques du prototype existent desormais.
   *
   * L'ARBITRAGE DU 4 SEPTEMBRE 2026 RESTE EN VIGUEUR : une rubrique non livree
   * se montre INERTE plutot que de se cacher, la barre annonçant alors la
   * structure complete de l'outil. Le jour ou une douzieme rubrique est
   * decidee, son entree revient ici en attendant son ecran.
   *
   * UNE ENTREE SE RETIRE, ELLE NE SE COMMENTE PAS. Le test de bout en bout lit
   * les entrees REELLEMENT rendues sous « Bientot disponible » et exige zero
   * lien sur chacune : une rubrique laissee ici tout en devenant un lien fait
   * rougir la suite, ce qui s'est produit avec Avis.
   * ------------------------------------------------------------------
   */
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
  const bascule = useRef<HTMLButtonElement>(null);

  /**
   * Referme le panneau EN RAMENANT LE FOCUS SUR LE BOUTON.
   *
   * LE DEFAUT QUE CETTE FONCTION FERME, trouve par la revue d'interface. Fermer
   * le panneau lui applique `display: none`, ce qui detache du DOM visible
   * l'element qui porte le focus : le focus retombe alors sur `body` et la
   * tabulation suivante repart du HAUT du document. Au clavier, chaque
   * navigation renvoyait donc au debut de la page.
   *
   * Motif « focus sur un element detache », deja en fiche sur ce depot avec
   * `revalidatePath` : la cause differe, le symptome et la parade sont les
   * memes.
   *
   * LE TEST CLAVIER EXISTANT NE LE VOYAIT PAS : il ouvre le panneau puis tabule
   * sans jamais ACTIVER de lien, et c'est l'activation qui declenche le defaut.
   */
  function fermer() {
    setOuverte(false);
    bascule.current?.focus();
  }

  return (
    /*
     * `Escape` REFERME LE PANNEAU, et le gestionnaire vit sur ce conteneur.
     *
     * PAS SUR LE `nav`, ET C'EST UN DEFAUT MESURE. Apres un clic sur le bouton
     * d'ouverture, le focus reste SUR LE BOUTON, qui est hors du `nav` : un
     * gestionnaire pose sur le `nav` ne voit jamais la frappe, l'evenement ne
     * remontant que vers les ANCETRES de l'element focalise. Le test l'a
     * attrape, le panneau restant ouvert.
     *
     * PAS SUR `document` NON PLUS. Un ecouteur global intercepterait `Escape`
     * partout, y compris dans un futur dialogue de l'administration qui devrait
     * le recevoir en premier. Ce conteneur englobe le bouton et le panneau,
     * exactement la portee voulue.
     */
    <div
      className={styles.enveloppe}
      onKeyDown={(evenement) => {
        if (evenement.key === "Escape" && ouverte) {
          fermer();
        }
      }}
    >
      {/*
       * LE BOUTON D'OUVERTURE N'EXISTE QUE SOUS 768 px, masque en CSS au-dela.
       * Il est rendu dans les deux cas plutot que conditionne en JavaScript :
       * une largeur lue au rendu serait fausse au premier affichage et
       * provoquerait un saut visible, et `window` n'existe pas au rendu serveur.
       */}
      <button
        ref={bascule}
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
          <span className={styles.enseigneNom}>{NOM_BOUTIQUE}</span>
          <span className={styles.enseigneRole}>Administration</span>
        </div>

        {/*
         * UN GROUPE, UNE LISTE NOMMEE, LS-245. Le filtre relit `RUBRIQUES` a
         * chaque groupe : seize entrees, le cout est nul, et le tableau plat
         * reste la seule source que lisent le controle d'atteignabilite et ses
         * mutations.
         */}
        {GROUPES.map((groupe) => (
          <div key={groupe.cle} className={styles.groupe}>
            <p
              id={`${identifiantPanneau}-${groupe.cle}`}
              className={styles.groupeTitre}
            >
              {groupe.titre}
            </p>
            <ul
              className={styles.liste}
              aria-labelledby={`${identifiantPanneau}-${groupe.cle}`}
            >
              {RUBRIQUES.filter(
                (rubrique) => rubrique.groupe === groupe.cle,
              ).map((rubrique) => {
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
                       * ------------------------------------------------------------
                       * AUCUN PRECHARGEMENT, LS-166, ET C'EST UNE BOUCLE QU'IL FERME.
                       *
                       * LES ONZE RUBRIQUES SONT TOUTES `force-dynamic`, et
                       * `staleTimes.dynamic` vaut ZERO par defaut, verifie via
                       * Context7 : une reponse prechargee est donc perimee a
                       * l'instant ou elle arrive. Next.js la jette et repart, sans
                       * fin, tant que la barre est a l'ecran.
                       *
                       * MESURE DU 7 SEPTEMBRE 2026, journal du navigateur sur le
                       * tableau de bord : chaque rubrique enchaine `200` puis
                       * `ERR_ABORTED` puis une requete neuve, avec un jeton `_rsc`
                       * different a chaque tour. Onze rendus serveur en boucle,
                       * chacun interrogeant PostgreSQL, pour un ecran au repos.
                       *
                       * CE QUE CELA CASSAIT. La navigation reelle entre en
                       * concurrence avec ce deluge et perd parfois la course : l'URL
                       * change, le `<main>` n'arrive JAMAIS. Mesure : bloque encore
                       * apres 61 secondes, deux essais sur quatre. Ni la page ni son
                       * `loading.tsx` ne sont rendus, la personne reste devant une
                       * coquille vide.
                       *
                       * ON NE PERD AUCUNE VITESSE : avec `staleTimes.dynamic` a
                       * zero, ce prechargement ne servait deja aucune navigation, il
                       * ne faisait que reserver le serveur.
                       * ------------------------------------------------------------
                       */
                      prefetch={false}
                      /*
                       * `aria-current="page"` PORTE L'INFORMATION, la couleur et le
                       * filet vertical ne font que l'appuyer : `frontend-design.md`
                       * interdit qu'une information passe par la seule couleur.
                       */
                      aria-current={courante ? "page" : undefined}
                      onClick={fermer}
                    >
                      <span className={styles.lienLibelle}>
                        {rubrique.libelle}
                      </span>

                      {/*
                       * UNE PASTILLE A ZERO NE S'AFFICHE PAS. « 0 messages » n'est
                       * pas une information, c'est du bruit sur neuf lignes : la
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
          </div>
        ))}

        {/*
         * LES RUBRIQUES A VENIR, hors de la liste navigable.
         *
         * Elles vivent dans un `<ul>` distinct sous une etiquette qui dit leur
         * etat, plutot que grisees au milieu des autres : melangees, elles
         * feraient quinze cibles dont six repondent par rien, et l'exploitante
         * cliquerait avant de comprendre. Separees et annoncees, elles se
         * lisent comme ce qu'elles sont, une feuille de route.
         *
         * L'ETIQUETTE N'EST PAS UN TITRE, ET C'EST UNE CORRECTION. Un `h2` ici
         * precederait le `h1` DE CHAQUE PAGE, le layout rendant la barre avant
         * le contenu : le premier titre du document serait « Bientôt
         * disponible » sur les douze ecrans de l'administration.
         *
         * `axe-core` NE L'ATTRAPE PAS : sa regle `heading-order` est classee
         * `best-practice` et n'appartient a aucun des tags WCAG employes par la
         * suite. Le vert d'axe-core ne disait rien sur ce point, la revue
         * d'interface l'a trouve.
         *
         * `aria-labelledby` GARDE L'ANNONCE. La liste reste nommee pour un
         * lecteur d'ecran, sans introduire de niveau de titre : c'est ce que
         * l'etiquette d'une liste dans une navigation deja nommee demande.
         */}
        {/*
         * LE BLOC NE SE REND PAS QUAND LA LISTE EST VIDE, LS-98.
         *
         * Elle l'est depuis que « Parametres » l'a quittee, et un titre
         * « Bientot disponible » suivi de RIEN annoncerait une attente qui
         * n'existe pas : un lecteur d'ecran entendrait une liste nommee et
         * vide, et l'oeil un intitule orphelin.
         *
         * LE BLOC N'EST PAS SUPPRIME POUR AUTANT. L'arbitrage du 4 septembre
         * 2026 reste en vigueur, et une douzieme rubrique decidee le fera
         * reapparaitre sans qu'il faille le reecrire.
         */}
        {RUBRIQUES_A_VENIR.length > 0 && (
          <div className={styles.aVenir}>
            <p
              className={styles.aVenirTitre}
              id={`${identifiantPanneau}-a-venir`}
            >
              Bientôt disponible
            </p>
            <ul
              className={styles.aVenirListe}
              aria-labelledby={`${identifiantPanneau}-a-venir`}
            >
              {RUBRIQUES_A_VENIR.map((rubrique) => (
                <li key={rubrique.libelle} className={styles.aVenirEntree}>
                  {rubrique.libelle}
                </li>
              ))}
            </ul>
          </div>
        )}

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
