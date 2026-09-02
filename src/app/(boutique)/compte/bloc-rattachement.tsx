"use client";

/**
 * Proposition de rattachement des commandes invitees. LS-56, parcours 6.
 *
 * COMPOSANT CLIENT PAR NECESSITE : le resultat s'affiche sans rechargement, et
 * l'annonce au lecteur d'ecran demande un etat local.
 *
 * IL NE DECIDE RIEN ET NE TRANSMET AUCUN IDENTIFIANT. La Server Action qu'il
 * appelle ne prend aucun parametre : ce qui est rattache se calcule cote
 * serveur depuis la session. Ce composant ne fait que declencher et rendre
 * compte, ce qui ferme le chemin que le parcours 6 nomme « tentative de
 * rattachement par identifiant fourni ».
 *
 * IL SURVIT A SON PROPRE SUCCES, ET C'EST LA CORRECTION CENTRALE DE LA REVUE.
 * La premiere version laissait la page decider seule de l'affichage, sur
 * `nombreEligibles > 0`. Or `revalidatePath` fait retomber ce nombre a zero
 * apres un rattachement reussi : la section entiere etait retiree du DOM, ce
 * qui detruisait TROIS choses a la fois, le focus clavier qui retombait sur
 * `body`, le message de succes qui disparaissait avec son conteneur, et la
 * region live retiree a peu pres au moment ou son texte y entrait.
 *
 * Le geste reussi ne produisait donc rien de visible ni de durable. Le composant
 * porte desormais un etat `fait` qui le maintient monte, et c'est lui qui decide
 * de son propre affichage une fois l'action passee.
 *
 * LA REGION LIVE PREEXISTE AU TEXTE, lecon de la revue frontend de LS-54 :
 * inserer le noeud en meme temps que son contenu ne declenche AUCUNE annonce,
 * l'observateur n'ayant rien a observer. Le paragraphe est donc toujours dans
 * le DOM, vide au repos, et `:empty` retire sa boite sans retirer le noeud.
 */
import { useRef, useState, useTransition } from "react";

import {
  rattacherCommandesAction,
  type ResultatRattachementCommandes,
} from "./actions";
import styles from "./compte.module.css";

type Etat = "repos" | "fait" | "erreur";

