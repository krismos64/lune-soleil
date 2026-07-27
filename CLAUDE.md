# Lune & Soleil

Boutique e-commerce de bijoux artisanaux faits main. Mono-tenant, France
métropolitaine, euro. Vente en ligne cohabitant avec des marchés locaux et Vinted.

## Commandes

```bash
npm run dev              # serveur de développement
npm run build            # build de production
npm run lint             # ESLint
npm run type-check       # tsc --noEmit
npm run test             # Vitest, unitaire et intégration
npm run test:e2e         # Playwright
docker compose up -d db  # PostgreSQL locale
npx prisma migrate dev   # migration en développement
```

## Architecture

Monolithe modulaire. Les gestionnaires de route et les Server Actions sont des
adaptateurs d'entrée, jamais la couche métier.

```
app/ et components/   ->  services/  ->  repositories/  ->  Prisma  ->  PostgreSQL
```

- Composants serveur par défaut. Composant client uniquement pour une interaction réelle.
- `services/` porte les cas d'usage et l'orchestration métier.
- `repositories/` porte l'accès aux données par domaine.
- `integrations/` isole Stripe, email, médias, IA.
- Aucune généralisation prématurée : ce projet n'est pas un produit réutilisable.

## Invariants non négociables

YOU MUST respecter ces règles sur tout le code de ce projet.

1. **Montants** : l'euro est stocké en centimes entiers. Aucun nombre à virgule
   flottante dans un calcul monétaire, jamais.
2. **Autorisation** : un identifiant fourni par une URL, un formulaire ou un
   modèle de langage n'autorise jamais l'accès. L'identité vient de la session ou
   d'un jeton signé, recoupée côté serveur.
3. **Historisation** : une ligne de commande et une facture émise sont immuables.
   Une commande ne dépend jamais du prix ou du nom actuel du catalogue.
4. **Facture** : jamais modifiée ni supprimée. Une correction produit un avoir.
   Le numéro est attribué dans la transaction qui crée le document.
5. **Paiement** : seul un événement serveur signé confirme un paiement. Le retour
   du navigateur ne prouve rien. Tout effet métier est idempotent par identifiant
   d'événement unique en base.
6. **Stock** : la disponibilité web et la quantité physique sont deux notions
   distinctes. Suspendre la vente web ne crée aucun mouvement de stock.
7. **Validation** : toute entrée non fiable est validée côté serveur avec Zod.
8. **Horodatage** : persisté en UTC, converti à l'affichage seulement.
9. **Secrets** : jamais lus, jamais écrits, jamais journalisés. Le dépôt est
   **public**.
10. **Mobile first** : conception à partir de 320 px, puis 390, 768, 1280.

## Le jalon qui compte

Un achat de bout en bout sur une variante en stock à **un exemplaire** :
réservation atomique, événement idempotent, commande cohérente, mouvement de
stock unique, facture exacte.

Le test de concurrence correspondant s'écrit **avant** l'implémentation du
paiement et reste en intégration continue. Ne jamais le contourner ni le
désactiver.

## Interdits

- Modifier le périmètre défini dans le cahier des charges.
- Décider d'une obligation juridique. Les textes de loi se vérifient aux sources.
- Exécuter une migration en production.
- Lire un fichier de secrets.
- Déployer sans autorisation explicite.
- Modifier une commande ou une facture réelle.
- Écrire un tiret cadratin dans un contenu Lune & Soleil.
- Introduire les données du prototype (noms, prix, stocks) comme données réelles.

## Priorisation

Deux axes distincts, à ne pas confondre :

- **Importance** : Must, Should, Could, Won't
- **Jalon** : Go-Live, V1 cible, V1.x, Hors V1

Une exigence Must sur Go-Live ne se repousse jamais. L'assistant IA, les avis
vérifiés, le compte client et les statistiques appartiennent à la V1 cible et ne
bloquent pas l'ouverture.

Aucune date de livraison n'est fixée. Le pilotage se fait par portes de sortie de
phase, pas par calendrier.

## Sources de vérité

Par ordre de priorité en cas de divergence :

1. Loi et réglementation
2. ADR accepté, dans `docs/adr/`
3. Cahier des charges V1.0 (hors dépôt, il contient des données personnelles)
4. Documentation technique du dépôt
5. Confluence, espace Lune-Soleil
6. Jira, projet LS

Toute décision structurante produit un ADR. Toute nouvelle idée entre d'abord
dans Jira et n'intègre le périmètre que par arbitrage explicite.

## Conduite du travail

Tout travail sur ce projet suit le skill `story`, y compris une exploration ou un
prototype sans ticket. Il porte le contrôle avant zone critique et la clôture de
la traçabilité.

YOU MUST clore tout travail significatif sur les quatre canaux, et dire
explicitement ce qui a été mis à jour :

1. **Dépôt** : code, ADR si décision structurante, script si prototype
2. **Journal** `docs/journal/` : fait, dérives, prochaine étape, état des tickets
3. **Mémoire** : toute découverte non dérivable du code
4. **Jira** : état réel de chaque critère, commit, ce qui reste

Un travail non tracé sera refait ou contredit. Un journal qui présente comme « à
faire » une tâche déjà faite est pire qu'un journal absent.

## Vérification avant de considérer une story terminée

Types, lint et tests concernés au vert. Critères d'acceptation vérifiés. Rendu
contrôlé à 320 px si la story touche l'interface. Pour une story critique, s'y
ajoutent un test négatif de sécurité, un test de concurrence ou d'idempotence, et
la simulation d'une panne de fournisseur.

Montrer la preuve (sortie de test, commande et résultat), ne pas affirmer que ça
marche.

## Documentation à jour des bibliothèques

Consulter Context7 avant d'utiliser une API de Next.js 16, React 19, Prisma 7,
Better Auth 1.6 ou Stripe. Ces versions sont récentes et ma connaissance
peut être périmée. Signaler quand Context7 a été utilisé.
