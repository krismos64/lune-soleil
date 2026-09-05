#!/usr/bin/env node
/**
 * Engendre les images de marque à partir du logo source, LS-147.
 *
 * POURQUOI UN SCRIPT ET NON UNE GÉNÉRATION À LA VOLÉE. La première version de
 * cette story composait l'image de partage avec `ImageResponse`, dans un
 * `opengraph-image.tsx`. Cette forme est la plus élégante sur le papier, et elle
 * n'a pas tenu : la balise `og:image` sortait bien en développement et
 * disparaissait sous `next start`, sur les six pages publiques qui déclarent
 * leur propre `openGraph`. Le mécanisme exact n'a pas été élucidé, malgré la
 * lecture de `mergeStaticMetadata`, `resolveOpenGraph`, `resolveAndValidateImage`
 * et `resolveUrl` dans Next 16.2.12.
 *
 * Arbitrage de Christophe : produire un PNG statique et le référencer par une
 * URL ABSOLUE. Le rendu ne dépend alors plus d'aucune résolution relative ni
 * d'aucune convention de fichier, seulement d'un fichier servi depuis `public/`.
 * L'image est figée entre deux exécutions de ce script, ce qui est le prix payé.
 *
 * LES IMAGES ENGENDRÉES SONT VERSIONNÉES. Les rejouer ne doit rien changer tant
 * que le logo et les textes ne bougent pas : le script est déterministe, sans
 * horodatage ni valeur aléatoire. `--verifier` le prouve en comparant les
 * empreintes plutôt qu'en réécrivant, ce qui permet de le passer en intégration
 * continue sans faire diverger l'arbre de travail.
 *
 * Usage :
 *   node scripts/engendrer-images-marque.mjs             # écrit les fichiers
 *   node scripts/engendrer-images-marque.mjs --verifier  # échoue si divergence
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
/*
 * LE LOGO SOURCE VIT DANS `assets/` ET NON DANS `public/`, deliberement : ce
 * dossier n'est pas servi par Next.js. Le fichier de 1024 px est la MATIERE
 * PREMIERE des images de marque, pas une ressource du site ; le publier
 * ajouterait une seconde adresse pour la meme identite, que rien ne
 * synchroniserait avec les fichiers engendres.
 */
const LOGO_SOURCE = join(RACINE, "assets/logo-lune-soleil.png");

/*
 * Les couleurs sont recopiées de `src/styles/tokens.css`. Elles sont écrites en
 * dur ici parce qu'un script Node ne résout aucune variable CSS, et le contrôle
 * de contraste ne les voit donc pas. Vérifiées à la main :
 *
 *   --ls-primary #5f4519 sur --ls-surface-sand #f2eadf : 7,34:1, AAA
 *
 * L'accroche emploie ce même brun, et non `--ls-text-muted` qui tomberait à
 * 4,00:1 sur ce fond : le sable est le fond piégeux du projet, C31.
 */
const SABLE = { r: 0xf2, g: 0xea, b: 0xdf, alpha: 1 };
const BRUN = "#5f4519";
const OR = "#c4a052";

/*
 * LE RECADRAGE SUR LE SYMBOLE, mesuré et non estimé.
 *
 * Le logo est un médaillon rond qui porte le nom écrit dedans, plus la mention
 * « BIJOUX FAITS MAIN » en petites capitales. À 32 px, ce médaillon complet
 * devient une tache dorée sur un disque beige : le texte disparaît en bouillie
 * de pixels et l'icône n'est plus identifiable dans une barre d'onglets.
 *
 * Ces quatre nombres cadrent le croissant et le soleil SEULS, sans texte ni
 * bord de médaillon. Ils ont été trouvés par essais successifs, chaque cadrage
 * plus large rattrapant soit les sommets des lettres en bas, soit le liseré du
 * médaillon en haut : le symbole et le texte sont trop proches pour qu'un carré
 * plus généreux les sépare.
 */
const CADRE_SYMBOLE = { left: 245, top: 140, width: 520, height: 520 };

/** Les images produites, et où elles vont. */
const SORTIES = {
  favicon: join(RACINE, "src/app/favicon.ico"),
  icone32: join(RACINE, "src/app/icon.png"),
  iconeApple: join(RACINE, "src/app/apple-icon.png"),
  iconeManifeste192: join(RACINE, "public/habillage/icone-192.png"),
  iconeManifeste512: join(RACINE, "public/habillage/icone-512.png"),
  partage: join(RACINE, "public/habillage/partage.png"),
};

/**
 * Le symbole recadré, source de toutes les petites icônes.
 *
 * `flatten` APLATIT SUR LE SABLE PLUTÔT QUE DE GARDER LA TRANSPARENCE. iOS
 * refuse un `apple-touch-icon` transparent et compose sur du noir, ce qui
 * donnerait un symbole doré sur fond noir, à l'opposé de la palette.
 */
async function symbole(taille) {
  return sharp(LOGO_SOURCE)
    .extract(CADRE_SYMBOLE)
    .resize(taille, taille, { fit: "cover" })
    .flatten({ background: SABLE })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
}

