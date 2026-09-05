/**
 * Configuration Playwright, LS-68.
 *
 * PORTEE ACTUELLE. Le site porte la page d'attente, l'administration du
 * catalogue et, depuis LS-104, le CATALOGUE PUBLIC. La fiche produit appartient
 * a LS-105 et le tunnel d'achat a la phase 3 : ces tests ne couvrent donc aucun
 * parcours d'achat, qui n'existe pas encore.
 *
 * `webServer` construit puis demarre l'application avant la suite et l'arrete
 * apres. Un `next dev` serait plus rapide a demarrer mais testerait un rendu
 * different de celui de la production, avec ses avertissements de developpement
 * et sans les optimisations de build.
 *
 * TROIS TAILLES ET NON UNE. Le projet est concu a partir de 320 px, largeur
 * imposee par CLAUDE.md. Un test de bout en bout qui ne s'executerait qu'en
 * 1280 px laisserait passer exactement le defaut que cette contrainte vise.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const URL_BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",

  // Aucun test ignore, aucun test en attente : LS-68 l'exige, et `forbidOnly`
  // empeche en plus qu'un `test.only` oublie masque toute la suite en
  // integration continue.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: URL_BASE,
    trace: "on-first-retry",
  },

  projects: [
    /*
     * PREPARATION : une seule inscription par session, pour toute la suite.
     * LS-81, LS-89, LS-111.
     *
     * Les tests de l'ecran de suppression exigent une session cliente, et aucun
     * ecran de connexion client n'existe encore, LS-54. Les faire s'inscrire
     * eux-memes consommait le plafond de `/sign-up/email`, trois par minute et
     * par IP, multiplie par les trois largeurs : un test VOISIN,
     * `connexion-administration`, recevait alors 429 la ou il attend 401.
     *
     * DEUX SESSIONS DISTINCTES ET NON UNE. LS-111 ajoute une session
     * d'ADMINISTRATION, qui ne peut pas se confondre avec la precedente : les
     * fichiers qui verifient qu'un visiteur ordinaire est refuse sur un ecran
     * protege ont besoin d'une session SANS le role. Promouvoir la session
     * cliente les ferait passer pour la mauvaise raison.
     *
     * TROIS SESSIONS DEPUIS LS-56, et la marge du plafond est desormais NULLE.
     * `session-verifiee.setup.ts` ouvre un compte VERIFIE, qui ne peut pas se
     * confondre avec la session cliente : celle-ci est volontairement NON
     * verifiee, et c'est ce qui permet a `compte-authentification` de mesurer
     * le rappel de verification. Les deux etats sont mutuellement exclusifs a
     * l'ecran.
     *
     * `/sign-up/email` accepte trois appels par minute et par IP : les trois
     * sont donc consommes. `session-verifiee.setup.ts` porte pour cette raison
     * un REESSAI ESPACE sur 429, sans quoi une suite relancee dans la minute
     * echoue a la preparation. Une quatrieme session exigerait de repenser
     * l'ensemble, pas d'ajouter un fichier.
     *
     * NE PAS NEUTRALISER LE PLAFOND EN TEST : il retirerait de la mesure une
     * protection reelle, et la suite ne dirait plus rien du comportement servi
     * en production.
     *
     * `testMatch` isole ces fichiers des trois projets de largeur, sans quoi ils
     * s'executeraient quatre fois et le probleme resterait entier.
     */
    {
      name: "preparation",
      testMatch:
        /(session-(cliente|verifiee|administration)|commande)\.setup\.ts$/,
    },
    {
      name: "mobile-320",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        // 320 px, la largeur de reference du projet. Aucun appareil predefini
        // de Playwright ne descend aussi bas, d'ou la taille explicite.
        viewport: { width: 320, height: 640 },
      },
    },
    {
      name: "mobile-390",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        // 390 px avec le moteur de Chrome, et NON le profil « iPhone 14 » de
        // Playwright, qui embarque WebKit. Ces trois projets verifient des
        // LARGEURS, pas des moteurs de rendu : ajouter WebKit et Firefox
        // alourdirait l'integration continue de LS-69 d'un telechargement de
        // navigateur par execution sans rien prouver de plus sur le
        // dimensionnement. Une couverture multi-moteurs se decidera quand une
        // interface reelle existera, phase 2.
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "bureau-1280",
      testIgnore:
        /(session-(cliente|verifiee|administration)|commande)\.setup\.ts$/,
      dependencies: ["preparation"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: URL_BASE,
    reuseExistingServer: !process.env.CI,
    // Une construction Next.js complete depasse largement le delai par defaut.
    timeout: 180_000,
    env: {
      /*
       * BETTER_AUTH_URL DOIT DESIGNER LE SERVEUR REELLEMENT SERVI, LS-70.
       *
       * Better Auth derive ses origines de confiance de `baseURL` et rejette
       * toute requete venue d'ailleurs, protection CSRF. Sans cette ligne, la
       * valeur de `.env` designe le port 3000 quand Playwright sert sur 3100 :
       * chaque tentative de connexion est refusee en « Invalid origin » AVANT
       * la verification des identifiants.
       *
       * Le test de connexion en echec passait alors au vert POUR LA MAUVAISE
       * RAISON, un refus d'origine et non un refus d'identifiants. Un test qui
       * verdit sans exercer le chemin qu'il pretend couvrir ne prouve rien.
       *
       * Le secret n'est pas repris ici : il vient de `.env`, dont ce processus
       * herite, et sa presence est exigee au demarrage par `src/lib/auth.ts`.
       */
      BETTER_AUTH_URL: URL_BASE,
      /*
       * NEXT_PUBLIC_SITE_URL DOIT DESIGNER LE MEME SERVEUR, LS-137, et pour un
       * motif jumeau de celui du dessus.
       *
       * Elle porte `metadataBase`, donc la resolution de TOUTES les URL
       * canoniques. Heritee de `.env`, elle designerait le port 3000 quand
       * Playwright sert sur 3100 : les canoniques seraient construits sur une
       * adresse que la suite n'interroge jamais.
       *
       * LA SUITE PASSERAIT QUAND MEME EN GRANDE PARTIE, ce qui est le piege :
       * un test qui verifie la seule PRESENCE d'un canonical ne verrait rien.
       * `tests/e2e/referencement.spec.ts` compare la valeur exacte, il rougirait
       * donc, et le premier reflexe serait d'assouplir le test plutot que de
       * corriger la configuration.
       *
       * ELLE EST AUSSI REQUISE POUR DEMARRER : `lib/seo.ts` leve sur son
       * absence, plutot que de replier sur localhost et de sortir le site de
       * l'index en production.
       */
      NEXT_PUBLIC_SITE_URL: URL_BASE,
      /*
       * LE PRESTATAIRE DE PAIEMENT EST ABSENT PENDANT TOUTE LA SUITE, LS-118,
       * et la cle est VIDEE explicitement plutot qu'heritee de `.env` : le jour
       * ou une cle de test y sera posee, LS-18, la suite partirait sinon
       * appeler l'API reelle, non deterministe et hors de son perimetre. Meme
       * situation assumee que le transporteur : le compte n'existe pas, la
       * creation de session echoue proprement, et c'est exactement le cas
       * d'erreur du parcours 1 que la page de confirmation doit couvrir.
       */
      STRIPE_SECRET_KEY: "",
      /*
       * LA ROUTE QUI ECHOUE A DESSEIN EST OUVERTE, LS-191, et UNIQUEMENT ici.
       *
       * `administration/echec-rendu` rend 404 sans cette variable : c'est un
       * defaut ferme, la page n'existe nulle part ailleurs que dans cette suite.
       * Elle est le seul moyen de faire passer une erreur reelle par la vraie
       * frontiere d'erreur, sous le vrai layout, avec la barre de navigation
       * reellement rendue.
       *
       * Le critere 6 de la story refuse une frontiere qu'aucun test ne
       * traverse : « une frontiere qu'aucun test ne traverse est une intention,
       * pas une garantie ».
       *
       * `scripts/verifier-route-echec.sh` garde l'ordre des deux instructions de
       * cette page, et `erreur-administration.spec.ts` verifie qu'elle rend bien
       * 404 quand la variable n'est pas posee.
       */
      AUTORISER_ECHEC_RENDU: "1",
    },
  },
});
