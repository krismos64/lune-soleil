/**
 * Traitement des photographies televersees, LS-102. ADR-007.
 *
 * CE MODULE PORTE UNE EXIGENCE DE SECURITE. Une photographie prise au
 * smartphone contient dans son EXIF la position GPS du lieu de prise de vue,
 * c'est-a-dire le domicile de l'exploitante. `PARCOURS.md` : « Aucune image
 * n'est jamais servie publiquement sans traitement. C'est un blocage, pas un
 * avertissement. »
 *
 * LA SUPPRESSION DE L'EXIF EST LE COMPORTEMENT PAR DEFAUT DE SHARP, mesure a
 * l'ecriture d'ADR-007 :
 *
 *   sortie par defaut  -> aucun EXIF
 *   avec keepExif()    -> les octets d'origine sont conserves
 *
 * C'EST LE RISQUE PRINCIPAL DE CETTE STORY, et il est contre-intuitif : la
 * protection ne se voit dans AUCUNE ligne de code. Un `keepExif()` ajoute de
 * bonne foi, pour conserver un profil colorimetrique ou une orientation,
 * rouvrirait la fuite en silence. NE JAMAIS EN AJOUTER SUR CE CHEMIN. Les tests
 * lisent les metadonnees du fichier PRODUIT, pas le code qui l'a produit, et un
 * cas de mutation rejoue exactement ce defaut.
 *
 * CE MODULE NE TOUCHE NI AU DISQUE NI A LA BASE. Il recoit des octets et rend
 * des octets : c'est ce qui rend ses tests executables sans Docker, et ce qui
 * permet de le rejouer sur une photographie reelle sans rien ecrire.
 */
import sharp from "sharp";

/** Le fichier ne peut pas etre lu comme une image. */
export class FichierNonImageError extends Error {
  constructor() {
    super("Ce fichier n'est pas une image exploitable.");
    this.name = "FichierNonImageError";
  }
}

/** Le format est lisible mais refuse, SVG ou PDF. */
export class FormatRefuseError extends Error {
  constructor(readonly format: string) {
    super(`Le format ${format} n'est pas accepte pour une photographie.`);
    this.name = "FormatRefuseError";
  }
}

/**
 * Largeurs servies, ADR-007. L'ordre croissant est significatif.
 *
 * ELLES NE SE RATTRAPENT PAS. L'original etant supprime apres traitement,
 * ajouter une largeur plus tard obligerait a redemander les photographies a
 * l'exploitante. C'est la contrepartie assumee de la suppression de l'original,
 * et la raison pour laquelle 1920 px entre des maintenant : une fiche produit
 * affiche l'image sur 600 a 700 px CSS, soit environ 1400 px physiques sur un
 * ecran a densite double.
 */
export const LARGEURS_SERVIES = [320, 640, 1280, 1920] as const;

/**
 * Formats produits par largeur, ADR-007.
 *
 * LE JPEG S'ARRETE A 1280 px. Il n'est qu'un filet de securite, et son poids
 * croit vite : un navigateur qui ignore AVIF et WebP ignore aussi les ecrans a
 * haute densite, donc n'a que faire d'une image de 1920 px.
 */
const FORMATS_PAR_LARGEUR: Record<number, readonly Format[]> = {
  320: ["avif", "webp", "jpeg"],
  640: ["avif", "webp", "jpeg"],
  1280: ["avif", "webp", "jpeg"],
  1920: ["avif", "webp"],
};

export type Format = "avif" | "webp" | "jpeg";

/**
 * Qualites retenues par ADR-007, mesurees en PSNR sur une photographie de
 * 24 Mpx : AVIF 33,0 dB, WebP 35,1 dB, JPEG 32,0 dB. Au-dela de 32 dB l'ecart
 * avec la source n'est pas perceptible a l'oeil.
 */
const QUALITE: Record<Format, number> = { avif: 50, webp: 78, jpeg: 80 };

export type Declinaison = {
  /** Nom de fichier relatif, `320.avif` par exemple. */
  nom: string;
  format: Format;
  largeur: number;
  contenu: Buffer;
};

export type ResultatTraitement = {
  declinaisons: Declinaison[];
  /** Dimensions de la source apres redressement, pour information. */
  largeurSource: number;
  hauteurSource: number;
};

/** Les onze noms de fichiers attendus, pour les tests et les contrôles. */
export function declinaisonsAttendues(): string[] {
  return LARGEURS_SERVIES.flatMap((largeur) =>
    (FORMATS_PAR_LARGEUR[largeur] ?? []).map(
      (format) => `${largeur}.${format}`,
    ),
  );
}

/**
 * Formats d'entree refuses, arbitrage du 14 aout 2026.
 *
 * TOUT FORMAT BITMAP QUE SHARP SAIT LIRE EST ACCEPTE, pour que l'exploitante ne
 * soit bloquee sur aucun format photographique reel : JPEG d'appareil, HEIC
 * d'iPhone, PNG detoure par une application, WebP, AVIF, TIFF.
 *
 * SVG ET PDF SONT LES DEUX SEULES EXCEPTIONS. Ce ne sont pas des
 * photographies, et ce sont les deux formats d'entree les plus complexes que
 * libvips expose, donc la plus large surface d'attaque. L'override de securite
 * de `package.json` corrige quatre CVE de libvips : ne pas lui donner a
 * analyser un document.
 */
