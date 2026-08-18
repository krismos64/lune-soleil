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
