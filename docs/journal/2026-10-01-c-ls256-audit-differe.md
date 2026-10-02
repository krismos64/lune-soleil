# 1er octobre 2026 : LS-256, un audit rouge ne fait plus sauter le nocturne

Suite de `2026-10-01-b`. En diagnostiquant les preuves par mutation lourdes,
présentées comme un second défaut du nocturne, la cause s'est révélée unique.

## Le diagnostic

Les nocturnes du 28 septembre, vert, et du 29, rouge, portent **le même
commit**, `84d334e`. Dans celui du 1er octobre, run 36834645143, l'étape
« Audit des dependances » échoue en onzième position, et **toutes les étapes
suivantes sans `if: always()` sont sautées** : client Prisma, base, migrations,
construction, navigateur, bout en bout, image. Les preuves lourdes, en
`always()`, ont tourné sur ce décor vide, d'où `ECONNREFUSED 55432` et le
serveur web Playwright qui ne démarre pas.

Trois nuits durant, ni le bout en bout ni l'image n'ont donc tourné, et le
rapport ne nommait que l'audit. `verifier-tests-mutation.sh`, troisième script
en échec, avait échappé au premier relevé.

## La correction

Déplacer l'audit en fin de job **réintroduisait LS-235**, où un plafond
dépassé l'empêchait de tourner. L'audit garde donc sa place, avec
`continue-on-error: true` et `id: audit`. Une étape finale, « Verdict de
l'audit des dependances », en `if: always()`, relit `steps.audit.outcome` et
rend le job rouge.

`verifier-verdict-audit.sh` exige désormais les deux moitiés : sans l'étape de
verdict, une vulnérabilité passerait au vert. Sa preuve,
`verifier-verdict-audit-mutation.sh`, branchée en « 3septies » de
`controles.yml`, rend **7 mutations conformes**, dont un témoin : l'ancienne
forme, sans échec différé, reste légitime.

**Dérive à sa première écriture** : deux mutations visaient
`Verdict de l.audit` sans ancrage et ont frappé le commentaire de l'étape
d'audit, qui cite ce nom. Le RATE accusait une garde qui voyait juste. Les
mutations s'ancrent maintenant sur `- name:`.

## La preuve réelle

Deux branches jetables, supprimées depuis, nocturne déclenché à la main :

| Run | Défaillance provoquée | Résultat |
|---|---|---|
| 36915116200 | `fast-uri` ramené à 3.1.7, vulnérable | toutes les étapes exécutées, bout en bout 2255 réussis, image construite, preuves lourdes toutes vertes, job rouge par l'étape de verdict |
| 36915120210 | `prisma generate` sur un schéma absent | la préparation saute ce qui en dépend, comme avant, verdict d'audit vert, job rouge |

Le veilleur s'est déclenché après chacun et a commenté #498 ; un commentaire
sur l'issue précise qu'il s'agissait d'essais.

**Le premier run vaut aussi pour LS-255** : sur un décor complet, les preuves
lourdes sont toutes vertes, `180 mutations, 180 detectees` compris. Le nocturne
du 2 octobre devrait donc être entièrement vert.

## Mémoire

La fiche « Le premier échec masque les suivants » reçoit cette seconde forme,
à l'échelle du job, plutôt qu'une fiche voisine.

## Prochaine étape

Constater le nocturne du 2 octobre, puis clore LS-255, LS-256 et l'issue #498.
L'archivage de l'index mémoire et la borne « 9z octies » attendent toujours un
arbitrage.

## État des tickets

LS-255 et LS-256 en cours, tout fusionné, il reste à constater le nocturne.
