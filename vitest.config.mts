/**
 * Configuration Vitest, LS-68.
 *
 * TROIS PROJETS, parce que trois natures de test cohabitent.
 *
 * `unitaire` : rapide, sans base, parallelisable. Il ne declenche AUCUNE
 * preparation de base, ce qui le rend lancable sur une machine sans Docker.
 *
 * `composant` : rend un composant React en jsdom, sans base ni navigateur.
 * Ajoute par LS-113, arbitrage de Christophe du 5 septembre 2026. Il existe
 * pour les etats qu'aucun autre projet ne peut atteindre : les deux etats vides
 * « aucune categorie » demandent une liste GLOBALEMENT vide, ce que la fixture
 * de bout en bout ne peut pas produire puisqu'elle insere toujours une
 * categorie, et vider la table en cours de suite ferait voir cet etat aux
 * travailleurs voisins, la base etant partagee.
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
        /*
         * L'ALIAS EST REDECLARE ICI COMME DANS LES DEUX AUTRES PROJETS. Un
         * projet Vitest n'herite pas du `resolve` englobant, mesure en LS-50.
         */
        resolve: resolutionAlias,
        test: {
          name: "composant",
          /*
           * `jsdom` FOURNIT LE DOM QUE REACT ATTEND. Le projet `unitaire` est
           * en `node`, ou `document` n'existe pas : y rendre un composant leve
           * avant la premiere assertion.
           */
          environment: "jsdom",
          /*
           * L'EXTENSION EST `.test.tsx`, ET LA DISTINCTION EST VOULUE. Les
           * tests unitaires restent en `.test.ts` : un fichier ne peut pas
           * appartenir aux deux projets par accident, et le nom dit ou il
           * tourne.
           */
          include: ["tests/composant/**/*.test.tsx"],
          /*
           * LE NETTOYAGE ENTRE DEUX TESTS EST INDISPENSABLE. Sans lui, le DOM
           * du test precedent reste monte : une assertion « le message est
           * absent » passerait au vert en trouvant celui d'avant, ou
           * echouerait en trouvant deux fois le meme element.
           */
          setupFiles: ["tests/composant/preparation.ts"],
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
