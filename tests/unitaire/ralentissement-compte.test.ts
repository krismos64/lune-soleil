/**
 * La règle de délai du ralentissement par compte. LS-83, ADR-021 mesure 2.
 *
 * POURQUOI CES TESTS SONT UNITAIRES ET NON D'INTÉGRATION. `delaiPourEchecs` est
 * une fonction pure : la prouver sur base coûterait un conteneur PostgreSQL
 * pour vérifier une progression arithmétique, et la suite unitaire du projet
 * doit rester lançable sans Docker. Le compteur lui-même, qui est le morceau
 * dépendant de la base, a son test d'intégration séparé.
 *
 * C'EST CE QUI A IMPOSÉ LE DÉCOUPAGE DU MODULE. La règle vivait d'abord dans
 * `services/ralentissement-compte.ts`, et ce test échouait sur « DATABASE_URL
 * absente » avant d'exécuter une seule assertion : importer le service tire
 * Prisma. Même motif que `issue-connexion.ts`, dont l'en-tête le documente.
 *
 * CE QUE CHAQUE TEST DOIT DISTINGUER. La propriété qui compte ici n'est pas
 * « un délai existe » mais ses trois bornes : aucun délai sous le seuil, une
 * croissance au-dessus, et un PLAFOND. Un test qui vérifierait seulement
 * « le délai augmente » resterait vert sur un doublement sans fin, c'est-à-dire
 * sur le blocage complet qu'ADR-027 écarte nommément.
 */
import { describe, expect, it } from "vitest";

import { delaiPourEchecs } from "@/lib/delai-ralentissement";

/**
 * Le plafond attendu, recopié ici DÉLIBÉRÉMENT plutôt qu'importé.
 *
 * C'est l'inverse de la convention de `CONSERVATION_JOURNAL_MOIS`, et pour une
 * raison : là-bas le test vérifie qu'une durée est APPLIQUÉE, ici il verrouille
 * une VALEUR arbitrée. Importer la constante rendrait le test vert quelle que
 * soit sa valeur, y compris si quelqu'un portait le plafond à dix minutes, ce
 * qui transformerait le ralentissement en blocage sans qu'aucune ligne rouge
 * ne le dise.
 */
const PLAFOND_ATTENDU_MS = 8_000;

describe("delaiPourEchecs", () => {
  it("n'impose aucun délai sur les cinq premiers échecs", () => {
    // CINQ ET NON DEUX, voir le commentaire de `ECHECS_SANS_DELAI` : se tromper
    // trois fois de mot de passe est un cas ordinaire, pas une attaque.
    expect(delaiPourEchecs(1)).toBe(0);
    expect(delaiPourEchecs(5)).toBe(0);
  });

  it("commence à ralentir au sixième échec", () => {
    expect(delaiPourEchecs(6)).toBe(500);
  });

  it("double à chaque échec supplémentaire", () => {
    expect(delaiPourEchecs(7)).toBe(1_000);
    expect(delaiPourEchecs(8)).toBe(2_000);
    expect(delaiPourEchecs(9)).toBe(4_000);
  });

  it("plafonne à huit secondes et n'y déroge jamais", () => {
    // LE PLAFOND EST LA PROPRIÉTÉ QUI SÉPARE UN RALENTISSEMENT D'UN BLOCAGE.
    // Le dixième échec l'atteint ; les suivants ne doivent pas le dépasser,
    // y compris très loin, où un doublement non borné donnerait des heures.
    expect(delaiPourEchecs(10)).toBe(PLAFOND_ATTENDU_MS);
    expect(delaiPourEchecs(20)).toBe(PLAFOND_ATTENDU_MS);
    expect(delaiPourEchecs(1_000)).toBe(PLAFOND_ATTENDU_MS);
  });

  it("ne rend jamais de délai négatif ni décroissant", () => {
    /*
     * GARDE CONTRE L'EXPOSANT NÉGATIF. Le calcul passe par
     * `2 ** (echecs - ECHECS_SANS_DELAI - 1)` : sans le retour anticipé à zéro,
     * un compte de 1 donnerait `2 ** -5`, soit un délai fractionnaire, et un
     * compte de 0 un `2 ** -6`. Les deux sont absurdes et aucun des tests
     * ci-dessus ne les verrait si la comparaison de seuil devenait stricte.
     */
    let precedent = -1;

    for (let echecs = 0; echecs <= 30; echecs += 1) {
      const delai = delaiPourEchecs(echecs);

      expect(delai).toBeGreaterThanOrEqual(0);
      expect(delai).toBeGreaterThanOrEqual(precedent);
      expect(Number.isInteger(delai)).toBe(true);
      precedent = delai;
    }
  });
});
