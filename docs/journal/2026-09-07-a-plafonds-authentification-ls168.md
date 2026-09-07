# 7 septembre 2026, a : les plafonds d'authentification, et trois hypothèses fausses

LS-168, menée en autonomie. Le ticket demandait de rendre la suite de bout en
bout déterministe sans jamais désactiver un plafond de production. Son
commentaire du 6 septembre rectifiait sa description : LS-113 avait déjà corrigé
la cause principale, il restait trois points.

## La mesure qui dit tout

La base de développement portait **118 comptes de test**, dont 68
`e2e-rattachement-*` laissés par la seule fixture vérifiée, un par exécution
depuis des semaines. C'est la trace directe du défaut, et aucun ticket ne
l'avait relevée : personne ne regarde la table `utilisateur` d'une base locale.

## Ce qui consommait quoi

Sept inscriptions par exécution pour **trois places par minute** :

| Source | Avant | Après |
| --- | --- | --- |
| `session-cliente` | 0, corrigée par LS-113 | 0 |
| `session-administration` | 0, corrigée par LS-111 | 0 |
| `session-verifiee` | 1, adresse horodatée | 0 |
| `compte-profil` `beforeAll` | 3, une par largeur | 0 |
| `compte-profil` mot de passe | 3, une par largeur | 0 |

La parade en place était un réessai espacé de 21 secondes. **Un réessai répartit
la consommation, il ne la supprime pas** : il attend après avoir échoué, à
chaque exécution, sans jamais supprimer la cause. Les adresses étant horodatées,
il y avait toujours quelque chose à inscrire.

## Trois hypothèses que la mesure a démenties

Le vrai contenu de cette session tient dans ces trois corrections. Chacune
paraissait solide sur lecture, et chacune était fausse.

### Le projet `preparation` n'était pas séquentiel

J'ai écrit dans un commentaire qu'il l'était, puis placé un amorçage espacé en
comptant dessus. Playwright répartit les fichiers d'un même projet sur plusieurs
travailleurs : « Running 3 tests using 3 workers », et l'amorçage échouait en
429 dès son premier appel, avant d'avoir pu espacer quoi que ce soit.

`workers: 1` est une option **par projet**, vérifié via Context7, et les trois
projets de largeur gardent tout leur parallélisme.

### Un espacement de 21 secondes saturait la fenêtre au lieu de l'éviter

Mon raisonnement : « trois inscriptions couvrent 42 secondes, la fenêtre en dure
60 ». C'est l'inverse qu'il fallait conclure. **42 < 60 signifie que les trois
tombent dans la même fenêtre**, qui se trouve donc pleine, et la quatrième est
refusée.

Ce qui compte est le nombre d'appels dans la fenêtre, pas le délai entre deux
appels consécutifs. L'aide attend maintenant que la plus ancienne des trois
dernières inscriptions en sorte, et pas une seconde de plus.

### Le plafond de connexion était franchi lui aussi

Le ticket ne parlait que de `/sign-up/email`. Deux autres routes posaient le
même problème, et je les ai trouvées en comptant les appels plutôt qu'en lisant
le ticket.

`/change-password` est plafonnée à cinq par minute : restaurer le mot de passe
par le formulaire en aurait consommé un second par largeur, six pour cinq
places. **J'avais réintroduit le défaut sous une autre route sans m'en
apercevoir.** L'empreinte relevée avant le changement est reposée en base.

`/sign-in/email` est plafonnée à cinq : `comptes-profil` vérifiait six comptes
par connexion, et `compte-profil` en faisait douze, quatre par largeur. Compteur
mesuré à 5/5 avec les neuf comptes déjà en base, et un échec en 196 ms, donc sur
un refus de connexion et non sur une inscription. La vérification passe par une
lecture SQL, et la préparation pose l'état de session de chaque largeur.

### Le plafond de `/change-password`, et un arbitrage

Le ticket ne parlait que de `/sign-up/email`. Le compte des appels a montré un
troisième cas, structurel celui-là : `compte-profil` appelle
`/change-password` **deux fois**, le refus d'un mot de passe faux et le
changement lui-même. Aux trois largeurs cela fait six appels pour **cinq
places**.

Aucun des six n'est supprimable, ce sont les mesures elles-mêmes, et Better Auth
compte par IP sans option par session, vérifié via Context7.

**J'ai essayé un décalage de 25 secondes par largeur, et il ne marchait pas** :
les six appels restaient dans la même fenêtre glissante de 60 secondes,
seulement étalés. C'est le piège des 21 secondes, reproduit par moi quelques
heures après l'avoir documenté. Le porter à 65 secondes fonctionnait, au prix de
quatre minutes d'attente pure par exécution, payées par la CI et le contrôle
nocturne à chaque fois.

**Arbitrage de Christophe** : limiter ces deux tests à 320 px, motif déjà
appliqué par LS-113 sur `compte-reauthentification`. Le rendu du formulaire
reste couvert aux trois largeurs par les cinq autres tests du fichier ; ce qui
est restreint est le comportement du changement, qui ne dépend pas de la
largeur.

## Mon erreur de protocole

**Je purgeais les comptes sans purger `rate_limit`**, qui est persisté en base
depuis ADR-027 et survit au redémarrage du serveur. Mes trois premières mesures
partaient donc d'une fenêtre déjà saturée : elles ne prouvaient rien, et j'ai
conclu deux fois à un échec de la correction alors que le protocole était en
cause.

Une mesure sur « base vierge » doit purger les deux tables.

## Le garde-fou

`verifier-fixtures-e2e.sh` porte cinq sens, tous prouvés par mutation : adresse
construite à l'exécution, réessai espacé, largeur absente de
`PROJETS_LARGEUR`, fenêtre recopiée qui cesserait de couvrir le plafond réel, et
attente **calculée**.

Ce cinquième sens vient d'un angle mort trouvé sur le contrôle lui-même : il
cherchait un nombre écrit en clair, et il est **resté vert** sur
`waitForTimeout(rang * DECALAGE_MS)`, une attente de 25 à 50 secondes que je
venais d'écrire. Un contrôle écrit en réaction à un défaut reconnaît la forme de
ce défaut-là, et protège le passé plutôt que la règle.

Deux exemptions seulement, nommées fichier par fichier et dont l'existence est
elle-même vérifiée : `connexion-administration.spec.ts`, qui doit consommer le
plafond puisqu'il mesure un refus, et `inscription-espacee.ts`, seul endroit où
une attente est justifiée parce qu'elle précède le dépassement au lieu de le
subir.

Il existe parce que **le défaut est revenu deux fois** malgré des commentaires
qui l'expliquaient. Un commentaire n'arrête personne.

## État des tickets

**LS-168** : les quatre critères sont tenus. Aucun plafond n'est désactivé ni
relevé, c'est la consommation qui passe de sept inscriptions à zéro en régime
établi.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui débloque la chaîne la plus
longue du backlog : elle bloque LS-131, qui bloque LS-33 et son délai légal de
rétractation. Le travail est plus petit qu'il n'y paraît, LS-115 ayant déjà
livré le contrat `FournisseurPointsRetrait` et la dégradation testée du tunnel.

Sinon **LS-179**, la bascule d'affichage du mot de passe.
