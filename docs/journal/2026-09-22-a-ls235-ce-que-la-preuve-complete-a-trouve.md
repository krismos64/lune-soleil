# 22 septembre 2026, ce que la preuve complète a trouvé après minuit

Suite directe de la session du 21, même sujet : LS-235 critère 7. La preuve par
mutation a tourné en entier pour la première fois, et elle a rapporté deux
défauts de plus.

## Un fichier muté échappait au filet de restauration

Le garde-fou de LS-80 a arrêté le script au cas 93 sur 180 :

```
ECHEC src/integrations/medias/urls.ts est mute mais absent de MUTABLES.
      Il ne serait ni sauvegarde ni restaure : la mutation resterait
      sur le disque apres l'execution.
```

`$URLS_MEDIAS` était déclaré et muté, mais absent de la liste. Ni sauvegardé par
copie, ni rattrapé par le `git checkout` de `nettoyer`, qui ne parcourt que
`MUTABLES`. C'est le motif exact qui avait laissé `auth.ts` sans sa garde
`input: false` en LS-230.

**Le défaut datait du jour où ce cas a été écrit.** Rien ne pouvait le signaler :
le nocturne mourait au cas 1 sur 180 depuis trois nuits.

## Le cas 92 ne mutait rien, et sa garantie n'est pas mince

Même origine. L'expression cherchait `sum(greatest(...))` d'un seul tenant, quand
le code étale `sum(` et `greatest(` sur deux lignes avec un `CASE WHEN` entre les
deux. Aucun caractère modifié, donc aucune preuve.

La garantie visée est la réservation ignorée dans le calcul de disponibilité :
le catalogue annonce « en stock » une pièce déjà engagée dans un paiement, et
deux clients se voient promettre le même bijou. Muter la soustraction seule porte
sur les deux occurrences, vitrine et fiche, et la détection est prouvée :

```
× deduit les reservations actives, deux pieces dont une reservee
× annonce EPUISE quand tout le stock est reserve
```

## Le faux négatif que je n'ai pas su expliquer

Cinq cas de bout en bout rendent `RATE`. Quatre échouent sur la même préparation,
`amorcer les comptes du profil`, avec une liste d'échecs réduite à deux lignes :
les tests n'ont jamais tourné, ils ont été sautés.

Le cinquième, le cas 12, résiste. Rejoué isolément, mutation réellement appliquée
et suite complète jouée, il passe :

```
>>> VERDICT : OK    536 lignes retenues, 24 occurrences du motif
   268 failed | 67 skipped | 1914 passed (3.7m)
```

**Deux affirmations que j'avais faites étaient fausses**, et la mesure les a
corrigées. Le `RATE` ne contenait pas que les lignes progressives : il portait
bien les 268 `✘` et les 268 récapitulatifs `N)`, comme le rejeu. Et le test
attendu n'était pas absent : il y figure huit fois, le motif vingt-quatre fois.

**La comparaison aurait donc dû rendre `OK` lors de l'exécution réelle.**
Reconstituée depuis le log, elle trouve le motif à chaque essai. Je n'ai pas
d'explication vérifiée et je n'en invente pas. Le défaut est intermittent,
préexistant, et il accuse un test parfaitement voyant : c'est le pire mode
d'échec de ce script, celui qui désigne un coupable innocent.

Il mérite son propre ticket. Il touche le bout en bout, pas le budget, et son
diagnostic demande une instrumentation que cette session n'avait pas.

## Ce que la preuve a confirmé par ailleurs

Deux exécutions complètes donnent la même cadence, ce qui vaut mieux qu'une
mesure unique :

```
runner, nuit du 21    1 cas en 12 min, puis coupure a 45 min
ce poste, deux fois   85 cas en 30 min
```

## Ce qui reste

**Le critère 7 ne se ferme pas.** Il demande un nocturne complet au vert, et seul
le prochain le dira. Ce qui est prouvé est le budget, pas le passage.

**Les 45 minutes restent en place**, faute d'un temps de step mesuré sur le
runner.

**`test:e2e` reste absent du contrôle préalable de verdeur**, alors que dix cas
s'appuient dessus. Environ 13 minutes par exécution pour 426 tests : arbitrage
de budget remonté à Christophe, non tranché.
