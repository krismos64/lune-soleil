// Correctif de Next.js 16.3.x reporté de la 16.4.0, LS-273. Lancé par
// `postinstall`, donc après chaque `npm ci`, en local, en CI et dans l'image.
//
// LE DÉFAUT, REPRODUIT LE 8 OCTOBRE 2026. Pour optimiser une image locale,
// `fetchInternalImage` simule une requête interne et donne à la RÉPONSE simulée
// la socket du visiteur. Si ce visiteur part pendant la première optimisation
// d'une variante, `send` voit la socket fermée, abandonne la lecture du fichier
// sans jamais terminer la réponse simulée, et la promesse ne se règle plus.
// `ResponseCache` regroupe toutes les requêtes d'une même variante derrière
// elle : la variante reste bloquée pour tout le monde jusqu'au redémarrage.
// Mesuré : 39 ms sans interruption, plus de 15 s après une rafale
// interrompue. Soixante échecs du nocturne du 8 octobre, et le même motif le 6.
//
// LA CORRECTION EST CELLE DE NEXT 16.4.0, ligne pour ligne : la requête simulée
// garde la socket (protocole, adresse distante), la réponse n'en reçoit aucune.
// Arbitrage de Christophe du 8 octobre 2026 : correctif ciblé plutôt qu'une
// montée en 16.4.0, publiée depuis deux jours avec de gros remaniements.
//
// TROIS ISSUES, ET UNE SEULE SILENCIEUSE :
// - le bloc fautif est présent : il est remplacé, et le remplacement relu ;
// - le bloc corrigé est présent, par ce script ou par une version de Next qui
//   le porte : rien à faire, et le script le dit ;
// - ni l'un ni l'autre : forme inconnue, ÉCHEC. Une montée de Next qui change
//   ce code doit être relue, jamais avalée en silence.
//
// À RETIRER, avec la ligne `postinstall`, quand Next 16.4.x sera adopté.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RACINE = join(process.cwd(), "node_modules", "next", "dist");

const CIBLES = [
  {
    fichier: join(RACINE, "server", "image-optimizer.js"),
    remplacements: [
      {
        avant: `        const mocked = (0, _mockrequest.createRequestResponseMocks)({
            url: href,
            method,
            socket: _req.socket,
            maximumResponseBody
        });`,
        apres: `        // LS-273, correctif de Next 16.4.0 : la réponse simulée ne reçoit pas
        // la socket du visiteur, voir scripts/corriger-next-optimiseur-images.mjs.
        const mocked = {
            req: new _mockrequest.MockedRequest({
                url: href,
                method,
                headers: {},
                socket: _req.socket
            }),
            res: new _mockrequest.MockedResponse({
                maximumResponseBody
            })
        };`,
      },
    ],
    corrige: "res: new _mockrequest.MockedResponse({",
  },
  {
    fichier: join(RACINE, "esm", "server", "image-optimizer.js"),
    remplacements: [
      {
        avant: `import { createRequestResponseMocks } from './lib/mock-request';`,
        apres: `import { MockedRequest, MockedResponse } from './lib/mock-request';`,
      },
      {
        avant: `        const mocked = createRequestResponseMocks({
            url: href,
            method,
            socket: _req.socket,
            maximumResponseBody
        });`,
        apres: `        // LS-273, correctif de Next 16.4.0 : la réponse simulée ne reçoit pas
        // la socket du visiteur, voir scripts/corriger-next-optimiseur-images.mjs.
        const mocked = {
            req: new MockedRequest({
                url: href,
                method,
                headers: {},
                socket: _req.socket
            }),
            res: new MockedResponse({
                maximumResponseBody
            })
        };`,
      },
    ],
    corrige: "res: new MockedResponse({",
  },
];

let echecs = 0;

for (const cible of CIBLES) {
  let texte;
  try {
    texte = readFileSync(cible.fichier, "utf8");
  } catch {
    console.error(
      `LS-273 : ${cible.fichier} introuvable, Next est-il installé ?`,
    );
    echecs += 1;
    continue;
  }

  if (texte.includes(cible.corrige)) {
    console.log(`LS-273 : déjà corrigé, ${cible.fichier}`);
    continue;
  }

  const absents = cible.remplacements.filter((r) => !texte.includes(r.avant));
  if (absents.length > 0) {
    console.error(
      `LS-273 : forme inconnue dans ${cible.fichier}, ni fautive ni corrigée. ` +
        "Relire le correctif avant toute montée de Next.",
    );
    echecs += 1;
    continue;
  }

  for (const r of cible.remplacements) {
    texte = texte.replace(r.avant, r.apres);
  }

  writeFileSync(cible.fichier, texte);

  if (!readFileSync(cible.fichier, "utf8").includes(cible.corrige)) {
    console.error(
      `LS-273 : la correction ne s'est pas écrite, ${cible.fichier}`,
    );
    echecs += 1;
    continue;
  }

  console.log(`LS-273 : corrigé, ${cible.fichier}`);
}

process.exit(echecs === 0 ? 0 : 1);
