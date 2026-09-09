# 9 septembre 2026, d : LS-138, la chaîne de déploiement

Session ouverte sur LS-153, **reposée après lecture de ses liens de blocage**,
puis LS-138 sur arbitrage.

## LS-153 n'était pas réalisable, et le vérifier a pris cinq minutes

Le skill impose de vérifier les liens de blocage dans Jira. LS-153 en porte
trois, dont **deux ouverts** : LS-142, la recette, et LS-175, le compte
administrateur. Son premier critère est explicite, « cette story ne démarre pas
tant que ces conditions ne sont pas remplies ».

**Le blocage n'est pas technique.** LS-175 exige la présence physique de
l'exploitante, le `rpID` d'une passkey **étant** le domaine et son mot de passe
ne devant jamais transiter par le développeur. LS-142 exige qu'elle joue les
huit parcours avec ses propres produits, or LS-23 et LS-24 sont elles-mêmes à
faire.

Trois autres conditions de sa description manquaient, dont **le retour arrière
de LS-138 jamais joué**. C'est ce qui a désigné LS-138 : elle avance LS-153 sans
la contourner.

## Cinq critères sur sept étaient déjà remplis

Vérifiés avant d'écrire plutôt que supposés, la description datant du 27 août et
supposant que rien n'existe. La composition sans Redis, HTTPS et son
renouvellement, l'absence de secret dans l'image, le contrôle de santé : tout
cela venait de LS-151 et LS-152.

**Le critère 3 a été mesuré au passage et referme LS-96.** L'adresse IP du
journal des connexions vaut `135.136.31.58` en production, **identique à mon
adresse publique réelle**, donc bien celle du client et non `127.0.0.1`. La
ligne de mesure a été retirée ensuite, c'est une donnée personnelle.

## La clé ne peut exécuter qu'un script

Le compte `deploy` de la machine est dans le groupe `docker`, **ce qui équivaut
à root**, et les trois clés déjà présentes sont sans restriction, celle de la
chaîne de SmartPlanning comprise. Le dépôt est **public**.

Arbitrage de Christophe : clé restreinte. Un utilisateur `ls-deploy` dédié, dans
aucun groupe privilégié, une entrée `sudoers` sur le seul script, et
`authorized_keys` qui l'enferme par `command=` et `restrict`.

**Éprouvé plutôt qu'affirmé** :

```
whoami                          -> refuse, « n'est pas un identifiant »
$(id)                           -> refuse
docker stop smartplanning-app   -> refuse
<sha>; touch /tmp/pwn           -> refuse, aucun fichier cree
--etat                          -> rend l'etat reel de la production
```

SmartPlanning tournait toujours après ces essais. `visudo -c` a validé la règle
avant de l'installer : une erreur de syntaxe dans `sudoers` bloquerait `sudo`
**pour toute la machine**, donc pour l'exploitation de l'autre projet.

## Trois défauts de ma propre conception, trouvés en mesurant

**L'image ne contient pas `prisma/migrations`.** La sortie `standalone` de
Next.js n'embarque que `server.js`, `node_modules`, `public` et `src`. Mon
contrôle du schéma aurait comparé **0 à N** et n'aurait jamais rien détecté :
un garde-fou muet, pire qu'absent puisqu'il aurait rassuré. Le nombre attendu
vient désormais du workflow, qui le lit dans le dépôt, et le contrôle **dit**
quand il n'a pas vérifié.

**La sauvegarde garde quatorze jeux et sa rotation les consomme.** Rejouer un
déploiement quatorze fois, ce qui est **le premier réflexe devant un doute**,
aurait effacé quatorze jours d'historique de sauvegarde. Une sauvegarde de moins
de quinze minutes est réutilisée, et le journal le dit quand c'est le cas.

**`sudo` remet l'environnement à zéro** par `env_reset`, donc
`SSH_ORIGINAL_COMMAND` n'arrivait jamais au script. Une passerelle la transmet
en argument, où elle est validée motif par motif.

