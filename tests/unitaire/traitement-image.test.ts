/**
 * Traitement des photographies televersees, LS-102. ADR-007.
 *
 * CES TESTS PORTENT UNE EXIGENCE DE SECURITE, pas une fonction de confort. Une
 * photographie prise au smartphone porte dans son EXIF la position GPS du lieu
 * de prise de vue, c'est-a-dire le domicile de l'exploitante. `PARCOURS.md` est
 * categorique : « Aucune image n'est jamais servie publiquement sans
 * traitement. C'est un blocage, pas un avertissement. »
 *
 * ILS LISENT LES METADONNEES DU FICHIER REELLEMENT PRODUIT, jamais le code qui
 * l'a produit, critere 1 de la story. C'est ce qui les distingue d'un test qui
 * verifierait qu'une option est passee : sharp retire l'EXIF PAR DEFAUT, donc
 * aucune ligne de code n'affirme cette protection, et un `keepExif()` ajoute de
 * bonne foi pour conserver un profil colorimetrique la rouvrirait en silence.
 * C'est le risque principal nomme par ADR-007.
 *
 * AUCUNE BASE NI DOCKER : le traitement est une fonction pure de bout en bout,
 * elle recoit des octets et rend des octets.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  FichierNonImageError,
  FormatRefuseError,
  LARGEURS_SERVIES,
  declinaisonsAttendues,
  traiterPhotographie,
} from "@/integrations/medias/traitement";

/**
 * Engendre une photographie de test portant un EXIF complet, GPS compris.
 *
 * `withExif` ECRIT DE VRAIES DONNEES EXIF, ce qui est le point : un test qui
 * partirait d'une image sans metadonnee ne prouverait rien, l'absence en sortie
 * etant alors acquise d'avance.
 */
async function photographieAvecGps(
  largeur = 1200,
  hauteur = 900,
): Promise<Buffer> {
  return (
    sharp({
      create: {
        width: largeur,
        height: hauteur,
        channels: 3,
        background: "#c8a165",
      },
    })
      /*
       * LE GPS S'ECRIT DANS `IFD3` ET NON DANS UNE CLE `GPS`. Le type `Exif` de
       * sharp n'expose que `IFD0` a `IFD3`, et c'est `IFD3` qui porte le
       * repertoire GPS dans la convention de libvips : mesure le 14 aout 2026, il
       * produit le bloc EXIF le plus gros des trois.
       *
       * Les coordonnees sont encodees en rationnels BINAIRES, donc introuvables en
       * clair dans le fichier : c'est pourquoi la preuve porte sur l'ABSENCE du
       * bloc EXIF entier, et non sur la recherche d'une latitude en texte.
       */
      .withExif({
        IFD0: {
          Software: "Application de retouche",
          Artist: "exploitante",
          Make: "Marque",
          Model: "Modele",
        },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "48/1 51/1 24/1",
          GPSLongitudeRef: "E",
          GPSLongitude: "2/1 21/1 3/1",
        },
      })
      .jpeg()
      .toBuffer()
  );
}