/** Le médaillon complet, lisible seulement à partir de 180 px environ. */
async function medaillon(taille) {
  return sharp(LOGO_SOURCE)
    .resize(taille, taille, { fit: "contain", background: SABLE })
    .flatten({ background: SABLE })
    .png({ compressionLevel: 9, palette: true, quality: 90 })
    .toBuffer();
}

/**
 * L'image de partage, 1200 par 630.
 *
 * C'est le ratio 1,91:1 attendu par Open Graph. Une image carrée y serait rognée
 * à gauche et à droite, ce qui couperait le médaillon.
 *
 * LE TEXTE EST DESSINÉ EN SVG, faute de moteur de rendu HTML ici. Les polices
 * nommées sont des familles génériques : aucune police n'est chargée, ce qui
 * suit la décision du layout racine, la typographie de la boutique appartenant
 * à la phase 2 avec l'identité visuelle.
 *
 * L'insécable est écrite `&#160;` et non collée telle quelle : sous cette forme
 * elle reste visible en relecture, alors qu'un caractère invisible dans le
 * source ne se distingue plus d'une espace ordinaire et se perd au
 * copier-coller. Elle tient « faits main » sur une seule ligne, la coupure
 * tombant sinon entre les deux mots et séparant la locution.
 */
async function imageDePartage() {
  const LARGEUR = 1200;
  const HAUTEUR = 630;
  const COTE_LOGO = 380;

  const logo = await sharp(LOGO_SOURCE)
    .resize(COTE_LOGO, COTE_LOGO)
    .png()
    .toBuffer();

  const texte = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}">
       <text x="600" y="275" font-family="Helvetica, Arial, sans-serif"
             font-size="76" font-weight="700" fill="${BRUN}">Lune &amp; Soleil</text>
       <text x="600" y="338" font-family="Helvetica, Arial, sans-serif"
             font-size="34" fill="${BRUN}">Bijoux artisanaux</text>
       <text x="600" y="384" font-family="Helvetica, Arial, sans-serif"
             font-size="34" fill="${BRUN}">faits&#160;main, cr&#233;&#233;s &#224; l'unit&#233;</text>
     </svg>`,
  );

  return sharp({
    create: {
      width: LARGEUR,
      height: HAUTEUR,
      channels: 3,
      background: SABLE,
    },
  })
    .composite([
      { input: logo, left: 130, top: 113 },
      { input: texte, left: 0, top: 0 },
      /* Le liseré doré reprend le cercle du médaillon, décor seulement. */
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="12">
             <rect width="${LARGEUR}" height="12" fill="${OR}"/>
           </svg>`,
        ),
        left: 0,
        top: HAUTEUR - 12,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Le favicon multi-résolutions.
 *
 * TROIS TAILLES DANS UN SEUL FICHIER : 16 pour l'onglet, 32 pour la barre de
 * favoris, 48 pour le raccourci de bureau. sharp ne sait pas écrire d'ICO, la
 * composition passe donc par ImageMagick, présent sur la machine et en
 * intégration continue.
 */
async function favicon() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  const dossier = await mkdtemp(join(tmpdir(), "ls147-"));
  try {
    const sources = [];
    for (const taille of [16, 32, 48]) {
      const chemin = join(dossier, `${taille}.png`);
      await writeFile(chemin, await symbole(taille));
      sources.push(chemin);
    }
    const cible = join(dossier, "favicon.ico");
    await promisify(execFile)("magick", [...sources, cible]);
    return readFile(cible);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

async function engendrer() {
  return {
    [SORTIES.favicon]: await favicon(),
    [SORTIES.icone32]: await symbole(32),
    [SORTIES.iconeApple]: await symbole(180),
    [SORTIES.iconeManifeste192]: await medaillon(192),
    [SORTIES.iconeManifeste512]: await medaillon(512),
    [SORTIES.partage]: await imageDePartage(),
  };
}

const empreinte = (octets) =>
  createHash("sha256").update(octets).digest("hex").slice(0, 16);

async function main() {
  const verifier = process.argv.includes("--verifier");
  const produites = await engendrer();
  let divergences = 0;

  for (const [chemin, octets] of Object.entries(produites)) {
    const relatif = chemin.slice(RACINE.length + 1);

    if (!verifier) {
      await writeFile(chemin, octets);
      console.log(`  ecrit    ${relatif}  ${octets.length} o`);
      continue;
    }

    const existant = await readFile(chemin).catch(() => null);
    if (existant === null) {
      console.error(`  ABSENT   ${relatif}`);
      divergences += 1;
    } else if (empreinte(existant) !== empreinte(octets)) {
      console.error(
        `  DIVERGE  ${relatif}  disque ${empreinte(existant)} attendu ${empreinte(octets)}`,
      );
      divergences += 1;
    } else {
      console.log(`  conforme ${relatif}`);
    }
  }

  if (divergences > 0) {
    console.error(
      `\n${divergences} image(s) de marque divergent du logo source.\n` +
        "Rejouer : node scripts/engendrer-images-marque.mjs",
    );
    process.exit(1);
  }
}

await main();
