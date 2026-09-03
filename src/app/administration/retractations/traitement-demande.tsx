"use client";

/**
 * Les gestes de traitement d'une retractation, LS-135. Parcours 5, etapes 6 a 9.
 *
 * COMPOSANT CLIENT PARCE QU'IL Y A UNE INTERACTION REELLE : des saisies, un
 * envoi en cours, des boutons desactives pendant, un message par issue. Il ne
 * requete rien et ne decide rien, les Server Actions portant leur garde.
 *
 * LES DEUX FAITS DE L'ARTICLE L221-24 SONT OFFERTS EN PARALLELE, jamais en
 * sequence numerotee. Le remboursement est du au PREMIER qui survient : afficher
 * « etape 1, preuve » puis « etape 2, reception » ferait croire qu'il faut
 * attendre les deux, et c'est precisement le defaut que LS-41 a ferme dans le
 * modele.
 *
 * LE BOUTON DE REMBOURSEMENT S'OUVRE DES QU'UN SEUL DES DEUX EST LA. Un retour
 * depose en point relais sans numero de suivi est le cas COURANT, et exiger la
 * preuve le bloquerait indefiniment sur un droit qui est du.
 *
 * LA REFERENCE DE DEMANDE VIENT DU SERVEUR, engendree une fois au rendu de la
 * page. NE PAS L'ENGENDRER ICI : elle changerait a chaque remontage du
 * composant, et un rafraichissement produirait une reference neuve pour la MEME
 * intention, donc un second remboursement REEL.
 */
import Link from "next/link";
import { useState, useTransition } from "react";

import { formaterMontant, centimesVersSaisie } from "@/lib/montant";
import { libelleStatut } from "./libelles";
import {
  declarerPreuveExpedition,
  declarerReception,
  ouvrirRetour,
  refuser,
  rembourser,
  type ResultatRemboursement,
  type ResultatTransition,
} from "./actions";
import styles from "./retractations.module.css";

/**
 * Statuts depuis lesquels un remboursement peut partir, cote affichage.
 *
 * ILS MIROITENT `STATUTS_REMBOURSABLES` DU SERVICE, qui fait autorite : cette
 * copie decide seulement de ce qui s'AFFICHE, jamais de ce qui est accepte. La
 * garde reste dans `rembourserRetractation`, la Server Action etant joignable
 * par HTTP sans passer par cet ecran.
 *
 * `REMBOURSEMENT_EN_COURS` N'Y FIGURE PAS, ET C'EST JUSTE : aucun chemin ne
 * l'ecrit, le service posant `REMBOURSEE` directement apres le depart de
 * l'argent. Un palier tenu en base pendant l'appel obligerait a le defaire sur
 * echec, donc a faire regresser un statut.
 */
const STATUTS_REMBOURSABLES = ["RETOUR_ATTENDU", "EXPEDITION_PROUVEE"];

/** Statuts qui acceptent encore un refus motive. */
const STATUTS_REFUSABLES = ["DEPOSEE", "ACCUSEE", "RETOUR_ATTENDU"];

/**
 * Statuts sur lesquels l'ecran n'offre volontairement plus aucun geste.
 *
 * ELLE EXISTE POUR RENDRE L'ABSENCE DE GESTE EXPLICITE plutot que silencieuse,
 * releve par `ls-frontend-revue` le 3 septembre 2026. Un statut absent des trois
 * listes ne rendrait AUCUN bouton et AUCUNE explication : l'exploitante verrait
 * une carte inerte sans savoir si l'ecran est casse ou la demande close.
 *
 * `REMBOURSEMENT_EN_COURS` Y FIGURE bien que rien ne l'ecrive aujourd'hui : le
 * jour ou un chemin le poserait, l'ecran dirait au moins pourquoi il n'offre
 * rien. C'est le motif « un enum ajoute casse l'affichage » pris a l'envers, la
 * valeur existant deja dans l'enum sans etre atteignable.
 */
const EXPLICATION_SANS_GESTE: Record<string, string> = {
  REMBOURSEE: "Demande close, le remboursement est parti.",
  REFUSEE: "Demande refusée, son motif est indiqué ci-dessus.",
  REMBOURSEMENT_EN_COURS:
    "Remboursement en cours auprès du prestataire. Rechargez la page dans un moment.",
  EXPEDITION_PROUVEE:
    "Le remboursement est dû depuis la preuve d'expédition, article L221-24 : il ne peut plus être refusé.",
};

