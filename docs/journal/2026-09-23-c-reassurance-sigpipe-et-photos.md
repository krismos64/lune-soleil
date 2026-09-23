# 23 septembre 2026, soirée : réassurance, SIGPIPE et nouvelles photos

Suite de `2026-09-23-b`. Christophe a clos LS-239 sans correction, puis demandé
LS-236 et LS-237, et deux remplacements de photos en cours de route.

## Livré sur `main`

| Ticket | Sujet | PR |
| --- | --- | --- |
| LS-249 | `/aide` et les CGV n'annoncent la livraison offerte qu'en Point Relais et Locker | #481 |
| LS-236 | bandeau de réassurance à six éléments, accueil et `/notre-univers` | #482 |
| LS-237 | la cause du faux négatif intermittent, mesurée et fermée | #483 |
| sans ticket | nouvelle bannière d'accueil et nouvelle photo des matières | #484 |

## Le défaut le plus grave de la journée était ailleurs

En préparant LS-236, la page `/aide` **et les conditions générales** annonçaient
« livraison offerte à partir de 39 €, quel que soit le mode », quand
`calculerFraisPort` facture le domicile, ADR-035. Information précontractuelle
fausse, en production depuis le 13 septembre. LS-249 l'a corrigée ; la question
d'un éventuel geste envers les clients concernés est laissée à Christophe,
aucune commande réelle n'ayant été consultée.

## LS-237, une cause mesurée

`printf '%s' "$x" | grep -qF motif` sous `set -o pipefail` : `grep -q` ferme le
tube, le producteur reçoit SIGPIPE, le pipeline échoue alors que le motif est
trouvé. 17 faux négatifs sur 200 en tube, 0 en here-string. **La même forme**
expliquait le « faux positif transitoire » de `verifier-config-claude.sh`, 6 sur
20 avant, 0 après : la fiche mémoire qui l'attribuait à une opération git
concurrente était fausse, réécrite.

Un contrôle, `verifier-grep-q-pipefail.sh`, interdit toute nouvelle occurrence
sous `pipefail`. Sa preuve par mutation a trouvé **deux défauts dans sa propre
première version** : il comptait les commentaires, et son garde « zéro fichier
examiné » restait vert quand l'ancrage cassé ne laissait que lui-même à lire.
Les 41 occurrences restantes sont portées par LS-250.

La preuve complète est allée jusqu'au cas 98, plus loin que jamais : cas 12 OK,
aucun des quatre RATE de la série éditeur. Elle s'est arrêtée sur une mutation
périmée de `paiement.ts` et un RATE à liste vide, LS-252.

## Les photos

La photo des matières remplace l'ancienne, même cadrage. La bannière d'accueil,
1680 x 639 avec texte incrusté, passe en pleine largeur en tête, sans recadrage.
**Deux pièges évités** : le panneau des pages de connexion recadrait la même
image, il prend désormais la photo de l'atelier ; et l'optimiseur d'images
servait l'ancienne version à 320 px depuis son cache, d'où deux **noms de
fichiers neufs**.

## Ce qui a dérapé

- `git add -A` dans un worktree a inclus les liens symboliques `node_modules` et
  `src/generated` dans un commit : retirés avant le push, `main` vérifié propre
- deux fichiers de test reformatés par `sed` après Prettier, CI rouge sur le
  format, corrigé
- le nom de la boutique écrit en dur dans un texte alternatif, attrapé par
  `verifier-graphie-marque.sh`

## Déployé le 23 septembre 2026 au soir

**Migration** par `migrate-production.sh`, relais et tunnel comme `EXPLOITATION.md`
le décrit : 21 migrations appliquées, la dernière `20260923080000_message_archivage`,
sauvegarde prise avant dans `~/sauvegardes-lune-soleil/`. Relais arrêté et
tunnel fermé ensuite.

**Déploiement** du commit `0a4fca29` par le workflow, toutes étapes vertes :
bascule, port 3002 fermé depuis Internet, trois sites à 200. Contrôle par le
domaine public : pages publiques à 200, `?page=abc` et `?page=999` en 404, `/aide`
et les CGV sans « quel que soit le mode », bannière, photo des matières et
bandeau servis.

**Un piège de la migration**, documenté dans `EXPLOITATION.md` : l'extraction de
l'URL coupait le mot de passe au premier `@`, et le script ne disait
qu'« injoignable ». Deux essais perdus, aucune écriture en base.

## Rappel d'avant le déploiement

Rien de neuf côté base : la seule migration reste `message.archive_a` du matin.
À vérifier à l'œil : la bannière à 320 px, dont le texte incrusté devient très
petit, et la graphie « Lune-Soleil » de l'image contre `Lune-soleil` du site.

## Prochaine étape

1. Déployer, puis recette de l'exploitante
2. LS-252 pour que la preuve complète aille au bout, puis LS-250
3. LS-251 si le bandeau doit aussi paraître sur la fiche produit
