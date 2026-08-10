# 10 août 2026, soir, LS-74, l'image Docker de l'application

Troisième session de la journée, après LS-73 et LS-31. Première story conduite
avec l'agent `ls-conteneurisation`, créé deux heures plus tôt.

## Ce qui est fait

**LS-74 est terminée.** L'application est déployable : `Dockerfile`,
`.dockerignore`, `output: "standalone"` activé, un contrôle de sécurité de
l'image et sa preuve par mutation, deux workflows.

Les sept critères sont remplis et prouvés par exécution :

| Critère | Preuve |
|---|---|
| l'image se construit et l'application démarre dedans | conteneur lancé contre `postgres:18.4`, `/api/sante` à 200, `base: disponible` |
| utilisateur non privilégié | `uid=1000(node)`, lu dans la configuration de l'image |
| aucun fichier d'environnement dans l'image | dix couches ouvertes et inspectées, zéro trouvé |
| tag par identifiant de commit | `publier-image.yml`, `latest` publié mais jamais comme référence de retour arrière |
| contrôle de santé déclaré et fonctionnel | Docker rend `Up 12 seconds (healthy)` |
| pas de dépendances de compilation | 27 paquets dans l'image, 396 Mo dont 346 de base |
| construction en intégration continue | pas 7b et 7c de `controles.yml` |

## Ce que l'agent a trouvé et que je ne pouvais pas voir

**La construction échouait sur un clone neuf.** `public/` était vide, git ne
suit pas les dossiers vides, et le `COPY /app/public` rendait `not found`. Sur
mon poste le dossier existe, donc tout passait. L'agent a cloné le dépôt pour le
mesurer. Réparé par `public/.gitkeep`.

C'est le meilleur argument pour le pas 7b : sans construction en intégration
continue, ce défaut n'aurait été découvert qu'en phase 6.

## Le point de sécurité de la story

**`next build` recopie le `.env` du contexte dans `.next/standalone/.env`.**
Mesuré ici. L'étape finale copiant ce dossier en entier, le secret entrerait
dans l'image **sans qu'aucun `COPY . .` soit en cause** : mes `COPY` nommés
fichier par fichier n'y changent rien.

`.dockerignore` est donc la seule protection réelle, ce que le commentaire du
Dockerfile attribuait au mauvais mécanisme. Prouvé en retirant les deux lignes
d'exclusion et en reconstruisant : le vrai `.env` du poste se retrouve dans une
couche, et le contrôle l'attrape.

**Le contrôle ouvre les couches plutôt que de relire le Dockerfile.** La
différence est mesurée : une image qui copie un `.env` puis le supprime dans une
couche ultérieure le montre absent de son système de fichiers, `find /` ne rend
rien, et le fichier reste extractible par quiconque tire l'image. Sur un dépôt
public avec publication sur GHCR, c'est le seul contrôle qui protège
l'invariant 9.

## Trois contrôles verts pour la mauvaise raison

Trois fois dans cette session, un vert ne valait rien. Aucun n'aurait été vu sans
vérification délibérée.

**L'inspection des couches rendait « 0 couche lue » et un vert parfait.** Ma
première boucle cherchait le format `layer.tar` de l'ancien `docker save`, quand
Docker 28.3 produit un layout OCI. Le script échoue désormais quand aucune couche
n'a pu être ouverte, plutôt que de conclure.

**Le secret de construction était vide et la construction verte.** J'avais écrit
`openssl rand`, or `openssl` est **absent** de `node:22.23.2-slim`. La commande
rendait `openssl: not found`, donc une chaîne vide, `export` réussissait, et
`next build` se terminait en vert en signant avec la clé par défaut de Better
Auth. Visible seulement avec `--progress=plain`. Engendré par `node` désormais,
avec une garde sur la longueur qui rend l'échec fatal, prouvée par mutation.

**Une mutation n'avait muté personne.** Ma première tentative de prouver cette
garde employait une substitution Perl dont la cible n'existait pas : la
construction réussissait, ce qui accusait la garde à tort. Refaite en Python avec
une assertion sur le changement effectif, la construction sort alors en 1. Motif
déjà connu, `substitution-mal-formee`, rencontré une seconde fois.

## Le hook de secrets a bloqué deux commits, à juste titre

D'abord sur la chaîne `utilisateur:motdepasse@hote`, puis sur la valeur littérale
de `BETTER_AUTH_SECRET`. Les deux étaient des remplissages, mais l'analyse ne
peut pas les distinguer d'une vraie valeur et a raison de bloquer.

**Ni le hook ni la règle n'ont été affaiblis.** Ajouter le `Dockerfile` à la
liste d'exclusion de `.gitleaks.toml` l'aurait rendu aveugle le jour où un vrai
secret y passerait. La chaîne est écrite sans partie mot de passe, et le secret
est engendré à la construction, ce qui est de toute façon plus sûr qu'une
constante dans un dépôt public.

## Décision prise dans la session

**Deux workflows plutôt qu'un**, arbitrage de Christophe. `controles.yml` reste
en `contents: read` et construit l'image sans publier ; `publier-image.yml` porte
`packages: write` et ne s'exécute que sur `main` après fusion. Le droit
d'écriture sur le registre ne vit jamais sur une exécution déclenchée par une
pull request.

## Vérification

Sous Node 22.23.2 :

| Contrôle | Résultat |
|---|---|
| `type-check`, `lint`, `format:check` | verts |
| `npm run test` | 159 tests, 9 fichiers |
| `verifier-image-docker.sh` | 7 réussites, 0 échec |
| `verifier-image-docker-mutation.sh` | 9 mutations, 9 détectées |
| `verifier-config-claude.sh --strict` | cohérente |
| `controle-fumee.sh` contre le conteneur | code 0 |

## Prochaine étape

**LS-79**, limitation de débit sur les quatre routes sensibles, compteurs en
base. C'est le plus petit morceau d'ADR-027 et il prépare LS-80 et LS-81.

**Cinq stories restent dans LS-2** : LS-72, LS-75, LS-79, LS-80, LS-81. LS-75 se
traite en dernier, elle vérifie les autres.

Un point à trancher hors code avant LS-80 : la durée de conservation du journal
des connexions est une obligation et se vérifie aux sources, pas une décision
d'architecture.

## Signalement hors périmètre

L'agent a relevé une contradiction dans l'en-tête de `controles.yml` : il affirme
que `enforce_admins` vaut `false` et qu'un push direct « réussit quand même »,
quand `CLAUDE.md` et la mémoire disent l'inverse depuis le 31 juillet. Non
corrigé ici, hors périmètre de LS-74, mais un commentaire qui invite à un push
direct de secours sur une information périmée mérite d'être tranché. À vérifier
par `gh api repos/krismos64/lune-soleil/branches/main/protection`.
