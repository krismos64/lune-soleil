# 9 septembre 2026, m : le nocturne a trouvé un défaut que j'avais introduit

Session courte et instructive. Le nocturne devait confirmer que LS-210 fermait le
dernier rouge. Il a confirmé ce point et en a révélé un autre, de moi, vieux de
cinq heures.

## Ce que je croyais, et ce qui était vrai

`Audit des dépendances : success`. LS-210 est bien fermée.

**Mais le nocturne reste rouge**, sur les scénarios de bout en bout.

**J'avais affirmé que ces scénarios passaient**, dans un point d'étape. C'était
faux. J'avais lu l'exécution de 12h14, **antérieure au commit `643ade3` de
17h31** par lequel j'ai retiré les dix `loading.tsx` en session i. Cette
exécution ne disait rien de l'état du jour.

Motif déjà connu ici : une mesure a une date, et la citer sans elle en fait une
affirmation sur le présent qui n'a jamais été vérifiée.

## Le défaut, et pourquoi le premier indice était trompeur

Huit tests de `chargement-administration.spec.ts` cherchaient des textes
« Chargement des… » portés par les `loading.tsx` supprimés.

**Deux annonces avaient effectivement changé** au passage, « des comptes »
devenue « des clients » et « des factures » devenue « des documents ». L'indice
le plus visible orientait donc vers une mise à jour de chaînes.

**Elle n'aurait rien réparé.** Six écrans sur six échouaient, dont **quatre au
texte inchangé**.

**La cause est une propriété du mécanisme, pas un texte.** Le test lit le premier
morceau du flux HTTP, où un `loading.tsx` place son repli à coup sûr. Un
`<Suspense>` interne n'émet le sien **que si le rendu suspend réellement**, et
une base locale répond avant.

Le fichier énonçait déjà cette règle, pour cinq autres écrans qui étaient dans ce
cas. Elle vaut désormais pour tous les quinze.

## Ce que la correction garde, et ce qu'elle perd

**Gardé, et vérifié plutôt que supposé** :

```
./scripts/verifier-chargement-administration.sh
Écrans d'administration en force-dynamic examinés : 15
  dont 0 avec loading.tsx, 14 avec <Suspense> interne, et 1 sans attente mesurable
```

**Perdu, et il faut le dire** : la mesure de débordement de l'armature à 320 px,
et la preuve que le repli est réellement **servi**. Un contrôle textuel ne
remplace pas un test d'exécution. Cette mesure demande la latence du VPS et
relève de LS-140 ; c'est écrit dans le fichier au point de mesure, pas seulement
dans le commit.

Les deux boucles sont **vidées mais conservées** : un écran redevenu observable
se rajoute en une ligne, quand supprimer le mécanisme obligerait à le réécrire.

## Trois mutations, dont deux qui ne prouvaient rien

Les deux tests restants sont prouvés :

```
titre changé en une valeur sans recouvrement    -> 1 failed
point de suspension remplacé par trois points   -> 1 failed
```

**Ma première mutation était inopérante.** Renommer le titre en
`MUTE-Factures et avoirs` laissait le test vert, parce que
`getByRole("heading", { name })` fait une correspondance **partielle** : la
chaîne cherchée y était toujours contenue.

**J'ai d'abord accusé le mauvais coupable**, en attribuant ce vert au serveur
Playwright réutilisé, fiche connue sur ce dépôt. Vérification faite, le build
avait bien été refait et contenait la mutation :

```
grep -rl "MUTE-Factures" .next/
.next/standalone/.next/server/chunks/ssr/src_0hlf65j._.js
```

La fiche existante m'a orienté vers une explication plausible et fausse. Elle
n'était pas en cause ici.

**Ma troisième mutation ne mutait rien.** Un `grep --include=*.tsx` rate les
chemins à parenthèses, `(boutique)` : la cible sortait vide, aucune mutation
n'était posée, et le test affichait « 8 passed ».

**C'est le cas le plus dangereux de la journée.** Sans le code 128 d'une commande
`git` suivante, j'aurais lu ce vert comme « le test ne détecte rien » et accusé
une correction saine. Le garde-fou tient en trois caractères,
`grep -q ... || exit 1`, et il est désormais dans mes commandes.

## Une faiblesse signalée, non corrigée

`getByRole` en correspondance partielle : un titre affublé d'un préfixe parasite
passerait inaperçu. C'est ce qui a rendu ma première mutation verte à tort. Hors
périmètre de cette correction, consigné dans le commit et la PR pour ne pas être
perdu.

## État des tickets

**LS-210 est close**, `npm audit` rend zéro et l'étape du nocturne le confirme.

**LS-139 : les sept critères sont satisfaits.** Elle sera close après une
exécution verte du nocturne de bout en bout, en cours au moment d'écrire. Ne pas
la clore sur la foi des critères pris un par un : c'est précisément l'écart entre
« chaque pièce marche » et « l'ensemble marche » que cette session a illustré
deux fois.

## Prochaine étape

Clore LS-139 si le nocturne est vert. Sinon, traiter ce qu'il montre.

Puis LS-140, qui porte la mesure de performance et d'accessibilité sur le site
déployé, et qui hérite au passage de la mesure de débordement perdue ici.
