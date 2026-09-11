# 11 septembre 2026, g : LS-85, deux règles du dépôt se contredisaient

Une story à quatre critères sur cinq depuis le 1er septembre, dont le dernier
exige une écoute humaine au lecteur d'écran que je ne peux pas faire. Ce que
j'ai trouvé en cherchant ce qui restait vaut plus que le critère.

## Deux règles opposées, toutes deux mesurées

**LS-85, le 1er septembre**, a nommé sept régions live du parcours d'achat après
avoir capturé l'arbre d'accessibilité réel : deux régions anonymes sur une même
page y sont indiscernables, et `axe-core` ne le voit pas.

**La règle C39, posée par LS-161**, écrit en toutes lettres : « **nommer une
région live ne sert à rien** ». Elle l'a mesuré sur un bouton qui s'annonçait
« Générer le document, Génération du document » au lieu de lire la phrase utile.

Les deux ont mesuré, et les deux ont raison. **La contradiction vient de la
portée**, pas du fond.

| Ce qui est en jeu | Le nom sert-il ? |
|---|---|
| l'**annonce** d'une mise à jour | **non**, seul le contenu est vocalisé |
| la **navigation** par régions, la lecture de l'arbre | **oui**, une région anonyme s'y annonce « status » sans plus |
| un élément visé par `aria-describedby` | **non, et c'est nuisible** : le label remplace le texte réel |

C39 énonçait une phrase générale à partir d'un cas particulier. Sa formulation
est corrigée, son fond intact.

**La spécification WAI-ARIA 1.2 ne tranche pas**, vérifiée à la source :
`status` et `alert` acceptent un nom d'auteur sans l'exiger, et elle ne dit pas
ce qu'un lecteur d'écran en fait à la mise à jour. C'est écrit dans la règle
plutôt que laissé à supposer.

## Ce que LS-85 avait posé sans rien pour le tenir

**59 régions live anonymes contre 21 nommées**, mesurées sur le dépôt entier. Les
sept de LS-85 tenaient, et tout le reste avait été écrit sans elles.

Les deux tests de bout en bout du 1er septembre verrouillent l'**arbre
existant** : ils rougissent si un `aria-label` disparaît. Aucun ne disait qu'une
région **neuve** devait en porter un.

C'est le motif « règle juste, portée non mesurée », pour la troisième fois de la
journée.

## Ce que j'ai décidé de ne pas faire

**Je n'ai pas nommé les 59.** La spécification est ambiguë, le gain est incertain,
et un chantier de cette taille sur une base incertaine se paierait en
régressions plutôt qu'en accessibilité.

Ce qui est **mesuré** est le parcours d'achat, celui dont `frontend-design.md`
exige WCAG 2.2 AA, et c'est lui que le contrôle garde. La portée est écrite dans
son en-tête plutôt que laissée à deviner.

## Une nuance que le contrôle porte

**Une région qui enveloppe son propre titre n'a pas besoin de nom**, et lui en
donner un serait nuisible : le `h1` qu'elle contient **est** ce qu'elle annonce.
La page d'erreur de la fiche produit est dans ce cas.

Le contrôle le reconnaît à sa **forme** et non à son chemin : exclure le fichier
laisserait passer une future région ponctuelle du même fichier.

## Le garde-fou a fait son travail contre moi

Ma première version imbriquait l'analyse Python dans une substitution de
commande shell. Une **apostrophe** dans un commentaire Python y fermait la chaîne :
le script trouvait zéro région.

Il a dit « aucune région trouvée, son ancrage est cassé » plutôt que de conclure
« toutes nommées » sur zéro examen. C'est exactement ce pour quoi ce garde-fou
existe, et il m'a visé moi.

L'analyse vit désormais dans `scripts/lister-regions-live.py`.

## Vérifications

```
verifier-regions-live-parcours.sh     9 régions, 9 correctes
mutation du nom retiré                détectée
verifier-description-accessible.sh    conforme
verifier-config-claude.sh             configuration cohérente
verifier-regles.sh                    règles conformes au schéma
controles.yml                         YAML valide, étape 9s quinquies
```

## État des tickets

**LS-85 reste En cours**, sur son seul critère 5 : la vérification au lecteur
d'écran demande une personne devant la machine avec VoiceOver ou NVDA. Aucun
outil ne la simule, et la fermer déclarerait vérifié un point qui ne l'a pas été.

**LS-165 fusionnée**, PR #385. **LS-77 et LS-190 closes.**

## Prochaine étape

**LS-64**, la page Statistiques, ou **LS-123**, les pages de contenu.