describe("suppression des metadonnees, exigence de securite", () => {
  /**
   * LE TEST LE PLUS IMPORTANT DE LA STORY.
   *
   * Il verifie l'ABSENCE d'EXIF sur CHACUNE des declinaisons produites, et non
   * sur la premiere : un traitement qui nettoierait l'AVIF en laissant le JPEG
   * intact publierait la position GPS sur le format de repli, celui que servent
   * precisement les navigateurs les plus anciens.
   */
  it("ne laisse aucun EXIF sur aucune declinaison", async () => {
    const source = await photographieAvecGps();
    // La source EN PORTE BIEN, sans quoi ce test ne prouverait rien.
    expect((await sharp(source).metadata()).exif).toBeDefined();

    const resultat = await traiterPhotographie(source);

    for (const declinaison of resultat.declinaisons) {
      const metadonnees = await sharp(declinaison.contenu).metadata();
      expect(
        metadonnees.exif,
        `EXIF present sur ${declinaison.nom}`,
      ).toBeUndefined();
    }
  });

  /**
   * LA POSITION GPS EST CHERCHEE DANS LES OCTETS BRUTS, et pas seulement par
   * l'absence du champ `exif`.
   *
   * POURQUOI CE SECOND CONTROLE. `sharp.metadata()` ne rend que ce qu'il sait
   * analyser : un bloc de metadonnees ecrit dans un segment qu'il n'inspecte pas
   * passerait inapercu. Chercher les marqueurs textuels dans le fichier entier
   * ne depend d'aucune analyse et attrape la fuite quelle qu'en soit la forme.
   */
  it("ne laisse aucune trace textuelle des metadonnees d'origine", async () => {
    const source = await photographieAvecGps();
    const resultat = await traiterPhotographie(source);

    for (const declinaison of resultat.declinaisons) {
      const octets = declinaison.contenu.toString("latin1");
      for (const marqueur of [
        "Application de retouche",
        "exploitante",
        "Marque",
        "Modele",
      ]) {
        expect(
          octets.includes(marqueur),
          `« ${marqueur} » retrouve dans ${declinaison.nom}`,
        ).toBe(false);
      }
    }
  });

  /**
   * LE BLOC GPS EST COMPARE OCTET A OCTET, source contre sortie.
   *
   * POURQUOI CE TROISIEME CONTROLE. Les coordonnees sont encodees en rationnels
   * BINAIRES : elles sont introuvables en clair, donc la recherche textuelle du
   * test precedent ne les verrait pas. Comparer la TAILLE du bloc EXIF de la
   * source, qui contient le repertoire GPS, a celle de la sortie, prouve que le
   * bloc entier a disparu quel qu'en soit le contenu.
   */
  it("retire le bloc EXIF entier, GPS binaire compris", async () => {
    const source = await photographieAvecGps();
    const exifSource = (await sharp(source).metadata()).exif;

    // La source porte un bloc consequent, GPS compris : sans cette assertion,
    // le test pourrait passer sur une source qui n'a jamais rien porte.
    expect(exifSource!.length).toBeGreaterThan(100);

    const resultat = await traiterPhotographie(source);

    for (const declinaison of resultat.declinaisons) {
      const exifSortie = (await sharp(declinaison.contenu).metadata()).exif;
      expect(
        exifSortie,
        `bloc EXIF survivant dans ${declinaison.nom}`,
      ).toBeUndefined();
    }
  });

  /**
   * UNE IMAGE SANS METADONNEE N'EN GAGNE PAS. Le cas est courant depuis qu'une
   * partie des photographies passe par une application de retouche qui les
   * nettoie : le traitement ne doit pas reintroduire de champ, profil ou
   * mention de logiciel.
   */
  it("n'ajoute aucune metadonnee a une image qui n'en portait pas", async () => {
    const nue = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();

    const resultat = await traiterPhotographie(nue);

    for (const declinaison of resultat.declinaisons) {
      const metadonnees = await sharp(declinaison.contenu).metadata();
      expect(metadonnees.exif).toBeUndefined();
    }
  });
});

describe("orientation", () => {
  /**
   * LA PHOTOGRAPHIE DE SMARTPHONE EST REDRESSEE, parcours 3 etape 4.
   *
   * Un telephone tenu verticalement ecrit souvent l'image en paysage avec un
   * champ EXIF `Orientation` qui dit comment la tourner. Or LE TRAITEMENT RETIRE
   * L'EXIF : sans rotation prealable, la consigne dispararait et l'image serait
   * servie couchee. Les deux etapes sont donc liees, et leur ORDRE compte.
   *
   * L'image de test est un rectangle 1200x900 marque en orientation 6, « tourner
   * de 90 degres ». Apres traitement, la largeur et la hauteur doivent avoir
   * echange leur role.
   */
  it("redresse une image portant une orientation EXIF", async () => {
    /*
     * `withMetadata({ orientation })` ET NON `withExif({ IFD0: { Orientation } })`.
     * Mesure le 14 aout 2026 : la seconde forme n'ecrit pas le champ, il est
     * relu a 1, et le test verifiait alors une rotation qu'aucune consigne ne
     * demandait. Le code etait juste, c'est le test qui ne posait pas le cas.
     */
    const couchee = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#c8a165" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    // LA SOURCE PORTE BIEN L'ORIENTATION, sans quoi ce test ne prouve rien.
    expect((await sharp(couchee).metadata()).orientation).toBe(6);

    const resultat = await traiterPhotographie(couchee);
    const plusGrande = resultat.declinaisons.find((d) => d.largeur === 320);

    const metadonnees = await sharp(plusGrande!.contenu).metadata();
    // L'image d'origine est en paysage, 4/3. Redressee, elle devient un
    // portrait 3/4 : la hauteur depasse la largeur.
    expect(metadonnees.height).toBeGreaterThan(metadonnees.width!);
  });
});

