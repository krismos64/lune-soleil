/**
 * « Mes avis », l'ecran de liste de l'espace client. LS-221, parcours 7.
 *
 * POURQUOI IL EXISTE. Le client depose son avis par un lien a jeton reçu par
 * email, `/avis/[jeton]`, et jusqu'ici rien ne lui montrait ce qu'il avait
 * ecrit : l'avis partait sur la fiche produit et cessait de lui appartenir. La
 * rubrique figurait dans la navigation sous « Bientot disponible » et pointait
 * LS-61, close depuis le 11 septembre 2026, donc elle attendait un ticket qui
 * n'arrivait pas.
 *
 * COMPOSANT SERVEUR, `exigerSession` appele AVANT tout rendu, comme les quatre
 * autres ecrans de l'espace. Pas de middleware : celui de Next.js s'execute sur
 * la peripherie et ne peut pas relire la session en base, il ne verrait que la
 * presence d'un cookie.
 *
 * L'IDENTITE VIENT DE LA SESSION ET DE RIEN D'AUTRE, invariant 2. Aucun
 * identifiant ne circule par l'URL : cet ecran n'a pas de parametre, et
 * `listerMesAvis` ne sait filtrer que sur l'identifiant qu'on lui remet.
 *
 * LA MODIFICATION D'UN AVIS N'EST PAS DANS CETTE STORY, arbitrage pris en
 * livrant LS-221. Elle suppose R10, un retour en moderation et la disparition
 * de l'avis de la fiche produit le temps de la relecture : c'est un cycle
 * complet, pas un champ de formulaire. `PARCOURS.md` la liste parmi les quatre
 * absences du parcours 7, et la raison qu'il donne, « elle suppose un espace ou
 * l'auteur retrouve son avis », est precisement ce que cet ecran livre. Le
 * ticket de suite l'a donc, et plus l'obstacle qui la bloquait.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { exigerSession } from "@/services/autorisation";
import { DELAI_PUBLICATION_JOURS, listerMesAvis } from "@/services/avis";

import styles from "./avis.module.css";
import stylesCompte from "../compte.module.css";

export const metadata = {
  title: "Mes avis",
  robots: { index: false, follow: false },
};

/**
 * La page lit la session a chaque affichage. Sans cela, Next.js pourrait servir
 * un rendu mis en cache, donc les avis d'une personne a une autre.
 */
export const dynamic = "force-dynamic";

/** Le format de date de l'espace client, sans heure : elle n'apporte rien ici. */
function formaterJour(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * La note en etoiles, doublee d'un texte pour les lecteurs d'ecran.
 *
 * LES ETOILES SONT `aria-hidden`, ET LE TEXTE PORTE L'INFORMATION. Un lecteur
 * d'ecran qui rencontre cinq caracteres etoile annonce « etoile etoile etoile »
 * sans dire combien ni sur quel total : « 4 sur 5 » est ce qu'il faut entendre.
 */
function Note({ valeur }: { valeur: number }): React.ReactElement {
  return (
    <p className={styles.note}>
      <span aria-hidden="true" className={styles.etoiles}>
        {"★".repeat(valeur)}
        {"☆".repeat(5 - valeur)}
      </span>
      <span className={styles.noteTexte}>{valeur} sur 5</span>
    </p>
  );
}

export default async function PageMesAvis() {
  const identite = await exigerSession(await headers());

  if (!identite) {
    redirect("/compte/connexion");
  }

  const avis = await listerMesAvis(identite.utilisateurId);

  return (
    /*
     * `<main id="contenu" tabIndex={-1}>` EST LA CIBLE DU LIEN D'EVITEMENT,
     * regle C34, et chaque page de l'espace la porte elle-meme : le layout n'en
     * rend aucune, un second repere `main` donnerait deux points d'entree au
     * document.
     *
     * `tabIndex={-1}` EST INDISPENSABLE. `focus()` sur un element sans lui ne
     * prend pas : le focus retombe sur `body`, la page defile, le lien parait
     * marcher et la tabulation suivante repart du haut. Mesure deux fois sur ce
     * depot.
     *
     * J'AVAIS ECRIT UN `<div>`, et `verifier-lien-evitement.sh` l'a attrape :
     * l'ecran rendait correctement et n'avait aucune cible d'evitement.
     */
    <main id="contenu" tabIndex={-1} className={stylesCompte.page}>
      <h1>Mes avis</h1>

      {avis.length === 0 ? (
        /*
         * L'ETAT VIDE DIT POURQUOI IL EST VIDE, et comment il se remplit. Une
         * liste vide sans explication laisse croire a une panne, alors que
         * c'est l'etat normal de tout compte avant une premiere livraison :
         * l'invitation ne part qu'apres une livraison REELLEMENT constatee,
         * LS-61.
         */
        <section className={stylesCompte.section}>
          <p className={stylesCompte.texte}>
            Vous n&apos;avez pas encore déposé d&apos;avis.
          </p>
          <p className={stylesCompte.texte}>
            Après la livraison d&apos;une commande, nous vous envoyons un lien
            par email pour donner votre avis sur les articles reçus. Vos avis
            apparaîtront ensuite sur cette page.
          </p>
          <p className={stylesCompte.texte}>
            <Link href="/compte/commandes">Voir mes commandes</Link>
          </p>
        </section>
      ) : (
        <ul className={styles.avis}>
          {avis.map((ligne) => (
            <li key={ligne.id} className={styles.carte}>
              <h2 className={styles.produit}>
                {ligne.produitNom}
                <span className={styles.variante}>{ligne.varianteLibelle}</span>
              </h2>

              <p className={styles.commande}>
                Commande {ligne.numeroCommande}, reçue le{" "}
                {formaterJour(ligne.experienceA)}
              </p>

              <Note valeur={ligne.note} />

              {ligne.commentaire === null ? null : (
                <p className={styles.commentaire}>{ligne.commentaire}</p>
              )}

              {/*
               * L'ETAT EST ANNONCE APRES LE TEXTE, jamais avant : le client
               * vient relire ce qu'il a ecrit, et un badge en tete de carte
               * ferait passer la moderation pour le sujet principal.
               */}
              {ligne.etat === "PUBLIE" ? (
                <p className={`${styles.etat} ${styles.publie}`}>
                  Publié le {formaterJour(ligne.publieA ?? ligne.deposeA)}
                </p>
              ) : null}

              {ligne.etat === "EN_ATTENTE" ? (
                /*
                 * LE DELAI EST DERIVE DE `DELAI_PUBLICATION_JOURS`, jamais
                 * ecrit en dur : l'invitation annonce le meme nombre, et deux
                 * textes ecrits separement divergent au premier changement.
                 */
                <p className={`${styles.etat} ${styles.attente}`}>
                  En attente de publication, sous {DELAI_PUBLICATION_JOURS}{" "}
                  jours
                </p>
              ) : null}

              {ligne.etat === "NON_RETENU" ? (
                /*
                 * AUCUN MOTIF N'EST AFFICHE, regle R5 : `motifDecision` est
                 * ecrit par l'exploitante pour elle-meme. Le publier exposerait
                 * la moderation, et un texte redige en interne se lit mal quand
                 * il s'adresse soudain a quelqu'un.
                 *
                 * LA FORMULATION RESTE FACTUELLE ET SANS REPROCHE. « Refuse »
                 * accuse, « n'a pas ete publie » constate.
                 */
                <p className={`${styles.etat} ${styles.nonRetenu}`}>
                  Cet avis n&apos;a pas été publié. Écrivez-nous si vous
                  souhaitez en savoir plus.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
