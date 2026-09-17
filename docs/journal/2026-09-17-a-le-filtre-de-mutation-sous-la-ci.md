# 17 septembre 2026, le filtre qui ne voyait rien sur le runner

Session courte, déclenchée par un nocturne rouge. Christophe demande de corriger
sans ticket ni PR, et de pousser sur `main` par exception.

## Le rouge

Nocturne de 7h02, étape « Preuves par mutation lourdes » en échec :

```
  6 mutations, 6 NON detectees ou detectees ailleurs
```

Les six cas de `verifier-etats-non-nominaux-mutation.sh` en RATE, chacun avec la
même forme :

```
  RATE  l'etat vide des declinaisons change de texte -> echec constate, mais PAS sur le test attendu
          attendu : les trois etats vides de l'editeur sont rendus et nommes
          echecs reels :

```

La liste d'échecs réels est **vide** sur les six. Le nocturne de la veille, avant
le correctif LS-233, en rapportait **un seul**. Le correctif a donc cassé les
cinq qui passaient.

## Ce que le filtre faisait

LS-233 avait ancré le filtre des lignes d'échec pour écarter la barre de
progression de Playwright, `········×F`, qui ne nomme aucun test :

```bash
grep -E '^[[:space:]]*(×|✘)[[:space:]]' "$TMP/sortie.txt"
```

L'ancre est juste. Elle ne suffit pas, et le commentaire qui l'accompagnait
affirmait avoir confronté « la sortie réelle des deux lanceurs » : la sortie
**locale**, pas celle du runner.

## Ce que la mesure a donné

Les deux lanceurs changent de format en intégration continue.

`playwright.config.ts` porte `reporter: process.env.CI ? "github" : "list"`. Le
reporter `github` n'imprime ni ligne `✘ nom`, ni barre de progression. Mesuré sur
un test jetable :

```
  1) [mobile-320] › tests/forme.spec.ts:3:5 › le panneau d'archivage s'ouvre...
::error file=...,title=[mobile-320] › ... › le panneau d'archivage s'ouvre...
```

Vitest ajoute son reporter `github-actions` dès que `GITHUB_ACTIONS` est posé. Il
ne remplace pas le `default`, il s'y **ajoute** : la ligne `× nom` reste. Mesuré
aussi, et c'est ce qui a écarté une première hypothèse.

Les quatre formes réelles :

```
✘   9 [mobile-320] › fichier.spec.ts:58:7 › le nom du test   Playwright list
  1) [mobile-320] › fichier.spec.ts:3:5 › le nom du test     Playwright github
 × un cas qui echoue                                         Vitest local
::error file=...,title=[composant] ... > le nom du test,...  Vitest github
```

Et celle à ne pas retenir, `········×F`.

## La virgule encodée

Vitest encode la virgule du nom de test dans `title=` :

```
title=[composant] ... > sans aucune categorie%2C l'ecran dit quoi faire et ou
```

Un motif attendu qui porte une virgule, et trois des six en portent une, ne se
retrouverait pas sans décodage. Playwright ne l'encode pas dans sa ligne
numérotée. Le filtre décode `%2C`.

## Les deux verts du 16 ne prouvaient rien

Avant LS-233, le grep nu retenait la barre de progression. Les cas 5 et 6
passaient donc pour détectés sur une suite de points qui ne nomme aucun test. Le
rouge était faux dans un sens, puis dans l'autre : un garde-fou qui se trompe en
vert est plus coûteux qu'un garde-fou absent.

## Ce qui a coûté le plus de temps

Pas la cause, le **diagnostic**. Six cas en RATE avec « echecs reels : » suivi de
rien, et rien dans le rapport ne permettait de dire si le test était aveugle ou si
le filtre l'était. Quinze lignes de sortie brute auraient tranché en une minute.

Le rapport les imprime désormais quand le filtre ne reconnaît aucune forme.
Prouvé par mutation du filtre lui-même : neutralisé, le script affiche bien la
trace d'erreur Vitest au lieu du vide.

## Les deux autres scripts

`verifier-tests-mutation.sh` et `verifier-reintegration-stock-mutation.sh`
portaient le même filtre. Le commentaire du second affirmait que le défaut ne
l'atteignait pas puisqu'il ne lance que Vitest : faux, Vitest bascule aussi sur
le runner. Les trois sont alignés.

## Preuve

Script complet, les deux bases en place :

```
  6 mutations, 6 detectees par le test attendu
```

