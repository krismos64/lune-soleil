# 9 septembre 2026, b : les quatre défauts trouvés en posant la production

Session d'enchaînement sur consigne : traiter LS-205, LS-206, LS-207 et LS-208
dans l'ordre le plus logique, et **corriger toute anomalie rencontrée sans créer
de ticket**.

Ordre retenu, du fondation vers le dépendant : **LS-208** (l'outil de migration,
qui servira aux suivantes), **LS-206** (les tâches jamais déclenchées),
**LS-207** (le plafond de transport), **LS-205** (l'arbitrage).

## Ce qui les réunit

Les quatre venaient de LS-152, et **aucun n'était visible depuis le dépôt**. Il a
fallu poser une production réelle pour qu'ils apparaissent, ce qui est le motif
de la journée : un contrôle ne voit que ce qu'il a été écrit pour voir, et
personne n'avait écrit celui qui manquait.

## LS-208, les garde-fous se trompaient de cible

**Le garde-fou 1 annonçait « MIGRATION DESTRUCTIVE DETECTEE » sur des
commentaires.** L'en-tête de la migration Better Auth explique quels `DROP INDEX`
ont été **écartés**, et le motif cherchait du texte sans savoir lire du SQL.
Mesure sur le fichier réel : **3 faux positifs avant, 0 après**.

Le coût n'était pas l'agacement. Un faux positif impose `--confirm-destructive`
sur une migration entièrement additive, donc il **apprend à passer outre**. Un
garde-fou contourné par habitude ne protège plus rien, exactement le défaut que
LS-42 avait corrigé dans l'autre sens.

Le sens retenu est écrit dans le script : ce qui suit `--` ne s'exécute pas, donc
n'est pas destructif. Ce qui **précède** le `--` sur la même ligne est préservé,
et le cas du `--` dans un littéral de chaîne est documenté **comme non traité**
plutôt que tu.

**Le garde-fou 2 rendait la première migration impossible.** Un dump de base vide
fait 887 octets pour un seuil de 1024 : il fallait des données pour migrer et
migrer pour en avoir. Le seuil tombe à 256 sur une base vierge, état que le
script détectait déjà, et se resserre seul dès la deuxième migration.

**Six cas de mutation ajoutés, écrits avant la correction et rouges à ce
moment.** La doublure `pg_dump` devient pilotable en taille : écrivant toujours
4096 octets, elle n'exerçait jamais le seuil, et **c'est précisément ce qui avait
laissé passer le second défaut**.

## LS-206, deux tâches sur cinq ne tournaient pas

Le service déclarait cinq tâches, le crontab en planifiait trois.
`envoi-emails` et `purge-quarantaine-medias` avaient leur service, leur verrou et
leur route interne : **tout fonctionnait, rien ne les appelait**.

La cause est une liste tenue à la main. L'en-tête du crontab parlait encore de
« cinq minutes » et « un quart d'heure » : il datait de LS-72, avant que LS-82 et
LS-102 n'ajoutent deux tâches sans que ce fichier suive.

`verifier-taches-planifiees.sh` confronte les deux fichiers **dans les deux
sens**, et abandonne en code 2 si son ancrage ne trouve rien plutôt que de
comparer deux listes vides et de les déclarer concordantes.

**La preuve est allée jusqu'à la production**, image cron reconstruite : les cinq
lignes sont dans le conteneur, et `liberation-reservations` comme
`purge-quarantaine-medias` rendent `EXECUTEE`.

`envoi-emails` rend `ConfigurationEmailIncompleteError`, et **ce n'est pas un
défaut** : les clés SMTP relèvent de LS-153, et le code distingue déjà une
configuration absente d'une panne pour ne pas retenter en boucle. Mesure du
journal avant de conclure : 328 o/min pour un plafond de 30 Mo avec rotation,
donc rien à faire.

## LS-207, Nginx refusait ce que l'application acceptait

`client_max_body_size` valait 12M quand le service accepte 25 Mo. Une
photographie de 17 Mo, cas éprouvé par ADR-007, recevait un **413 avant que la
Server Action ne s'exécute** : le message « 25 Mo au maximum » ne s'affichait
jamais et l'écran restait sur sa progression.

**C'est le défaut que `next.config.ts` décrit et a corrigé à son niveau**,
reproduit un cran plus haut. Son commentaire désigne même cette directive comme
la borne de production, sans que rien ne vérifie qu'elle suivait : les trois
valeurs vivent dans trois fichiers sans lien, **et dans trois unités
différentes**, un produit en octets, une chaîne `26mb`, une directive `26M`.

Preuve depuis l'extérieur, après `nginx -t` puis `reload` :

```
17 Mo   -> 405   traverse Nginx, atteint l'application
25,5 Mo -> 405   la zone exacte du defaut, traversee aussi
30 Mo   -> 413   la borne tient
```

Dix cas de mutation, dont **le seul qui compte vraiment** : l'état réel d'avant
la correction, `12M`, doit être refusé.

## LS-205, l'arbitrage, et un contrôle qui se resserre

ADR-007 décide que Nginx sert `/medias/` et **écarte nommément** un gestionnaire
de route Next. `verifier-nginx.sh` interdisait toute directive `alias` ou `root`
depuis LS-132. La contradiction naissait de l'ordre des décisions, ADR-007
supposant Nginx capable de servir des fichiers, ce que LS-132 a interdit après
lui : **ni l'un ni l'autre n'avait tort**.

Arbitrage de Christophe, voie 1 : **c'est le chemin qui porte le risque, pas la
directive.** Le contrôle exige désormais une valeur au lieu de refuser une forme.

**Ce n'est pas une exemption mais un resserrement**, et les mutations le
prouvent : la racine du volume qui publierait la quarantaine et ses données EXIF,
le parent commun qui atteint aussi les documents comptables, la quarantaine visée
directement, un `root` plutôt qu'un `alias` — tout ce qui était refusé l'est
toujours. **Douze mutations, douze détectées.**

Un sens neuf est ajouté : **l'alias attendu doit être présent**. Sans lui, le
contrôle serait satisfait par un fichier où personne ne sert les médias, soit
exactement l'état qui a produit ce ticket.

Preuve depuis l'extérieur :

```
/medias/essai/640.avif                    200   image/avif
/medias/../quarantaine/secret.jpg         404
/medias/..%2fquarantaine%2fsecret.jpg     404
/medias/quarantaine/secret.jpg            404
/documents/facture-essai.pdf              404
/medias/../../documents/facture-essai.pdf 404
/medias/..%2f..%2fdocuments%2f...         400
/medias/  et  /medias/essai/              404   aucune indexation
```

## Trois anomalies corrigées sur place, sans ticket

**Un `Cache-Control` en double.** `expires 1y;` et un `add_header` posaient deux
en-têtes du même nom, mesurés sur la production : les navigateurs retiennent le
premier, donc `immutable` était ignoré. Trouvé en relisant **les en-têtes
réellement servis** plutôt que la configuration.

**Une mutation qui ne mutait pas.** Le cas sur le fuseau employait
`sed 's/\bUTC\b/'`, et le `sed` de BSD ignore `\b` : la substitution ne
remplaçait rien, et **le contrôle était accusé à tort d'être aveugle**. C'est la
forme la plus coûteuse de fausse preuve. Le harnais vérifie désormais qu'une
mutation modifie réellement un fichier avant de juger le contrôle.

**Une référence fausse dans LS-208**, qui citait `tests/migrate-production-mutation.sh`
quand le fichier est `scripts/verifier-migration-mutation.sh`.

## Ce que la session confirme

Un contrôle se prouve sur **l'état qui a réellement existé**, pas sur une forme
commode à fabriquer. Les six cas de LS-208 et le premier cas de LS-207 rejouent
le dépôt d'avant correction, et c'est ce qui distingue une preuve d'une
illustration.

Et **une mesure se relit avant d'être crue** : le `Cache-Control` en double ne
se voyait que sur la réponse HTTP, jamais dans le fichier.

## Preuves

```
verifier-taches-planifiees.sh            5 declarees, 5 planifiees
verifier-taches-planifiees-mutation.sh   9 cas, tous conformes
verifier-plafonds-corps.sh               25 / 26 / 26 Mo
verifier-plafonds-corps-mutation.sh      10 cas, tous conformes
verifier-migration-mutation.sh           16 cas, tous conformes
verifier-nginx.sh                        seul medias/public/ est servi
verifier-nginx-mutation.sh               12 mutations, 12 detectees
verifier-regles.sh                       regles conformes au schema
verifier-propagation-docs.sh             socle Zod et son document accordes
verifier-registre-traitements.sh         registre coherent
verifier-tests-non-ignores.sh            aucun test desactive
verifier-config-claude.sh --strict       configuration coherente
npm run type-check                       aucune erreur
npm run lint                             aucune erreur
npm run format:check                     All matched files use Prettier code style!
vitest tests/unitaire                    517 tests passed
les trois sites                          200 tout au long
```

## État des tickets

**LS-205, LS-206, LS-207 et LS-208 sont livrées.** Les trois premières
débloquent LS-153.

**LS-152 peut maintenant fermer** : elle restait ouverte parce que la production
n'était pas exploitable, et les trois défauts qui la bloquaient sont fermés.

## Prochaine étape

**LS-153**, la première mise en ligne : les clés Stripe et SMTP à poser, l'ordre
des opérations et le point de non-retour. C'est le dernier verrou technique avant
l'ouverture, les autres blocages relevant de l'exploitante et du compte Sendcloud.
