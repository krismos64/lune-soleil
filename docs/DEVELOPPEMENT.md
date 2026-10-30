# Développement local

Déplacé du `README.md` le 30 octobre 2026, LS-302. Le démarrage rapide reste
dans le `README.md` ; cette page porte le détail.

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

**Next 16.4.x porte la correction de l'optimiseur d'images**, LS-273 et LS-292 :
un visiteur qui quittait une page pendant la première optimisation d'une image
figeait cette variante pour tout le monde en 16.3.x. Le report lancé à
`postinstall` est retiré depuis la montée en 16.4.3, le 24 octobre 2026.
`tests/unitaire/next-optimiseur-images.test.ts` éprouve toujours la vraie
fonction de Next avec une socket de visiteur fermée.

Le site sert `/catalogue` et `/produit/<slug>` côté public, `/administration`
côté exploitante, dont `/administration/stocks` pour les marchés. La liste fait
foi dans `src/app/`, elle n'est pas recopiée ici : une énumération dans un README
se périme à la story suivante.

## Recevoir les événements de paiement en local

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
produit le 31 août 2026, le profil `default` pointant sur l'autre service hébergé et
portant en prime une clé de production.

```bash
stripe listen --project-name lune-soleil --forward-to localhost:3000/api/webhooks/paiement
stripe get /v1/account --project-name lune-soleil    # doit rendre le compte Stripe de la boutique
```

Le profil vit dans `~/.config/stripe/config.toml`, hors du dépôt. Le recréer sur
une machine neuve consiste à y ajouter une section `[lune-soleil]` portant
`test_mode_api_key`, valeur recopiée du `.env`.

**Ne jamais passer une clé en argument**, ni littéralement ni par
`--api-key "$(...)"` : le shell substitue avant de lancer le processus, et la
valeur devient lisible par tout `ps` de la machine. C'est le défaut 4 de LS-156.

Carte de test, sans argent réel : `4242 4242 4242 4242`, date future quelconque,
CVC quelconque.

## Téléverser une photographie en local

`MEDIA_RACINE` doit désigner un chemin **hors du dépôt**, par exemple
`~/.lune-soleil/medias`. Sans elle, le téléversement échoue et un produit ne peut
pas être publié, la publication exigeant un média traité portant un texte
alternatif. Ne jamais la faire pointer sur `public/` : en sortie standalone ce
dossier est recopié dans l'image à la construction, un média téléversé
disparaîtrait au déploiement suivant.

## Activer le garde-fou des secrets, sur tout clone neuf

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
`npm audit` à zéro, `prisma generate`, et la suite entière au vert. **Le compte de tests ne s'écrit plus ici** : il disait « 388 unitaires et 482 d'intégration » quand le dépôt en portait 634 et 918 au 11 septembre 2026. `npm run test` l'imprime.

## Base de données locale

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

**Les variables SMTP sont lues depuis LS-82**, `smtp.ts` refusant de construire
son transport si l'une manque, en nommant les absentes et jamais leur valeur.
Elles sont **cinq**, dont **quatre exigées** : `SMTP_PORT` a un défaut de 587.
Le document disait « six », compte périmé corrigé le 10 septembre 2026.

**Les lire ne suffisait pas à les employer** : `creerAuth()` prenait l'envoyeur de
repli par défaut jusqu'à LS-214, donc aucun email d'authentification ne partait
malgré une configuration complète. Depuis LS-215, l'envoi réel est de plus refusé
hors production. **Stripe et les médias sont lus depuis**, `stripe/index.ts` et
`services/media.ts` : les laisser vides rend le paiement indisponible et la
racine des médias au repli, ce qui compte pour LS-153.

**LES DEUX VARIABLES DE L'IA ONT ÉTÉ RETIRÉES** le 11 septembre 2026 : elles
n'étaient lues par aucun code, et **ADR-044 écarte l'assistant IA** du périmètre.
La phase qui les employait n'est pas différée, elle est annulée.

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

### Deux bases, et pourquoi elles ne se confondent pas

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

## Authentification client, LS-54

Cinq écrans publics d'authentification, distincts de ceux de l'administration :
`/compte/inscription`, `/compte/connexion`, `/compte/verification`,
`/compte/mot-de-passe-oublie` et `/compte/nouveau-mot-de-passe`. Les trois
premiers portent l'entrée. L'en-tête de la boutique y mène,
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

## Droits des personnes, LS-95

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

## Tâches planifiées, LS-72

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

**Toutes les tâches déclarées travaillent**, et le compte se mesure plutôt que
de s'écrire : `grep -vcE '^\s*#|^\s*$' docker/cron/crontab`. Le chiffre disait
« cinq » jusqu'à LS-131, qui a ajouté `suivi-livraison`, à côté des quatre
décrites ci-dessous depuis LS-120 et d'`envoi-emails` qui vide la file
d'attente d'ADR-033 chaque minute.

`liberation-reservations`, toutes les cinq minutes : elle rend au catalogue les
réservations échues, ce sans quoi `quantiteReservee` ne redescendait jamais et
une pièce abandonnée au paiement restait invendable indéfiniment.

`reconciliation-paiements`, tous les quarts d'heure : elle régularise les
commandes en attente depuis plus d'une heure, en interrogeant le prestataire.
Un événement peut ne jamais arriver, et sans elle le client aurait payé sans
commande confirmée.

