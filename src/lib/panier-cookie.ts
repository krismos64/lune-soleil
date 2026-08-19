/**
 * Signature et lecture du cookie de panier, LS-114.
 *
 * CE MODULE N'IMPORTE RIEN DU PROJET, meme motif que `secret-cron.ts` et
 * `mot-de-passe.ts` : il reste testable sans base de donnees, et la suite
 * unitaire doit tourner sans Docker.
 *
 * LE COOKIE NE PORTE AUCUN PRIX, seulement des identifiants de variante et des
 * quantites. Un prix ecrit ici serait un prix que le client peut figer a son
 * avantage : il suffirait d'ajouter au panier, d'attendre une hausse, et de
 * commander a l'ancien tarif. Le prix se relit en base a chaque affichage,
 * critere 5 de LS-114 et etape 3 du parcours 1.
 *
 * LA SIGNATURE ETABLIT L'INTEGRITE, JAMAIS UNE AUTORISATION, invariant 2. Un
 * cookie valide prouve que le contenu n'a pas ete modifie, il ne prouve aucun
 * droit sur quoi que ce soit. Rien dans ce panier n'appartient a personne tant
 * que la commande n'existe pas.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Nom du cookie. Explicite plutot qu'abrege, il se lit dans un inspecteur. */
export const NOM_COOKIE_PANIER = "ls_panier";

/**
 * Duree de vie du cookie, trente jours.
 *
 * ELLE N'A AUCUN RAPPORT AVEC L'EXPIRATION DES RESERVATIONS, trente minutes
 * d'ADR-006. Un panier n'immobilise aucun stock : le garder un mois ne prive
 * personne, et retrouver son panier apres une semaine est le comportement
 * attendu d'une boutique.
 */
export const DUREE_COOKIE_SECONDES = 30 * 24 * 60 * 60;

/**
 * Nombre maximal de lignes distinctes.
 *
 * UN COOKIE A UNE TAILLE BORNEE par les navigateurs, environ 4 Ko. Sans plafond,
 * un panier engendre par script depasserait cette taille et le cookie serait
 * silencieusement tronque ou rejete : le panier disparaitrait sans message. La
 * borne est haute au regard d'un catalogue de 10 a 40 references.
 */
export const LIGNES_MAXIMUM = 50;

/** Une ligne telle que le cookie la porte : jamais de prix, jamais de nom. */
export type LignePanierCookie = {
  varianteId: string;
  quantite: number;
};

/**
 * Derive la cle de signature du panier depuis le secret d'application.
 *
 * POURQUOI DERIVER PLUTOT QUE REUTILISER `BETTER_AUTH_SECRET` TEL QUEL. La meme
 * valeur ne doit jamais signer deux choses differentes : un jour ou l'autre, une
 * signature valide pour un usage serait presentee a l'autre. La derivation par
 * HMAC avec une etiquette fixe produit une cle distincte, sans variable
 * d'environnement supplementaire a gerer et a documenter.
 *
 * LE SECRET N'EST PAS LU AU CHARGEMENT DU MODULE mais a chaque appel. Le lire
 * au chargement le figerait a la valeur presente au moment du `import`, ce qui
 * casse les tests qui la changent, et masque une variable absente derriere un
 * `undefined` capture tres tot.
 */
