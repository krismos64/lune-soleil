# 2 septembre 2026, session D : LS-84, LS-146 et LS-162

Trois stories d'interface livrées d'affilée, en autonomie complète pendant une
absence de Christophe. Toutes trois en phase 2, epic LS-3, et toutes trois
ferment un défaut que **rien ne signalait**.

C'est le fil de la journée : les trois défauts étaient invisibles, chacun pour
une raison différente, et aucun n'aurait été trouvé par relecture.

## Le seul arbitrage demandé, et il l'a été avant de partir

LS-162 laissait explicitement ouverte la forme de la navigation, « barre
permanente sur tous les écrans, ou index sur l'accueil seulement, à trancher
plutôt qu'à supposer ». La question a été posée avant le départ : **barre
permanente**.

Le reste s'est tranché seul, dans le cadre déjà posé par le dépôt.

## LS-84, ce qui se mesure est une paire

Le troisième critère, seul restant depuis le 19 août. Le défaut de couleur était
absent du code depuis LS-104 : **ce qui manquait n'était pas une correction mais
le garde-fou**.

L'arbitrage de Christophe du 19 août imposait un contrôle **générique** plutôt
qu'ancré sur le nom du terracotta. Le motif est plus fort qu'il n'y paraît :

```
--ls-text-muted #7A6A5D sur creme #FBF7F0  ->  4,86:1  conforme
--ls-text-muted #7A6A5D sur sable #F2EADF  ->  4,35:1  NON CONFORME
```

Le même jeton, deux verdicts. Interdire le jeton serait faux, l'autoriser sans
regarder son fond l'est aussi. Un contrôle nominatif aurait de surcroît **accusé
du code correct** : `--ls-accent-gold` est employé en fond de badge avec
`--ls-text` dessus, ce qui est conforme, la règle 1 interdisant le doré en texte
et non en fond.

81 paires mesurées dans 21 fichiers, toutes conformes.

### L'angle mort est mesuré plutôt que tu

166 déclarations de couleur échappent à la mesure, celles dont le fond vient
d'un ancêtre qui vit dans le JSX. Reconstruire l'arbre demanderait de parser le
TSX, et **un contrôle qui devine une imbrication accuse tôt ou tard du code
correct**, ce qui finit par le faire désactiver.

Les trois cas de texte clair sans fond déclaré ont été vérifiés un par un : tous
corrects, tous enfants d'un bloc qui peint un fond sombre.

Le trou est couvert par l'autre bout, et c'est le point de conception qui compte :

| | héritage du fond | branches non rendues |
|---|---|---|
| `axe-core` | vu | **non vu** |
| ce script | **non vu** | vu |

Deux défauts réels sont passés par le trou d'`axe-core`, LS-121 à 4,04:1 et
LS-130 à 4,35:1, tous deux sur un état que les données de test ne produisaient
jamais. Retirer l'un des deux rouvre une moitié.

## LS-146, le statut ne se voit pas à l'écran

`notFound()` est appelé sur quatre routes et **aucun** `not-found.tsx`
n'existait. Next.js servait sa page par défaut, en anglais, sans navigation.

Trois pages livrées : `not-found.tsx` à la racine, qui couvre aussi les URL sans
route ; `(boutique)/error.tsx`, qui rattrape le panier, le tunnel, la
confirmation et le compte ; `global-error.tsx`, pour l'échec du layout racine.

`global-not-found.tsx` répond au même besoin et **n'est pas retenu** : marqué
expérimental, il demande un drapeau. Une boutique qui encaisse ne pose pas sa
page d'erreur sur une API que la version suivante peut déplacer. Vérifié via
Context7, `app/not-found.tsx` couvre déjà les URL sans route depuis Next.js
13.3.

### Le critère 6 est le cœur, et il est prouvé

Un `loading.tsx` posé sur `produit/[slug]` fait rougir **exactement** les deux
tests de statut, et eux seuls :

```
2 failed   un produit en brouillon rend 404
           un slug inconnu rend 404
4 passed
```

Les quatre autres restent verts, et **c'est là toute la preuve** : la page rend
visuellement à l'identique, seul le code HTTP passe de 404 à 200. Un test qui
chercherait le titre resterait vert pendant qu'un moteur indexe une page
inexistante.

### L'écran de secours et sa seule exception

`global-error.tsx` **remplace** le layout racine : il perd les imports de
`tokens.css`. S'appuyer sur une variable CSS reviendrait à dépendre du fichier
dont la défaillance amène cette page.

Ses couleurs sont donc écrites en dur, seule exception du projet à la règle
« aucune valeur hexadécimale », et `verifier-palette-secours.sh` les confronte à
ADR-022. Sans lui la divergence serait **totalement silencieuse** : cet écran ne
se rend que pendant une panne, aucun test ne le traverse, et l'écart se
découvrirait le jour où il compte.

## LS-162, huit stories sans que rien ne le voie

Aucun écran d'administration ne renvoyait vers un autre. L'exploitante devait
saisir sept URL par cœur, et `/administration` rendait deux lignes.

