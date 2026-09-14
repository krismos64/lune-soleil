# 14 septembre 2026, le gabarit de titre s'arrête aux portes de la boutique

Première session du jour. Deux gestes : clore le dépôt sur LS-228, puis analyser
le design des pages publiques et de connexion face au prototype.

## Le canal dépôt de LS-228 n'était pas clos

Le journal de la veille affirmait « les PR #433, #434 et #435 sont fusionnées ».
C'était vrai, et incomplet : une quatrième PR existait depuis, **#436**, ouverte
et jamais fusionnée. Le hook de démarrage l'a signalée, « 1 commit absent de
origin/main, rien n'est livré ».

Contrôles verts, `MERGEABLE` et `CLEAN`, fusionnée en rebase. `main` est à
`21d5710`, l'écart local est à zéro.

**Le journal disait vrai sur ce qu'il énumérait, et faux par omission.** Une
énumération nominative de PR se périme dès la PR suivante, là où « le dépôt est
clos » se serait vérifié tout seul.

## Le même défaut que LS-228, sur le périmètre qu'il n'a pas couvert

Christophe a comparé les pages publiques au prototype : « le prototype n'est pas
correctement respecté sur le rendu visuel qui paraît plus fini, plus
professionnel ».

Mesuré sur la production par `getComputedStyle` à 1470 px, jamais lu dans une
feuille de style :

```
Accueil h1               system-ui 56px / 600   contre serif 88.2px au prototype
Catalogue h1             system-ui 40px / 600
Connexion client h1      system-ui 32px / 700
Connexion admin h1       system-ui 32px / 700
```

**Quatre échelles concurrentes**, 32, 36, 40 et 56. Aucun titre public n'emploie
`--ls-police-titre`, alors que le jeton existe bien sur la production. Les huit
fichiers qui l'emploient sont tous dans `compte/`, `administration/` ou la
navigation d'administration.

## La cause tient en deux mécanismes distincts

**C42 s'intitule « le titre d'un écran privé »**, et sa portée est limitative.
`verifier-gabarit-titre.sh` est ancré sur exactement deux chemins, les deux
layouts d'espace connecté. `(boutique)/layout.tsx` n'a ni module CSS ni élément
enveloppant, choix documenté à ses lignes 17 à 27 : il n'existe aucun sélecteur
analogue à `.colonne h1` où ancrer la règle.

**Les écrans de connexion échappent pour une autre raison, plus retorse.** Ils
vivent sous `compte/` et `administration/`, donc paraissent couverts. Mais
`compte/layout.tsx` sort avant le gabarit sans session, `return <>{children}</>`
à ses lignes 72 et 87. Une page de connexion est par définition atteinte sans
session : `.colonne` n'est jamais rendu, et C42 ne s'y applique pas.

**Un chemin couvert par une règle ne suffit pas à conclure qu'un écran l'est.**
La garde s'évalue à l'exécution, et un layout qui sort tôt la retire sans bruit.

## Ce que j'ai failli ticketer à tort

Le catalogue de production est vide, « Le catalogue s'étoffe, les premières
pièces arrivent bientôt ». L'absence de cartes produit vient des **données**, pas
du CSS, et les cartes ne pourront être jugées qu'après LS-23 et LS-24. Même
précaution que LS-228, qui avait laissé cinq écrans non jugés.

Le bandeau sombre du haut du prototype porte la classe `prototype` : c'est son
propre avertissement de maquette, pas un élément de design à reproduire.

## Une limite d'accès, contournée sans casse

Les deux espaces avaient une session ouverte, les URL de connexion redirigeaient
donc vers l'espace connecté. La session d'administration a expiré d'elle-même en
cours de session, ce qui a rendu l'écran visible. **Je n'ai déconnecté aucune
session de Christophe pour forcer le passage.**

## Ce qui a été livré

**LS-229 créé**, rattaché à LS-7 comme LS-228, priorité Medium, neuf critères
d'acceptation. `verifier-jira.sh` ne le signale ni sans epic ni sans lien.

Aucun lien `Blocks` posé, volontairement : LS-23 et LS-24 sont cités mais ne
bloquent pas le démarrage, la typographie se corrigeant sans aucune donnée. Le
skill est explicite, une citation n'est pas une dépendance, et un lien faux est
pire qu'une absence de lien. Le motif est écrit en commentaire.

## Prochaine étape

LS-229 est prêt à être implémenté. Les deux chantiers de code ouverts et non
bloqués par une réponse de l'exploitante sont **LS-229** et **LS-218**
(expédition Sendcloud). LS-228 reste en cours, son second volet attendant LS-153.

Comptes relevés dans Jira, jamais déduits : **195 terminés sur 219 hors epics**,
**24 ouverts**, dont **9 En cours**. LS-229 est le 219e.
