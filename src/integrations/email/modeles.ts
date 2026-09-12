/**
 * Rendu des messages, LS-82.
 *
 * CE FICHIER PORTE LES TEXTES DEFINITIFS DEPUIS LS-29, 12 septembre 2026. Son
 * en-tete disait l'inverse jusque-la, « les six textes F-MAIL-01 a F-MAIL-06
 * [...] ne sont pas ecrits » : c'etait vrai, et la phrase a survecu a ce qu'elle
 * decrivait.
 *
 * LE TON VIENT DE L'EXPLOITANTE, recueilli en seance : signature « L'atelier
 * Lune-soleil », vouvoiement, « article » et jamais « bijou », « nous » et
 * jamais « je ». Trace dans `docs/prive/REPONSES-EXPLOITANTE.md`, hors depot.
 * Ne pas reecrire un texte sans connaitre ces consignes, un test les fige.
 *
 * F-MAIL-02, LA FACTURE, N'A PAS DE MODELE ET CE N'EST PAS UN OUBLI : elle est
 * portee par le lien signe de `commande-confirmee`, permanent et personnel.
 *
 * LE COMPTE DE MODELES NE S'ECRIT PAS ICI, il se mesure sur le type
 * `ModeleEmail`. Il a deja ete ecrit faux deux fois le jour meme de LS-29.
 *
 * LE FORMAT EST DU TEXTE BRUT, sans HTML. Le texte brut traverse mieux les
 * filtres anti-indesirables au demarrage d'un domaine, quand aucune reputation
 * n'est encore etablie. **LS-222 porte la mise en forme**, et le texte devra y
 * rester en repli : un message sans version texte est penalise par les filtres.
 *
 * AUCUN DELAI NI ENGAGEMENT N'EST INVENTE ici, regle de redaction de LS-29 : la
 * duree de validite annoncee vient de la configuration reelle du jeton, passee
 * en variable, jamais d'un chiffre ecrit a la main.
 */
import type { MessageEmail, ModeleEmail } from "./index";
import { NOM_BOUTIQUE } from "@/lib/seo";

export type MessageRendu = {
  objet: string;
  texte: string;
};

/**
 * La signature des messages adresses a un client.
 *
 * UNE CONSTANTE ET NON UNE VARIABLE D'ENVIRONNEMENT : c'est le nom de la
 * marque, il ne change pas d'un environnement a l'autre, et le rendre
 * configurable inviterait a le modifier sans arbitrage.
 *
 * « L'ATELIER » EST DERIVE DE `NOM_BOUTIQUE` ET NON RECOPIE, LS-29. La forme
 * vient de l'exploitante, qui signe ainsi le 12 septembre 2026 ; le nom, lui,
 * reste tenu par `src/lib/seo.ts`, seule source de la graphie depuis LS-193.
 * Ecrire « L'atelier Lune-soleil » en dur ferait de ce fichier une DEUXIEME
 * source du nom, exactement ce que `verifier-graphie-marque.sh` empeche : douze
 * fichiers portaient « Lune & Soleil » en dur jusqu'au 8 septembre 2026.
 *
 * LES NOTIFICATIONS D'ADMINISTRATION NE L'EMPLOIENT PAS. Elles vont a la boite
 * de la boutique, que seule l'exploitante lit : se signer un message a
 * soi-meme serait du decor.
 */
