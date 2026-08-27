/**
 * Rendu des messages, LS-82.
 *
 * CE FICHIER NE PORTE PAS LES TEXTES DEFINITIFS, ET C'EST VOLONTAIRE. Les six
 * textes F-MAIL-01 a F-MAIL-06 appartiennent a LS-29, ne sont pas ecrits, et
 * doivent etre valides par l'exploitante : ces emails sont la voix de sa marque.
 * Les ecrire ici les ferait entrer en production sans relecture, et personne ne
 * saurait ensuite qu'ils n'ont jamais ete valides.
 *
 * CE QU'IL PORTE : les trois messages que LS-70 attend deja pour
 * l'authentification, dans une forme fonctionnelle et sobre. Ils partent d'un
 * mecanisme, pas d'une intention editoriale, et un texte de service se relit
 * moins qu'une confirmation de commande.
 *
 * LE FORMAT EST DU TEXTE BRUT, sans HTML. Un message d'authentification n'a
 * aucun besoin de mise en forme, et le texte brut traverse mieux les filtres
 * anti-indesirables au demarrage d'un domaine, quand aucune reputation n'est
 * encore etablie.
 *
 * AUCUN DELAI NI ENGAGEMENT N'EST INVENTE ici, regle de redaction de LS-29 : la
 * duree de validite annoncee vient de la configuration reelle du jeton, passee
 * en variable, jamais d'un chiffre ecrit a la main.
 */
import type { MessageEmail, ModeleEmail } from "./index";

export type MessageRendu = {
  objet: string;
  texte: string;
};

/**
 * Nom de la boutique tel qu'il apparait en signature.
 *
 * UNE CONSTANTE ET NON UNE VARIABLE D'ENVIRONNEMENT : c'est le nom de la
 * marque, il ne change pas d'un environnement a l'autre, et le rendre
 * configurable inviterait a le modifier sans arbitrage.
 */
const SIGNATURE = "Lune & Soleil";

/**
 * Une variable attendue, ou un refus explicite.
 *
 * POURQUOI LEVER PLUTOT QUE RENDRE UNE CHAINE VIDE. Un lien de verification
 * absent produirait un message poli et inutilisable, que le client recevrait
 * sans pouvoir agir, et la trace en base dirait `ENVOYE`. Le defaut serait donc
 * invisible des deux cotes. Lever le rend visible avant l'envoi.
 */
function exiger(message: MessageEmail, nom: string): string {
  const valeur = message.variables[nom];

  if (!valeur) {
    throw new Error(
      `Variable « ${nom} » absente pour le modele ${message.modele}`,
    );
  }

  return valeur;
}

const RENDUS: Record<ModeleEmail, (message: MessageEmail) => MessageRendu> = {
  "verification-adresse": (message) => ({
    objet: "Confirmez votre adresse email",
    texte: [
      "Bonjour,",
      "",
      "Pour terminer la création de votre compte, confirmez votre adresse en",
      "ouvrant ce lien :",
      "",
      exiger(message, "lien"),
      "",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  "reinitialisation-mot-de-passe": (message) => ({
    objet: "Réinitialisation de votre mot de passe",
    texte: [
      "Bonjour,",
      "",
      "Une réinitialisation de mot de passe a été demandée pour votre compte.",
      "Ouvrez ce lien pour choisir un nouveau mot de passe :",
      "",
      exiger(message, "lien"),
      "",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :",
      "votre mot de passe actuel reste valable.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  /**
   * Mesure compensatoire 3 d'ADR-021.
   *
   * ELLE S'ADRESSE A L'EXPLOITANTE ET NON A UN CLIENT, seul le compte
   * administrateur se connectant par mot de passe. Le ton reste donc factuel :
   * c'est une alerte de securite, pas un message de marque.
   */
  "alerte-connexion-administration": (message) => ({
    objet: "Connexion à l'administration par mot de passe",
    texte: [
      "Bonjour,",
      "",
      "Une connexion à l'administration vient d'avoir lieu par mot de passe,",
      `le ${exiger(message, "horodatage")}.`,
      "",
      "Si cette connexion n'est pas la vôtre, changez votre mot de passe sans",
      "attendre et vérifiez vos clés d'accès.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),
};

/**
 * Rend un message a partir de son modele et de ses variables.
 *
 * LE `Record` TYPE SUR `ModeleEmail` EST LE CONTROLE D'EXHAUSTIVITE : ajouter
 * une valeur au type sans ecrire son rendu ne compile pas. C'est le meme piege
 * que celui des enums d'affichage, ou une valeur ajoutee passe en silence.
 */
export function rendreModele(message: MessageEmail): MessageRendu {
  return RENDUS[message.modele](message);
}
