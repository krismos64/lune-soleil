# 9 septembre 2026, g : la suite de bout en bout ne tournait dans aucune chaîne

Suite directe de l'audit de la session f, sur arbitrage de Christophe. Ticket
**LS-209** créé pour ce travail, rattaché à l'epic LS-7.

## Le constat de départ

Le contrôle nocturne échouait depuis le 8 septembre sur `Process from
config.webServer was not able to start`. Et c'est le **seul** workflow qui
exécute la suite : le contrôle 9x de `controles.yml`, livré par LS-189, est
purement **textuel** et ne lance rien.

Les huit parcours critiques du projet n'étaient donc rejoués par personne.

**LS-189 annonçait ce cas couvert.** Son critère 4 dit « le cas de l'intégration
continue reste couvert : FAIT », et le raisonnement portait sur le mauvais
workflow. Motif « un défaut absent n'est pas un défaut empêché », déjà en fiche.

## Trois manques qui se masquaient l'un l'autre

C'est la leçon de la session, et elle vaut au-delà de ce ticket.

1. `preparer-base-e2e.sh` **exigeait** `.env`, fichier que la chaîne ne crée
   jamais, le dépôt étant public, invariant 9. Il échouait avant tout.
2. Le démarrage passait par `docker compose`, qui interpole `POSTGRES_USER` et
   deux autres variables depuis ce même `.env` et échoue sans lui, mesuré.
3. `playwright.config.ts` lisait `DATABASE_URL_E2E` dans le **seul fichier** :
   sans lui, la clé était omise du bloc `env` et la suite héritait de
   `DATABASE_URL`, c'est-à-dire de la base 55432.

**Le troisième est le plus instructif.** C'est exactement le défaut que LS-189
ferme, rouvert par le seul fait de tourner en intégration continue. Il ne se
voyait pas parce que le premier l'empêchait de s'exprimer : corriger l'un sans
l'autre aurait produit un **vert trompeur**, la CI partant d'une base vierge où
l'isolement ne se distingue pas.

Il ne se serait manifesté que le jour où la CI porterait une base persistante,
et ce jour-là personne n'aurait cherché dans un fichier de configuration
Playwright.

## Deux voies, jamais un drapeau

`docker compose` en local, `docker run` sans `.env`. Le second est le **jumeau**
de ce que le nocturne fait déjà pour la base 55432, au port et au nom près.

La distinction se fait sur la **présence des variables** et non sur un drapeau
`CI`, qui se pose et s'oublie : ce qui compte est de savoir où lire, pas dans
quel décor on tourne.

Le nocturne pose désormais `POSTGRES_USER`, `POSTGRES_PASSWORD` et
`POSTGRES_DB`. Les variables `PG*` déjà présentes gouvernent le **client**,
`psql` et `pg_isready` ; ce sont les `POSTGRES_*` qui gouvernent le **serveur**
au premier démarrage. Les omettre aurait posé une base aux valeurs par défaut,
et la connexion aurait échoué ensuite sans dire pourquoi.

## La garde de LS-189 ne se relâche pas

C'était le risque principal de cette correction : ouvrir une porte en fermant
l'autre. Prouvé dans les **deux modes** plutôt qu'affirmé, deux URL de même port
sont refusées avec ou sans fichier.

Le message nomme désormais la **source réellement lue**, `.env` ou
l'environnement. Il disait « dans `.env` » même quand la valeur venait de
l'environnement : un message qui désigne la mauvaise source fait corriger au
mauvais endroit, piège rencontré en LS-138.

## Mon propre contrôle était aveugle, et sa mutation l'a montré

Le plus intéressant de la session.

`verifier-base-e2e.sh` gagne un **sens 1 bis** : la valeur surchargée doit se
lire aussi dans l'environnement. Le sens 1 seul restait vert sur un isolement qui
ne tient pas en CI, la surcharge étant bien écrite pendant que la valeur venait
d'un fichier absent.

À sa première écriture, ce sens cherchait `process.env.DATABASE_URL_E2E`
**n'importe où** dans le fichier. Or un commentaire de la ligne 30 le porte :
« PAS `process.env.DATABASE_URL_E2E` : ce fichier de configuration est
évalué... ». Le contrôle restait donc vert sur un code d'où la lecture avait
disparu.

C'est le motif « contrôle satisfait par un commentaire », **que le sens 1
documente deux blocs plus haut** et que j'ai reproduit en l'ayant sous les yeux.
Seule la mutation l'a vu. L'ancrage porte désormais sur la forme exécutable, le
repli `||`, et les lignes de commentaire sont exclues explicitement.

## Preuves

```
mode local, avec .env        -> 36 tables, 33 CHECK, index E1 present
mode CI simule, sans .env    -> 36 tables, 33 CHECK, index E1 present
environnement exact du nocturne, sans .env -> sortie 0

mutation, meme port, mode local -> refuse, message « dans .env »
mutation, meme port, mode CI    -> refuse, message « dans l'environnement »

./scripts/verifier-base-e2e.sh            -> 4 sens verts
./scripts/verifier-base-e2e-mutation.sh   -> 5 mutations detectees sur 5
npx playwright test --project=mobile-320  -> 404 passed (52.7s)
```

`type-check`, `lint`, `format:check`, `verifier-config-claude.sh`,
`verifier-regles.sh` et `verifier-fixtures-e2e.sh` verts.

