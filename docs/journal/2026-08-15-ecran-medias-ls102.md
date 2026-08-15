# 15 août 2026, LS-102 terminée, écran de téléversement et purge branchée

Reprise de LS-102, arrêtée le 14 août avec quatre points ouverts. Les quatre
sont faits : Server Actions, écran, branchement de la purge sur LS-72, revue
d'interface.

## L'arbitrage rendu au démarrage

Une Server Action est plafonnée à **1 Mo** de corps par défaut dans Next.js,
vérifié par Context7. Le service accepte 25 Mo : toute photographie de téléphone
aurait donc été refusée par le framework **avant** l'exécution de l'action, avec
une erreur générique, et le message de `FichierTropVolumineuxError` n'aurait
jamais été atteint.

Deux voies, séparées par une conséquence de sécurité : porter le plafond global,
ou écrire un Route Handler dédié. **Christophe a retenu le plafond global**, et
la contrepartie est nommée : toutes les Server Actions du projet acceptent
désormais un corps de cette taille, y compris celles qui ne transportent que du
texte. Ce qui borne l'abus reste la limitation de débit d'ADR-027, la garde de
rôle de chaque action, et `client_max_body_size` de Nginx en production.

## Le défaut que rien n'aurait attrapé

L'URL de vignette portait `640.jpg`. Le traitement écrit `640.jpeg`.

Ni `tsc`, ni le lint, ni aucun test n'aurait rougi : c'est une chaîne construite
à l'exécution, et aucun test ne charge cette page. **Toutes les vignettes de
l'administration auraient été cassées en production**, découvertes par
l'exploitante et non par la construction.

La parade retenue confronte le nom à `declinaisonsAttendues()`, la fonction qui
produit réellement les onze noms, au chargement du module :

```ts
const NOM_VIGNETTE = "640.jpeg";

if (!declinaisonsAttendues().includes(NOM_VIGNETTE)) {
  throw new Error(...);
}
```

`next build` évaluant les modules, renommer ou retirer une déclinaison fait
désormais échouer la **construction**. C'est le contraire du piège « construire
n'est pas servir » : ici l'échec à la construction est exactement ce qu'on veut,
la valeur vérifiée étant connue au build et non à l'exécution.

## La purge était testée sans être appelée

`purgerQuarantaine` existait depuis le 14 août avec ses tests. **Aucun appelant
ne l'invoquait.** Les tests seraient restés identiques si la fonction n'avait
jamais été branchée : ils prouvaient qu'elle fonctionne, jamais qu'elle sert.

Le branchement tient en une entrée dans `TACHES` et une branche dans la route.
Ce qui compte est la façon de le prouver.

**Un grep ne prouve rien ici.** Trouver `purgerQuarantaine(` dans le fichier de
la route établit une propriété du fichier : un appel placé après un `return`, ou
dans une branche jamais atteinte, satisferait le motif en laissant le trou
entier. C'est la leçon déjà tirée sur la marque `@sensible`, cas 57 et 58.

Les quatre tests ajoutés appellent donc la vraie route et regardent **le
disque** :

```
la tache supprime reellement un orphelin de quarantaine
la tache epargne un orphelin trop recent
la tache laisse intacts les fichiers publies
un appel sans secret ne supprime rien
```

Le premier a **rougi avant de verdir**, et c'est ce qui lui donne sa valeur : le
seuil d'une heure protégeait l'orphelin fraîchement déposé. Le remède a été de
vieillir le fichier de deux heures par `utimes`, **plutôt que d'abaisser le
seuil** : abaisser aurait testé une configuration que la production n'emploie
jamais. Le second test est le miroir du premier et compte autant, un
téléversement en cours de traitement devant survivre.

Cas 77 de `verifier-tests-mutation.sh` : neutraliser l'appel fait rougir le test
attendu. **77 mutations, 77 détectées.**

## La revue d'interface, six défauts

`ls-frontend-revue` en a trouvé six. Cinq se lisaient dans le code, le sixième
demandait une mesure.

**Le texte alternatif manquant n'était pas signalé**, alors que le commentaire
d'en-tête du composant l'affirmait comme troisième propriété à rendre visible.
Une affirmation fausse dans un commentaire, sans rien pour la contredire.
L'exploitante qui téléverse cinq photos et en décrit deux aurait découvert le
refus en LS-103, sur un autre écran, sans savoir lesquelles reprendre. Un
marqueur « Description à écrire » apparaît maintenant, lu depuis la base et non
depuis la saisie en cours.

**`width={320} height={320}` était faux dans les deux dimensions.** Le fichier
servi est la déclinaison 640, et `resize({ width })` ne contraint que la
largeur : la hauteur suit le ratio de la source, donc n'est jamais connue du
composant. Ces attributs servent à réserver la place ; les déclarer faux produit
exactement le décalage qu'ils existent pour éviter. Retirés, la place étant
réservée par une hauteur fixe en CSS.

