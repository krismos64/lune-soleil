import path from "node:path";
import type { NextConfig } from "next";

/*
 * Racine du projet fixée explicitement.
 *
 * Next.js déduit la racine du workspace en cherchant les fichiers de
 * verrouillage. Un `package-lock.json` present dans un répertoire parent, ici le
 * dossier personnel, le fait choisir ce parent et émettre un avertissement. Le
 * périmètre de la trace de fichiers deviendrait faux en construction Docker.
 *
 * Les deux options servent deux choses distinctes : `turbopack.root` la
 * résolution des modules, `outputFileTracingRoot` le calcul des fichiers
 * embarqués dans la sortie autonome. Les deux pointent le dossier du projet.
 */

const nextConfig: NextConfig = {
  /*
   * Sortie autonome, LS-74.
   *
   * `next build` produit alors `.next/standalone`, un dossier qui porte son
   * propre `server.js` et les seules dépendances réellement tracées. L'image
   * finale n'embarque donc pas les 906 Mo de `node_modules` du poste, et
   * l'exécution passe par `node server.js` et non `next start`, qui exigerait
   * la CLI complète de Next.
   *
   * DEUX DOSSIERS NE SONT PAS TRACÉS et se copient à la main dans l'image :
   * `public/` et `.next/static`. Les oublier ne fait échouer ni la construction
   * ni le contrôle de santé, l'application sert alors ses pages sans styles ni
   * images. Voir le Dockerfile, qui porte les deux `COPY` correspondants.
   */
  output: "standalone",

  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: path.join(__dirname),

  // En-têtes de sécurité minimaux. La politique de sécurité de contenu complète
  // arrive avec les pages réelles, elle dépend de Stripe et de l'hébergeur de
  // médias, LS-73.
  poweredByHeader: false,
};

export default nextConfig;
