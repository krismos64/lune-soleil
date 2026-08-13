# 13 août 2026, la porte de sortie de la phase 1 et cinq stories

Session longue en autonomie complète, demandée par Christophe : enchaîner les six
stories ouvertes de LS-2 sans interruption, en clôturant la traçabilité sur les
quatre canaux à chaque fois.

## LS-94, les durées annoncées sont enfin appliquées

Trois durées de conservation étaient inscrites au registre des traitements et
**appliquées par personne**. `purgerJournalConnexion` existait depuis LS-80 sans
que rien ne l'appelle, `JournalAudit` et `RateLimit` n'avaient aucune purge.

`src/services/purge-journaux.ts` rassemble les trois dans une liste, sur le modèle
de `TACHES` et de `CHEMINS_SURVEILLES` : l'oubli d'une table se voit d'un coup
d'œil plutôt que de se diluer dans trois modules. La tâche `purge-journaux` tourne
une fois par jour à 03h17, sous le verrou de LS-72.

**Un échec sur une table n'empêche pas les autres**, critère 4 : chaque purge est
isolée dans son propre `try` et porte son échec dans le résultat. Sans cela, un
incident sur `JournalConnexion` laisserait `RateLimit` grossir indéfiniment, ce qui
est un incident silencieux.

### L'arbitrage rendu, vingt-quatre heures et non six mois

Le registre annonçait six mois pour `RateLimit`, « par alignement » sur la
délibération CNIL n° 2021-122. L'alignement ne tient pas à l'examen : cette
délibération vise la **journalisation**, une trace relue après incident, quand
`RateLimit` est un **compteur de travail** dont les fenêtres valent soixante
secondes. Better Auth réinitialise la ligne de lui-même à la tentative suivante.

Sa clé encodant une adresse IP, conserver six mois une donnée dont l'usage dure une
minute contredisait la minimisation, article 5.1.c. L'information de fond survit
dans `JournalConnexion`, conservé six mois.

### Un point que le ticket ne disait pas

**`RateLimit` n'a aucune colonne de date.** La table appartient à Better Auth et
porte un `lastRequest` en `BigInt` de millisecondes, `Date.now()` vérifié dans le
code installé. Une comparaison en secondes donnerait une limite antérieure à 1970 :
plus aucune ligne ne serait jamais supprimée, sans qu'aucune erreur n'apparaisse.

## LS-91, le ticket se trompait de solution

La description demandait de renseigner `trustedProxies` avec l'adresse par laquelle
Nginx atteint le conteneur. **Cette valeur n'entrerait jamais dans la décision.**

```js
const headers = "headers" in req ? req.headers : req;
```

`getIp` ne lit **que des en-têtes**, jamais le socket. Les entrées de
`trustedProxies` ne sont comparées qu'aux jetons présents *dans la chaîne
`X-Forwarded-For`* : l'adresse Docker n'y figure que si Nginx l'y écrit lui-même.

Cinq comportements mesurés dans le code installé, puis confirmés via Context7 :

```
un seul saut, sans proxy declare        -> adresse retenue
plusieurs sauts, sans proxy declare     -> null
avec proxies, parcours DROITE a GAUCHE  -> premier saut non fiable retenu
tous les sauts de confiance             -> null
un jeton non analysable dans la chaine  -> null
```

Le premier renverse la prémisse : **une chaîne à un seul saut se résout sans aucun
proxy de confiance.** La correction vit donc dans Nginx.

### Le point décisif, et il est contre-intuitif

`$remote_addr` **écrase** l'en-tête reçu ; `$proxy_add_x_forwarded_for`, la forme
répandue, le **concatène**. La concaténation ne permet pas de forger l'adresse
retenue, le parcours partant de la droite, mais le cinquième comportement la
condamne :

```
X-Forwarded-For: pasuneip, 203.0.113.7   ->  null
```

Un visiteur envoie un en-tête bidon et **choisit de ne pas être journalisé**, se
soustrayant au comptage par adresse d'ADR-027. C'est pire que le défaut d'origine,
qui n'était pas pilotable de l'extérieur.

La valeur juste de `BETTER_AUTH_TRUSTED_PROXIES` est donc la **liste vide**, et une
liste vide se démontre plutôt qu'elle ne se subit : un test mesure que la plage
large `172.16.0.0/12` fait rendre `null`, c'est-à-dire le défaut d'origine sous une
configuration qui a l'air d'avoir été faite.

Le critère 4 ne se vérifie qu'après déploiement réel. **LS-96 le porte**, épic LS-2,
lien Blocks depuis LS-91 dont le sens a été relu.

## LS-92, le trou n'était pas le plafond

`auth.api.verifyPassword` n'est soumis à aucune limitation : seul `auth.handler`,
avec une vraie `Request`, applique le `rateLimit`. Une Server Action appelée en
boucle testait donc des mots de passe sans plafond.

