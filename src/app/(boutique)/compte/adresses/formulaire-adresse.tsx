"use client";

/**
 * Formulaire d'ajout ou de modification d'une adresse. LS-59, etapes 2 et 4.
 *
 * COMPOSANT CLIENT PAR NECESSITE : les erreurs de saisie s'affichent sans
 * rechargement, et l'annonce au lecteur d'ecran demande un etat local.
 *
 * IL NE VALIDE RIEN QUI COMPTE. Les attributs `required` et `maxLength` sont un
 * confort de saisie, jamais une garantie : le schema Zod du serveur refait tout
 * le travail, invariant 7. Un formulaire poste hors navigateur ne les voit pas.
 */
import { useRef, useState, useTransition } from "react";

import {
  ajouterAdresseAction,
  modifierAdresseAction,
  type ResultatAdresse,
} from "./actions";
import styles from "./adresses.module.css";

export type AdresseAModifier = {
  id: string;
  libelle: string | null;
  nomComplet: string;
  ligne1: string;
  ligne2: string | null;
  codePostal: string;
  ville: string;
  telephone: string | null;
};

export function FormulaireAdresse({
  adresse,
  onTermine,
}: {
  /** Absente pour un ajout, presente pour une modification. */
  adresse?: AdresseAModifier;
  onTermine?: () => void;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");
  const [enErreur, setEnErreur] = useState(false);
  const compteRendu = useRef<HTMLParagraphElement>(null);

  const modeEdition = adresse !== undefined;

  const appliquer = (resultat: ResultatAdresse) => {
    switch (resultat.statut) {
      case "FAIT":
        setEnErreur(false);
        setMessage(
          modeEdition ? "Adresse modifiée." : "Adresse ajoutée à votre carnet.",
        );
        onTermine?.();
        break;

      case "SAISIE_INVALIDE":
        setEnErreur(true);
        // LE MESSAGE NOMME LE CHAMP FAUTIF sans reproduire la valeur refusee,
        // invariant 9 : c'est le socle Zod qui le compose.
        setMessage(resultat.message);
        break;

      case "INTROUVABLE":
        setEnErreur(true);
        setMessage("Cette adresse n'existe plus dans votre carnet.");
        break;

      case "SESSION_ABSENTE":
        setEnErreur(true);
        setMessage("Votre session a expiré.");
        break;

      case "INDISPONIBLE":
        setEnErreur(true);
        setMessage(
          "L'enregistrement est momentanément indisponible. Réessayez dans quelques instants.",
        );
        break;
    }

    // APRES le rendu du message, sinon le focus porterait sur un paragraphe
    // encore vide et le lecteur d'ecran n'annoncerait rien.
    compteRendu.current?.focus();
  };

  const soumettre = (donnees: FormData) => {
    demarrer(async () => {
      const resultat = modeEdition
        ? await modifierAdresseAction(adresse.id, donnees)
        : await ajouterAdresseAction(donnees);

      /*
       * LE SECOND `demarrer` APRES L'`await` est impose par React : un `set`
       * place apres une requete async n'est pas traite comme une transition
       * sans lui, et le compte rendu resterait bloque sur l'etat d'attente.
       * Verifie via Context7, meme correction qu'en LS-56.
       */
      demarrer(() => {
        appliquer(resultat);
      });
    });
  };

  return (
    <form action={soumettre} className={styles.formulaire}>
      <div className={styles.champ}>
        <label htmlFor="libelle">Libellé (facultatif)</label>
        <input
          id="libelle"
          name="libelle"
          type="text"
          maxLength={60}
          defaultValue={adresse?.libelle ?? ""}
          placeholder="Domicile, bureau…"
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="nomComplet">Nom du destinataire</label>
        <input
          id="nomComplet"
          name="nomComplet"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={adresse?.nomComplet ?? ""}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="ligne1">Adresse</label>
        <input
          id="ligne1"
          name="ligne1"
          type="text"
          required
          maxLength={120}
          autoComplete="address-line1"
          defaultValue={adresse?.ligne1 ?? ""}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="ligne2">Complément d&apos;adresse (facultatif)</label>
        <input
          id="ligne2"
          name="ligne2"
          type="text"
          maxLength={120}
          autoComplete="address-line2"
          defaultValue={adresse?.ligne2 ?? ""}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="codePostal">Code postal</label>
        {/*
         * `inputMode="numeric"` OUVRE LE PAVE NUMERIQUE SANS IMPOSER `type
         * number`, qui apporte des fleches inutiles et perd les zeros de tete :
         * « 06000 » deviendrait « 6000 ».
         */}
        <input
          id="codePostal"
          name="codePostal"
          type="text"
          required
          inputMode="numeric"
          maxLength={5}
          autoComplete="postal-code"
          defaultValue={adresse?.codePostal ?? ""}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="ville">Ville</label>
        <input
          id="ville"
          name="ville"
          type="text"
          required
          maxLength={80}
          autoComplete="address-level2"
          defaultValue={adresse?.ville ?? ""}
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="telephone">Téléphone (facultatif)</label>
        {/*
         * FACULTATIF, decision du 25 aout 2026 : Mondial Relay s'en sert pour la
         * notification SMS de mise a disposition, son absence degrade le service
         * sans empecher la livraison.
         */}
        <input
          id="telephone"
          name="telephone"
          type="tel"
          maxLength={20}
          autoComplete="tel"
          defaultValue={adresse?.telephone ?? ""}
        />
      </div>

      {/*
       * LE PAYS EST FIXE, la France metropolitaine etant le seul perimetre
       * desservi. Un champ libre laisserait saisir un pays que le tarif
       * Mondial Relay d'ADR-025 ne couvre pas.
       */}
      <input type="hidden" name="pays" value="FR" />

      <button type="submit" className={styles.bouton} disabled={enCours}>
        {enCours
          ? "Enregistrement…"
          : modeEdition
            ? "Enregistrer les modifications"
            : "Ajouter cette adresse"}
      </button>

      {/*
       * REGION LIVE QUI PREEXISTE A SON TEXTE : un noeud insere en meme temps
       * que son contenu n'est jamais annonce, l'observateur n'ayant rien a
       * observer. `aria-label` la nomme, sans quoi deux regions `status` d'une
       * meme page s'annoncent identiquement.
       */}
      <p
        ref={compteRendu}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        aria-label="Enregistrement de l'adresse"
        className={styles.annonce}
        data-etat={enErreur ? "erreur" : undefined}
      >
        {message === "" && enCours ? "Enregistrement…" : message}
      </p>
    </form>
  );
}
