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

  /*
   * Plafond du corps des Server Actions, LS-102. ADR-007.
   *
   * LE DEFAUT DE NEXT.JS EST 1 Mo, ce qui refuserait toute photographie de
   * telephone : ADR-007 a mesure environ 5 Mo pour une photographie courante et
   * a éprouvé un cas à 17,6 Mo. Le refus viendrait du framework AVANT que la
   * Server Action ne s'exécute, avec une erreur générique, et le message de
   * `FichierTropVolumineuxError` ne serait jamais atteint.
   *
   * 26 Mo ET NON 25, ET L'ÉCART EST LE POINT. `TAILLE_MAX_OCTETS` borne le
   * FICHIER à 25 Mo ; ce plafond borne le CORPS DE LA REQUÊTE, qui transporte
   * le fichier dans un `FormData` multipart avec ses frontières et ses en-têtes
   * de partie. Le corps est donc toujours strictement plus gros que le fichier.
   *
   * Mesuré le 15 août 2026 sur Node 22.23.2, fichier de 25 Mo exactement :
   *
   *   fichier            26 214 400 octets
   *   corps transporté   26 214 575 octets
   *   surcoût                    175 octets
   *
   * Égaler les deux valeurs ouvrait donc une fenêtre d'environ deux cents
   * octets sous la borne, où un fichier ACCEPTÉ par le service était REFUSÉ par
   * le transport. Le refus venant du framework avant l'exécution de l'action,
   * `FichierTropVolumineuxError` n'était jamais atteint et l'écran restait sur
   * sa progression : le pire des deux comportements, sur la zone exacte que le
   * message « 25 Mo au maximum » invite à approcher.
   *
   * LA MARGE D'UN MÉGAOCTET N'AUTORISE AUCUN FICHIER PLUS GROS : elle laisse
   * seulement le refus se produire dans le service, qui sait le nommer. Ne pas
   * la retirer en croyant aligner deux chiffres qui ne mesurent pas la même
   * chose.
   *
   * CE PLAFOND VAUT POUR TOUTES LES SERVER ACTIONS, arbitrage de Christophe du
   * 15 août 2026, la seconde voie étant un Route Handler dédié. Une action de
   * texte accepte donc elle aussi un corps de cette taille. Ce qui borne l'abus
   * n'est pas cette valeur : c'est la limitation de débit d'ADR-027, la garde de
   * rôle portée par chaque action, et `client_max_body_size` de Nginx en
   * production.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "26mb",
    },
  },

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
