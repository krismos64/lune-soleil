# 9 septembre 2026, f : audit de véracité, et une RCE critique en production

Audit demandé par Christophe sur README, CLAUDE.md, agents, skills, hooks,
journal, mémoire, `docs/` et Jira. La consigne portait sur la documentation.
Elle a trouvé un défaut de sécurité.

## Les six contrôles étaient verts, quinze affirmations étaient fausses

`verifier-config-claude.sh`, `verifier-propagation-docs.sh`,
`verifier-regles.sh`, `verifier-registre-traitements.sh`,
`verifier-tests-non-ignores.sh` et `verifier-jira.sh` sortaient tous en 0.

C'est leur limite connue, et elle mérite d'être redite : ils voient ce qui est
**mécanique**, un chemin mort ou un ADR absent d'une table. Ni un compte périmé,
ni un état devenu faux, ni une consigne qui a survécu à ce qu'elle décrivait.

## Le point de départ était de mesurer plutôt que de lire

`CLAUDE.md` annonçait « `npm audit` reste à **zéro** ». Lancer la commande a
donné **sept vulnérabilités, dont une critique**.

**GHSA-2xp9-vwfh-vxw4, exécution de code à distance non authentifiée** par
l'API d'optimisation d'images de Next.js. Vérifié atteignable plutôt que
supposé :

```
curl -o /dev/null -w '%{http_code}' \
  'https://lune-soleil.fr/_next/image?url=%2Ffavicon.ico&w=64&q=75'  ->  200
```

La seconde RCE de l'avis, GHSA-p293-qw3h-jr36, ne vise que les serveurs
Windows : sans objet, l'image tourne sur `node:slim`. La distinction compte,
elle évite d'annoncer un risque plus large qu'il n'est.

```
next        16.2.12 -> 16.3.4    critical
nodemailer  ^9.0.5  -> ^9.1.1    high, quatre avis
js-yaml     ^4.3.1  -> ^4.3.2    high, override sous le seuil
sharp       ^0.35.3 -> ^0.35.4   high, idem
```

De 7 à 3. Les trois restantes sont `vitest` et ses satellites, en dépendance de
**développement** donc jamais expédiées ; leur montée en 4.1.11 déclenche un bug
de npm 10.9.2, `Cannot read properties of null (edgesOut)`, reproduit avec et
sans verrou, avec et sans `node_modules`.

Build, types, lint, format et **1295 tests sur 1295** passent avec Next 16.3.4.

## Pourquoi personne ne l'avait vu, et c'est le vrai défaut

`npm audit` a quitté les pull requests en LS-177 pour le contrôle nocturne. Or
le nocturne échoue **avant lui** depuis le 8 septembre, sur les scénarios de
bout en bout.

```
2026-09-09 | audit: skipped | echec: Scenarios critiques de bout en bout
2026-09-08 | audit: skipped | echec: Scenarios critiques de bout en bout
2026-09-07 | audit: success
```

**`skipped` n'est pas `failure`.** L'étape n'a plus tourné depuis le
7 septembre, et rien ne l'a dit. Le rouge du nocturne existait bien, mais son
issue automatique parlait des tests de bout en bout : un échec en amont qui
masque un contrôle de sécurité est pire qu'un contrôle absent, personne ne le
cherchant.

Corrigé par `if: always()` sur l'étape d'audit, vérifié par lecture du YAML.

## La cause de l'échec e2e, « config corrigée à moitié »

LS-189 a introduit `DATABASE_URL_E2E`, port 55433, **sans la porter dans aucun
workflow**. `preparer-base-e2e.sh` s'arrêtait sur « absente de `.env` » pour un
fichier que la chaîne ne crée jamais et n'aura jamais, le dépôt étant public.

La variable est posée dans le nocturne, et le script accepte désormais
l'environnement quand `.env` n'existe pas. **La garde ne se relâche pas**,
prouvé par mutation : deux URL au même port sont toujours refusées.

**Ce qui reste, et qui est dit plutôt que masqué** : cela ne suffit pas à faire
tourner les e2e en CI. Le démarrage du conteneur passe par `docker compose`,
qui exige lui aussi un `.env` et échoue sans lui, mesuré. Il faudrait démarrer
55433 par `docker run` comme la chaîne le fait déjà pour 55432. En attendant,
l'échec est connu et **ne masque plus l'audit**.

## Deux consignes qui auraient fait refaire du travail livré

Le plus coûteux des défauts documentaires, parce qu'une session le suit sans le
questionner.

`ls-conteneurisation` annonçait `output: "standalone"` **absent** de
`next.config.ts`, un mois après sa pose en LS-74, et enjoignait de vérifier
avant d'écrire. Le même agent donnait le mapping `127.0.0.1:3002:3002` quand il
vaut `3002:3000` : l'application écoute sur 3000 dans le conteneur, et confondre
les deux rend un 502 chez Nginx.

## Douze comptes périmés, remplacés par la commande qui les mesure

Clés étrangères 32 pour 39, index partiels 6 et 7 pour 8, CHECK 25 pour 33,
enums 13 pour 19, parcours 8 pour 9, traitements 9 pour 11, scripts en CI 42
pour 44, scripts de mutation 35 pour 36, tâches planifiées 4 pour 5, journaux
151 pour 152, stories de phase 0 trois pour deux et de phase 2 sept pour cinq.

**Deux paragraphes qui avertissaient « ne pas recopier ce nombre, le mesurer »
portaient eux-mêmes un nombre périmé.** `MODELE-LOGIQUE.md` en concentre huit, et
son propre texte concluait « Recompter plutôt que relire » après une première
correction : la leçon était juste, la forme retenue la condamnait à se périmer.

D'où le choix de ne pas corriger la valeur mais de la **remplacer par la
commande**, partout où c'était possible.

## Ce qui était juste, et deux corrections évitées

Les audits contestaient deux comptes de plus, 16 et 24 cas de mutation. **Les
scripts les impriment eux-mêmes** : ils étaient justes, et j'ai failli les
« corriger ». Une correction fausse coûte autant qu'une affirmation fausse.

Sont vérifiés justes par ailleurs : les 23 commandes npm, les 88 chemins de
scripts, les 130 chemins de `REFERENCES.md`, les 20 ADR, les 8 hooks sur 5
événements, les 33 motifs `paths` des règles, l'index mémoire dans les deux
sens, la couverture du journal jour par jour, et **EXPLOITATION.md sur toute
procédure vérifiable**, le document le plus critique du dépôt.

## Jira

L'unique écart signalé par `verifier-jira.sh` est un **faux positif** : LS-68
cite LS-50 dans sa section « ce que cette story ne fait pas », ce qui est une
citation de périmètre et non une dépendance. Les deux sont terminées.

Aucun epic complet n'est resté ouvert, le piège de LS-2 ne se reproduit pas :
les 41 stories ouvertes se répartissent sur les 8 epics ouverts, chacun en
portant au moins une. Les 8 tickets En cours le sont légitimement, LS-85
comprise, dont le critère 5 exige une écoute humaine au lecteur d'écran.

## Prochaine étape

**LS-139**, le durcissement, dont cette session vient d'illustrer l'urgence :
son périmètre porte déjà les en-têtes de sécurité, `npm audit` à zéro et la
répétition d'incidents.

Un point à trancher, non ticketé selon la consigne : faire tourner les scénarios
de bout en bout en CI demande de démarrer la base 55433 par `docker run`. Tant
que ce n'est pas fait, le nocturne reste rouge sur un défaut connu.
