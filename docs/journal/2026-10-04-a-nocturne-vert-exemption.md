# 4 octobre 2026 : nocturne vert sous exemption, issue #498 fermée

Suite de `2026-10-03-a`.

## Ce qui a été fait

**Le nocturne planifié du 4 octobre est vert**, run 37186474145 sur `ca92ff4`,
premier passage réel de l'exemption de LS-258 :

- audit : `Paquets signalés : 5, couverts par une exemption : 5`, et
  l'avertissement `EXEMPTE GHSA-vfj7-8cjw-p6xm (braces) jusqu'au 2026-10-17`
  posé comme prévu ;
- bout en bout : `2255 passed` ;
- preuves lourdes : `180 mutations, 180 detectees`.

**L'issue #498 est fermée à la main**, avec un commentaire qui cite ce run. Le
« Veilleur du controle nocturne » est marqué `skipped` sur ce run, et c'est
attendu : sa condition `workflow_run.conclusion != 'success'` le réserve aux
échecs, il ouvre ou commente l'issue mais ne la ferme jamais.

LS-258 porte le constat du critère 6 en commentaire.

**Revue de cohérence avant fin de session.** Les cinq contrôles de
propagation sortent en 0. `verifier-jira.sh --strict` relève deux dépendances
textuelles sans lien, LS-58 vers LS-33 et LS-68 vers LS-50, sur des tickets
clos : rien à faire. Le `README.md` était en retard d'un ticket : phase 6
annoncée à 6 stories ouvertes pour 7 mesurées, LS-258 absente, et des comptes
du 25 septembre. Remesurés dans Jira : 225 terminés sur 248 hors epics,
23 ouverts dont 10 En cours et 13 À faire.

**Production mesurée** par le workflow « Ecart entre la production et main »
relancé à la main (run 37192477477) : `a6eb981`, du 1er octobre, à 11
commits de `main`, aucune migration. Aucun de ces commits ne touche `src/`,
`prisma/`, les dépendances ni l'image : la production sert le même code
applicatif que `main`. Le site répond 200.

## Ce qui a dérapé

Rien.

## Ce qui reste

- **Au 17 octobre 2026**, ou dès qu'une version corrigée de `braces` sort :
  mettre à jour et retirer l'exemption, critère 7 de LS-258.
- L'écart de production mesuré le 3 octobre était de 8 commits, aucune
  migration. Aucun déploiement n'est donc urgent : lire le workflow « Ecart
  entre la production et main » du jour plutôt que ce chiffre.

## Prochaine étape

Arbitrages en attente de Christophe : l'archivage de l'index mémoire, la borne
« 9z octies », et les trois échelles de titre des pages publiques face à C42.
Aucun ticket ouvert ne dépend du seul code, le reste attend l'exploitante ou
LS-153.

## État des tickets

LS-258 en cours, critères 1 à 6 faits, critère 7 au 17 octobre.
