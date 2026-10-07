# 7 octobre 2026 : LS-281, data-borne suspend aussi les pseudo-éléments

Suite de `2026-10-07-c`.

## Ce qui a été fait

- **Défaut** : la règle de `globals.css` qui suspend les décors hors de
  l'écran et après cinq secondes visait `[data-borne="attente"] *`. Le
  sélecteur `*` n'atteint pas un `::before` ni un `::after`, et
  `animation-play-state` ne s'hérite pas.
- **Inventaire** des animations posées sur un pseudo-élément dans
  `src/` : le reflet du sceau de l'accueil, `::after` de 3,8 s ; le sucre
  d'orge et le papier cadeau des thèmes de Noël, `::before` de l'élément borné
  lui-même ; le filtre actif du catalogue sous Noël, hors de tout élément
  borné et fini en 1,5 s. Les trois premiers jouaient au chargement sans
  jamais être suspendus.
- **Correction** : les pseudo-éléments de l'élément borné et de ses
  descendants sont nommés dans la règle de suspension et dans l'exemption des
  décors continus.
- **Test** `borne-pseudo-elements-ls281.spec.ts` : six pages bornées, et le
  reflet du sceau pour lui-même, pour qu'une liste vide ne passe pas pour un
  verdict. Prouvé par mutation deux fois à la main, puis un cas ajouté au
  nocturne, `verifier-tests-mutation.sh` cas 11 nonies.
- **Vérifié** : 280 tests sur les dix specs d'animation, Noël compris ; 64
  des 67 scripts de `controles.yml` en local, les trois autres expliqués
  ci-dessous.

## Dérives

- **L'expression de mutation du cas 11 quinquies citait le bloc de
  l'exemption ligne à ligne** : elle ne retirait plus rien après l'ajout des
  pseudo-éléments, et `verifier-mutations-a-sec.sh` l'a vu. Elle cite le bloc
  en entier.
- **Ma première mutation du nocturne visait le `::after` des descendants**,
  alors que le reflet du sceau est celui de l'élément borné lui-même : elle
  n'aurait rien fait rougir. Corrigée et éprouvée avant le commit.
- **Trois fichiers de session de test dataient du 6 octobre** dans le dossier
  principal : la base de bout en bout réinitialisée depuis, la préparation
  échouait sur « User already exists ». Fichiers ignorés par Git, retirés,
  régénérés au passage suivant.
- `verifier-config-claude --strict` et `verifier-numerotation-etapes-mutation`
  restent rouges en local, mémoire du poste, comme sur `main`.

## Fusion, déploiement et nocturne

- PR #545, CI verte en 14 min 33, fusionnée en rebase, `4652d00`. Déployée,
  run 37606666148, sans migration ; la règle `[data-borne=attente]:after` est
  présente dans la feuille servie par lune-soleil.fr. LS-281 close.
- **Contrôle nocturne entièrement vert**, run 37591165584 sur `97f4459`,
  vérifié étape par étape : audit, bout en bout aux quatre largeurs, image
  Docker, preuves par mutation lourdes. LS-274 close, issue #525 fermée.

## Prochaine étape

LS-284 attend la réponse de l'exploitante. Sur le catalogue en mobile, la
première photographie charge sa variante de 1280 px : à mesurer avec LS-140
avant d'y toucher.

## État des tickets

LS-274, LS-280 à LS-283 closes et déployées. LS-284 ouverte. 246 tickets
terminés sur 274, relevés dans Jira.
