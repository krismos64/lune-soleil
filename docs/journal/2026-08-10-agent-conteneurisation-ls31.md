# 10 août 2026, soir, LS-31, l'agent de conteneurisation

Deuxième session de la journée, après LS-73. Story hors chaîne, traitée avant
LS-74 pour que l'image Docker soit écrite avec le bon agent plutôt que corrigée
après coup.

## Ce qui est fait

**LS-31 est terminée.** `.claude/agents/ls-conteneurisation.md` existe, deuxième
agent projet après `ls-critical-reviewer`.

Les trois critères sont remplis et vérifiés mécaniquement plutôt que relus :

| Critère | Preuve |
|---|---|
| l'agent ne mentionne ni Redis, ni NextAuth, ni le multi-tenant | cinq occurrences, toutes des interdictions explicites |
| il décrit les quatre conteneurs et le rôle de Nginx sur l'hôte | table de topologie, et la raison, la terminaison TLS qui survit à la recréation des conteneurs |
| la section Agents de `CLAUDE.md` le référence | à budget constant, le fichier reste à 200 lignes, sa limite |

Le fichier porte aussi les sept pièges déjà payés sur ce dépôt, du point de
montage de `postgres:18` au pipe qui masque un code de sortie, et la doctrine de
déploiement du ticket : image taguée par identifiant de commit, sauvegarde
vérifiée avant migration, et le retour arrière qui ne répare pas une migration
destructive.

**Le format du frontmatter vient de la documentation officielle**, pas de
mémoire : `disallowedTools` et `permissionMode` existent, et je ne les emploie
pas. L'agent doit rester sous les garde-fous du projet, le hook `PreToolUse` qui
bloque la lecture des secrets en particulier.

Context7 a servi pour Next.js 16.2.9 et Docker, sur la sortie autonome et sur
`RUN --mount=type=secret`.

## Ce que la relecture a rattrapé

`ls-critical-reviewer` a trouvé quatre points, tous confirmés dans le code avant
correction plutôt que pris au mot.

**Le plus grave : l'agent présentait `output: "standalone"` comme déjà posé dans
`next.config.ts`**, alors qu'il en est absent. Une session LS-74 aurait écrit un
`COPY .next/standalone` que la construction n'aurait pas trouvé. La confusion
était facile, le commentaire d'en-tête du fichier parlant déjà de sortie autonome
pour justifier `outputFileTracingRoot`. C'est le défaut que cet agent est censé
empêcher, commis en l'écrivant.

**`HOSTNAME=0.0.0.0` était déclaré nécessaire avec un mode d'échec inventé.** Le
gabarit engendré par Next 16.2.12 porte `process.env.HOSTNAME || '0.0.0.0'` : le
serveur écoute déjà toutes les interfaces. Le risque n'était pas la variable
inutile, il était diagnostique, une session devant un vrai refus de connexion
aurait vérifié ce point et cherché longtemps ailleurs.

Deux points mineurs : `verifier-schema.sh` vit dans `prisma/sql-manuel/` et non
dans `scripts/`, et l'étape 5 du déploiement disait de revenir à l'image
précédente sans rappeler que cela ne vaut que pour une migration additive.

## Deux contrôles qui ne contrôlaient pas

La story devait produire un fichier. Elle a surtout trouvé deux garde-fous verts
qui ne gardaient rien, les deux par mutation.

**Un agent cité par `CLAUDE.md` pouvait ne pas exister.** Le contrôle des renvois
ne voit que les chemins écrits en entier, `.claude/agents/x.md`, quand la section
Agents cite ses agents par leur nom nu, qui est la forme d'invocation réelle.
Renommer un fichier d'agent laissait `CLAUDE.md` pointer dans le vide. Onzième
contrôle ajouté, ancré sur le préfixe `ls-`, seul motif décidable sans crier sur
`ssh` et `gh`.

**Le contrôle des ADR était satisfait par une mention voisine.** La mutation
« ADR-027 retiré de la table » échouait, à juste titre : le contrôle cherchait
l'identifiant n'importe où dans `REFERENCES.md`, et ADR-027 y est aussi cité en
passant, à propos de la durée de session. Sa ligne d'aiguillage pouvait donc
disparaître en silence. Ancré sur la forme d'une ligne de table. Neuf ADR sur
disque, neuf lignes, zéro faux positif.

Même motif que la mutation satisfaite ailleurs déjà rencontrée ici, sur un
contrôle différent.

## Un compte faux pour la deuxième fois

`README.md` annonçait « sept mutations » quand le script en portait neuf. Le
contrôle des comptes couvre les overrides, les largeurs Playwright et les hooks,
pas celui-ci. Le même compte avait déjà dérivé le 10 août au matin, corrigé à la
main, donc sans rien qui empêche la fois suivante. Il a désormais sa source
mécanique.

**La première version de ce comptage est restée verte devant le compte faux.**
`compte_annonce` cherche « neuf mutations » avec un espace simple, et les
astérisques de `**neuf mutations**` collent au chiffre, ce qui fait échouer la
limite de mot. Le gras est retiré du README et la contrainte inscrite en
commentaire : elle vaut pour tous les comptes lus par ce contrôle.

## La dérive de la session

**Les premières vérifications ont tourné sous Node v23.9.0**, version impaire que
`engines` exclut et que Prisma 7 refuse, le Homebrew du poste ayant pris le pas
sans `nvm use`. `engine-strict` ne bloque que `npm install`, pas `npm run` : rien
ne l'a signalé. Les contrôles ont été rejoués sous 22.23.2, avec le même
résultat, mais la preuve initiale ne valait rien. Voir
[[lune-soleil-node-impair-non-bloque-par-npm-run]].

## Vérification

Sous Node 22.23.2 :

| Contrôle | Résultat |
|---|---|
| `npm run type-check` | vert |
| `npm run lint` | vert |
| `npm run test` | 159 tests, 9 fichiers |
| `verifier-regles.sh` | règles conformes au schéma |
| `verifier-config-claude.sh --strict` | cohérente |
| `verifier-config-claude-mutation.sh` | 9 mutations, 9 détectées |

Le script de mutation passe de huit à **neuf cas**, le neuvième couvrant l'agent
cité sans fichier.

## Traçabilité

Quatre commits sur la branche `chore/LS-31-agent-conteneurisation`. Les SHA
définitifs sont ceux d'après la fusion en rebase, ils sont posés en commentaire
sur le ticket une fois la pull request fusionnée.

## Prochaine étape

**LS-74**, image Docker multi-étapes, désormais outillée. Deux choses à faire en
la commençant : invoquer `ls-conteneurisation`, et ajouter `output: "standalone"`
à `next.config.ts`, qui ne l'a pas.

**Trois stories restent dans LS-2** : LS-72 (tâches planifiées et verrous),
LS-74 et LS-75, cette dernière en dernier par construction.
