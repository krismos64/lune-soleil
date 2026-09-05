# 5 septembre 2026, session I : l'état de chargement de l'administration, LS-188

Cinquième story de la journée, choisie parce qu'elle ferme le sujet des états non
nominaux ouvert par LS-191 la veille au soir, et qu'elle ne dépend ni du VPS, ni
de Mondial Relay, ni du médiateur.

Elle a coûté bien plus cher que son estimation en `Low`, pour une raison qui vaut
d'être écrite : **j'ai introduit un défaut de correction en croyant ajouter du
confort**, et il a fallu trois mesures pour le voir.

## Ce que le ticket disait, et ce que le dépôt disait

Le ticket comptait **quatorze** écrans en `force-dynamic`, mesure du 4 septembre.
Le dépôt en portait **quinze** : LS-185 avait ajouté l'écran Clients entre-temps,
avec le premier `loading.tsx` de l'administration.

Le quinzième, `produits/nouveau`, n'a pas été trouvé par relecture mais par le
contrôle que la story écrivait, **avant même qu'il soit commité**. Un contrôle
qui trouve un défaut réel le jour de sa naissance justifie son existence mieux
que n'importe quel argument.

## Le défaut que j'ai introduit

`administration/loading.tsx`, posé sur le tableau de bord, **a fait passer en 200
les 404 des seize écrans du sous-arbre**.

Mon propre commentaire dans ce fichier disait : « ce fichier couvre le segment
racine, pas ses sous-dossiers, le plus proche l'emporte ». C'était faux. Une
frontière Suspense enveloppe **tout le sous-arbre**, exactement comme le
`error.tsx` de LS-191 couvre les seize écrans. La partie vraie de la phrase, « le
plus proche l'emporte », porte sur le **repli affiché**, pas sur la frontière.

Deux autres fichiers portaient le même défaut un niveau plus bas :
`commandes/loading.tsx` et `produits/loading.tsx` couvraient leurs sous-dossiers
`[id]`, qui appellent `notFound()`.

**Le défaut est invisible à l'écran.** La page rendue est identique, elle affiche
bien « Cette page n'existe pas ». Seul le code HTTP diffère, et un moteur
indexerait une fiche inexistante.

### Comment il a été trouvé, et pourquoi c'était laborieux

Le critère 5 demandait que `pages-erreur.spec.ts` « continue de vérifier » le
statut des deux écrans de détail. Vérification faite, **il ne l'avait jamais
fait** : ce fichier couvre la 404 publique. Aucune spec d'administration
n'appelait `status()`, sur aucune route.

En écrivant le test qui manquait, les trois cas sont sortis **rouges**. J'ai
d'abord mesuré sur le code d'origine pour savoir si le défaut préexistait : il
sortait rouge aussi, ce qui m'a fait conclure à tort que ce n'était pas mon
travail. L'erreur venait de la mesure elle-même : le `git stash` avait mis de
côté les deux pages `[id]` mais **pas** `administration/loading.tsx`, déjà créé.

Il a fallu une route de diagnostic appelant `notFound()` en première instruction
pour trancher : **404 hors de `/administration`, 200 dedans**, sur un code
identique.

## Trois trous que ce défaut a révélés

**`verifier-loading-et-404.sh` ne comparait que des fichiers voisins.** Il est
resté vert pendant tout le temps où le défaut était présent. Il remonte désormais
les segments parents, et la mutation le prouve : le cas « `loading.tsx` posé sur
un segment PARENT » n'était **pas détecté** par l'ancienne version, il l'est par
la nouvelle.

**La règle C32 énonçait la version étroite**, « sur une route qui appelle
`notFound()` », ce qui se lit comme une contrainte de voisinage. Elle porte
maintenant sur le sous-arbre, avec la mesure.

**Les deux écrans de détail n'avaient aucun test de statut.**
`tests/e2e/statut-detail-administration.spec.ts` le comble, avec les deux chemins
distincts vers le 404 : identifiant bien formé mais absent, et identifiant
difforme qui passe par `EntreeInvalideError`.

## Ce que la revue d'interface a trouvé

`ls-frontend-revue` a relevé sept points, six retenus.

**Une classe CSS qui n'existait pas.** `styles.chargement` sur l'écran
`produits/[id]` : mon `cat >>` avait échoué sur le glob zsh de `[id]` non quoté,
et j'avais lu le compte de lignes en retour comme une preuve d'écriture. Motif
« correction échouée en silence », déjà en fiche. Le repli se rendait sans aucun
style et sans paire de contraste mesurable.

**Le contrôle neuf n'était appelé nulle part**, ni en CI ni dans le `README`.
Motif « contrôle jamais déclenché », déjà rencontré sur
`verifier-actions-sensibles.sh`. Il est désormais l'étape 6k.

**Un commentaire du script affirmait le contraire de la vérité** : il disait que
les écrans de la liste des dispenses portaient « quand même un `loading.tsx` », or
le tableau de bord n'en a pas et ne doit jamais en recevoir. Un tel commentaire
aurait pu faire recréer le fichier interdit.

