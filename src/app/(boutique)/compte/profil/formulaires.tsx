"use client";

/**
 * Les trois formulaires du profil. LS-60.
 *
 * COMPOSANT CLIENT PAR NECESSITE : chaque formulaire annonce son resultat sans
 * rechargement, et l'annonce au lecteur d'ecran demande un etat local.
 *
 * CHAQUE FORMULAIRE PORTE SA PROPRE REGION LIVE, nommee. Trois regions `status`
 * anonymes sur une meme page s'annonceraient identiquement, et le client
 * n'aurait aucun moyen de savoir lequel des trois gestes a abouti.
 *
 * LA REGION VIT DANS LE COMPOSANT QUI SURVIT A L'ACTION. Aucun de ces trois
 * formulaires n'est demonte par son propre succes, contrairement au formulaire
 * d'edition du carnet : le motif « region live demontee » ne s'applique pas
 * ici, et c'est verifie plutot que suppose.
 */
import { useRef, useState, useTransition } from "react";

import {
  LONGUEUR_MAXIMALE_MOT_DE_PASSE,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
} from "@/lib/mot-de-passe";
import { changePassword } from "@/lib/auth-client";

import type { ResultatProfil } from "./actions";
import styles from "./profil.module.css";

/**
 * Un formulaire et son compte rendu, la mecanique etant identique aux trois.
 *
 * LA FACTORISATION EST ICI ET NON DANS TROIS COPIES : trois blocs `useState` et
 * `useTransition` identiques divergeraient a la premiere correction, et c'est
 * exactement ce qui a produit sept traductions differentes du meme refus avant
 * LS-158.
 */
function FormulaireProfil({
  titre,
  description,
  nomRegion,
  libelleBouton,
  libelleEnCours,
  action,
  reinitialiserApres,
  children,
}: {
  titre: string;
  description?: string;
  /** Nom accessible de la region live, distinct pour chaque formulaire. */
  nomRegion: string;
  libelleBouton: string;
  libelleEnCours: string;
  action: (donnees: FormData) => Promise<ResultatProfil>;
  /** Vide les champs apres un succes, pour ne pas laisser un mot de passe. */
  reinitialiserApres?: boolean;
  children: React.ReactNode;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");
  const [enErreur, setEnErreur] = useState(false);
  const [sessionPerdue, setSessionPerdue] = useState(false);
  const compteRendu = useRef<HTMLParagraphElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);

  const appliquer = (resultat: ResultatProfil) => {
    switch (resultat.statut) {
      case "FAIT":
        setEnErreur(false);
        setMessage(resultat.message);
        /*
         * LES CHAMPS SE VIDENT APRES UN SUCCES quand ils portent un mot de
         * passe : le laisser dans le DOM d'un poste partage n'apporte rien et
         * reste lisible par une extension ou un gestionnaire de mots de passe
         * mal configure.
         */
        if (reinitialiserApres === true) {
          formulaire.current?.reset();
        }
        break;

      case "SAISIE_INVALIDE":
        setEnErreur(true);
        setMessage(resultat.message);
        break;

      case "SESSION_ABSENTE":
        setEnErreur(true);
        setMessage("Votre session a expiré.");
        setSessionPerdue(true);
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
      const resultat = await action(donnees);

      // Second `demarrer` impose apres un `await`, limitation React documentee.
      demarrer(() => {
        appliquer(resultat);
      });
    });
  };

  return (
    <form ref={formulaire} action={soumettre} className={styles.formulaire}>
      <h2>{titre}</h2>
      {description !== undefined && (
        <p className={styles.texte}>{description}</p>
      )}

      {children}

      <button type="submit" className={styles.bouton} disabled={enCours}>
        {enCours ? libelleEnCours : libelleBouton}
      </button>

      <p
        ref={compteRendu}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        aria-label={nomRegion}
        className={styles.annonce}
        data-etat={enErreur ? "erreur" : undefined}
      >
        {message === "" && enCours ? libelleEnCours : message}
      </p>

      {/*
       * LE CHEMIN DE SORTIE ACCOMPAGNE LE REFUS, jamais un message seul. Le
       * seul lien de la page mene a `/compte`, qui redirigerait a son tour :
       * le client lisait « votre session a expiré » sans aucun moyen d'agir.
       * Motif deja pose par `bloc-rattachement.tsx`, recopie ici depuis LS-59.
       */}
      {sessionPerdue && (
        <p className={styles.texte}>
          <a href="/compte/connexion" className={styles.lien}>
            Se reconnecter
          </a>
        </p>
      )}
    </form>
  );
}

