# Conventions de contribution

Projet mené par un développeur unique. Ces conventions servent la lisibilité de
l'historique et la traçabilité vers le backlog Jira, pas une coordination
d'équipe.

## Branches

Format : `type/LS-xx-sujet-court`

```
feat/LS-42-catalogue-filtres
fix/LS-58-double-vente-piece-unique
docs/LS-9-guide-administration
chore/LS-17-conventions-git
test/LS-31-concurrence-reservation
refactor/LS-64-extraction-service-stock
```

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de défaut |
| `docs` | documentation, ADR, journal |
| `chore` | outillage, configuration, dépendances |
| `test` | ajout ou correction de tests |
| `refactor` | réorganisation sans changement de comportement |

Sujet en minuscules, mots séparés par des tirets, sans accent. La clé Jira au
milieu crée le lien avec le ticket et permet de retrouver le contexte des mois
plus tard.

Une branche par story. Les branches longues qui accumulent plusieurs epics sont à
éviter : elles rendent la revue impossible et les conflits inévitables.

## Messages de commit

Convention Conventional Commits, sans portée obligatoire.

```
type: description à l'infinitif

Corps facultatif, expliquant le pourquoi plutôt que le comment.
Lignes limitées à 72 caractères environ.

Refs LS-42
```

Règles :

- Description à l'infinitif, en minuscules, sans point final
- Le corps explique **pourquoi**, le diff montre déjà le **comment**
- `Refs LS-xx` en pied, ou `Closes LS-xx` si le commit termine la story
- Un commit fait une chose. Ne pas mélanger une réorganisation massive et une
  fonctionnalité métier
- **Jamais de `Co-Authored-By`** dans ce projet

Exemple réel :

```
fix: proteger le dernier exemplaire en concurrence

La lecture du stock suivie d'une ecriture laissait deux requetes
simultanees reserver la meme piece unique. Remplace par un UPDATE
conditionnel avec RETURNING, valide par le prototype d'ADR-006.

Refs LS-31
```

## Pull requests

Systématiques, même en travaillant seul. Trois raisons : elles déclenchent les
contrôles automatiques avant fusion, elles laissent une trace lisible de ce qui a
été livré et pourquoi, et elles servent la finalité démonstrateur du projet.

La branche `main` est protégée : pas de force-push, pas de suppression, historique
linéaire, pull request obligatoire et contrôle vert exigé.

**Cette protection n'a aucune exception depuis le 31 juillet 2026.**
`enforce_admins` est actif : un push direct sur `main` est refusé, y compris pour
le propriétaire du dépôt. Si la chaîne devient durablement rouge pour une cause
externe et qu'un correctif ne peut plus entrer, désactiver le réglage
explicitement, corriger, puis le réactiver. Un contournement laisse une trace,
c'est ce qui le distingue d'une erreur.

Contenu attendu d'une pull request :

- Titre reprenant le format des messages de commit
- Ce que la PR fait, en deux ou trois phrases
- Le ticket Jira concerné
- Ce qui a été vérifié, avec la sortie des commandes plutôt qu'une affirmation
- Captures avant et après si l'interface change

Ne pas fusionner tant que les contrôles automatiques ne sont pas au vert.

## Contrôles avant fusion

À chaque pull request vers `main`, la chaîne d'intégration exécute :

1. Installation des dépendances avec verrouillage
2. Analyse statique
3. Vérification des types
4. Tests unitaires
5. Tests d'intégration sur base éphémère
6. Validation du schéma et contrôle des migrations
7. Construction de l'application
8. Scénarios critiques de bout en bout selon la stratégie retenue

Ces huit contrôles tournent automatiquement depuis LS-69,
`.github/workflows/controles.yml`. S'y ajoutent le format, `npm audit`, et les
contrôles textuels qui n'exigent ni base ni conteneur : conformité de
`.claude/rules/` au schéma, cohérence de la configuration Claude Code, registre
des traitements, résolution de l'adresse client, **cohérence des actions
sensibles avec ADR-027**, **aucun test ignoré ni focalisé**, et **accord du
socle Zod avec son document de référence**.

Le dernier est arrivé le 25 août 2026, après qu'une revue de fin de session eut
trouvé `VALIDATION.md` arrêté à sept schémas quand le socle en portait
quatorze. Il vérifie la **présence**, jamais la justesse : ce qu'un document dit
d'un schéma se relit.

