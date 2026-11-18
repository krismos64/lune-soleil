# 18 novembre 2026 : LS-329, nocturne rouge sur l'audit des dépendances

## Demande

Christophe : « où en sommes-nous ? ». Issue #690 ouverte par le veilleur, nocturne
rouge les 17 et 18 novembre (runs 44060728822 et 44277825307). Accord pour le
corriger. Ticket neuf **LS-329** sous l'epic LS-7, étiquettes `ci` et `securite`.

## Constat

- **17 novembre** : `npm audit`, `next` 16.4.3, GHSA-mfr8-8qww-v76h, modéré,
  divulgation entre `root params` quand une fonction `'use cache'` passe par
  `unstable_cache()`. Plage 16.3.0 à 16.4.4, corrigé en 16.4.5. `src/` n'emploie
  ni l'un ni l'autre.
- **18 novembre** : en plus, GHSA-fc5q-39xc-vjpf sur `picomatch`, ReDoS, 17
  paquets en « high », par `eslint-config-next` (fast-glob, micromatch) et
  `vitest` (tinyglobby, fdir, vite). Plage `<= 4.0.7`, **aucune version
  corrigée**.
- 18 novembre aussi : `verifier-etats-non-nominaux-mutation.sh` rouge **avant
  toute mutation**, `gestion-passkeys-ls295.test.tsx:99`, `toHaveFocus`. C'est
  LS-320, hors de ce ticket.

## Fait

- `next` et `eslint-config-next` en **16.4.6**, le second toujours épinglé.
- picomatch : l'avis est **retiré par GitHub le 18 novembre à 15:38 UTC**
  (`withdrawn_at`), mais `npm audit` le servait encore une heure après.
  Exemption datée dans `scripts/audit-exemptions.json`, jusqu'au 25 novembre,
  à retirer dès que npm ne le signale plus.
- `npm ls picomatch --omit=dev` montre `vitest` sous `better-auth` : c'est un
  pair **optionnel**, et `.next/standalone` ne contient aucun paquet
  `picomatch`. Il contient en revanche `next/dist/compiled/picomatch`, copie
  compilée que `npm audit` ne voit pas, appelée par `match-local-pattern` et
  `match-remote-pattern` de l'optimiseur d'images : l'avis porte sur un motif
  piégé, et ces motifs viennent de `next.config`, pas de la requête.

## Ce qui a dérapé : le filtre d'exemption bloquait tout cycle

L'exemption posée, le **vrai filtre** rejoué sur l'audit local restait rouge :
`NON EXEMPTE vitest` et `NON EXEMPTE @vitest/coverage-v8`, « par une dépendance
non couverte ». Les deux se citent l'un l'autre, et le point fixe de LS-258
laissait tout cycle non couvert, par choix de défaut fermé. Avec un cycle dans
la chaîne, **aucune exemption ne pouvait jamais fonctionner**.

`scripts/filtrer-audit.mjs` décide désormais par **atteignabilité** : un paquet
est couvert quand chaque avis qu'il atteint par `via`, de proche en proche, est
exempté, et qu'il en atteint au moins un. Le défaut fermé tient sur un cycle
sans avis, un paquet sans cause et une dépendance citée mais absente du
rapport.

## Preuves

- Filtre rejoué sur l'audit réel : `Paquets signalés : 17, couverts par une
  exemption : 17`, code 0.
- `verifier-filtre-audit.sh` : 22 cas, trois neufs (cycle exempté, cycle
  atteignant un avis non exempté, dépendance absente). **Contre l'ancien
  filtre**, le cas du cycle exempté rougit.
- `verifier-filtre-audit-mutation.sh` : **13 mutations, 13 conformes**. Les
  cas 5 et 6 visaient le point fixe retiré, réécrits sur le nouveau code ; 10
  (dépendance absente ignorée) et 11 (retour au blocage de tout cycle) ajoutés.
- Types, lint, build au vert ; `npm run test` : 130 fichiers, 2 110 tests.
- Première CI de la PR #691 rouge sur l'étape 9a : aucune page de journal à la
  date d'un commit de code. Cette page la ferme.

## Prochaine étape

Fusion, déploiement et nocturne vert le même jour, voir plus bas. Retirer l'exemption de picomatch dès que `npm audit` ne
signale plus l'avis, et au plus tard le 25 novembre, où elle échoit.

## État des tickets

- LS-329 : terminée, déployée, nocturne vert, issue #690 fermée.
- LS-320 : à faire, test instable vert une fois sur deux mesures du jour.

## Mise en production, même jour

PR #691 fusionnée en rebase, `7b7cbd8`. Image publiée (run 44348444330), puis
déployée par le workflow « Déployer en production », run 44349367400, depuis
`8c3d919`. Aucune migration.

- `/`, `/catalogue`, `/panier`, `/api/sante`, `/administration/connexion` et
  `/sitemap.xml` en 200.
- Conteneur `lune-soleil-app` sur
  `ghcr.io/krismos64/lune-soleil:7b7cbd8cf2f12838d374fcd799eda33fc9abcb5f`,
  `require("next/package.json").version` rend `16.4.6`, aucun paquet
  `picomatch` dans son `node_modules`.
- Cron inchangé : aucune tâche de `TACHES` modifiée.
- Nocturne relancé à la main sur `main`, run 44349626445, pour éprouver l'audit
  sans attendre la nuit.

## Nocturne relancé, premier essai

Run 44349626445 : **« Verdict de l'audit des dependances » vert** sur le
runner, et « Preuves par mutation lourdes » vertes, test des passkeys de LS-320
compris, une fois. Le job est tombé sur « Installer le navigateur de test »,
plafond de 5 minutes : le miroir Ubuntu servait les polices à environ
100 ko/s, incident d'infrastructure. Bout en bout et image sautés. Job relancé
à 18:13 UTC : **conclusion `success`**, bout en bout, image et preuves lourdes
compris. Issue #690 fermée, LS-329 close.

Deux commentaires du filtre, devenus faux par cette story, corrigés en fin de
session : l'en-tête qui disait `audit-exemptions.json` vide, et le cas de
défaut fermé qui citait le point fixe retiré. Preuve rejouée, 13 mutations
sur 13.
