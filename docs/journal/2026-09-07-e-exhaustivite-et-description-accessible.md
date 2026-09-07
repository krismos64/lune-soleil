# 7 septembre 2026, e : deux dettes fermées, et la cause était en amont dans les deux cas

Session courte demandée par Christophe : enchaîner le maximum de tickets
entièrement clôturables. Trois retenus après lecture des descriptions, LS-143,
LS-202 et LS-161. Deux sont livrés, le troisième est **suspendu sur un
arbitrage** que la mesure a rendu nécessaire.

## LS-143, le `default` n'était que le symptôme

Le ticket demandait de retirer un `switch` à `default` de `formaterOrigine`. La
correction évidente, une branche `never`, aurait laissé le trou ouvert.

**Le service élargissait le type en amont.** `administration-commandes.ts`
déclarait `origine: string` et jetait l'enum que Prisma rend. Tant que l'entrée
est un `string`, aucune table exhaustive ne protège quoi que ce soit : la
correction porte sur **deux endroits**, la table et le type du service.

La contre-preuve est ce qui donne sa valeur à la mutation :

```
enum à 4 valeurs + ANCIEN code   ->  type-check VERT, le trou est réel
enum à 4 valeurs + nouveau code  ->  TS2741 sur affichage-commande.ts:117
```

Sans la première ligne, rien ne dirait que le contrôle attrape un défaut qui
existait vraiment.

### Le jumeau trouvé par le recensement

Le critère 3 demandait de chercher le motif ailleurs. 29 `switch` examinés :
aucun ne teste un enum du schéma, 22 sont déjà exhaustifs sans `default`, et le
dépôt porte une doctrine explicite répétée dans cinq commentaires.

Le motif vivait en revanche sur une table de libellés. **`LIBELLES_PAIEMENT`
était le cas identique**, `Record<string, string>` indexé par une valeur d'enum
élargie en `string` par le même service. Son commentaire annonçait déjà la
correction, « le jour où un écran client l'emploiera, ce type devra devenir
exhaustif ». Attendre cet écran était une erreur de raisonnement : c'est
l'élargissement au service qui ouvrait le trou, pas l'identité de l'appelant. Un
sixième statut de paiement se serait affiché en majuscules brutes à
l'exploitante.

### Le critère 5 s'appuyait sur des tests inexistants

Il disait « prouvé par les tests d'affichage de LS-121 ». **`affichage-commande.ts`
n'avait aucun test**, alors que dix fichiers l'importent, dont l'espace client et
six écrans d'administration. C'est exactement ce qui a laissé le défaut vivre
onze jours.

Treize tests écrits, éprouvés par deux mutations, deux tests rougissant sur des
libellés confondus et trois sur un fuseau en UTC.

## LS-161, une justification fausse propage un défaut

Un `aria-describedby` visait une région portant `aria-label`. Le calcul de la
description consultant le label avant le contenu, le bouton s'annonçait
« Générer le document, Génération du document » et **jamais** « La génération a
échoué. La facture reste valide et son numéro est inchangé ».

**Le commentaire justificatif était faux**, et c'est lui le vrai sujet. Il
invoquait le besoin de distinguer deux régions `status` du même écran. Or
`aria-label` ne change rien à l'annonce d'une mise à jour de `role="status"`,
seul le contenu étant vocalisé. LS-160 avait corrigé un des deux écrans ; le
second a été recopié de bonne foi.

Le commentaire est corrigé plutôt que supprimé, et son jumeau de
`remboursement.tsx` aussi : son en-tête annonçait encore « `aria-label` LA
NOMME » au-dessus du code qui l'avait retiré.

### Le contrôle a d'abord accusé le code exemplaire

Sa première version comptait les commentaires, donc rougissait sur les deux
écrans corrigés, qui **nomment** l'attribut pour expliquer son absence. Un
contrôle rouge sur du code juste pousse à retirer l'explication. Motif déjà payé
ici par le hook de secrets qui bloquait son propre commentaire, et le cas 4 de
la preuve par mutation le garde désormais fermé.

Cinq cas sur cinq, dont deux qui ne vont pas de soi : le commentaire, et une
cible vivant dans un **autre fichier** que celui qui la décrit.

Règle **C39** posée dans `frontend-design.md`, avec le mécanisme et non la seule
interdiction, puisque c'est une interdiction nue qui s'est fait franchir.

## LS-202 suspendue, l'alphabet est épuisé

