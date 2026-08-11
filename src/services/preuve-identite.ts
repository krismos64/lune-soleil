/**
 * Etablissement d'une preuve d'identite. LS-89, ADR-027 decision 3.
 *
 * CE MODULE EST LE SEUL POINT D'ENTREE QUI DOIT APPELER
 * `enregistrerPreuveIdentite`, et c'est la propriete centrale de cette story.
 *
 * Cette derniere ne verifie rien : elle enregistre un fait deja etabli. Un
 * appelant qui l'invoquerait sans avoir valide la passkey ou le mot de passe
 * juste avant se declarerait reauthentifie tout seul, et **aucun controle
 * automatique ne detecte cela**. Concentrer la verification et l'enregistrement
 * dans une seule fonction, ici, est ce qui rend la relecture humaine tenable :
 * il n'y a qu'un endroit a relire.
 *
 * POURQUOI UN SERVICE ET NON UNE SERVER ACTION QUI FERAIT TOUT. Une Server
 * Action est un adaptateur d'entree, elle ne porte pas de decision. La
 * verification du mot de passe et l'ecriture de la preuve forment une decision
 * de securite, elles vivent donc dans `services/`, conformement au fichier de
 * garde du dossier.
 */
import { APIError } from "better-auth/api";

import { auth } from "@/lib/auth";
import { journaliser } from "@/lib/journal";
import {
  enregistrerPreuveIdentite,
  FENETRE_REAUTHENTIFICATION_MS,
} from "@/services/reauthentification";

export { FENETRE_REAUTHENTIFICATION_MS };

/**
 * Ce qu'une tentative de preuve rend a l'appelant.
 *
 * PAS D'EXCEPTION POUR UN MOT DE PASSE FAUX. Un refus est ici un resultat
 * ordinaire, pas un incident : l'exploitante se trompe de touche, l'ecran
 * reaffiche le formulaire. Lever obligerait chaque appelant a distinguer le
 * refus normal de la panne, et le premier `catch` trop large avalerait les deux.
 */
export type ResultatPreuve =
  | { etat: "ETABLIE" }
  /** Mot de passe faux. Le message ne dit jamais lequel des deux a echoue. */
  | { etat: "REFUSEE" }
  /** Aucune session valide : il faut se reconnecter, pas se reauthentifier. */
  | { etat: "SESSION_ABSENTE" };

/**
 * Verifie le mot de passe de la session courante, puis note la preuve.
 *
 * LES DEUX GESTES SONT INDISSOCIABLES ET DANS CET ORDRE, c'est tout l'objet de
 * cette fonction. La verification precede l'enregistrement, et rien entre les
 * deux ne peut echouer silencieusement : `verifyPassword` leve sur un mot de
 * passe faux, donc l'enregistrement est inatteignable sans preuve.
 *
 * `auth.api.verifyPassword` CONFIRME SANS CREER DE SESSION, verifie via
 * Context7 sur Better Auth 1.6 : il est garde par `sensitiveSessionMiddleware`,
 * qui exige une session valide, et leve `INVALID_PASSWORD` en `BAD_REQUEST`
 * sinon. C'est exactement ce qu'il faut ici : l'exploitante EST connectee, on
 * verifie que c'est bien elle devant l'ecran.
 *
 * LE MOT DE PASSE NE SORT PAS DE CETTE FONCTION. Il n'est ni journalise, ni
 * mesure, ni recopie dans un message d'erreur. Invariant 9.
 *
 * LA SESSION VIENT DES EN-TETES, jamais d'un parametre : aucune signature de ce
 * module n'accepte d'identifiant de session, ce qui serait le chemin que
 * l'invariant 2 interdit.
 */
