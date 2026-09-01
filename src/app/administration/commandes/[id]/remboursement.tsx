"use client";

/**
 * Demande de remboursement et avoirs emis, LS-160. Parcours 4, etapes 4 a 6.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : une saisie, un
 * envoi en cours, un bouton desactive pendant, un message par issue. Il ne
 * requete rien et ne decide rien, le service portant ses deux gardes.
 *
 * LA REFERENCE DE DEMANDE VIENT DU SERVEUR, ET C'EST LE COEUR DE CET ECRAN.
 * Elle est engendree UNE FOIS au rendu de la page et posee ici en propriete :
 * deux clics l'envoient a l'identique, donc le second sort en « deja demande »
 * sans appeler le prestataire.
 *
 * NE PAS L'ENGENDRER ICI. Un `useId` ou un `crypto.randomUUID()` cote
 * navigateur changerait a chaque remontage du composant, et un rafraichissement
 * de page produirait une reference neuve pour la MEME intention : le second
 * envoi partirait alors reellement, ce que la reference existe pour empecher.
 * Le defaut a coute 4000 centimes rendus pour 2000 voulus le 1er septembre
 * 2026, sous une autre forme.
 *
 * LE BOUTON DESACTIVE PENDANT L'ENVOI NE SUFFIT PAS, et c'est pourquoi la
 * reference existe : il ferme le double clic d'une meme page, jamais deux
 * onglets ouverts ni un envoi rejoue apres coupure reseau.
 */
import { useState, useTransition } from "react";

import { formaterMontant, centimesVersSaisie } from "@/lib/montant";
import { rembourser } from "../actions";
import styles from "../commandes.module.css";

export type AvoirAffiche = {
  id: string;
  numero: string;
  montantCentimes: number;
};

