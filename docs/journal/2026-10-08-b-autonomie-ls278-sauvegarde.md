# 8 octobre 2026 : session autonome, LS-278, un incident de sauvegarde et cinq tickets clos

Suite de `2026-10-08-a`. Christophe absent, consigne : déployer, faire LS-278
avec une confirmation renforcée (taper le nombre de pièces), redéployer, puis
le maximum de tickets en autonomie, sans créer de ticket, les anomalies
corrigées et documentées.

## Incident : la sauvegarde nocturne n'a pas eu lieu

Le premier déploiement du matin s'est arrêté à son étape 1, « la sauvegarde a
échoué », production intacte. Cause : `sauvegarder-base.sh` chargeait
`/etc/lune-soleil/production.env` par `source`, et l'identité légale, entrée la
veille au soir, contient une valeur à espace non citée. Docker la lit ligne
entière ; bash a pris le second mot pour une commande, code 127. **La
sauvegarde de 02:31 UTC n'a pas été faite.**

Corrigé dans LS-107 (PR #558) : le script lit ses sept clés une par une et
n'exécute plus rien. Cas ajouté au script de preuve, rouge sur l'ancien (127),
vert sur le nouveau. Installé par `install`, sauvegarde manuelle et copie hors
site vérifiées, puis déploiement réussi.

## Second défaut de sauvegarde, trouvé en préparant la restauration

**Plus aucun point local antérieur à la veille** : la rotation gardait les
quatorze jeux les plus récents, et les douze déploiements du 7 octobre (chacun
précédé d'une sauvegarde) avaient évincé toutes les nuits. Elle garde désormais
le dernier jeu de chacun des quatorze derniers jours distincts, plus ceux du
jour (PR #562). Cas 9 du script de preuve, rouge sur l'ancienne rotation.

**Reste sur la machine, signalé et non supprimé** : trois jeux **en clair** des
8, 9 et 10 septembre, antérieurs au chiffrement. L'ancienne rotation comptait
chaque famille de fichiers à part, et celle des fichiers en clair n'atteignait
jamais quatorze. La nouvelle les compte parmi les quatorze jours distincts :
ils partiront quand quatorze jours plus récents existeront. Les supprimer plus
tôt est un geste à décider par Christophe.

## Livré

| Ticket | Ce qui change | PR |
| --- | --- | --- |
| LS-278 | archivage groupé confirmé ; vider la boutique exige de taper le nombre (règle dans le service) ; `ARCHIVAGE_PRODUITS` au journal d'audit ; alerte `CATALOGUE_VIDE` | #559 |
| LS-275 | polices du PDF en TTF : 350 ms de décompression WOFF par rendu supprimées, test de 1237 à 156 ms | #560 |
| LS-140 | mesure sur le catalogue réel, neuf pages dont une fiche produit tirée du sitemap, toutes sous les seuils | #561 |
| LS-107 | lecture de l'environnement sans exécution ; rotation par jours ; restauration complète exercée | #558, #562 |
| LS-228 | panneau « État du stock » ; « Mon activité » à l'espace client ; états vides | #563 |

## LS-107, restauration exercée

Jeu du 26 septembre (douze jours), tiré de Backblaze, remonté dans un
environnement jetable (conteneur PostgreSQL, réseau Docker et répertoire à
part), migré au schéma actuel, servi par l'image en production : catalogue et
fiche à 200, **50 médias en base, 50 dossiers restaurés, aucun manquant**. Tout
démonté ensuite. Procédure et pièges dans `EXPLOITATION.md`.

## Ce que la restauration a appris sur LS-278

Le catalogue avait **déjà** été vidé le 27 septembre à 15:38:46 UTC, 46 produits
à 2 ou 3 ms d'écart, signature de l'archivage groupé de l'écran. L'incident du
4 octobre était une récidive. Tracé sur LS-278.

## Dérives

- Le crochet de pré-commit a refusé une chaîne de connexion jetable dans la
  documentation : remplacée par la forme entre chevrons du fichier.
- Une ligne d'attribution de session, ajoutée par le harnais, a été retirée du
  commit et de la PR : la règle du projet interdit toute signature d'outil.
- Un rapport de contraste écrit de tête (9,38:1) était faux : calculé, 8,36:1.
- La revue de LS-278 a trouvé un pluriel faux à une pièce et Échap actif
  pendant l'envoi ; celle de LS-228, un lien d'action sans ses 44 px.
- `main` exige une branche à jour : chaque fusion a obligé les PR suivantes à se
  rebaser et à rejouer leur CI, fusions faites en série par script.

## État des tickets

Clos ce matin : LS-275, LS-278, LS-140, puis LS-228 et LS-107 après fusion.
Restent ouverts ceux qui attendent l'exploitante, une démarche externe ou
l'ouverture commerciale : LS-19, LS-23, LS-24, LS-26, LS-27, LS-28, LS-44,
LS-142, LS-145, LS-153, LS-218, LS-35 ; LS-258 jusqu'au 17 octobre ; LS-273 en
attente de nocturnes verts.
