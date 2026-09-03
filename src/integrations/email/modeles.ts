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

  /*
   * LS-60. LE LIEN PART A LA NOUVELLE ADRESSE, et c'est ce qui prouve qu'elle
   * appartient bien a la personne : tant qu'il n'est pas ouvert, l'ancienne
   * reste l'adresse de connexion. Une saisie erronee ne peut donc pas enfermer
   * le client hors de son compte.
   */
  "changement-adresse-verification": (message) => ({
    objet: "Confirmez votre nouvelle adresse email",
    texte: [
      "Bonjour,",
      "",
      "Vous avez demandé à utiliser cette adresse pour votre compte Lune &",
      "Soleil. Confirmez-la en ouvrant ce lien :",
      "",
      exiger(message, "lien"),
      "",
      "Tant que cette adresse n'est pas confirmée, votre ancienne adresse reste",
      "celle de votre compte.",
      "",
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  /*
   * LS-60. L'AVERTISSEMENT PART A L'ANCIENNE ADRESSE, et il n'est pas
   * decoratif : c'est le seul canal qui atteigne le proprietaire legitime si
   * quelqu'un tente de detourner son compte depuis une session ouverte. Le lien
   * qu'il porte APPROUVE le changement, donc rien ne se produit sans lui.
   */
  "changement-adresse-avertissement": (message) => ({
    objet: "Demande de changement d'adresse email",
    texte: [
      "Bonjour,",
      "",
      "Une demande de changement d'adresse email a été faite sur votre compte",
      "Lune & Soleil, vers :",
      "",
      exiger(message, "nouvelleAdresse"),
      "",
      "Si vous en êtes à l'origine, approuvez-la en ouvrant ce lien :",
      "",
      exiger(message, "lien"),
      "",
      "Sinon, ignorez ce message : votre adresse restera inchangée. Changez",
      "votre mot de passe si vous pensez que quelqu'un accède à votre compte.",
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

  /**
   * Notification d'un message de contact, LS-97.
   *
   * ELLE S'ADRESSE A L'EXPLOITANTE ET NON AU VISITEUR, comme l'alerte de
   * connexion ci-dessus. Le visiteur, lui, ne recoit rien : son accuse de
   * reception est l'ecran, qui confirme l'enregistrement.
   *
   * LE CORPS DU MESSAGE N'Y FIGURE PAS, precaution 3 d'ADR-008 : « le contenu
   * du message n'est pas stocke, seulement son type et son destinataire ». Les
   * variables d'un modele traversent `EnvoiEnAttente.variables`, donc y recopier
   * le corps le stockerait une seconde fois, dans une table dont T9 dit qu'elle
   * est une file de travail et non une trace.
   *
   * ELLE PORTE DONC UN RENVOI ET NON UN CONTENU. Le message se lit dans
   * l'administration, ou il vit deja et ou son statut se met a jour.
   *
   * LE SUJET Y FIGURE, ET C'EST DELIBERE : sans lui, l'exploitante ne peut pas
   * distinguer une demande urgente d'une question ordinaire sans ouvrir
   * l'ecran. C'est un champ court, saisi pour etre lu, la ou le corps peut
   * porter n'importe quoi.
   */
  "message-contact-recu": (message) => ({
    objet: `Nouveau message de contact : ${exiger(message, "sujet")}`,
    texte: [
      "Bonjour,",
      "",
      `${exiger(message, "nom")} vient d'écrire par le formulaire de contact.`,
      "",
      `Sujet : ${exiger(message, "sujet")}`,
      "",
      "Le message se lit dans l'administration, rubrique Messages, où il",
      "attend d'être traité.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  /*
   * LS-134. ACCUSE DE RECEPTION SUR SUPPORT DURABLE, article L221-21. L'email
   * EST le support durable : il fait foi de la date a laquelle le client a
   * exerce son droit, et c'est pourquoi il rappelle le numero de commande.
   *
   * LES FRAIS DE RETOUR SONT ANNONCES ICI, article L221-23 : le client ne les
   * supporte QUE s'il en a ete informe, et la charge de la preuve pese sur le
   * vendeur. Une mention oubliee ne coute pas quelques euros de port, elle les
   * met a la charge de l'exploitante.
   *
   * AUCUN DELAI CHIFFRE INVENTE. Le jour limite vient du calcul de LS-133 quand
   * il est connu, et la phrase s'adapte quand il ne l'est pas : annoncer une
   * date fausse sur un droit est exactement ce que L221-20 sanctionne.
   */
  "retractation-accusee": (message) => {
    const jourLimite = message.variables.jourLimite ?? "";

    return {
      objet: `Votre rétractation a bien été reçue, commande ${exiger(message, "numero")}`,
      texte: [
        "Bonjour,",
        "",
        `Nous avons bien reçu votre demande de rétractation pour la commande ${exiger(message, "numero")}.`,
        "Ce message en accuse réception.",
        "",
        jourLimite.length > 0
          ? `Votre droit de rétractation était ouvert jusqu'au ${jourLimite} inclus.`
          : "Votre demande a été enregistrée à la date de ce message.",
        "",
        "Ce qu'il reste à faire :",
        "",
        "Renvoyez votre bijou dans les 14 jours qui suivent cette demande, dans",
        "son état d'origine et si possible dans son emballage.",
        "",
        "Les frais de retour sont à votre charge.",
        "",
        "Dès que votre colis nous parvient, ou dès que vous nous transmettez",
        "une preuve de son expédition, nous procédons au remboursement.",
        "",
        "Répondez simplement à ce message pour toute question.",
        "",
        SIGNATURE,
      ].join("\n"),
    };
  },
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
