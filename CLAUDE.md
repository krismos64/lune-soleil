# Lune & Soleil

Boutique e-commerce de bijoux artisanaux faits main. Mono-tenant, France
métropolitaine, euro. Vente en ligne cohabitant avec des marchés locaux et Vinted.

## Commandes

`nvm use` d'abord, `engine-strict=true` rendant `engines` bloquant : Prisma 7
refuse les versions impaires de Node.

```bash
npm ci && npx prisma generate        # le client Prisma n'est pas versionné
npm run type-check && npm run lint && npm run build
npm run test && npm run test:e2e  # Vitest sur base éphémère, puis Playwright
npm run db:preparer && npm run db:e2e  # les deux bases, 55432 et 55433
npm run db:verifier    # les contrôles du modèle sur cette base, exige Docker
./scripts/verifier-regles.sh         # .claude/rules/ : schéma, code, couverture
./scripts/verifier-config-claude.sh  # cohérence config, ADR, mémoire, journal
```

Liste complète dans `README.md`. La CI rejoue presque tout par PR : bout en bout,
`npm audit` et image sont au **nocturne** depuis LS-177, un défaut de ces trois-là
entre donc sur `main` sans bloquer. `npm audit` doit rester à **zéro**, à mesurer.
Une migration se **crée** à la main, `npx prisma migrate dev --name sujet`.

**Trois bases, jamais confondues** : développement sur 55432, bout en bout sur
55433, et celle qu'un test d'intégration crée. Ne jamais pointer les deux
dernières sur la première : la suite y promeut son admin, et E1 n'en admet qu'une.

## Architecture

Monolithe modulaire. Les gestionnaires de route et les Server Actions sont des
adaptateurs d'entrée, jamais la couche métier.

```
app/ et components/   ->  services/  ->  repositories/  ->  Prisma  ->  PostgreSQL
```

Composants serveur par défaut, client uniquement pour une interaction réelle.
`services/` porte les cas d'usage, `repositories/` l'accès aux données par
domaine, `integrations/` isole Stripe, email, médias et IA. Chaque dossier de
`src/` porte un `README.md` de garde énonçant ce qui a le droit d'y entrer, hors
`generated/` et `styles/` ; un contrôle le vérifie. Aucune généralisation
prématurée, ce projet n'est pas un produit réutilisable.

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
   réconciliation. Une clé d'unicité par effet, table dans `database.md`.
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
3. **Ne pas accorder au féminin par défaut.** « Le client », jamais « la
   cliente » : une part notable des acheteurs est masculine, un homme qui offre un
   bijou. Tourner sans accord de genre plutôt qu'écrire « client(e) ». Exception,
   « l'administratrice » et « l'exploitante » désignent une personne réelle.
   Formulations neutres dans `frontend-design.md`.

## Interdits

- Modifier le périmètre du cahier des charges. Un arbitrage explicite de
  Christophe le modifie en revanche, et se trace dans un ticket
- Décider d'une obligation juridique. Les textes de loi se vérifient aux sources
- Lire une clé privée ou un certificat. Le `.env`, lui, est lisible depuis le
  7 septembre 2026, arbitrage de Christophe
- Modifier une commande ou une facture réelle
- Introduire les données du prototype (noms, prix, stocks) comme données réelles

## Priorisation

Deux axes à ne pas confondre. **Importance** : Must, Should, Could, Won't.
**Jalon** : Go-Live, V1 cible, V1.x, Hors V1. Un Must sur Go-Live ne se repousse
jamais. Aucune date fixée, le pilotage se fait par portes de sortie de phase.
Deux nuances qui se perdent : l'assistant IA et l'**interface** de statistiques
sont en V1 cible mais la **collecte** des montants est au Go-Live, une donnée non
capturée étant perdue ; l'espace client, les avis et le carnet d'adresses sont
dans le périmètre d'ouverture depuis le 28 juillet 2026, epic LS-36.

## Sources de vérité

Par ordre de priorité en cas de divergence : **loi**, **ADR accepté**
(`docs/adr/`), cahier des charges V1.0 (hors dépôt, données personnelles),
documentation technique du dépôt, Jira. **Confluence est abandonné**, arbitrage
du 7 septembre 2026, LS-9 : ne pas y écrire ni l'y chercher. Toute décision
structurante produit un ADR, toute idée neuve entre d'abord dans Jira.

