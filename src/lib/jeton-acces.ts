/**
 * Jetons d'acces sans compte, valeur signee et empreinte. LS-132, regles L5,
 * L6, L9 et L11 du modele conceptuel.
 *
 * POURQUOI CE MODULE EXISTE. Un achat sans compte produit une facture, et le
 * client doit pouvoir y acceder. Sans session, l'autorisation ne peut venir
 * que d'un jeton signe : un identifiant de commande dans une URL n'autorise
 * rien par lui-meme, invariant 2.
 *
 * DEUX MOITIES QUI NE SE CONFONDENT PAS.
 *
 * La VALEUR part au client dans un lien, elle n'existe nulle part cote serveur.
 * L'EMPREINTE est ce que la base retient, regle L5 : une fuite de la table ne
 * donne aucun acces, exactement comme pour un mot de passe. La fonction
 * `engendrerJeton` est donc la SEULE a voir les deux ensemble, et son appelant
 * doit transmettre la valeur puis l'oublier.
 *
 * POURQUOI UNE SIGNATURE EN PLUS DE L'EMPREINTE. L'empreinte seule suffirait a
 * retrouver la ligne, mais toute valeur aleatoire deviendrait alors une
 * tentative valide a tester : la base serait le seul rempart contre une
 * enumeration. La signature permet de refuser une valeur forgee SANS TOUCHER LA
 * BASE, ce qui est la quatrieme condition de `PARCOURS.md`, « modifie ».
 *
 * ETIQUETTE `document-v1`, DISTINCTE DES COOKIES. La cle maitre est la meme,
 * `BETTER_AUTH_SECRET`, et sans etiquette propre un cookie de panier
 * deviendrait un jeton de facture. Meme motif que `commande-cookie.ts`, qui
 * porte deja `commande-v1` face a `panier-v1` et `tunnel-v1`.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Octets d'alea de la valeur, avant signature.
 *
 * TRENTE-DEUX ET NON SEIZE : la valeur circule dans une URL qui peut vivre des
 * mois dans une boite email, et elle n'est protegee par aucun second facteur.
 * Le cout est une chaine plus longue dans un lien que personne ne recopie a la
 * main.
 */
const OCTETS_ALEA = 32;

/**
 * Duree de vie d'un lien de document, trente jours.
 *
 * ARBITRAGE : assez long pour qu'un client qui classe ses emails retrouve sa
 * facture apres coup, assez court pour qu'un lien oublie dans une boite
 * compromise cesse de valoir. La facture reste accessible au-dela par l'espace
 * client, LS-57, et un lien neuf peut toujours etre emis.
 *
 * ELLE N'EST PAS UNE CONSTANTE DE SECURITE ABSOLUE : la revocation, regle L10,
 * est le mecanisme qui traite un lien parti sur une mauvaise adresse. Attendre
 * l'expiration reviendrait a laisser l'acces ouvert jusqu'a son terme.
 */
export const DUREE_JETON_DOCUMENT_JOURS = 30;

/** Ce qu'`engendrerJeton` produit : la valeur pour le client, l'empreinte pour la base. */
export type JetonEngendre = {
  /**
   * A transmettre au client, puis a oublier. Ne JAMAIS journaliser, invariant
   * 9 : `journal.ts` masque deja toute cle contenant « jeton » ou « token »,
   * mais le masquage protege le contexte, pas une interpolation dans un
   * message.
   */
  valeur: string;
  /** A ecrire en base, colonne `empreinte`, regle L5. */
  empreinte: string;
};

/**
 * Cle de signature, derivee du secret d'application a chaque appel.
 *
 * JAMAIS A L'IMPORT, meme motif que les trois cookies signes : une constante de
 * module figerait la valeur au demarrage du processus, ce qui rend la
 * configuration intestable et masque une correction faite sans redemarrage.
 */
function cleDeSignature(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (secret === undefined || secret === "") {
    /*
     * DEFAUT FERME. Signer avec une valeur vide rendrait tout jeton forgeable,
     * donc toute facture lisible par quiconque fabrique un lien. Better Auth
     * accepte de demarrer sans ce secret, defaut deja rencontre sur ce depot :
     * la garde est donc ici et non seulement dans la configuration.
     */
    throw new Error(
      "BETTER_AUTH_SECRET est requis pour signer un jeton d'acces. Aucune valeur par defaut.",
    );
  }

  return createHmac("sha256", secret).update("document-v1").digest();
}

/** Signature HMAC-SHA256 d'une partie aleatoire, en base64url. */
function signer(alea: string): string {
  return createHmac("sha256", cleDeSignature())
    .update(alea)
    .digest("base64url");
}

