/**
 * Preparation du projet `composant`, LS-113.
 *
 * `cleanup` APRES CHAQUE TEST, ET CE N'EST PAS UNE PRECAUTION DE STYLE. Testing
 * Library monte dans un conteneur ajoute au `document.body`, et ne le retire
 * pas seule. Sans ce nettoyage, le DOM du test precedent reste en place : une
 * assertion « le message est absent » passerait au vert en trouvant celui
 * d'avant, et une recherche par role trouverait deux fois le meme element,
 * echouant en « strict mode violation » sur un composant parfaitement rendu.
 *
 * LES MATCHERS DE `jest-dom` SONT CHARGES ICI, une seule fois : `toBeVisible`,
 * `toHaveTextContent` et les autres n'existent pas dans Vitest nu.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
