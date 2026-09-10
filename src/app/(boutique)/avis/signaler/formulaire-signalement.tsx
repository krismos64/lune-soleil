"use client";

/**
 * Formulaire de signalement d'un avis, LS-77, article L111-7-2.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : une saisie, un
 * envoi en cours, un bouton desactive pendant, un message par issue.
 *
 * `ouvertA` VIENT DU SERVEUR ET NE S'ENGENDRE PAS ICI, meme motif que le
 * contact : un `Date.now()` cote navigateur mesurerait l'horloge du visiteur,
 * que rien ne rend comparable a celle du serveur. Un poste en avance rendrait
 * un ecart negatif, un poste en retard ferait passer toute soumission pour
 * instantanee.
 *
 * LE CHAMP PIEGE S'APPELLE `site`, NOM BANAL ET CREDIBLE. Un champ nomme
 * `piege` serait ignore par tout script un peu serieux : le nom doit ressembler
 * a un champ que le formulaire pourrait vraiment porter.
 *
 * AUCUN CHAMP N'EST PRE-REMPLI DEPUIS UNE SESSION, et c'est la loi qui le veut :
 * la personne qui signale n'est pas un client de la boutique.
 */
import { useEffect, useRef, useState, useTransition } from "react";

import { envoyerSignalement } from "./actions";
import styles from "./signalement.module.css";

/** Borne recopiee du schema serveur, pour l'aide a la saisie SEULEMENT. */
const LONGUEUR_MOTIF = 2000;

