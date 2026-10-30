# Intégration continue

Déplacé du `README.md` le 30 octobre 2026, LS-302. Les contrôles rejoués ici
sont décrits dans `docs/VERIFICATION.md`.

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

Le contrôle nocturne fait **ouvrir une issue** par `veilleur-nocturne.yml`, en
cas d'échec **comme d'annulation**, plutôt que de rougir dans un onglet que
personne ne consulte. Il **ne bloque aucune fusion** : son rouge signifie « un
défaut est entré hier », pas « ne pas fusionner ».

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
et valait **10 sur 41** le 11 septembre 2026, contre 9 sur 36 deux jours plus tôt : le relever plutôt que le lire. Le prototype d'interblocage documente un défaut ouvert, LS-50 : le
brancher rendrait la chaîne rouge en permanence. `verifier-jira.sh` exige des
identifiants que la CI n'a pas, le dépôt étant public. `controle-fumee.sh` et
`preparer-base-locale.sh` visent un service qui tourne, pas un dépôt.

La chaîne démarre son propre conteneur `lune-soleil-db` par `docker run`, sans
passer par `docker-compose.yml` qui exige un `.env` absent en intégration
continue. Le nom est celui qu'attend le mode `--base-migree`.

**Six autres workflows** accompagnent `controles.yml`, tous séparés pour la
même raison : un rouge qui signifie parfois « ne pas fusionner » et parfois « à
relire » est un rouge que l'on apprend à ignorer. Le compte se mesure,
`ls .github/workflows/*.yml | wc -l` moins celui-ci.

`derive-documentation.yml` rejoue `verifier-config-claude.sh` et
`verifier-protection-branche.sh` **chaque lundi matin**, et ouvre une issue
étiquetée `derive-documentation` si la documentation ne décrit plus le dépôt ou si
un réglage de protection a changé. Il porte `administration: read`, portée que
`controles.yml` n'a pas et ne doit pas avoir.

`nocturne.yml` rejoue **chaque nuit** ce que LS-177 a sorti des pull requests.

`veilleur-nocturne.yml` ouvre l'issue étiquetée `controle-nocturne` quand celui-ci
n'aboutit pas. **Il est séparé parce qu'une étape interne ne peut pas signaler un
dépassement du plafond de son propre job**, LS-235 : le runner s'arrête et toutes
les étapes restantes sont sautées, `always()` compris. Le nocturne a été annulé
trois nuits sans un mot avant que ce workflow n'existe. Déclenché par
`workflow_run`, il tourne dans son propre job et lit `conclusion`, `cancelled`
compris.

`publier-image.yml` construit, vérifie et publie l'image sur `main` après chaque
fusion.

`deployer.yml` bascule la production vers une image déjà publiée, ou revient à la
précédente, LS-138. **Il ne se déclenche qu'à la main** : les migrations tournent
depuis le dépôt, le garde-fou destructif exige une lecture humaine du SQL, et
chaque déploiement recrée des conteneurs sur une machine que partage un produit
payant. Il n'envoie qu'un identifiant de commit validé à une clé SSH **enfermée**
qui ne peut exécuter que `deploiement/deployer.sh`.

`ecart-production.yml` compare **chaque nuit** le commit servi en production à
`main`, et signale un écart qui porte une migration. Il tourne à 3 h UTC, après
le nocturne.

Tous se déclenchent aussi à la main depuis l'onglet Actions, sauf
`veilleur-nocturne.yml` : `workflow_run` est son seul déclencheur, il n'a de sens
qu'à la suite d'un nocturne.

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

`verifier-tests-mutation.sh` casse **194 fois** au 7 octobre 2026 le comportement
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
