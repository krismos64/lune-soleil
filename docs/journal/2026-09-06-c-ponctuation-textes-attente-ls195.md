# 6 septembre 2026, session C : la ponctuation des textes d'attente, LS-195

Troisième session de la journée. Un ticket annoncé comme le plus rapide du
backlog : un caractère à changer sur un fichier public.

Il a fini par en toucher **sept**, parce que la règle que la story pose affirmait
quelque chose que le code démentait.

## Le défaut, et sa forme intéressante

`(boutique)/catalogue/loading.tsx` écrivait « Chargement des pièces. » avec un
point final, seul des quinze annonces du dépôt, et c'était l'écran public.

**C'est une recopie inversée.** Ce fichier était la référence que le composant
partagé cite dans son propre en-tête, le seul état de chargement du dépôt avant
LS-188. Les quatorze copies ont corrigé la forme **au passage**, sans que
l'original le soit : c'est l'original qui a divergé de ses copies.

Aucune relecture de diff ne montre cela. Le diff de LS-188 était parfait, il
ajoutait quatorze annonces correctes.

## La règle affirmait ce que le code démentait

J'ai posé **C35** dans `frontend-design.md` : « le caractère est `…` [...] comme
partout ailleurs dans le dépôt ».

La revue d'interface a mesuré que c'était **faux** : six libellés de bouton
employaient trois points, dont deux sur le parcours de rétractation, contre 46
qui employaient le bon caractère.

Deux issues possibles, restreindre la règle aux seuls états de chargement, ou
corriger les six lignes. **J'ai corrigé**, parce que six caractères coûtent moins
cher qu'une règle publiée que son propre dépôt contredit. La règle vaut donc
pour tout texte d'attente, avec l'exception du badge d'état : « Traitement en
cours » nomme une situation et non une action en train de se faire.

## Le contrôle n'avait pas de dénominateur

`verifier-ponctuation-chargement.sh` partait des annonces trouvées et vérifiait
leur forme. La revue a mesuré ce que cela laisse passer :

| Mutation | Résultat avant correction |
| --- | --- |
| annonce reformulée en « Les stocks se chargent. » | 14 annonces, **vert** |
| annonce supprimée | 14 annonces, **vert** |

**Le compte baissait en silence.** Le contrôle détectait l'absence totale
d'annonces mais rien entre 1 et 15.

Le sens 2 croise donc les textes avec l'inventaire des `loading.tsx`, comme
`verifier-lien-evitement.sh` part de `find` et non des ancres trouvées. Motif
« numérateur et dénominateur appariés », déjà en fiche.

Le commentaire du script revendiquait d'être « générique, jamais une liste
écrite à la main ». Il l'était sur le **contenu**, pas sur la **complétude**, et
c'est la complétude que ce motif vise.

## Un défaut trouvé avant la revue

Le motif des trois points s'ancrait sur la fin de ligne, `*"..."`. C'est vrai du
JSX rendu, faux d'une propriété `annonce="..."` qui finit par sa guillemet.

**Le contrôle rougissait bien, mais par la mauvaise branche**, en annonçant que
l'annonce ne se terminait pas par des points de suspension alors que le défaut
était le caractère employé. Un message faux vaut un contrôle faux : la personne
qui le lit corrige la mauvaise chose.

Attrapé par la preuve par mutation, qui vérifie le **message** et pas seulement
le code de sortie.

## Ce que la revue a trouvé d'autre

**Le compte de « seize » recopié à trois endroits**, dans la règle, dans le
script et dans le commentaire du fichier public, alors que le contrôle imprime
15. Le ticket comptait une ligne de commentaire du composant partagé comme une
annonce. Je l'avais signalé dans le commit et je l'avais quand même recopié
ailleurs.

**Une collision d'étiquette de CI** sur `6m`, déjà pris par les métadonnées de
référencement. Passée en `6n`.

**Un accent manquant** dans un message d'échec du script, « termine » pour
« terminé », dans un texte français rédigé.

**Deux assertions négatives du test qui ne pouvaient pas rougir.** Le fichier ne
porte qu'une occurrence de la phrase : l'absence du bon caractère fait déjà
échouer la positive, et l'une des deux supposait en plus que React colle le
texte à la balise fermante. Une assertion qui ne peut pas échouer donne
l'impression d'une garde qui n'existe pas. Retirées, la garde effective est
nommée dans le commentaire.

**La troisième forme d'appel n'était pas mutée.** Les cas couvraient le JSX d'un
`loading.tsx` et la propriété du composant partagé, jamais le JSX sous
`<Suspense>` interne. Elle est textuellement identique à la première, mais rien
ne le disait.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `verifier-ponctuation-chargement.sh` | 15 annonces, 10 états inventoriés |
| `verifier-ponctuation-chargement-mutation.sh` | **6 sur 6**, chacune par son message |
| `verifier-regles.sh` | vert |
| Suite e2e complète | **1074 verts** |

Les 14 échecs appartiennent tous à des familles déjà rouges sur `main`,
instabilité LS-168, et passent en isolation.

## État des tickets

**LS-195 est TERMINÉE**, trois critères sur trois, PR #256.

Le ticket disait « seize annonces », le dépôt en porte **quinze**. Signalé plutôt
que corrigé en silence.

## Propagation

Règle **C35** dans `frontend-design.md`, contrôle branché à la CI en étape
**6n**, les deux scripts déclarés au README.

## Prochaine étape

**LS-187 et LS-192** groupées : elles touchent les mêmes cinq fichiers de
composition d'URL de média, et les traiter séparément ferait rouvrir le sujet
deux fois. LS-187 ferme aussi le motif « chaîne construite à l'exécution » côté
boutique, qui écrit `640.jpeg` en dur sans garde-fou.