Contrôle négatif vérifié : un test passé au vert n'est pas confondu avec un
échec.

## Dérive assumée

Christophe demandait un push direct sur `main`, sans PR. `main` porte
`enforce_admins: true` et GitHub a refusé :

```
remote: - Changes must be made through a pull request.
```

Signalé plutôt que contourné : lever la protection pour ce correctif aurait
désactivé le contrôle vert sur le dépôt entier. Passé par la PR 451, chemin
normal, fusionnée en rebase.

## Un second défaut, trouvé en creusant le rouge

Le nocturne était rouge **six nuits d'affilée**, pas une. En regardant les cinq
précédentes, deux causes distinctes apparaissent.

Du 12 au 15 septembre, c'est « Scénarios critiques de bout en bout » qui
échouait : douze tests sur 2155, dont un `strict mode violation` sur un lien
dupliqué dans la navigation par catégorie. Ces douze sont verts depuis le 16,
corrigés par les stories de la journée. Vérifié que rien n'a été escamoté :
2143 + 12 = 2155 passés, et 70 ignorés dans les deux relevés, donc aucun test
retiré ni mis en `skip`.

Le vrai problème est ailleurs, et il est structurel.

## Quatre preuves par mutation n'ont pas tourné depuis trois nuits

Le step « Preuves par mutation lourdes » lance six scripts à la suite dans un
seul `run`. GitHub l'exécute sous `bash -e` : **le premier script en échec coupe
le step**, et les suivants ne tournent pas.

`verifier-etats-non-nominaux-mutation.sh` est en deuxième position. Il échouait
les 15, 16 et 17. Donc `verifier-reintegration-stock`, `verifier-sauvegarde`,
`verifier-tests` et `verifier-regles` n'ont rien prouvé depuis le 14, dont la
preuve de la suite d'intégration entière et celle d'une zone critique.

Le rapport nommait bien un échec. Rien ne permettait de voir que quatre preuves
manquaient derrière lui : un garde-fou qui ne tourne pas ne se signale pas.

Le step boucle désormais sur les six, retient le premier code non nul et sort
avec lui. Chaque script rend son verdict, et le step reste rouge dès que l'un
échoue. Éprouvé sur banc d'essai aux trois cas : tout vert sort en 0, un échec
propage son code sans masquer les suivants, deux échecs retiennent le premier.

## Ce que les quatre scripts masqués cachaient

Rien, et c'est la bonne nouvelle. Lancés localement :

```
verifier-regles-mutation             15 mutations, 15 detectees
verifier-sauvegarde-mutation         11 cas joues, 0 echec
verifier-reintegration-stock-mutation 8 mutation(s) detectee(s) sur 8
```

Ils étaient verts. Ils ne prouvaient simplement plus rien, ce qui est le même
résultat qu'un garde-fou absent.

## Un troisième défaut, trouvé en auditant la documentation

Christophe a demandé de vérifier que tout était à jour avant de quitter la
session. L'audit a trouvé un contrôle aveugle, ce qui est plus grave que les
écarts de rédaction qu'il cherchait.

`README.md` annonçait **166 mutations** pour `verifier-tests-mutation.sh`, qui en
porte **180**. Or `verifier-config-claude.sh` recompte ce nombre exprès, depuis
août, parce que ce compte s'était déjà périmé trois fois. Il était vert.

La cause est dans `compte_annonce` : elle ne lit que les nombres **écrits en
lettres**, via une liste qui s'arrête à quatre-vingt-dix-neuf. Passé cent, le
README écrit en chiffres, la capture rend une chaîne vide et la comparaison n'a
tout simplement pas lieu. Le contrôle ne pouvait pas échouer sur le défaut qu'il
prétendait attraper.

Corrigé : les lettres d'abord, le chiffre arabe en repli. **Prouvé dans le bon
ordre**, le contrôle d'abord, le README ensuite :

```
avant correction du README    README.md annonce 166 mutations, le script en porte 180
apres                          configuration Claude Code coherente
```

## Ce que la revue documentaire a corrigé

- `README.md` : le compte 166 vers 180, et le statut de LS-232 et LS-233, qui
  disaient encore « attendent le nocturne » alors qu'il a tranché
- les comptes de tickets, relevés dans Jira et non dérivés : **200 terminés sur
  224**, **10 En cours** et non onze, LS-232 ayant été clos ce jour
