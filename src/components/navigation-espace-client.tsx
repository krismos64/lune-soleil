"use client";

/**
 * Navigation laterale de l'espace client, LS-180.
 *
 * LE DEFAUT QU'ELLE FERME. Les stories LS-54 a LS-62 ont livre les ECRANS, un
 * par un, chacun se suffisant a lui-meme : la page `/compte` etait devenue un
 * SOMMAIRE de six sections dont chacune portait un lien vers son ecran, et
 * chaque ecran un lien « Retour a mon compte ». Circuler des commandes vers les
 * adresses demandait donc DEUX navigations en passant par le sommaire.
 *
 * Le prototype montre au contraire une barre laterale PERSISTANTE, et c'est
 * elle qui donne son unite a l'espace client : depuis n'importe quel ecran, les
 * autres sont a un clic.
 *
 * COMPOSANT CLIENT, ET C'EST IMPOSE PAR NEXT.JS, verifie via Context7 sur la
 * documentation de l'App Router : UN LAYOUT PARTAGE NE SE RE-REND PAS a la
 * navigation entre routes sœurs, il est « reused (already mounted) ». Un chemin
 * lu cote serveur et passe en props resterait donc fige sur la premiere page
 * ouverte, et le marqueur d'ecran courant designerait la mauvaise rubrique
 * apres chaque clic. Seul `usePathname`, qui se re-rend, donne le chemin reel.
 * C'est le meme motif que la barre d'administration, et pour la meme raison.
 *
 * SOUS 768 px ELLE SE REPLIE, comme celle de l'administration. Le prototype ne
 * montre JAMAIS le cas mobile, et une colonne permanente y mangerait l'ecran
 * avant le contenu. Le CSS porte le detail de ce choix.
 *
 * ELLE N'AUTORISE RIEN. Sa presence depend de la session, ce qui evite de
 * proposer cinq liens vers des ecrans proteges a qui n'est pas connecte, mais
 * cacher une barre n'est pas une protection : chaque page garde son
 * `exigerSession` avant tout rendu.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";

import styles from "./navigation-espace-client.module.css";

export type RubriqueClient = {
  chemin: string;
  libelle: string;
};

/**
 * Les rubriques LIVREES, dans l'ordre du prototype.
 *
 * QUATRE ENTREES ET NON CINQ, et l'ecart avec le prototype est justifie plus
 * bas : « Mes avis » n'a pas d'ecran, LS-61 etant bloquee.
 *
 * « PROFIL ET DONNEES » EST UNE SEULE ENTREE DU PROTOTYPE POUR DEUX ROUTES
 * LIVREES, `/compte/profil` (LS-60) et `/compte/donnees` (LS-62). Les fondre
 * en un seul lien cacherait l'une des deux : le carnet de droits RGPD n'est pas
 * un detail du profil, l'export et la suppression y vivent. Elles sont donc
 * DEUX entrees, et c'est un ecart assume au prototype, dans le sens que
 * `frontend-design.md` autorise : le prototype montre une maquette, le depot
 * porte deux ecrans reels.
 *
 * LES ECRANS D'AUTHENTIFICATION N'Y SONT PAS, et ne peuvent pas y etre : on n'y
 * est pas connecte, donc la barre ne s'affiche pas du tout sur ces pages.
 *
 * LE DETAIL D'UNE COMMANDE N'EST PAS UNE RUBRIQUE, son URL portant un
 * identifiant. Il s'atteint depuis sa liste, et `estRubriqueCliente` le marque
 * sous « Mes commandes ».
 */
export const RUBRIQUES_CLIENT: readonly RubriqueClient[] = [
  { chemin: "/compte", libelle: "Vue d'ensemble" },
  { chemin: "/compte/commandes", libelle: "Mes commandes" },
  { chemin: "/compte/adresses", libelle: "Mes adresses" },
  { chemin: "/compte/profil", libelle: "Mon profil" },
  { chemin: "/compte/donnees", libelle: "Mes données" },
] as const;

/**
 * Les rubriques du prototype QUE LE CODE NE PORTE PAS ENCORE.
 *
 * MEME MOTIF QUE L'ADMINISTRATION, arbitrage de Christophe du 4 septembre 2026
 * repris ici : les montrer inertes plutot que les cacher. La barre annonce
 * alors la structure complete de l'espace, et le client sait que ses avis
 * viendront la, au lieu de croire que la fonction n'existe pas.
 *
 * CE NE SONT PAS DES LIENS, et c'est la seule chose qui compte pour la
 * correction. Un `<span>` sans `href` ne peut pas rendre un 404, ne prend pas
 * le focus au clavier et n'est pas annonce comme un lien par un lecteur
 * d'ecran.
 *
 * LE TICKET EST ECRIT pour que cette liste ne devienne pas un cimetiere : une
 * entree sans ticket n'a rien a faire ici. LS-61 porte les avis verifies, et
 * elle est bloquee par LS-33 et l'ouverture du compte Mondial Relay, un avis ne
 * s'invitant qu'apres une livraison constatee.
 */
export const RUBRIQUES_CLIENT_A_VENIR = [
  { libelle: "Mes avis", ticket: "LS-61" },
] as const;

/**
 * L'ecran courant, deduit du chemin.
 *
 * LA COMPARAISON N'EST PAS UNE EGALITE STRICTE. `/compte/commandes/abc` est le
 * detail d'une commande : la rubrique « Mes commandes » doit s'y marquer
 * courante, sans quoi le client perd son reperage des qu'il ouvre un detail.
 * Le prefixe suivi d'une barre distingue un enfant reel d'un homonyme.
 *
 * `/compte` EST LE CAS PARTICULIER. Tout chemin de l'espace client commence par
 * lui : la regle du prefixe le marquerait courant sur TOUS les ecrans. La vue
 * d'ensemble se reconnait donc a l'egalite stricte, et elle seule. C'est
 * exactement le piege que la barre d'administration a rencontre avec
 * `/administration`.
 */