export function FormulaireNom({
  nomActuel,
  action,
}: {
  nomActuel: string;
  action: (donnees: FormData) => Promise<ResultatProfil>;
}) {
  return (
    <FormulaireProfil
      titre="Nom"
      nomRegion="Enregistrement du nom"
      libelleBouton="Enregistrer mon nom"
      libelleEnCours="Enregistrement…"
      action={action}
    >
      <div className={styles.champ}>
        <label htmlFor="profil-nom">Nom affiché</label>
        <input
          id="profil-nom"
          name="nom"
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          defaultValue={nomActuel}
        />
      </div>
    </FormulaireProfil>
  );
}

export function FormulaireEmail({
  emailActuel,
  action,
}: {
  emailActuel: string;
  action: (donnees: FormData) => Promise<ResultatProfil>;
}) {
  return (
    <FormulaireProfil
      titre="Adresse email"
      description={`Votre adresse actuelle est ${emailActuel}. Une nouvelle adresse doit être confirmée avant de remplacer celle-ci : d'ici là, vous continuez à vous connecter avec l'actuelle.`}
      nomRegion="Changement d'adresse email"
      libelleBouton="Demander le changement"
      libelleEnCours="Envoi en cours…"
      action={action}
    >
      <div className={styles.champ}>
        <label htmlFor="profil-email">Nouvelle adresse email</label>
        <input
          id="profil-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </div>
    </FormulaireProfil>
  );
}

/**
 * Changement de mot de passe, critere 3.
 *
 * IL PASSE PAR LE CLIENT BETTER AUTH ET NON PAR UNE SERVER ACTION, et c'est une
 * correction mesuree, non une preference.
 *
 * `revokeOtherSessions` supprime toutes les sessions puis en recree une : le
 * cookie CHANGE. Poser ce nouveau cookie depuis une Server Action declenche un
 * re-rendu SERVEUR de la page, verifie via Context7 sur Next.js 16, et ce
 * re-rendu s'execute avec l'ANCIEN cookie encore dans la requete :
 * `exigerSession` rend `null` et la page redirige vers `/compte/connexion`.
 *
 * Mesure du 2 septembre : le client changeait son mot de passe et se retrouvait
 * DEHORS, alors que le cookie etait pourtant correctement remplace. Le chemin
 * client pose le cookie par une reponse HTTP ordinaire, sans re-rendu.
 *
 * LES DEUX GARANTIES TIENNENT, MAIS PAR DEUX MECANISMES DIFFERENTS, et la
 * formulation precedente les confondait :
 *
 *   `currentPassword`       verifie par Better Auth avant toute ecriture, la
 *                           route levant `INVALID_PASSWORD`
 *   `revokeOtherSessions`   simple champ du CORPS que le serveur se contente de
 *                           lire. Le poser ici ne garantit RIEN : un appel
 *                           direct a `/api/auth/change-password` avec `false`
 *                           conserverait les autres sessions
 *
 * LA SECONDE EST DONC IMPOSEE PAR UN HOOK `before`, voir
 * `lib/hook-revocation-sessions.ts`, la ou aucun appelant ne l'atteint. Ce que
 * ce composant pose est un defaut d'interface, pas une garantie. Releve par la
 * revue critique : trois commentaires affirmaient une protection que le code ne
 * tenait plus depuis le passage au client.
 */