**La zone d'annonce était montée à la demande**, sous `{enCours && ...}`. C'est
le défaut que le fichier voisin documente noir sur blanc depuis LS-85 : un
`role="status"` inséré après coup n'est pas toujours annoncé, le lecteur d'écran
surveillant une région qui existe déjà. Le composant appliquait correctement ce
motif à ses deux zones de message et l'enfreignait pour celle du traitement,
c'est-à-dire au seul endroit où l'attente dure deux secondes.

**Les aides n'étaient liées à aucun champ**, alors que les deux composants
voisins du même écran appliquent `aria-describedby`. Formats acceptés et limite
de taille étaient invisibles au lecteur d'écran, qui découvrait le refus après
avoir choisi un fichier.

**L'en-tête de carte était un `span`** là où la carte de variante emploie un
`h3`, avec la même classe. La liste des photos, la plus longue de l'écran,
n'apparaissait donc pas dans la navigation par titres.

## Le sixième défaut, et pourquoi il fallait le mesurer

La revue signalait que `bodySizeLimit: "25mb"` égal à `TAILLE_MAX_OCTETS`
rendait la borne inatteignable, le corps multipart étant plus gros que le
fichier. Le raisonnement est juste. **L'ampleur annoncée ne l'était pas** : elle
laissait entendre qu'un fichier de 24,8 Mo dépasserait.

Mesuré sur Node 22.23.2 :

```
fichier a la borne exacte : 26 214 400 octets
corps transporte          : 26 214 575 octets
surcout                   :         175 octets
```

Le surcoût est de 175 octets, pas de centaines de kilooctets. La fenêtre de
défaut existe bel et bien, mais elle fait deux cents octets : un fichier entre
25 Mo moins 200 octets et 25 Mo exactement était accepté par le service et
refusé par le transport, sans message utile.

C'est le motif déjà noté trois fois : **un rapport externe pointe la bonne zone
et se trompe sur la formulation**. Corriger sans mesurer aurait produit un
commentaire faux dans `next.config.ts`, exactement le genre d'affirmation
plausible qui survit des mois.

Le plafond passe à 26 Mo, et le commentaire porte la mesure ainsi que
l'avertissement : ne pas « aligner » deux chiffres qui ne mesurent pas la même
chose.

## Le README annonçait un compte faux depuis longtemps

`verifier-config-claude.sh` a signalé 76 annoncées contre 77 réelles. En allant
corriger, l'énumération par domaine s'est révélée pire : **quatorze compteurs
dont la somme faisait cinquante-six**, pour un total annoncé de soixante-seize.
Vingt cas manquaient, quatre stories n'y ayant jamais été portées.

Le README lui-même porte pourtant la consigne « ne jamais recopier ce nombre de
mémoire, il a déjà été faux ». Elle visait le total, qu'un contrôle vérifie ; le
détail par domaine, que rien ne vérifie, avait dérivé sans que personne le voie.

Les compteurs par domaine sont retirés au profit d'une liste de domaines sans
nombres. Seul le total reste, parce qu'un contrôle le confronte au script.

## La relecture qu'aucun script ne fait

`securite.md` impose de relire `.claude/familles-sans-action.txt` à chaque story
ajoutant un écran d'administration ou une Server Action. Fait, et tracé dans le
fichier.

Les quatre actions de médias ne relèvent d'aucune famille sensible. Le point qui
méritait d'être écrit plutôt que tranché en silence : **la suppression d'un
média est irréversible**, l'original ayant été détruit après traitement, donc la
photographie doit être reprise au téléphone. Ce n'est pas un critère de
classement pour autant, aucune des quatre familles n'étant définie par
l'irréversibilité. Étirer l'une d'elles pour couvrir ce cas serait le défaut de
LS-99 en sens opposé.

## Ce qui reste

**Le contrôle visuel aux quatre largeurs sur navigateur réel n'est pas fait.**
Il demande une session d'administration, et aucune n'existe dans la suite de
bout en bout : celle-ci couvre le refus sans session, aux trois largeurs. La
recette est en mémoire, inscription par l'API puis promotion, mais monter cela
proprement est un chantier distinct.

Trois points de lisibilité relevés par la revue restent à juger à l'œil : les
badges de statut portent tous le même fond sable, le rendu du `input
type="file"` natif à 320 px dépend du moteur, et une photo très panoramique
s'affichera plus petite que les autres sous une hauteur bornée.

## État des tickets

LS-102 **terminée**, les onze critères couverts sauf le contrôle visuel réel,
signalé ci-dessus. **LS-109 créée**, epic LS-3 : un média bloqué en
`EN_ATTENTE` après un téléversement interrompu, dont le message dit d'attendre
et de recharger alors que rien ne le débloquera jamais. Signalée par la revue
hors de son périmètre.

## Prochaine étape

LS-103, publication et archivage d'un produit, portes de sortie du brouillon.
Elle consomme directement ce que cette story a livré : le refus de publier sans
média principal, et l'exigence du texte alternatif que l'écran signale désormais
photo par photo.
