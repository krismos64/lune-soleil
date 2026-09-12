/**
 * Configuration dediee a l'engendrement des apercus d'email, LS-222.
 *
 * POURQUOI UNE CONFIGURATION A PART. Le script d'apercu vit dans `scripts/` et
 * non dans `tests/` : ce n'est pas un test, c'est un outil qui ecrit des
 * fichiers. L'inclure dans le projet `unitaire` le ferait tourner a chaque
 * `npm run test`, donc reecrire un dossier a chaque execution de la suite, et
 * la CI produirait des fichiers que personne ne regarde.
 *
 * IL EMPRUNTE VITEST POUR SA RESOLUTION DE MODULES, rien d'autre : le code
 * applicatif emploie l'alias `@/`, que Node ne resout pas et que `vite-node`
 * resoudrait au prix d'une dependance de plus.
 *
 * L'ALIAS EST DECLARE DANS LE PROJET ET NON SEULEMENT A LA RACINE : un projet
 * Vitest n'herite pas du `resolve` englobant, mesure sur ce depot en LS-50.
 */
import { defineConfig } from "vitest/config";

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
          include: ["scripts/engendrer-apercus-emails.ts"],
        },
      },
    ],
  },
});
