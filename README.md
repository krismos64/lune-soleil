# Lune & Soleil

Boutique e-commerce sur mesure pour la vente de bijoux artisanaux faits main,
principalement des boucles d'oreilles, créés à la main en Béarn.

Le projet couvre le cycle commercial complet : catalogue, panier, paiement,
commande, stock multicanal, facturation, préparation, expédition, suivi, service
client. Le back-office est utilisable depuis un smartphone, y compris en
situation de marché.

## État

Projet en cours de développement, phase de cadrage. La boutique n'est pas
ouverte commercialement.

## Stack

| Domaine | Choix |
|---|---|
| Framework | Next.js 16, React 19, TypeScript strict |
| Interface | Tailwind CSS, primitives shadcn/ui et Radix |
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

### État actuel, avant la phase 1

Le projet n'est pas encore initialisé : ni `package.json`, ni `docker-compose.yml`.
Les commandes ci-dessous **ne fonctionneront qu'après LS-2**, la phase 1, qui
installe les dépendances et applique la migration.

```bash
npm install
cp .env.example .env    # renseigner les valeurs locales
docker compose up -d db # base PostgreSQL locale
npx prisma migrate dev
npm run dev
```

### Ce qui fonctionne dès maintenant

Quatre scripts de vérification, sans installation :

```bash
./prisma/migrations/manual/verifier-schema.sh  # schéma sur base réelle, exige Docker
./scripts/verifier-regles.sh                   # .claude/rules/ contre le schéma
./scripts/verifier-regles-mutation.sh          # prouve le précédent par mutation
./docs/prototypes/interblocage-panier.sh       # interblocage sur panier, exige Docker
```

Le script de mutation réinjecte six fois un défaut réel et exige que
`verifier-regles.sh` échoue à chaque fois. Un contrôle vert ne prouve rien tant
qu'il n'a pas échoué sur le défaut qu'il prétend attraper.

## Secrets

Aucun secret de production n'entre dans ce dépôt. Le fichier `.env.example` ne
contient que les noms de variables et leurs formats, jamais de valeurs.

## Licence

Aucune licence. Tous droits réservés. Le code est publié pour consultation et ne
peut pas être réutilisé, copié ou distribué sans autorisation écrite.
