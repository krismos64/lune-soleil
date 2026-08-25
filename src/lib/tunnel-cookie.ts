/**
 * Saisie du tunnel de commande, cookie signe. LS-115, etape 3b du parcours 1.
 *
 * POURQUOI UN COOKIE ET NON UNE ENTITE EN BASE. Rien n'est commande a ce stade :
 * ADR-024 reserve l'ecriture a la transaction unique de LS-117. Persister une
 * saisie abandonnee creerait des donnees personnelles orphelines a purger, pour
 * un tunnel que le visiteur peut quitter a toute etape.
 *
 * L'INTEGRITE EST LA SEULE QUESTION DE SECURITE, comme pour le panier. Le
 * cookie est signe : une adresse modifiee cote client est rejetee. Il n'autorise
 * en revanche rien du tout, invariant 2, et ne porte AUCUN MONTANT, invariant 1.
 *
 * ETIQUETTE `tunnel-v1`, DISTINCTE DE `panier-v1`. La cle maitre est la meme,
 * `BETTER_AUTH_SECRET` : sans etiquette distincte, un cookie de panier signe
 * serait accepte comme une saisie de tunnel et reciproquement.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { MODES_AVEC_POINT_RETRAIT, exigePointRetrait } from "@/lib/livraison";
import type { PointRetrait } from "@/integrations/mondial-relay";
import type { ModeLivraison } from "@/generated/prisma/enums";

/** Nom du cookie portant la saisie en cours. */
export const NOM_COOKIE_TUNNEL = "ls_tunnel";

/**
 * Duree de vie de la saisie, deux heures.
 *
 * NETTEMENT PLUS COURTE QUE LES TRENTE JOURS DU PANIER, et pour une raison de
 * fond : ce cookie porte un nom, une adresse et un telephone. La minimisation du
 * RGPD demande de ne pas conserver une donnee personnelle au-dela de son usage,
 * qui est ici une commande en cours. Le panier, lui, ne porte que des
 * identifiants de variante.
 *
 * Deux heures laissent largement le temps de remplir quatre etapes, y compris
 * en cherchant un point de retrait ou en changeant d'avis.
 */
export const DUREE_TUNNEL_SECONDES = 2 * 60 * 60;

/** Adresse saisie, forme figee dans le cookie. */
export type AdresseTunnel = {
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
  pays: "FR";
};

/**
 * Ce que le tunnel retient entre deux etapes.
 *
 * AUCUN MONTANT N'Y FIGURE. Un frais de port ou un total ecrit ici serait un
 * montant que le client peut figer a son avantage : il suffirait de remplir le
 * tunnel, d'attendre une hausse, puis de commander a l'ancien tarif. Tout
 * montant est recalcule par `lib/livraison.ts` a chaque rendu.
 */
export type SaisieTunnel = {
  nomClient: string;
  email: string;
  /** Facultatif, arbitrage du 25 aout 2026 : `Commande.telephone` est nullable. */
  telephone: string | null;
  adresse: AdresseTunnel;
  mode: ModeLivraison;
  /** Copie complete du point, jamais son seul identifiant. */
  pointRetrait: PointRetrait | null;
};

/**
 * Cle de signature, derivee du secret d'application.
 *
 * LE SECRET N'EST PAS LU AU CHARGEMENT DU MODULE mais a chaque appel, meme
 * motif que `panier-cookie.ts` : le figer a l'import casse les tests qui le
 * changent et masque une variable absente derriere un `undefined` capture tot.
 */
function cleDeSignature(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (secret === undefined || secret === "") {
    /*
     * DEFAUT FERME. Signer avec une valeur vide rendrait tout cookie forgeable,
     * donc toute adresse de livraison injectable. Une panne bruyante vaut mieux
     * qu'une integrite illusoire.
     */
    throw new Error(
      "BETTER_AUTH_SECRET est requis pour signer la saisie du tunnel. Aucune valeur par defaut.",
    );
  }

  return createHmac("sha256", secret).update("tunnel-v1").digest();
}

/** Signature HMAC-SHA256 de la charge utile, en base64url. */
function signer(charge: string): string {
  return createHmac("sha256", cleDeSignature())
    .update(charge)
    .digest("base64url");
}

/**
 * Compare deux signatures en temps constant.
 *
 * `===` s'arrete au premier caractere different : le temps de reponse revele
 * combien de caracteres de tete sont corrects, et la signature se reconstitue
 * caractere par caractere. Meme raisonnement que `secret-cron.ts`.
 */
