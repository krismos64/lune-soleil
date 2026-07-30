# Lune & Soleil

Boutique e-commerce sur mesure pour la vente de bijoux artisanaux faits main,
principalement des boucles d'oreilles, créés à la main en Béarn.

Le projet couvre le cycle commercial complet : catalogue, panier, paiement,
commande, stock multicanal, facturation, préparation, expédition, suivi, service
client. Le back-office est utilisable depuis un smartphone, y compris en
situation de marché.

## État

Projet en cours de développement, phase 1, socle technique. La phase 0 de
cadrage est close, ses derniers livrables se poursuivant en parallèle. La
boutique n'est pas ouverte commercialement.

## Stack

| Domaine | Choix |
|---|---|
| Framework | Next.js 16, React 19, TypeScript strict |
| Interface | CSS natif, variables de `tokens.css` issues d'ADR-022, primitives Radix |
| Base de données | PostgreSQL 18 |
| ORM | Prisma 7, migrations versionnées |
| Authentification | Better Auth 1.6 |
| Validation | Zod, côté serveur systématiquement |
| Paiement | Stripe Checkout, webhooks signés et idempotents |
| Tests | Vitest, React Testing Library, Playwright, axe-core |
| Supervision | Sentry |
| Mesure d'audience | Umami auto-hébergé |
| Hébergement | VPS OVHcloud, Docker Compose, Nginx |
| Intégration continue | GitHub Actions, image taguée par SHA, GHCR |

## Architecture

Monolithe modulaire. Les gestionnaires de route et les actions serveur sont des
adaptateurs d'entrée, jamais la couche métier.

```
Présentation
  -> Services applicatifs et cas d'usage
    -> Dépôts de données par domaine
      -> ORM
        -> PostgreSQL
```

Invariants non négociables :

- Aucune logique métier critique dans les composants d'interface ou les actions serveur
- Validation serveur systématique de toute entrée non fiable
- Aucun nombre à virgule flottante pour un calcul monétaire, l'euro est stocké en centimes entiers
- Les données historiques de commande et de facture sont immuables
- Un identifiant ne suffit jamais à autoriser une action, l'identité provient de la session
- Les événements de paiement sont signés et idempotents
- Conception mobile en premier, à partir de 320 pixels

## Le jalon qui compte

Le premier jalon technique majeur n'est pas le nombre de pages livrées. C'est la
réussite d'un achat de bout en bout sur une variante en stock à un exemplaire,
avec réservation atomique, événement de paiement idempotent, commande cohérente,
mouvement de stock unique et document de facturation exact.

Le test de concurrence correspondant est écrit avant l'implémentation du
paiement et conservé en intégration continue.

## Documentation

| Contenu | Emplacement |
|---|---|
| Décisions d'architecture | `docs/adr/` |
| Architecture technique | `docs/architecture/` |
| Journal de bord | `docs/journal/` |
| Rapports de recette | `docs/recettes/` |
| Guides de déploiement et d'exploitation | `docs/` |
| Backlog et statut du travail | Jira, projet LS |
| Vision et documentation collaborative | Confluence, espace Lune-Soleil |

Le cahier des charges fonctionnel et le plan directeur de réalisation ne sont pas
versionnés dans ce dépôt public : ils contiennent l'identité complète et
l'adresse du domicile de l'exploitante.

## Développement

Prérequis : **Node 22 LTS, version 22.12 au minimum**, ou Node 24. Docker et
Docker Compose.

Les versions impaires sont exclues, Prisma 7 les refuse. Node 23 satisfait un
« Node 22 ou plus » et casse à l'installation, le cas s'est produit.

La version est fixée dans `.nvmrc` et dans `engines` du `package.json`, avec un
intervalle qui exclut explicitement les versions impaires. `engine-strict=true`
dans `.npmrc` rend cette contrainte **bloquante** : sans lui, `engines` n'émet
qu'un avertissement et l'installation se poursuit, pour casser plus tard sur
Prisma, loin de sa cause.

```bash
nvm use            # lit .nvmrc
npm ci             # installation reproductible depuis le verrou
npm run dev        # sert la page d'attente sur le port 3000
```

Contrôles disponibles dès maintenant :

```bash
npm run type-check # tsc --noEmit, mode strict
npm run lint       # ESLint 9
npm run build      # construction de production
npm run format     # Prettier, code seulement, pas la documentation
```

`npm audit` doit rester à **zéro vulnérabilité**. Trois overrides y contribuent,
documentés dans `package.json` avec la condition de leur retrait.

### Ce qui n'existe pas encore

La base de données locale, la migration Prisma, les tests et l'intégration
continue arrivent avec les stories suivantes de la phase 1, LS-66 à LS-69. Les
commandes ci-dessous **ne fonctionneront qu'à ce moment** :

```bash
cp .env.example .env    # renseigner les valeurs locales
docker compose up -d db # base PostgreSQL locale
npx prisma migrate dev
npm run test
```

### Ce qui fonctionne dès maintenant

Sept scripts de vérification, sans installation :

```bash
./prisma/migrations/manual/verifier-schema.sh    # schéma sur base réelle, exige Docker
./scripts/verifier-regles.sh                     # .claude/rules/ contre le schéma
./scripts/verifier-regles-mutation.sh            # prouve le précédent par mutation
./scripts/verifier-config-claude.sh              # cohérence de la config Claude Code
./scripts/verifier-config-claude-mutation.sh     # prouve le précédent par mutation
./scripts/verifier-migration-mutation.sh         # garde-fous de migration, sans base
./docs/prototypes/interblocage-panier.sh         # interblocage sur panier, exige Docker
```

Le script de mutation réinjecte huit fois un défaut réel et exige que
`verifier-regles.sh` échoue à chaque fois. Un contrôle vert ne prouve rien tant
qu'il n'a pas échoué sur le défaut qu'il prétend attraper.

`verifier-config-claude.sh` contrôle ce qui dérive sans casser aucun test : un ADR
absent de la table d'aiguillage de `docs/REFERENCES.md`, un `CLAUDE.md` au-delà de
200 lignes, un renvoi vers un fichier inexistant, une fiche mémoire hors index, un
journal manquant alors que du code a été commité. Un hook `Stop` le lance en fin de
session, et `--strict` le rend bloquant pour l'intégration continue de LS-69.

Il a été prouvé par sept mutations, une par contrôle, toutes détectées.

`verifier-migration-mutation.sh` prouve les garde-fous de
`scripts/migrate-production.sh` sur dix cas, sans base réelle : `psql`, `pg_dump`
et `npx` sont remplacés par des doublures. Cinq familles d'instructions
destructives doivent bloquer, une migration additive doit passer, et une
détection qui ne peut pas conclure doit bloquer plutôt que supposer. Lancé contre
la version d'avant LS-42, il échoue sur sept de ces dix cas.

## Secrets

Aucun secret de production n'entre dans ce dépôt. Le fichier `.env.example` ne
contient que les noms de variables et leurs formats, jamais de valeurs.

## Licence

Aucune licence. Tous droits réservés. Le code est publié pour consultation et ne
peut pas être réutilisé, copié ou distribué sans autorisation écrite.
