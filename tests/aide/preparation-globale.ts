/**
 * Preparation globale des tests d'integration, LS-68.
 *
 * Cree une base ephemere avant la suite, la detruit apres, et transmet son URL
 * aux fichiers de test par `provide`.
 *
 * CE FICHIER ECHOUE PLUTOT QUE DE LAISSER PASSER. Une base injoignable fait
 * sortir en erreur, jamais ignorer les tests d'integration. Un contrôle qui se
 * desactive tout seul quand son environnement manque n'est pas un contrôle : il
 * afficherait « aucun echec » sur une machine sans Docker, y compris en
 * integration continue, et le jour ou la reservation casserait personne ne le
 * saurait. Lecon deja apprise sur ce depot, controle-acceptation-sans-base.
 */
import "dotenv/config";
import type { TestProject } from "vitest/node";

import {
  creerBaseEphemere,
  supprimerBaseEphemere,
  VARIABLE_URL_TEST,
} from "./base-ephemere";

declare module "vitest" {
  export interface ProvidedContext {
    [VARIABLE_URL_TEST]: string;
  }
}

let urlTest: string | undefined;

export async function setup(project: TestProject): Promise<void> {
  const urlModele = process.env.DATABASE_URL;

  if (!urlModele) {
    throw new Error(
      "DATABASE_URL absente : les tests d'integration ne peuvent pas creer leur base ephemere.\n" +
        "La renseigner dans .env, voir .env.example.",
    );
  }

  try {
    urlTest = await creerBaseEphemere(urlModele);
  } catch (cause) {
    // Le message d'origine est conserve dans `cause` : une erreur de connexion
    // du pilote pg nomme precisement l'hote et le port, information qu'un
    // message reecrit perdrait.
    throw new Error(
      "Impossible de preparer la base ephemere des tests d'integration.\n" +
        "Verifier que le conteneur PostgreSQL est demarre : npm run db:preparer",
      { cause },
    );
  }

  project.provide(VARIABLE_URL_TEST, urlTest);
}

export async function teardown(): Promise<void> {
  if (!urlTest) {
    return;
  }
  await supprimerBaseEphemere(urlTest);
}
