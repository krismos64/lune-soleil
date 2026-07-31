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
  ]),
]);

export default eslintConfig;