## Un piège rencontré en écrivant

Un conteneur posé par `docker run` **bloque** `docker compose up`, le nom étant
pris, et Docker ne le dit pas : « n'a pas démarré », sans plus. Le cas arrive dès
qu'on a joué le mode CI sur la même machine. Détecté par l'absence d'étiquette
Compose et retiré, prouvé en recréant la collision.

## Ce que les exécutions réelles ont trouvé, et que la simulation ne pouvait pas voir

Trois lancements du nocturne ont été nécessaires. Chacun a trouvé un défaut de
plus, et aucun n'était visible depuis ma machine.

**Lancement 1, échec en 1 seconde sans une ligne de cause.** `webServer` avale la
sortie de sa commande. La préparation est donc devenue une **étape propre** du
workflow, ce qui rend son journal lisible et distingue une panne de préparation
d'une panne de serveur.

**Lancement 2, la garde comparait la variable à elle-même.** Playwright
**surcharge** `DATABASE_URL` avec la valeur e2e pour toute la commande du
`webServer`, ce script compris : lire `process.env.DATABASE_URL` comparait la
variable à elle-même, verdict « IDENTIQUES », préparation refusée.

C'est le défaut que LS-189 avait fermé en s'ancrant sur `.env`, rouvert par mon
repli sur l'environnement. La garde s'appuie désormais sur `PGPORT`, que
Playwright ne touche jamais.

**Ma simulation posait `DATABASE_URL` sur 55432**, comme le workflow. Playwright
la réécrit à 55433 pour le sous-processus. Reproduire l'environnement du **job**
ne suffisait pas, il fallait celui du **sous-processus**.

**Lancement 3, la suite tourne et trouve un test périmé.** 1503 passés, 4
échoués, les quatre étant le même test sur quatre largeurs : il exigeait
**4,99 €** quand ADR-035 porte le domicile à **7,49 €** depuis le 6 septembre. Le
code était juste, la page affiche le bon tarif. Trois jours entre la décision et
le test qui la contredit, sans un signal, faute de chaîne qui l'exécute.

## Une correction faite puis défaite, et c'est la leçon la plus utile

Ma première correction de ce test **dérivait les tarifs de** `process.env`. Plus
propre en apparence, elle **ne gardait plus rien** : le test lisait la même
variable que la page, les deux bougeaient ensemble.

Mesuré plutôt que supposé : la mutation `const domicile = "499"` dans
`livraison.ts` laissait les **18 tests verts**. Motif « garde-fou comparé à
lui-même », déjà en fiche.

L'assertion est ancrée sur ADR-035, décision commerciale et non valeur
dérivable. La même mutation fait désormais rougir **1 test sur 18**, et lui seul.

**Un second piège s'est glissé là** : le commit poussé portait encore la version
faible, `gh pr create` l'a signalé par « 1 uncommitted change ». Le nocturne vert
tournait donc sur l'assertion qui ne garde rien. Corrigé et rejoué.

## Le résultat, mesuré sur la machine de GitHub

```
18 success  Preparer la base de bout en bout, port 55433
              tables 36, contraintes CHECK 33 sur 33, index E1 present
19 success  Scenarios critiques de bout en bout, trois largeurs
              1507 passed (11.5m)
21 success  Construction de l'image Docker
22 success  Controles de securite de l'image
23 failure  Audit des dependances   <- 3 vulnerabilites vitest, LS-210
```

La suite passait de **1 seconde d'échec** à **11,5 minutes de tests réels**.

## Le rouge qui reste est un progrès

`npm audit` échoue sur 3 vulnérabilités vitest, en dépendance de
**développement**, jamais expédiées. Cinq voies essayées pour les fermer, toutes
en échec sur le même bug de npm 10.9.8, `Cannot read properties of null
(edgesOut)`. **LS-210** ouverte plutôt que de dégrader la configuration pour
forcer un vert.

Cette étape sortait `skipped` avant, et ce silence avait laissé passer sept
vulnérabilités dont une RCE critique atteignable en production. Un rouge honnête
vaut mieux qu'un vert muet.

**Le risque à surveiller est l'accoutumance** : un contrôle qui échoue tous les
jours pour une raison connue finit par ne plus être lu. C'est le critère 3 de
LS-210.

## État des tickets

**LS-209 livrée et close**, epic LS-7, PR #331 et #332 fusionnées. Sa preuve
n'est pas une simulation : trois exécutions réelles du nocturne, la dernière
rendant 1507 tests verts.

**LS-210 créée**, epic LS-7 : les trois vulnérabilités vitest bloquées par le
bug de npm. Elle porte aussi le risque d'accoutumance au rouge.

LS-189 n'est pas rouverte : son critère 4 était mal évalué, et le commentaire de
LS-209 le dit sans réécrire l'histoire.

**L'issue #302 peut fermer** : son objet, l'échec des scénarios de bout en bout,
est corrigé et prouvé. Le rouge restant du nocturne a sa propre story.

## Prochaine étape

**LS-139**, le durcissement, inchangé depuis la session d. La question de la
session g est réglée : la suite tourne réellement en intégration continue, et
c'est mesuré sur la machine de GitHub plutôt que simulé ici.

**LS-210** avant ou après, selon que npm publie un correctif : tant qu'elle est
ouverte, le nocturne reste rouge pour une raison connue.
