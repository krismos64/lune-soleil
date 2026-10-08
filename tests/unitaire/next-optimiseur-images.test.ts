/**
 * L'optimiseur d'images de Next survit au départ d'un visiteur, LS-273.
 *
 * LE CODE ÉPROUVÉ EST CELUI DE NEXT, tel qu'installé et corrigé par
 * `scripts/corriger-next-optimiseur-images.mjs` : la vraie `fetchInternalImage`
 * lit un vrai fichier par le vrai `serveStatic`. Seule la socket du visiteur
 * est fabriquée, et elle est FERMÉE, comme celle d'une navigation qui quitte la
 * page pendant la première optimisation d'une variante.
 *
 * Avant le correctif, la réponse simulée recevait cette socket : `send` la
 * voyait fermée, abandonnait la lecture, et la promesse ne se réglait jamais.
 * Toutes les requêtes suivantes de la même variante l'attendaient, jusqu'au
 * redémarrage du serveur : soixante échecs du nocturne du 8 octobre 2026.
 *
 * UNE COURSE CONTRE UN DÉLAI, ET NON UN DÉLAI DE TEST : un blocage doit se
 * lire « bloqué », pas « timeout » sans cause.
 */
import { Socket } from "node:net";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Modules internes de Next, chargés tels qu'ils tournent en production.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { fetchInternalImage } = require("next/dist/server/image-optimizer");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { serveStatic } = require("next/dist/server/serve-static");

const FICHIER = join(
  process.cwd(),
  "public",
  "habillage",
  "univers-atelier.jpg",
);
const BLOQUE = Symbol("bloqué");

describe("optimiseur d'images de Next, LS-273", () => {
  it("lit l'image même quand la socket du visiteur est déjà fermée", async () => {
    const socket = new Socket();
    socket.destroy();

    const lecture = fetchInternalImage(
      "/habillage/univers-atelier.jpg",
      { method: "GET", socket },
      {},
      50 * 1024 * 1024,
      (req: unknown, res: unknown) => serveStatic(req, res, FICHIER),
    );

    const issue = await Promise.race([
      lecture,
      new Promise((resoudre) => setTimeout(() => resoudre(BLOQUE), 3000)),
    ]);

    expect(issue).not.toBe(BLOQUE);
    expect((issue as { buffer: Buffer }).buffer.byteLength).toBeGreaterThan(
      10_000,
    );
  });
});
