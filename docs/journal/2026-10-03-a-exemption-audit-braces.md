# 3 octobre 2026 : LS-255 et LS-256 closes, LS-258 exempte l'avis braces

Suite de `2026-10-02-a`.

## Ce qui a été fait

**Le nocturne planifié du 2 octobre est vert**, run 36980723684 sur `5970472` :
audit et verdict en `success`, bout en bout `2255 passed`, `180 mutations, 180
detectees`. LS-255 et LS-256 sont closes, commentaire de clôture sur chacune.

**Le nocturne du 3 octobre est rouge**, run 37106403392, sur la seule étape
« Verdict de l'audit des dependances ». C'est le premier cas réel du défaut
visé par LS-256, et la correction a tenu : base, construction, bout en bout et
preuves lourdes ont toutes tourné.

La cause est un avis publié dans la nuit, **GHSA-vfj7-8cjw-p6xm**, un déni de
service sur `braces`. Il couvre toutes les versions, sans correctif publié, et
n'atteint le dépôt que par la chaîne de lint : `eslint-config-next` vers
`@next/eslint-plugin-next`, puis `fast-glob`, `micromatch` et `braces`.
`npm audit fix --force` proposait de revenir à `eslint-config-next` 14.2,
écarté.

**L'image de production ne contient pas cette chaîne**, mesuré sur
`ghcr.io/krismos64/lune-soleil:latest` du 2 octobre, en amd64. La même
recherche trouve `next` et `next/dist/compiled/zod`, donc l'absence prouve
quelque chose. Next embarque `picomatch`, que l'avis ne vise pas.

## LS-258, l'exemption datée

Arbitrage de Christophe : exempter cet avis par son identifiant, avec une date
limite courte, plutôt qu'un `--omit=dev` qui masquerait les prochains avis.

- `scripts/audit-exemptions.json` porte l'exemption jusqu'au **17 octobre 2026**.
- `scripts/filtrer-audit.mjs` ne laisse passer l'audit que si chaque paquet
  signalé remonte, de proche en proche, à un avis exempté par URL et paquet,
  non échu, d'une durée bornée à 31 jours. Toute entrée illisible bloque.
- Le nocturne l'appelle après la reconnaissance de panne de LS-176, et
  annote l'exemption en avertissement chaque nuit.
- `verifier-filtre-audit.sh` (« 3octies ») joue le vrai filtre sur 17
  rapports fabriqués sur la forme réelle, et sa preuve
  `verifier-filtre-audit-mutation.sh` (« 3nonies ») détecte 11 mutations
  sur 11.

## Ce qui a dérapé

- **La preuve voisine a effacé mon travail.** `verifier-verdict-audit-mutation.sh`
  restaure par `git checkout`, et a annulé la modification non commitée de
  `nocturne.yml`. Le contrôle neuf l'a vu aussitôt. Commité depuis avant
  chaque preuve, comme le skill `story` le demande déjà.
- **Premier jet du contrôle : 2 cas comptés sur 19.** `rapport | attendre`
  exécutait `attendre` dans un sous-shell, dont les compteurs se perdaient.
  Corrigé par `< <(...)`, et un garde confronte désormais le compte au nombre
  d'appels écrits.
- **Une mutation passait pour la mauvaise raison.** `every` remplacé par
  `some` faisait planter le filtre en code 1, le code d'un refus. Une
  exception sort maintenant en 3, et les cas de refus vérifient la raison
  imprimée, plus seulement le code.

## Ce qui reste

- Fusionné le 3 octobre, PR #506. Le nocturne du 4 est vert et a permis
  de fermer l'issue #498, voir `2026-10-04-a`.
- **Au 17 octobre 2026**, ou dès qu'une version corrigée de `braces` sort :
  mettre à jour et retirer l'exemption. Sinon le nocturne repasse au rouge
  de lui-même, en nommant l'exemption échue.

## Prochaine étape

Constater le nocturne du 4 octobre et fermer l'issue #498. L'archivage de
l'index mémoire et la borne « 9z octies » attendent toujours un arbitrage.

## État des tickets

LS-255 et LS-256 closes. LS-258 en cours, jusqu'au nocturne vert, puis
jusqu'au retrait de l'exemption.
