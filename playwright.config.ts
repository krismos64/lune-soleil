/**
 * Configuration Playwright, LS-68.
 *
 * PORTEE ACTUELLE VOLONTAIREMENT ETROITE. Le site se limite a une page
 * d'attente, le catalogue et le tunnel appartiennent a la phase 2. Ces tests
 * verifient donc que l'application se construit, se sert et reste accessible,
 * pas un parcours d'achat qui n'existe pas encore.
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
     * DEUX INSCRIPTIONS SUR LES TROIS de la minute sont donc consommees ici, et
     * c'est la marge qui interdit d'en ajouter une troisieme sans repenser
     * l'ensemble.
     *
     * `testMatch` isole ces fichiers des trois projets de largeur, sans quoi ils
     * s'executeraient quatre fois et le probleme resterait entier.
     */
    {
      name: "preparation",
      testMatch: /session-(cliente|administration)\.setup\.ts$/,
    },
    {
      name: "mobile-320",
      testIgnore: /session-(cliente|administration)\.setup\.ts$/,
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
      testIgnore: /session-(cliente|administration)\.setup\.ts$/,
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
      testIgnore: /session-(cliente|administration)\.setup\.ts$/,
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
    },
  },
});
