# 8 août 2026, le domaine d'envoi est authentifié, et un doublon SPF qui n'aurait rien protégé

Session courte, sans code. Elle règle le seul point de LS-82 qui a un délai que
le développement ne contrôle pas : les enregistrements DNS d'authentification du
domaine. LS-29 le dit depuis le début, cette démarche doit être engagée tôt.

**Aucun fichier du dépôt n'a bougé.** Le travail vit dans l'espace client OVH et
dans le `.env` local. C'est précisément pourquoi il est tracé ici et dans deux
commentaires Jira : sans cela il n'existerait nulle part.

## Ce qui a été posé

Trois enregistrements sur `lune-soleil.fr`, chacun vérifié par `dig` après
propagation et non seulement saisi dans l'interface.

| Enregistrement | Valeur publiée |
|---|---|
| SPF | `v=spf1 include:mx.ovh.com ~all` |
| DKIM | deux sélecteurs, `ovhmo-selector-1` et `ovhmo-selector-2` |
| DMARC | `v=DMARC1; p=none; rua=mailto:contact@lune-soleil.fr; sp=none; aspf=r` |

DKIM était déjà en place, posé automatiquement par OVH à la création du MX Plan.
Sa vérification a porté sur la **clé publique réellement servie** au bout du
CNAME, une clé RSA 2048 bits. La présence des deux CNAME dans la zone ne prouvait
pas que la paire avait été générée : deux alias peuvent parfaitement pointer vers
rien.

## Le défaut de la session : deux enregistrements SPF

La zone en portait **deux, identiques**, sur la racine. L'un préexistant, posé
par OVH avec le MX Plan. L'autre venait d'être ajouté par l'assistant, qui n'a
rien signalé.

La RFC 7208 impose un `permerror` dès qu'un domaine publie plus d'un
enregistrement `v=spf1`. Les serveurs de réception ne choisissent pas le premier,
ne les fusionnent pas, ne prennent pas le plus récent : ils invalident la
politique entière.

Le fait que les deux lignes soient identiques n'y change rien. **Le défaut porte
sur le nombre, pas sur le contenu**, et c'est ce qui le rend facile à manquer :
relire la valeur de chaque ligne ne le trouve jamais, il faut les compter.

Sans la vérification, le résultat aurait été le motif que ce projet traque depuis
dix jours : les messages partent, la trace en base dit `ENVOYE`, et SPF ne protège
rien. Un garde-fou qui a cessé de garder sans changer de couleur.

## Ce que le DNS ne prouve pas, et la consigne qui en découle

Une configuration publiée n'est pas une configuration qui fonctionne. `dig`
prouve que les enregistrements existent et se résolvent. Il ne prouve pas qu'un
message arrive dans une boîte.

**DMARC reste en `p=none` jusqu'au test de réception** de LS-82, un email reçu
sur au moins deux fournisseurs. `p=none` est le mode observation, aucun message
n'est bloqué et les rapports agrégés arrivent sur `contact@lune-soleil.fr`.
Durcir en `quarantine` ou `reject` avant ce test ferait disparaître des messages
légitimes si une source d'envoi a échappé au SPF, **sans aucun signal**. Le `~all`
du SPF relève du même raisonnement.

Le durcissement se décide sur les rapports, jamais par anticipation.

## Le `.env` et la règle qui a tenu

Les six variables du bloc email portent une valeur en local. `SMTP_HOST` à
`ssl0.ovh.net`, port 587 en STARTTLS, authentification sur l'adresse complète.

Le hook de protection des secrets a bloqué la lecture du `.env` dans les deux
sens, y compris un `grep` qui masquait les valeurs. `Edit` exigeant une lecture
préalable et `Write` écrasant le fichier entier, l'ajout s'est fait **en fin de
fichier** par redirection, sans jamais ouvrir le contenu existant. Les deux
valeurs sensibles ont été saisies par Christophe, aucune n'est entrée dans
l'historique de session.