function cleDeSignature(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (secret === undefined || secret === "") {
    /*
     * DEFAUT FERME. Sans secret, signer avec une valeur vide rendrait tout
     * cookie forgeable par n'importe qui. Mieux vaut une panne bruyante qu'un
     * panier dont l'integrite est une illusion.
     */
    throw new Error(
      "BETTER_AUTH_SECRET est requis pour signer le panier. Aucune valeur par defaut.",
    );
  }

  return createHmac("sha256", secret).update("panier-v1").digest();
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
 * alors combien de caracteres de tete sont corrects, et une signature se
 * reconstitue caractere par caractere. Meme raisonnement que `secret-cron.ts`.
 *
 * `timingSafeEqual` LEVE SI LES LONGUEURS DIFFERENT, elles sont donc comparees
 * d'abord. La fuite est sans valeur : la longueur d'un HMAC-SHA256 est connue.
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
 * Encode et signe un panier.
 *
 * FORME : `<charge en base64url>.<signature en base64url>`. Le point n'apparait
 * dans aucun des deux alphabets, il separe donc sans ambiguite et sans
 * echappement.
 */
export function encoderPanier(lignes: LignePanierCookie[]): string {
  const charge = Buffer.from(JSON.stringify(lignes), "utf8").toString(
    "base64url",
  );

  return `${charge}.${signer(charge)}`;
}

/**
 * Lit un cookie de panier, ou rend un panier vide.
 *
 * REND UN PANIER VIDE PLUTOT QUE DE LEVER, dans TOUS les cas douteux : cookie
 * absent, forme invalide, signature fausse, JSON illisible, structure
 * inattendue. Un visiteur dont le cookie est corrompu doit voir un panier vide
 * et pouvoir recommencer, jamais une page d'erreur.
 *
 * UN COOKIE FALSIFIE EST DONC TRAITE COMME UN COOKIE ABSENT. C'est le critere 4
 * de LS-114, et le refus doit etre SILENCIEUX cote client : dire « signature
 * invalide » renseignerait qui essaie de forger.
 *
 * LA VALIDATION DE FORME EST FAITE ICI, la validation metier ne l'est pas. Ce
 * module ne sait pas si une variante existe : il etablit que la structure est
 * celle attendue, le service verifie ensuite en base. Deux responsabilites
 * distinctes, invariant 7.
 */
export function decoderPanier(valeur: string | undefined): LignePanierCookie[] {
  if (valeur === undefined || valeur === "") {
    return [];
  }

  const separateur = valeur.lastIndexOf(".");

  if (separateur <= 0 || separateur === valeur.length - 1) {
    return [];
  }

  const charge = valeur.slice(0, separateur);
  const signature = valeur.slice(separateur + 1);

  if (!signatureValide(signer(charge), signature)) {
    return [];
  }

  let brut: unknown;

  try {
    brut = JSON.parse(Buffer.from(charge, "base64url").toString("utf8"));
  } catch {
    /*
     * UNE SIGNATURE VALIDE N'IMPLIQUE PAS UN JSON LISIBLE. Le cas suppose un
     * cookie ecrit par une version anterieure du format, pas une falsification :
     * la charge signee par nous peut avoir change de forme entre deux versions.
     */
    return [];
  }

  if (!Array.isArray(brut) || brut.length > LIGNES_MAXIMUM) {
    return [];
  }

  const lignes: LignePanierCookie[] = [];

  for (const element of brut) {
    if (
      typeof element !== "object" ||
      element === null ||
      typeof (element as LignePanierCookie).varianteId !== "string" ||
      typeof (element as LignePanierCookie).quantite !== "number"
    ) {
      return [];
    }

    const ligne = element as LignePanierCookie;

    if (!Number.isInteger(ligne.quantite) || ligne.quantite < 1) {
      return [];
    }

    /*
     * LES DOUBLONS SONT FUSIONNES, ET CE N'EST PAS COSMETIQUE.
     *
     * La revalidation ramene chaque ligne au stock disponible INDEPENDAMMENT.
     * Deux lignes de la meme variante, deux exemplaires demandes chacune sur un
     * stock de deux, passaient donc toutes les deux : le panier annoncait
     * QUATRE articles pour un stock de deux, et un total double. Mesure faite
     * avant correction, le defaut etait reel.
     *
     * La reservation aurait refuse a l'etape 4, mais le visiteur aurait vu un
     * total faux jusqu'au paiement. Les actions du panier ne produisent jamais
     * ce cookie, elles cumulent sur la ligne existante : le cas vient d'un
     * cookie ecrit a la main, ou d'une version future du format.
     */
    const existante = lignes.find(
      (candidate) => candidate.varianteId === ligne.varianteId,
    );

    if (existante === undefined) {
      lignes.push({ varianteId: ligne.varianteId, quantite: ligne.quantite });
    } else {
      existante.quantite += ligne.quantite;
    }
  }

  return lignes;
}