/**
 * Message lisible pour chaque issue de transition.
 *
 * IL EST EXHAUSTIF ET SANS `default`, pour que `tsc` refuse le fichier quand une
 * issue est ajoutee au service. Un `default: "Une erreur est survenue"`
 * avalerait le cas neuf en silence, et l'exploitante lirait un message generique
 * a la place de ce qui s'est reellement passe.
 */
type MessageAffiche = {
  texte: string;
  erreur: boolean;
  /** Geste proposé quand le message seul ne suffit pas à débloquer, C33. */
  lien?: { chemin: string; libelle: string };
};

function messageTransition(resultat: ResultatTransition): MessageAffiche {
  switch (resultat.statut) {
    case "SUCCES":
      return { texte: "Enregistré.", erreur: false };
    case "SESSION_ABSENTE":
      return {
        texte: "Session expirée. Reconnectez-vous pour continuer.",
        erreur: true,
      };
    case "INVALIDE":
      return { texte: resultat.message, erreur: true };
    case "INTROUVABLE":
      return { texte: "Cette demande n'existe plus.", erreur: true };
    case "STATUT_INCOMPATIBLE":
      return {
        texte: `Impossible : la demande est « ${libelleStatut(resultat.statutActuel)} ». Rechargez la page.`,
        erreur: true,
      };
    case "MOTIF_REQUIS":
      return {
        texte: "Un refus doit être motivé. Indiquez pourquoi.",
        erreur: true,
      };
    case "DEJA_RECUE":
      return { texte: "Le colis est déjà marqué reçu.", erreur: true };
    case "INDISPONIBLE":
      return {
        texte: "Enregistrement impossible pour le moment. Réessayez.",
        erreur: true,
      };
  }
}

/** Message lisible pour chaque issue de remboursement. */
function messageRemboursement(resultat: ResultatRemboursement): MessageAffiche {
  switch (resultat.statut) {
    case "SUCCES":
      return {
        texte: `Remboursement de ${formaterMontant(resultat.montantCentimes)} effectué, avoir ${resultat.numeroAvoir}.`,
        erreur: false,
      };
    case "SESSION_ABSENTE":
      return {
        texte: "Session expirée. Reconnectez-vous pour continuer.",
        erreur: true,
      };
    case "REAUTHENTIFICATION_REQUISE":
      /*
       * LE LIEN ACCOMPAGNE LE MESSAGE, C33 : sans lui, l'ecran nommait une
       * confirmation d'identite sans aucun moyen d'y aller, la barre de
       * navigation excluant deliberement cette route. L'exploitante devait
       * saisir l'URL. Releve par `ls-frontend-revue` le 3 septembre 2026.
       */
      return {
        texte: "Confirmez votre identité pour rembourser.",
        erreur: true,
        lien: {
          chemin: "/administration/reauthentification",
          libelle: "Confirmer mon identité",
        },
      };
    case "INVALIDE":
      return { texte: resultat.message, erreur: true };
    case "INTROUVABLE":
      return { texte: "Cette demande n'existe plus.", erreur: true };
    case "STATUT_INCOMPATIBLE":
      return {
        texte: `Impossible : la demande est « ${libelleStatut(resultat.statutActuel)} ». Rechargez la page.`,
        erreur: true,
      };
    case "AUCUN_FAIT_DECLENCHEUR":
      return {
        texte:
          "Le remboursement n'est pas encore dû : ni preuve d'expédition, ni colis reçu.",
        erreur: true,
      };
    case "MONTANT_SUPERIEUR_AU_DU":
      return {
        texte: `Le montant dépasse le total payé, ${formaterMontant(resultat.montantDuCentimes)}.`,
        erreur: true,
      };
    case "AUCUN_PAIEMENT":
      return {
        texte: "Aucun paiement encaissé sur cette commande.",
        erreur: true,
      };
    case "FACTURE_ABSENTE":
      return {
        texte: "Aucune facture émise : il n'y a rien à corriger par un avoir.",
        erreur: true,
      };
    case "MONTANT_TROP_ELEVE":
      return {
        texte: `Il reste ${formaterMontant(resultat.restantCentimes)} remboursables sur cette facture.`,
        erreur: true,
      };
    case "REFUSE_PRESTATAIRE":
      return {
        texte: `Remboursement refusé par la banque, code ${resultat.code}. Aucun argent n'est parti.`,
        erreur: true,
      };
    case "PRESTATAIRE_INDISPONIBLE":
      return {
        texte:
          "Le prestataire de paiement ne répond pas. Rien n'a changé, réessayez dans un moment.",
        erreur: true,
      };
    case "DEJA_DEMANDE":
      return {
        texte:
          "Ce remboursement est déjà parti. Aucun second appel n'a eu lieu.",
        erreur: true,
      };
    case "INDISPONIBLE":
      return {
        texte: "Remboursement impossible pour le moment. Réessayez.",
        erreur: true,
      };
  }
}

