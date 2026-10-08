# 8 octobre 2026 : LS-273, l'optimiseur d'images de Next figé par un visiteur pressé

Suite de `2026-10-08-b`. Christophe de retour : conseils demandés, puis feu
vert pour LS-273 et pour supprimer trois sauvegardes en clair.

## Sauvegardes en clair supprimées

Les trois jeux des 8, 9 et 10 septembre, antérieurs au chiffrement, sont
supprimés sur accord explicite de Christophe : six fichiers nommés un par un,
relus avant. `/var/backups/lune-soleil` ne porte plus que des jeux chiffrés.

## LS-273, la cause par la mesure

Le nocturne du matin a rendu 60 échecs sur `/administration/connexion` en
1280 px, motif identique à celui du 6. Le rapport Playwright de CI, en place
depuis la PR #528, porte les traces : **dans les 60, la même requête reste
inachevée**, `/_next/image?url=/habillage/univers-atelier.jpg&w=640`.

Défaut de Next 16.3.8 : `fetchInternalImage` donne à la réponse simulée la
socket du visiteur. Si celui-ci part pendant la première optimisation d'une
variante, `send` abandonne la lecture sans terminer la réponse, et
`ResponseCache` fait attendre derrière elle toutes les requêtes de la même
variante jusqu'au redémarrage.

Reproduit en local sur le build de production : 39 ms sans interruption, plus
de 15 s après une rafale de requêtes interrompues, une variante déjà en cache
restant servie en 3 ms. Next 16.4.0 corrige ce code, son commentaire décrit
le symptôme mot pour mot.

## La correction

Arbitrage de Christophe : correctif ciblé plutôt qu'une montée en 16.4.0,
publiée depuis deux jours avec de gros remaniements. Un script lancé par
`postinstall` reporte la construction corrigée, en CommonJS et en ESM, et
**échoue sur une forme inconnue** pour qu'une montée de Next le relise. Pas de
`patch-package` : une dépendance de plus dans un projet tenu à zéro alerte
d'audit. Le `Dockerfile` copie le script avant `npm ci`.

Preuves : test unitaire sur la vraie fonction avec une socket fermée, rouge sur
le code fautif et vert corrigé ; `npm ci` et `docker build --target deps`
appliquent le correctif ; reproduction après correctif en 7 à 16 ms. PR #566,
déployée, correctif constaté dans le conteneur. **Nocturne relancé à la main :
vert, 2607 passed, 0 failed, 19,4 min contre 51,7 le matin.** Issue #565
fermée.

## Ce que cela touchait en production

Le même défaut : le cache d'images repart à vide à chaque déploiement, et un
visiteur pressé pouvait figer une image de décor pour tout le monde. Les photos
de bijoux, servies par Nginx sur `/medias`, n'étaient pas concernées.

## État des tickets

LS-273 close. 266 terminés sur 279 hors epics, 13 ouverts (5 en cours,
8 à faire), relevés dans Jira. Tout ce qui reste attend l'exploitante, une
démarche externe, l'ouverture commerciale, ou le 17 octobre pour LS-258.
