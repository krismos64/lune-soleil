# 9 septembre 2026, e : LS-110 et LS-144, et quatre tests périmés trouvés en route

Session courte demandée par Christophe : clôturer LS-110 et LS-144, avec
consigne explicite de **corriger sur place** toute anomalie plutôt que d'ouvrir
un ticket.

Les deux stories sont closes. Ce que la session a coûté en plus tient à trois
découvertes, dont deux qu'aucune des deux stories n'annonçait.

## LS-110 : deux points sur trois étaient déjà fermés

Vérifié avant d'écrire plutôt que supposé, la description datant du 15 août.

Le **point 3** avait été traité par LS-103, son commentaire le dit. Le **point 2**,
la ponctuation des états d'attente, était fermé par **LS-195**, commit `7f62e90`,
« ponctuation des textes d'attente, quinze annonces et six libellés ». Les quatre
blocs de l'éditeur portent tous `…` aujourd'hui.

Restait le **point 1**, le fil d'Ariane en balise native. Le ticket invitait à
chercher le même motif ailleurs : il y en avait bien **deux**, l'éditeur de fiche
produit et l'écran de création quand aucune catégorie n'existe.

## ESLint a la règle, en erreur, et ne voit pas le défaut

C'est le point le moins évident de la session, et il justifie un contrôle de
plus dans un dépôt qui en porte déjà beaucoup.

`@next/next/no-html-link-for-pages` est **active en erreur** par
`core-web-vitals`, vérifié par `eslint --print-config` qui rend `[2]`. Elle reste
muette sur le défaut. Mesure sur Next.js 16.2.12, trois liens posés dans un
fichier d'essai sous `src/app/administration/` :

```
<a href="/">                          -> ERREUR, la regle le voit
<a href="/panier">                    -> RIEN
<a href="/administration/categories"> -> RIEN
```

Elle ne rougit que sur le seul lien que personne n'écrit par erreur. Compter sur
elle, c'était croire la règle posée alors que le défaut passe.

## La preuve par mutation a trouvé un trou dans mon propre contrôle

`verifier-navigation-client.sh` écrit, vert sur le dépôt, quatre dérogations
déclarées par un marqueur `@rechargement-delibere`. Sa preuve par mutation a
**échoué au troisième cas**, le lien enveloppé sur plusieurs lignes.

La cause n'est pas celle que la relecture aurait trouvée. Le motif employait
l'alternance de GNU, `"<a$\|<a \|<a>"`, qui ne veut rien dire pour le **grep BSD
de macOS** : il la lit littéralement et manquait **dix des trente et une balises**
du dépôt, dont toutes celles enveloppées sur plusieurs lignes.

Le contrôle était vert sur le dépôt sain **et** vert sur le dépôt muté. Un
garde-fou muet sur un dépôt examiné au tiers.

**Une session interactive ne pouvait pas le voir non plus** : `grep` y est aliasé
sur `ugrep`, qui accepte les deux formes. Le script, lui, tourne sous `#!/bin/bash`
avec le grep du système. Mes premières mesures se contredisaient pour cette
seule raison.

## Ce que le contrôle corrigé a trouvé ensuite

Passé en `-E`, il voit 26 balises au lieu de 16, et désigne **deux navigations de
plus** que le ticket n'annonçait :

- `compte/formulaire-suppression.tsx`, le lien « Confirmer mon identité »
- `administration/factures`, les **filtres par période**, qui rechargeaient la
  page entière à chaque clic

Les filtres de commandes, cible de LS-144, employaient déjà `Link` : c'est
l'écran des factures qui avait divergé.

Deux limites assumées et écrites dans le contrôle : un `download` n'est pas une
navigation, et un `href={...}` construit à l'exécution n'est **pas jugé**. Lire
son littéral de tête a été essayé, et trouvait bien le défaut des filtres, mais
accusait aussi les liens vers les PDF de facture, qui pointent vers un `route.ts`
répondant en `application/pdf`. Distinguer les deux demande de résoudre une
expression, ce qu'un script textuel ne fait pas honnêtement. Le nombre est
**annoncé** pour qu'une hausse appelle une relecture.

## LS-144 : le constat ferme la story, critère 6

Le critère 1 exigeait de mesurer le rendu réel à 320 px avant toute
modification, et le critère 6 autorisait la fermeture sur constat.

Quatre tests dans `tests/e2e/filtres-commandes-320.spec.ts`, **tous verts** :

```
✓ le constat : la bande defile et un filtre est coupe par le bord (216ms)
✓ aucun debordement horizontal du corps (126ms)
✓ les zones tactiles tiennent 44 px, largeur comprise (147ms)
✓ le clavier atteint les sept filtres, hors ecran compris (151ms)
```

**Le défaut n'en est pas un.** À 320 px le troisième filtre est **coupé par le
bord**, et un libellé tronqué en plein mot est précisément l'indice de
défilement que la story cherchait à ajouter. Le cas qui aurait justifié un
dégradé est celui où la bande se terminerait **nettement** sur un filtre entier,
ne donnant alors aucun signe qu'il en reste.

Le clavier atteint les sept, le filtre actif garde son `aria-current="page"`, les
zones tactiles tiennent 44 px, et le corps ne déborde pas, mesuré par
`getBoundingClientRect` et non par `scrollWidth`.

Le fichier est **sorti des trois autres largeurs** dans la configuration
Playwright : il fixe lui-même sa fenêtre à 320 px et les y rejouerait à
l'identique, quadruplant le coût pour rien.

## Quatre tests qui avaient cessé d'exercer ce qu'ils annoncent

Trouvés en rejouant la suite, et **vérifiés en échec sur `main` intacte** avant
de conclure quoi que ce soit : ils ne viennent pas de cette branche.

Depuis **LS-129**, `webhook-paiement.ts` appelle `rendreFactureDeCommande` juste
après la confirmation. Quatre tests obtenaient l'état « PDF absent » en **ne
faisant rien**, ce qui suffisait avant.

Le plus parlant annonçait lui-même sa péremption dans son commentaire : « le
rendu est le sujet de LS-129 ». La story a été livrée, le test est resté sur
l'état d'avant.

Le code était juste dans les quatre cas. Ce sont les **mises en place** qui ne
produisaient plus l'état visé, les tests gardant leur nom, motif « valeurs qui
coïncident » déjà en fiche.

Corrigés en posant l'état explicitement, et **prouvés par mutation** plutôt
qu'affirmés : remplacer la garde `cheminPdf === null` par `if (false)` dans
`acces-document.ts` fait rougir « refuse quand le PDF n'a pas encore été rendu »,
**et lui seul**. Un test rendu vert sans exercer son cas serait resté vert.

## État des tickets

**LS-110 est livrée**, ses deux points restants faits, plus deux écrans que le
ticket n'avait pas vus.

**LS-144 est close sur son constat écrit**, critère 6, sans modification
cosmétique : le défaut supposé n'en est pas un, et la mesure le montre.

Aucun ticket créé, consigne de Christophe. Les quatre tests périmés sont
corrigés dans la même branche et rattachés à **LS-129**, qui les avait périmés.

## Prochaine étape

Inchangée depuis la session d : **LS-139**, le durcissement, qui porte aussi
l'alerte de seuil sur l'espace disque. Ou **LS-142**, la recette, quand
l'exploitante sera disponible.