export async function prouverIdentiteParMotDePasse(
  enTetes: Headers,
  motDePasse: string,
): Promise<ResultatPreuve> {
  const session = await auth.api.getSession({ headers: enTetes });

  if (!session?.session) {
    return { etat: "SESSION_ABSENTE" };
  }

  try {
    await auth.api.verifyPassword({
      body: { password: motDePasse },
      headers: enTetes,
    });
  } catch (erreur) {
    /**
     * UN `APIError` EST UN REFUS, tout le reste est une panne et se propage.
     *
     * Traiter toute exception comme un refus masquerait une base injoignable
     * en « mot de passe faux » : l'exploitante saisirait le bon mot de passe
     * en boucle sans comprendre, pendant qu'un incident reel passerait
     * inapercu. Le defaut reste ferme dans les deux cas, aucune preuve n'est
     * ecrite, mais le diagnostic change du tout au tout.
     */
    if (erreur instanceof APIError) {
      journaliser("warn", "Preuve d'identite refusee", {
        moyen: "MOT_DE_PASSE",
      });
      return { etat: "REFUSEE" };
    }

    throw erreur;
  }

  // LE MOT DE PASSE EST VERIFIE, la preuve peut s'ecrire. Aucune instruction
  // entre les deux : ce voisinage EST la garantie que la relecture doit voir.
  await enregistrerPreuveIdentite(session.session.id);

  journaliser("info", "Preuve d'identite etablie", { moyen: "MOT_DE_PASSE" });

  return { etat: "ETABLIE" };
}

/**
 * Note la preuve apres l'ouverture d'une session neuve, passkey comprise.
 *
 * POURQUOI CETTE FONCTION EXISTE SEPAREMENT. La negociation WebAuthn se fait
 * dans le navigateur et se termine chez Better Auth, qui cree une SESSION
 * NEUVE : le serveur ne peut pas la rejouer ni verifier l'assertion une seconde
 * fois. Ce qu'il peut constater, c'est qu'une session vient d'etre ouverte.
 *
 * CE QUE LA CONDITION PROUVE EXACTEMENT, ET CE QU'ELLE NE PROUVE PAS. Elle
 * atteste que la session a ete creee A L'INSTANT, quel qu'en soit le MOYEN :
 * une connexion par mot de passe produit une session tout aussi neuve. Le
 * commentaire precedent affirmait qu'elle constatait la negociation WebAuthn,
 * ce qui est faux, et un lecteur s'y serait fie pour autoriser ce chemin sur un
 * compte sans mot de passe. Corrige en relecture.
 *
 * CE QU'ELLE FERME MALGRE TOUT, et c'est ce qui compte : un appel depuis une
 * session ouverte de longue date. Sans elle, n'importe quelle session
 * d'administration suffirait a se declarer reauthentifie sans rien prouver du
 * tout, ce qui est le trou que le ticket signale.
 *
 * LES DEUX CHEMINS ACCORDENT LA MEME CHOSE, ce qui borne l'enjeu : quelqu'un
 * qui peut ouvrir une session neuve peut deja prouver son identite par le
 * chemin du mot de passe. Il n'y a donc rien a gagner a emprunter celui-ci.
 *
 * SOIXANTE SECONDES ET NON DIX, second correctif de la relecture. Better Auth
 * cree la session AVANT que le navigateur ne rende la main : sur un Mac qui se
 * reveille ou un lecteur USB a code PIN, la negociation WebAuthn depasse
 * couramment dix secondes, et l'exploitante recevait alors « Verifiez votre
 * saisie » alors que sa passkey avait parfaitement fonctionne. Une minute reste
 * tres en deca des quinze minutes de validite de la preuve.
 */
export const FENETRE_SESSION_NEUVE_MS = 60_000;

export async function prouverIdentiteParPasskey(
  enTetes: Headers,
  maintenant: Date = new Date(),
): Promise<ResultatPreuve> {
  const session = await auth.api.getSession({ headers: enTetes });

  if (!session?.session) {
    return { etat: "SESSION_ABSENTE" };
  }

  const creeeLe = new Date(session.session.createdAt);
  const age = maintenant.getTime() - creeeLe.getTime();

  if (age > FENETRE_SESSION_NEUVE_MS || age < 0) {
    /**
     * Session trop ancienne, ou datee dans le futur. Le second cas trahit une
     * horloge dereglee ou une donnee corrompue : le defaut reste ferme
     * plutot que d'accorder une preuve sur un age negatif.
     */
    journaliser("warn", "Preuve par passkey refusee, session non neuve", {
      moyen: "PASSKEY",
    });
    return { etat: "REFUSEE" };
  }

  await enregistrerPreuveIdentite(session.session.id, maintenant);

  journaliser("info", "Preuve d'identite etablie", { moyen: "PASSKEY" });

  return { etat: "ETABLIE" };
}