const SIGNATURE = `L'atelier ${NOM_BOUTIQUE}`;

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
      /*
       * LE NOM EST DERIVE, LS-193, ET IL ETAIT COUPE SUR DEUX LIGNES.
       *
       * L'enveloppement a 80 colonnes separait « Lune & » de « Soleil », donc
       * AUCUNE recherche de la chaine complete ne pouvait le trouver : le
       * modele jumeau ci-dessous a ete corrige, celui-ci non, et les deux
       * emails du meme parcours ont diverge. Motif « motif de recherche et
       * retour a la ligne », deja en fiche. Releve par `ls-frontend-revue`.
       */
      `Vous avez demandé à utiliser cette adresse pour votre compte ${NOM_BOUTIQUE}.`,
      "Confirmez-la en ouvrant ce lien :",
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
      `${NOM_BOUTIQUE}, vers :`,
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
  /*
   * L'ADRESSE ENTRE DANS CETTE NOTIFICATION, arbitrage de Christophe du
   * 12 septembre 2026, et le CORPS reste dehors.
   *
   * CE QUE L'ADRESSE REPARE : l'exploitante devait ouvrir l'administration pour
   * connaitre l'adresse et pouvoir repondre. Sur un telephone entre deux
   * marches, c'est un aller-retour de trop pour une action qui tient dans le
   * bouton « Repondre » de sa boite.
   *
   * POURQUOI LE CORPS NE SUIT PAS, et ce n'est pas une question de taille. La
   * precaution 3 d'ADR-008 vise la DOUBLE CONSERVATION : `EnvoiEnAttente` est
   * une file de travail, T9, avec sa propre duree. Un visiteur qui demande
   * l'effacement verrait son message disparaitre de `Message` pendant que sa
   * copie survivrait dans la file, ce qu'aucun controle ne signalerait.
   * L'adresse est courte et deja dans `Message` : le meme raisonnement ne
   * s'applique pas a elle de la meme facon.
   */
  "message-contact-recu": (message) => ({
    objet: `Nouveau message : ${exiger(message, "sujet")}`,
    texte: [
      `${exiger(message, "nom")} vient d'écrire par le formulaire de contact.`,
      "",
      `Adresse : ${exiger(message, "email")}`,
      `Sujet : ${exiger(message, "sujet")}`,
      `Reçu le : ${exiger(message, "date")}`,
      "",
      `Répondez directement à ${exiger(message, "email")}.`,
      "",
      "Le message complet se lit dans l'administration, rubrique Messages.",
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
  /*
   * LS-172. CONFIRMATION DE COMMANDE, PORTEUSE DES DEUX LIENS SIGNES.
   *
   * C'EST LE SEUL CHEMIN PAR LEQUEL UN CLIENT SANS COMPTE ATTEINT SA FACTURE ET
   * SON DROIT DE RETRACTATION. La valeur en clair des jetons n'existe qu'a
   * l'instant de leur creation, regle L5 : si ce message ne part pas, elle est
   * perdue, et seule une reemission manuelle la retrouve.
   *
   * LES DEUX LIENS SONT DISTINCTS, regle L6, moindre privilege : une fuite du
   * lien de facture ne doit pas donner le pouvoir de retracter la commande
   * d'autrui. Ne jamais les fusionner en un seul jeton « qui ouvre tout ».
   *
   * `exiger` SUR LES DEUX, ET C'EST DELIBERE. Un lien absent produirait un
   * message poli et inutilisable, dont la trace en base dirait `ENVOYE` : le
   * defaut serait invisible des deux cotes. Lever le rend visible avant l'envoi,
   * et l'outbox retentera une fois la cause corrigee.
   *
   * LA MENTION DES FRAIS DE RETOUR ACCOMPAGNE CELLE DE LA RETRACTATION, article
   * L221-23 et `frontend-design.md` : sans elle, ces frais reviennent au
   * vendeur, et la charge de la preuve pese sur lui.
   *
   * AUCUN DELAI D'ACHEMINEMENT CHIFFRE. Le transporteur n'est pas branche,
   * LS-131, et annoncer « sous 48 heures » serait une information
   * precontractuelle fausse.
   */
  "commande-confirmee": (message) => ({
    objet: `Votre commande ${exiger(message, "numero")} est confirmée`,
    texte: [
      "Bonjour,",
      "",
      "Merci pour votre commande. Votre paiement est bien reçu, et nous",
      "préparons votre article avec soin.",
      "",
      "Votre facture :",
      "",
      exiger(message, "lienFacture"),
      "",
      "Vous disposez de 14 jours après réception pour changer d'avis, sans",
      "avoir à vous justifier. Pour vous rétracter :",
      "",
      exiger(message, "lienRetractation"),
      "",
      "Les frais de retour sont à votre charge.",
      /*
       * L'ANCIENNE PHRASE ETAIT FAUSSE, ET C'EST CHRISTOPHE QUI L'A VU le
       * 12 septembre 2026. Elle disait que ces liens « ne sont pas retrouvables
       * ailleurs », alors que l'ecran de detail de commande de l'espace client
       * porte la facture ET la retractation, et qu'une commande passee sans
       * compte se rattache apres inscription.
       *
       * Elle est remplacee par une phrase qui rend service : le client sans
       * compte apprend qu'il peut en creer un, celui qui en a un sait ou
       * chercher. Aucune promesse sur ce que l'administration peut renvoyer,
       * qui ne sait pas regenerer ces liens aujourd'hui.
       */
      "",
      "Ces deux liens vous sont personnels. Si vous avez un compte, vous",
      "retrouvez aussi votre facture et cette démarche dans votre espace",
      "client.",
      "",
      "Répondez simplement à ce message pour toute question.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

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
        "Renvoyez votre article dans les 14 jours qui suivent cette demande,",
        "dans son état d'origine et si possible dans son emballage.",
        "",
        "Les frais de retour sont à votre charge.",
        "",
        "Dès que votre colis nous parvient, nous procédons au remboursement.",
        "",
        "Répondez simplement à ce message pour toute question.",
        "",
        SIGNATURE,
      ].join("\n"),
    };
  },

  /**
   * LS-61, invitation a deposer un avis apres livraison constatee.
   *
   * AUCUNE CONTREPARTIE N'EST PROMISE, ET C'EST UNE OBLIGATION. L'article
   * D111-10 2° impose d'annoncer l'existence ou non d'une contrepartie : il n'y
   * en a aucune, et un message qui suggererait une reduction contre un avis
   * rendrait l'annonce fausse en plus de biaiser les avis recus.
   *
   * LE DELAI DE PUBLICATION EST ANNONCE et vient de la configuration, jamais
   * d'un chiffre ecrit ici : le meme delai est publie dans la rubrique
   * d'information, et deux valeurs recopiees divergeraient au premier
   * changement.
   *
   * IL NE PROMET PAS LA PUBLICATION. Un avis est relu avant publication, regle
   * R4, et peut etre refuse : ecrire « votre avis sera publie » serait faux.
   */
  "invitation-avis": (message) => ({
    objet: `Votre avis sur la commande ${exiger(message, "numero")}`,
    texte: [
      "Bonjour,",
      "",
      `Votre commande ${exiger(message, "numero")} vous a été remise.`,
      "",
      `Pièces concernées : ${exiger(message, "pieces")}.`,
      "",
      "Si vous le souhaitez, vous pouvez déposer un avis sur votre achat :",
      "",
      exiger(message, "lien"),
      "",
      "Le dépôt est libre et sans contrepartie d'aucune sorte.",
      "",
      `Chaque avis est relu avant publication, sous ${exiger(message, "delaiPublicationJours")} jours au plus.`,
      "",
      "Répondez simplement à ce message pour toute question.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  /*
   * F-MAIL-03, LS-29. L'expedition, avec le suivi du transporteur.
   *
   * « VOTRE COLIS EST EN ROUTE » EN OBJET ET EN PREMIERE LIGNE, et la
   * repetition est voulue : l'objet doit se lire dans une liste de messages,
   * ou seule la premiere ligne est visible. Formulation de l'exploitante.
   *
   * LE SUIVI PEUT ETRE MUET AU DEPART, et le dire evite un message d'inquietude
   * une heure apres l'envoi : le transporteur active le numero a sa premiere
   * prise en charge, pas a l'edition de l'etiquette.
   */
  "expedition-en-route": (message) => {
    /*
     * LE NUMERO DE SUIVI EST FACULTATIF, ET DEUX CHEMINS L'EXPLIQUENT. Une
     * expedition declaree a la main pour une remise en main propre n'en porte
     * aucun, `numeroSuivi` etant nullable au schema. L'exiger ferait lever sur
     * un cas parfaitement legitime, et le client ne recevrait rien.
     *
     * AUCUN LIEN VERS LE TRANSPORTEUR N'EST CONSTRUIT ICI, ET C'EST DELIBERE.
     * Fabriquer une URL de suivi Mondial Relay dans ce fichier inventerait une
     * adresse que rien ne verifie : elle se perimerait au premier changement de
     * leur site, sans qu'aucun test ne le voie, et le client recevrait un lien
     * mort. Le renvoi va donc a l'espace client, qui porte deja le suivi.
     */
    const numeroSuivi = message.variables.numeroSuivi ?? "";

    return {
      objet: "Votre colis est en route",
      texte: [
        "Bonjour,",
        "",
        "Votre colis est en route. Votre article a quitté l'atelier",
        "aujourd'hui.",
        "",
        `Mode de livraison : ${exiger(message, "mode")}`,
        ...(numeroSuivi.length > 0 ? [`Numéro de suivi : ${numeroSuivi}`] : []),
        "",
        ...(numeroSuivi.length > 0
          ? [
              "Le suivi peut mettre quelques heures à s'activer chez le",
              "transporteur.",
              "",
            ]
          : []),
        "Vous suivez votre commande dans votre espace client, si vous en",
        "avez un.",
        "",
        "Répondez simplement à ce message pour toute question.",
        "",
        SIGNATURE,
      ].join("\n"),
    };
  },

  /*
   * F-MAIL-04, LS-29. Le remboursement, total ou partiel.
   *
   * IL ANNONCE CE QUI EST FAIT, JAMAIS CE QUI EST PREVU. La regle de redaction
   * de LS-29 l'impose : « les emails d'annulation, de remboursement et de
   * retractation refletent l'etat reel et jamais un etat suppose ». Ce message
   * part APRES l'envoi du remboursement, et le montant est celui qui a ete
   * envoye.
   *
   * LE DELAI BANCAIRE N'EST PAS CHIFFRE, et c'est deliberе : il depend de la
   * banque du client et d'aucune decision de la boutique. Annoncer « sous trois
   * jours » serait un engagement que personne ne peut tenir.
   */
  "remboursement-envoye": (message) => ({
    objet: `Votre remboursement pour la commande ${exiger(message, "numero")}`,
    texte: [
      "Bonjour,",
      "",
      `Votre remboursement de ${exiger(message, "montant")} a été envoyé pour la`,
      `commande ${exiger(message, "numero")}.`,
      "",
      /*
       * LE NUMERO D'AVOIR ET NON UN LIEN, ET C'EST UNE MESURE PLUTOT QU'UN
       * CHOIX DE STYLE. Le chemin de remboursement ne cree AUCUN jeton d'acces
       * pour l'avoir, a la difference de la facture que `commande-confirmee`
       * porte : fabriquer ici une URL signee demanderait d'emettre ce jeton
       * dans la transaction, ce qui deborde LS-29. Annoncer un lien absent
       * serait pire que de donner la reference.
       */
      `Votre avoir porte le numéro ${exiger(message, "numeroAvoir")}.`,
      "Vous le retrouvez dans votre espace client, si vous en avez un.",
      "",
      "Selon votre banque, le montant apparaît sur votre compte sous",
      "quelques jours.",
      "",
      "Répondez simplement à ce message pour toute question.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  /*
   * F-MAIL-06, LS-29. L'accuse envoye au visiteur qui ecrit par le formulaire.
   *
   * LES 24 HEURES VIENNENT DE L'EXPLOITANTE, ELLES NE SONT PAS INVENTEES, et la
   * nuance porte toute la regle. LS-29 interdit un delai « invente » : celui-ci
   * est une reponse donnee par la personne qui repondra, tracee dans
   * `docs/prive/REPONSES-EXPLOITANTE.md` section 4.
   *
   * IL EST PUBLIABLE LA OU UN DELAI D'EXPEDITION NE LE SERAIT PAS, et le meme
   * document l'explique : un delai de reponse est une estimation de service,
   * un delai d'expedition annonce sans pouvoir etre tenu est une pratique
   * commerciale trompeuse. Ne pas etendre ce raisonnement aux expeditions, dont
   * les delais restent inconnus.
   *
   * LE SUJET EST RAPPELE, LE CORPS NON. Le visiteur sait ce qu'il a ecrit, et
   * le renvoyer n'ajoute rien ; le sujet suffit a identifier de quel message il
   * s'agit s'il en a envoye plusieurs.
   */
  "message-contact-accuse": (message) => ({
    objet: "Votre message est bien arrivé",
    texte: [
      "Bonjour,",
      "",
      "Votre message est bien arrivé à l'atelier. Nous vous répondons sous",
      "24 heures.",
      "",
      "Votre message :",
      `Sujet : ${exiger(message, "sujet")}`,
      "",
      "Ce message confirme la réception, vous n'avez rien à faire.",
      "",
      SIGNATURE,
    ].join("\n"),
  }),

  /*
   * LES TROIS NOTIFICATIONS D'ADMINISTRATION, LS-29.
   *
   * ELLES NE SONT PAS SIGNEES, et c'est ce qui les distingue des six messages
   * clients. Elles vont a la boite de la boutique, que seule l'exploitante lit :
   * une signature « L'atelier Lune-soleil » sur un message qu'elle s'envoie a
   * elle-meme serait du decor.
   *
   * L'INFORMATION D'ABORD, sans formule d'appel : elles se lisent en diagonale
   * sur un telephone, et le montant ou le numero doit tomber sous l'oeil.
   */
  "admin-commande-payee": (message) => ({
    objet: `Nouvelle commande ${exiger(message, "numero")}, ${exiger(message, "montant")}`,
    texte: [
      `Commande ${exiger(message, "numero")} payée.`,
      "",
      `Montant : ${exiger(message, "montant")}`,
      `Articles : ${exiger(message, "nombreArticles")}`,
      "",
      "La commande se lit dans l'administration, rubrique Commandes.",
    ].join("\n"),
  }),

  /*
   * LES DEUX DELAIS SONT RAPPELES A L'EXPLOITANTE, et ce n'est pas redondant
   * avec l'ecran : ils courent des cette demande, articles L221-23 et L221-24,
   * et le second l'engage financierement. Les lire dans la notification evite
   * de decouvrir l'echeance en ouvrant l'administration trois jours plus tard.
   */
  "admin-retractation-demandee": (message) => ({
    objet: `Rétractation demandée, commande ${exiger(message, "numero")}`,
    texte: [
      `Rétractation demandée pour la commande ${exiger(message, "numero")}.`,
      "",
      `Client : ${exiger(message, "nom")}`,
      `Demandée le : ${exiger(message, "date")}`,
      "",
      "L'article doit revenir sous 14 jours. Vous avez ensuite 14 jours",
      "pour rembourser, frais de livraison initiaux compris.",
      "",
      "La demande se lit dans l'administration, rubrique Rétractations.",
    ].join("\n"),
  }),

  /*
   * LA DESCRIPTION VIENT DE L'ALERTE ET N'EST PAS REECRITE ICI. Les sept types
   * d'alerte, DOUBLE_ENCAISSEMENT et les autres, portent deja leur libelle :
   * le recopier ferait diverger deux formulations du meme incident.
   *
   * AUCUN MONTANT NI IDENTIFIANT DE PAIEMENT DANS CE MESSAGE, invariant 9 : une
   * alerte financiere qui transporterait la reference d'un paiement la sortirait
   * de la base vers une boite email. Le type et la date suffisent a decider d'y
   * aller.
   */
  "admin-incident-critique": (message) => ({
    objet: `Incident : ${exiger(message, "type")}`,
    texte: [
      "Une alerte critique demande votre attention.",
      "",
      `Type : ${exiger(message, "type")}`,
      `Survenue le : ${exiger(message, "date")}`,
      "",
      exiger(message, "description"),
      "",
      "Les alertes se lisent dans l'administration, rubrique Alertes.",
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
/**
 * Les modeles reellement rendus, releves sur la table et jamais recopies.
 *
 * POURQUOI CETTE EXPORTATION EXISTE. `ModeleEmail` est un TYPE : il disparait a
 * l'execution, donc rien ne peut l'enumerer. Un script d'apercu qui listerait
 * les modeles a la main se periemerait au premier ajout, et personne ne le
 * verrait : le dossier engendre serait simplement incomplet.
 *
 * ELLE VIENT DE `RENDUS`, la table qui rend, ce qui la rend exacte par
 * construction. Le compte de modeles a deja ete ecrit faux deux fois le jour
 * meme de LS-29 : il se mesure, il ne s'additionne pas de memoire.
 */
export const MODELES_RENDUS = Object.keys(RENDUS) as ModeleEmail[];

export function rendreModele(message: MessageEmail): MessageRendu {
  return RENDUS[message.modele](message);
}