export function FormulaireMotDePasse({
  longueurMinimale,
}: {
  longueurMinimale: number;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState("");
  const [enErreur, setEnErreur] = useState(false);
  const compteRendu = useRef<HTMLParagraphElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);

  const soumettre = (donnees: FormData) => {
    demarrer(async () => {
      /*
       * LE `catch` COUVRE LA PANNE, et son absence etait un ecart avec les deux
       * autres formulaires : sur une coupure reseau ou une reponse non JSON, le
       * client Better Auth REJETTE la promesse. La rejection traversait le
       * `demarrer`, aucun `setMessage` n'etait atteint, la region live restait
       * vide et le bouton restait bloque sur « Changement… », `enCours` ne
       * retombant jamais.
       *
       * Le repli textuel plus bas ne couvre pas ce cas : il ne s'execute que si
       * `resultat.error` existe, donc si la reponse est ARRIVEE. Releve par la
       * revue frontend.
       */
      let resultat: Awaited<ReturnType<typeof changePassword>> | null = null;

      try {
        resultat = await changePassword({
          currentPassword: String(donnees.get("motDePasseCourant") ?? ""),
          newPassword: String(donnees.get("nouveauMotDePasse") ?? ""),
          /*
           * POSE ICI PAR DEFAUT D'INTERFACE, jamais comme garantie : ce champ
           * appartient au CORPS de la requete, donc a l'appelant. La garantie
           * vient du hook `before` de `lib/hook-revocation-sessions.ts`, la ou
           * aucun appelant ne l'atteint.
           */
          revokeOtherSessions: true,
        });
      } catch {
        demarrer(() => {
          setEnErreur(true);
          setMessage(
            "Le changement est momentanément indisponible. Réessayez dans quelques instants.",
          );
          compteRendu.current?.focus();
        });
        return;
      }

      // Second `demarrer` impose apres un `await`, limitation React documentee.
      demarrer(() => {
        if (resultat.error === null || resultat.error === undefined) {
          setEnErreur(false);
          setMessage(
            "Votre mot de passe est modifié. Vos autres sessions ont été fermées.",
          );
          /*
           * LES CHAMPS SE VIDENT : laisser un mot de passe dans le DOM d'un
           * poste partage n'apporte rien.
           */
          formulaire.current?.reset();
        } else {
          setEnErreur(true);

          /*
           * LE CLASSEMENT S'ANCRE SUR LE CODE, mesure et non suppose :
           * `INVALID_PASSWORD` et `PASSWORD_TOO_SHORT`. Deviner sur le message
           * anglais casserait a la premiere reformulation.
           *
           * LES DEUX MOTIFS SE DISTINGUENT parce qu'ils appellent deux gestes :
           * les confondre ferait ressaisir l'ancien mot de passe a quelqu'un
           * dont le nouveau est simplement trop court.
           */
          const code = String(resultat.error.code ?? "");

          /*
           * `PASSWORD_TOO_SHORT` ET `PASSWORD_TOO_LONG` SE DISTINGUENT, et les
           * confondre affichait « au moins 16 caracteres » pour un mot de passe
           * TROP LONG, message faux qui pousse au geste inverse du bon. Le
           * prefixe commun `PASSWORD_TOO` les melangeait. Releve par la revue
           * frontend.
           */
          setMessage(
            code === "INVALID_PASSWORD"
              ? "Le mot de passe actuel est incorrect."
              : code === "PASSWORD_TOO_SHORT"
                ? `Le nouveau mot de passe doit contenir au moins ${LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères.`
                : code === "PASSWORD_TOO_LONG"
                  ? `Le nouveau mot de passe ne peut pas dépasser ${LONGUEUR_MAXIMALE_MOT_DE_PASSE} caractères.`
                  : "Ce changement a été refusé. Vérifiez votre saisie.",
          );
        }

        compteRendu.current?.focus();
      });
    });
  };

  return (
    <form ref={formulaire} action={soumettre} className={styles.formulaire}>
      <h2>Mot de passe</h2>
      <p className={styles.texte}>
        Changer votre mot de passe ferme vos autres sessions ouvertes, sur vos
        autres appareils.
      </p>

      <div className={styles.champ}>
        <label htmlFor="profil-courant">Mot de passe actuel</label>
        {/*
         * `autoComplete="current-password"` ET `"new-password"` SONT DISTINCTS,
         * et ce n'est pas cosmetique : un gestionnaire de mots de passe propose
         * l'existant sur le premier et engendre une valeur neuve sur le second.
         * Les confondre ferait remplir les deux avec l'ancien.
         */}
        <input
          id="profil-courant"
          name="motDePasseCourant"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      <div className={styles.champ}>
        <label htmlFor="profil-nouveau">Nouveau mot de passe</label>
        <input
          id="profil-nouveau"
          name="nouveauMotDePasse"
          type="password"
          required
          minLength={longueurMinimale}
          /*
           * LA BORNE HAUTE MANQUAIT, mesure `maxLength: -1`. Le service traduit
           * pourtant `PASSWORD_TOO_LONG` : le champ le signale desormais avant
           * l'aller-retour.
           */
          maxLength={LONGUEUR_MAXIMALE_MOT_DE_PASSE}
          autoComplete="new-password"
          aria-describedby="profil-aide-mot-de-passe"
        />
        {/*
         * L'AIDE EST RATTACHEE PAR `aria-describedby` : un texte voisin qu'un
         * lecteur d'ecran ne lit pas au moment de la saisie n'aide personne.
         */}
        <p id="profil-aide-mot-de-passe" className={styles.aide}>
          Au moins {longueurMinimale} caractères.
        </p>
      </div>

      <button type="submit" className={styles.bouton} disabled={enCours}>
        {enCours ? "Changement…" : "Changer mon mot de passe"}
      </button>

      <p
        ref={compteRendu}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        aria-label="Changement de mot de passe"
        className={styles.annonce}
        data-etat={enErreur ? "erreur" : undefined}
      >
        {message === "" && enCours ? "Changement…" : message}
      </p>
    </form>
  );
}
