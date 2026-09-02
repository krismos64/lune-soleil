/**
 * Les cles de journal du rattachement ne sont pas masquees a tort. LS-56.
 *
 * POURQUOI CE TEST EXISTE. `masquerContexte` de `lib/journal.ts` compare les
 * noms de cles PAR INCLUSION, ce qui est juste : c'est ce qui lui fait attraper
 * `emailClient` et `adresseLivraison`, les noms reels etant composes.
 *
 * L'effet de bord est qu'une cle anodine peut contenir un fragment interdit.
 * Mesure au premier lancement de LS-56 : `nombre` contient « nom » et
 * `declencheur` contient « cle », donc la ligne « Commandes rattachees a un
 * compte » sortait avec ses DEUX valeurs en `[masque]`. Elle existait sans rien
 * apprendre, et rien ne le signalait : le journal ne leve pas, il masque.
 *
 * CE TEST NE PROTEGE PAS UN SECRET, il protege un DIAGNOSTIC. Il rougit si
 * quelqu'un renomme `total` en `nombre` ou `origine` en `declencheur` par souci
 * de clarte, ce qui est exactement le geste qui reintroduirait le defaut.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VALEUR_MASQUEE, journaliser } from "@/lib/journal";

let sortie: string[];

beforeEach(() => {
  sortie = [];

  // Le module ecrit sur le FLUX, pas via `console` : espionner `console`
  // laisserait passer ce que le module fait reellement. Meme approche que
  // `journal.test.ts`.
  const capturer = (contenu: unknown) => {
    sortie.push(String(contenu));
    return true;
  };

  vi.spyOn(process.stdout, "write").mockImplementation(capturer);
  vi.spyOn(process.stderr, "write").mockImplementation(capturer);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const derniereLigne = () => {
  if (sortie.length === 0) {
    throw new Error("Aucune ligne journalisee");
  }

  return JSON.parse(sortie[sortie.length - 1]!);
};

describe("les cles de journal du rattachement restent lisibles", () => {
  it("laisse passer `total` et `origine`", () => {
    journaliser("info", "Commandes rattachees a un compte", {
      total: 3,
      origine: "VERIFICATION",
    });

    const ligne = derniereLigne();
    expect(ligne.total).toBe(3);
    expect(ligne.origine).toBe("VERIFICATION");
  });

  it("masquerait `nombre` et `declencheur`, le defaut mesure", () => {
    /*
     * L'AUTRE SENS, et c'est lui qui donne sa valeur au test precedent : sans
     * cette assertion, on ne saurait pas que le piege est reel, et le premier
     * test passerait tout aussi bien si le filtre ne masquait jamais rien.
     */
    journaliser("info", "Commandes rattachees a un compte", {
      nombre: 3,
      declencheur: "VERIFICATION",
    });

    const ligne = derniereLigne();
    expect(ligne.nombre).toBe(VALEUR_MASQUEE);
    expect(ligne.declencheur).toBe(VALEUR_MASQUEE);
  });
});
