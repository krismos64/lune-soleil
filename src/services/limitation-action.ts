/**
 * Limitation de debit des Server Actions qui verifient un secret. LS-92,
 * ADR-027 decision 1, dont ce module etend le perimetre.
 *
 * CE QUE CE MODULE FERME, ET CE N'EST PAS CE QU'ON CROIT. Le trou n'est pas
 * tant l'absence de plafond que **l'absence de trace**, le ticket le dit et
 * c'est le point qui decide de la conception.
 *
 * Trois choses bornent deja l'enjeu du devinage lui-meme : l'appelant doit
 * detenir une session d'ADMINISTRATRICE depuis la correction de LS-89, le mot
 * de passe fait seize caracteres, ADR-023, et le devinage aleatoire est donc
 * hors de portee. Mais `verifyPassword` ne passe par aucun chemin surveille par
 * le hook de LS-80 : ces tentatives n'apparaissent NULLE PART. Une attaque par
 * cette voie serait invisible, y compris apres coup, et c'est cela qui est
 * inacceptable pour une trace de securite opposable.
 *
 * D'OU L'ORDRE DES DEUX GESTES : journaliser d'abord, plafonner ensuite. Une
 * tentative refusee par le plafond est elle-meme journalisee, avec l'issue
 * `REFUSEE_LIMITATION`, exactement comme les refus de cadence de LS-80. Le
 * volume refuse EST le signal.
 *
 * POINT 3 DU TICKET, TRANCHE : ce module est ecrit pour TOUTE Server Action qui
 * verifie un secret, pas pour le seul ecran de reauthentification. Le type
 * `ActionProtegee` ferme la liste, et une action future s'y ajoute par une ligne
 * plutot qu'en recopiant la mecanique. Traiter le seul cas d'aujourd'hui aurait
 * garanti que le suivant reparte de zero, sans trace ni plafond.
 */
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import {
  effacerCompteur,
  incrementerCompteur,
} from "@/repositories/limitation";
import {
  ADRESSE_NON_LUE,
  enregistrerTentativeConnexion,
} from "@/services/journal-connexion";

/**
 * Les actions protegees, et le plafond de chacune.
 *
 * UNE TABLE ET NON DES VALEURS EN DUR, meme motif que `TACHES` et
 * `CHEMINS_SURVEILLES` : la liste se lit d'un coup d'oeil, un ajout est une
 * ligne, et le type interdit la faute de frappe qui creerait un second compteur
 * au nom voisin.
 *
 * CINQ TENTATIVES PAR MINUTE, ALIGNE SUR `/sign-in/email` D'ADR-027, et cet
 * alignement est motive plutot que commode. Les deux chemins verifient le meme
 * secret, le mot de passe du meme compte : un plafond plus genereux ici
 * offrirait un contournement de celui-la, et un plafond plus strict punirait
 * l'exploitante qui se trompe de touche sur un mot de passe de seize
 * caracteres, alors qu'elle vient deja de franchir la connexion.
 *
 * CRITERE 3 : le seuil et la fenetre sont traces avec leur raison, comme les
 * quatre routes d'ADR-027.
 */
export const ACTIONS_PROTEGEES = {
  "reauthentification-mot-de-passe": { max: 5, fenetreSecondes: 60 },
} as const;

export type ActionProtegee = keyof typeof ACTIONS_PROTEGEES;

/** Ce que la limitation rend a l'appelant. */
export type ResultatLimitation =
  { etat: "AUTORISEE" } | { etat: "REFUSEE"; reessayerDansSecondes: number };

/**
 * La cle du compteur, prefixee pour ne jamais heurter celles de Better Auth.
 *
 * ELLE PORTE L'IDENTIFIANT DE SESSION ET NON L'ADRESSE IP, a la difference du
 * mecanisme integre. Deux raisons, la seconde etant decisive :
 *
 * 1. l'appelant DOIT deja detenir une session d'administration pour atteindre
 *    ce chemin, LS-89 : la session est donc toujours connue, la ou l'adresse IP
 *    peut etre nulle
 * 2. l'adresse IP N'EST PAS FIABLE ICI. Elle ne l'est que derriere le proxy
 *    correctement configure de LS-91, et une Server Action ne traverse pas
 *    necessairement le meme chemin d'en-tetes. Compter sur une valeur qui peut
 *    etre nulle donnerait un compteur unique partage par tous, ou pire, un
 *    plafond contournable en faisant varier l'en-tete
 *
 * CONSEQUENCE ASSUMEE : le plafond est par SESSION. Ouvrir une seconde session
 * remet un compteur neuf, mais ouvrir une session exige de se connecter, ce qui
 * passe par `/sign-in/email` que la limitation de Better Auth couvre bien, elle,
 * a cinq par minute. Les deux plafonds se composent au lieu de se doubler.
 */