describe("declinaisons engendrees, ADR-007", () => {
  /**
   * ONZE DECLINAISONS, ET LE COMPTE EST L'ASSERTION. ADR-007 les fixe : 320,
   * 640 et 1280 px en AVIF, WebP et JPEG, plus 1920 px en AVIF et WebP.
   *
   * LES LARGEURS NE SE RATTRAPENT PAS, l'original etant supprime : en oublier
   * une obligerait a redemander les photographies a l'exploitante. Ce test est
   * ce qui empeche qu'une largeur disparaisse d'une refonte du traitement.
   */
  it("engendre exactement les onze declinaisons de l'ADR", async () => {
    const source = await photographieAvecGps(2400, 1800);
    const resultat = await traiterPhotographie(source);

    expect(resultat.declinaisons).toHaveLength(11);
    expect(resultat.declinaisons.map((d) => d.nom).sort()).toEqual(
      declinaisonsAttendues().sort(),
    );
  });

  /** Le JPEG ne va pas jusqu'a 1920 px, ADR-007 : il n'est qu'un repli. */
  it("n'engendre pas de JPEG en 1920 px", async () => {
    const source = await photographieAvecGps(2400, 1800);
    const resultat = await traiterPhotographie(source);

    const jpeg1920 = resultat.declinaisons.find(
      (d) => d.largeur === 1920 && d.format === "jpeg",
    );
    expect(jpeg1920).toBeUndefined();
  });

  /**
   * UNE IMAGE PLUS PETITE QUE LA LARGEUR DEMANDEE N'EST PAS AGRANDIE.
   * L'agrandir produirait une image floue plus lourde que l'originale, sans
   * aucun gain : `withoutEnlargement` borne le redimensionnement.
   */
  it("n'agrandit jamais une image plus petite que la largeur servie", async () => {
    const petite = await photographieAvecGps(500, 400);
    const resultat = await traiterPhotographie(petite);

    for (const declinaison of resultat.declinaisons) {
      const metadonnees = await sharp(declinaison.contenu).metadata();
      expect(metadonnees.width).toBeLessThanOrEqual(500);
    }
  });

  it("rend les dimensions reelles de chaque declinaison", async () => {
    const source = await photographieAvecGps(2400, 1800);
    const resultat = await traiterPhotographie(source);

    for (const declinaison of resultat.declinaisons) {
      const metadonnees = await sharp(declinaison.contenu).metadata();
      expect(metadonnees.width).toBe(declinaison.largeur);
    }
  });
});

