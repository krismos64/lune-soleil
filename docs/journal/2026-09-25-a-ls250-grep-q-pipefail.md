# 25 septembre 2026 : LS-250, les derniers tubes vers grep -q sous pipefail

Suite de `2026-09-24-e`. Christophe a choisi LS-250 après la clôture du chantier
du nocturne.

## Le défaut

`printf '%s' "$x" | grep -q motif` sous `set -o pipefail` : `grep -q` ferme le
tube à la première correspondance, le producteur reçoit SIGPIPE, et le pipeline
échoue alors que le motif a été trouvé. Mesuré par LS-237 le 23 septembre, 41
occurrences restaient dans 25 scripts, listées dans
`scripts/grep-q-pipefail-restants.txt`.

## Ce qui a été fait

**39 tubes réécrits** en `grep ... <<<"$x"` par un petit analyseur qui suit les
guillemets jusqu'au vrai terminateur de la commande. Les cas délicats ont été
relus un par un : un motif portant `|` et `;` entre guillemets
(`verifier-en-tetes-production.sh:121`), une option `--`, une continuation `||`,
des accents graves échappés.

**Les deux restants étaient de faux positifs**, les propres messages de
`verifier-grep-q-pipefail.sh` qui citaient la forme en toutes lettres. Ils sont
reformulés.

**La liste des restes a disparu**, et toute occurrence fait désormais échouer le
contrôle. **Sa garde est remplacée**, et c'est le point qui aurait pu se perdre
en silence : exiger que chaque fichier listé soit examiné était aussi ce qui
attrapait un ancrage `pipefail` cassé. Un script témoin,
`verifier-tests-mutation.sh`, doit désormais avoir été lu. La preuve par mutation
reste à 4 sur 4, et le cas de l'ancrage cassé a été relu à la main : c'est bien
la garde témoin qui l'attrape.

## Rejeu de chaque script modifié

- **dix contrôles lancés directement**, dont `verifier-en-tetes-production.sh`
  sur le domaine public et `verifier-protection-branche.sh` sur l'API GitHub :
  neuf verts. `verifier-comptes-production.sh` rend 1 sur la base de
  développement, qui n'a pas d'administratrice, **exactement comme sa version de
  `main`**, sortie comparée à l'identique
- **dix preuves par mutation** : toutes vertes. `verifier-config-claude-mutation`
  abandonne en local, son contrôle en `--strict` étant rouge sur un point
  antérieur à LS-250, l'index mémoire à 151 lignes sur 200 ; rejouée sans
  l'index mémoire, comme sur le runner, **12 sur 12**
- **trois scripts non relancés, délibérément** : `amorcer-production.sh` et
  `migrate-production.sh` écrivent en production, `verifier-cle-b2-durcie.sh`
  tente une suppression réelle chez Backblaze depuis la machine. Leur ligne
  modifiée a été éprouvée isolée, ancienne et nouvelle forme, 200 fois chacune,
  sur une entrée volumineuse au motif précoce : **200 faux négatifs sur 200 pour
  l'ancienne, 0 pour la nouvelle**, et le sens « absent » vérifié

## Ce qui a dérapé

- zsh ne découpe pas une variable non guillemetée : la première réécriture n'a
  touché aucun fichier. Troisième occurrence du même piège dans cette session,
  les listes passent désormais par `xargs`

## État des tickets

**LS-250** : critères 1, 2 et 3 faits, avec les trois exceptions de rejeu
écrites ci-dessus.

## Vérification de fin de session

Demandée par Christophe avant de quitter.

- **Production** : image en service `6a22bcba`, action `etat` du workflow. Les
  neuf commits arrivés sur `main` depuis ne touchent que des scripts, la CI et
  la documentation, `git diff --stat 6a22bcba..origin/main` vide sur `src`,
  `prisma`, `package.json`, `Dockerfile` et la configuration de déploiement :
  **rien à redéployer**. Pages publiques et `/api/sante` à 200
- **Onze contrôles de cohérence à 0**, dont configuration, règles, propagation,
  registre, rédaction, couverture des preuves et contrôle à sec
- **LS-233 close**, ses critères 4 et 5 remplis par les nocturnes du 24 : l'écart
  CI/local tenait aux formats des reporters de CI
- **README remis d'aplomb** : 224 tickets terminés sur 244, 20 ouverts, 9 En
  cours, phase 6 à 6 ouverts et contenus à 10, relevés dans Jira le 25 au matin
- **`PREUVES-PAR-MUTATION.md`** porte en tête de section les bornes en vigueur,
  165 et 200 min, les valeurs antérieures restant pour l'histoire

**Restent signalés, antérieurs à cette session** : l'index mémoire à 151 lignes
sur 200, qui rend `verifier-config-claude.sh --strict` rouge en local ; une
formule d'exclusivité au README ; deux avertissements shellcheck ; deux
dépendances textuelles sans lien Jira sur LS-58 et LS-68, tickets clos.

## Prochaine étape

1. Archiver une partie de l'index mémoire, `docs/memory-archivage.md`, avant le
   plafond de 200 lignes
2. Borne locale sur l'étape « 9z octies » de la CI des PR, vingt-quatre preuves
   sous `bash -e` sans borne, arbitrage de Christophe attendu depuis le 20
3. Le reste du backlog attend l'exploitante ou l'ouverture commerciale, LS-153
