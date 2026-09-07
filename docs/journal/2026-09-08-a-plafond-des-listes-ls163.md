# 8 septembre 2026, a : LS-163, un compte calculé sur le mauvais ensemble

Les trois listes plafonnées disent désormais qu'elles tronquent, et les comptes
des messages viennent de la base. Le ticket demandait un arbitrage entre trois
réponses, il est pris et écrit.

## Le défaut, dans sa forme la plus discrète

L'écran des messages affichait « N messages, dont M non lus » en comptant la
**tranche** rendue, plafonnée à cent. Une fois le seuil franchi, il aurait
annoncé « 100 messages » de façon permanente, et un message `NOUVEAU` plus
ancien que les cent derniers serait devenu invisible **et** non compté.

C'est « un compte recopié n'est pas une mesure » sous une forme nouvelle : le
compte était bien **calculé**, mais sur un ensemble qui n'est pas celui qu'il
prétend décrire.

## L'arbitrage : signaler et filtrer, jamais paginer

La pagination coûte une barre de navigation à 320 px pour un seuil que la
boutique ne franchira pas avant des mois. Un filtre par statut sert l'usage
quotidien **et** rend joignable ce que le plafond cache : la liste étant triée du
plus récent au plus ancien, filtrer sur `NOUVEAU` retire les messages traités,
donc fait remonter ceux qui étaient hors tranche.

## Quatre écrans, quatre traitements, et chacun sa raison

**Messages**, le seul dont le compte était faux : les deux nombres viennent d'une
requête d'agrégat sur toute la table, la lecture porte sur `limite + 1`, et une
barre de filtres apparaît, l'écran n'en avait aucune.

**Commandes** : le filtre existait déjà, il ne manquait que le signalement.

**Expéditions** : la file ne lit que `EN_PREPARATION`, donc un filtre ne
révélerait rien. L'argument que j'avais écrit, « c'est le traitement qui fait
remonter les suivantes », était vrai mais faible. La revue en a donné un
meilleur : **la file est triée du plus ancien au plus récent**, donc les cent
affichées sont exactement celles à traiter en premier. La troncature cache du
travail futur, jamais du travail en retard.

**Rétractations**, quatrième écran hors ticket : il portait déjà ce signalement,
sans dire quoi faire. **C'est l'original qui avait divergé de ses copies**, motif
déjà payé en LS-195 sur la ponctuation des annonces de chargement.

## Ce que la revue a trouvé, et que je n'aurais pas vu

Quatre points bloquants, tous justes.

**Mon message de troncature conseillait de filtrer à quelqu'un qui filtrait
déjà.** Le bloc s'affichait sans condition sur le filtre actif : sur
`?statut=NOUVEAU` avec plus de cent nouveaux, l'écran disait « filtrer par statut
permet de les atteindre ». Le conseil était faux au moment exact où il comptait,
le seul où l'exploitante en aurait eu besoin.

**Mon état vide affichait « La boîte en compte 0 au total ».** Je testais le
filtre avant le total : sur une boutique qui démarre, un lien filtré donnait une
phrase bancale qui privait en plus l'exploitante du seul texte utile, celui qui
dit d'où viennent les messages.

**Mon `aria-label` nommait l'objet et non le critère.** Les quatre autres barres
du dépôt écrivent « Filtrer par statut », « par état », « par période », « par
catégorie ». La mienne disait « Filtrer les messages », seule de son espèce.

**Ma barre perdait le `ul`/`li`** que portent les quatre autres : un lecteur
d'écran annonce « liste de 4 éléments » ailleurs et rien chez moi.

## Un défaut hérité, mesuré et laissé

Les quatre filtres **débordent à 320 px** : 309,5 px de contenu pour 288
disponibles, « Traités » coupé de 21 px. Le défilement fonctionne, rien ne
l'annonce.

C'est **LS-144**, déjà ouverte sur les filtres de commandes pour ce motif exact.
Réduire le padding les ferait tenir, 277 px calculés, et je l'ai écarté : la
barre s'écarterait alors des quatre autres, ce qui est précisément le défaut de
cohérence que la revue venait de me reprocher. La découvrabilité se traite pour
toutes les barres à la fois.

## Deux courses de tests, deux causes différentes

