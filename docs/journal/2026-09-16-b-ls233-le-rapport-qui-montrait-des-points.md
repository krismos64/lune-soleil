# 16 septembre 2026, le rapport qui montrait des points

Suite directe de la session du matin. LS-232 avait laissé un second échec au
nocturne, non diagnostiqué faute d'un rapport lisible. C'est ce rapport qui est
corrigé ici, pas la cause qu'il masquait.

## Le défaut, en une ligne

```bash
lignes_echec=$(grep -E '(×|✘)' "$TMP/sortie.txt" || true)
```

Playwright imprime une **barre de progression** où chaque test échoué ajoute un
`×`. Ce motif nu la retient au même titre qu'une ligne d'échec, et elle sort
**avant** le récapitulatif : le `head -3` qui suit ne montrait qu'elle.

D'où le rapport du nocturne, deux nuits de suite :

```
RATE  l'etat vide des declinaisons change de texte
        echecs reels :
          ········×F
```

Le script concluait **juste**, « pas sur le test attendu ». C'est son diagnostic
qui était inexploitable : rien ne permettait de distinguer un trou de couverture
d'une mutation vue par un test voisin qu'il aurait suffi de déclarer. Deux
situations opposées, un même rapport muet.

## Les quatre formes, confrontées à la sortie réelle

Mesurées le 16 septembre sur les deux lanceurs. Seules les deux premières sont
des échecs :

```
  ✘  9 [mobile-320] › fichier.spec.ts:58:7 › le nom du test      Playwright
 × tests/unite/exemple.test.ts > un cas qui echoue               Vitest
········×F                                                       barre
  ·×F                                                            barre
```

L'ancre `^[[:space:]]*` les sépare : un marqueur de progression est toujours
précédé d'au moins un point, jamais d'espaces seuls.

**Trois scripts portaient le motif nu.** Le troisième,
`verifier-reintegration-stock-mutation.sh`, ne lance que Vitest et n'était donc
pas atteint : l'ancre y est posée pour que les trois portent le même filtre
plutôt que trois variantes.

## Ma première preuve du critère 3 était fausse

Pour prouver que le rapport nomme bien le test, j'ai détourné le motif attendu
d'un cas. Le rapport est sorti **vide**, et j'ai d'abord cru que mon filtre était
trop strict.

**C'est ma mutation qui était mal posée.** `cas()` prend quatre paramètres, et
j'avais modifié le troisième, celui qui voyage jusqu'à `-g` de Playwright, au
lieu du quatrième. Playwright ne lançait donc aucun test.

Le commentaire du script décrit exactement ce piège, dix lignes plus haut, pour
un défaut identique corrigé avant moi. Je l'avais lu sans le reconnaître.

Repris en ne détournant que le motif attendu, la preuve passe :

```
RATE  l'etat vide des declinaisons change de texte
        attendu : un motif absent, la mutation sera vue par un voisin
        echecs reels :
          ✘  9 [mobile-320] › tests/e2e/etats-non-nominaux-administration.spec.ts:58:7
             › les trois etats vides de l'editeur sont rendus et nommes (10.2s)
```

Le fichier, la ligne, le nom. L'ancienne forme affichait `········×F` ici.

## Un troisième appel oublié par LS-204

En cours de route, la PR 444 a rougi sur une étape voisine : « Preuve par
mutation de la numérotation des étapes », avec ce message.

```
etape 9a     ./scripts/verifier-config-claude.sh --strict
               configuration Claude Code cohérente
etape 9a bis ECHEC l'état de référence est déjà rouge
               configuration Claude Code cohérente
```

La même commande, verte une seconde plus tôt dans l'étape voisine, verte à
nouveau au second appel de celle-ci, déclarée rouge entre les deux.

**C'est le défaut que LS-204 avait corrigé, sur un appel qu'il avait oublié.**
Ce script lançait le contrôle deux fois : une pour le code de sortie, une pour
l'affichage. Les deux appels des cas de mutation avaient été corrigés le
8 septembre ; celui du test d'état de référence était resté. L'en-tête du script
annonçait pourtant que le rapport nommerait désormais la cause.