export function Remboursement({
  commandeId,
  referenceDemande,
  restantCentimes,
  avoirs,
  factureAbsente,
}: {
  commandeId: string;
  referenceDemande: string;
  restantCentimes: number;
  avoirs: AvoirAffiche[];
  factureAbsente: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<{
    texte: string;
    erreur: boolean;
  } | null>(null);

  /*
   * LE MONTANT EST PRE-REMPLI AU RESTANT REMBOURSABLE, cas le plus frequent :
   * une rétractation rend la totalité. Le champ reste modifiable pour un
   * remboursement partiel, geste commercial ou article abîmé.
   */
  const [montant, setMontant] = useState(() =>
    centimesVersSaisie(restantCentimes),
  );
  const [motif, setMotif] = useState("");

  function envoyer(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();

    const formulaire = new FormData();
    formulaire.set("commandeId", commandeId);
    formulaire.set("montant", montant);
    formulaire.set("motif", motif);
    formulaire.set("referenceDemande", referenceDemande);

    demarrer(async () => {
      const resultat = await rembourser(formulaire);

      /*
       * CHAQUE ISSUE A SON MESSAGE, aucune n'est laissee sans retour :
       * `frontend-design.md` interdit le faux succes optimiste. Les deux refus
       * du prestataire sont distingues parce qu'ils appellent deux gestes
       * differents, relancer ou renoncer.
       */
      switch (resultat.statut) {
        case "SUCCES":
          setMessage({
            texte:
              `Remboursement effectué, ${formaterMontant(resultat.montantCentimes)}. ` +
              `Avoir ${resultat.numeroAvoir} émis. Rafraîchir la page.`,
            erreur: false,
          });
          break;
        case "DEJA_DEMANDE":
          setMessage({
            texte:
              "Cette demande est déjà partie, aucun second remboursement " +
              "n'a été effectué. Rafraîchir la page pour voir son résultat.",
            erreur: false,
          });
          break;
        case "REAUTHENTIFICATION_REQUISE":
          setMessage({
            texte:
              "Confirmer votre identité avant de rembourser : ouvrir " +
              "l'écran de réauthentification, puis revenir ici.",
            erreur: true,
          });
          break;
        case "SESSION_ABSENTE":
          setMessage({
            texte: "Session expirée. Se reconnecter pour continuer.",
            erreur: true,
          });
          break;
        case "MONTANT_TROP_ELEVE":
          setMessage({
            texte: `Montant trop élevé. Il reste ${formaterMontant(resultat.restantCentimes)} remboursables.`,
            erreur: true,
          });
          break;
        case "AUCUN_PAIEMENT":
          setMessage({
            texte: "Aucun paiement encaissé sur cette commande.",
            erreur: true,
          });
          break;
        case "FACTURE_ABSENTE":
          setMessage({
            texte:
              "Aucune facture émise : il n'y a pas de document à corriger. " +
              "Émettre la facture avant de rembourser.",
            erreur: true,
          });
          break;
        case "REFUSE_PRESTATAIRE":
          /*
           * REFUS DEFINITIF : relancer a l'identique ne servira a rien, et le
           * dire evite une serie de tentatives inutiles. Aucun avoir n'existe,
           * aucun argent n'est parti.
           */
          setMessage({
            texte:
              "Le prestataire a refusé ce remboursement. Aucun argent n'est " +
              "parti et aucun avoir n'a été émis. Vérifier le paiement dans " +
              "le tableau de bord Stripe.",
            erreur: true,
          });
          break;
        case "PRESTATAIRE_INDISPONIBLE":
          /*
           * DISTINCT DU REFUS : rien n'a change, et le reessai est SUR.
           * L'intention a ete liberee par le service, la meme demande peut
           * repartir a l'identique.
           */
          setMessage({
            texte:
              "Le prestataire ne répond pas. Rien n'a changé, réessayer plus " +
              "tard avec le même montant.",
            erreur: true,
          });
          break;
        case "INVALIDE":
          setMessage({ texte: resultat.message, erreur: true });
          break;
        case "INDISPONIBLE":
          setMessage({
            texte: "Remboursement indisponible. Réessayer plus tard.",
            erreur: true,
          });
          break;
      }
    });
  }

  return (
    <div>
      {avoirs.length === 0 ? (
        <p className={styles.vide}>Aucun avoir émis sur cette commande.</p>
      ) : (
        <ul className={styles.listeAvoirs}>
          {avoirs.map((avoir) => (
            <li key={avoir.id} className={styles.avoir}>
              <span>Avoir {avoir.numero}</span>
              <span>{formaterMontant(avoir.montantCentimes)}</span>
            </li>
          ))}
        </ul>
      )}

      {factureAbsente ? (
        /*
         * SANS FACTURE, AUCUN FORMULAIRE. Un avoir reference une facture :
         * proposer le geste ici ferait echouer chaque tentative sans que la
         * cause soit lisible.
         */
        <p className={styles.introduction}>
          Aucune facture émise pour cette commande : un avoir corrige une
          facture, il ne peut pas exister sans elle.
        </p>
      ) : restantCentimes === 0 ? (
        <p className={styles.introduction}>
          Cette commande est intégralement remboursée.
        </p>
      ) : (
        <form onSubmit={envoyer} className={styles.formulaireRemboursement}>
          <p className={styles.introduction}>
            Restant remboursable : {formaterMontant(restantCentimes)}.
          </p>

          {/*
           * L'AVERTISSEMENT EST AVANT LE FORMULAIRE, jamais apres le bouton :
           * l'irreversibilite doit se lire avant le geste. ADR-032, aucun
           * remboursement automatique et aucune annulation possible.
           */}
          <p className={styles.avertissement}>
            Un remboursement est irréversible et fait sortir de l&apos;argent
            réel. Il émet un avoir, la facture restant inchangée.
          </p>

          <div className={styles.champ}>
            <label htmlFor="montant-remboursement">Montant en euros</label>
            <input
              id="montant-remboursement"
              name="montant"
              type="text"
              inputMode="decimal"
              value={montant}
              onChange={(evenement) => setMontant(evenement.target.value)}
              disabled={enCours}
              required
              aria-describedby="message-remboursement"
            />
          </div>

          <div className={styles.champ}>
            <label htmlFor="motif-remboursement">Motif</label>
            <input
              id="motif-remboursement"
              name="motif"
              type="text"
              value={motif}
              onChange={(evenement) => setMotif(evenement.target.value)}
              disabled={enCours}
              required
              maxLength={200}
              /*
               * LE MOTIF ENTRE DANS L'INSTANTANE LEGAL DE L'AVOIR, document
               * opposable : le dire evite un motif interne du type « client
               * pénible » sur une pièce comptable.
               */
              aria-describedby="aide-motif message-remboursement"
            />
            <p id="aide-motif" className={styles.aide}>
              Il figure sur l&apos;avoir, document comptable remis au client.
            </p>
          </div>

          <button type="submit" className={styles.bouton} disabled={enCours}>
            {enCours ? "Remboursement en cours…" : "Rembourser"}
          </button>
        </form>
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
        id="message-remboursement"
        className={`${styles.message} ${message?.erreur === true ? styles.messageErreur : ""}`}
        role="status"
        aria-label="Résultat du remboursement"
      >
        {enCours ? "Remboursement en cours…" : (message?.texte ?? "")}
      </p>
    </div>
  );
}
