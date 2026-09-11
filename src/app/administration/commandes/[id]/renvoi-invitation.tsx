"use client";

/**
 * Renvoi de l'invitation à déposer un avis, critère 3 de LS-61.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION RÉELLE : un envoi en cours,
 * un bouton désactivé pendant, un message de résultat. Il ne requête rien
 * lui-même et ne décide rien, l'action portant sa propre garde de rôle.
 *
 * CE QU'IL FERME. Jusqu'à cet écran, une invitation partait UNE FOIS ET UNE
 * SEULE : un client qui perdait son email ne pouvait plus jamais déposer son
 * avis, et rien ne permettait de lui en renvoyer un.
 *
 * IL N'APPARAÎT QUE SUR UNE COMMANDE LIVRÉE, la page décidant de son rendu :
 * aucune invitation n'existe avant la livraison constatée, et afficher un
 * bouton qui refuserait toujours serait un piège.
 *
 * L'ÉTAT EST LU PAR LE SERVEUR ET PASSÉ EN PROPRIÉTÉ, correction de revue :
 * sans lui, l'exploitante n'apprenait qu'elle était au plafond qu'en consommant
 * un clic qui échoue.
 */
import { useState, useTransition } from "react";

import { renvoyerInvitationAvis } from "../actions";
import styles from "../commandes.module.css";

export function RenvoiInvitation({
  commandeId,
  destinataire,
  envoisFaits,
  plafond,
  renvoiPossible,
}: {
  commandeId: string;
  /** L'adresse où part le message, pour vérifier avant un geste irréversible. */
  destinataire: string;
  envoisFaits: number;
  plafond: number;
  renvoiPossible: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  function renvoyer() {
    const formulaire = new FormData();
    formulaire.set("commandeId", commandeId);

    demarrer(async () => {
      const resultat = await renvoyerInvitationAvis(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, ET CHACUN DIT QUOI FAIRE. Les sept refus
       * appellent des gestes différents, et les confondre ferait chercher une
       * panne là où il n'y a qu'à attendre une minute.
       */
      switch (resultat.statut) {
        case "SUCCES":
          setMessage({
            texte: `Invitation renvoyée à ${destinataire}. Le lien précédent ne fonctionne plus. Tentative ${resultat.nombreEnvois} sur ${plafond}.`,
            erreur: false,
          });
          break;
        case "ENVOI_EN_COURS":
          setMessage({
            texte:
              "Un envoi précédent n'est pas encore parti. Réessayer dans une " +
              "minute, le message en attente porte un lien valide.",
            erreur: false,
          });
          break;
        case "DEJA_NOTEE":
          setMessage({
            texte:
              "Toutes les pièces de cette commande sont déjà notées. Le lien " +
              "renvoyé n'aurait rien à ouvrir.",
            erreur: false,
          });
          break;
        case "PLAFOND":
          /*
           * LE SEUL REFUS DONT L'ÉCRAN NE PERMET PAS DE SORTIR, et c'est
           * pourquoi il doit nommer ce qui reste possible. Aucune remise à zéro
           * n'existe : sans cette phrase, l'exploitante recliquerait et
           * conclurait à une panne.
           */
          setMessage({
            texte:
              `Plafond de ${resultat.plafond} envois atteint pour cette ` +
              "commande. Aucun renvoi supplémentaire n'est possible : " +
              "contacter le client directement pour lui transmettre le lien.",
            erreur: true,
          });
          break;
        case "INTROUVABLE":
          setMessage({
            texte:
              "Aucune invitation pour cette commande. Elle part " +
              "automatiquement une fois la livraison constatée.",
            erreur: true,
          });
          break;
        case "SESSION_ABSENTE":
          setMessage({
            texte: "Session expirée. Se reconnecter pour continuer.",
            erreur: true,
          });
          break;
        case "INVALIDE":
          setMessage({ texte: "Demande non valide.", erreur: true });
          break;
      }
    });
  }

  return (
    <div>
      {/*
       * L'EFFET SUR L'ANCIEN LIEN EST ANNONCÉ AVANT LE CLIC, et ce n'est pas
       * du confort : le renvoi RÉVOQUE les jetons précédents, point 8 de
       * `database.md`. Une exploitante qui l'ignorerait pourrait couper le lien
       * d'un client en train de rédiger son avis.
       *
       * L'ADRESSE DESTINATAIRE EST RAPPELÉE ICI, correction de revue : c'est
       * elle qui permet de comprendre un « il n'a rien reçu » qui se répète,
       * cas d'une adresse erronée à la commande que le renvoi ne résoudra
       * jamais.
       */}
      <p className={styles.introduction}>
        Renvoyer l&apos;invitation engendre un lien neuf et rend le précédent
        inutilisable. Le message part à {destinataire}. À employer quand le
        client dit ne pas avoir reçu son message, ou l&apos;avoir perdu.
      </p>

      <p className={styles.mode}>
        {envoisFaits} envoi{envoisFaits > 1 ? "s" : ""} sur {plafond}.
      </p>

      {renvoiPossible ? (
        <button
          type="button"
          className={styles.bouton}
          disabled={enCours}
          /*
           * LE MESSAGE EST RATTACHÉ AU BOUTON : une annonce polie passe une
           * fois, et un lecteur d'écran qui revient ensuite sur le bouton ne
           * retrouverait aucune trace du refus.
           */
          aria-describedby="message-renvoi-invitation"
          onClick={renvoyer}
        >
          {/*
           * LIBELLÉ FIXE, ET C'EST VOULU. Un nom accessible qui mute pendant
           * l'action n'est lu par personne : le bouton est `disabled` donc il
           * perd le focus, et rien n'y ramène. C'est la RÉGION qui porte
           * l'attente, comme dans les trois composants voisins.
           */}
          Renvoyer l&apos;invitation
        </button>
      ) : (
        <p className={styles.vide}>
          {envoisFaits >= plafond
            ? "Plafond d'envois atteint. Contacter le client directement pour lui transmettre le lien."
            : "Toutes les pièces sont déjà notées, il n'y a plus rien à inviter."}
        </p>
      )}

      {/*
       * LA RÉGION EST TOUJOURS PRÉSENTE, MÊME VIDE : une région live insérée en
       * même temps que son contenu n'est pas lue par les lecteurs d'écran.
       *
       * ELLE PORTE L'ATTENTE, correction de revue : ce composant l'avait mise
       * dans le seul libellé du bouton, et la région restait muette entre le
       * clic et la réponse. Le renvoi fait un envoi SMTP dans une transaction,
       * c'est l'action la plus lente de cet écran, donc celle où le silence
       * dure le plus longtemps. Les trois composants voisins font ainsi.
       *
       * PAS D'`aria-label` ICI, ET C'EST DÉLIBÉRÉ, C39 : il ANNULERAIT la
       * description, le calcul du nom accessible consultant `aria-label` avant
       * le contenu textuel. Le bouton s'annoncerait avec le label au lieu de la
       * phrase qui apprend quelque chose.
       */}
      <p
        id="message-renvoi-invitation"
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
      >
        {enCours ? "Envoi en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