export function FormulaireSignalement({
  avisId,
  ouvertA,
}: {
  avisId: string;
  ouvertA: number;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  const [qualite, setQualite] = useState("");
  const [email, setEmail] = useState("");
  const [motif, setMotif] = useState("");

  /*
   * LE FORMULAIRE SE FERME APRES UN ENVOI REUSSI, meme motif que le contact :
   * le laisser ouvert inviterait a cliquer une seconde fois, et l'exploitante
   * aurait deux fois le meme signalement a examiner.
   */
  const [envoye, setEnvoye] = useState(false);

  const confirmation = useRef<HTMLParagraphElement>(null);

  /*
   * LE FOCUS SUIT LE REMPLACEMENT, motif « focus sur un element detache » releve
   * par la revue frontend du 10 septembre puis du 11. Le bouton d'envoi qui
   * portait le focus vient d'etre retire du DOM : sans cela le focus retombe sur
   * `body`, et la tabulation suivante repart du haut de la page. Au clavier, la
   * confirmation serait inatteignable.
   *
   * L'ECRAN D'ADMINISTRATION VOISIN LE TRAITAIT DEJA, celui-ci non : la meme
   * story portait la correction d'un cote et l'oubliait de l'autre.
   */
  useEffect(() => {
    if (envoye) {
      confirmation.current?.focus();
    }
  }, [envoye]);

  function soumettre(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();

    const formulaire = new FormData(evenement.currentTarget);
    formulaire.set("ouvertA", String(ouvertA));
    formulaire.set("avisId", avisId);

    demarrer(async () => {
      const resultat = await envoyerSignalement(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, aucune n'est laissee sans retour :
       * `frontend-design.md` interdit le faux succes optimiste.
       */
      switch (resultat.statut) {
        case "ENREGISTRE":
          setEnvoye(true);
          setMessage({
            texte:
              "Signalement bien reçu. Il sera examiné, et vous serez tenu au " +
              "courant de la suite donnée à l'adresse indiquée.",
            erreur: false,
          });
          break;
        case "INVALIDE":
          setMessage({ texte: resultat.message, erreur: true });
          break;
        case "TROP_DE_SIGNALEMENTS":
          setMessage({
            texte:
              "Plusieurs signalements ont déjà été reçus depuis cette " +
              "connexion. Réessayez dans une heure.",
            erreur: true,
          });
          break;
        case "AVIS_INTROUVABLE":
          setMessage({
            texte:
              "Cet avis n'a pas été trouvé. Il a peut-être été retiré depuis " +
              "que vous avez ouvert cette page.",
            erreur: true,
          });
          break;
      }
    });
  }

  if (envoye) {
    return (
      <p
        ref={confirmation}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className={styles.succes}
      >
        {message?.texte}
      </p>
    );
  }

  return (
    <form onSubmit={soumettre} className={styles.formulaire}>
      {/*
       * CHAMP PIEGE. Masque a l'ecran par CSS et porteur de `tabIndex={-1}`
       * plus `autoComplete="off"` : ni la souris, ni le clavier, ni le
       * remplissage automatique du navigateur ne l'atteignent. `aria-hidden`
       * le retire aussi de l'annonce, un lecteur d'ecran ne devant pas
       * proposer un champ que personne ne doit remplir.
       */}
      <div className={styles.piege} aria-hidden="true">
        <label htmlFor="site">Site web</label>
        <input
          type="text"
          id="site"
          name="site"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="qualite" className={styles.libelle}>
          À quel titre signalez-vous cet avis ?
        </label>
        <p id="aide-qualite" className={styles.aide}>
          Par exemple : créatrice de la pièce concernée, ou responsable du
          produit visé.
        </p>
        <input
          type="text"
          id="qualite"
          name="qualite"
          className={styles.entree}
          maxLength={150}
          required
          aria-describedby="aide-qualite"
          value={qualite}
          onChange={(evenement) => setQualite(evenement.target.value)}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="email" className={styles.libelle}>
          Votre adresse email
        </label>
        <p id="aide-email" className={styles.aide}>
          Elle sert à vous répondre, et à rien d&apos;autre.
        </p>
        <input
          type="email"
          id="email"
          name="email"
          className={styles.entree}
          required
          aria-describedby="aide-email"
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="motif" className={styles.libelle}>
          Ce qui vous fait douter de cet avis
        </label>
        {/*
         * LE MOTIF EST OBLIGATOIRE, ET C'EST LA LOI QUI L'IMPOSE : le texte
         * conditionne le signalement au fait qu'il soit « motive ». L'aide le
         * dit, plutot que de laisser decouvrir l'exigence apres l'envoi.
         */}
        <p id="aide-motif" className={styles.aide}>
          Obligatoire. La loi conditionne le signalement au fait qu&apos;il soit
          motivé. {LONGUEUR_MOTIF} caractères au plus.
        </p>
        <textarea
          id="motif"
          name="motif"
          className={styles.zoneTexte}
          maxLength={LONGUEUR_MOTIF}
          required
          aria-describedby="aide-motif"
          value={motif}
          onChange={(evenement) => setMotif(evenement.target.value)}
        />
      </div>

      {/*
       * LA REGION LIVE EST MONTEE EN PERMANENCE, ET C'EST LA CORRECTION DE LA
       * REVUE DU 11 SEPTEMBRE 2026. Une region inseree EN MEME TEMPS que son
       * contenu n'est pas lue par les lecteurs d'ecran : elle doit exister,
       * vide, avant que le texte n'y arrive. Six fichiers du depot portent
       * cette contre-mesure et sa raison ecrite, dont le formulaire de contact
       * dont celui-ci se reclame.
       *
       * ELLE PORTE L'ATTENTE ET L'ERREUR, C35. Le `role="alert"` ci-dessous
       * reste pour l'AFFICHAGE, la region live etant masquee visuellement.
       */}
      <p aria-live="polite" className={styles.annonce}>
        {enCours
          ? "Envoi de votre signalement en cours…"
          : (message?.texte ?? "")}
      </p>

      <button type="submit" className={styles.bouton} disabled={enCours}>
        {enCours ? "Envoi en cours…" : "Envoyer mon signalement"}
      </button>

      {message !== null && message.erreur && (
        <p className={styles.erreur}>{message.texte}</p>
      )}
    </form>
  );
}
