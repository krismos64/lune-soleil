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

## État des tickets

**LS-209 créée et livrée**, epic LS-7. LS-189 n'est pas rouverte : son critère 4
était mal évalué, et le commentaire de LS-209 le dit sans réécrire l'histoire.

L'issue #302 du nocturne reste ouverte jusqu'à ce qu'une exécution réelle passe :
la correction se vérifie sur la machine de GitHub, pas sur la mienne.

## Prochaine étape

**LS-139**, le durcissement, inchangé depuis la session d. Le nocturne dira dès
demain matin si la suite tourne réellement en intégration continue ; c'est la
seule preuve qui vaille, celle d'ici étant une simulation.
