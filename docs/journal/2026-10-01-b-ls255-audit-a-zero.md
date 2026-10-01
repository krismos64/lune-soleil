# 1er octobre 2026 : LS-255, `npm audit` revient à zéro

Suite de `2026-10-01-a`. En faisant le point de début de session, le nocturne
s'est révélé **rouge trois nuits de suite**, les 29 et 30 septembre puis le
1er octobre, issue #498. Le journal précédent n'en disait rien : il ne relevait
que la PR du jour. Christophe a validé de traiter l'audit en premier.

## Le défaut

L'étape « Audit des dépendances » relevait cinq vulnérabilités, dont une
**critique dans Next.js** : exécution de code dans `next/og` `ImageResponse`,
GHSA-vcvr-r3jv-pc5j, plage 16.2.0 à 16.3.5. `next/og` n'est importé nulle part
dans `src/`, donc rien d'atteignable par le code actuel, mais l'image en
production embarquait la 16.3.4.

## Ce qui a été fait

| Paquet | Avant | Après | Chemin |
|---|---|---|---|
| `next` | 16.3.4 | 16.3.8 | direct, corrigé dès 16.3.6 |
| `nodemailer` | 9.1.1 | 10.0.13 | direct, corrigé dès 10.0.2 |
| `eslint-config-next` | 16.2.12 | 16.3.8 | épinglé, comme avant |
| `undici` | 8.9.0 | 8.11.2 | via `jsdom`, dans sa plage `^8.9.0` |
| `brace-expansion` | 5.0.9 | 5.0.12 | override relevé |
| `fast-uri` | 3.1.7 | 3.1.8 | override relevé |

**nodemailer 10 est une majeure.** Le changelog ne porte qu'un changement
incompatible, Node 20 minimum, et le projet tourne en 22. Les tests de
`smtp.ts` injectent un faux transport et n'exercent donc pas nodemailer : un
message a été composé à la main par nodemailer 10.0.13 avec les options exactes
de `creerEnvoyeurSmtp`. Le résultat : `multipart/alternative`, texte et HTML en
`quoted-printable` UTF-8, logo en `Content-Disposition: inline` avec son
`Content-ID`, objet encodé en `=?UTF-8?Q?`.

**eslint-config-next 16.3 ajoute une règle**,
`no-location-assign-relative-destination`, qui a levé huit avertissements. Tous
suivent un changement d'identité : connexion, déconnexion, réauthentification,
suppression de compte. Le rechargement complet y est voulu, `router.push`
laissant dans le cache du routeur client des écrans rendus sous l'ancienne
session. La règle est coupée sur ces sept fichiers seulement, dans
`eslint.config.mjs`, avec le motif.

## Vérification

- `npm audit` : `found 0 vulnerabilities`
- `npm run type-check` : vert
- `npm run lint` : vert, zéro avertissement
- `npm run test` : 107 fichiers, 1738 tests, tous verts
- `npm run build` : vert
- `npm run test:e2e` : 2255 réussis, 70 ignorés, zéro échec, comptes identiques au dernier nocturne vert du 28 septembre
- `./scripts/verifier-regles.sh` : règles conformes au schéma

## Ce qui reste

- **Déployer**, par le workflow « Déployer en production », une fois
  `publier-image.yml` terminé : tant que ce n'est pas fait, la production sert
  encore Next 16.3.4.
- **Les preuves par mutation lourdes** échouent sur les mêmes nuits, cause
  distincte : le serveur web de Playwright ne démarre pas dans
  `verifier-etats-non-nominaux-mutation.sh`, et
  `verifier-reintegration-stock-mutation.sh` trouve la suite rouge avant
  mutation. Non diagnostiqué, l'issue #498 reste donc ouverte.
- La PR #501, `verifier-jira.sh`, verte et non fusionnée.

## Prochaine étape

Déployer LS-255, puis diagnostiquer les deux preuves par mutation du nocturne.
L'archivage de l'index mémoire et la borne « 9z octies » attendent toujours un
arbitrage.

## État des tickets

LS-255 en cours : code fusionné attendu, déploiement et nocturne vert restent.
