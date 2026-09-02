"use server";

/**
 * Adaptateur d'entree du profil client. LS-60.
 *
 * CE FICHIER NE DECIDE RIEN. Il lit les en-tetes, delegue et traduit. Les
 * gardes vivent dans `services/`, ou elles sont exerçables par un test : une
 * garde posee ici dependrait de `next/headers`, indisponible hors requete.
 *
 * AUCUNE ACTION NE PREND `utilisateurId`, invariant 2 : il vient de la session.
 *
 * CES GESTES NE PORTENT PAS DE MARQUE DE FAMILLE SENSIBLE, et c'est
 * volontaire. `verifier-actions-sensibles.sh` couvre les quatre familles
 * d'ADR-027, toutes propres a l'ADMINISTRATION : les etendre a l'espace client
 * obligerait un visiteur a se reauthentifier pour changer son nom.
 *
 * LA MARQUE N'EST PAS CITEE TEXTUELLEMENT DANS CE COMMENTAIRE, et l'omission
 * est deliberee : le controle cherche le motif dans TOUT le fichier, et
 * l'ecrire ici, meme pour expliquer qu'on ne l'emploie pas, le faisait echouer
 * sur « marque sans famille ». C'est le motif du hook de secrets qui bloque sa
 * propre explication, deja rencontre sur ce projet.
 *
 * LA PROTECTION EQUIVALENTE VIENT DE DEUX ENDROITS, et la formulation
 * precedente etait FAUSSE sur la seconde moitie :
 *
 *   mot de passe   `changePassword` exige le mot de passe COURANT, verifie
 *                  cote serveur avant toute ecriture
 *   adresse email  l'approbation sur l'ancienne adresse n'a lieu QUE si celle-ci
 *                  est deja verifiee. Le service refuse donc le changement quand
 *                  elle ne l'est pas, garde ajoutee apres la revue critique
 *
 * SANS CETTE GARDE, quelqu'un qui trouve un poste ouvert deplacait le compte
 * vers son adresse SANS jamais toucher la boite de la victime, qui perdait la
 * connexion et le « mot de passe oublie ». Mesure de bout en bout.
 */
import { headers } from "next/headers";

import { journaliser } from "@/lib/journal";
import { EntreeInvalideError } from "@/lib/validation";
import { exigerSession } from "@/services/autorisation";
import { changerMonEmail } from "@/services/profil-client";
import { mettreAJourProfil } from "@/services/utilisateur";

export type ResultatProfil =
  | { statut: "FAIT"; message: string }
  | { statut: "SAISIE_INVALIDE"; message: string }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "INDISPONIBLE" };

/**
 * Traduit un refus de validation en phrase lisible par le client.
 *
 * LES CAS SONT ENUMERES ET NON DERIVES DU TEXTE ZOD : ce dernier est en
 * anglais, non stabilise par un contrat, et sa reformulation par une montee de
 * version casserait silencieusement la traduction. Le champ, lui, est stable.
 *
 * LE REPLI EST GENERIQUE ET EN FRANCAIS : un champ ajoute au schema sans entree
 * ici affiche « verifiez votre saisie » plutot qu'un message anglais. On perd en
 * precision, jamais en lisibilite.
 */
function messageDeSaisie(details: string): string {
  if (details.startsWith("nom")) {
    return details.includes("Too big")
      ? "Le nom ne peut pas dépasser 120 caractères."
      : "Le nom est obligatoire.";
  }

  return "Vérifiez votre saisie.";
}