describe("transparence, photographie au fond detoure", () => {
  /**
   * LE FOND TRANSPARENT EST APLATI SUR BLANC POUR LE JPEG, arbitrage du
   * 14 aout 2026.
   *
   * LE JPEG NE CONNAIT PAS LA TRANSPARENCE. Sans aplatissement, une zone
   * transparente devient NOIRE : un bijou detoure par une application
   * s'afficherait sur fond noir chez qui ne supporte ni AVIF ni WebP, c'est-a-dire
   * exactement le public que le repli JPEG existe pour servir.
   *
   * Le test lit le pixel du coin, qui est transparent dans la source.
   */
  it("aplatit une zone transparente sur blanc dans le JPEG", async () => {
    const detouree = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const resultat = await traiterPhotographie(detouree);
    const jpeg = resultat.declinaisons.find((d) => d.format === "jpeg");

    const { data } = await sharp(jpeg!.contenu)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Le premier pixel, trois canaux. Blanc et non noir.
    expect(data[0]).toBeGreaterThan(240);
    expect(data[1]).toBeGreaterThan(240);
    expect(data[2]).toBeGreaterThan(240);
  });

  /** AVIF et WebP conservent la transparence, eux : aucune raison de l'aplatir. */
  it("conserve la transparence en AVIF et WebP", async () => {
    const detouree = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const resultat = await traiterPhotographie(detouree);

    for (const format of ["avif", "webp"] as const) {
      const declinaison = resultat.declinaisons.find(
        (d) => d.format === format && d.largeur === 320,
      );
      const metadonnees = await sharp(declinaison!.contenu).metadata();
      expect(metadonnees.hasAlpha, `alpha perdu en ${format}`).toBe(true);
    }
  });
});

describe("refus des fichiers qui ne sont pas des photographies", () => {
  /**
   * SVG ET PDF SONT REFUSES AVANT TOUT DECODAGE, arbitrage du 14 aout 2026.
   *
   * libvips sait les lire, ce qui suffirait a les faire passer. Ils sont refuses
   * pour deux raisons : ce ne sont pas des photographies, et ce sont les deux
   * formats d'entree les plus complexes que la bibliotheque expose, donc la plus
   * large surface d'attaque. L'override de securite de `package.json` corrige
   * quatre CVE de libvips : ne pas lui donner a analyser un document.
   *
   * LE REFUS PORTE SUR LES OCTETS, pas sur l'extension ni sur le type annonce
   * par le navigateur, que n'importe qui peut mentir.
   */
  it("refuse un SVG, meme presente comme une image", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(1)</script></svg>',
    );

    await expect(traiterPhotographie(svg)).rejects.toThrow(FormatRefuseError);
  });

  it("refuse un SVG precede d'une declaration XML", async () => {
    const svg = Buffer.from(
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );

    await expect(traiterPhotographie(svg)).rejects.toThrow(FormatRefuseError);
  });

  it("refuse un PDF", async () => {
    const pdf = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1");

    await expect(traiterPhotographie(pdf)).rejects.toThrow(FormatRefuseError);
  });

  /**
   * TOUT AUTRE FORMAT BITMAP QUE SHARP SAIT LIRE EST ACCEPTE, arbitrage du
   * 14 aout 2026 : l'exploitante ne doit etre bloquee sur aucun format
   * photographique reel. PNG detoure, WebP exporte, TIFF d'appareil photo.
   */
  it("accepte le PNG, le WebP et le TIFF", async () => {
    for (const format of ["png", "webp", "tiff"] as const) {
      const image = await sharp({
        create: { width: 600, height: 400, channels: 3, background: "#c8a165" },
      })
        [format]()
        .toBuffer();

      const resultat = await traiterPhotographie(image);
      expect(resultat.declinaisons.length).toBeGreaterThan(0);
    }
  });

  it("refuse un fichier qui n'est pas une image du tout", async () => {
    const texte = Buffer.from("Ceci n'est pas une photographie.");

    await expect(traiterPhotographie(texte)).rejects.toThrow(
      FichierNonImageError,
    );
  });

  /**
   * UN FICHIER VIDE EST REFUSE SANS LEVER D'ERREUR TECHNIQUE. Le cas arrive
   * quand un televersement est interrompu : l'ecran doit dire « fichier
   * illisible » et non afficher une trace de libvips.
   */
  it("refuse un fichier vide", async () => {
    await expect(traiterPhotographie(Buffer.alloc(0))).rejects.toThrow(
      FichierNonImageError,
    );
  });
});

describe("largeurs servies", () => {
  it("expose les quatre largeurs d'ADR-007, dans l'ordre croissant", () => {
    expect(LARGEURS_SERVIES).toEqual([320, 640, 1280, 1920]);
  });
});