function signatureValide(attendue: string, fournie: string): boolean {
  const a = Buffer.from(attendue, "utf8");
  const b = Buffer.from(fournie, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Retient les seuls champs connus, dans un ordre fixe.
 *
 * UNE RECOPIE EXPLICITE ET NON UN `...saisie`. Un champ inconnu passe par
 * l'appelant, par exemple un montant, serait sinon signe et relu comme
 * legitime : la forme du cookie doit etre decidee ici et nulle part ailleurs.
 */
function normaliser(saisie: SaisieTunnel): SaisieTunnel {
  return {
    nomClient: saisie.nomClient,
    email: saisie.email,
    telephone: saisie.telephone,
    adresse: {
      ligne1: saisie.adresse.ligne1,
      ...(saisie.adresse.ligne2 === undefined
        ? {}
        : { ligne2: saisie.adresse.ligne2 }),
      codePostal: saisie.adresse.codePostal,
      ville: saisie.adresse.ville,
      pays: saisie.adresse.pays,
    },
    mode: saisie.mode,
    pointRetrait:
      saisie.pointRetrait === null
        ? null
        : {
            identifiant: saisie.pointRetrait.identifiant,
            nom: saisie.pointRetrait.nom,
            ligne1: saisie.pointRetrait.ligne1,
            codePostal: saisie.pointRetrait.codePostal,
            ville: saisie.pointRetrait.ville,
          },
  };
}

/**
 * Encode et signe une saisie.
 *
 * FORME : `<charge en base64url>.<signature en base64url>`. Le point n'appartient
 * a aucun des deux alphabets, il separe sans ambiguite.
 */
export function encoderSaisieTunnel(saisie: SaisieTunnel): string {
  const charge = Buffer.from(
    JSON.stringify(normaliser(saisie)),
    "utf8",
  ).toString("base64url");

  return `${charge}.${signer(charge)}`;
}

/** Vrai si la valeur a la forme d'un mode de livraison connu. */
function modeConnu(valeur: unknown): valeur is ModeLivraison {
  return (
    valeur === "DOMICILE" ||
    (MODES_AVEC_POINT_RETRAIT as readonly string[]).includes(valeur as string)
  );
}

/** Vrai si la valeur a la forme d'un point de retrait complet. */
function pointComplet(valeur: unknown): valeur is PointRetrait {
  if (typeof valeur !== "object" || valeur === null) {
    return false;
  }

  const candidat = valeur as Record<string, unknown>;

  return (
    ["identifiant", "nom", "ligne1", "codePostal", "ville"] as const
  ).every((cle) => typeof candidat[cle] === "string" && candidat[cle] !== "");
}

/** Vrai si la valeur a la forme d'une adresse. */
function adresseComplete(valeur: unknown): valeur is AdresseTunnel {
  if (typeof valeur !== "object" || valeur === null) {
    return false;
  }

  const candidat = valeur as Record<string, unknown>;

  return (
    typeof candidat.ligne1 === "string" &&
    typeof candidat.codePostal === "string" &&
    typeof candidat.ville === "string" &&
    candidat.pays === "FR" &&
    (candidat.ligne2 === undefined || typeof candidat.ligne2 === "string")
  );
}

/**
 * Decode une saisie signee, ou `null`.
 *
 * REND `null` PLUTOT QUE DE LEVER sur tout cookie douteux. Le tunnel repart
 * alors d'une saisie vide : desagreable, mais sur. Lever ferait une erreur
 * serveur sur une page publique, et un cookie d'un ancien format suffirait a
 * rendre la boutique inaccessible.
 *
 * LA FORME EST REVERIFIEE APRES LA SIGNATURE. Une signature valide prouve que
 * le contenu vient de nous, pas qu'il est encore correct : un cookie ecrit par
 * une version anterieure porte une forme que le code actuel ne comprend plus.
 */
export function decoderSaisieTunnel(
  valeur: string | undefined,
): SaisieTunnel | null {
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

  if (
    typeof candidat.nomClient !== "string" ||
    typeof candidat.email !== "string" ||
    !(candidat.telephone === null || typeof candidat.telephone === "string") ||
    !adresseComplete(candidat.adresse) ||
    !modeConnu(candidat.mode)
  ) {
    return null;
  }

  const pointRetrait =
    candidat.pointRetrait === null
      ? null
      : pointComplet(candidat.pointRetrait)
        ? candidat.pointRetrait
        : undefined;

  if (pointRetrait === undefined) {
    return null;
  }

  /*
   * LA COHERENCE MODE / POINT DE RETRAIT EST VERIFIEE ICI AUSSI. Zod la refuse
   * a la saisie et `chk_commande_mode_point_relais` a l'ecriture de LS-117 :
   * la refuser des la lecture evite qu'une saisie incoherente traverse trois
   * ecrans avant d'echouer sur une contrainte de base.
   */
  const attendu = exigePointRetrait(candidat.mode);

  if (attendu !== (pointRetrait !== null)) {
    return null;
  }

  return normaliser({
    nomClient: candidat.nomClient,
    email: candidat.email,
    telephone: candidat.telephone,
    adresse: candidat.adresse,
    mode: candidat.mode,
    pointRetrait,
  });
}
