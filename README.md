# Lune & Soleil

Boutique e-commerce sur mesure pour la vente de bijoux artisanaux faits main,
principalement des boucles d'oreilles, créés à la main en Béarn.

Le projet couvre le cycle commercial complet : catalogue, panier, paiement,
commande, stock multicanal, facturation, préparation, expédition, suivi, service
client. Le back-office est utilisable depuis un smartphone, y compris en
situation de marché.

## État

Projet en cours de développement, **phase 2, catalogue, médias et stock
multicanal**, epic LS-3. La phase 0 de cadrage est close, et la porte de sortie
de la phase 1 est constatée, voir ci-dessous. La boutique n'est pas ouverte
commercialement.

### Porte de sortie de la phase 1, constatée le 13 août 2026

Les quatre termes exigés par LS-2, vérifiés **sur un clone neuf** dans un
répertoire vierge et non sur la machine de développement, LS-75 :

| Terme | Preuve |
|---|---|
| Clone neuf lançable avec procédure écrite | `npm ci` puis `db:preparer` : 32 tables, 25 contraintes `CHECK` sur 25 attendues, application servie, `/api/sante` opérationnelle |
| Tests au vert en intégration continue | 262 tests Vitest et 33 Playwright sur le clone, chaîne verte sur `main` |
| Administration protégée par second facteur | passkey d'ADR-021, réauthentification d'ADR-027 sur les actions sensibles, `/administration` répond 307 vers la connexion |
| Application déployable | image construite depuis le clone, 7 contrôles de sécurité au vert, aucun `.env` dans les 10 couches ouvertes |

**Déployable ne veut pas dire déployée.** Le VPS, Nginx et la mise en production
appartiennent à la phase 6 ; la phase 1 prouve que l'image se construit et que le
service démarre.

Trois écarts de procédure ont été trouvés par cet exercice et corrigés dans ce
document : l'activation du hook de secrets, absente de la procédure de démarrage,
les variables réellement obligatoires du `.env`, et le comptage estimé du
garde-fou de `db:verifier`. Une procédure ne se vérifie que sur une machine qui
n'a rien.

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
| Supervision | journal JSON en sortie standard, sans service tiers |
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

### Activer le garde-fou des secrets, sur tout clone neuf

**Ces deux commandes ne sont pas facultatives et rien ne les déclenche.** Un
clone neuf a `core.hooksPath` vide : le hook `pre-commit` existe dans le dépôt,
il ne s'exécute pas. Le dépôt étant **public**, un secret commité est indexé en
quelques minutes et doit être considéré comme compromis même après suppression.

```bash
git config core.hooksPath .githooks   # sans cela, aucun hook ne tourne
brew install gitleaks                 # ou l'équivalent sur la plateforme
```

Mesuré sur un clone neuf le 13 août 2026, LS-75 : une fausse clé Stripe `sk_live_`
a été **commitée sans la moindre résistance** avant ces commandes, et **refusée**
après. Un contributeur qui suit la procédure sans les exécuter travaille sans
protection et ne le sait pas.

Vérifier que c'est actif, la commande doit répondre `.githooks` :

```bash
git config core.hooksPath
```

Contrôles, tous rejoués par la chaîne d'intégration avant fusion :

```bash
npm run type-check # tsc --noEmit, mode strict
npm run lint       # ESLint 9
npm run build      # construction de production
npm run format:check # Prettier en vérification, ce que rejoue la chaîne
```

`format:check` échoue sans rien réécrire, c'est la forme employée par la chaîne
d'intégration. `npm run format` corrige sur place, à lancer avant de commiter.

`npm audit` doit rester à **zéro vulnérabilité**. Huit overrides y contribuent,
documentés dans `package.json` avec la condition de leur retrait.

Un override vise la version corrigée **sans franchir de version majeure chez le
paquet qui la consomme**. Monter `brace-expansion` de 3.x à 5.x a déjà cassé
ESLint, dont le `minimatch` d'alors appelait l'ancienne API ; passer de 5.0.8 à
5.0.9 ne pose aucun problème puisque `minimatch` est désormais en 10.x. Après
tout override, relancer les commandes que la dépendance sert, un audit vert ne
prouvant pas que la chaîne fonctionne.

