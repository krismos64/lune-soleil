# 14 septembre 2026, les preuves qui dormaient, et ce qu'elles cachaient

Troisième session du jour. LS-230 était né d'un constat de la précédente : une
preuve par mutation avait cessé de muter sans que rien ne le signale.

Le compte a montré que le cas n'était pas isolé. Il a montré bien pire.

## Six preuves cassées sur vingt-huit dormantes

Le dépôt portait **43 preuves par mutation**, la CI en rejouait **15**. Sur les
28 qui ne tournaient nulle part, **six étaient cassées**, et chacune autrement :

| Preuve | Ce qui l'avait cassée |
|---|---|
| `chargement-administration` | mutait des `loading.tsx` retirés par C32 |
| `ponctuation-chargement` | mêmes fichiers disparus, 5 cas sur 6 morts |
| `navigation-administration` | élargissait un ancrage sur une liste vide depuis LS-98 |
| `regles` | 4 cas aveugles |
| `registre-traitements` | 1 cas aveugle |
| `tests` | refusait de conclure, la suite d'intégration étant rouge |

## Cinq trous réels, invisibles tant que ces preuves dormaient

Les réparer a révélé ce qu'elles auraient dû garder :

- un composant de chargement qui **perd son annonce** devenait muet sans alerte
- le troisième sens de `chargement-administration` **ne s'exécutait plus** depuis
  C32, sa boucle parcourant des fichiers disparus
- le sens de couverture de `verifier-regles` **ne pouvait plus rougir** : le
  nettoyage du glob transformait `"src/**/*.css"` en `src`, qui couvrait alors
  tous les dossiers comme parent. **`src/instrumentation.ts` n'était couvert par
  aucune règle**, et rien ne pouvait le voir
- `registre-traitements` laissait **une table sortir du registre** si un autre
  traitement la citait comme consultée, sur un document opposable article 30
- `ponctuation-chargement` désignait une violation de C35 réelle

## Ce que je n'avais pas vu venir

**Quatre mutations traînaient dans le dépôt, deux déjà commitées.**

```
src/lib/auth.ts                  input: false retire, regle E11
src/services/autorisation.ts     le test de role retire
src/services/journal-connexion.ts  lt inverse en gt
src/repositories/stock.ts        vente_web_activee retire, invariant 6
```

La deuxième aurait ouvert l'administration à tout client connecté. La quatrième
aurait laissé réservable une variante retirée de la vente web.

Plus deux dans les documents d'architecture, dont une décrivant l'index E1 comme
filtré sur `role = 'CLIENT'` quand il filtre sur `'ADMINISTRATRICE'`.

**J'en ai commité deux moi-même**, en ne relisant pas un diff de cinquante
fichiers. Le garde-fou que cette session écrit ne protège pas rétroactivement.

## La cause, et elle tient en une phrase

**`trap ... INT TERM` ne fait pas quitter bash.** Il exécute le gestionnaire,
puis **reprend le script où il en était**.

Une preuve interrompue restaurait donc ses fichiers, puis mutait le cas suivant,
et le suivant, jusqu'à mourir sur une mutation en cours. Le fichier était sain
pendant tout le nettoyage, et muté après.

Reproduit sur un cas minimal de douze lignes, puis corrigé sur les 44 scripts :
`EXIT` garde le nettoyage normal, `INT TERM` restaure **puis sort**.

## Le diagnostic m'a coûté cher, et voici pourquoi

J'ai tourné longtemps avant de trouver, et trois fausses pistes expliquent le
détour :

**Un processus de mesure lancé en arrière-plan tournait depuis des heures** et
remutait les fichiers en boucle. Mes « défauts reproductibles » étaient parfois
son travail. Vérifier `pgrep` avant de conclure aurait économisé une heure.

**Un `\x27` non interprété** me faisait chercher une chaîne littérale contenant
ces caractères. Toutes mes conclusions sur ce point étaient fausses.

**`pipefail` faisait échouer un contrôle quand il trouvait.** `grep -q` s'arrête
à la première correspondance et tue le `grep` amont sur SIGPIPE : le pipe rend
141, que `pipefail` présente comme un échec. **Le contrôle échouait précisément
quand il réussissait**, ce qui est le pire des comportements.

## Ce qui est livré

**`verifier-couverture-mutations.sh`**, trois sens, prouvé 6 sur 6. Il refuse
qu'une preuve ne tourne nulle part, qu'une dispense soit écrite sans motif, ou
qu'une preuve ne vérifie pas avoir muté.

**`verifier-absence-mutation-residuelle.sh`**, six invariants sensibles, prouvé
6 sur 6. Chaque cas reproduit une mutation qui a réellement traîné.

**`docs/PREUVES-PAR-MUTATION.md`**, la source unique du tri.

**Les 44 preuves tournent** : 22 par PR, 82 s mesurées, et 22 au nocturne dont
six lourdes qui pèsent 1008 s à elles seules.

## Une mesure qui a corrigé une supposition

Un premier tri rangeait `verifier-nginx`, `verifier-environnement` et
`verifier-migration` parmi les preuves à environnement, toutes trois citant
`docker` ou `psql`. **Exécutées, elles passent en moins de 5 s sans rien
lancer** : les mentions vivaient dans leurs commentaires.

Un besoin d'environnement se mesure en exécutant, jamais en lisant.

## Une instabilité préexistante, mesurée et écartée

La suite d'intégration échoue de façon variable. Mesuré sur `main` : **21 échecs**
contre 1 ou 2 sur cette branche, et les mêmes tests passent isolément. La base
éphémère est partagée, motif déjà en fiche. Sans rapport avec ce ticket.

## Prochaine étape

PR #440 ouverte, 27 commits. Aucun code source modifié hors le rattachement
d'`instrumentation.ts` à `securite.md`.

Comptes relevés dans Jira, jamais déduits : à mesurer à la clôture.