Contrôle après coup, par comptage et sans affichage : six variables déclarées une
fois, six renseignées. `.env` ignoré par `.gitignore` ligne 24, non suivi par git.

## État des tickets

| Ticket | Ce qui change |
|---|---|
| **LS-82** | critères 5 et 6 remplis, 7 l'était depuis le 4 août. Reste le code : nodemailer, la table de traçabilité, les critères 1 à 4 et 8. Toujours À faire |
| **LS-29** | volet technique fait, adresse d'expédition fixée. Les six textes F-MAIL et la validation du ton par l'exploitante restent dus |

Aucun autre ticket ne mentionne SPF, DKIM, DMARC ou DNS, vérifié par recherche
sur le projet.

## La CI a rougi sur une PR qui ne touchait que de la documentation

La PR du journal a échoué sur `npm audit` : **GHSA-2v37-7h3g-55p8**, une boucle
infinie de `nanoid` quand un générateur personnalisé reçoit une taille nulle.
Paru entre le dernier contrôle vert et cette PR, exactement comme `js-yaml` le
7 août. Une PR verte en local rougit en CI sans qu'une ligne du dépôt ait changé.

`nanoid@3.3.16` arrive par `next` puis `postcss`, lui-même déjà sous override.
La correction est un patch sur la même majeure, `postcss` attendant `^3.3.11` :
aucune majeure franchie chez le consommateur, le critère retenu le 30 juillet
après la casse d'ESLint par `brace-expansion`. **Septième override**, `README.md`
recompté, le contrôle de dérive ayant repéré l'écart.

**Deux pièges rencontrés en corrigeant**, tous deux étrangers à l'avis lui-même.

`npm install` a échoué sur `Cannot read properties of null (reading 'edgesOut')`,
une erreur interne opaque. La cause n'était ni l'override ni le cache : le shell
tournait sur **Node 23.9.0**, version impaire que `engines` refuse. C'est la
première ligne du `CLAUDE.md`, `nvm use` d'abord, et chaque appel repart d'un
shell neuf : la bascule doit être enchaînée dans la même commande, jamais posée
une fois pour toutes.

Supprimer `package-lock.json` pour forcer la résolution a fait bouger **79
paquets** pour un seul override nécessaire, toutes les transitives étant
réévaluées vers leurs dernières versions compatibles. Un diff hors sujet et non
relu sur une PR de journal. Repris depuis le lock de `main` avec
`npm install --package-lock-only` : **un seul paquet change**, quatre lignes de
diff.

## Prochaine étape

**LS-73**, journalisation structurée et contrôle de santé. C'est la
recommandation retenue en début de session, pour trois raisons : elle avance la
porte de sortie de la phase 1, elle ne dépend d'aucun accès externe, et **LS-74
en dépend** puisque l'image Docker a besoin du contrôle de santé.

LS-82 a été écartée comme prochaine story malgré son pouvoir de déblocage : elle
appartient à la phase 4, et LS-54 qu'elle débloque est elle-même bloquée par
LS-2, non terminée. Le déblocage ne sert à rien tant que la phase 1 est ouverte.

## Traçabilité

**PR #73**, fusionnée sur `main` en rebase, trois commits :

| SHA | Objet |
|---|---|
| `33db82f` | le journal de la session |
| `675dd14` | l'override `nanoid`, septième, et `README.md` recompté |
| `45fb629` | le déblocage tracé dans ce journal |

Commentaires Jira posés sur **LS-82** et **LS-29**. Deux fiches mémoire écrites,
citées ci-dessous.

## Découverte

[[lune-soleil-authentification-domaine-email]], qui porte les valeurs publiées,
le piège du doublon SPF et la consigne sur `p=none`.

[[lune-soleil-npm-node-impair-et-lock]], qui porte les deux pièges du déblocage :
`edgesOut` accuse une dépendance quand la cause est une version de Node impaire,
et supprimer le lock déborde largement l'override qu'on voulait poser.
