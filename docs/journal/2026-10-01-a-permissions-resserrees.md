# 1er octobre 2026 : les permissions automatiques resserrées

Suite de `2026-09-25-a`. Christophe a modifié `.claude/settings.json` à la main
et demandé le commit, la PR et la fusion sur `main`.

## Ce qui a changé

La liste `allow` perd les commandes à effet large : `./scripts/`, `sed`, `cat`,
`chmod`, `python3`, `node`, `npx prisma`, `docker exec`, `docker run`,
`docker rm`, `git push`, `git rebase`, `git tag`, `gh secret set`, `stripe`,
`ssh lune-soleil`, `scp`, `rsync`, `curl`, `psql`, `pg_dump`, `pg_restore`,
les outils Jira et Context7, et l'édition des `.env`. Ces actions demandent
désormais une confirmation. La liste `deny` et les hooks ne bougent pas.

## Dérive à surveiller

`CLAUDE.md`, section « Autonomie et accès », et la fiche mémoire
`lune-soleil-permissions-et-hooks.md` décrivent encore le `.env` comme
modifiable et les accès `ssh`, `psql`, `stripe` comme utilisables sans
validation. Rien n'est interdit : la commande s'exécute après confirmation. Si
le resserrement est durable, ces deux textes sont à aligner.

## Vérification

`./scripts/verifier-config-claude.sh` : aucun point nouveau en local. En CI, le
mode `--strict` a refusé la PR faute de page de journal à la date du commit,
d'où cette page.

## Prochaine étape

Inchangée depuis `2026-09-25-a` : archivage d'une partie de l'index mémoire,
borne locale sur l'étape « 9z octies », arbitrage attendu.