**Deux squelettes omettaient leur lien de retour**, 56 px de décalage vertical
à l'arrivée des données, sur `expeditions` et `messages`.

**Trois replis de liste n'avaient qu'une phrase** là où arrivent des cartes.

**L'annonce du tableau de bord occupait une ligne que le rendu réel n'a pas.**
Elle est désormais masquée à l'œil, `styles.invisible`, et reste entière pour un
lecteur d'écran.

## Ce que la mesure a tranché contre mes suppositions

**`reauthentification` n'avait aucune attente à annoncer.** J'avais écrit dans son
fichier que « l'attente existe », c'était une supposition. Mesure faite, son corps
porte le formulaire complet dès le premier octet : elle ne fait qu'un seul
`await`, la garde de session, et ne lit aucune donnée métier. Son `loading.tsx`
était du code mort, il est retiré.

**Trois autres écrans sont muets en local et gardent pourtant leur repli.**
`produits/nouveau`, `retractations` et `messages` font deux lectures chacun : ils
sont invisibles parce qu'une base locale répond en quelques millisecondes, pas
parce qu'il n'y a rien à attendre. Le critère d'entrée dans la liste des dispenses
est donc **structurel et non chronométrique** : rien à lire après la garde, et non
« lecture rapide ». Les retirer sur la foi d'une mesure locale reviendrait à
concevoir pour la machine de développement.

## Tester un état de chargement, quatre tentatives et une limite assumée

Le fichier de rendu a longtemps été instable : les mêmes écrans passaient ou
échouaient d'une exécution à l'autre, et le nombre d'échecs variait de trois à
sept. Une armature est **une fenêtre qui se referme**, et sur une base chaude le
contenu arrive avant l'assertion. Motif « pool chaud referme la fenêtre ».

**Trois réglages ont été essayés et aucun ne ferme la course** : `waitUntil:
"commit"`, un ralentissement du document par interception réseau, un délai de
réessai raccourci. La raison tient en une phrase : aucun d'eux n'allonge la
**lecture en base**, seule chose qui maintient le repli à l'écran.

**Ce qui marche est de sortir du rendu.** Le test lit le HTML que le serveur
envoie, par le contexte de la page pour emporter le cookie de session. Le repli
d'un `loading.tsx` y est toujours, ce fichier étant un document distinct servi
pendant que le segment se rend. Pour la mesure de débordement, ce HTML est peint
dans la page par `setContent`, ce qui donne un rendu réel et figé de l'armature
exacte.

**Une limite reste, et elle est écrite plutôt que contournée.** Les cinq écrans à
`<Suspense>` interne ne sont **pas** observables en local : React n'émet le repli
d'une frontière interne que si le rendu **suspend réellement**, et la lecture se
termine avant. Leur repli existe et s'affichera sur le VPS. En attendant, c'est
`verifier-chargement-administration.sh` qui garde leur présence, par le texte, et
sa mutation prouve qu'il rougit quand elle disparaît. Un test qui les inclurait
serait rouge en local et vert nulle part.

J'ai écrit au passage deux commentaires qui affirmaient le contraire de ce que la
mesure disait, dont un affirmant que le flux complet portait les deux états.
Les deux ont été corrigés après vérification.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `vitest --project unitaire` | **491 verts**, 29 fichiers |
| Les 24 contrôles textuels | verts |
| `verifier-chargement-administration-mutation.sh` | **6 sur 6** |
| `verifier-loading-et-404-mutation.sh` | **3 sur 3**, dont le cas parent neuf |
| Le cas parent sur l'ancienne version du contrôle | **non détecté**, ce qui prouve l'élargissement |
| `verifier-contraste.sh` | **177 paires**, vert |
| `playwright chargement-administration` | **13 verts**, dix écrans plus le débordement et le titre |
| `playwright statut-detail-administration` | **3 verts**, les deux chemins vers le 404 |

## État des tickets

**LS-188 est TERMINÉE**, huit critères sur huit, le critère 5 ayant demandé
d'écrire le test qu'il supposait existant.

**LS-195 créée**, Low, sous LS-3 : le catalogue public écrit « Chargement des
pièces. » avec un point final quand les quinze écrans d'administration emploient
des points de suspension. Hors périmètre, la story ne devait pas toucher la
boutique publique.

## Ce qui reste, et qui n'est pas de cette story

**LS-168 continue de gêner**, le plafond de débit ayant bloqué la préparation de
session à six reprises pendant cette session, chaque relance coûtant environ 90
secondes d'attente.

**Trois `.vide` d'écrans préexistants déclarent une couleur sans fond
colocalisé**, donc invisibles à `verifier-contraste.sh`. Leurs rapports réels
sont justes, 4,86:1 sur crème : c'est un trou de couverture du contrôle, pas un
défaut de contraste, et il est antérieur à cette story.

## Prochaine étape

**LS-113**, les états non nominaux des écrans d'administration rendus et mesurés.
Elle prolonge directement celle-ci : cinq états vides existent dans le code sans
qu'aucun test ne les visite, et deux sont rendus structurellement inatteignables
par la fixture de LS-111, qui insère toujours une catégorie et une variante.