- `docs/PREUVES-PAR-MUTATION.md` : le 1013 s présenté comme mesuré alors qu'il
  est une somme, l'absence de toute mention du masquage, et la limite du document
  qui ne distinguait pas « ne prouve rien » de « ne s'exécute pas »
- `CLAUDE.md` : les six preuves lourdes manquaient à la liste de ce qui entre sur
  `main` sans bloquer, et la règle sur les contrôles ignorait le cas « ou qui ne
  tourne pas ». Le fichier est à sa limite de 200 lignes, donc la place a été
  reprise sur le passage voisin plutôt qu'ajoutée
- `.claude/skills/story/SKILL.md` : deux règles ajoutées, la liste d'échecs vide
  qui n'est pas un verdict, et la mesure d'un filtre dans les deux modes
- `docs/REFERENCES.md` : « où chaque preuve tourne » devient « est déclarée », et
  grouper plusieurs scripts dans un step entre dans la colonne « à lire avant »
- `docs/deploiement/EXPLOITATION.md` : le renvoi « cas 115 » cité désormais par
  son libellé, son rang se décalant, et « 9 cas » corrigé en 11
- `.github/workflows/nocturne.yml` : « 969 s à elles quatre » pour six scripts

## Ce que je n'ai pas touché

`controles.yml` groupe **vingt-deux** scripts de la même façon, mais le
comportement y est documenté et assumé : « elles s'arrêtent à la première
rouge ». Sur une PR l'auteur corrige et relance, donc rien ne reste masqué ;
au nocturne personne ne relance. Élargir ce step demanderait un arbitrage de
Christophe, il est signalé plutôt que modifié.

`verifier-tests-mutation.sh` a été **interrompu** après cinq cas sur cent
quatre-vingts : en local il rejoue la suite d'intégration à chaque cas, sans le
cache chaud du runner. Son verdict n'était pas nécessaire, le correctif du step
étant prouvé sur banc d'essai. Les trois autres scripts masqués sont verts.

## LS-29, une question de Christophe et deux écarts de traçabilité

« LS-29 est fait non ? » En vérifiant, deux choses ressortaient.

**La relecture finale par l'exploitante était faite**, Christophe l'a confirmé :
les dix textes définitifs et le rendu HTML, après le 13 septembre. Le commentaire
du 12 septembre bornait explicitement la validation précédente au seul ton, « pas
les dix textes dans leur version définitive, dont ceux écrits après son départ ».
Cette dette est levée, et rien ne l'avait enregistré.

**Le critère 4 avait changé de motif sans que personne le note.** Il demande un
email reçu dans une vraie boîte, sur au moins deux fournisseurs. Le README
affirmait encore « aucun de ces messages n'ayant jamais été reçu dans une vraie
boîte », ce qui était faux depuis le 13 septembre 14h47 :

```
c.mostefaoui@yahoo.fr   14:44   Yahoo   boite de reception
kayouw641@gmail.com     14:46   Gmail   boite de reception
contact@smartplanning   14:47   OVH     boite de reception
```

Trois fournisseurs sur trois, la condition « au moins deux » est dépassée. Mais
une soumission de contact ne dépose que **deux modèles sur dix**,
`message-contact.ts` lignes 275 et 315. Les huit autres n'ont jamais été envoyés
en réel, faute d'événement réel.

Le même README affirmait par ailleurs, ligne 39, que LS-222 avait observé les
emails « sur Yahoo, Gmail et OVH, les trois en boîte de réception ». **Les deux
phrases se contredisaient** à quelques centaines de lignes d'écart.

## Pourquoi le script d'envoi réel ne comble pas le trou

`npm run email:reel` porte son modèle **en dur**, `alerte-connexion-administration`
en ligne 83, qui n'est aucun des dix. Le motif est écrit dans le code : c'est le
seul modèle sans lien, un lien de vérification pointerait vers un jeton
inexistant. Le destinataire est paramétrable, le modèle non.

Les huit modèles restants dépendent donc d'un achat réel, donc de LS-153, ou
d'un élargissement du script qui sortirait du périmètre écrit de LS-29. Posé en
arbitrage dans le ticket plutôt que tranché seul.

## Prochaine étape

Le nocturne du 18 tranche : c'est lui qui prouve le correctif du filtre dans les
conditions où le défaut est apparu. La preuve locale ne couvre pas le reporter
`github`, que seule la CI active.

Il prouve aussi le second correctif, par une propriété observable : le rapport
doit porter **six** bilans de mutation, là où les trois derniers n'en portaient
que deux.
