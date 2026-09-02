"use client";

/**
 * Demande d'un lien de reinitialisation, LS-55.
 *
 * LE MESSAGE DE CONFIRMATION EST LE MEME QUE L'ADRESSE EXISTE OU NON, critere 2,
 * et c'est le point de securite de cet ecran. Dire « aucun compte avec cette
 * adresse » ferait de ce formulaire un outil d'enumeration des clients de la
 * boutique : il suffirait d'essayer des adresses pour savoir qui achete ici.
 *
 * LA CONFIRMATION REMPLACE LE FORMULAIRE plutot que de s'ajouter dessous. Un
 * formulaire encore visible sous un message de succes invite a recommencer, ce
 * qui epuise le plafond de trois demandes par minute et fait croire a une
 * panne.
 */
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import styles from "../authentification.module.css";

/**
 * Ou le lien du message ramene.
 *
 * CHEMIN RELATIF ET FIXE. Better Auth le transmet au navigateur : accepter une
 * valeur fournie ferait de l'email de reinitialisation un vecteur de
 * redirection vers un domaine tiers, depuis un message qui inspire confiance.
 */
const RETOUR_APRES_DEMANDE = "/compte/nouveau-mot-de-passe";

type EtatSoumission = "repos" | "en-cours" | "envoye" | "erreur";

export function FormulaireDemandeReinitialisation() {
  const [etat, setEtat] = useState<EtatSoumission>("repos");
  const [messageErreur, setMessageErreur] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const demander = async (evenement: React.FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setEtat("en-cours");
    setMessageErreur(null);

    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: RETOUR_APRES_DEMANDE,
    });

    /*
     * SEUL LE PLAFOND EST DISTINGUE. Better Auth rend deja la meme reponse
     * pour une adresse connue et une inconnue, ce qu'un test d'integration
     * verifie ; le 429, lui, ne dit rien du compte vise, seulement de
     * l'appareil qui insiste. Le confondre avec un succes ferait attendre un
     * message qui ne partira pas.
     */
    if (error?.status === 429) {
      setEtat("erreur");
      setMessageErreur(
        "Trop de demandes depuis cet appareil. Patientez une minute avant de réessayer.",
      );
      return;
    }

    /*
     * TOUTE AUTRE ISSUE MENE AU MEME ECRAN, succes comme echec serveur. Ce
     * n'est pas de la dissimulation : l'envoi laisse une trace en base, LS-82,
     * ou l'exploitante constate qu'un message n'est jamais parti. Afficher ici
     * une erreur technique renseignerait sur l'existence du compte a chaque
     * fois que le fournisseur tousse.
     */
    setEtat("envoye");
  };

  if (etat === "envoye") {
    return (
      <p className={styles.confirmation} role="status">
        Si un compte existe avec cette adresse, un message vient de partir.
        Ouvrez le lien qu&apos;il contient pour choisir un nouveau mot de passe.
        Il reste valable une heure.
      </p>
    );
  }

  const enCours = etat === "en-cours";

  return (
    <form className={styles.formulaire} onSubmit={demander}>
      <div className={styles.champ}>
        <label htmlFor="email">Adresse email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(evenement) => setEmail(evenement.target.value)}
          disabled={enCours}
        />
      </div>

      <button
        type="submit"
        className={styles.actionPrincipale}
        disabled={enCours}
      >
        {enCours ? "Envoi en cours…" : "Recevoir un lien"}
      </button>

      {messageErreur && (
        <p className={styles.erreur} role="alert">
          {messageErreur}
        </p>
      )}
    </form>
  );
}