export function estRubriqueCliente(chemin: string, rubrique: string): boolean {
  if (rubrique === "/compte") {
    return chemin === rubrique;
  }

  return chemin === rubrique || chemin.startsWith(`${rubrique}/`);
}

export function NavigationEspaceClient({
  nomAffiche,
  initiales,
  emailVerifie,
  deconnexion,
}: {
  nomAffiche: string;
  initiales: string;
  emailVerifie: boolean;
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
   * SANS CE RAPPEL, LE FOCUS RETOMBE SUR `body`. Fermer le panneau lui applique
   * `display: none`, ce qui detache du DOM visible l'element focalise : la
   * tabulation suivante repart alors du HAUT du document, donc chaque
   * navigation au clavier renvoie au debut de la page. Defaut mesure sur la
   * barre d'administration par la revue d'interface de LS-181, et la meme
   * mecanique s'applique ici mot pour mot.
   */
  function fermer() {
    setOuverte(false);
    bascule.current?.focus();
  }

  return (
    /*
     * `Escape` REFERME LE PANNEAU, et le gestionnaire vit sur ce conteneur.
     *
     * PAS SUR LE `nav`. Apres un clic sur le bouton d'ouverture, le focus reste
     * SUR LE BOUTON, qui est hors du `nav` : un gestionnaire pose sur le `nav`
     * ne verrait jamais la frappe, l'evenement ne remontant que vers les
     * ANCETRES de l'element focalise.
     *
     * PAS SUR `document` NON PLUS, un ecouteur global intercepterait `Escape`
     * partout. Ce conteneur englobe le bouton et le panneau, exactement la
     * portee voulue.
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
        {ouverte ? "Fermer le menu" : "Mon espace"}
      </button>

      <nav
        id={identifiantPanneau}
        className={`${styles.barre} ${ouverte ? styles.barreOuverte : ""}`}
        aria-label="Sections de mon espace"
      >
        {/*
         * L'IDENTITE EST EN TETE DE BARRE, et non en pied comme cote
         * administration : c'est la forme du prototype, et elle se justifie.
         * L'administratrice travaille dans son outil et sait qui elle est ; le
         * client arrive de la boutique, ou il naviguait sans compte, et le
         * premier signe qu'il est bien chez lui doit etre en haut.
         */}
        <div className={styles.identite}>
          <span className={styles.identiteInitiales} aria-hidden="true">
            {initiales}
          </span>
          <span className={styles.identiteTextes}>
            <span className={styles.identiteNom}>{nomAffiche}</span>
            {/*
             * LA MENTION DE VERIFICATION N'EST PAS UNE ALERTE, arbitrage du
             * 2 septembre 2026 : la verification ne bloque rien. L'etat non
             * verifie se dit donc au present, sans liseré ni couleur d'erreur,
             * et c'est la page `/compte` qui porte le rappel actionnable.
             *
             * L'INFORMATION NE PASSE PAS PAR LA SEULE COULEUR : les deux etats
             * ont des LIBELLES differents, pas seulement des teintes.
             */}
            <span className={styles.identiteEtat}>
              {emailVerifie ? "Email vérifié" : "Email à confirmer"}
            </span>
          </span>
        </div>

        <ul className={styles.liste}>
          {RUBRIQUES_CLIENT.map((rubrique) => {
            const courante = estRubriqueCliente(chemin, rubrique.chemin);

            return (
              <li key={rubrique.chemin}>
                <Link
                  href={rubrique.chemin}
                  className={styles.lien}
                  /*
                   * `aria-current="page"` PORTE L'INFORMATION, le fond et le
                   * filet vertical ne font que l'appuyer : `frontend-design.md`
                   * interdit qu'une information passe par la seule couleur, et
                   * c'est le critere 2 de cette story.
                   */
                  aria-current={courante ? "page" : undefined}
                  onClick={fermer}
                >
                  {rubrique.libelle}
                </Link>
              </li>
            );
          })}
        </ul>

        {/*
         * LES RUBRIQUES A VENIR, hors de la liste navigable.
         *
         * L'ETIQUETTE N'EST PAS UN TITRE, ET C'EST UNE CORRECTION HERITEE DE
         * LS-181. Un `h2` ici precederait le `h1` DE CHAQUE PAGE, le layout
         * rendant la barre avant le contenu : le premier titre du document
         * serait « Bientôt disponible » sur tous les ecrans de l'espace client.
         *
         * `axe-core` NE L'ATTRAPE PAS : sa regle `heading-order` est classee
         * `best-practice` et n'appartient a aucun des tags WCAG employes par la
         * suite. C'est la revue d'interface qui l'a trouve cote administration.
         *
         * `aria-labelledby` GARDE L'ANNONCE : la liste reste nommee pour un
         * lecteur d'ecran, sans introduire de niveau de titre.
         */}
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
            {RUBRIQUES_CLIENT_A_VENIR.map((rubrique) => (
              <li key={rubrique.libelle} className={styles.aVenirEntree}>
                {rubrique.libelle}
              </li>
            ))}
          </ul>
        </div>

        {/*
         * LA DECONNEXION FERME LA BARRE, et c'est la sixieme entree du
         * prototype. Elle est rendue par le layout parce qu'elle appelle une
         * action serveur : ce composant client ne doit pas ouvrir de porte vers
         * l'authentification.
         */}
        <div className={styles.pied}>{deconnexion}</div>
      </nav>
    </div>
  );
}