## Le critère 5 a trouvé deux défauts que rien d'autre n'aurait vus

C'est la démonstration de ce que « joué réellement » vaut contre « documenté ».

**Le séparateur `--` manquait.** `ssh` lisait `--retour-arriere` comme une
option à lui et rendait « unknown option », code 255. **Le piège ne se voit pas
sur un déploiement normal**, dont l'argument est un SHA sans tiret initial :
seul le chemin de retour arrière le rencontre.

**Le message d'erreur nommait la mauvaise cause.** Avec une seule ligne
d'historique, `tail -2 | head -1` rend la **dernière**, donc l'image en service,
et le script annonçait « l'image précédente est celle en service » quand la
vraie cause était l'absence d'avant-dernière ligne. Un message qui désigne la
mauvaise cause fait chercher au mauvais endroit.

L'historique ne portait qu'une ligne parce que la version antérieure avait été
posée **à la main** pendant LS-152, avant que l'historique existe.

## Les preuves

**Critère 4**, déploiement complet depuis `main` sans intervention manuelle :

```
07:22:05  Deploiement de ca39b9e, image en service 2c1cd23
07:22:05  Etape 1, sauvegarde faite
07:22:08  Etape 2, image recuperee
07:22:09  Etape 4, composition identique au depot
07:22:20  Etape 5, conteneur sain
07:22:22  Etape 6, verification par le domaine public
07:22:23  Deploiement termine
          Port 3002 injoignable depuis l'exterieur, conforme
          les trois sites rendent 200
```

**Critère 5**, retour arrière joué réellement :

```
07:40:07  RETOUR ARRIERE vers 2c1cd23, en service ca39b9e
07:40:20  conteneur sain apres 10 s, /api/sante rend 200
07:40:21  smartplanning.fr et analytics.smartplanning.fr rendent 200
07:40:21  Deploiement termine, ca39b9e -> 2c1cd23
```

Cohérence mesurée après coup : témoin en base **intact avec son horodatage
d'origine**, 38 tables, 14 migrations, et les limites de ressources toujours
appliquées après recréation du conteneur, moment exact où elles auraient pu
disparaître sans bruit.

**Le chemin d'abandon** : un SHA inexistant s'arrête à l'étape 2, production
identique avant et après. La réutilisation de sauvegarde s'y vérifie au
passage, « sauvegarde de 38 s réutilisée, la rotation n'est pas consommée ».

## Deux fausses alertes, vérifiées avant de conclure

Les sauvegardes semblaient **absentes** : mon glob s'évaluait dans un shell sans
droit de lecture sur le répertoire en 0700. Il y en avait trois.

`smartplanning-app` avait **redémarré** : à 07h28, six minutes après la fin de
mon déploiement, avec `RestartCount: 0` et une sortie propre. Une autre session
travaillait sur ce projet au même moment.

Dans les deux cas, conclure sans vérifier aurait produit un faux constat.

## État des tickets

**LS-138 est livrée**, ses sept critères prouvés. Elle débloque LS-139, LS-140
et LS-142.

**LS-96 peut fermer** : son objet, l'IP non nulle en production, est mesuré.

**LS-153 reste bloquée** par LS-142 et LS-175, toutes deux sur la présence de
l'exploitante. Le constat est tracé dans son ticket pour que la prochaine
session ne refasse pas la vérification.

## Prochaine étape

**LS-139**, le durcissement, qui porte aussi l'alerte de seuil sur l'espace
disque signalée ce matin. Ou **LS-142**, la recette, quand l'exploitante sera
disponible.

Un point de calendrier : la fenêtre pour éprouver un retour arrière sans risque
**se referme à LS-153**. Aucune clé Stripe n'étant posée, aucune commande réelle
ne pouvait être perdue aujourd'hui. C'est fait.