L'avant-dernier est arrivé avec LS-116, et il ferme un trou qui rendait tous les
autres contournables : un `it.skip` posé sur le test phare passait la chaîne
avec un code de sortie 0, la sortie annonçant « 6 passed | 1 skipped ». Il
tourne **avant** les suites, un test désactivé les faisant passer au vert sans
rien exercer. Le skip **conditionnel**, `test.skip(condition, raison)` à
l'intérieur d'un test, reste légitime et n'est pas visé.

Ce dernier a été ajouté à la chaîne le 13 août 2026. Il existait depuis LS-81
sans que rien ne le déclenche, ni la chaîne, ni un hook : un contrôle que rien
ne lance ne protège rien.

**La validation du schéma passe en premier**, et sous ses deux modes. Le mode
conception vérifie que le SQL de référence dit ce qu'on croit, le mode
`--base-migree` vérifie ce que Prisma crée réellement : une divergence entre
`schema.prisma` et `schema.sql` n'est visible que par le second.

### Ce qui se lance à la main

La chaîne rejoue tout avant fusion, mais attendre son verdict pour découvrir une
erreur de frappe coûte plusieurs minutes à chaque fois :

```bash
npm ci && npm run type-check && npm run lint && npm run test && npm run build
```

La base locale se construit par `npm run db:preparer` sur un clone neuf, détail
dans `README.md`.

Trois contrôles restent **hors** de la chaîne, parce qu'ils modifient des
fichiers du dépôt en place ou dépendent de l'environnement du poste :

```bash
./scripts/verifier-config-claude.sh        # cohérence de la config Claude Code
./scripts/verifier-migration-mutation.sh   # garde-fous de migration, sans base
./scripts/verifier-tests-mutation.sh       # prouve la suite de tests par mutation
```

Le deuxième se lance après toute modification de `scripts/migrate-production.sh`.

**Le troisième ne se lance en entier qu'aux portes de sortie de phase**,
arbitrage du 14 août 2026. Il casse le code une fois par cas et rejoue la suite à
chaque fois : à soixante-seize cas, dont chacun d'intégration relance une base
éphémère, l'exécution complète dépasse trente-cinq minutes. La lancer à chaque
story revenait à reconfirmer des dizaines de cas déjà verts dont aucun fichier
n'avait bougé.

**Pendant une story, seuls les cas neufs se vérifient**, à la main, ce qui prend
une à deux minutes :

```bash
cp src/chemin/fichier.ts /tmp/f.bak
perl -0pi -e '<la substitution du cas>'  src/chemin/fichier.ts
npx vitest run tests/<fichier concerné> --project <unitaire|integration>
cp /tmp/f.bak src/chemin/fichier.ts
```

Deux choses à vérifier, et le script complet les impose lui aussi : que la
substitution **mord**, sans quoi le cas teste le dépôt sain, et que c'est **le
test attendu** qui rougit et non un voisin.

**Ne jamais lancer ce script en arrière-plan pendant qu'on modifie encore le
code** : sa restauration écrase le travail en cours.

**Une modification de `prisma/schema.prisma` s'accompagne de sa migration**, créée
par `npx prisma migrate dev --name sujet` et commitée avec le schéma. Un schéma
modifié sans migration laisse `npm run db:preparer` échouer sur un clone neuf, et
la chaîne d'intégration le voit désormais.

Ne pas fusionner sur un contrôle rouge, ni sur une exécution encore en cours.

## Secrets

Le dépôt est **public**. Un secret poussé est indexé en quelques minutes et doit
être considéré comme compromis, même après suppression.

Un hook `pre-commit` bloque les secrets détectés. Il combine gitleaks et un
contrôle de repli sur les motifs propres à la stack. Pour l'activer sur un clone
neuf :

```bash
git config core.hooksPath .githooks
brew install gitleaks   # ou l'équivalent sur la plateforme
```

Le contournement `--no-verify` existe mais ne doit servir qu'après avoir vérifié
qu'il s'agit d'un faux positif.

## Migrations de base de données

Générées et revues en développement, appliquées en préproduction puis en
production. Jamais de synchronisation de schéma sans migration.

Une migration destructive se fait en deux temps : ajouter avant de supprimer,
déployer le code compatible, migrer les données, retirer l'ancien schéma dans une
version ultérieure.

Sauvegarde systématique avant toute migration de production.
