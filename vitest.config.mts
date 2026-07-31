/**
 * Configuration Vitest, LS-68.
 *
 * DEUX PROJETS, parce que deux natures de test cohabitent.
 *
 * `unitaire` : rapide, sans base, parallelisable. Il ne declenche AUCUNE
 * preparation de base, ce qui le rend lancable sur une machine sans Docker.
 *
 * `integration` : sur base ephemere reelle, en `fileParallelism: false`. Ces
 * tests mesurent de la concurrence sur un serveur PostgreSQL partage ; les
 * paralleliser entre fichiers ferait dependre leurs mesures de la charge des
 * voisins. La concurrence INTERNE a un test, vingt acheteurs simultanes, n'est
 * pas affectee : elle passe par un pool de connexions, pas par des travailleurs
 * Vitest.
 *
 * `resolve.tsconfigPaths` et non le greffon vite-tsconfig-paths : Vite resout
 * nativement les alias de tsconfig depuis la version 8, et signale le greffon
 * comme redondant.
 *
 * Verifie sur la documentation Vitest 4.1 via Context7.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        test: {
          name: "unitaire",
          environment: "node",
          include: ["tests/unitaire/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/aide/preparation-globale.ts"],
          fileParallelism: false,
          // Un demarrage froid et une migration depassent largement les cinq
          // secondes par defaut.
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
