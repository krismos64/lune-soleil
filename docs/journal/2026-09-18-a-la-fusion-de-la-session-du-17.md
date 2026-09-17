# 18 septembre 2026, la fusion qui a franchi minuit

Page courte, et elle existe pour une raison mécanique : la PR 454 a été fusionnée
à **00h04**, donc `verifier-config-claude.sh` réclame une page à cette date. Le
travail, lui, est celui du 17 septembre et vit dans
`2026-09-17-a-le-filtre-de-mutation-sous-la-ci.md`.

## Ce qui est entré sur `main`

```
77fa942  docs: la colonne des stories ouvertes ne sommait pas
0f80807  fix: une affirmation fausse sur Vitest, et la commande de comptage
800b89e  fix: une preuve par mutation ne tournait nulle part
```

Contrôles verts avant fusion, 14 min 18 s, puis revérifiés sur `main` à jour :
couverture des preuves 44 sur 44, règles conformes, configuration cohérente.

## Le contrôle a bien fait son travail

Il a crié sur une absence de journal réelle, pas sur un faux positif. Une session
qui franchit minuit laisse du code daté du lendemain sans page correspondante, et
c'est exactement le trou que ce contrôle garde. Le corriger en changeant la règle
aurait été le mauvais réflexe.

## Ce que le nocturne de 7h tranche, dans deux heures et demie

Trois propriétés observables, toutes posées par la session du 17 :

1. le filtre de mutation lit les formes des reporters de CI, donc
   `verifier-etats-non-nominaux-mutation.sh` ne rapporte plus six RATE avec une
   liste vide
2. le rapport porte **sept** bilans de mutation, six du step groupé plus celui de
   l'image Docker, là où les trois derniers nocturnes n'en portaient que deux
3. l'étape de bout en bout reste verte, ce qui a clos LS-232

Si le premier point échoue, l'instrumentation ajoutée imprime la fin brute de la
sortie au lieu du vide : le diagnostic tiendra en une minute.

## Ce qui reste ouvert

**LS-233** attend ce nocturne pour son dernier critère. **LS-29** attend un
arbitrage sur ses huit modèles d'email sans envoi réel : un achat réel, donc
LS-153, ou un élargissement du script d'envoi réel à ticketer.

`controles.yml` groupe vingt-deux scripts sous `bash -e`, comportement documenté
et assumé, laissé tel quel faute d'arbitrage.
