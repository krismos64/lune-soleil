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

    /*
     * ------------------------------------------------------------------
     * `staleTimes.dynamic` A ETE ESSAYE PUIS RETIRE, LS-166, et le motif merite
     * d'etre garde ici : c'est la parade evidente au prechargement en boucle,
     * et elle est fausse sur ce projet.
     *
     * LE DEFAUT VISE. `dynamic` vaut ZERO par defaut, verifie via Context7 :
     * une reponse prechargee d'une route dynamique est perimee a l'instant ou
     * elle arrive, donc Next.js la jette et repart, sans fin. Toutes les routes
     * d'administration etant `force-dynamic`, l'ecran au repos enchainait des
     * rendus serveur en boucle, chacun interrogeant PostgreSQL.
     *
     * POURQUOI LE REGLAGE NE CONVIENT PAS. Il rend reutilisable une reponse
     * DEJA LUE, layout compris. Or la barre porte des PASTILLES de comptage,
     * rendues par le layout, quand la liste vient de la page : a cinq secondes,
     * la pastille annonce encore « 1 message non lu » sur une liste qui n'en
     * montre plus aucun.
     *
     * MESURE DU 7 SEPTEMBRE 2026, suite complete : le reglage a fait passer
     * `navigation-administration` de DEUX largeurs en echec a TROIS, et a
     * ajoute un echec sur les etats non nominaux. Il n'a rien ferme et a ouvert
     * autre chose.
     *
     * CE QUI FERME LE DEFAUT est `prefetch={false}` sur les liens concernes,
     * qui supprime la boucle sans introduire de cache. Voir
     * `src/components/navigation-administration.tsx`.
     * ------------------------------------------------------------------
     */
  },

  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: path.join(__dirname),

  /*
   * LES POLICES DU RENDU PDF ENTRENT DANS LA SORTIE STANDALONE, LS-129.
   *
   * DECLAREES PLUTOT QUE LAISSEES A L'ANALYSE STATIQUE. Le tracage les a bien
   * copiees a la mesure du 1er septembre 2026, mais il deduit les fichiers d'un
   * `path.join` construit a l'execution, ce qui n'est garanti par aucun
   * contrat : une refactorisation du chemin les ferait disparaitre de l'image.
   *
   * LE DEFAUT NE SE VERRAIT QU'AU DEPLOIEMENT, et il serait grave : sans sa
   * police, `@react-pdf/renderer` ne leve pas, il SUBSTITUE en silence, et les
   * factures de production porteraient des noms de clients deformes. Meme
   * famille de piege que « outil absent de l'image ».
   *
   * `/*` ET NON LA SEULE ROUTE DU WEBHOOK : la regeneration depuis
   * l'administration rend le meme document par un autre chemin.
   */
  outputFileTracingIncludes: {
    "/*": ["./src/integrations/pdf/polices/**/*"],
  },

  // En-têtes de sécurité minimaux. La politique de sécurité de contenu complète
  // arrive avec les pages réelles, elle dépend de Stripe et de l'hébergeur de
  // médias, LS-73.
  poweredByHeader: false,

  /*
   * STREAMING DES MÉTADONNÉES DÉSACTIVÉ POUR TOUS LES AGENTS. LS-211, ADR-039.
   *
   * LE DÉFAUT QU'IL FERME, mesuré en arrêtant réellement la base de production
   * le 9 septembre 2026 : `/catalogue` rendait **200** avec « Chargement des
   * pièces… » comme état final, là où l'accueil rendait un vrai 500.
   *
   * LA CAUSE, ✅ via Context7. Next.js 16 diffuse les métadonnées séparément sur
   * une page dynamique, sans bloquer le rendu de l'UI : la réponse est donc
   * ENGAGÉE avant que `generateMetadata` ait fini de lire la base, et un statut
   * ne se change plus une fois les octets partis.
   *
   * L'ÉCART ENTRE AGENTS EST CE QUI A IDENTIFIÉ LA CAUSE, même URL, même
   * instant : navigateur 200, Googlebot 200, **Twitterbot 500**. Twitterbot est
   * dans `HTML_LIMITED_BOT_UA_RE`, où le streaming est déjà désactivé, donc la
   * lecture y bloque le rendu et son échec fixe le statut. Ce réglage étend à
   * tous le comportement qui produisait déjà le seul statut honnête.
   *
   * POURQUOI PAS LES TROIS VOIES QUE LS-211 LISTAIT. Retirer le
   * `generateMetadata` dynamique alignerait le catalogue sur l'accueil, mais au
   * prix du **canonical par filtre** de LS-137 : un canonical figé sur
   * `/catalogue` dirait aux moteurs que `?categorie=colliers` EST le catalogue
   * complet, et la page filtrée quitterait l'index en emportant les mots-clés de
   * la catégorie. Ce réglage corrige le statut SANS rien sacrifier.
   *
   * L'EFFET, MESURÉ SUR DEUX BUILDS DU MÊME COMMIT, base réellement arrêtée :
   *
   *                       SANS le réglage      AVEC le réglage
   *   navigateur               200                  500
   *   Googlebot                200                  500
   *   Twitterbot               500                  500
   *   accueil `/`              500                  500
   *
   * Le catalogue rejoint l'accueil pour TOUS les agents, ce qui est exactement
   * ce que LS-211 demandait.
   *
   * CE QU'IL COÛTE, MESURÉ ET NON SUPPOSÉ. La documentation annonce une
   * dégradation du TTFB et du LCP, le rendu attendant désormais la lecture.
   * Build de production local, base vivante, médiane de dix appels après trois
   * de chauffe :
   *
   *   /catalogue                   avant 0,005 s   après 0,008 s
   *   /catalogue?categorie=...     avant 0,003 s   après 0,007 s
   *   /                            avant 0,006 s   après 0,007 s
   *
   * TROIS À QUATRE MILLISECONDES, ET CE CHIFFRE EST LOCAL : la base répond ici
   * en moins d'une milliseconde, quand la production mesure 0,270 s de TTFB sur
   * `/catalogue`. L'écart réel s'y noiera d'autant plus, mais il n'a pas été
   * mesuré sur le VPS : LS-140 porte cette mesure.
   *
   * LA RAISON POUR LAQUELLE LE COÛT EST FAIBLE EST STRUCTURELLE : le catalogue
   * est en `force-dynamic` et le corps de la page LIT DÉJÀ la base. Le streaming
   * n'économisait donc pas une attente, il la masquait.
   *
   * SA PORTÉE EST DE DEUX PAGES, relevé et non supposé : seules `/catalogue` et
   * `/produit/[slug]` ont un `generateMetadata`. Tout le reste du site porte des
   * métadonnées statiques, que ce réglage ne touche pas.
   *
   * NE PAS LE REMPLACER PAR UN `try/catch` DANS `generateMetadata`. Essayé le
   * 9 septembre 2026 et ANNULÉ : le repli faisait RÉUSSIR la fonction, donc la
   * page rendait son titre et continuait, et Twitterbot passait de 500 à 200.
   * Le seul chemin qui produisait un statut honnête disparaissait.
   */
  htmlLimitedBots: /.*/,
};

export default nextConfig;
