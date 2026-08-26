/**
 * Commande en cours de paiement, cookie signe. LS-118, etapes 5 et 6 du
 * parcours 1.
 *
 * POURQUOI CE COOKIE EXISTE. Apres la commande, le panier et la saisie du
 * tunnel sont effaces : plus rien ne relie le navigateur a SA commande. Or la
 * page de confirmation doit afficher l'etat reel, et le reessai de paiement
 * doit designer une commande sans jamais croire un identifiant d'URL ou de
 * formulaire, invariant 2. Ce cookie est le jeton signe qui porte ce lien.
 *
 * IL NE PORTE QU'UN IDENTIFIANT TECHNIQUE, aucune donnee personnelle, aucun
 * montant : la commande en base porte tout le reste. C'est ce qui le distingue
 * du cookie de tunnel et dispense le registre des traitements d'une entree.
 *
 * IL N'EST PAS LE JETON D'ACCES DURABLE : la consultation d'une commande hors
 * de ce navigateur (email, espace client) relevera des jetons signes en base de
 * LS-57. Celui-ci ne couvre que la fenetre de paiement.
 *
 * ETIQUETTE `commande-v1`, DISTINCTE DE `panier-v1` ET `tunnel-v1` : la cle
 * maitre est la meme, `BETTER_AUTH_SECRET`, et sans etiquette propre un cookie
 * d'un autre usage serait accepte ici.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Nom du cookie portant la commande en cours de paiement. */
export const NOM_COOKIE_COMMANDE = "ls_commande";

/**
 * Duree de vie, une heure.
 *
 * LE DOUBLE DE LA SESSION DE PAIEMENT, et ce n'est pas une largesse : le
 * reessai apres une panne ou un refus doit rester possible apres l'expiration
 * de la premiere session, et la reconciliation de LS-120 regularise a l'heure.
 * Au-dela, le refus est le bon comportement : la reservation est rendue, le
 * client repasse commande.
 *
 * APPLIQUEE AUX DEUX BOUTS, comme le tunnel depuis LS-117 : `maxAge` pour le
 * navigateur, `emisA` signe pour le serveur, le premier seul ne liant qu'un
 * navigateur cooperatif.
 */
export const DUREE_COMMANDE_SECONDES = 60 * 60;

/** Ce que le cookie retient : l'identifiant, rien d'autre. */
export type CommandeEnCours = {
  commandeId: string;
};

/**
 * Cle de signature, derivee du secret d'application a chaque appel, jamais a
 * l'import, meme motif que `panier-cookie.ts` et `tunnel-cookie.ts`.
 */
function cleDeSignature(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (secret === undefined || secret === "") {
    /*
     * DEFAUT FERME. Signer avec une valeur vide rendrait tout cookie
     * forgeable, donc toute commande consultable et payable par quiconque
     * devine un identifiant.
     */
    throw new Error(
      "BETTER_AUTH_SECRET est requis pour signer la commande en cours. Aucune valeur par defaut.",
    );
  }

  return createHmac("sha256", secret).update("commande-v1").digest();
}

/** Signature HMAC-SHA256 de la charge utile, en base64url. */
function signer(charge: string): string {
  return createHmac("sha256", cleDeSignature())
    .update(charge)
    .digest("base64url");
}

/** Compare deux signatures en temps constant, meme motif que `secret-cron.ts`. */
function signatureValide(attendue: string, fournie: string): boolean {
  const a = Buffer.from(attendue, "utf8");
  const b = Buffer.from(fournie, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Encode et signe une commande en cours.
 *
 * FORME : `<charge en base64url>.<signature en base64url>`, identique aux deux
 * autres cookies signes. `emisA` appartient a l'enveloppe, jamais au type : un
 * appelant qui pourrait le choisir choisirait sa peremption.
 */
export function encoderCommandeEnCours(
  commande: CommandeEnCours,
  emisA: number = Date.now(),
): string {
  const charge = Buffer.from(
    JSON.stringify({ commandeId: commande.commandeId, emisA }),
    "utf8",
  ).toString("base64url");

  return `${charge}.${signer(charge)}`;
}

/**
 * Decode une commande en cours signee, ou `null`.
 *
 * REND `null` PLUTOT QUE DE LEVER sur tout cookie douteux : la page de
 * confirmation retombe alors sur son affichage sans donnees, desagreable mais
 * sur. L'absence d'`emisA` est un refus, une emission dans le futur aussi,
 * memes motifs que `tunnel-cookie.ts`.
 */
export function decoderCommandeEnCours(
  valeur: string | undefined,
  maintenant: number = Date.now(),
): CommandeEnCours | null {
  if (valeur === undefined || valeur === "") {
    return null;
  }

  const separateur = valeur.lastIndexOf(".");

  if (separateur <= 0) {
    return null;
  }

  const charge = valeur.slice(0, separateur);
  const signature = valeur.slice(separateur + 1);

  if (!signatureValide(signer(charge), signature)) {
    return null;
  }

  let brut: unknown;

  try {
    brut = JSON.parse(Buffer.from(charge, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof brut !== "object" || brut === null) {
    return null;
  }

  const candidat = brut as Record<string, unknown>;
  const emisA = candidat.emisA;

  if (typeof emisA !== "number" || !Number.isFinite(emisA)) {
    return null;
  }

  const ageMillisecondes = maintenant - emisA;

  if (
    ageMillisecondes < 0 ||
    ageMillisecondes > DUREE_COMMANDE_SECONDES * 1000
  ) {
    return null;
  }

  if (typeof candidat.commandeId !== "string" || candidat.commandeId === "") {
    return null;
  }

  return { commandeId: candidat.commandeId };
}
