/*
 * Engendre le visuel provisoire du hero de l'accueil, LS-122.
 *
 * CE N'EST PAS UNE PHOTOGRAPHIE. C'est une composition d'aplats dans les tons
 * d'ADR-022, qui tient la place jusqu'a LS-23. Elle porte une mention lisible
 * pour que personne ne la prenne pour un visuel definitif, en preproduction
 * comme en revue.
 *
 * POURQUOI UN SCRIPT ET NON UNE IMAGE COMMITEE SEULE : le fichier engendre est
 * commite, mais le script documente ce qu'il contient et permet de le refaire a
 * l'identique. Une image binaire sans origine devient vite intouchable.
 *
 * `sharp` NE RASTERISE PAS LES DEGRADES SVG de facon fiable ici : un premier
 * essai avec `linearGradient` a rendu un aplat uni. La composition se fait donc
 * par superposition de calques opaques, ce qui est previsible.
 *
 *   node scripts/engendrer-visuel-provisoire.cjs
 */
const sharp = require("sharp");

const LARGEUR = 1280;
const HAUTEUR = 960;

/** Jetons d'ADR-022, repris en dur ici : ce fichier ne lit pas le CSS. */
const SABLE = { r: 242, g: 234, b: 223 };

const formes = `
<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}">
  <rect x="0" y="0" width="${LARGEUR}" height="${HAUTEUR}" fill="#e3d5bd"/>
  <rect x="0" y="620" width="${LARGEUR}" height="340" fill="#d5c3a5"/>
  <circle cx="760" cy="400" r="210" fill="#c4a052"/>
  <circle cx="470" cy="560" r="130" fill="#b4643e"/>
  <rect x="0" y="0" width="${LARGEUR}" height="${HAUTEUR}" fill="#3b2f2a" opacity="0.05"/>
  <text x="${LARGEUR / 2}" y="${HAUTEUR - 54}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="30"
        font-weight="600" fill="#3b2f2a">
    Visuel provisoire, remplace par LS-23
  </text>
</svg>`;

sharp({
  create: { width: LARGEUR, height: HAUTEUR, channels: 3, background: SABLE },
})
  .composite([{ input: Buffer.from(formes) }])
  .jpeg({ quality: 80 })
  .toFile("public/habillage/accueil-hero.jpg")
  .then((info) =>
    console.log(`engendre ${info.width}x${info.height}, ${info.size} octets`),
  )
  .catch((erreur) => {
    console.error("ECHEC", erreur.message);
    process.exit(1);
  });
