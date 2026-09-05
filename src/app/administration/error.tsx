"use client";

/**
 * Erreur serveur de l'administration, LS-191.
 *
 * `"use client"` EST IMPOSE PAR NEXT.JS pour une frontiere d'erreur, qui doit
 * s'attacher a un gestionnaire cote navigateur. Ce fichier ne porte aucune
 * logique metier.
 *
 * ------------------------------------------------------------------
 * IL COUVRE LES SEIZE ECRANS D'UN COUP, et c'est tout son objet.
 *
 * Avant lui, une seule rubrique portait une frontiere, `messages/error.tsx`
 * ecrite par LS-97. Les quinze autres n'en avaient aucune : une lecture qui
 * levait remontait donc jusqu'a `app/global-error.tsx`.
 *
 * OR `global-error.tsx` REMPLACE LE LAYOUT RACINE, contrainte de Next.js et non
 * un choix du projet. L'exploitante y perdait la barre de navigation, donc tout
 * moyen d'aller ailleurs sans saisir une URL, et le contexte de l'ecran ou elle
 * se trouvait. Sur une panne breve de base, elle voyait une page nue sans
 * pouvoir savoir si le reste de l'outil fonctionnait.
 *
 * CE FICHIER EST SOUS LE LAYOUT, donc la barre SURVIT. C'est le critere 2 de la
 * story, et `tests/e2e/erreur-administration.spec.ts` le verifie sur une erreur
 * reellement provoquee : une frontiere qu'aucun test ne traverse est une
 * intention, pas une garantie.
 * ------------------------------------------------------------------
 *
 * CE QU'IL NE COUVRE PAS, ET C'EST NORMAL. Une erreur du LAYOUT lui-meme,
 * `lireIdentite` ou `lireComptages` qui leveraient, n'est pas rattrapee ici :
 * une frontiere ne rattrape pas le layout qui la contient. Elle remonte a
 * `global-error.tsx`, qui reste le dernier recours. La barre n'existerait de
 * toute facon pas dans ce cas, puisque c'est elle qui aurait echoue.
 *
 * `messages/error.tsx` EST GARDE, arbitrage de cette story. Une frontiere plus
 * proche l'emporte, et la sienne dit quelque chose que celle-ci ne peut pas
 * dire : « aucun message n'est perdu, ils restent enregistres ». C'est la seule
 * rubrique ou l'exploitante peut craindre d'avoir perdu une demande client.
 * Une frontiere redondante se retire ; une frontiere plus precise se garde.
 */
import Link from "next/link";

import styles from "../erreur.module.css";

export default function ErreurAdministration({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    /*
     * `role="alert"` PLUTOT QUE `status` : le contenu attendu n'est pas arrive,
     * et `frontend-design.md` reserve `alert` au refus et a l'echec.
     *
     * LA REGION EST NOMMEE. Une region live sans nom accessible passe axe-core
     * sans violation, mais un lecteur d'ecran annonce alors le changement sans
     * dire de quoi il parle. Les sept regions du parcours ont ete nommees en
     * LS-85 pour ce motif.
     *
     * AUCUN `id="contenu"` NI `tabIndex`, contrairement aux pages publiques, et
     * la premiere version de ce fichier en portait avec un commentaire qui
     * affirmait « comme sur les autres pages ». C'ETAIT FAUX : le seul lien
     * d'evitement du depot vit dans `en-tete-boutique.tsx`, monte par le layout
     * de la BOUTIQUE, et l'administration n'en a aucun. L'ancre ne servait donc
     * de cible a rien, et les treize autres ecrans d'administration ouvrent un
     * `main` nu. Releve par `ls-frontend-revue`.
     *
     * QUE L'ADMINISTRATION N'AIT PAS DE LIEN D'EVITEMENT est un defaut reel,
     * mais il est ANTERIEUR et couvre seize ecrans : il releve d'un ticket a
     * lui, pas d'une ancre posee sur le seul ecran d'erreur.
     */
    <main
      className={styles.page}
      role="alert"
      aria-label="Erreur de l'administration"
    >
      <p className={styles.surtitre}>Une erreur est survenue</p>

      <h1 className={styles.titre}>
        L&apos;écran n&apos;a pas pu s&apos;afficher
      </h1>

      {/*
       * AUCUN DETAIL TECHNIQUE, invariant 9 et critere 3 de la story. Le message
       * brut d'une erreur porte souvent un nom de table, une requete ou un
       * chemin serveur : `journaliserErreur` le reduit deja au nom de sa classe
       * cote serveur, l'ecran ne doit pas faire moins bien.
       *
       * CE QUI EST DIT A LA PLACE : que les donnees sont intactes. Une erreur
       * d'AFFICHAGE ne perd rien, et c'est la premiere question que se pose
       * quelqu'un devant un ecran de gestion en panne.
       *
       * AUCUN ACCORD AU FEMININ, `frontend-design.md`, meme si l'administration
       * n'a qu'une utilisatrice : la regle vaut partout, et l'exception nommee
       * ne couvre que les mots « administratrice » et « exploitante ».
       */}
      <p className={styles.texte}>
        Le problème vient du site, pas de votre navigation. Aucune donnée
        n&apos;est perdue : commandes, factures et stocks restent enregistrés.
      </p>

      {/*
       * L'IDENTIFIANT EST AFFICHE ICI, ALORS QU'IL EST REFUSE SUR LES PAGES
       * PUBLIQUES, et l'ecart est delibere. Critere 4 de la story.
       *
       * `(boutique)/error.tsx` et `global-error.tsx` le cachent parce qu'ils
       * s'affichent devant N'IMPORTE QUI : un identifiant d'exploitation y
       * serait une information technique livree a un inconnu, qui n'en ferait
       * rien. Cet ecran-ci n'est vu que par l'exploitante, et l'identifiant lui
       * sert a citer l'incident exact plutot que « ca a plante ce matin ».
       *
       * IL N'EST PAS UN SECRET. `error.digest` est une empreinte que Next.js
       * calcule sur le message d'erreur, precisement pour pouvoir designer une
       * erreur sans en divulguer le contenu. C'est ce qui rend son affichage
       * compatible avec l'invariant 9, la ou le message brut ne le serait pas.
       *
       * IL PEUT MANQUER, et le bloc disparait alors plutot que d'afficher un
       * intitule vide : Next.js ne renseigne `digest` que pour les erreurs
       * survenues cote serveur.
       */}
      {error.digest !== undefined && (
        <p className={styles.texte}>
          Référence à citer en cas de besoin :{" "}
          <code className={styles.reference}>{error.digest}</code>
        </p>
      )}

      <div className={styles.sorties}>
        {/*
         * `reset()` REJOUE LE RENDU DU SEGMENT, sans rechargement complet. Sans
         * ce bouton, la seule issue serait de recharger la page a la main, ce
         * que Next.js ne propose pas de lui-meme.
         */}
        <button
          type="button"
          onClick={reset}
          className={styles.actionPrincipale}
        >
          Réessayer
        </button>

        {/*
         * `<Link>` ET NON UN `<a>` NU, contrairement a `global-error.tsx`. La
         * distinction tient a l'etat du routeur : la page racine ne s'affiche
         * que si le layout a echoue, donc le routeur y est douteux et un
         * rechargement complet est souhaitable. Ici le layout tient, la barre
         * est rendue a cote de ce message, et une navigation client ordinaire
         * est la bonne.
         */}
        <Link href="/administration" className={styles.actionSecondaire}>
          Tableau de bord
        </Link>
      </div>
    </main>
  );
}
