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
linéaire.

Contenu attendu d'une pull request :

- Titre reprenant le format des messages de commit
- Ce que la PR fait, en deux ou trois phrases
- Le ticket Jira concerné
- Ce qui a été vérifié, avec la sortie des commandes plutôt qu'une affirmation
- Captures avant et après si l'interface change

Ne pas fusionner tant que les contrôles automatiques ne sont pas au vert.

## Contrôles avant fusion

À chaque pull request, la chaîne d'intégration exécute :

1. Installation des dépendances avec verrouillage
2. Analyse statique
3. Vérification des types
4. Tests unitaires
5. Tests d'intégration sur base éphémère
6. Validation du schéma et contrôle des migrations
7. Construction de l'application
8. Scénarios critiques de bout en bout selon la stratégie retenue

Le détail de la chaîne est mis en place en phase 1.

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
