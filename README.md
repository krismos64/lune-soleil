# Lune & Soleil

Boutique e-commerce sur mesure pour la vente de bijoux artisanaux faits main,
principalement des boucles d'oreilles, créés à la main en Béarn.

Le projet couvre le cycle commercial complet : catalogue, panier, paiement,
commande, stock multicanal, facturation, préparation, expédition, suivi, service
client. Le back-office est utilisable depuis un smartphone, y compris en
situation de marché.

## État

Projet en cours de développement. **La boutique tourne en production depuis le
9 septembre 2026** mais n'est pas ouverte commercialement : il manque les clés
de paiement et d'envoi d'email, LS-153, et les contenus de l'exploitante.

Les portes de sortie des phases 1 et 3 sont constatées, voir plus bas. Deux
stories de la phase 0 restent ouvertes, LS-19 la médiation et LS-20 les
photographies, chacune sur une dépendance externe et non sur du travail à faire.
Le tableau ci-dessus porte le compte mesuré.

**Plusieurs phases avancent en parallèle**, et ce n'est pas un dérapage : le
travail suit les dépendances réelles plutôt que l'ordre des numéros.

| Phase | Epic | Stories ouvertes | Ce qui reste |
|---|---|---|---|
| 0, cadrage | LS-1 | 2 | médiation (compte tiers) et photographies, toutes deux externes |
| 1, fondations | LS-2 | 0 | **close**, porte de sortie constatée le 13 août 2026 |
| 2, catalogue et médias | LS-3 | 5 | finitions d'interface et d'accessibilité, aucune bloquante |
| 3, panier et paiement | LS-4 | 2 | LS-86 et LS-125, deux stories d'interface qui ne bloquent rien |
| 4, factures et expédition | LS-5 | 5 | dépend du compte Sendcloud, LS-200 en tête |
| 4bis, espace client et avis | LS-36 | 4 | LS-190 attend LS-58, qui attend le suivi de livraison |
| 5, rétractation et conformité | LS-6 | 1 | LS-148, établir si le consentement aux cookies est dû |
| 6, exploitation et ouverture | LS-7 | 10 | **LS-153 attend l'exploitante**, LS-142 et LS-175. LS-139 est en cours : en-têtes servis et incident 1 joué, restent l'incident 3, SSH et le seuil disque. LS-211 porte le statut du catalogue |
| 7, V1 cible | LS-8 | 3 | après ouverture, hors Go-Live |
| Contenus | LS-22 | 11 | **attend l'exploitante**, rien n'est faisable sans elle |

**159 tickets terminés sur 211**, les deux termes relevés dans Jira le
9 septembre 2026 au soir et jamais dérivés l'un de l'autre. Le dénominateur a
bougé de 208 à 211 dans la même journée, LS-209, LS-210 et LS-211 ayant été
créées en livrant.

**Le contrôle nocturne est rouge pour une raison connue**, LS-210 : trois
vulnérabilités `vitest` en dépendance de développement, jamais expédiées, que
npm refuse de résoudre sur un bug reproduit en cinq tentatives. Tout le reste du
nocturne passe, scénarios de bout en bout compris. Ne pas prendre ce rouge pour
un défaut neuf, et ne pas s'y habituer non plus : c'est le risque que LS-210
porte explicitement.

**La phase 1 est close dans Jira depuis le 9 septembre**, ses 26 stories étant
terminées : l'epic était resté En cours alors que sa porte de sortie datait du
13 août, sa dernière story ouverte étant LS-96.

Un compte écrit à la main se périme sans bruit, et **le dénominateur bouge
autant que le numérateur** : il est passé de 180 à 208 depuis le 5 septembre,
chaque story livrée en créant parfois d'autres. Un pourcentage qui progresse
peut recouvrir un périmètre qui s'élargit.

### La boutique tourne en production depuis le 9 septembre 2026

`https://lune-soleil.fr` répond 200 sur le VPS partagé avec SmartPlanning,
ADR-036. Trois conteneurs, schéma complet, sauvegarde quotidienne par unité
`systemd` avec restauration prouvée, ADR-037. Les cinq tâches planifiées
tournent, et les médias sont servis depuis le volume.

**Le déploiement est outillé depuis LS-138, et son déclenchement reste
MANUEL** : le workflow « Déployer en production » se lance à la demande, avec le
SHA complet du commit à déployer, et aboutit sur le VPS en dix-huit secondes. Le
retour arrière a été joué réellement.

**Un commit sur `main` ne déploie rien**, il publie une image. Le déclenchement
manuel est une décision, expliquée dans `deployer.yml` : les migrations tournent
depuis le dépôt, le garde-fou destructif exige une lecture humaine, et chaque
déploiement recrée des conteneurs chez un produit payant qui partage la machine. La clé SSH ne peut exécuter qu'un script,
sur un utilisateur hors du groupe `docker`.

**Il reste LS-153**, la première mise en ligne : poser les clés Stripe et SMTP,
et fixer l'ordre des opérations. Elle **attend l'exploitante**, LS-142 et LS-175
exigeant sa présence physique. Plus rien ne dépend du code seul.

`docs/deploiement/EXPLOITATION.md` porte l'exploitation courante,
`PREPARATION-SERVEUR.md` la mise en place initiale.

### Où lire le détail

**Ce tableau dit l'état, pas l'histoire.** `docs/journal/` porte une page par
session, avec ce qui a été fait, ce qui a dérapé et pourquoi.
C'est là que se lit le détail d'une story livrée, et la page la plus récente
donne l'état du projet plus vite que Jira.

### Porte de sortie de la phase 1, constatée le 13 août 2026

Les quatre termes exigés par LS-2, vérifiés **sur un clone neuf** dans un
répertoire vierge et non sur la machine de développement, LS-75 :