Mais trois choses bornaient déjà le devinage, et le ticket le disait : session
d'administratrice exigée depuis LS-89, mot de passe de seize caractères, et
`/sign-in/email` limité en amont. **Ce qui manquait vraiment, c'est la trace.**
`verifyPassword` ne croise aucun des chemins que le hook de LS-80 surveille : une
attaque par cette voie était invisible, y compris après coup.

Chaque tentative entre donc au journal des connexions, échec, réussite et refus de
cadence, avec le moyen `MOT_DE_PASSE` sans valeur d'enum nouvelle. Aucune migration.

Le compteur réutilise la table `RateLimit`, que LS-94 purge déjà. Sa clé est
préfixée `action:` pour rester disjointe de celles de Better Auth, `<ip>|<chemin>`,
et porte l'identifiant de **session** plutôt que l'adresse IP : l'appelant est déjà
authentifié, donc la session est toujours connue, quand l'adresse peut être nulle.

L'incrément tient en une instruction avec `ON CONFLICT DO UPDATE`, même principe
qu'ADR-006 : un `SELECT` puis `UPDATE` laisserait deux requêtes concurrentes
compter une seule tentative, défaut exploitable en lançant les tentatives en
parallèle.

**Point 3 du ticket tranché** : le module vaut pour toute Server Action qui vérifie
un secret, `ACTIONS_PROTEGEES` fermant la liste. Traiter le seul cas d'aujourd'hui
aurait garanti que le suivant reparte sans trace ni plafond.

## Quatre défauts trouvés, tous par des contrôles qui ont fait leur travail

**Mon test de frontière ne testait rien.** La mutation `lt` vers `lte` restait
verte : le test calculait la limite à la main par `setUTCMonth`, qui rend le 3 mars
quand `limiteDeConservation` rend le 28 février sur un 31 août. La ligne « pile à la
limite » était trois jours du mauvais côté, là où elle survit dans les deux cas.
C'est le débordement de quantième déjà trouvé en LS-80, réintroduit dans un test
censé le couvrir.

**Le README annonçait un compte périmé**, attrapé par la CI en mode `--strict`, que
je n'avais pas lancé localement.

**Le contrôle lui-même mentait.** Sa table `NOMBRES_EN_LETTRES` s'arrêtait à
« quarante » : devant « quarante-cinq fois », la recherche captait un « cinq »
situé ailleurs et annonçait « README.md annonce 5 mutations ». Un contrôle dont la
table est trop courte ne se tait pas, il ment.

**Et le même défaut s'est reproduit dans la journée**, à cinquante-deux cas :
« annonce 2 mutations ». Ma première correction s'était arrêtée à quarante-neuf,
soit quatre cas de marge, consommés en une session. La table monte maintenant
jusqu'à soixante-neuf, entrées engendrées plutôt qu'écrites à la main.

**Mon test de journalisation comptait mal.** Il attendait un refus après `max`
tentatives, alors que la réussite précédente avait remis le compteur à zéro : il en
fallait une de plus. Le code était juste.

## Une mutation restée sur le disque, encore

`src/repositories/limitation.ts` n'était pas encore suivi par git quand j'ai lancé
une mutation manuelle dessus. `git checkout` ne connaît pas un fichier non suivi :
la mutation est restée, et le compteur repartait à un à chaque tentative. Trouvée en
relisant le fichier avant commit.

C'est la règle déjà en mémoire depuis le 11 août, vérifiée une fois de plus :
**commiter avant de lancer une mutation**, et surtout pour un fichier neuf.

## LS-81 et LS-89, la dette réexaminée plutôt que reconduite

Sept critères attendent qu'une action sensible existe. Plutôt que de reconduire la
dette, j'ai cherché si le dépôt en portait déjà une sans le savoir.

**Une piste sérieuse, écartée après relecture critique.** L'écran du journal des
connexions, livré par LS-80, affiche cinquante lignes d'adresses email, d'adresses
IP et d'agents utilisateur de clients. La famille `DONNEES_CLIENTS` vise
« exporter ou consulter en masse les données clients ».

L'agent de relecture m'a contredit sur un point juste : **je tirais
l'interprétation vers le cas commode**. La finalité de T8 est la sécurité, pas le
fichier client qu'ADR-021 désigne, et « en masse » y serait étiré sur cinquante
lignes sans recherche ni export. Arbitrage de Christophe : **pas de classement**.
Élargir la définition d'une famille pour fermer sept critères déplacerait la règle
au lieu de la satisfaire.

**Mais il a trouvé mieux que mon raisonnement.** La ligne de dette était
simplement **fausse** : elle affirmait « aucun export ni consultation en masse »
depuis LS-81, et LS-80 l'a démentie sans que personne relise le fichier. Corrigée.