export function TraitementDemande({
  demandeId,
  numeroCommande,
  statut,
  colisRecu,
  preuveFournie,
  montantDuCentimes,
  referenceDemande,
}: {
  demandeId: string;
  /** Sert à nommer la région live, une par carte, jamais à autoriser. */
  numeroCommande: string;
  statut: string;
  colisRecu: boolean;
  preuveFournie: boolean;
  montantDuCentimes: number;
  referenceDemande: string;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<MessageAffiche | null>(null);

  /*
   * LE MONTANT EST PRE-REMPLI AU TOTAL PAYE, frais de port compris, arbitrage
   * de Christophe du 3 septembre 2026. C'est le cas nominal d'une retractation,
   * article L221-24 : le champ reste modifiable pour une reduction sur une
   * piece revenue abimee, que le modele conceptuel autorise AVANT versement.
   */
  const [montant, setMontant] = useState(() =>
    centimesVersSaisie(montantDuCentimes),
  );
  const [preuve, setPreuve] = useState("");
  const [motifRefus, setMotifRefus] = useState("");

  /*
   * LA REFERENCE EST BRULEE DES QU'ELLE A SERVI, et le bouton se ferme avec
   * elle : reutiliser la meme apres un succes ferait sortir le second envoi en
   * « deja demande », ce qui est correct mais illisible. Meme mecanique que
   * l'ecran de remboursement de LS-160.
   */
  const [remboursementFait, setRemboursementFait] = useState(false);

  const peutRembourser =
    STATUTS_REMBOURSABLES.includes(statut) && (colisRecu || preuveFournie);
  const peutRefuser = STATUTS_REFUSABLES.includes(statut);

  /*
   * L'ABSENCE DE GESTE SE DIT, elle ne se constate pas. Les quatre conditions
   * reprennent exactement celles des blocs rendus plus bas : si aucune n'ouvre,
   * la carte serait inerte et l'exploitante ne saurait pas si l'ecran est casse
   * ou la demande close.
   *
   * `colisRecu` COMPTE COMME UN GESTE OFFERT tant qu'il est faux, regle L12 : le
   * bouton reste propose meme sur une demande deja `REMBOURSEE`, le colis
   * pouvant arriver trois semaines apres le versement.
   */
  const ouvreLeRetour = statut === "DEPOSEE" || statut === "ACCUSEE";
  const aucunGeste =
    !ouvreLeRetour &&
    statut !== "RETOUR_ATTENDU" &&
    colisRecu &&
    !(peutRembourser && !remboursementFait) &&
    !peutRefuser;

  function lancer(action: () => Promise<ResultatTransition>) {
    demarrer(async () => {
      setMessage(messageTransition(await action()));
    });
  }

  function formulaireDe(champs: Record<string, string>): FormData {
    const donnees = new FormData();
    donnees.set("demandeId", demandeId);

    for (const [cle, valeur] of Object.entries(champs)) {
      donnees.set(cle, valeur);
    }

    return donnees;
  }

  return (
    <div className={styles.actions}>
      {ouvreLeRetour ? (
        <button
          type="button"
          className={styles.bouton}
          disabled={enCours}
          onClick={() => lancer(() => ouvrirRetour(formulaireDe({})))}
        >
          Attendre le retour du colis
        </button>
      ) : null}

      {statut === "RETOUR_ATTENDU" ? (
        <div className={styles.groupe}>
          <label className={styles.libelle} htmlFor={`preuve-${demandeId}`}>
            Numéro de suivi fourni par le client
          </label>
          <input
            id={`preuve-${demandeId}`}
            className={styles.champ}
            value={preuve}
            onChange={(evenement) => setPreuve(evenement.target.value)}
            maxLength={200}
            /*
             * `autoComplete="off"` : un numero de suivi n'appartient a aucune
             * categorie que le navigateur sache completer, et une suggestion
             * d'adresse ici serait absurde.
             */
            autoComplete="off"
          />
          <button
            type="button"
            className={styles.bouton}
            disabled={enCours || preuve.trim().length === 0}
            onClick={() =>
              lancer(() => declarerPreuveExpedition(formulaireDe({ preuve })))
            }
          >
            Enregistrer la preuve
          </button>
        </div>
      ) : null}

      {colisRecu ? null : (
        <button
          type="button"
          className={styles.bouton}
          disabled={enCours}
          onClick={() => lancer(() => declarerReception(formulaireDe({})))}
        >
          {/*
           * LE BOUTON RESTE OFFERT SUR UNE DEMANDE DEJA REMBOURSEE, regle L12 :
           * le colis peut arriver trois semaines apres le versement, et le
           * masquer rendrait ce cas insaisissable. Le statut ne bouge pas.
           */}
          Marquer le colis reçu
        </button>
      )}

      {peutRembourser && !remboursementFait ? (
        <div className={styles.groupe}>
          <label className={styles.libelle} htmlFor={`montant-${demandeId}`}>
            Montant à rembourser, en euros
          </label>
          <input
            id={`montant-${demandeId}`}
            className={styles.champ}
            value={montant}
            onChange={(evenement) => setMontant(evenement.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-describedby={`aide-montant-${demandeId}`}
          />
          <p id={`aide-montant-${demandeId}`} className={styles.aide}>
            Total payé, frais de port compris :{" "}
            {formaterMontant(montantDuCentimes)}. Les frais de livraison
            initiaux se remboursent en entier.
          </p>
          <button
            type="button"
            className={`${styles.bouton} ${styles.boutonPrincipal}`}
            disabled={enCours}
            onClick={() =>
              demarrer(async () => {
                const resultat = await rembourser(
                  formulaireDe({ montant, referenceDemande }),
                );

                setMessage(messageRemboursement(resultat));

                if (resultat.statut === "SUCCES") {
                  setRemboursementFait(true);
                }
              })
            }
          >
            Rembourser
          </button>
        </div>
      ) : null}

      {peutRefuser ? (
        <details className={styles.detail}>
          <summary className={styles.resume}>Refuser cette demande</summary>
          <p className={styles.aide}>
            {/*
             * LE TEXTE RAPPELLE QUE LE DROIT EST INCONDITIONNEL, article
             * L221-18. Un refus se motive sur la caracteristique concrete du
             * bien, jamais sur sa categorie, regle L3 : « les boucles
             * d'oreilles sont exclues » ne s'ecrit nulle part.
             */}
            Le droit de rétractation est inconditionnel. Un refus se motive au
            cas par cas, jamais par catégorie de produit.
          </p>
          <label className={styles.libelle} htmlFor={`motif-${demandeId}`}>
            Motif du refus
          </label>
          <textarea
            id={`motif-${demandeId}`}
            className={styles.zoneTexte}
            value={motifRefus}
            onChange={(evenement) => setMotifRefus(evenement.target.value)}
            maxLength={2000}
            rows={3}
          />
          <button
            type="button"
            className={styles.bouton}
            disabled={enCours || motifRefus.trim().length === 0}
            onClick={() =>
              lancer(() => refuser(formulaireDe({ motif: motifRefus })))
            }
          >
            Refuser
          </button>
        </details>
      ) : null}

      {aucunGeste ? (
        <p className={styles.aide}>
          {EXPLICATION_SANS_GESTE[statut] ??
            "Aucune action disponible sur cette demande."}
        </p>
      ) : null}

      {/*
       * LA REGION LIVE EST TOUJOURS DANS LE DOM, jamais montee a l'apparition du
       * message : un lecteur d'ecran n'annonce que ce qui CHANGE dans une region
       * deja presente. Motif rencontre en LS-85.
       *
       * SON NOM PORTE LE NUMERO DE COMMANDE, et c'est ce qui le rend utile. Une
       * premiere version posait « Resultat de la derniere action » sur CHAQUE
       * carte : toutes les regions portaient alors le meme libelle, donc
       * restaient indiscernables, ce que le nom existait justement pour eviter.
       * Pire, VoiceOver et NVDA enoncent le nom AVANT le texte, donc
       * l'exploitante entendait la meme phrase avant chaque message. Releve par
       * `ls-frontend-revue` le 3 septembre 2026.
       */}
      <p
        className={
          message === null
            ? styles.messageVide
            : message.erreur
              ? styles.messageErreur
              : styles.messageSucces
        }
        role="status"
        aria-live="polite"
        aria-label={`Résultat pour la commande ${numeroCommande}`}
      >
        {message?.texte ?? ""}
        {message?.lien === undefined ? null : (
          <>
            {" "}
            <Link href={message.lien.chemin} className={styles.lienMessage}>
              {message.lien.libelle}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