| Terme | Preuve |
|---|---|
| Clone neuf lançable avec procédure écrite | `npm ci` puis `db:preparer` : 34 tables, 29 contraintes `CHECK` sur 29 attendues, 8 index partiels, application servie, `/api/sante` opérationnelle |
| Tests au vert en intégration continue | 262 tests Vitest et 33 Playwright sur le clone, chaîne verte sur `main` |
| Administration protégée par second facteur | passkey d'ADR-021, réauthentification d'ADR-027 sur les actions sensibles, `/administration` répond 307 vers la connexion |
| Application déployable | image construite depuis le clone, 7 contrôles de sécurité au vert, aucun `.env` dans les 10 couches ouvertes |

**Déployable ne veut pas dire déployée**, et c'était le constat du 13 août 2026 :
la phase 1 prouvait que l'image se construit et que le service démarre, le VPS et
la mise en production appartenant à la phase 6.

**Dépassé depuis le 9 septembre 2026** : la boutique tourne, voir la section État
plus haut. La distinction reste juste dans son principe, une image qui se
construit ne disant rien de ce qui l'exécute.

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
| Documents comptables | `@react-pdf/renderer`, police embarquée, volume local, ADR-034 |
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

**Franchi hors des tests le 31 août 2026**, au navigateur, avec les clés Stripe
réelles du compte de l'exploitante en mode test, sur une variante à un
exemplaire : réservation atomique portant un `commandeId`, événement
`checkout.session.completed` accepté en `200` après validation de signature,
commande `CONFIRMEE` à 2349 centimes, **un seul** mouvement `VENTE_WEB` de -1,
facture `F-2026-0001` dont l'instantané légal porte l'identité de l'émetteur et
la mention de l'article 293 B. Aucune `AlerteCritique`.

**Le document PDF suit depuis LS-129**, livrée le 1er septembre 2026 : une
facture émise produit son fichier après le commit du webhook, et un échec de
rendu laisse `chemin_pdf` nul en levant une alerte plutôt qu'en annulant le
paiement. Le **téléchargement** par le client reste à écrire, LS-57 et LS-132.

## Documentation

