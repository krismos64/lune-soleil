# Lune-soleil

Boutique en ligne sur mesure pour des bijoux artisanaux faits main en Béarn,
principalement des boucles d'oreilles, vendus en ligne et sur les marchés
locaux.

[![Contrôles](https://github.com/krismos64/lune-soleil/actions/workflows/controles.yml/badge.svg)](https://github.com/krismos64/lune-soleil/actions/workflows/controles.yml)

- Site en production : [lune-soleil.fr](https://lune-soleil.fr)
- État du projet et avancement : [`docs/ETAT.md`](docs/ETAT.md)

Le projet couvre le cycle commercial complet : catalogue, panier, paiement,
commande, stock multicanal, facturation, préparation, expédition, suivi, service
client. Le back-office est utilisable depuis un smartphone, y compris en
situation de marché.

## Fonctionnalités

- **Catalogue** de pièces uniques et de déclinaisons, photographies traitées à
  l'envoi (métadonnées de localisation retirées, formats AVIF, WebP et JPEG)
- **Paiement** par Stripe Checkout : seul un événement signé confirme une
  commande, le retour du navigateur ne prouve rien
- **Stock partagé** entre la vente en ligne et les marchés, avec réservation
  atomique d'une pièce à un exemplaire
- **Factures et avoirs** en PDF, numérotés dans la transaction qui les crée,
  jamais modifiés
- **Expédition** Mondial Relay par Sendcloud : Point Relais, Locker ou
  domicile, étiquette et suivi
- **Espace client** : commandes, factures, carnet d'adresses, avis vérifiés,
  rétractation en ligne
- **Back-office mobile** : catalogue, stocks de marché, commandes,
  remboursements, connexion par passkey

## Stack

| Domaine | Choix |
|---|---|
| Framework | Next.js 16, React 19, TypeScript strict |
| Interface | CSS natif, variables de `tokens.css` issues d'ADR-022, primitives Radix |
| Base de données | PostgreSQL 18 |
| ORM | Prisma 7, migrations versionnées |
| Authentification | Better Auth 1.7 |
| Validation | Zod, côté serveur systématiquement |
| Paiement | Stripe Checkout, webhooks signés et idempotents |
| Documents comptables | `@react-pdf/renderer`, police embarquée, volume local, ADR-034 |
| Tests | Vitest, React Testing Library, Playwright, axe-core |
| Supervision | journal JSON en sortie standard, sans service tiers |
| Mesure d'audience | **aucune**, ADR-040, décision réversible |
| Assistant IA | **aucun**, ADR-044 : ni fournisseur externe, ni modèle auto-hébergé |
| Paramètres commerciaux | tarifs et seuils **en base**, ADR-043, réglés depuis `/administration/parametres` sans redéploiement |
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

Les décisions structurantes sont écrites en ADR dans [`docs/adr/`](docs/adr/).

## Le jalon qui compte

Un achat de bout en bout sur une variante en stock à un exemplaire : réservation
atomique, événement de paiement idempotent, commande cohérente, mouvement de
stock unique et facture exacte. Son test de concurrence a été écrit avant le
paiement et tourne en intégration continue. Le détail est dans
[`docs/ETAT.md`](docs/ETAT.md#le-jalon-qui-compte).

## Qualité

- **Tests unitaires et de composants** avec Vitest et React Testing Library
- **Tests d'intégration** sur une base PostgreSQL éphémère, créée pour la suite
- **Tests de bout en bout** avec Playwright à 320, 390, 768 et 1280 px, et un
  audit d'accessibilité axe-core sur les parcours
- **Preuves par mutation** : chaque contrôle doit avoir échoué au moins une fois
  sur le défaut qu'il prétend attraper. La méthode est dans
  [`docs/PREUVES-PAR-MUTATION.md`](docs/PREUVES-PAR-MUTATION.md)
- **Intégration continue** à chaque pull request vers `main`, protégée ; les
  preuves les plus longues tournent au contrôle nocturne
- **Image de production** construite et contrôlée à chaque pull request :
  utilisateur non root, aucun `.env` dans les couches, contrôle de santé sur la
  base
- **`npm audit` à zéro**, sauf exception datée et justifiée

Les compteurs ne s'écrivent pas ici, ils se mesurent :

```bash
npm run test                                   # nombre de tests Vitest
npm run test:e2e                               # nombre de tests Playwright
ls scripts/*mutation*.sh | wc -l               # scripts de preuve par mutation
grep -c '^cas ' scripts/verifier-tests-mutation.sh   # mutations de la suite de tests
```

## Démarrage rapide

Prérequis : Node 22 LTS (22.12 au minimum) ou Node 24, les versions impaires
étant refusées par Prisma 7, et Docker avec Docker Compose.

Avant tout commit sur un clone neuf, activer le garde-fou des secrets. Le dépôt
est public, et rien ne déclenche ce hook automatiquement :

```bash
git config core.hooksPath .githooks   # doit ensuite répondre .githooks
brew install gitleaks                 # ou l'équivalent sur la plateforme
```

Puis :

```bash
nvm use                              # lit .nvmrc
npm ci && npx prisma generate        # le client Prisma n'est pas versionné
cp .env.example .env                 # puis renseigner les valeurs
npm run db:preparer                  # base locale, migrations, contraintes
npm run dev                          # sert le site sur le port 3000
```

Aucun secret de production n'entre dans ce dépôt. Le fichier `.env.example` ne
contient que les noms de variables et leurs formats, jamais de valeurs.

Le détail (bases de développement et de bout en bout, paiement en local avec la
CLI Stripe, médias, emails, tâches planifiées) est dans
[`docs/DEVELOPPEMENT.md`](docs/DEVELOPPEMENT.md).

## Documentation

| Contenu | Emplacement |
|---|---|
| État du projet, phases et comptes | [`docs/ETAT.md`](docs/ETAT.md) |
| Développement local | [`docs/DEVELOPPEMENT.md`](docs/DEVELOPPEMENT.md) |
| Tests et scripts de vérification | [`docs/VERIFICATION.md`](docs/VERIFICATION.md) |
| Preuves par mutation | [`docs/PREUVES-PAR-MUTATION.md`](docs/PREUVES-PAR-MUTATION.md) |
| Intégration continue | [`docs/INTEGRATION-CONTINUE.md`](docs/INTEGRATION-CONTINUE.md) |
| Règles de contribution | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Décisions d'architecture | [`docs/adr/`](docs/adr/) |
| Architecture technique : modèles, parcours, validation, registre | [`docs/architecture/`](docs/architecture/) |
| Exploitation de la production, image comprise | [`docs/deploiement/EXPLOITATION.md`](docs/deploiement/EXPLOITATION.md) |
| Mise en place du serveur | [`docs/deploiement/PREPARATION-SERVEUR.md`](docs/deploiement/PREPARATION-SERVEUR.md) |
| Tables d'aiguillage, par sujet | [`docs/REFERENCES.md`](docs/REFERENCES.md) |
| Journal de bord, une page par session | [`docs/journal/`](docs/journal/) |
| Rapports de recette | [`docs/recettes/`](docs/recettes/) |
| Backlog et statut du travail | Jira, projet LS |

Le cahier des charges fonctionnel et le plan directeur de réalisation ne sont pas
versionnés dans ce dépôt public : ils contiennent l'identité complète et
l'adresse du domicile de l'exploitante.

## Licence

Aucune licence. Tous droits réservés. Le code est publié pour consultation et ne
peut pas être réutilisé, copié ou distribué sans autorisation écrite.
