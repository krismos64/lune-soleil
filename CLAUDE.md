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
9. **Secrets** : jamais journalisés, jamais commités. Le dépôt est **public**.
   L'écriture dans un `.env` est autorisée, la lecture de ses valeurs non.
10. **Mobile first** : conception à partir de 320 px, puis 390, 768, 1280.

## Le jalon qui compte

Un achat de bout en bout sur une variante en stock à **un exemplaire** :
réservation atomique, événement idempotent, commande cohérente, mouvement de
stock unique, facture exacte.

Le test de concurrence correspondant s'écrit **avant** l'implémentation du
paiement et reste en intégration continue. Ne jamais le contourner ni le
désactiver.

## Rédaction française

YOU MUST écrire un français orthographiquement correct partout, **tous les
accents présents**, y compris dans les commentaires et titres Jira : l'API
accepte l'UTF-8. Jamais « decision » ni « verifie » sans accent.

Aucun tiret cadratin ni demi-cadratin (— ou –), marqueur de texte généré.

Exception : les identifiants techniques restent en ASCII, branches, fichiers,
variables, références produit.

## Interdits

- Modifier le périmètre défini dans le cahier des charges.
- Décider d'une obligation juridique. Les textes de loi se vérifient aux sources.
- Lire la valeur d'un secret dans un `.env`, une clé ou un certificat.
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

## Autonomie et accès

Décidé avec Christophe le 27 juillet 2026.

**Travailler sans demander de validation à chaque commande.** Enchaîner les
outils librement à l'intérieur d'une étape. En revanche, faire un point à la fin
de chaque étape significative, et proposer la suite plutôt que de l'enchaîner
d'office.

**Secrets** : l'écriture dans un `.env` est autorisée, en local comme en
production. Ajouter une variable, en modifier une, générer un secret avec
`openssl`. La lecture des valeurs reste bloquée : une valeur lue entrerait dans
l'historique de session et pourrait ressortir dans une sortie. Pour
diagnostiquer, lister les noms de variables sans leur contenu.

Les clés privées et certificats restent bloqués en lecture comme en écriture :
une clé se génère, elle ne s'édite pas.

**Accès opérationnels** : utiliser `ssh`, `docker`, `stripe`, `gh`, `psql` avec
les accès déjà configurés, sans jamais lire les identifiants sous-jacents.

**Déploiement et migrations de production** : autonomes, via
`./scripts/migrate-production.sh`, qui porte deux garde-fous automatiques.

1. Sauvegarde vérifiée avant toute migration : le dump doit exister, ne pas être
   vide et être lisible par `pg_restore`. Sinon la migration ne part pas.
2. Migration destructive détectée, arrêt. `DROP`, `TRUNCATE`, `DELETE FROM` et
   les renommages exigent `--confirm-destructive`, donc un accord explicite. Les
   migrations additives passent seules.

Ne jamais contourner ce script ni appeler `prisma migrate deploy` directement en
production. Un déploiement de code raté se répare en redéployant l'image
précédente ; une migration destructive ne se répare pas par un retour arrière.

## Agents

Utiliser `ls-critical-reviewer` pour relire les zones à risque.

**Ne pas invoquer les agents globaux `docker-devops`, `security-auditor` ni
`nextjs-architect` sur ce projet.** Ils sont calibrés sur une autre stack :
NextAuth v5, PostgreSQL 16, Redis 7, architecture multi-tenant. Ici c'est Better
Auth 1.6, PostgreSQL 18, **aucun Redis**, mono-tenant.

`docker-devops` est le plus risqué : il traite Redis comme un service requis en
intégration continue. Or la section 5.3 du cahier des charges écarte
explicitement Redis, faute de besoin démontré.

Quand la conteneurisation arrivera, phase 1 pour le local et la CI, phase 6 pour
le VPS, créer un agent projet dédié dans `.claude/agents/`, calibré sur la
topologie réelle : quatre conteneurs, Nginx sur l'hôte, image taguée par SHA.

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