**Une exception existe depuis le 18 août 2026**, `deepmerge-ts` en 8.x quand
`@prisma/config` épingle 7.1.5 : aucune correction n'existait dans la branche
7.x, et le remède proposé par npm rétrogradait Prisma en 6.12. La règle devient
alors sa propre exigence de preuve, `prisma validate`, `generate` et
`migrate status` ont été exécutés plutôt que supposés.

### Base de données locale

PostgreSQL 18 dans Docker, LS-66. Trois commandes suffisent sur un clone neuf :

```bash
cp .env.example .env               # puis renseigner les valeurs, voir plus bas
npm run db:preparer                # conteneur, migrations, contraintes, client
npm run db:verifier                # les contrôles du modèle sur cette base
```

`.env` porte deux jeux de variables qui doivent **concorder** : `DATABASE_URL`
que lit Prisma, et les `POSTGRES_*` que lit `docker-compose.yml`. Un mot de passe
différent d'un côté produit une erreur d'authentification à la migration, loin de
sa cause. Générer le mot de passe local avec `openssl rand -base64 24`.

**Le volume survit au mot de passe.** `POSTGRES_PASSWORD` n'agit qu'à
l'initialisation du volume : le changer dans `.env` ne change pas le mot de passe
d'une base déjà créée, et les deux divergent alors en silence. Le symptôme est
trompeur, mesuré le 13 août 2026 sur un volume repris d'un autre `.env` :

```
POST /api/auth/sign-in/email   ->  500, corps vide
```

Un **500 sans corps** sur une connexion, là où un identifiant faux rend 401. La
cause n'apparaît que dans le journal du serveur, `P1000 AuthenticationFailed`. La
réponse est `npm run db:reinitialiser`, qui détruit le volume et le recrée avec le
mot de passe courant.

**Quatre variables suffisent à démarrer**, les autres attendent la phase qui les
emploie. Mesuré sur un clone neuf, LS-75 :

| Variable | Sans elle |
|---|---|
| `POSTGRES_PASSWORD` | Compose refuse de démarrer, `required variable is missing` |
| `DATABASE_URL` | Prisma ne se connecte pas, elle doit porter le même mot de passe |
| `BETTER_AUTH_SECRET` | `npm run start` lève au démarrage, `npm run build` **passe** |
| `CRON_SHARED_SECRET` | les routes internes refusent tout le monde, défaut fermé |

La ligne du secret surprend et elle est mesurée : `next build` évalue les modules
en `NODE_ENV=production` pour collecter les données de page, sans jamais signer de
cookie. Un build vert ne prouve donc **pas** que le service démarrera. Voir le
commentaire de `src/lib/auth.ts`, qui explique pourquoi le garde-fou est posé là
où il agit plutôt qu'à la construction.

Les autres, Stripe, SMTP, médias, IA, restent vides tant que la phase qui les
emploie n'a pas commencé : le code ne les lit pas encore.

| Commande | Effet |
| --- | --- |
| `npm run db:demarrer` | démarre le conteneur seul |
| `npm run db:arreter` | arrête le conteneur, conserve les données |
| `npm run db:preparer` | démarre, applique les migrations puis le SQL non généré |
| `npm run db:reinitialiser` | **détruit le volume** et reconstruit tout |
| `npm run db:verifier` | les contrôles sur la base issue de la migration |
| `npm run db:verifier:conception` | les mêmes sur un conteneur jetable, SQL de référence |
| `npm run db:console` | ouvre `psql` sur la base locale |
| `npm run db:studio` | interface graphique Prisma Studio |

**`db:verifier` refuse de tourner sur une base qui contient des données**, parce
que ses contrôles insèrent puis tronquent : ils détruiraient un jeu de
développement. Le message indique `npm run db:reinitialiser`.

Ce compte vient de `pg_stat_user_tables`, donc d'une **estimation** tenue par
l'autovacuum, jamais d'un `count(*)`. Sur une base restaurée depuis une copie de
volume, les statistiques sont périmées et le script peut refuser une base
pourtant vide, en annonçant un nombre de lignes qui n'existent plus. Mesuré le
13 août 2026, LS-75 : « la base contient 7 lignes » alors que toutes les tables
métier étaient vides. Un `ANALYZE;` remet le compte à zéro et le contrôle repart.

Le garde-fou reste juste dans son intention, et cette estimation le rend
seulement trop prudent, jamais trop permissif : il ne laissera pas passer une
base réellement peuplée.