| Contenu | Emplacement |
|---|---|
| Décisions d'architecture | `docs/adr/` |
| Architecture technique | `docs/architecture/` |
| Journal de bord | `docs/journal/` |
| Rapports de recette | `docs/recettes/` |
| Guides de déploiement et d'exploitation | `docs/` |
| Backlog et statut du travail | Jira, projet LS |

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
npm run dev        # sert le site sur le port 3000
```

Le site sert `/catalogue` et `/produit/<slug>` côté public, `/administration`
côté exploitante, dont `/administration/stocks` pour les marchés. La liste fait
foi dans `src/app/`, elle n'est pas recopiée ici : une énumération dans un README
se périme à la story suivante.

### Recevoir les événements de paiement en local

Le retour du navigateur ne confirme rien, invariant 5 : seul un événement signé
reçu sur `/api/webhooks/paiement` fait passer une commande en `CONFIRMEE`. Stripe
ne pouvant pas joindre un poste de développement, la CLI ouvre le tunnel.

```bash
stripe listen --forward-to localhost:3000/api/webhooks/paiement
```

**Le secret affiché par cette commande doit être recopié dans
`STRIPE_WEBHOOK_SECRET`, et il change à chaque relance.** Un secret qui ne
correspond pas est indétectable à l'œil : les deux valeurs commencent par
`whsec_` et ont la même longueur, si bien qu'un contrôle de format les accepte
toutes les deux. Le symptôme est un `400` sur chaque événement et une commande
qui reste en `EN_ATTENTE_PAIEMENT` sans autre explication. Mesuré le 31 août
2026.

**Un profil `lune-soleil` isole ce projet**, la CLI enregistrant par défaut un
seul compte pour toute la machine. Sans lui, une session ouverte pour un autre
projet écoute les événements de cet autre projet, en silence : le cas s'est
produit le 31 août 2026, le profil `default` pointant sur SmartPlanning et
portant en prime une clé de production.

```bash
stripe listen --project-name lune-soleil --forward-to localhost:3000/api/webhooks/paiement
stripe get /v1/account --project-name lune-soleil    # doit rendre acct_1UAS2J…
```

Le profil vit dans `~/.config/stripe/config.toml`, hors du dépôt. Le recréer sur
une machine neuve consiste à y ajouter une section `[lune-soleil]` portant
`test_mode_api_key`, valeur recopiée du `.env`.

**Ne jamais passer une clé en argument**, ni littéralement ni par
`--api-key "$(...)"` : le shell substitue avant de lancer le processus, et la
valeur devient lisible par tout `ps` de la machine. C'est le défaut 4 de LS-156.

Carte de test, sans argent réel : `4242 4242 4242 4242`, date future quelconque,
CVC quelconque.

### Téléverser une photographie en local

`MEDIA_RACINE` doit désigner un chemin **hors du dépôt**, par exemple
`~/.lune-soleil/medias`. Sans elle, le téléversement échoue et un produit ne peut
pas être publié, la publication exigeant un média traité portant un texte
alternatif. Ne jamais la faire pointer sur `public/` : en sortie standalone ce
dossier est recopié dans l'image à la construction, un média téléversé
disparaîtrait au déploiement suivant.

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

`npm audit` doit rester à **zéro vulnérabilité**. Neuf overrides y contribuent,
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

**Le même motif s'est répété le 1er septembre 2026**, `mysql2` sous
GHSA-3f6p-5ww8-9rcr. Le remède proposé par npm était `prisma@6.19.3`, soit un
retour de la 7 vers la 6 annoncé comme *breaking change* : il aurait cassé le
client généré, l'adaptateur `@prisma/adapter-pg` et les conventions de
migration. L'override monte `mysql2` en 3.24.2 sans toucher à Prisma, resté en
7.9.1.

`mysql2` arrive par `prisma` **et** `better-auth`, et ce projet tourne sur
PostgreSQL : le paquet n'est jamais chargé à l'exécution, ce qui borne le risque
réel sans lever l'obligation de zéro. Preuve exécutée plutôt que supposée,
`npm audit` à zéro, `prisma generate`, 388 tests unitaires et 482 d'intégration.

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

**Les six variables SMTP sont lues depuis LS-82**, `smtp.ts` refusant de
construire son transport si l'une manque, en nommant les absentes et jamais leur
valeur. **Stripe et les médias sont lus depuis**, `stripe/index.ts` et
`services/media.ts` : les laisser vides rend le paiement indisponible et la
racine des médias au repli, ce qui compte pour LS-153. Seules les variables de
l'IA ne sont lues par aucun code, la phase qui les emploie n'ayant pas commencé.

| Commande | Effet |
| --- | --- |
| `npm run db:demarrer` | démarre le conteneur seul |
| `npm run db:arreter` | arrête le conteneur, conserve les données |
| `npm run db:preparer` | démarre, applique les migrations puis le SQL non généré |
| `npm run db:reinitialiser` | **détruit le volume** et reconstruit tout |
| `npm run db:e2e` | prépare la base **de bout en bout**, distincte, port 55433 |
| `npm run db:e2e:reinitialiser` | détruit le volume de test seul et le reconstruit |
| `npm run db:verifier` | les contrôles sur la base issue de la migration |
| `npm run db:verifier:conception` | les mêmes sur un conteneur jetable, SQL de référence |
| `npm run db:console` | ouvre `psql` sur la base locale |
| `npm run db:studio` | interface graphique Prisma Studio |
| `EMAIL_TEST_DESTINATAIRE=... npm run email:reel` | envoie un **vrai** message, LS-82 critère 1 |

#### Deux bases, et pourquoi elles ne se confondent pas

La suite de bout en bout tourne sur **sa propre base**, port 55433, séparée de
celle de développement, port 55432. `npm run test:e2e` la prépare seul : il n'y a
rien à lancer à la main.

L'écart tient à une contrainte du modèle. La préparation Playwright promeut son
compte d'administration, et l'index partiel `utilisateur_administratrice_unique`
n'admet **qu'une** administratrice, règle E1. Le compte réel de l'exploitante
occupe cette place sur la base de développement : la préparation y échouait sur
`duplicate key value violates unique constraint`, avant tout test, et Playwright
marquait la suite entière « did not run ». Mesuré le 5 septembre 2026 en livrant
LS-180, reproduit le 8 septembre, LS-189.

Élargir la clause de rétrogradation aurait fermé ce défaut en ouvrant celui que
le garde-fou existant empêche : un `UPDATE` sans clause retire son rôle au compte
réel, en silence. L'isolement par la base ferme les deux, et le fait
structurellement, aucune requête de la suite n'atteignant la base de
développement.

Trois conséquences pratiques :

- les comptes, produits et commandes de test vivent sur la base 55433. La base de
  développement ne les porte plus, et `npm run db:console` ouvre bien celle de
  développement
- `DATABASE_URL_E2E` doit différer de `DATABASE_URL` par le **port** :
  `preparer-base-e2e.sh` compare les deux valeurs écrites dans `.env` et refuse
  de préparer si elles coïncident
- sur une base de test neuve, la première exécution crée neuf comptes quand
  `/sign-up/email` en accepte trois par minute : elle échoue partiellement, et la
  suivante complète. `npm run db:e2e:reinitialiser` remet ce compteur à zéro en
  détruisant le volume de test, jamais celui de développement

**L'intégration continue s'en sert aussi, depuis le 9 septembre 2026.** Le
contrôle nocturne compose `DATABASE_URL_E2E` dans son environnement et
`preparer-base-e2e.sh` démarre la base par `docker run` plutôt que par
`docker compose`, ce dernier interpolant trois variables depuis un `.env` que la
chaîne ne crée jamais, le dépôt étant public.

Ce paragraphe affirmait l'inverse, « l'intégration continue ne s'en sert pas »,
et c'était vrai au mauvais sens du terme : **la suite n'y tournait pas du tout**.
Le nocturne échouait avant elle depuis le 8 septembre, et l'étape `npm audit` qui
la suit sortait `skipped` plutôt que `failure`. Les parcours critiques
n'étaient rejoués par personne.

La distinction entre les deux voies se fait sur la **présence des variables**, et
non sur un drapeau `CI` qui se pose et s'oublie : ce qui compte est de savoir où
lire, pas dans quel décor on tourne.

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

### Authentification client, LS-54

Trois écrans publics, distincts de ceux de l'administration : `/compte/inscription`,
`/compte/connexion` et `/compte/verification`. L'en-tête de la boutique y mène,
« Se connecter » ou « Mon compte » selon la session.

**La séparation d'avec `/administration/connexion` est le défaut que cette story
corrige.** Un client dont la session expirait y était renvoyé depuis deux
endroits, observation du 13 août 2026 : l'écran refusait correctement, mais
annonçait un espace d'administration à qui voulait consulter son compte.

**La vérification d'adresse n'est pas bloquante**, arbitrage du 2 septembre
2026 : `requireEmailVerification` reste à `false`, un compte non vérifié se
connecte et commande normalement. Elle conditionne le **rattachement** des
commandes passées sans compte, parcours 6, jamais l'accès au compte lui-même.
`tests/integration/inscription-client.sequential.test.ts` fige cet arbitrage :
activer le drapeau fait rougir le test du critère 3.

**Deux défauts d'envoi ont été trouvés en écrivant ces écrans**, tous deux
totaux et invisibles à la lecture : `auth.ts` nommait `url` une variable que les
modèles attendent sous `lien`, et `sendOnSignUp` n'était pas configuré, donc le
rappel `sendVerificationEmail` n'était jamais appelé. Aucun email
d'authentification ne partait depuis LS-70.

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

**Cinq tâches** sont déclarées et toutes travaillent : les quatre décrites
ci-dessous depuis LS-120, plus `envoi-emails` qui vide la file d'attente
d'ADR-033 chaque minute. Le compte se mesure,
`grep -vcE '^\s*#|^\s*$' docker/cron/crontab`.

`liberation-reservations`, toutes les cinq minutes : elle rend au catalogue les
réservations échues, ce sans quoi `quantiteReservee` ne redescendait jamais et
une pièce abandonnée au paiement restait invendable indéfiniment.

`reconciliation-paiements`, tous les quarts d'heure : elle régularise les
commandes en attente depuis plus d'une heure, en interrogeant le prestataire.
Un événement peut ne jamais arriver, et sans elle le client aurait payé sans
commande confirmée.

`purge-journaux`, une fois par jour à 03h17, LS-94 : elle applique les durées de
conservation annoncées par `docs/architecture/REGISTRE-DES-TRAITEMENTS.md` sur
`JournalConnexion`, `JournalAudit` et `RateLimit`. `purge-quarantaine-medias`
ramasse les originaux dont le téléversement a été interrompu, LS-102.

**Une purge en échec n'empêche pas les autres.** Chaque table est isolée : un
incident sur l'une laisserait sinon les suivantes grossir indéfiniment, ce qui
est un incident silencieux. La tâche est déclarée en échec si l'une des trois a
échoué, pour que l'exploitation le voie plutôt qu'un 200 rassurant.

### Tests, LS-68

```bash
npm run test              # Vitest, les trois projets
npm run test:unitaire     # sans base, lançable sans Docker
npm run test:composant    # rendu React en jsdom, sans base ni navigateur
npm run test:integration  # base éphémère, exige Docker
npm run test:e2e          # Playwright, quatre largeurs, deux sessions partagées
```

| Commande | Ce qu'elle exerce |
|---|---|
| `test:unitaire` | manipulation d'URL de base éphémère, sans base |
| `test:composant` | le rendu d'un composant React isolé, pour les états qu'aucun autre projet n'atteint |
| `test:integration` | la primitive SQL de réservation, sur le schéma réel |
| `test:e2e` | rendu, débordement mesuré aux deux bords, accessibilité axe-core, écrans d'administration ouverts par une vraie session |

**Le projet `composant` existe pour un besoin précis**, ajouté par LS-113 :
certains états dépendent d'une donnée **globalement** absente. Les deux états
vides « aucune catégorie » s'affichent quand la table entière est vide, ce que la
fixture de bout en bout ne peut pas produire puisqu'elle insère toujours une
catégorie ; et vider la table en cours de suite ferait voir cet état aux
travailleurs voisins, la base étant partagée. Il ne remplace pas la mesure de
bout en bout, qui reste la seule à voir une mise en page réelle.

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
est porté par LS-80** : service, écran d'administration, hook, test de bout en
bout et test d'intégration existent, `git ls-files | grep journal-connexion` les
liste. La réauthentification des actions sensibles a son
mécanisme et son contrôle, LS-81 ; le branchement des quatre familles attend que
les actions existent, LS-89.

**Les emails partent depuis LS-82**, par le SMTP OVH, ADR-008. Deux chemins
selon qui attend le message, ADR-033 : ce qui découle d'une transaction métier
passe par une **outbox** dont une tâche vide la file toutes les minutes, ce
qu'une personne attend à l'écran part directement.

**La vérification d'adresse reste désactivée**, et son motif a changé : le
blocage n'est plus l'envoi mais le parcours autour, écran d'attente et renvoi du
lien, porté par LS-54.

**Les six textes F-MAIL-01 à F-MAIL-06 restent dus par LS-29.** Seuls les trois
messages d'authentification ont un rendu ; les textes de la marque demandent la
validation de l'exploitante.

**L'arrivée d'un message ne se vérifie qu'à la main**, et `npm run email:reel`
sert à cela. Il vit sous sa propre configuration Vitest, que rien n'importe :
`npm run test` ne peut donc pas l'exécuter, sans quoi chaque passage de la suite
enverrait un vrai message et entamerait le quota de 200 par heure d'OVH.

Il constate que le serveur a **accepté** le message, jamais qu'il est arrivé,
distinction posée par ADR-008. Le classement en indésirable et le refus tardif
restent invisibles en SMTP : il faut ouvrir la boîte.

### Scripts de vérification

Les comptes se mesurent plutôt qu'ils ne se recopient, ils bougent à chaque
story : `ls scripts/*.sh | wc -l` pour le total, `ls scripts/*mutation*.sh | wc -l`
pour ceux qui prouvent les autres. Ils valaient 86 et 37 le 9 septembre 2026 en
fin de journée, contre 84 et 36 le matin : la ligne s'est périmée dans la journée
même où elle a été écrite pour cesser de se périmer, ce qui est l'argument le
plus court en faveur de la commande plutôt que du nombre. La
liste ci-dessous n'en cite qu'une partie.
`preparer-base-locale.sh` n'y figure pas, il s'appelle par `npm run db:preparer`
et `db:reinitialiser`, cités plus haut.

```bash
./prisma/sql-manuel/verifier-schema.sh           # schéma sur base réelle, exige Docker
./scripts/verifier-regles.sh                     # .claude/rules/ : schéma, code, couverture
./scripts/verifier-regles-mutation.sh            # prouve le précédent par mutation
./scripts/verifier-config-claude.sh --strict     # cohérence de la config Claude Code
./scripts/verifier-config-claude-mutation.sh     # prouve le précédent par mutation
./scripts/verifier-migration-mutation.sh         # garde-fous de migration, sans base
./scripts/verifier-tests-mutation.sh             # prouve la suite de tests, exige Docker
./scripts/verifier-tests-non-ignores.sh          # aucun test ignoré ni focalisé, sans base
./scripts/verifier-propagation-docs.sh           # socle Zod et VALIDATION.md accordés
./scripts/verifier-hook-secrets.sh               # prouve le hook anti-fuite de secrets
./scripts/verifier-image-docker.sh               # sécurité de l'image, exige Docker
./scripts/verifier-image-docker-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-actions-sensibles.sh          # réauthentification des actions sensibles
./scripts/verifier-actions-sensibles-mutation.sh # prouve verifier-actions-sensibles.sh par mutation
./scripts/verifier-gardes-administration.sh      # garde de rôle, par fonction
./scripts/verifier-gardes-administration-mutation.sh # prouve verifier-gardes-administration.sh par mutation
./scripts/verifier-rendu-texte-simple.sh         # rendu HTML interdit sur le contenu de section
./scripts/verifier-rendu-texte-simple-mutation.sh # prouve le précédent par mutation
./scripts/verifier-contraste.sh                  # contraste WCAG des paires couleur et fond, LS-84
./scripts/verifier-contraste-mutation.sh         # prouve le précédent par mutation
./scripts/verifier-bordure-controle.sh           # bordure d'un contrôle au seuil de 3:1, C36, LS-108
./scripts/verifier-bordure-controle-mutation.sh  # prouve le précédent par mutation
./scripts/verifier-loading-et-404.sh             # aucun loading.tsx ne masque un 404, LS-146
./scripts/verifier-loading-et-404-mutation.sh    # prouve le précédent par mutation
./scripts/verifier-chargement-administration.sh          # tout écran d'administration a un état de chargement, LS-188
./scripts/verifier-chargement-administration-mutation.sh # prouve le précédent par mutation
./scripts/verifier-etats-non-nominaux-mutation.sh        # les états non nominaux de l'administration, LS-113
./scripts/verifier-lien-evitement.sh                     # le lien d'évitement de l'administration et sa cible, LS-194
./scripts/verifier-lien-evitement-mutation.sh            # prouve le précédent par mutation
./scripts/verifier-ponctuation-chargement.sh             # les annonces de chargement, ponctuation et caractère, LS-195
./scripts/verifier-ponctuation-chargement-mutation.sh    # prouve le précédent par mutation
./scripts/verifier-bascule-mot-de-passe.sh               # tout champ de mot de passe client porte sa bascule, LS-179
./scripts/verifier-bascule-mot-de-passe-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-environnement.sh                      # le .env local : présence, forme, doublons, concordance, LS-156
./scripts/verifier-environnement.sh --exemple-seul       # le seul sens jouable en CI, sans .env
./scripts/verifier-environnement-mutation.sh             # prouve le précédent par mutation, bac à sable
./scripts/verifier-hook-secret-argument.sh               # le hook refuse un secret passé en argument, LS-156
./scripts/engendrer-medias-test.mjs                      # les déclinaisons des photos de test, avant le build e2e, LS-187
./scripts/engendrer-images-marque.mjs                    # favicon, manifeste et image de partage, LS-147
#   `--verifier` échoue tant que les fichiers versionnés ne correspondent pas au source
./scripts/verifier-medias-test.sh                        # le générateur ci-dessus contre la fixture et ADR-007
./scripts/verifier-seo.sh                        # métadonnées de référencement de toute route, LS-137
./scripts/verifier-seo-mutation.sh               # prouve le précédent par mutation
./scripts/verifier-mentions-retractation.sh      # les trois emplacements de l'article L221-23, LS-136
./scripts/verifier-mentions-retractation-mutation.sh  # prouve le précédent par mutation
./scripts/verifier-palette-secours.sh            # couleurs en dur de l'écran de secours, LS-146
./scripts/verifier-palette-secours-mutation.sh   # prouve le précédent par mutation
./scripts/verifier-navigation-administration.sh  # chaque écran d'administration est navigable, LS-162
./scripts/verifier-navigation-administration-mutation.sh # prouve le précédent par mutation
./scripts/verifier-navigation-client.sh          # toute navigation interne passe par Link, LS-110
./scripts/verifier-navigation-client-mutation.sh # prouve le précédent par mutation
./scripts/verifier-en-tetes-securite.sh          # les cinq en-têtes de sécurité, ADR-038, LS-139
./scripts/verifier-en-tetes-securite-mutation.sh # prouve le précédent, chaque en-tête séparément
./scripts/verifier-en-tetes-production.sh        # les mesure SERVIS par le domaine réel, LS-139
./scripts/verifier-route-echec.sh                # garde la page qui lève à dessein, LS-191
./scripts/verifier-route-echec-mutation.sh       # prouve le précédent par mutation
./scripts/verifier-fixtures-e2e.sh               # adresses de test fixes, plafonds préservés, LS-168
./scripts/verifier-fixtures-e2e-mutation.sh      # prouve le précédent par mutation
./scripts/verifier-base-e2e.sh                   # isolement de la base de bout en bout, LS-189
./scripts/verifier-base-e2e-mutation.sh          # prouve le précédent par mutation
./scripts/verifier-reintegration-stock-mutation.sh # étape 9 du parcours 5, LS-173
./scripts/amorcer-compte-administration.sh       # promeut le compte de l'exploitante, LS-175
#   la procédure complète vit dans docs/PROCEDURE-AMORCAGE-ADMINISTRATION.md
./scripts/verifier-comptes-production.sh         # une administratrice, aucun compte de test, LS-175
./scripts/verifier-description-accessible.sh          # aucun aria-describedby annulé par un aria-label, C39, LS-161
./scripts/verifier-description-accessible-mutation.sh # prouve le précédent par mutation
./scripts/verifier-numerotation-etapes-mutation.sh    # prouve le sens « numéros d'étape en doublon » de verifier-config-claude.sh, LS-202
./scripts/verifier-revalidation-layout.sh             # une Server Action revalide le layout quand le layout lit la donnée, C37
./scripts/verifier-revalidation-layout-mutation.sh    # prouve verifier-revalidation-layout.sh par mutation
./scripts/verifier-prefetch-administration.sh         # les liens de l'administration désactivent le préchargement, C40, LS-166
./scripts/verifier-prefetch-administration-mutation.sh # prouve le précédent par mutation
./scripts/verifier-graphie-marque.sh                  # le nom commercial suit le logo et ne s'écrit qu'une fois, LS-193
./scripts/verifier-graphie-marque-mutation.sh         # prouve le précédent par mutation
./scripts/verifier-prefixe-medias.sh                  # NEXT_PUBLIC_MEDIA_PREFIXE atteint le bundle construit, LS-197
./scripts/verifier-prefixe-medias-mutation.sh         # prouve verifier-prefixe-medias.sh par mutation
./scripts/verifier-registre-traitements.sh       # registre RGPD confronté au schéma
./scripts/verifier-registre-traitements-mutation.sh # prouve le précédent par mutation
./scripts/verifier-nginx.sh                      # résolution de l'adresse client, LS-91
./scripts/verifier-nginx-mutation.sh             # prouve le précédent par mutation
./scripts/verifier-taches-planifiees.sh          # toute tâche déclarée est déclenchée, LS-206
./scripts/verifier-taches-planifiees-mutation.sh # prouve le précédent par mutation
./scripts/verifier-plafonds-corps.sh             # service, Next et Nginx s'accordent sur la taille, LS-207
./scripts/verifier-plafonds-corps-mutation.sh    # prouve le précédent par mutation
./scripts/verifier-sauvegarde-mutation.sh        # éprouve les 6 garde-fous de la sauvegarde, LS-139
sudo ./scripts/incident-disque-plein.sh          # incident 3, sur un disque dédié, LS-139
#
# Déploiement, LS-138 et LS-139. Ceux-là vivent sur la MACHINE, pas dans scripts/ :
#   deploiement/deployer.sh              bascule, retour arrière, état, purge des images
#   deploiement/sauvegarder-base.sh      sauvegarde quotidienne, base et fichiers
#   deploiement/verifier-seuil-disque.sh alerte de seuil, unité systemd horaire
# Le workflow « Déployer en production » les appelle par une clé SSH enfermée
# qui ne peut exécuter QUE le premier. Voir docs/deploiement/EXPLOITATION.md.
#
# `deployer.sh` est installé en /usr/local/sbin/lune-soleil-deployer et NE SE MET
# PAS À JOUR TOUT SEUL : le modifier dans le dépôt ne change rien à la machine.
./scripts/verifier-emetteur-facture.sh            # identité légale des factures, sans afficher les valeurs
./scripts/decider-suite-complete.sh              # portée de la chaîne selon le diff, LS-169
./scripts/verifier-decision-suite.sh             # prouve le précédent sur 24 cas, chiffre que le script imprime
./scripts/verifier-protection-branche.sh         # réglages de main dont la chaîne dépend, LS-176
./scripts/verifier-verdict-audit.sh              # panne du registre npm contre vulnérabilité, LS-176
./scripts/verifier-jira.sh                       # epics et dépendances du backlog, local
./scripts/controle-fumee.sh                      # santé du service déployé, LS-73
./docs/prototypes/reservation-test.sh            # concurrence sur la pièce unique, exige Docker
./docs/prototypes/interblocage-panier.sh         # interblocage sur panier, exige Docker
./docs/prototypes/interblocage-liberation-confirmation.sh # ordre des verrous, LS-120
```

**`verifier-config-claude.sh` sort toujours en 0 sans `--strict`**, y compris
quand il relève des anomalies : il les écrit sur la sortie d'erreur et rend 0.
Ce n'est pas un défaut, c'est ce qui permet de le brancher sur le hook `Stop`
sans bloquer une session légitimement interrompue en cours de travail, un ADR
écrit dont la table n'est pas encore à jour par exemple.

Conséquence à connaître : **le lire sur sa sortie, jamais sur son code de retour
seul**, et employer `--strict` pour trancher. Le piège s'est refermé le
1er septembre 2026 sur un `script | tail; echo $?`, qui rend le code de `tail`
et non celui du script.

**Ce script de mutation restaure `README.md` en sortant.** Il refuse de tourner
si le fichier porte des modifications non commitées, garde-fou à respecter :
commiter avant de le lancer, sans quoi la restauration emporte le travail en
cours.

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

`verifier-nginx.sh` garde **quatre sens** du fichier de configuration.

Le premier est la directive qui décide de l'adresse IP écrite au journal des
connexions, `proxy_set_header X-Forwarded-For $remote_addr`. La forme répandue,
`$proxy_add_x_forwarded_for`, concatène l'en-tête envoyé par le client, et il
suffit alors d'un jeton non analysable pour que Better Auth renonce à toute
adresse. Un visiteur choisirait ainsi de ne pas être journalisé, ce qui est pire
que le défaut d'origine.

Le contrôle **retire les commentaires avant de chercher**, parce que le fichier
cite la forme interdite pour expliquer pourquoi elle l'est : un `grep` brut
serait soit toujours rouge, soit satisfait par la phrase qui nie l'usage.

**Le quatrième sens s'ancre sur un CHEMIN et non sur une directive**, depuis
LS-205. Il refusait auparavant tout `alias` ou `root`, ce qui rendait ADR-007
inapplicable : plus rien ne servait les médias, et le catalogue aurait affiché
des images cassées pendant que `/api/sante` rendait 200. Un seul chemin est
désormais autorisé, `medias/public/`, et le contrôle exige aussi qu'il soit
**présent** — sans quoi il serait satisfait par un fichier où personne ne sert
les médias. Ce n'est pas une exemption mais un resserrement : la racine du
volume, qui publierait la quarantaine et ses données EXIF, la racine des
documents comptables et tout chemin parent restent refusés.

**Douze mutations le prouvent**, dont les sept d'origine, ce qui montre que le
resserrement n'a rien ouvert.

`controle-fumee.sh` interroge `/api/sante` et décide si un déploiement est
retenu : code 0 si le service répond avec sa base, 1 sinon. Il vise la **route**
et non PostgreSQL directement, une base joignable depuis le poste de déploiement
ne prouvant pas que l'application la joint.

Le script de mutation réinjecte quinze fois un défaut réel et exige que
`verifier-regles.sh` échoue à chaque fois. Un contrôle vert ne prouve rien tant
qu'il n'a pas échoué sur le défaut qu'il prétend attraper.

Les neuf premiers cas portent sur ce qu'une règle **dit**, un prédicat d'index
partiel périmé. Quatre portent sur l'endroit où elle **se déclenche** : depuis
LS-88, `verifier-regles.sh` échoue si un dossier de `src/` n'est couvert par le
`paths` d'aucune règle. Les deux derniers portent la **frontière Prisma des
services**, LS-158 : un appel de modèle hors des dérogations de socle échoue,
et une dérogation périmée échoue aussi, dans l'autre sens. Le défaut était réel, éditer
`src/lib/auth.ts` ne chargeait aucune règle alors que ce fichier porte le secret
de signature et la limitation de débit. La liste des dossiers est relevée sur le
disque et non écrite à la main : créer un dossier sans règle fait rougir le
contrôle sans que personne ait à y penser.

`verifier-config-claude.sh` contrôle ce qui dérive sans casser aucun test : un ADR
absent de la table d'aiguillage de `docs/REFERENCES.md`, un `CLAUDE.md` au-delà de
200 lignes, un renvoi vers un fichier inexistant, une fiche mémoire hors index, un
journal manquant alors que du code a été commité, un motif `paths` de règle qui ne
matche aucun fichier suivi. Un hook `Stop` le lance en fin de
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

**La table des nombres en lettres monte à quarante**, étendue par LS-80, et ce
n'est pas du confort.
Elle s'arrêtait à « dix » : au-delà, la conversion rendait une chaîne vide et la
comparaison était **sautée**, donc verte sans avoir rien vérifié. Le seuil était
déjà franchi à l'époque, `verifier-tests-mutation.sh` portant alors vingt-et-un
cas ; il en porte **148** au 9 septembre 2026, compte relevé par
`grep -cE '^cas "' scripts/verifier-tests-mutation.sh` et jamais de mémoire. Un contrôle qui se tait
quand il ne comprend pas est pire qu'un contrôle absent : il occupe la place et
personne ne le remplace.

**Il ne corrige rien, et c'est délibéré.** Un chiffre faux est souvent le symptôme
d'une modification non documentée : le corriger en silence ferait perdre
l'information utile. Le 4 août 2026, « deux hooks » était faux parce qu'un
`PostToolUse` avait été ajouté sans être écrit nulle part.

### Intégration continue

`.github/workflows/controles.yml`, LS-69. Il s'exécute sur chaque pull request
vers `main`, et rejoue les **neuf** contrôles de `CONTRIBUTING.md` plus le
format. **`npm audit` n'y est plus depuis LS-177**, il est passé au nocturne
avec les scénarios de bout en bout et la construction de l'image, comme le dit
la section suivante. Le neuvième a été détaché du sixième par LS-202 : les
contrôles textuels vivaient sous le numéro `6x` alors que quatre étapes
seulement valident le schéma.

**Le nom du job reste « Les huit controles de CONTRIBUTING »** et ne se corrige
pas : c'est l'identifiant exigé par la protection de branche, non un libellé.
Le renommer laisserait toute pull request en attente d'un résultat qui n'arrive
jamais.

**Il ne s'exécute plus sur `main` après fusion depuis LS-176**, et cette
suppression a une condition. `required_status_checks.strict` vaut true, donc
GitHub exige qu'une branche soit à jour avec `main` avant de fusionner : l'arbre
fusionné est exactement celui que la pull request a testé, et le second passage
revalidait un état déjà vert. Il coûtait la moitié du quota et jusqu'à dix-sept
minutes par livraison.

`verifier-protection-branche.sh` **échoue si `strict` repasse à false**, cas où
une fusion pourrait produire un arbre jamais testé. Sans ce contrôle, la
condition ne vivrait que dans un commentaire et la protection sauterait en
silence. Il vérifie aussi que le contrôle requis porte bien le nom du job : un
job renommé renomme son check, et la protection cesse alors d'exiger quoi que ce
soit sans qu'aucun message ne le signale.

Une relance complète à la demande reste possible, `workflow_dispatch`, et elle
exécute toujours la suite entière.

**Trois contrôles ont quitté la pull request depuis LS-177**, arbitrage explicite
du 4 septembre 2026 pour ramener une pull request de code de 24 à environ onze
minutes : les **scénarios de bout en bout**, **`npm audit`** et la **construction
de l'image Docker**. Ils vivent dans `nocturne.yml`, rejoué chaque nuit à 2 h UTC
et déclenchable à la main.

**Cette story réduit la couverture avant fusion**, contrairement à LS-176 qui n'en
retirait aucune. Un défaut d'interface, débordement à 320 px ou lien mort, peut
entrer sur `main` et n'être vu que le lendemain. Le dépôt a déjà connu ces
défauts, LS-171 et LS-162.

**Le jalon reste vérifié à chaque pull request**, et c'est ce qui rend
l'arbitrage tenable : l'achat de bout en bout sur une pièce unique vit dans
`tests/integration/parcours-complet.sequential.test.ts`, pas dans la suite
Playwright. Les tests d'intégration ne bougent pas, réservation et concurrence
comprises.

Le contrôle nocturne **ouvre une issue** en cas d'échec plutôt que de rougir dans
un onglet que personne ne consulte, et il **ne bloque aucune fusion** : son rouge
signifie « un défaut est entré hier », pas « ne pas fusionner ».

**À reconsidérer avant le Go-Live**, LS-153, quand un défaut d'interface
commencera à coûter des ventes.

`publier-image.yml` **construit, vérifie, puis publie** depuis la même story.
L'ordre inverse laissait une image atteindre GHCR, registre public, avant que le
contrôle des couches ne l'examine : un `.env` entré dans une couche aurait été
publié avant d'être vu, invariant 9. Le pas de construction des pull requests
servait de barrière sans que ce soit son rôle déclaré, ce que son retrait a rendu
visible.

La validation du schéma passe **en premier**, sous ses deux modes : c'est le seul
contrôle dont l'absence d'exécution a déjà laissé passer un défaut, le 29 juillet
2026.

**Le nombre de scripts qui tournent en intégration continue ne s'inscrit plus
ici**, il se mesure. Il valait 44 le 9 septembre 2026 :
`grep -ohE '\./[a-z/-]+\.sh' .github/workflows/*.yml | sort -u`.

**Ce nombre s'est périmé TROIS fois**, et la troisième est la plus
instructive : il annonçait « trois scripts » quand ils étaient dix-sept, puis
« dix-neuf » quand ils étaient quarante-deux, puis « quarante-deux » quand
LS-110 en a ajouté deux le jour même où ce paragraphe avertissait de ne pas le
recopier. Un avertissement écrit à côté d'un chiffre n'empêche pas ce chiffre de
vieillir : seule la commande le dit, d'où sa suppression ci-dessus.

Quatre raisons de rester hors chaîne, une par famille. **La plupart des scripts
de mutation restent dehors** : ils modifient des fichiers du dépôt en place, ce
qu'une exécution partagée ne tolère pas. Ceux qui y tournent sont ceux qui
travaillent sur des copies dans un bac temporaire ; leur nombre se mesure,
`grep -ohE '\./[a-z/-]+\.sh' .github/workflows/*.yml | sort -u | grep -c mutation`,
et valait 9 sur 36 le 9 septembre 2026. Le prototype d'interblocage documente un défaut ouvert, LS-50 : le
brancher rendrait la chaîne rouge en permanence. `verifier-jira.sh` exige des
identifiants que la CI n'a pas, le dépôt étant public. `controle-fumee.sh` et
`preparer-base-locale.sh` visent un service qui tourne, pas un dépôt.

La chaîne démarre son propre conteneur `lune-soleil-db` par `docker run`, sans
passer par `docker-compose.yml` qui exige un `.env` absent en intégration
continue. Le nom est celui qu'attend le mode `--base-migree`.

**Quatre autres workflows** accompagnent `controles.yml`, tous séparés pour la
même raison : un rouge qui signifie parfois « ne pas fusionner » et parfois « à
relire » est un rouge que l'on apprend à ignorer.

`derive-documentation.yml` rejoue `verifier-config-claude.sh` et
`verifier-protection-branche.sh` **chaque lundi matin**, et ouvre une issue
étiquetée `derive-documentation` si la documentation ne décrit plus le dépôt ou si
un réglage de protection a changé. Il porte `administration: read`, portée que
`controles.yml` n'a pas et ne doit pas avoir.

`nocturne.yml` rejoue **chaque nuit** ce que LS-177 a sorti des pull requests, et
ouvre une issue étiquetée `controle-nocturne`.

`publier-image.yml` construit, vérifie et publie l'image sur `main` après chaque
fusion.

`deployer.yml` bascule la production vers une image déjà publiée, ou revient à la
précédente, LS-138. **Il ne se déclenche qu'à la main** : les migrations tournent
depuis le dépôt, le garde-fou destructif exige une lecture humaine du SQL, et
chaque déploiement recrée des conteneurs sur une machine que partage un produit
payant. Il n'envoie qu'un identifiant de commit validé à une clé SSH **enfermée**
qui ne peut exécuter que `deploiement/deployer.sh`.

Les quatre se déclenchent aussi à la main depuis l'onglet Actions.

Il a été prouvé par quinze mutations, toutes détectées. Le compte se mesure,
`grep -cE '^\s*mutation "' scripts/verifier-config-claude-mutation.sh`, il grandit
avec les contrôles.

`verifier-migration-mutation.sh` prouve les garde-fous de
`scripts/migrate-production.sh` sur **seize** cas, sans base réelle : `psql`,
`pg_dump` et `npx` sont remplacés par des doublures. Cinq familles d'instructions
destructives doivent bloquer, une migration additive doit passer, et une
détection qui ne peut pas conclure doit bloquer plutôt que supposer. Lancé contre
la version d'avant LS-42, il échoue sur sept des dix cas d'origine.

**Six cas se sont ajoutés en LS-208**, écrits avant la correction et rouges à ce
moment : un commentaire portant `DROP INDEX` ne doit plus déclencher le
garde-fou, une instruction réelle suivie d'un commentaire doit toujours bloquer,
et la première migration d'une base vide doit passer, son dump de 887 octets
tombant sous le seuil de 1024. La doublure `pg_dump` est devenue pilotable en
taille : écrivant toujours 4096 octets, elle n'exerçait **jamais** ce seuil,
ce qui avait laissé passer le second défaut.

`verifier-tests-mutation.sh` casse **148 fois** le comportement
testé et exige que la suite rougisse à chaque fois. Les cibles, par domaine :
réservation et stock, authentification et autorisation, socle de validation et
journalisation, journal des connexions, verrou de tâche planifiée, preuve
d'identité et réauthentification, purge des journaux, limitation de débit,
droits des personnes, catalogue avec ses sections et ses variantes, le
traitement des photographies avec son stockage, les conditions de publication
d'un produit depuis LS-103, le rendu des écrans
d'administration ouverts par une vraie session depuis LS-111, et depuis LS-104
le catalogue public avec ses états de disponibilité et ses vignettes, et depuis
LS-118 la création de la session de paiement, sa garde de réservation et
l'expiration des sessions concurrentes. Il vérifie d'abord que
les deux projets de test sont verts, sans quoi aucune mutation ne prouverait
rien.

**Il dure une trentaine de minutes et ne se lance pas à chaque story** : les
portes de sortie de phase, et les cas neufs joués un par un le reste du temps.

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
