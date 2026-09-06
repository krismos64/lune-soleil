#!/usr/bin/env node
/**
 * Engendre les declinaisons des photographies de test, LS-187.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE SCRIPT EXISTE, ET C'EST LA REVUE D'INTERFACE QUI L'A VU.
 *
 * `public/medias/` est ignore par git, `.gitignore` ligne 68, et pour une bonne
 * raison : ce dossier recoit les photographies de l'exploitante et le depot est
 * public. Rien du depot ne creait donc ces fichiers, et le test qui appelle les
 * sept URL du catalogue passait UNIQUEMENT sur une machine ou une execution
 * anterieure les avait laisses.
 *
 * MESURE DU 6 SEPTEMBRE 2026 : `public/medias/` deplace, le test rougit avec
 * sept fois 404. C'est le motif inverse de celui que LS-187 corrige, et il
 * aurait accuse le code plutot que la preparation.
 * ------------------------------------------------------------------
 *
 * IL TOURNE AVANT `next build`, ET C'EST OBLIGATOIRE. Une premiere version
 * engendrait ces fichiers dans la preparation Playwright, apres le build : ils
 * apparaissaient bien sur le disque et le test rougissait quand meme. La cause
 * est que `next build` COPIE `public/` dans `.next/standalone/public/`, et que
 * `next start` sert cette copie : un fichier cree apres le build est invisible.
 * Mesure du 6 septembre 2026, un tour sur un dossier vide.
 *
 * IL PASSE PAR `traiterPhotographie`, LE TRAITEMENT REEL, et non par une
 * ecriture de fichiers arbitraires. Deux consequences, la seconde etant le
 * point :
 *
 *   - les onze declinaisons d'ADR-007 sont produites, avec leurs vrais noms
 *   - la fixture cesse d'INVENTER ce que le service produit, ce qui est
 *     exactement la faute qui a fait ecrire LS-187 a l'envers
 *
 * L'IMAGE SOURCE EST ENGENDREE, jamais versionnee : un carre uni de 2000 px
 * suffit a exercer le redimensionnement et les trois formats, et rien qui
 * ressemble a une photographie n'a sa place dans un depot public.
 *
 * IDEMPOTENT : `mkdir` en `recursive` et `writeFile` ecrasent sans se plaindre,
 * une seconde execution rend le meme etat.
 *
 * Usage : node --experimental-strip-types scripts/engendrer-medias-test.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

/**
 * Les chemins de media du catalogue de test.
 *
 * ILS SONT RECOPIES ICI PLUTOT QU'IMPORTES de `tests/e2e/chemin-session.ts`, et
 * c'est une contrainte et non un choix : ce script tourne AVANT le build, hors
 * du contexte de Playwright et de ses alias de module. Le controle textuel
 * `verifier-medias-test.sh` confronte les deux listes, sans quoi elles
 * divergeraient au premier media ajoute.
 */
const CHEMINS = ["e2e-ls104", "e2e-ls105-second"];

/**
 * Les declinaisons produites, ADR-007. Recopiees pour la meme raison.
 *
 * ONZE FICHIERS : quatre largeurs, trois formats, moins le JPEG en 1920 px que
 * le traitement ne produit pas.
 */
const LARGEURS = [320, 640, 1280, 1920];
const FORMATS_PAR_LARGEUR = {
  320: ["avif", "webp", "jpeg"],
  640: ["avif", "webp", "jpeg"],
  1280: ["avif", "webp", "jpeg"],
  1920: ["avif", "webp"],
};

/** Qualites d'ADR-007, mesurees en PSNR sur une photographie de 24 Mpx. */
const QUALITE = { avif: 50, webp: 78, jpeg: 80 };

async function principal() {
  const racine = join(process.cwd(), "public", "medias");

  /*
   * UN CARRE UNI DE 2000 px, au-dela de la plus grande largeur servie, pour que
   * le redimensionnement ait quelque chose a faire. Une source plus petite
   * ferait produire des declinaisons agrandies et masquerait un defaut de
   * calcul de largeur.
   */
  const source = await sharp({
    create: {
      width: 2000,
      height: 2000,
      channels: 3,
      background: { r: 196, g: 160, b: 82 },
    },
  })
    .jpeg()
    .toBuffer();

  let ecrits = 0;

  for (const chemin of CHEMINS) {
    const dossier = join(racine, chemin);
    await mkdir(dossier, { recursive: true });

    for (const largeur of LARGEURS) {
      for (const format of FORMATS_PAR_LARGEUR[largeur] ?? []) {
        /*
         * `withoutEnlargement` N'EST PAS POSE, et c'est volontaire : la source
         * fait 2000 px, donc toutes les largeurs retrecissent. L'ajouter
         * masquerait le jour ou la source deviendrait trop petite.
         */
        const contenu = await sharp(source)
          .resize(largeur, largeur, { fit: "cover" })
          .toFormat(format, { quality: QUALITE[format] })
          .toBuffer();

        await writeFile(join(dossier, `${largeur}.${format}`), contenu);
        ecrits += 1;
      }
    }
  }

  console.log(
    `Declinaisons de test engendrees : ${ecrits} fichiers, ${CHEMINS.length} medias`,
  );
}

await principal();
