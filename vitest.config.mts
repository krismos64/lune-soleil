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

/**
 * L'alias `@/` est declare PAR PROJET et non une seule fois a la racine.
 *
 * Un projet Vitest n'herite pas du `resolve` de la configuration englobante :
 * il porte sa propre resolution de modules. Declare seulement au sommet, le
 * `resolve` sert la configuration racine, et tout import `@/...` depuis un
 * fichier de test echoue en « Cannot find package '@/services/...' ». Mesure
 * sur ce depot en LS-50, le premier test a importer le code applicatif.
 */
const resolutionAlias = { tsconfigPaths: true } as const;

export default defineConfig({
  resolve: resolutionAlias,
  test: {
    projects: [
      {
        resolve: resolutionAlias,
        test: {
          name: "unitaire",
          environment: "node",
          include: ["tests/unitaire/**/*.test.ts"],
        },
      },
      {
        resolve: resolutionAlias,
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