**Personne ne l'avait vu parce que les tests appellent `page.goto()` avec l'URL
en dur.** Un test qui atteint toujours sa cible directement ne peut pas
découvrir qu'aucun chemin n'y mène. Le fichier neuf fait un seul `goto`, sur
l'accueil, et atteint les sept écrans au clic.

Deux décisions :

- **composant client, imposé par Next.js**, vérifié via Context7 : un layout ne
  se re-rend pas à la navigation, donc un chemin passé en props resterait figé
  sur la première page ouverte
- **le layout n'autorise rien.** Une Server Action n'est pas rendue par un
  layout : une garde qui vivrait là laisserait toutes les actions ouvertes à un
  appel HTTP direct pendant que l'écran paraîtrait protégé. Il lit la session
  pour **afficher** seulement, et vérifie le rôle et non la seule présence d'une
  session

Le critère 2 exigeait une liste dérivée. Next.js ne permet pas d'énumérer les
routes à l'exécution : la liste vit dans le code, et un contrôle **à deux sens**
la tient. Le second sens est celui qui compte, il fait échouer la story
**future** qui ajouterait un écran sans le relier.

## Ce que les mutations ont trouvé, et que la relecture n'avait pas vu

Dix-sept mutations au total, dix-sept détectées. **Deux d'entre elles ont trouvé
un trou réel dans mes propres contrôles, et c'est le même motif deux fois.**

`lang="fr"` en LS-146, puis `aria-current` en LS-162 : dans les deux cas la
garde était satisfaite par le **commentaire qui l'explique**, jamais par le
code. La mutation retirait l'attribut réel et le contrôle restait vert.

C'est le motif « contrôle satisfait par un commentaire », déjà en fiche. Sa
forme précise est neuve et vaut d'être retenue : **un contrôle qui cherche un
nom d'attribut le trouve dans la documentation de ce même attribut**. Le motif
doit porter sur la forme syntaxique, `aria-current={` et `<html lang="fr">`, et
non sur le nom nu.

Les deux occurrences le même jour, sur deux stories différentes, écartent le cas
particulier.

## Une coquille corrigée sur Jira

Le commentaire de clôture de LS-84 portait « plutôt que tu » au lieu de « plutôt
que passé sous silence ». Corrigé par mise à jour du commentaire, id 17331.

## Vérifications

```
npm run type-check                         OK
npm run lint                               OK
npm run format:check                       All matched files use Prettier code style!
npm run build                              26 routes, /_not-found compris

playwright pages-erreur, trois largeurs             16 passed
playwright navigation-administration, trois larg.   18 passed
playwright administration existants, 320 px         80 passed, aucune regression

./scripts/verifier-contraste.sh                       88 paires, OK
./scripts/verifier-contraste-mutation.sh              6 mutations, 6 detectees
./scripts/verifier-loading-et-404.sh                  20 segments, OK
./scripts/verifier-loading-et-404-mutation.sh         2 mutations, 2 detectees
./scripts/verifier-palette-secours.sh                 OK
./scripts/verifier-palette-secours-mutation.sh        5 mutations, 5 detectees
./scripts/verifier-navigation-administration.sh       12 routes, 7 rubriques, OK
./scripts/verifier-navigation-administration-mut.sh   4 mutations, 4 detectees
./scripts/verifier-regles.sh                          regles conformes au schema
./scripts/verifier-gardes-administration.sh           OK
./scripts/verifier-propagation-docs.sh                OK
```

Quatre étapes neuves en intégration continue, 6i à 6l. Trois règles ajoutées à
`frontend-design.md`, **C31**, **C32** et **C33**. C25 était déjà pris par une
contrainte du modèle conceptuel : deux règles sous un même identifiant
casseraient la convention de citation.

## Ce qui reste

**Aucune dette ouverte par ces trois stories.**

Un point signalé plutôt que décidé seul : LS-162 emploie le même défilement
horizontal à 320 px que les filtres du catalogue, et **LS-144 porte la
découvrabilité de ce motif**. La correction qui en sortira vaudra pour la barre :
inventer ici une solution différente aurait créé deux motifs concurrents.

**LS-85 reste ouverte sur son seul critère 5**, l'écoute au lecteur d'écran.
Aucun outil ne la simule, et elle demande Christophe devant la machine avec
VoiceOver, vingt minutes. Elle n'a pas été touchée aujourd'hui.

## Prochaine étape

La phase 2 passe de seize à **treize stories ouvertes**. Les plus proches du
Go-Live sont **LS-147**, le favicon et l'image de partage, aucun lien partagé
n'ayant d'identité aujourd'hui, et **LS-127** plus **LS-113**, les états de
chargement et d'erreur des écrans d'administration, que LS-146 vient de couvrir
côté public.

**LS-123 reste bloquée** : LS-25, LS-26 et LS-28, qui portent les textes, sont
toutes à faire.

## État des tickets

LS-84, LS-146 et LS-162 livrées et closes. Comptés dans Jira après les trois
fusions, jamais de mémoire : **88 terminés sur 163, soit 54 %**.