**Créer une migration reste un geste manuel**, après modification de
`prisma/schema.prisma` :

```bash
npx prisma migrate dev --name description_du_changement
```

`db:preparer` ne le fait pas et ne peut pas le faire : `migrate dev` est
interactif et sort en erreur dans un script. Le script emploie `migrate deploy`,
qui applique les migrations existantes sans jamais en engendrer.

Les deux modes de `db:verifier` ne se remplacent pas. Le mode conception valide
le SQL de référence de `prisma/sql-manuel/`, le mode par défaut valide ce que
Prisma a réellement créé. Une divergence entre `schema.prisma` et `schema.sql`
n'est visible que par le second.

`prisma/sql-manuel/` porte les contraintes `CHECK` et l'unicité différable que
Prisma ne sait pas générer. Depuis LS-67 une migration versionnée les applique,
production comprise ; ces fichiers servent de source de conception et de contrôle.
**Ne pas les appliquer à la main** sur une base : la rendre conforme après coup
masquerait une migration incomplète. `db:preparer` compare le compte obtenu à ces
fichiers et échoue en cas d'écart.

### Droits des personnes, LS-95

Un client supprime son compte lui-même depuis `/compte`, avec confirmation
explicite et **preuve d'identité récente** : la suppression est la première
action sensible réelle du dépôt, famille `IDENTIFIANTS`, ADR-027 décision 3.

**Ce que la suppression produit est une dissociation, pas un effacement total.**
Le droit à l'effacement ne prime pas sur l'obligation comptable, article 17
paragraphe 3 point b du RGPD, et l'article L123-22 du code de commerce impose dix
ans sur les factures.

| Donnée | Sort |
|---|---|
| compte, sessions, moyens de connexion, passkeys, carnet d'adresses | **supprimés** |
| commandes et factures | **conservées**, `utilisateurId` à nul et `dissocieA` horodaté |
| avis publiés, journaux | **conservés**, auteur anonymisé |

L'ordre est imposé : `dissocieA` se marque **avant** la suppression, `ON DELETE
SET NULL` ne sachant pas écrire un champ. Sans ce marquage, la commande
redeviendrait rattachable à quiconque contrôle ensuite la même adresse email,
règle V15.

**Le journal des connexions survit volontairement**, en `SET NULL` : un intrus ne
doit pas effacer ses traces en supprimant le compte qu'il vient de compromettre.

La procédure de réponse aux demandes d'accès, de rectification et d'effacement,
délai d'un mois compris, vit dans `docs/PROCEDURE-DROITS-DES-PERSONNES.md`.

### Tâches planifiées, LS-72

Le conteneur `cron` n'est **pas** lancé par défaut en développement : une tâche
qui se déclenche toutes les cinq minutes brouille les journaux pour aucun
bénéfice, les tests d'intégration exerçant le verrou bien mieux.

```bash
docker compose -f docker-compose.yml -f docker-compose.cron.yml up -d cron
```

Déclencher une tâche à la main, sans attendre l'échéance :

```bash
docker compose -f docker-compose.yml -f docker-compose.cron.yml \
  run --rm --entrypoint /usr/local/bin/declencher.sh cron liberation-reservations