function cleDe(action: ActionProtegee, sessionId: string): string {
  return `action:${action}|${sessionId}`;
}

/**
 * Verifie le plafond AVANT que l'action ne fasse son travail.
 *
 * A APPELER AVANT LA VERIFICATION DU SECRET, jamais apres : plafonner apres
 * coup laisserait le travail couteux, le hachage, s'executer a chaque
 * tentative, ce qui suffit a saturer le processus sans jamais franchir le
 * plafond.
 *
 * ELLE NE LEVE PAS. Un refus est un resultat ordinaire, comme le refus de mot
 * de passe de LS-89 : lever obligerait chaque appelant a distinguer le refus
 * normal de la panne, et le premier `catch` trop large avalerait les deux.
 *
 * EN CAS DE PANNE DE LA BASE, ELLE AUTORISE. Defaut OUVERT, et c'est le seul
 * endroit de ce projet ou ce choix est fait : refuser rendrait l'ecran de
 * reauthentification inutilisable des que la base tousse, donc bloquerait
 * l'exploitante hors de son administration au pire moment. Le risque accepte en
 * echange est borne par les trois garde-fous rappeles en tete de fichier, et la
 * tentative reste journalisee : une base injoignable n'efface pas la trace.
 */
export async function verifierLimitation(
  action: ActionProtegee,
  sessionId: string,
): Promise<ResultatLimitation> {
  const { max, fenetreSecondes } = ACTIONS_PROTEGEES[action];

  let compte: number;

  try {
    ({ compte } = await incrementerCompteur(
      prisma,
      cleDe(action, sessionId),
      fenetreSecondes,
    ));
  } catch (erreur) {
    journaliser(
      "error",
      "Compteur de limitation indisponible, tentative autorisee",
      {
        action,
        erreur: erreur instanceof Error ? erreur.name : typeof erreur,
      },
    );
    return { etat: "AUTORISEE" };
  }

  if (compte > max) {
    journaliser("warn", "Action sensible refusee, cadence anormale", {
      action,
      compte,
    });

    return { etat: "REFUSEE", reessayerDansSecondes: fenetreSecondes };
  }

  return { etat: "AUTORISEE" };
}

/**
 * Remet le compteur a zero apres une tentative reussie. Voir `effacerCompteur`.
 *
 * ELLE AVALE SES ERREURS : l'identite vient d'etre prouvee, faire echouer
 * l'action pour un compteur non efface serait absurde. Au pire, l'exploitante
 * garde ses tentatives consommees jusqu'a la fin de la fenetre.
 */
export async function reinitialiserLimitation(
  action: ActionProtegee,
  sessionId: string,
): Promise<void> {
  try {
    await effacerCompteur(prisma, cleDe(action, sessionId));
  } catch (erreur) {
    journaliser("warn", "Compteur de limitation non efface", {
      action,
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });
  }
}

/**
 * Journalise une tentative de verification de secret dans `JournalConnexion`.
 *
 * CRITERE 2, ET LE VRAI MOTIF DE LA STORY. Ces tentatives n'apparaissaient nulle
 * part : `verifyPassword` ne passe par aucun des chemins que le hook de LS-80
 * surveille, ni `/sign-in/email` ni `/passkey/verify-authentication`.
 *
 * `MOT_DE_PASSE` COMME MOYEN, sans valeur d'enum supplementaire : le ticket le
 * pressentait et c'est exact. Le moyen decrit CE QUI A ETE VERIFIE, et c'est
 * bien un mot de passe. Ajouter une valeur pour dire « depuis une Server
 * Action » melangerait le moyen et le chemin d'entree, et casserait le filtre
 * de l'ecran de consultation qui range par moyen.
 *
 * L'ADRESSE EMAIL VIENT DE LA SESSION, jamais d'une saisie : l'appelant est
 * deja authentifie, il n'a rien tape d'autre que son mot de passe. Ce dernier
 * n'entre par aucun champ, invariant 9, et aucune signature de cette fonction
 * ne l'accepte.
 *
 * ELLE NE LEVE JAMAIS, regle E15 : `enregistrerTentativeConnexion` avale deja
 * ses erreurs. Un journal en souffrance ne doit pas fermer la porte a
 * l'exploitante.
 */
export async function journaliserTentativeAction(entree: {
  email: string | null;
  utilisateurId: string | null;
  issue: "REUSSITE" | "ECHEC" | "REFUSEE_LIMITATION";
  adresseIp: string | null;
  agentUtilisateur: string | null;
}): Promise<void> {
  await enregistrerTentativeConnexion({
    emailTente: entree.email ?? ADRESSE_NON_LUE,
    utilisateurId: entree.utilisateurId,
    moyen: "MOT_DE_PASSE",
    issue: entree.issue,
    adresseIp: entree.adresseIp,
    agentUtilisateur: entree.agentUtilisateur,
  });
}
