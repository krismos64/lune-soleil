"use client";

/**
 * Etat du document comptable et relance de sa generation, LS-129 critere 4.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : un envoi en cours,
 * un bouton desactive pendant, un message de resultat. Il ne requete rien
 * lui-meme et ne decide rien, l'action portant sa propre garde de role.
 *
 * DEUX ETATS D'ABSENCE A NE PAS CONFONDRE, et c'est tout l'objet de cet ecran.
 * « Aucune facture » signifie que la commande n'a jamais ete facturee, cas de
 * l'emetteur non configure. « Facture sans document » signifie que la facture
 * EXISTE, avec son numero et sa valeur legale, et que seul son rendu a echoue,
 * regle F8. Les presenter pareil ferait chercher une facture perdue quand il n'y
 * a qu'un fichier a regenerer.
 */
import { useState, useTransition } from "react";

import { regenererDocument } from "../actions";
import styles from "../commandes.module.css";

export function DocumentFacture({
  commandeId,
  facture,
}: {
  commandeId: string;
  facture: { id: string; numero: string; cheminPdf: string | null } | null;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  if (facture === null) {
    /*
     * AUCUNE FACTURE N'EST UN ETAT ANORMAL MAIS PREVU. Il signale que la
     * confirmation a leve une alerte `FACTURE_NON_EMISE`, emetteur non
     * configure : le geste n'est pas de regenerer un fichier, mais de
     * renseigner l'identite legale puis d'emettre le document.
     */
    return (
      <p className={styles.vide}>
        Aucune facture émise pour cette commande. Vérifier l&apos;identité
        légale de l&apos;émetteur, puis les alertes critiques.
      </p>
    );
  }

  function relancer() {
    if (facture === null) {
      return;
    }

    const formulaire = new FormData();
    formulaire.set("factureId", facture.id);
    formulaire.set("commandeId", commandeId);

    demarrer(async () => {
      const resultat = await regenererDocument(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, aucune n'est laissee sans retour :
       * `frontend-design.md` interdit le faux succes optimiste.
       */
      switch (resultat.statut) {
        case "SUCCES":
          setMessage({ texte: "Document généré.", erreur: false });
          break;
        case "DEJA_PRESENT":
          setMessage({
            texte: "Le document existait déjà. Rafraîchir la page.",
            erreur: false,
          });
          break;
        case "ECHEC":
          setMessage({
            texte:
              "La génération a échoué. La facture reste valide et son numéro " +
              "est inchangé. Une alerte critique a été levée.",
            erreur: true,
          });
          break;
        case "SESSION_ABSENTE":
          setMessage({
            texte: "Session expirée. Se reconnecter pour continuer.",
            erreur: true,
          });
          break;
        case "INTROUVABLE":
          setMessage({ texte: "Cette facture n'existe plus.", erreur: true });
          break;
        case "INVALIDE":
          setMessage({ texte: "Demande non valide.", erreur: true });
          break;
      }
    });
  }

  return (
    <div>
      <p className={styles.mode}>
        Facture {facture.numero}
        {facture.cheminPdf === null
          ? " : document PDF non généré."
          : " : document disponible."}
      </p>

      {facture.cheminPdf === null && (
        <>
          {/*
           * LE NUMERO EST DEJA ATTRIBUE, et le dire evite une hesitation
           * legitime : relancer la generation ne cree pas un second document et
           * ne consomme aucun rang de la sequence fiscale, ADR-031.
           */}
          <p className={styles.introduction}>
            La facture est valide et porte déjà son numéro. Relancer la
            génération produit le fichier sans attribuer de nouveau numéro.
          </p>

          <button
            type="button"
            className={styles.bouton}
            disabled={enCours}
            /*
             * LE MESSAGE EST RATTACHE AU BOUTON : une annonce polie passe une
             * fois, et un lecteur d'ecran qui revient ensuite sur le bouton ne
             * retrouverait aucune trace du refus.
             */
            aria-describedby="message-document"
            onClick={relancer}
          >
            Générer le document
          </button>
        </>
      )}

      {/*
       * LA REGION EST TOUJOURS PRESENTE, MEME VIDE : une region live inseree en
       * meme temps que son contenu n'est pas lue par les lecteurs d'ecran.
       *
       * `aria-label` LA NOMME, LS-85 : cet ecran porte plusieurs regions
       * `status`, et deux regions anonymes s'annoncent identiquement sans qu'on
       * sache laquelle a parle.
       */}
      <p
        id="message-document"
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
        aria-label="Génération du document"
      >
        {enCours ? "Génération en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