```

`CRON_SHARED_SECRET` doit être renseignée dans `.env`, sinon les routes internes
**refusent tout le monde**, y compris le cron. C'est un défaut fermé assumé : une
tâche qui ne tourne pas se remarque, une route interne ouverte à tous ne se
remarque pas.

Trois tâches sont déclarées. `liberation-reservations` et
`reconciliation-paiements` restent **vides**, elles se remplissent en phase 3 et
4. `purge-journaux` est la seule qui travaille aujourd'hui, LS-94 : une fois par
jour à 03h17, elle applique les durées de conservation annoncées par
`docs/architecture/REGISTRE-DES-TRAITEMENTS.md` sur `JournalConnexion`,
`JournalAudit` et `RateLimit`.

**Une purge en échec n'empêche pas les autres.** Chaque table est isolée : un
incident sur l'une laisserait sinon les suivantes grossir indéfiniment, ce qui
est un incident silencieux. La tâche est déclarée en échec si l'une des trois a
échoué, pour que l'exploitation le voie plutôt qu'un 200 rassurant.

### Tests, LS-68

```bash
npm run test              # Vitest, unitaire et intégration
npm run test:unitaire     # sans base, lançable sans Docker
npm run test:integration  # base éphémère, exige Docker
npm run test:e2e          # Playwright, trois largeurs, deux sessions partagées
```

| Commande | Ce qu'elle exerce |
|---|---|
| `test:unitaire` | manipulation d'URL de base éphémère, sans base |
| `test:integration` | la primitive SQL de réservation, sur le schéma réel |
| `test:e2e` | rendu, débordement mesuré aux deux bords, accessibilité axe-core, écrans d'administration ouverts par une vraie session |

Les tests d'intégration créent une base **éphémère** au nom unique, y appliquent
`prisma migrate deploy`, puis la détruisent. La base de développement n'est
jamais touchée, et aucune exécution ne dépend de la précédente.

Le schéma vient des migrations et non de `db push` : les contraintes `CHECK`
n'ont aucun équivalent déclaratif, une base poussée accepterait la survente que
ces tests doivent voir refusée.

Sans Docker, `test:integration` **échoue** en nommant la cause, il ne s'ignore
pas. `test:unitaire` reste vert, ce qui le rend utilisable sur une machine nue.

### Authentification, LS-70

Better Auth 1.6. Un seul compte d'administration, passkey en moyen principal et
mot de passe de seize caractères en secours, ADR-021. Les comptes client relèvent
d'ADR-023.

Deux variables sont exigées, décrites dans `.env.example` :

| Variable | Ce qu'elle fait, et ce qui arrive sans elle |
|---|---|
| `BETTER_AUTH_SECRET` | signe les cookies de session. **Absente, Better Auth ne lève pas** : il retombe sur un secret par défaut publiquement lisible, avec un simple avertissement. `src/lib/auth.ts` lève au démarrage pour fermer ce chemin |
| `BETTER_AUTH_URL` | doit désigner l'URL **réellement servie**, port compris. Une valeur fausse fait échouer toute connexion en « Invalid origin », avant même la vérification des identifiants |

**Toute route d'administration appelle `exigerAdministratrice` dans son composant
serveur**, avant tout rendu. Il n'y a délibérément pas de middleware : celui de
Next.js s'exécute sur la périphérie et ne peut pas relire la session en base, il
ne verrait que la présence d'un cookie, ni sa validité ni le rôle.

Des trois mesures d'ADR-021 décidées par ADR-027, la limitation de débit est
posée par LS-79 et la session d'un jour par LS-81. **Le journal des connexions
reste à porter, LS-80.** La réauthentification des actions sensibles a son
mécanisme et son contrôle, LS-81 ; le branchement des quatre familles attend que
les actions existent, LS-89.

**Aucun email ne part encore.** ADR-008 retient le SMTP OVH, l'implémentation est
LS-82 ; d'ici là `src/integrations/email/` journalise sans envoyer, et la
vérification d'adresse reste désactivée.

### Scripts de vérification

Vingt-et-un scripts, dont neuf de mutation qui prouvent les autres :

```bash
./prisma/sql-manuel/verifier-schema.sh           # schéma sur base réelle, exige Docker
./scripts/verifier-regles.sh                     # .claude/rules/ : schéma, code, couverture
./scripts/verifier-regles-mutation.sh            # prouve le précédent par mutation
./scripts/verifier-config-claude.sh              # cohérence de la config Claude Code
./scripts/verifier-config-claude-mutation.sh     # prouve le précédent par mutation
./scripts/verifier-migration-mutation.sh         # garde-fous de migration, sans base
./scripts/verifier-tests-mutation.sh             # prouve la suite de tests, exige Docker
./scripts/verifier-hook-secrets.sh               # prouve le hook anti-fuite de secrets
./scripts/verifier-image-docker.sh               # sécurité de l'image, exige Docker
./scripts/verifier-image-docker-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-actions-sensibles.sh          # réauthentification des actions sensibles
./scripts/verifier-actions-sensibles-mutation.sh # prouve le précédent par mutation
./scripts/verifier-rendu-texte-simple.sh         # rendu HTML interdit sur le contenu de section
./scripts/verifier-rendu-texte-simple-mutation.sh # prouve le précédent par mutation
./scripts/verifier-registre-traitements.sh       # registre RGPD confronté au schéma
./scripts/verifier-registre-traitements-mutation.sh # prouve le précédent par mutation
./scripts/verifier-nginx.sh                      # résolution de l'adresse client, LS-91
./scripts/verifier-nginx-mutation.sh             # prouve le précédent par mutation
./scripts/verifier-jira.sh                       # epics et dépendances du backlog, local
./scripts/controle-fumee.sh                      # santé du service déployé, LS-73
./docs/prototypes/interblocage-panier.sh         # interblocage sur panier, exige Docker
```

`verifier-image-docker.sh` **ouvre les couches** de l'image plutôt que de relire
le `Dockerfile`. La différence est mesurée : un `.env` copié puis supprimé par
une couche ultérieure disparaît du système de fichiers et reste extractible de
l'image. Comme le dépôt est public et l'image part sur GHCR, c'est le seul
contrôle qui protège réellement l'invariant 9. Prouvé par neuf mutations, le
compte se mesure :

```bash
grep -cE '^mutation(_code)? "' scripts/verifier-image-docker-mutation.sh
```

Le motif exige le guillemet ouvrant : sans lui il compte aussi les deux
définitions de fonctions et annonce onze cas pour neuf.

`verifier-nginx.sh` garde **une seule directive**, celle qui décide de l'adresse
IP écrite au journal des connexions : `proxy_set_header X-Forwarded-For
$remote_addr`. La forme répandue, `$proxy_add_x_forwarded_for`, concatène
l'en-tête envoyé par le client, et il suffit alors d'un jeton non analysable
pour que Better Auth renonce à toute adresse. Un visiteur choisirait ainsi de ne
pas être journalisé, ce qui est pire que le défaut d'origine.

Le contrôle **retire les commentaires avant de chercher**, parce que le fichier
de configuration cite la forme interdite pour expliquer pourquoi elle l'est : un
`grep` brut serait soit toujours rouge, soit satisfait par la phrase qui nie
l'usage. Six mutations le prouvent, dont le rétablissement de la concaténation.

`controle-fumee.sh` interroge `/api/sante` et décide si un déploiement est
retenu : code 0 si le service répond avec sa base, 1 sinon. Il vise la **route**
et non PostgreSQL directement, une base joignable depuis le poste de déploiement
ne prouvant pas que l'application la joint.

Le script de mutation réinjecte douze fois un défaut réel et exige que
`verifier-regles.sh` échoue à chaque fois. Un contrôle vert ne prouve rien tant
qu'il n'a pas échoué sur le défaut qu'il prétend attraper.

Les huit premiers cas portent sur ce qu'une règle **dit**, un prédicat d'index
partiel périmé. Les quatre derniers portent sur l'endroit où elle **se
déclenche** : depuis LS-88, `verifier-regles.sh` échoue si un dossier de `src/`
n'est couvert par le `paths` d'aucune règle. Le défaut était réel, éditer
`src/lib/auth.ts` ne chargeait aucune règle alors que ce fichier porte le secret
de signature et la limitation de débit. La liste des dossiers est relevée sur le
disque et non écrite à la main : créer un dossier sans règle fait rougir le
contrôle sans que personne ait à y penser.

`verifier-config-claude.sh` contrôle ce qui dérive sans casser aucun test : un ADR
absent de la table d'aiguillage de `docs/REFERENCES.md`, un `CLAUDE.md` au-delà de
200 lignes, un renvoi vers un fichier inexistant, une fiche mémoire hors index, un
journal manquant alors que du code a été commité. Un hook `Stop` le lance en fin de
session, et `--strict` le rend bloquant dans la chaîne d'intégration.

Il vérifie aussi que **chaque hook déclaré pointe vers un script exécutable**.
Ce contrôle protège la protection elle-même : la documentation de Claude Code
pose qu'un hook dont la commande ne peut pas être lancée produit une erreur **non
bloquante**, et que l'action continue. Un `hook-block-secret-files.sh` renommé,
déplacé ou privé de son bit exécutable laisserait donc passer la lecture des
`.env` sans que rien ne s'arrête, et il n'existe aucun lint officiel de
`settings.json` pour le dire à notre place.

Les agents et les skills cités par `CLAUDE.md` sont vérifiés par leur **nom nu**,
`ls-critical-reviewer` ou `story`, qui est la forme d'invocation réelle : le
contrôle des renvois ne voit que les chemins écrits en entier, et renommer un
dossier laissait la consigne pointer dans le vide.

`verifier-jira.sh` surveille le backlog : un ticket sans epic parent, une
dépendance annoncée dans une description sans lien Jira. Il reste **hors
intégration continue**, la CI n'ayant pas ces identifiants et le dépôt étant
public. Sans les trois variables `JIRA_*` de `.env.example`, il le dit et sort en
0 plutôt que de prétendre avoir vérifié.

Il **recompte** aussi ce qui est annoncé à la main : hooks déclarés dans
`settings.json`, overrides de `package.json`, largeurs de `playwright.config.ts`,
cas des deux scripts de mutation, `README.md` de garde des dossiers de `src/`.
Ces contrôles existent parce que chacun de ces comptes a été faux au moins une
fois, sans que rien ne le voie.

**La table des nombres en lettres monte à trente**, et ce n'est pas du confort.
Elle s'arrêtait à « dix » : au-delà, la conversion rendait une chaîne vide et la
comparaison était **sautée**, donc verte sans avoir rien vérifié. Le seuil était
déjà franchi, `verifier-tests-mutation.sh` portant vingt-et-un cas. Un contrôle
qui se tait quand il ne comprend pas est pire qu'un contrôle absent : il occupe
la place et personne ne le remplace.

**Il ne corrige rien, et c'est délibéré.** Un chiffre faux est souvent le symptôme
d'une modification non documentée : le corriger en silence ferait perdre
l'information utile. Le 4 août 2026, « deux hooks » était faux parce qu'un
`PostToolUse` avait été ajouté sans être écrit nulle part.

### Intégration continue

`.github/workflows/controles.yml`, LS-69. Il s'exécute sur chaque pull request
vers `main` et sur `main` après fusion, et rejoue les huit contrôles de
`CONTRIBUTING.md` plus le format, les règles, la cohérence de configuration et
`npm audit`.

La validation du schéma passe **en premier**, sous ses deux modes : c'est le seul
contrôle dont l'absence d'exécution a déjà laissé passer un défaut, le 29 juillet
2026.

**Trois scripts seulement tournent en intégration continue**, les sept autres se
lancent à la main. Ne pas recopier ces nombres, les mesurer :
`grep -ohE '\./[a-z/-]+\.sh' .github/workflows/*.yml | sort -u`.

Quatre raisons de rester hors chaîne, une par famille. Les **quatre** scripts de
mutation modifient des fichiers du dépôt en place, ce qu'une exécution partagée
ne tolère pas. Le prototype d'interblocage documente un défaut ouvert, LS-50 : le
brancher rendrait la chaîne rouge en permanence. `verifier-jira.sh` exige des
identifiants que la CI n'a pas, le dépôt étant public. `controle-fumee.sh` et
`preparer-base-locale.sh` visent un service qui tourne, pas un dépôt.

La chaîne démarre son propre conteneur `lune-soleil-db` par `docker run`, sans
passer par `docker-compose.yml` qui exige un `.env` absent en intégration
continue. Le nom est celui qu'attend le mode `--base-migree`.

Un second workflow, `derive-documentation.yml`, rejoue `verifier-config-claude.sh`
**chaque lundi matin** et ouvre une issue étiquetée `derive-documentation` si la
documentation ne décrit plus le dépôt. Il est séparé délibérément : une dérive
documentaire ne bloque aucune fusion, et un rouge qui signifie parfois « ne pas
fusionner » et parfois « à relire » est un rouge que l'on apprend à ignorer. Il se
déclenche aussi à la main depuis l'onglet Actions.

Il a été prouvé par quatorze mutations, toutes détectées. Le compte se mesure,
`grep -cE '^\s*mutation "' scripts/verifier-config-claude-mutation.sh`, il grandit
avec les contrôles.

`verifier-migration-mutation.sh` prouve les garde-fous de
`scripts/migrate-production.sh` sur dix cas, sans base réelle : `psql`, `pg_dump`
et `npx` sont remplacés par des doublures. Cinq familles d'instructions
destructives doivent bloquer, une migration additive doit passer, et une
détection qui ne peut pas conclure doit bloquer plutôt que supposer. Lancé contre
la version d'avant LS-42, il échoue sur sept de ces dix cas.

`verifier-tests-mutation.sh` casse **quatre-vingt-dix fois** le comportement
testé et exige que la suite rougisse à chaque fois. Les cibles, par domaine :
réservation et stock, authentification et autorisation, socle de validation et
journalisation, journal des connexions, verrou de tâche planifiée, preuve
d'identité et réauthentification, purge des journaux, limitation de débit,
droits des personnes, catalogue avec ses sections et ses variantes, le
traitement des photographies avec son stockage, les conditions de publication
d'un produit depuis LS-103, et depuis LS-111 le rendu des écrans
d'administration ouverts par une vraie session. Il vérifie d'abord que
les deux projets de test sont verts, sans quoi aucune mutation ne prouverait
rien.

**Le détail par domaine n'est plus énuméré en nombres**, et c'est délibéré :
cette phrase portait quatorze compteurs dont la somme faisait cinquante-six pour
un total annoncé de soixante-seize, quatre stories n'y ayant jamais été portées.
Un compte recopié à la main se périme à chaque ajout sans que rien ne le
signale. Le seul nombre à tenir à jour est le total, et
`verifier-config-claude.sh` le confronte au script.

**Il exige que le test rougissant soit celui qui porte la garantie**, jamais
n'importe lequel. C'est ce qui a fait apparaître un défaut dans un test de
LS-94 : la mutation de la frontière `lt` vers `lte` restait verte parce que le
test calculait la limite de conservation à la main plutôt que de la demander à
`limiteDeConservation`, et plaçait donc sa ligne trois jours du mauvais côté.

**Tout fichier muté figure dans `MUTABLES`, et un garde-fou le vérifie.** Un
fichier absent de cette liste n'est ni sauvegardé ni restauré : la mutation
survit à l'exécution. Le cas a été réel, `reauthentification.ts` était muté sans
y figurer depuis LS-81, et chaque exécution laissait sur le disque le défaut de
sécurité que cette story avait corrigé, une preuve d'identité absente
considérée comme fraîche. Trouvé pendant LS-80.

Ne jamais recopier ce nombre de mémoire, il a déjà été faux : le mesurer par
`grep -c '^cas ' scripts/verifier-tests-mutation.sh`.

**Il exige que ce soit le test attendu qui échoue, pas n'importe lequel.** Une
première version se contentait d'un échec quelconque : en neutralisant les
assertions des trois tests de concurrence, elle annonçait toujours « 7 mutations,
7 détectées », la mutation étant vue par deux tests indirects pendant que les
tests censés porter la garantie étaient devenus aveugles.

Ce script a trouvé un défaut réel pendant l'écriture de LS-68, décrit dans
`docs/journal/2026-07-31-tests-vitest-playwright-ls68.md`.

## Image de l'application

`Dockerfile` produit l'image déployée, en trois étapes. Elle porte 27 paquets
contre plusieurs centaines en développement, s'exécute sous l'utilisateur `node`
et déclare un contrôle de santé qui interroge `/api/sante`, donc la base et pas
seulement un port ouvert.

```bash
docker build -t lune-soleil:verification .
./scripts/verifier-image-docker.sh
```

Trois choses à savoir avant d'y toucher :

- **`.dockerignore` est la protection des secrets**, pas les `COPY` nommés du
  Dockerfile. `next build` recopie le `.env` du contexte dans
  `.next/standalone/.env`, que l'étape finale copie en entier : sans les deux
  lignes d'exclusion, le secret part sur le registre
- **`public/` et `.next/static` ne sont pas dans la sortie autonome** et se
  copient à la main. Les oublier ne casse ni la construction, ni le démarrage,
  ni la santé : le site sert seulement ses pages sans styles
- **le tag de retour arrière est l'identifiant de commit**, jamais `latest`

`.github/workflows/publier-image.yml` publie sur GHCR, uniquement sur `main`
après fusion. Le workflow de contrôles construit l'image à chaque pull request
sans jamais publier, il reste en `contents: read`.

## Secrets

Aucun secret de production n'entre dans ce dépôt. Le fichier `.env.example` ne
contient que les noms de variables et leurs formats, jamais de valeurs.

## Licence

Aucune licence. Tous droits réservés. Le code est publié pour consultation et ne
peut pas être réutilisé, copié ou distribué sans autorisation écrite.