export function BlocRattachement({
  nombreEligibles,
}: {
  nombreEligibles: number;
}) {
  /*
   * `useTransition` ET NON UN ETAT DE CHARGEMENT MAISON, motif de
   * `lignes-panier.tsx`. La difference est fonctionnelle et non stylistique :
   * `await` sur la Server Action rend la main des qu'elle retourne, alors que
   * le re-rendu declenche par `revalidatePath` arrive APRES. Un drapeau maison
   * reactivait donc le bouton pendant que le rafraichissement etait encore en
   * vol, et un second clic partait sur des donnees deja rattachees : le client
   * lisait « Aucune commande a rattacher » juste apres « Une commande a ete
   * rattachee », ce qui se lit comme une contradiction.
   */
  const [enCours, demarrer] = useTransition();
  const [etat, setEtat] = useState<Etat>("repos");
  const [message, setMessage] = useState("");

  /*
   * LE FOCUS SE DEPLACE SUR LE COMPTE RENDU, jamais nulle part. Le bouton reste
   * monte ici, donc le focus n'est plus PERDU comme dans la premiere version ;
   * il resterait cependant sur un bouton dont le libelle n'a pas change, sans
   * que rien ne signale au clavier que quelque chose s'est produit.
   */
  const compteRendu = useRef<HTMLParagraphElement>(null);

  const appliquer = (resultat: ResultatRattachementCommandes) => {
    {
      switch (resultat.statut) {
        case "RATTACHEES":
          setEtat("fait");
          /*
           * LE PLURIEL EST ACCORDE, ET LE CAS ZERO EST DISTINCT. Zero n'est pas
           * une erreur : entre l'affichage de la page et le clic, un autre
           * onglet a pu rattacher les memes commandes. Dire « aucune commande »
           * est plus juste qu'un faux succes chiffre.
           */
          setMessage(
            resultat.nombre === 0
              ? "Aucune commande à rattacher pour le moment."
              : resultat.nombre === 1
                ? "Une commande a été rattachée à votre compte. Elle apparaît maintenant dans vos commandes."
                : `${resultat.nombre} commandes ont été rattachées à votre compte. Elles apparaissent maintenant dans vos commandes.`,
          );
          break;

        case "ADRESSE_NON_VERIFIEE":
          /*
           * BRANCHE INATTEIGNABLE PAR CE CHEMIN, et volontairement conservee :
           * la page ne monte ce composant que si le service a rendu
           * `ELIGIBLES`, ce qui exige deja l'adresse verifiee. Elle couvre le
           * cas ou l'adresse changerait entre le rendu et le clic. Defaut
           * ferme, avec le chemin pour en sortir.
           */
          setEtat("erreur");
          setMessage(
            "Confirmez d'abord votre adresse email pour rattacher vos commandes.",
          );
          break;

        case "SESSION_ABSENTE":
          setEtat("erreur");
          setMessage("Votre session a expiré.");
          break;

        case "INDISPONIBLE":
          setEtat("erreur");
          setMessage(
            "Le rattachement est momentanément indisponible. Réessayez dans quelques instants.",
          );
          break;
      }
    }

    // APRES le rendu du message, sinon le focus porterait sur un paragraphe
    // encore vide et le lecteur d'ecran n'annoncerait rien.
    compteRendu.current?.focus();
  };

  const rattacher = () => {
    demarrer(async () => {
      const resultat = await rattacherCommandesAction();

      /*
       * LE SECOND `demarrer` APRES L'`await` N'EST PAS UNE REDONDANCE, c'est
       * une limitation documentee de React, verifiee via Context7 : « you must
       * wrap any state updates after any async requests in another
       * startTransition ». Sans lui, les `setEtat` et `setMessage` ci-dessous
       * ne sont pas traites comme des mises a jour de transition.
       *
       * LE SYMPTOME MESURE : la region live restait bloquee sur « Rattachement
       * en cours… », le message de succes n'apparaissait JAMAIS a l'ecran. Le
       * test e2e l'a attrape en lisant le texte reel de la region ; une
       * assertion sur la seule presence du noeud serait restee verte.
       */
      demarrer(() => {
        appliquer(resultat);
      });
    });
  };

  /*
   * RIEN A AFFICHER SI RIEN N'EST ELIGIBLE **ET** QUE L'ACTION N'A PAS EU LIEU.
   *
   * LA SECONDE MOITIE DE LA CONDITION EST LA CORRECTION CENTRALE. Apres un
   * rattachement reussi, `revalidatePath` fait retomber `nombreEligibles` a
   * zero : une condition portant sur ce seul nombre demontait la section au
   * moment ou son compte rendu devenait utile, emportant le message, le focus
   * et la region live. Voir `page.tsx`, qui a delegue cette decision ici.
   *
   * Une section permanente « aucune commande a rattacher » n'apprendrait rien
   * et occuperait le haut de l'ecran de tous les autres clients : le repos
   * silencieux reste le comportement par defaut.
   */
  if (nombreEligibles === 0 && etat === "repos" && !enCours) {
    return null;
  }

  return (
    <section className={styles.section} aria-labelledby="titre-rattachement">
      <h2 id="titre-rattachement">Commandes passées sans compte</h2>
      <div className={styles.rattachement}>
        {/*
         * LE TEXTE D'INTRODUCTION DISPARAIT UNE FOIS L'ACTION FAITE : « une
         * commande a ete passee sans etre connecte » deviendrait faux a cote du
         * message qui dit qu'elle est rattachee.
         */}
        {etat !== "fait" && (
          <p className={styles.texte}>
            {nombreEligibles === 1
              ? "Une commande a été passée avec votre adresse email sans être connecté."
              : `${nombreEligibles} commandes ont été passées avec votre adresse email sans être connecté.`}{" "}
            Rattachez-{nombreEligibles === 1 ? "la" : "les"} à votre compte pour
            retrouver {nombreEligibles === 1 ? "son" : "leur"} suivi et{" "}
            {nombreEligibles === 1 ? "sa facture" : "leurs factures"}.
          </p>
        )}

        {/*
         * LE BOUTON DISPARAIT APRES UN SUCCES, ET SEULEMENT LA. Ce n'est pas
         * l'etat terminal que la revue de LS-54 reprochait au renvoi de lien : il
         * n'y a plus rien a rattacher, la page ayant ete revalidee. Une commande
         * arrivant plus tard fera reapparaitre la section au prochain rendu, le
         * serveur restant seul juge de ce qui est eligible.
         *
         * En cas d'ERREUR il reste actionnable, ce qui est le cas ou le reessai
         * a un sens.
         */}
        {etat !== "fait" && (
          <button
            type="button"
            className={styles.bouton}
            onClick={rattacher}
            disabled={enCours}
          >
            {enCours ? "Rattachement en cours…" : "Rattacher mes commandes"}
          </button>
        )}

        {/*
         * `aria-live` ET `aria-label` EN PLUS DU ROLE, motif de `lignes-panier`.
         * Un `role="status"` nu fait annoncer le changement sans dire de quoi il
         * parle, et DEUX regions anonymes coexistent sur cet ecran, celle-ci et
         * la confirmation d'adresse de `page.tsx`.
         *
         * `tabIndex={-1}` LE REND FOCALISABLE SANS L'INSERER DANS L'ORDRE DE
         * TABULATION : le focus s'y pose apres l'action, il ne s'y arrete jamais
         * en naviguant.
         *
         * LE TEXTE D'ATTENTE Y ENTRE AUSSI. Un utilisateur de lecteur d'ecran ne
         * percoit pas le changement de libelle d'un bouton qu'il n'a plus sous le
         * curseur virtuel : sans cette ligne, la region reste muette pendant
         * toute la duree de l'action. Motif de `formulaire-contact.tsx`.
         *
         * LE MESSAGE L'EMPORTE SUR L'ATTENTE DES QU'IL EXISTE, et cet ordre a ete
         * mesure. `useTransition` reste actif pendant TOUTE la revalidation, qui
         * suit le retour de la Server Action : afficher l'attente tant que
         * `enCours` est vrai laissait « Rattachement en cours… » a l'ecran alors
         * que le resultat etait connu, et le message de succes n'apparaissait
         * jamais. Le test e2e l'a attrape en lisant le texte reel de la region.
         */}
        <p
          ref={compteRendu}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          aria-label="Rattachement des commandes"
          className={styles.annonce}
          data-etat={etat === "erreur" ? "erreur" : undefined}
        >
          {message === "" && enCours ? "Rattachement en cours…" : message}
        </p>

        {/*
         * LE CHEMIN DE SORTIE ACCOMPAGNE LE REFUS, jamais un message seul. Un
         * client qui lit « votre session a expiré » sur une page affichant encore
         * ses donnees n'a aucun moyen d'agir, motif de `formulaire-suppression`.
         */}
        {etat === "erreur" && (
          <p className={styles.texte}>
            <a href="/compte/connexion" className={styles.lien}>
              Se reconnecter
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