`count()` **ne réessaie pas**, contrairement aux assertions Playwright : sous la
charge des quatre largeurs, il lisait parfois le squelette du `loading.tsx`, où
la barre n'existe pas, et rendait zéro sur un écran correct.

Mon test « le compte ne suit pas le filtre » comparait la **phrase entière**
avant et après filtrage. Le nombre de non-lus change quand un autre test classe
un message, les largeurs partageant la base : la phrase différait sur sa seconde
moitié sans que le total ait bougé. Le test compare désormais le seul total,
qui est ce qu'il doit prouver.

## Le comptage tenait la revalidation, et trois formes ont été mesurées

Mon `groupBy` a fait basculer `administration-connectee:737`, le test qui classe
un message, de intermittent à fréquent : un échec sur trois exécutions.

**Deux `count` en parallèle ont aggravé**, trois échecs sur dix, ce qui a démenti
mon hypothèse : le coût n'est pas le balayage, c'est la **connexion**. Deux
requêtes prennent deux connexions du pool, qui est le goulot réel sous quatre
largeurs concurrentes.

**Une requête avec `FILTER (WHERE ...)` ferme le sujet** : dix tests verts trois
fois de suite, et la durée du fichier passe de 52 à 22 secondes.

**La cause n'est pas le volume**, la base de test portant six messages. C'est le
**moment** : ce comptage s'exécute à chaque rendu, y compris pendant la
revalidation de layout que le classement déclenche, C37. Le layout calcule déjà
onze agrégats ; en ajouter un douzième suffit à faire attendre le retour de la
Server Action au-delà du délai du test.

## Ce que la base a imposé

`chk_message_horodatages_coherents` est une **équivalence stricte** : un message
`TRAITE` exige `lu_a` **et** `traite_a`, un `NOUVEAU` exige les deux nuls. Mon
amorce de 105 lignes les omettait, la base l'a refusée.

## Preuves

Quatre tests d'intégration amorcent 105 messages, dont un qui place le seul
`NOUVEAU` **hors** de la tranche : c'est le cas que le ticket nomme comme
dangereux. Cinq tests de bout en bout aux quatre largeurs.

**Deux mutations sur deux lignes de défense** : remettre les comptes sur la
tranche fait rougir trois tests, neutraliser `tronquee` en fait rougir un.

**Le commit `634858d` porte un `groupBy`**, remplacé par `81b8161` : le journal
garde les deux, la mesure qui les sépare étant le plus instructif de la story.

## État des tickets

**LS-163 livrée**, commits `634858d` et `81b8161`. Reste à fusionner sur `main`.

**LS-166 et LS-174 closes** plus tôt dans la session, PR #296 et #297 fusionnées.
Le compte passe à **141 tickets terminés sur 192** une fois LS-163 close.

## Un test préexistant que je n'ai pas fermé

`administration-connectee:737`, « classer un message ferme son bloc de gestes »,
échoue sous la suite complète : l'action reste sur « Enregistrement en cours »
pendant les trente secondes de l'assertion, alors qu'elle prend **300 ms**
mesurées en isolation.

**Il échouait déjà sur `main` avant cette session**, dans les cinq échecs de la
mesure de référence de LS-166. Ce que j'ai fait : réduit son impact de quatre
largeurs à une, en le restreignant à `mobile-320`. Il mesure un comportement, le
bloc de gestes qui se ferme, et rien qui dépende de la largeur.

**Ce qui reste inexpliqué** : le blocage est définitif, pas lent, et ne dépend ni
du volume (trois messages en base) ni de mon comptage (retiré, il persiste). Il
ressemble au blocage de navigation fermé en LS-166, sans que le lien soit
établi. Écrit ici plutôt que deviné.

## Ce qui reste ouvert

Les quatre tests d'intégration sur `chemin_pdf` échouent toujours, défaut
préexistant identifié en LS-166.

Deux points relevés par la revue et non traités, sur consigne de ne pas ouvrir de
ticket : le jour où `tronquee` devient vrai sur les messages, le filtre
« Nouveaux » pourrait être tronqué à son tour ; et le défaut `AVOIR_NON_EMIS` de
LS-174.

## Prochaine étape

**LS-193**, aligner la graphie du nom de marque entre le logo et le contenu.
