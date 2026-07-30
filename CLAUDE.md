# Lune & Soleil

Boutique e-commerce de bijoux artisanaux faits main. Mono-tenant, France
métropolitaine, euro. Vente en ligne cohabitant avec des marchés locaux et Vinted.

## Commandes

`nvm use` d'abord. `engine-strict=true` rend `engines` bloquant, Prisma 7 refusant
les versions impaires de Node.

```bash
npm ci && npm run type-check && npm run lint && npm run build

./prisma/migrations/manual/verifier-schema.sh  # schéma sur base réelle, exige Docker
./scripts/verifier-regles.sh                   # .claude/rules/ contre le schéma
./scripts/verifier-config-claude.sh            # cohérence config, ADR, mémoire, journal
```

Liste complète dans `README.md`, dont les scripts de mutation qui prouvent les deux
derniers. `npm audit` doit rester à **zéro**. **Pas encore disponibles** : base
locale et `prisma migrate dev` en LS-66, `npm run test` en LS-68.

## Architecture

Monolithe modulaire. Les gestionnaires de route et les Server Actions sont des
adaptateurs d'entrée, jamais la couche métier.

```
app/ et components/   ->  services/  ->  repositories/  ->  Prisma  ->  PostgreSQL
```

Composants serveur par défaut, client uniquement pour une interaction réelle.
`services/` porte les cas d'usage, `repositories/` l'accès aux données par
domaine, `integrations/` isole Stripe, email, médias et IA. Chaque dossier de
`src/` porte un fichier de garde qui énonce ce qui a le droit d'y entrer.

Aucune généralisation prématurée : ce projet n'est pas un produit réutilisable.

## Invariants non négociables

YOU MUST respecter ces règles sur tout le code de ce projet. Elles énoncent le
principe ; `.claude/rules/` porte l'application détaillée et se charge selon les
chemins touchés, table dans `docs/REFERENCES.md`. Une règle qui contredit un ADR
ou la loi est fausse, dans cet ordre : signaler la contradiction.

1. **Montants** : euro en centimes entiers. Aucun flottant dans un calcul
   monétaire, jamais.
2. **Autorisation** : un identifiant venant d'une URL, d'un formulaire ou d'un
   modèle de langage n'autorise jamais l'accès. L'identité vient de la session ou
   d'un jeton signé, recoupée côté serveur.
3. **Historisation** : ligne de commande et facture émise sont immuables. Une
   commande ne dépend jamais du prix ou du nom actuel du catalogue.
4. **Facture** : jamais modifiée ni supprimée, une correction produit un avoir. Le
   numéro est attribué dans la transaction qui crée le document.
5. **Paiement** : seul un événement serveur signé confirme un paiement, le retour
   du navigateur ne prouve rien. **L'idempotence est ancrée sur l'effet, pas sur
   l'identifiant d'événement**, qui laisse passer le croisement entre webhook et
   réconciliation. Quatre clés d'unicité, une par effet, voir `payments.md`.
6. **Stock** : disponibilité web et quantité physique sont deux notions
   distinctes. Suspendre la vente web ne crée aucun mouvement de stock.
7. **Validation** : toute entrée non fiable est validée côté serveur avec Zod.
8. **Horodatage** : persisté en UTC, converti à l'affichage seulement.
9. **Secrets** : jamais journalisés, jamais commités, le dépôt est **public**.
10. **Mobile first** : conception à partir de 320 px, puis 390, 768, 1280.

## Le jalon qui compte

Un achat de bout en bout sur une variante en stock à **un exemplaire** :
réservation atomique, événement idempotent, commande cohérente, mouvement de stock
unique, facture exacte. Son test de concurrence s'écrit **avant** le paiement,
reste en intégration continue, et ne se contourne jamais.

## Rédaction française

Ces trois règles valent **partout** : code, commentaires, Jira, documentation,
interface et réponses de conversation.

1. **Tous les accents présents.** L'API Jira accepte l'UTF-8, jamais « decision »
   ni « verifie ». Exception : les identifiants techniques restent en ASCII.
2. **Aucun tiret cadratin ni demi-cadratin** (— ou –), marqueur de texte généré.
3. **Ne pas accorder au féminin par défaut.** Écrire « le client », jamais « la
   cliente » : une part notable des acheteurs est masculine, un homme qui offre un
   bijou. Tourner les phrases sans accord de genre plutôt que d'écrire
   « client(e) ». Exception, « l'administratrice » et « l'exploitante » désignent
   une personne réelle. Formulations neutres dans `frontend-design.md`.

## Interdits

- Modifier le périmètre du cahier des charges. Un arbitrage explicite de
  Christophe le modifie en revanche, et se trace dans un ticket
- Décider d'une obligation juridique. Les textes de loi se vérifient aux sources
- Lire la valeur d'un secret dans un `.env`, une clé ou un certificat
- Modifier une commande ou une facture réelle
- Écrire un tiret cadratin dans un contenu Lune & Soleil
- Introduire les données du prototype (noms, prix, stocks) comme données réelles

## Priorisation

Deux axes à ne pas confondre. **Importance** : Must, Should, Could, Won't.
**Jalon** : Go-Live, V1 cible, V1.x, Hors V1. Un Must sur Go-Live ne se repousse
jamais. Aucune date de livraison n'est fixée, le pilotage se fait par portes de
sortie de phase.

