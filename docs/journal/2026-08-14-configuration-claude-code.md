# 14 août 2026, configuration Claude Code, deux hooks et un agent

Deuxième session du 14 août, après ADR-007. Christophe a demandé si la
configuration était bonne et ce qui manquait pour la suite, puis a demandé de
tout mettre en place dans la foulée plutôt que de garder une liste d'intentions.

Aucun code applicatif touché.

## Ce qui est ajouté

**Hook `SessionStart`**, `hook-session-start.sh`. CLAUDE.md demande de lire le
journal le plus récent en début de session : cette lecture coûtait trois à cinq
appels d'outils avant le premier travail utile, et rien ne garantissait qu'elle
ait lieu. Le hook injecte branche, état du dépôt, journal le plus récent et sa
section « Prochaine étape ».

Matcher `startup|clear` volontairement, et non `*` : `resume` et `compact`
réinjecteraient le contexte à chaque reprise, ce qui est du bruit.

**Hook `PreCompact`**, `hook-precompact.sh`. Les sessions ici sont longues, celle
du 13 août a traité cinq stories. À la compaction, ce qui n'est pas écrit
disparaît. Le hook rappelle d'écrire, et mesure ce qui reste non tracé : fichiers
non commités, et commits du jour sans journal correspondant.

**Agent `ls-frontend-revue`.** La phase 2 est surtout de l'interface, LS-100,
LS-104 et LS-105. L'agent est ancré sur les défauts réellement survenus ici : le
seuil de 18,66 px franchi 35 fois, l'enum ajouté qui casse un ternaire sans que
`tsc` le voie, le champ d'état absent de certaines conditions d'accès.

Il porte une limite explicite : **il ne peut pas voir le rendu**. Il ne doit
jamais affirmer qu'un écran s'affiche correctement à 320 px, seulement dire ce
que le code implique et signaler ce qui demande un œil.

## Une correction de documentation faite en chemin

`PreCompact` **ne peut pas injecter de contexte.** Mon plan annonçait le
contraire. La documentation réserve `additionalContext` à `SessionStart`,
`UserPromptSubmit` et `UserPromptExpansion` ; les autres événements écrivent sur
stderr. Le hook a été écrit en conséquence, et le point est noté dans la table
des hooks pour ne pas être réappris.

## Le trou de sécurité trouvé en élargissant les permissions

C'est le résultat le moins attendu de la session, et le plus important.

`settings.local.json` avait accumulé **153 permissions**, non versionnées, une par
commande exactement validée. Sur un clone neuf tout serait à revalider, ce que la
porte de sortie de LS-75 a justement éprouvé. En versionner les familles
récurrentes fait tomber le local à 55, et le versionné passe de 59 à 109.

**Autoriser `Bash(sed:*)` a rendu atteignable un trou qui dormait.** Le hook de
blocage des secrets énumérait les lecteurs, `cat`, `head`, `tail`, `less`,
`source`. Mesuré :

```
cat .env        -> BLOQUE
sed -n 1p .env  -> passe
```

Le trou existait avant, mais restait théorique tant que `sed` demandait une
autorisation à chaque appel. L'élargissement le rendait exploitable par accident.

Le motif couvre désormais `sed`, `awk`, `perl`, `python`, `ruby`, `nl`, `grep`,
`cut`, `tr`, `sort`, `uniq`, `tee`, `xargs`.

**Avec une exception qu'il fallait voir** : le hook recommande lui-même
`sed 's/=.*//' .env` pour lister les noms sans les valeurs. Élargir le motif sans
exception aurait fait refuser la commande que le message de refus conseille. Le
cas figurait déjà dans `verifier-hook-secrets.sh`, il aurait rougi.

## Prouvé par mutation

`verifier-hook-secrets.sh` passe de 24 à 32 cas. La mutation consiste à remettre
l'ancienne liste de lecteurs : **6 cas échouent**, exactement les six ajoutés.
Sans elle, les nouveaux cas auraient pu passer au vert sans rien vérifier.

Le hook `SessionStart` a lui aussi été éprouvé sur ses cas dégradés, ce qui a
trouvé un défaut réel : sur un dépôt sans aucun commit, il affichait une branche
« HEAD » suivie d'une ligne parasite. La condition porte maintenant sur
`rev-parse --verify HEAD` et non sur `--git-dir`, qu'un dépôt vide satisfait.

**Un résidu de mutation est resté sur le disque** pendant cet exercice, une ligne
`# mutation` en fin de fichier, retirée. Motif déjà connu ici, et il s'est
reproduit exactement de la même façon.

## Ce qui a été propagé

- `CLAUDE.md` : trois hooks devenus cinq, deux agents devenus trois. Le fichier
  était à 200 lignes, la limite du contrôle : chaque ajout a dû être compensé
  par une condensation ailleurs, et le détail des hooks est parti dans
  `docs/REFERENCES.md`
- `docs/REFERENCES.md` : deux tables neuves, les cinq hooks et les trois agents.
  Les agents n'y figuraient dans aucune table d'aiguillage, alors qu'une session
  doit savoir lequel appeler et quand
- `scripts/verifier-hook-secrets.sh` : huit cas ajoutés

## Ce qui a été écarté, et pourquoi

**Pas de hook `UserPromptSubmit`** : rien à valider à chaque message, ce serait
du bruit à chaque tour.

**Pas de `statusLine`** : cosmétique, aucun effet sur la qualité.

**Pas de skill de commit ou de pull request** : `story` porte déjà le cycle
complet, un second skill créerait deux sources de vérité sur la même procédure.

## État des tickets

Aucun ticket. Travail de configuration, rattaché à aucune story : il ne modifie
pas le périmètre et ne relève d'aucune phase. LS-100 reste la prochaine story.

## Prochaine étape

LS-100, éditeur de fiche produit. Ce sera la première story à employer
`ls-frontend-revue`, ce qui vaudra épreuve de l'agent autant que de la story.
