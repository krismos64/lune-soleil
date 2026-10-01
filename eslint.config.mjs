import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prettier en dernier : desactive les regles de mise en forme qui entrent en
  // conflit avec le formateur.
  prettier,
  // Navigation complete apres un changement d'identite, LS-255. La regle
  // `no-location-assign-relative-destination`, arrivee avec
  // eslint-config-next 16.3, recommande `router.push`. Ces huit appels suivent
  // une connexion, une deconnexion, une reauthentification ou une suppression
  // de compte : `router.push` garderait dans le cache du routeur client des
  // ecrans rendus sous l'ancienne session, et le rechargement complet est le
  // seul moyen de tout relire avec le nouveau cookie. La regle reste active
  // partout ailleurs.
  {
    files: [
      "src/app/(boutique)/compte/bouton-deconnexion.tsx",
      "src/app/(boutique)/compte/formulaire-suppression.tsx",
      "src/app/(boutique)/compte/connexion/formulaire-connexion-client.tsx",
      "src/app/(boutique)/compte/inscription/formulaire-inscription.tsx",
      "src/app/(boutique)/compte/reauthentification/formulaire-reauthentification-client.tsx",
      "src/app/administration/connexion/formulaire-connexion.tsx",
      "src/app/administration/reauthentification/formulaire-reauthentification.tsx",
    ],
    rules: {
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Client Prisma fabrique, LS-68. Du code engendre n'a pas a etre audite :
    // aucune remarque n'y serait corrigeable, `prisma generate` ecrasant toute
    // modification. Sans cette ligne, ESLint analyse plus de quatre cents
    // fichiers a chaque execution, en integration continue comprise.
    "src/generated/**",
    // Scratchpad local, LS-106. `tmp/` est ignore par git depuis LS-105 : les
    // scripts jetables d'une session y vivent, et ESLint les analysait, faisant
    // apparaitre des avertissements sur du code qui ne sera jamais commite. Un
    // lint qui crie sur du jetable finit par etre lu sans etre regarde.
    "tmp/**",
  ]),
]);

export default eslintConfig;
