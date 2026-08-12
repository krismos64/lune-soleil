# 13 août 2026, LS-94, LS-91 et LS-92, ce que les journaux gardent et ce qu'ils voient

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

## Traçabilité

| Story | Dépôt | Jira |
|---|---|---|
| LS-94 | PR #98 fusionnée, trois commits | Terminé, commentaire critère par critère |
| LS-91 | PR #99 fusionnée, deux commits | Terminé, LS-96 créée pour le critère de production |
| LS-92 | en cours de fusion | à clore |

## Chiffres

De 240 à **262 tests**. De 40 à **52 cas de mutation**, tous détectés. Deux
nouveaux scripts de contrôle, `verifier-nginx.sh` et sa preuve par mutation, six
cas sur six. Seize scripts `verifier-*`, dont huit de mutation, plus trois scripts d'exploitation.

## Prochaine étape

**Trois stories restent ouvertes sur LS-2** : LS-75, LS-81 et LS-89. Les deux
dernières sont bloquées sur la même chose depuis le 11 août, l'absence d'action
sensible réelle dans le dépôt : leurs critères 3, 4, 6, 7 et 2, 3, 6 attendent
qu'une action à garder existe.

LS-95, suppression de compte, ferait naître cette première action. Elle n'est pas
dans le périmètre de cette session mais reste le débloqueur naturel.

LS-75 vient en dernier, elle vérifie les autres.