/** Enveloppe commune : session, appel, traduction des erreurs. */
async function agir(
  travail: (utilisateurId: string) => Promise<ResultatProfil>,
): Promise<ResultatProfil> {
  try {
    const identite = await exigerSession(await headers());

    if (!identite) {
      return { statut: "SESSION_ABSENTE" };
    }

    const resultat = await travail(identite.utilisateurId);

    /*
     * AUCUN `revalidatePath`, ET C'EST MESURE.
     *
     * Ma premiere version en posait deux sur le changement de nom, justifies
     * par « le nom apparait dans le champ et dans l'en-tete ». Les DEUX
     * affirmations etaient fausses, verifiees par la revue frontend :
     *
     *   l'en-tete affiche « Lune & Soleil », jamais le nom du client
     *   le champ emploie `defaultValue`, que React ignore sur un input non
     *   controle deja monte
     *
     * Les deux appels rejouaient donc `exigerSession` et une requete Prisma a
     * chaque enregistrement sans rien changer a l'ecran.
     *
     * SI UNE DONNEE AFFICHEE AILLEURS VIENT A DEPENDRE DU PROFIL, la
     * revalidation redeviendra utile : la retirer aujourd'hui est un constat,
     * pas une regle.
     */
    return resultat;
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      /*
       * LE MESSAGE EST REECRIT, JAMAIS RECOUPE. Le socle compose pour le
       * DIAGNOSTIC, et sa sortie n'est pas destinee a un ecran :
       *
       *   details reel   "nom : Too small: expected string to have >=1 characters"
       *   ma v1 affichait "Le nom : : Too small: expected string to have >=1..."
       *
       * Deux defauts en une ligne, mesures par la revue frontend. Le `slice(4)`
       * coupait « nom » mais laissait le deux-points, qui se doublait, et le
       * reste etait du Zod BRUT EN ANGLAIS sur un ecran client, contraire a la
       * regle « tous les accents presents » et a `frontend-design.md`.
       *
       * LE CAS EST ATTEIGNABLE SANS OUTIL : `maxLength` borne la frappe mais
       * pas le collage, et `required` ne bloque pas une chaine d'espaces, que
       * le service `trim()` a vide.
       *
       * LES MESSAGES SONT DONC ECRITS ICI, en francais, et le detail technique
       * reste au journal ou il sert.
       */
      journaliser("info", "Saisie de profil refusee", {
        detail: erreur.details,
      });

      return {
        statut: "SAISIE_INVALIDE",
        message: messageDeSaisie(erreur.details),
      };
    }

    journaliser("error", "Operation de profil indisponible", {
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
    return { statut: "INDISPONIBLE" };
  }
}

/**
 * Change le nom affiche, critere 1.
 *
 * IL PASSE PAR `mettreAJourProfil` DE LS-70, qui construit l'objet transmis a
 * l'ORM champ par champ : repandre l'entree, meme validee, ferait dependre la
 * securite du seul schema Zod, et une cle ajoutee par inadvertance deviendrait
 * aussitot ecrivable. Regle E11 et ADR-023.
 */
export async function changerNomAction(
  donnees: FormData,
): Promise<ResultatProfil> {
  return agir(async (utilisateurId) => {
    const nom = String(donnees.get("nom") ?? "").trim();

    await mettreAJourProfil(utilisateurId, { nom });

    return { statut: "FAIT", message: "Votre nom est enregistré." };
  });
}

/**
 * Demande le changement d'adresse email, critere 2.
 *
 * LE MESSAGE DE SUCCES DIT OU REGARDER, et il differe selon l'etat du compte,
 * mesure : sur un compte deja verifie, l'approbation part a l'ANCIENNE adresse ;
 * sinon le lien part directement a la nouvelle. Le texte couvre les deux sans
 * mentir, en nommant les deux boites.
 */
export async function changerEmailAction(
  donnees: FormData,
): Promise<ResultatProfil> {
  return agir(async () => {
    const nouvelle = String(donnees.get("email") ?? "").trim();

    if (nouvelle === "") {
      return {
        statut: "SAISIE_INVALIDE",
        message: "L'adresse email : ce champ est obligatoire.",
      };
    }

    const resultat = await changerMonEmail(await headers(), nouvelle);

    switch (resultat.etat) {
      case "VERIFICATION_ENVOYEE":
        return {
          statut: "FAIT",
          message:
            "Un message vous a été envoyé pour confirmer ce changement. Votre adresse actuelle reste valable tant qu'il n'est pas ouvert.",
        };

      case "ADRESSE_ACTUELLE_NON_VERIFIEE":
        /*
         * LE MESSAGE DIT QUOI FAIRE, et le chemin existe : `/compte` porte le
         * rappel de verification depuis LS-54. Un refus sans issue laisserait
         * le client bloque sans comprendre.
         *
         * CE REFUS FERME UNE PRISE DE CONTROLE COMPLETE, voir le service : sur
         * un compte non verifie, Better Auth n'avertit PAS l'ancienne adresse.
         */
        return {
          statut: "SAISIE_INVALIDE",
          message:
            "Confirmez d'abord votre adresse email actuelle avant de la changer. Le lien de confirmation se redemande depuis votre compte.",
        };

      case "DEJA_PRISE":
        return {
          statut: "SAISIE_INVALIDE",
          message:
            "Cette adresse ne peut pas être utilisée pour ce compte. Vérifiez votre saisie.",
        };

      case "REFUSEE":
        /*
         * LE MESSAGE PARLE DE FORMAT, le cas le plus frequent : une adresse mal
         * formee remonte ici depuis que le service la classe en refus et non en
         * panne. Dire « momentanement indisponible » a quelqu'un qui a fait une
         * faute de frappe le fait attendre au lieu de corriger.
         */
        return {
          statut: "SAISIE_INVALIDE",
          message:
            "Cette adresse email n'est pas valide. Vérifiez votre saisie.",
        };
    }
    /*
     * PAS DE RAFRAICHISSEMENT : l'adresse affichee ne change PAS encore, la
     * nouvelle n'etant ecrite qu'apres la verification. Re-rendre la page
     * detruirait le message qui explique precisement cela.
     */
  });
}

/*
 * `changerMotDePasseAction` A ETE RETIREE, ET SON ABSENCE EST VOLONTAIRE.
 *
 * Le changement de mot de passe passe desormais par le CLIENT Better Auth, voir
 * `profil/formulaires.tsx` : poser le nouveau cookie de session depuis une
 * Server Action declenche un re-rendu serveur qui s'execute avec l'ANCIEN
 * cookie, et la page redirige vers la connexion. Mesure du 2 septembre 2026.
 *
 * LA GARDER SANS APPELANT AURAIT ETE UN DEFAUT : une Server Action est un point
 * d'entree HTTP invocable sans jamais charger la page qui la porte, motif
 * « action orpheline exposee » deja en fiche sur ce projet. Le service qu'elle
 * appelait, `changerMonMotDePasse`, reste en revanche : il porte les tests
 * d'integration et la garantie que `revokeOtherSessions` est bien pose.
 */
