# 8 septembre 2026, c : LS-189, la suite de bout en bout a sa propre base

La préparation Playwright écrivait sur la base de développement, où le compte
réel de l'exploitante occupe l'unique place de l'index partiel. Elle échouait
avant tout test. Ce que la story a coûté à apprendre tient en une phrase :
**une correction ne vaut que confrontée à la condition réelle du défaut**, et
trois défauts distincts sont sortis de cette confrontation, aucun visible à
l'écriture.

## Le défaut, reproduit avant d'être corrigé

La base locale ne portait plus le compte réel au moment de commencer : le
contournement de LS-180 l'avait défait. Reproduire la condition était donc le
premier travail, et non une formalité.

```
error: duplicate key value violates unique constraint "utilisateur_administratrice_unique"
  at preparerBase (tests/e2e/session-administration.setup.ts:272:3)
1 failed (189ms)
```

`utilisateur_administratrice_unique` n'admet qu'une ligne dont le rôle vaut
`ADMINISTRATRICE`, règle E1. La préparation promeut le sien, le compte réel tient
la place.

## Trois voies, dont deux qui rouvraient ce qu'elles fermaient

La clause de rétrogradation ne vise que le préfixe `e2e-`, et cette étroitesse
**protège** : un `UPDATE` sans clause retire son rôle au compte réel, en silence.
L'élargir aurait fermé le défaut en ouvrant celui que le garde-fou empêche.

Rétrograder puis restaurer en fin de suite automatise le contournement manuel de
LS-180, avec sa fenêtre : un Ctrl+C laisse l'administration inaccessible.

Arbitrage de Christophe : **base dédiée**, port 55433, volume distinct. La
propriété devient structurelle plutôt que contractuelle, aucune requête de la
suite n'atteignant la base qui porte le compte réel, quelle que soit la clause
qu'un futur ticket écrira.

## Ce que la confrontation au réel a trouvé

### Le bloc `env` ne gouverne que le sous-processus

`webServer.env` sert le serveur Next.js. Les cinq `.setup.ts` tournent, eux, dans
le processus Playwright et ouvrent leur propre connexion `pg`. Le serveur lisait
donc la base de test pendant que la préparation continuait d'écrire sur celle de
développement, et d'y échouer.

**C'est la base de test VIDE qui a désigné la cause.** `SELECT ... FROM
utilisateur` y rendait zéro ligne après l'échec : sans cette lecture, j'aurais
cherché du côté de la migration. La variable est désormais posée à l'évaluation
de la configuration, qui précède les tests.

### Une valeur par défaut qui ment

`?? ""` transmettait une chaîne vide au sous-processus, qui **écrase** la
variable héritée au lieu de laisser le repli jouer. Le build échouait sur
« DATABASE_URL absente ». La clé est maintenant **omise** quand `.env` ne la
porte pas, ce qui est le cas nominal de l'intégration continue. Motif déjà en
fiche.

### Le garde-fou comparait la variable à elle-même

Playwright ayant surchargé `DATABASE_URL` avant d'appeler le script, la
comparaison tombait sur « IDENTIQUES » et refusait de préparer, faisant échouer
le démarrage entier du serveur.

**Le refus était juste dans son principe et faux dans son ancrage.** Ce qui doit
être comparé est ce qui est écrit dans `.env`, la seule chose qu'une recopie sans
changement de port peut rendre identique. `dotenv.parse` lit le fichier sans
toucher à `process.env`.

## La mutation qui a raté sa cible

Après réécriture de la surcharge, la mutation 1 visait `DATABASE_URL:
process.env.DATABASE_URL_E2E`, forme abandonnée en cours de story. Elle ne
modifiait plus rien.

La garde d'empreinte a signalé « la mutation n'a rien modifié, cible manquée »
plutôt que de rendre un vert trompeur. Sans elle j'aurais lu trois sur quatre et
accusé le contrôle. Motif « correction échouée en silence », et c'est la première
fois sur ce dépôt que la garde se déclenche pour de bon.

## Preuves

`verifier-base-e2e.sh`, trois sens indépendants, **quatre mutations sur quatre**,
chacune sur un état réellement existant : la surcharge absente, soit le dépôt
d'avant la story ; la clause élargie, soit la correction qu'il fallait écarter ;
la comparaison retirée ; l'ancrage cassé, qui doit faire échouer plutôt que
rendre un OK silencieux.

Critères 2 et 3 tenus par mesure, deux exécutions consécutives :

```
avant  contact@lune-soleil.fr | ADMINISTRATRICE | t | 2026-09-08 06:39:01.685+00
après  contact@lune-soleil.fr | ADMINISTRATRICE | t | 2026-09-08 06:39:01.685+00
```

Horodatage identique à la milliseconde. Isolement mesuré : base de développement
zéro administratrice, base e2e une, onze comptes de test chacun.

Suite complète : **1497 passent**, 2 échecs sur `mobile-320` qui passent en
isolation, instabilité de charge de LS-201.

## Ce qui reste ouvert

**Les quatre tests `chemin_pdf` échouent toujours**, et je les ai cette fois
mesurés sur `main` plutôt que de le supposer : `4 failed | 1277 passed`, à
l'identique. Défaut de LS-166, hors périmètre.

**La première exécution sur une base de test neuve échoue partiellement.** Neuf
comptes à créer, trois places par minute sur `/sign-up/email` : la suivante
complète, l'espacement de `comptes-profil.setup.ts` faisant son travail en
3,1 min. Documenté dans le `README.md` plutôt que corrigé, le plafond étant une
protection réelle qu'on ne neutralise pas en test.

**LS-175 n'est pas contredite.** Elle décidera quel compte réel existe sur quelle
base ; cette story garantit seulement que la suite n'y touche pas.

## Prochaine étape

LS-175 reste bloquée par LS-151 et LS-152, le VPS n'étant pas acheté : sa part
scriptable et documentaire est faisable, l'enregistrement de la passkey sur le
domaine réel non. LS-173, la réintégration de stock après retour, est autonome.