/**
 * Empreinte stockee en base, regle L5.
 *
 * SHA-256 SANS SEL, ET C'EST VOULU, la ou un mot de passe exigerait Argon2. La
 * valeur porte 32 octets d'alea : elle n'est pas devinable par dictionnaire, et
 * une fonction lente ne protegerait de rien tout en rendant chaque acces plus
 * couteux. Le sel servirait a distinguer deux entrees identiques, cas qui ne
 * peut pas se produire ici.
 *
 * ELLE PORTE SUR LA VALEUR COMPLETE, signature comprise. Prendre l'empreinte de
 * la seule partie aleatoire laisserait deux valeurs distinctes, l'une signee
 * correctement et l'autre non, partager la meme ligne.
 */
export function empreinteJeton(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex");
}

/**
 * Engendre un jeton neuf.
 *
 * FORME : `<alea en base64url>.<signature en base64url>`, la meme que les
 * cookies signes du projet, ce qui evite un second format a relire.
 */
export function engendrerJeton(): JetonEngendre {
  const alea = randomBytes(OCTETS_ALEA).toString("base64url");
  const valeur = `${alea}.${signer(alea)}`;

  return { valeur, empreinte: empreinteJeton(valeur) };
}

/**
 * La valeur porte-t-elle une signature valide ?
 *
 * C'EST LA QUATRIEME CONDITION, « modifie », et elle se teste AVANT toute
 * requete : une valeur forgee ne doit pas devenir une lecture de base, sinon
 * l'enumeration reste possible a cout constant.
 *
 * REND UN BOOLEEN ET NE LEVE JAMAIS. Une entree douteuse est un refus, pas une
 * panne : lever ici ferait remonter un 500 la ou le comportement attendu est un
 * refus securise indiscernable des autres.
 */
export function signatureJetonValide(valeur: string): boolean {
  if (valeur === "") {
    return false;
  }

  const separateur = valeur.lastIndexOf(".");

  if (separateur <= 0 || separateur === valeur.length - 1) {
    return false;
  }

  const alea = valeur.slice(0, separateur);
  const signature = valeur.slice(separateur + 1);

  const attendue = Buffer.from(signer(alea), "utf8");
  const fournie = Buffer.from(signature, "utf8");

  /*
   * `timingSafeEqual` LEVE SI LES LONGUEURS DIFFERENT, elles sont donc
   * comparees avant. Le retour anticipe ne fuit rien d'exploitable : la
   * longueur d'une signature HMAC-SHA256 en base64url est constante et connue.
   */
  if (attendue.length !== fournie.length) {
    return false;
  }

  return timingSafeEqual(attendue, fournie);
}

/**
 * Date d'expiration d'un jeton de document, a ecrire dans `expireA`.
 *
 * CALCULEE ICI ET NON PAR L'APPELANT, regle L11 : `expireA` est immuable apres
 * ecriture, et un appelant libre de la choisir choisirait sa propre peremption.
 */
export function expirationDocument(maintenant: Date = new Date()): Date {
  return new Date(
    maintenant.getTime() + DUREE_JETON_DOCUMENT_JOURS * 24 * 60 * 60 * 1000,
  );
}

/**
 * Chemin de la route qui sert un document, LS-132.
 *
 * CONSTANTE PARTAGEE plutot que deux chaines a tenir d'accord : le jour ou la
 * route bouge, un lien construit a la main partirait vers un 404 sans que rien
 * ne rougisse.
 */
export const CHEMIN_ACCES_DOCUMENT = "/facture";

/**
 * Compose le lien complet a transmettre au client, LS-82 le consommera.
 *
 * DEFAUT FERME SUR LA BASE, contrairement au retour navigateur de
 * `paiement.ts` qui retombe sur localhost. La difference est le contenu : une
 * URL de retour fausse casse une redirection, un lien de facture faux EMPORTE
 * LE JETON vers un domaine qui n'est pas le notre, ou il est lisible par qui le
 * controle. Il vaut mieux ne pas envoyer d'email que d'en envoyer un qui fuit
 * un acces.
 *
 * ELLE N'ENCODE PAS LA VALEUR, et ce n'est pas un oubli : la forme produite par
 * `engendrerJeton` est du base64url, alphabet deja sur pour un segment d'URL.
 * Un `encodeURIComponent` serait inoffensif mais laisserait croire que la
 * fonction accepte n'importe quelle entree, ce qu'elle ne doit pas faire.
 */
export function lienDocument(valeurJeton: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  if (base === undefined || base === "") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL est requise pour composer un lien de document. " +
        "Aucun repli : un lien errone emporterait le jeton hors du domaine.",
    );
  }

  return `${base.replace(/\/+$/, "")}${CHEMIN_ACCES_DOCUMENT}/${valeurJeton}`;
}