**`docs/REFERENCES.md`** porte les tables d'aiguillage, à lire au début d'une
session qui conçoit. **`docs/deploiement/EXPLOITATION.md`** porte la production,
qui tourne : à lire avant toute intervention sur la machine.

**Une règle numérotée se cite par son identifiant**, S12 ou V14, jamais
paraphrasée seule : c'est ce qui permet aux contrôles textuels de la retrouver.

`docs/journal/` porte l'avancement réel, une page par session. **Lire la plus
récente en début de session** donne l'état du projet plus vite que Jira.

YOU MUST lire les **commentaires** d'un ticket Jira avant sa description, champ
`comment` demandé explicitement, il ne revient pas par défaut. **Le plus récent
l'emporte**, et l'écart se signale plutôt que de se résoudre en silence.

## Autonomie et accès

**Travailler sans demander de validation à chaque commande.** Faire un point à
chaque étape significative, et proposer la suite plutôt que de l'enchaîner.

**Secrets** : `.env` lisible et modifiable depuis le 7 septembre 2026, arbitrage
de Christophe. Une valeur lue entre dans l'historique de session : une clé
exposée se **révoque**, l'effacer ne suffit pas. Clés privées et certificats
restent bloqués. **Lire n'est pas exposer** : une valeur en **argument** de
commande est lisible par tout `ps`, le hook la refuse toujours ; laisser le
processus lire le fichier. Préférer `./scripts/verifier-environnement.sh` à la
lecture quand les deux répondent, deux secrets au même préfixe étant
indiscernables à l'œil.

**Accès opérationnels** : `ssh`, `docker`, `stripe`, `gh`, `psql` avec les accès
configurés, sans jamais lire les identifiants sous-jacents.

**Production** : autonome, mais **toujours par l'outil prévu**. Migrer via
`./scripts/migrate-production.sh` et jamais `prisma migrate deploy` ; déployer
par le workflow « Déployer en production » et jamais à la main. Un garde-fou qui
ne peut pas conclure bloque, `database.md` et `EXPLOITATION.md` les détaillent.

## Agents

Trois agents projet, table dans `docs/REFERENCES.md` : `ls-critical-reviewer`,
zones à risque ; `ls-conteneurisation`, déploiement ; `ls-frontend-revue`,
interface. **Ne pas invoquer `docker-devops`, `security-auditor` ni
`nextjs-architect`**, calibrés sur une autre stack.

## Conduite du travail

Tout travail suit le skill `story`, exploration sans ticket comprise : il porte
le contrôle avant zone critique et la clôture de la traçabilité ; le skill `adr`
écrit une décision structurante. Des hooks les appuient sur cinq événements,
table dans `docs/REFERENCES.md` : état injecté au démarrage, secrets bloqués à la
lecture, `verifier-regles.sh` rejoué, traçabilité contrôlée en fin de session.

YOU MUST clore tout travail significatif sur les **quatre canaux**, et dire
explicitement ce qui a été mis à jour :

1. **Dépôt** : commité, **poussé, passé en PR et fusionné sur `main`** en rebase,
   même en solo, même pour de la documentation. `main` exige la PR et le contrôle
   vert **sans exception**, `enforce_admins` étant actif : un push direct est
   refusé, y compris pour le propriétaire
2. **Journal** `docs/journal/` : fait, dérives, prochaine étape, état des tickets
3. **Mémoire** : toute découverte non dérivable du code
4. **Jira** : état réel de chaque critère, commit, ce qui reste

Un travail non tracé sera refait ou contredit, un journal périmé est pire
qu'absent.

## Vérification avant de conclure

Types, lint et tests concernés au vert, critères d'acceptation vérifiés, rendu
contrôlé à 320 px si la story touche l'interface. Pour une zone critique s'y
ajoutent un test négatif de sécurité, un test de concurrence ou d'idempotence, et
la simulation d'une panne de fournisseur, et `ls-frontend-revue` sur l'interface.

**Montrer la preuve**, sortie de commande et résultat. Un contrôle qui n'a
jamais échoué sur le défaut qu'il prétend attraper n'est pas un contrôle : le
prouver par mutation, `./scripts/verifier-tests-mutation.sh` rejouant la suite.

**Consulter Context7** avant d'utiliser une API de Next.js 16, React 19, Prisma 7,
Better Auth 1.6 ou Stripe, ces versions étant plus récentes que ma connaissance.
Signaler quand Context7 a été utilisé.