**L'écart ne se voit que sur une divergence**, ce qui explique qu'il ait survécu.
Vérifié en rejouant les deux formes côte à côte : sur un rouge stable, un ADR
hors table par exemple, l'ancienne forme nomme la cause aussi bien. Sur un
contrôle témoin rouge puis vert, elle affiche « cohérente » sous le mot ECHEC,
mot pour mot ce que la CI a imprimé.

## La cause dormait en archive depuis cinq jours

Ce journal a d'abord affirmé que la divergence restait inexpliquée. **C'est faux,
et la correction vaut mieux que le constat.**

La PR 444 a été relancée sans aucun changement : **elle est passée au vert**.
Même commit, deux verdicts opposés, donc une divergence transitoire et non un
défaut de contenu.

`grep -rl` dans `memory/archive/`, ce que le CLAUDE.md demande avant de croire un
piège inconnu, a rendu une fiche du **11 septembre** :
`controle-config-faux-positif-transitoire`. Elle décrit exactement ce symptôme et
en donne la cause probable.

`verifier-config-claude.sh` lit le dépôt par **trois `git ls-files`**, dont un
nu, ligne 795. Une opération git concurrente lui fait rendre une liste partielle
ou vide, sans erreur : le contrôle conclut sur un dépôt qu'il voit mal. Mesuré ce
jour-là sur ce poste, deux signalements `paths` sur des fichiers parfaitement
suivis, pendant que tournaient des rebases.

**LS-204 déclarait cette cause non identifiée**, le 8 septembre. La fiche a été
écrite trois jours après, puis archivée, donc plus chargée au démarrage. Deux
sessions ont cherché en ayant la réponse à portée.

La leçon n'est pas sur le contrôle : **un commentaire de code qui dit « cause non
identifiée » date du jour où il a été écrit.** La fiche qui l'explique peut avoir
été écrite après. La fiche est remontée dans l'index et enrichie du cas CI.

## Ce qui n'est pas corrigé, et qu'il faut dire

**L'opération git concurrente exacte, côté runner, reste inconnue.** Ce qui est
établi est le mécanisme et le geste : relancer avant de chercher.

**L'écart CI/local sur l'état vide des déclinaisons reste ouvert lui aussi.** Le
script rend 6 sur 6 en local, quand le nocturne rapportait 5 sur 6.

Une hypothèse, **non prouvée** : l'étape des mutations lourdes s'exécute en
`if: always()`, donc après celle de bout en bout, dans le même job et sur la même
base 55433. Les douze échecs de LS-232 la précédaient les deux nuits. Le prochain
nocturne tranchera, LS-232 étant corrigé.

## Traçabilité

**Dépôt** : PR 445 **fusionnée sur `main`** en rebase, branche supprimée,
`3975fee`, `0aa53a1` et `7897cde`. Elle était `BEHIND` après la fusion de la
PR 444, ce qui empêchait les huit contrôles de démarrer : un rebase sur `main`
les a lancés, et ils sont verts.

**Jira** : LS-233 créé ce matin, passé En cours, commenté trois fois : l'état des
cinq critères, la mesure de la relance verte, et les SHA réels après fusion. Il
**reste En cours**, ses critères 4 et 5 ne pouvant pas se vérifier aujourd'hui.

**Mémoire** : aucune fiche neuve. `controle-config-faux-positif-transitoire` est
**remontée de l'archive** dans l'index, et enrichie du cas d'intégration
continue : le piège s'est présenté deux fois, il se rejouera sur une story sans
rapport, et aucun contrôle ne peut le fermer. Les trois questions passent, mais
une fiche existante couvrait déjà le motif : l'enrichir ne coûte aucune ligne
d'index de plus.

La leçon « mutation vue par le mauvais test » est déjà en fiche elle aussi, et
c'est elle qui a permis de lire le symptôme correctement dès la première minute.

## Prochaine étape

**Le prochain nocturne, vers 7h le 17 septembre**, porte deux vérifications d'un
coup : l'étape de bout en bout doit passer au vert, LS-232, et l'étape des
mutations lourdes dira si l'écart tenait aux douze échecs qui la précédaient.

**LS-218**, l'expédition Sendcloud, reste le chantier de code prioritaire sans
dépendance externe.

Comptes relevés dans Jira le 16 septembre : **197 terminés sur 223 hors epics**,
**26 ouverts**, dont **11 En cours**.
