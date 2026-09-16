# 16 septembre 2026, LS-231 clos sans correction

Troisième page du jour, et la plus courte. Christophe a demandé si LS-231 pouvait
être clos en supprimant ce qui gêne, jugeant que ces détails de tests coûtent du
temps. La réponse tient en deux gestes séparés, dont un seul a été fait.

## Ce qui n'a pas été fait

**Le test n'est ni supprimé ni désactivé.** `tableau-bord.sequential.test.ts`
garde un défaut réel : le croisement des agrégats qui ferait afficher 6 commandes
en cours au lieu de 3 sur l'écran de l'exploitante. Un `it.skip` sort en 0 et ne
prouve rien, critère 7 du ticket lui-même.

Le désaccord a été dit une fois, avec la raison, puis la décision de fermer le
ticket a été appliquée. Ce sont deux choses distinctes : fermer un ticket coûte
zéro, neutraliser un test coûte une garde.

## Le trou d'isolation annoncé n'existait pas

L'option retenue était de fermer d'abord un écart de nettoyage repéré la veille :
le `TRUNCATE` du fichier ne nettoierait ni `avis` ni `demande_retractation`, deux
tables que le comptage lit.

**Mesuré avant de corriger, et il n'y a rien à corriger.**

```
NOTICE:  truncate cascades to table "demande_retractation"
NOTICE:  truncate cascades to table "avis"
  ... et douze autres

avis apres truncate : 0
demande_retractation apres truncate : 0
```

Les deux tables sont en `RESTRICT` sur `ligne_commande` et `commande`, ce qui
avait sans doute nourri l'erreur. Le `CASCADE` de `TRUNCATE` est structurel et
ignore le `delete_rule` : il vide quatorze tables au total.

**Deux commentaires du ticket affirmaient cet écart sans l'avoir mesuré**, dont
un qui écrivait « l'écart de nettoyage reste réel et mérite d'être fermé au
passage ». La piste n'était pas seulement écartée comme cause, elle n'avait aucun
fondement.

Le geste qui l'a vu tient en une transaction annulée sur la base. Il aurait pu
être fait la veille, au moment d'écrire l'affirmation.

## Pourquoi la fermeture est raisonnable

```
frequence locale     1 echec sur 6 executions completes
frequence en CI      jamais observe sur les executions examinees
blocage              aucun, main passe, les PR passent
cout d'une traque    ~7 min par passage, une dizaine de passages
```

Le défaut ne bloque rien. Le coût de sa traque dépasse ce qu'il fait perdre, et
c'est un arbitrage légitime.

## Le risque accepté, écrit plutôt que tu

Un rouge intermittent finit par être lu comme du bruit. Si ce fichier rougit un
jour sur un **vrai** défaut de comptage, il se confondra avec celui-ci.

C'est pourquoi la fiche mémoire d'entrée porte désormais ce défaut nommément :
un rouge sur ce fichier n'est pas forcément du bruit, et le ticket dit ce qui a
déjà été éliminé.

## Traçabilité

**Dépôt** : cette page, aucune modification de code.

**Jira** : LS-231 passé en Terminé, titre réécrit en « Clos sans correction » pour
qu'une liste de tickets terminés ne le fasse pas lire comme résolu. Un
commentaire porte la mesure du `TRUNCATE`, le risque accepté et ce qui reste
acquis pour une reprise.

**Mémoire** : la fiche d'entrée sort LS-231 de « ce qui reste ouvert » et le
range en défaut connu, avec la correction de la fausse piste.

## Prochaine étape

**Le nocturne de 7h** tranche LS-232 et LS-233, tous deux en attente de leur
dernier critère.

**LS-218**, l'expédition Sendcloud, est désormais le seul chantier de code
prioritaire sans dépendance externe.

Comptes relevés dans Jira : **198 terminés sur 223 hors epics**, **25 ouverts**.