Deux nuances qui se perdent facilement :

- l'assistant IA et l'**interface** de statistiques sont en V1 cible, mais la
  **collecte** des montants est au Go-Live : une donnée non capturée est perdue
- l'espace client, les avis vérifiés et le carnet d'adresses sont dans le
  périmètre d'ouverture depuis le 28 juillet 2026, epic LS-36. Ne pas les traiter
  comme différables

## Sources de vérité

Par ordre de priorité en cas de divergence : **loi**, **ADR accepté**
(`docs/adr/`), cahier des charges V1.0 (hors dépôt, données personnelles),
documentation technique du dépôt, Confluence, Jira.

Toute décision structurante produit un ADR. Toute nouvelle idée entre d'abord
dans Jira et n'intègre le périmètre que par arbitrage explicite.

**`docs/REFERENCES.md`** porte les tables d'aiguillage : documents
d'architecture, ADR acceptés et leur domaine, fichiers de `.claude/rules/` et
leurs chemins de déclenchement. Le lire au début d'une session qui conçoit.

**Une règle numérotée se cite par son identifiant**, S12 ou V14, jamais
paraphrasée seule : c'est ce qui permet aux contrôles textuels de la retrouver.

`docs/journal/` porte l'avancement réel, une page par session. **Lire la plus
récente en début de session** donne l'état du projet plus vite que Jira.

YOU MUST lire les **commentaires** d'un ticket Jira avant de vous appuyer sur sa
description, en demandant explicitement le champ `comment` qui ne revient pas par
défaut : un commentaire récent la rectifie souvent. **Le plus récent l'emporte**, et
l'écart se signale plutôt que de se résoudre en silence.

## Autonomie et accès

**Travailler sans demander de validation à chaque commande**, en enchaînant les
outils librement à l'intérieur d'une étape. Faire un point à la fin de chaque
étape significative, et proposer la suite plutôt que de l'enchaîner d'office.

**Secrets** : l'**écriture** dans un `.env` est autorisée, y compris générer un
secret avec `openssl`. La **lecture des valeurs** est bloquée, une valeur lue
entrerait dans l'historique de session ; pour diagnostiquer, lister les noms de
variables. Clés privées et certificats bloqués dans les deux sens, une clé se
génère et ne s'édite pas.

**Accès opérationnels** : `ssh`, `docker`, `stripe`, `gh`, `psql` avec les accès
configurés, sans jamais lire les identifiants sous-jacents.

**Migrations de production** : autonomes, mais **toujours** via
`./scripts/migrate-production.sh`, jamais `prisma migrate deploy` en direct, ses
garde-fous étant détaillés dans `.claude/rules/database.md`. Cette autonomie
tient à ces garde-fous : si l'un d'eux ne peut pas conclure, le script bloque et
la migration attend un arbitrage humain.

## Agents

Utiliser `ls-critical-reviewer` pour relire les zones à risque. Un agent projet
dédié à la conteneurisation reste à créer, LS-31.

**Ne pas invoquer les agents globaux `docker-devops`, `security-auditor` ni
`nextjs-architect` sur ce projet** : calibrés sur NextAuth v5, PostgreSQL 16,
Redis 7 et du multi-tenant, alors qu'ici c'est Better Auth 1.6, PostgreSQL 18,
**aucun Redis**, mono-tenant. `docker-devops` traite Redis comme requis, que le
cahier des charges écarte.

## Conduite du travail

Tout travail suit le skill `story`, y compris une exploration sans ticket : il
porte le contrôle avant zone critique et la clôture de la traçabilité. Deux hooks
l'appuient, `PreToolUse` bloque la lecture des secrets, `Stop` avertit s'il reste
des commits absents de `main` distante.

YOU MUST clore tout travail significatif sur les **quatre canaux**, et dire
explicitement ce qui a été mis à jour :

1. **Dépôt** : commité, **poussé, passé en pull request et fusionné sur `main`**.
   Un commit local ne livre rien. `CONTRIBUTING.md` exige une PR même en solo,
   même pour de la documentation, fusion en rebase après contrôles au vert
2. **Journal** `docs/journal/` : fait, dérives, prochaine étape, état des tickets
3. **Mémoire** : toute découverte non dérivable du code
4. **Jira** : état réel de chaque critère, commit, ce qui reste

Un travail non tracé sera refait ou contredit. Un journal qui présente comme « à
faire » une tâche déjà faite est pire qu'un journal absent.

## Vérification avant de conclure

Types, lint et tests concernés au vert, critères d'acceptation vérifiés, rendu
contrôlé à 320 px si la story touche l'interface. Pour une zone critique s'y
ajoutent un test négatif de sécurité, un test de concurrence ou d'idempotence, et
la simulation d'une panne de fournisseur.

**Montrer la preuve**, sortie de commande et résultat, ne jamais affirmer que ça
marche. Un contrôle qui n'a jamais échoué sur le défaut qu'il prétend attraper
n'est pas un contrôle : le prouver par mutation.

**Consulter Context7** avant d'utiliser une API de Next.js 16, React 19, Prisma 7,
Better Auth 1.6 ou Stripe, ces versions étant plus récentes que ma connaissance.
Signaler quand Context7 a été utilisé.
