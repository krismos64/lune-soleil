"use client";

/**
 * Formulaire de contact, LS-97.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : une saisie, un
 * envoi en cours, un bouton desactive pendant, un message par issue.
 *
 * `ouvertA` VIENT DU SERVEUR ET NE S'ENGENDRE PAS ICI. Un `Date.now()` cote
 * navigateur mesurerait l'horloge du visiteur, que rien ne rend comparable a
 * celle du serveur : un poste en avance de dix minutes rendrait un ecart
 * negatif, et un poste en retard ferait passer toute soumission pour
 * instantanee. Le meme raisonnement que la reference de demande de LS-160.
 *
 * LE CHAMP PIEGE S'APPELLE `site`, NOM BANAL ET CREDIBLE. Un champ nomme
 * `piege` ou `honeypot` serait ignore par tout script un peu serieux : le nom
 * doit ressembler a un champ que le formulaire pourrait vraiment porter.
 */
import { useState, useTransition } from "react";

import { envoyerMessage } from "./actions";
import styles from "./contact.module.css";

/** Bornes recopiees du schema serveur, pour l'aide a la saisie SEULEMENT. */
const LONGUEUR_CORPS = 4000;

export function FormulaireContact({ ouvertA }: { ouvertA: number }) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [sujet, setSujet] = useState("");
  const [corps, setCorps] = useState("");

  /*
   * LE FORMULAIRE SE FERME APRES UN ENVOI REUSSI. Le laisser ouvert inviterait
   * a cliquer une seconde fois, ce qui produirait un second message identique :
   * le plafond par adresse le bornerait, mais l'exploitante aurait deux fois la
   * meme demande a traiter.
   */
  const [envoye, setEnvoye] = useState(false);

  function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();

    const formulaire = new FormData(evenement.currentTarget);
    formulaire.set("ouvertA", String(ouvertA));

    demarrer(async () => {
      const resultat = await envoyerMessage(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, aucune n'est laissee sans retour :
       * `frontend-design.md` interdit le faux succes optimiste.
       */
      switch (resultat.statut) {
        case "ENREGISTRE":
          setEnvoye(true);
          setMessage({
            texte:
              "Message bien reçu. L'atelier vous répond sous quelques jours, " +
              "à l'adresse que vous avez indiquée.",
            erreur: false,
          });
          break;
        case "INVALIDE":
          setMessage({ texte: resultat.message, erreur: true });
          break;
        case "TROP_DE_MESSAGES":
          /*
           * CELUI-CI EST DIT, contrairement au refus du piege : un plafond
           * atteint concerne une personne reelle dans l'immense majorite des
           * cas, et lui laisser croire que son message est parti serait le vrai
           * defaut. Le repli par email est donne, sans quoi le refus fermerait
           * la seule porte.
           */
          setMessage({
            texte:
              "Trop de messages envoyés depuis cette connexion. Réessayer dans " +
              "une heure, ou écrire directement à contact@lune-soleil.fr.",
            erreur: true,
          });
          break;
        case "INDISPONIBLE":
          setMessage({
            texte:
              "Le service est momentanément indisponible. Réessayer, ou écrire " +
              "à contact@lune-soleil.fr.",
            erreur: true,
          });
          break;
      }
    });
  }

  return (
    <div>
      <form onSubmit={soumettre} className={styles.formulaire}>
        <div className={styles.champ}>
          <label htmlFor="contact-nom">Votre nom</label>
          <input
            id="contact-nom"
            name="nom"
            type="text"
            autoComplete="name"
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            disabled={enCours || envoye}
            required
            aria-describedby="contact-message"
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="contact-email">Votre adresse email</label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(evenement) => setEmail(evenement.target.value)}
            disabled={enCours || envoye}
            required
            aria-describedby="aide-email contact-message"
          />
          <p id="aide-email" className={styles.aide}>
            C&apos;est à cette adresse que la réponse arrivera.
          </p>
        </div>

        <div className={styles.champ}>
          <label htmlFor="contact-sujet">Sujet</label>
          <input
            id="contact-sujet"
            name="sujet"
            type="text"
            value={sujet}
            onChange={(evenement) => setSujet(evenement.target.value)}
            disabled={enCours || envoye}
            required
            aria-describedby="contact-message"
          />
        </div>

        <div className={styles.champ}>
          <label htmlFor="contact-corps">Votre message</label>
          <textarea
            id="contact-corps"
            name="corps"
            rows={8}
            value={corps}
            onChange={(evenement) => setCorps(evenement.target.value)}
            disabled={enCours || envoye}
            required
            aria-describedby="aide-corps contact-message"
          />
          {/*
           * LE COMPTEUR EST UNE AIDE, PAS UNE BORNE. Le champ ne porte aucun
           * `maxLength` : il bloquerait la frappe SANS AUCUN RETOUR, defaut
           * retenu en LS-160 sur le motif d'avoir. Le serveur refuse et le dit,
           * ce qui est le seul retour qu'une personne puisse corriger.
           *
           * IL N'EST PAS DANS UNE REGION LIVE : annoncer chaque caractere frappe
           * rendrait la saisie insupportable a la synthese vocale.
           */}
          <p id="aide-corps" className={styles.aide}>
            {corps.length > LONGUEUR_CORPS
              ? `Message trop long de ${corps.length - LONGUEUR_CORPS} caractères.`
              : `${LONGUEUR_CORPS} caractères au plus.`}
          </p>
        </div>

        {/*
         * LE CHAMP PIEGE, PREMIERE COUCHE ANTI-ROBOT.
         *
         * IL EST MASQUE PAR CSS ET NON PAR `type="hidden"` : un champ cache par
         * l'attribut est visible comme tel dans le source, donc trivialement
         * ignore par un script. Masque par une classe, il ressemble a un champ
         * ordinaire dans le HTML.
         *
         * `aria-hidden` PLUS `tabIndex={-1}` LE RENDENT INATTEIGNABLE aux
         * personnes : ni la tabulation, ni la synthese vocale ne le
         * rencontrent. Sans ces deux attributs, le piege deviendrait un champ
         * fantome que seules les personnes au clavier ou au lecteur d'ecran
         * remplissent, c'est-a-dire l'exact inverse de son objet.
         *
         * `autoComplete="off"` FERME LA TROISIEME PORTE, le remplissage
         * automatique du navigateur, qui remplirait un champ nomme `site` sans
         * que personne ne le decide.
         */}
        <div className={styles.piege} aria-hidden="true">
          <label htmlFor="contact-site">Ne pas remplir ce champ</label>
          <input
            id="contact-site"
            name="site"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        <button
          type="submit"
          className={styles.bouton}
          disabled={enCours || envoye}
          /*
           * LE BOUTON PORTE LE RATTACHEMENT AU MESSAGE, comme les champs : deux
           * issues n'ont AUCUN rapport avec un champ, le plafond atteint et
           * l'indisponibilite. Une annonce polie passe une fois, et rien ne
           * ramenerait au message.
           */
          aria-describedby="contact-message"
        >
          {enCours ? "Envoi en cours…" : "Envoyer le message"}
        </button>
      </form>

      {/*
       * LA REGION EST TOUJOURS PRESENTE, MEME VIDE : une region live inseree en
       * meme temps que son contenu n'est pas lue par les lecteurs d'ecran.
       *
       * PAS D'`aria-label`, decision de LS-160 : il ANNULERAIT la description
       * des champs qui pointent ici, le calcul du nom accessible consultant
       * `aria-label` avant le contenu.
       */}
      <p
        id="contact-message"
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
      >
        {enCours ? "Envoi en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
