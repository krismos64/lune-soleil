# 3 septembre 2026, session B : LS-169, la CI à portée conditionnelle

Christophe : « on perd pas mal de temps avec la plupart des PR ». Le constat
était juste, la cause n'était pas celle qu'on croyait.

## Ce que la mesure a déplacé

L'intuition visait la pull request. Les chiffres visaient ailleurs.

```
PR 202  11 min   PR 203  13 min   PR 204  13 min
PR 205  13 min   PR 206  13 min
```

Répartition d'une exécution, relevée par `gh run view --json jobs` :

| Étape | Durée |
|---|---|
| 8. Scénarios de bout en bout | **678 s** |
| 5. Tests d'intégration | **268 s** |
| Installer le navigateur | 21 s |
| tout le reste | **moins de 120 s** |

**Le coût n'est pas la pull request, c'est la suite.** Les deux étapes lourdes
font 946 s sur 13 minutes, plus de 90 %.

Les PR 205 et 206 ne portaient que du Markdown et ont rejoué sept cents tests sur
trois largeurs, tunnel d'achat et paiements compris.

## Pourquoi supprimer la PR aurait été le mauvais levier

Trois raisons, tirées de la nuit précédente :

- la chaîne a **attrapé un défaut réel** pendant LS-164, 33 tests cassés sur
  quatre fichiers dont trois hors périmètre, invisible en local
- `enforce_admins` vaut `true` : le retirer touche la sécurité du dépôt
- le gain porterait sur l'attente, pas sur les 946 s

## La contrainte qui a commandé la conception

```
$ gh api repos/krismos64/lune-soleil/branches/main/protection
{"contexts": ["Les huit controles de CONTRIBUTING"], "enforce_admins": true, "strict": true}
```

Le job est un contrôle **requis**. Une condition sur le job, ou un `paths:` au
niveau de `on:`, laisserait la pull request en attente d'un résultat qui n'arrive
jamais. La conditionnalité vit donc sur les **étapes**.

## Le filtre liste ce qui est exempté, jamais ce qui est testé

Une liste blanche laisserait passer en silence tout fichier d'une forme non
prévue : un `.ts` dans un dossier oublié ne déclencherait plus rien.

**Le sens du défaut n'est pas symétrique.** Une exemption ratée coûte treize
minutes ; une exemption abusive laisse passer une régression en production.
Défaut fermé, donc : chemin inconnu, liste vide ou erreur d'API font tout
exécuter.

**La liste vient de l'API et non de `git diff`.** Le checkout est à profondeur 1,
`origin/main` n'existe pas localement, et une comparaison silencieusement vide
ferait basculer la décision. `--paginate` est indispensable, l'API rendant trente
fichiers par page.

## La mutation a révélé un cas manquant, pas un code mort

Trois mutations jouées sur le décideur :

| Mutation | Résultat |
|---|---|
| `^docs/` désancré | rouge, `src/lib/docs/outil.ts` basculait |
| entrée vide devient `allegee` | rouge, le défaut fermé s'ouvrait |
| `\.md$` désancré | **verte**, vingt-deux cas inchangés |

La troisième posait une question. En LS-167, la veille, une mutation verte avait
signalé du **code mort**. Ici c'était l'inverse : le motif servait, mais aucun cas
ne le distinguait. `src/lib/md-parser.ts` et `src/app/page.mdx.ts` passaient pour
de la documentation.

**Deux causes opposées produisent le même vert.** Les traiter pareil fait
supprimer du code utile ou garder du code mort. Les deux cas ont été ajoutés,
puis la mutation rejouée jusqu'à la faire rougir.

## Le filtre entre lui-même dans la chaîne

`3quater` exécute `verifier-decision-suite.sh` à chaque pull request, dans les
**deux** portées. Un filtre que rien ne surveille finirait élargi sans bruit,
c'est le motif de `lune-soleil-controle-jamais-declenche`.

## Le saut se voit, il ne se devine pas

GitHub affiche une étape ignorée en gris, ce qui se distingue mal d'une étape
verte dans un journal de trente lignes. Un récapitulatif nomme donc les étapes
non exécutées, sous `always()` : savoir qu'une étape n'a **pas** tourné fait
partie du diagnostic d'un échec.

## Vérifications

La pull request 207 touche `.github/` et `scripts/`, donc elle **devait**
s'exécuter en mode complet. C'est le premier test grandeur nature :

```
Portee retenue : complete
Cas de décision vérifiés : 24
CI : success, 827 s
```

En local, avant de pousser :

```
./scripts/verifier-decision-suite.sh    OK, 24 cas
./scripts/verifier-config-claude.sh     OK
npm run format:check                    All matched files use Prettier code style!
```

## Ce qui reste à observer

**Le gain n'est pas encore mesuré sur une PR documentaire.** Celle qui porte ce
journal est la première : elle ne touche que `docs/` et `README.md`, elle doit
donc rendre `allegee` et sauter 946 s. Si elle ne le fait pas, le filtre est
faux, et c'est ce qu'il faudra regarder en premier.

## Prochaine étape

Inchangée : l'epic LS-36 garde trois stories, toutes bloquées par **LS-33** et le
compte Mondial Relay. Les directions ouvertes restent la conformité, epic LS-6,
et la mise en ligne, epic LS-7.

## État des tickets

LS-169 livrée et close, PR #207 fusionnée. **59 stories ouvertes** une fois
LS-169 close, compte relevé dans Jira et non de mémoire : 60 y figuraient avant
sa clôture.
