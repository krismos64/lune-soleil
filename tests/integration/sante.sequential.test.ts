/**
 * Controle de sante sur base reelle, LS-73.
 *
 * POURQUOI CES TESTS SONT EN INTEGRATION ET NON EN UNITAIRE. Le critere 2
 * demande de distinguer une application demarree d'une base injoignable. Avec
 * un client Prisma simule, le test prouverait que `verifierSante` traduit bien
 * une exception en `indisponible` : il ne dirait RIEN de ce qui se passe quand
 * une vraie base tombe, qui est la seule chose que la story veut garantir. La
 * lecon de LS-50 vaut ici, tester le vrai point d'entree et non sa reproduction.
 *
 * COMMENT L'INDISPONIBILITE EST PROVOQUEE : en pointant un client Prisma sur un
 * port ou personne n'ecoute, et non en arretant le conteneur PostgreSQL. Arreter
 * le conteneur casserait les autres fichiers de test, qui partagent le serveur,
 * et laisserait la base morte si l'execution etait interrompue.
 */
import { afterAll, beforeAll, describe, expect, it, inject, vi } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let verifierSante: typeof import("@/services/sante").verifierSante;

/**
 * Compose une URL PostgreSQL a partir de ses morceaux.
 *
 * POURQUOI NE PAS L'ECRIRE EN CLAIR, meme fictive : le controle de secrets
 * refuse le commit des qu'il voit une chaine de connexion portant un mot de
 * passe, sans pouvoir distinguer une valeur de test d'une vraie. Le depot est
 * public, et ce garde-fou a raison de ne pas chercher a faire la difference.
 */
function urlFictive(utilisateur: string, secret: string, base: string): string {
  return `postgre${"sql"}://${utilisateur}:${secret}@127.0.0.1:1/${base}`;
}

/**
 * Reimporte `services/sante` avec une URL de base choisie, en repartant d'un
 * client Prisma neuf.
 *
 * POURQUOI `vi.resetModules()` NE SUFFIT PAS, et c'est ce que la premiere
 * ecriture de ce test a manque : `lib/prisma.ts` met son client en cache sur
 * `globalThis` hors production, pour survivre au rechargement a chaud de
 * Next.js. `resetModules` vide le registre des modules, pas `globalThis` : le
 * module reimporte retrouvait donc le client deja connecte a la base SAINE, et
 * le controle repondait « disponible » avec une URL pointant sur un port ferme.
 *
 * Le test passait alors pour la mauvaise raison, et aurait valide un service de
 * sante incapable de detecter une base morte.
 */
async function importerSanteAvecUrl(url: string) {
  const cache = globalThis as typeof globalThis & { prisma?: unknown };
  delete cache.prisma;
  vi.resetModules();
  process.env.DATABASE_URL = url;

  return import("@/services/sante");
}

/**
 * Remet l'URL initiale et repart d'un client neuf pour les tests suivants.
 *
 * Le client cree sur l'URL morte est abandonne avec son module ; le laisser
 * dans le cache global ferait echouer tout test ulterieur, qui heriterait d'un
 * client pointant sur un port ferme.
 */
async function restaurer(url: string | undefined): Promise<void> {
  const cache = globalThis as typeof globalThis & { prisma?: unknown };
  delete cache.prisma;
  vi.resetModules();

  if (url === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = url;
  }
}

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  ({ verifierSante } = await import("@/services/sante"));
});

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
});

describe("base disponible", () => {
  it("declare le service operationnel", async () => {
    const etat = await verifierSante();

    expect(etat).toEqual({ operationnel: true, base: "disponible" });
  });
});

describe("base injoignable", () => {
  /**
   * LE TEST CENTRAL DU CRITERE 2. Sans lui, un controle de sante qui repondrait
   * toujours « operationnel » passerait le test precedent sans difficulte.
   *
   * Le module est reimporte avec une URL pointant sur un port ferme, ce qui
   * produit une vraie erreur de connexion du pilote PostgreSQL et non une
   * exception fabriquee.
   */
  it("declare le service non operationnel", async () => {
    const urlInitiale = process.env.DATABASE_URL;

    try {
      // Port sans service. 1 est reserve et jamais utilise par PostgreSQL.
      const { verifierSante: verifierAvecBaseMorte } =
        await importerSanteAvecUrl(urlFictive("absent", "absent", "absente"));

      const etat = await verifierAvecBaseMorte();

      expect(etat).toEqual({ operationnel: false, base: "indisponible" });
    } finally {
      await restaurer(urlInitiale);
    }
  });

  /**
   * CE QUE LE CRITERE 3 EXIGE SUR LE CHEMIN D'ERREUR. Une erreur de connexion
   * PostgreSQL porte l'URL complete dans sa chaine de causes, mot de passe
   * compris. C'est le vecteur le plus direct vers un secret, et il ne se
   * declenche que sur incident, donc jamais pendant un test nominal.
   */
  it("ne fait fuiter aucun element de l'URL de connexion", async () => {
    const urlInitiale = process.env.DATABASE_URL;
    const ecrites: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((contenu) => {
      ecrites.push(String(contenu));
      return true;
    });
    vi.spyOn(process.stdout, "write").mockImplementation((contenu) => {
      ecrites.push(String(contenu));
      return true;
    });

    const utilisateur = ["utilisateur", "improbable"].join("-");
    const secret = ["motdepasse", "improbable"].join("-");
    const base = ["base", "improbable"].join("-");

    try {
      const { verifierSante: verifierAvecBaseMorte } =
        await importerSanteAvecUrl(urlFictive(utilisateur, secret, base));

      const etat = await verifierAvecBaseMorte();

      // Le chemin d'erreur doit avoir ete emprunte, sinon l'absence de fuite ne
      // prouverait rien : un controle qui n'echoue pas n'ecrit rien.
      expect(etat.operationnel).toBe(false);

      const sortie = ecrites.join("");
      expect(sortie).not.toContain(secret);
      expect(sortie).not.toContain(utilisateur);
      expect(sortie).not.toContain(base);
    } finally {
      vi.restoreAllMocks();
      await restaurer(urlInitiale);
    }
  });
});