**Et une limite du contrôle, désormais écrite.** `verifier-actions-sensibles.sh`
prouve la cohérence entre marques et gardes, dans les deux sens. Il ne peut pas
dire qu'une marque **manque** : un écran sensible non marqué est invisible des
deux côtés, le contrôle reste vert et la liste continue d'affirmer qu'il n'y a
rien à protéger. Aucun script ne pose cette question à la place de quelqu'un.

## LS-75, la porte de sortie, et ce qu'un clone neuf révèle

Procédure du README exécutée de bout en bout depuis un clone dans un répertoire
vierge, avec destruction et restauration du volume Docker pour partir vraiment de
zéro. **Quatre écarts trouvés.**

**Le hook de secrets n'était pas dans le README.** Il vit dans `CONTRIBUTING.md`,
que personne ne lit pour démarrer. Mesuré : une fausse clé `sk_live_` commitée
**sans la moindre résistance** avant les deux commandes, refusée après. Sur un
dépôt public, un contributeur qui suit la procédure travaille sans protection et
ne le sait pas.

**Les variables réellement obligatoires n'étaient nulle part.** Quatre suffisent.
La ligne du secret surprend et elle est mesurée : `next build` **passe** sans
`BETTER_AUTH_SECRET`, seul `next start` lève. Un build vert ne prouve pas que le
service démarrera.

**Le garde-fou de `db:verifier` compte des lignes estimées**, `pg_stat_user_tables`
et non `count(*)`. Sur une base restaurée depuis une copie de volume, il a refusé
une base **vide** en annonçant sept lignes. `ANALYZE` remet le compte à zéro. Le
garde-fou reste juste dans son intention, l'estimation le rend seulement trop
prudent, jamais trop permissif.

**Un mot de passe divergent produit un 500 opaque.** `POSTGRES_PASSWORD` n'agit
qu'à l'initialisation du volume : trois tests e2e ont échoué sur un 500 sans corps
là où un identifiant faux rend 401, et la cause n'apparaissait que dans le journal
serveur, `P1000 AuthenticationFailed`. C'était un artefact de ma manipulation, pas
un défaut du dépôt : les 33 tests passent sur une base cohérente. L'enseignement
vaut quand même pour un contributeur, il est au README.

### Les quatre termes de la porte de sortie

| Terme | Preuve |
|---|---|
| Clone neuf lançable | 32 tables, 25 `CHECK` sur 25, application servie, `/api/sante` opérationnelle |
| Tests au vert en CI | 262 Vitest et 33 Playwright sur le clone, chaîne verte sur `main` |
| Second facteur | passkey ADR-021, réauthentification ADR-027, `/administration` en 307 |
| Application déployable | image construite depuis le clone, 7 contrôles au vert, aucun `.env` dans 10 couches |

**Déployable ne veut pas dire déployée**, le VPS reste en phase 6.

### L'estimation de LS-2 est retirée, pas corrigée

Elle valait 20 h puis 34 h. Aucune charge réelle n'a jamais été mesurée, le
périmètre a bougé sept fois par tickets tracés, de 11 à **24 stories**, et
`CLAUDE.md` pose le pilotage par portes de sortie. Un second chiffre théorique
n'aurait rien piloté. Ce qui la remplace : l'état des stories compté dans Jira, et
la porte ci-dessus.

## Traçabilité

| Story | Dépôt | Jira |
|---|---|---|
| LS-94 | PR #98 fusionnée | Terminé |
| LS-91 | PR #99 fusionnée | Terminé, LS-96 créée pour le critère de production |
| LS-92 | PR #100 fusionnée | Terminé |
| LS-81 et LS-89 | PR #101 fusionnée | **En cours**, dette réexaminée et tracée |
| LS-75 | PR en cours | à clore |

## Chiffres

De 240 à **262 tests**. De 40 à **52 cas de mutation**, tous détectés. Deux
nouveaux scripts de contrôle, `verifier-nginx.sh` et sa preuve par mutation, six
cas sur six. Seize scripts `verifier-*`, dont huit de mutation, plus trois scripts
d'exploitation.

**24 stories sur LS-2, 20 terminées.** Restent LS-75 en clôture, LS-96 qui relève
de la phase 6, et LS-81 et LS-89 dont la dette est assumée et tracée.

## Prochaine étape

**LS-95**, suppression de compte et réponse aux demandes d'accès et d'effacement,
articles 15 et 17. Elle fera naître la première action sensible réelle du dépôt,
ce qui débloquera les sept critères de LS-81 et LS-89.

C'est aussi la dernière des trois dettes du registre des traitements, les deux
autres étant levées : LS-94 aujourd'hui, LS-93 restant sur la durée des avis.