const FORMATS_REFUSES = new Set(["svg", "pdf"]);

/**
 * Refuse un SVG ou un PDF sur ses OCTETS, avant tout decodage.
 *
 * NI L'EXTENSION NI LE TYPE ANNONCE PAR LE NAVIGATEUR ne sont consultes :
 * l'appelant peut mentir sur les deux. La signature du fichier, elle, est ce
 * que le decodeur lira vraiment.
 *
 * LE CONTROLE A LIEU AVANT `sharp()`, et c'est tout son interet : refuser apres
 * coup signifierait que libvips a deja analyse le document.
 */
function formatRefuseParSignature(octets: Buffer): string | null {
  if (
    octets.length >= 5 &&
    octets.subarray(0, 5).toString("latin1") === "%PDF-"
  ) {
    return "pdf";
  }

  // Un SVG est du texte : la balise peut etre precedee d'une declaration XML,
  // de commentaires ou d'espaces. On inspecte le debut du fichier plutot que
  // d'exiger que `<svg` soit le premier octet.
  const debut = octets.subarray(0, 1024).toString("latin1").toLowerCase();
  if (debut.includes("<svg")) {
    return "svg";
  }

  return null;
}

/**
 * Traite une photographie et rend ses declinaisons.
 *
 * L'ORDRE DES ETAPES EST IMPOSE, et ce n'est pas un detail de style :
 *
 * 1. refuser SVG et PDF sur la signature, AVANT tout decodage
 * 2. `rotate()` sans argument, qui applique l'orientation EXIF. IL DOIT VENIR
 *    AVANT l'encodage : le traitement retire l'EXIF, donc la consigne
 *    d'orientation disparait, et une image non redressee serait servie couchee
 *    pour toujours
 * 3. `flatten()` pour le seul JPEG, qui ne connait pas la transparence : sans
 *    lui, un fond detoure devient NOIR sur le format de repli
 * 4. encoder, sans jamais appeler `keepExif()`
 *
 * LE TRAITEMENT N'ECRIT RIEN. C'est l'appelant qui decide ou vont les octets,
 * ce qui garde ce module testable sans disque et sans base.
 */
export async function traiterPhotographie(
  octets: Buffer,
): Promise<ResultatTraitement> {
  const refuse = formatRefuseParSignature(octets);
  if (refuse) {
    throw new FormatRefuseError(refuse);
  }

  let metadonnees;
  try {
    metadonnees = await sharp(octets).metadata();
  } catch {
    // L'ERREUR DE LIBVIPS N'EST PAS PROPAGEE. Elle porte des details
    // d'implementation qu'un ecran ne saurait pas presenter, et le seul fait
    // utile est que le fichier n'est pas exploitable.
    throw new FichierNonImageError();
  }

  if (!metadonnees.width || !metadonnees.height) {
    throw new FichierNonImageError();
  }

  // Le format lu peut differer de ce que la signature laissait croire, un SVG
  // encapsule par exemple. Second filet, apres l'analyse et avant l'encodage.
  if (metadonnees.format && FORMATS_REFUSES.has(metadonnees.format)) {
    throw new FormatRefuseError(metadonnees.format);
  }

  // L'ORIENTATION EST APPLIQUEE UNE FOIS, sur une source commune a toutes les
  // declinaisons. La refaire par declinaison couterait autant de rotations que
  // de fichiers, pour un resultat identique.
  const redressee = await sharp(octets).rotate().toBuffer();
  const apresRotation = await sharp(redressee).metadata();

  const declinaisons: Declinaison[] = [];

  for (const largeur of LARGEURS_SERVIES) {
    for (const format of FORMATS_PAR_LARGEUR[largeur] ?? []) {
      let pipeline = sharp(redressee).resize({
        width: largeur,
        // NE JAMAIS AGRANDIR : une image plus petite que la largeur demandee
        // ressortirait floue et plus lourde que l'originale, sans aucun gain.
        withoutEnlargement: true,
      });

      if (format === "jpeg") {
        // APLATISSEMENT SUR BLANC, arbitrage du 14 aout 2026. Le JPEG ne
        // connait pas la transparence : sans cette ligne, le fond detoure d'un
        // bijou devient noir sur le format de repli.
        pipeline = pipeline.flatten({ background: "#ffffff" });
      }

      // AUCUN `keepExif()` ICI, JAMAIS. Voir l'en-tete du fichier : c'est
      // l'absence d'appel qui protege, et elle est invisible.
      const contenu = await pipeline[format]({
        quality: QUALITE[format],
      }).toBuffer();

      declinaisons.push({
        nom: `${largeur}.${format}`,
        format,
        largeur,
        contenu,
      });
    }
  }

  return {
    declinaisons,
    largeurSource: apresRotation.width ?? metadonnees.width,
    hauteurSource: apresRotation.height ?? metadonnees.height,
  };
}