Le ticket demande de renuméroter les étapes de `controles.yml` dans l'ordre
d'exécution. La mesure a montré deux choses que la description n'anticipait pas.

**Le désordre est plus large qu'annoncé.** Six numéros en doublon, comme écrit,
mais aussi `6s`, `6t` et `6u` placées **avant** `6o` et `6m`, et les contrôles
`2`, `3`, `4`, `5` qui s'exécutent après toute la famille `6`.

**La famille 6 porte 28 étapes pour 25 lettres disponibles.** Une renumérotation
en `6b` à `6z` ne rentre pas. Le script écrit pour la faire s'arrête sur ce
constat plutôt que d'inventer `6aa`, et n'a rien modifié.

La cause est en amont, comme pour LS-143 : **seules les quatre premières étapes
valident réellement le schéma**, c'est-à-dire le contrôle 6 de `CONTRIBUTING.md`.
Les vingt-quatre autres sont des contrôles textuels sans rapport, numérotées
`6x` parce qu'elles ont été ajoutées là. Leur donner leur propre numéro est un
changement de périmètre, donc un arbitrage de Christophe.

## Deux anomalies signalées, puis corrigées sur arbitrage

Consigne de la session : signaler plutôt que ticketer. Christophe a demandé la
correction des deux dans la foulée, commit `88a2847`.

**Le tarif domicile de la CI contredisait ADR-035.** `controles.yml` et
`nocturne.yml` portaient `SHIPPING_HOME_RATE_CENTS: "499"` quand ADR-035 fixe
**749** depuis le 6 septembre, le prix coûtant. La valeur avait été portée dans
`.env.example` et dans les tests, jamais dans les deux workflows.

C'est le défaut du 25 août **reproduit à l'identique sur la même variable**, et
le commentaire de `controles.yml` le racontait déjà quelques lignes plus haut.
Un récit d'incident dans un commentaire n'empêche pas sa répétition ; la raison
du chiffre est désormais écrite aux deux endroits.

Les 499 restants n'ont pas été touchés : ce sont des montants **figés dans des
commandes de test**, qu'une commande passée conserve, invariant 3.

**`liste-adresses.tsx` jetait le message de saisie invalide.** Trois `case` sur
cinq membres, le `default` absorbant les deux autres : le message composé par le
socle Zod, qui nomme le champ fautif, était remplacé par « momentanément
indisponible ». Le client lisait une panne là où il avait fait une faute de
saisie. Le cas est **atteignable**, les deux gestes de la liste passant par
`agir` qui valide l'identifiant.

### Retirer le `default` ne suffisait pas, et la mutation seule l'a montré

```
6e membre ajouté, switch exhaustif sans default  ->  type-check VERT
6e membre ajouté, avec la garde `never`          ->  TS2322, nomme la ligne
```

`appliquer` ne retourne rien, donc TypeScript n'avait rien à signaler. **Les
`switch` du dépôt qui rougissent le font parce qu'ils rendent une valeur** :
c'est le `return` manquant qui est signalé, jamais le `switch` lui-même. Vérifié
sur `categories/actions.ts`, cité comme exemplaire dans son propre commentaire,
dont un membre ajouté fait bien échouer deux fichiers en `TS2366`.

La correction évidente, « retirer le `default` », aurait donc produit un code
qui **a l'air** protégé et ne l'est pas. C'est la troisième fois de la session
que la forme attendue ne ferme rien.

### Ce que la couverture ne voyait pas

Le test e2e « une saisie invalide est refusée sans quitter l'écran » porte sur le
**formulaire**, déjà correct. Le chemin de la **liste** n'était couvert par rien.

**`EXPLICATION_SANS_GESTE` reste ouvert**, même motif avec un repli générique et
vrai, « Aucune action disponible ». Non corrigé, non ticketé.

## État des tickets

**LS-143 LIVRÉE ET CLOSE**, PR #276 fusionnée en rebase, commit `f92c1c7`.
**LS-161 LIVRÉE ET CLOSE**, PR #277 fusionnée en rebase, commit `dd191f8`, ses
deux étapes neuves `6v` et `6w` vertes en CI.
**LS-202 suspendue** sur l'arbitrage du découpage des numéros.

Comptes relevés dans Jira après les deux fermetures, jamais recopiés :
**135 tickets terminés sur 192**. Le dénominateur n'a pas bougé depuis ce matin,
aucun ticket n'ayant été créé, conformément à la consigne de la session.

## Prochaine étape

L'arbitrage sur LS-202, puis LS-200 qui attend toujours les clés Sendcloud.