`purge-journaux`, une fois par jour à 03h17, LS-94 : elle applique les durées de
conservation annoncées par `docs/architecture/REGISTRE-DES-TRAITEMENTS.md`.
**Les tables se lisent dans `PURGES`**, jamais ici : cette phrase en nommait
trois quand la table en portait six, `EnvoiEnAttente`, `Message` et
`CompteurCompteVise` ayant été ajoutées depuis. `purge-quarantaine-medias`
ramasse les originaux dont le téléversement a été interrompu, LS-102.

**Une purge en échec n'empêche pas les autres.** Chaque table est isolée : un
incident sur l'une laisserait sinon les suivantes grossir indéfiniment, ce qui
est un incident silencieux. La tâche est déclarée en échec si l'une des purges a
échoué, pour que l'exploitation le voie plutôt qu'un 200 rassurant.

## Aperçu des emails, LS-222

Les quinze messages de la boutique se regardent sans lancer l'application ni la
base. La commande écrit un fichier HTML par message, plus une page d'accueil qui
les liste.

```bash
npm run apercus-emails       # écrit apercus-emails/, quinze messages et l'index
open apercus-emails/index.html   # ou glisser le fichier dans un navigateur
```

**Le dossier n'est pas versionné**, `.gitignore` l'écarte : ce sont des fichiers
dérivés du code, reconstruits en une seconde. Le dossier entier s'envoie tel quel
à l'exploitante, qui n'a qu'à ouvrir `index.html`.

**Les données sont fictives et le disent** : « Camille Dupont », des numéros de
commande inventés, et des domaines en `.invalid`, que la RFC 2606 réserve et qui
ne peuvent pas exister. Un aperçu qui porterait une vraie adresse finirait
recopié.

**Le logo y est en base64, alors que les vrais emails le portent en pièce jointe
`cid:`.** Un navigateur ne sait pas résoudre un `cid:` dans un fichier isolé :
sans cette substitution, les quinze aperçus montreraient une image cassée. C'est
une transformation d'affichage, elle ne touche ni le gabarit ni l'envoi.

**Un modèle ajouté au code sans exemple dans le script fait échouer la
commande**, plutôt que de produire un dossier incomplet en silence.


## Authentification, LS-70

Better Auth 1.7. Un seul compte d'administration, passkey en moyen principal et
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
mécanisme et son contrôle, LS-81, et **les quatre familles sont branchées**
depuis le 13 août 2026, LS-89. `verifier-actions-sensibles.sh` le garde en
intégration continue.

**Les emails de commande partent depuis LS-82**, par le SMTP OVH, ADR-008.

**Ceux de l'authentification ne sont partis qu'à compter du 10 septembre 2026**,
LS-214 : `creerAuth()` prenait l'envoyeur de repli comme valeur par défaut, donc
ni la vérification d'adresse, ni la réinitialisation de mot de passe, ni l'alerte
de connexion à l'administration n'atteignaient personne. Le repli ne lève pas,
règle E4, donc l'écran annonçait « email envoyé » sans que rien ne parte. Deux chemins
selon qui attend le message, ADR-033 : ce qui découle d'une transaction métier
passe par une **outbox** dont une tâche vide la file toutes les minutes, ce
qu'une personne attend à l'écran part directement.

**La vérification d'adresse reste désactivée**, et son motif a changé : le
blocage n'est plus l'envoi mais le parcours autour, écran d'attente et renvoi du
lien, porté par LS-54.

**Les textes de LS-29 sont écrits depuis le 12 septembre 2026**, et **validés
par l'exploitante le 17 septembre**, les dix textes définitifs et le rendu HTML.
F-MAIL-02, la facture, n'a volontairement pas de modèle : elle est portée par le
lien signé de la confirmation de commande.

**LS-29 est close** le 8 octobre 2026, arbitrage de Christophe : son critère 4
était rempli, et ce qui suit en garde l'historique. Le
13 septembre 2026, une soumission du formulaire a été reçue **en boîte de
réception sur Yahoo, Gmail et OVH**, trois fournisseurs sur trois. Cela ne couvre
que `message-contact-recu` et `message-contact-accuse`, les **huit autres
modèles n'ayant jamais été envoyés en réel** faute d'événement réel, commande
payée, expédition, remboursement ou rétractation. Le compte de modèles se mesure
plutôt qu'il ne se recopie, il a déjà été écrit faux deux fois :

```bash
sed -n '/export type ModeleEmail/,/;$/p' src/integrations/email/index.ts \
  | grep -coE '"[a-z-]+"'
```

**L'arrivée d'un message ne se vérifie qu'à la main**, et `npm run email:reel`
sert à cela. Il vit sous sa propre configuration Vitest, que rien n'importe :
`npm run test` ne peut donc pas l'exécuter, sans quoi chaque passage de la suite
enverrait un vrai message et entamerait le quota de 200 par heure d'OVH.

Il constate que le serveur a **accepté** le message, jamais qu'il est arrivé,
distinction posée par ADR-008. Le classement en indésirable et le refus tardif
restent invisibles en SMTP : il faut ouvrir la boîte.


## Secrets

Aucun secret de production n'entre dans ce dépôt. Le fichier `.env.example` ne
contient que les noms de variables et leurs formats, jamais de valeurs.
