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

## Ce qui n'est pas corrigé, et qu'il faut dire

**La divergence entre deux exécutions reste inexpliquée.** Ce qui est fermé est
l'impossibilité de la diagnostiquer : un prochain rouge nommera sa cause au lieu
d'afficher un succès.

**L'écart CI/local sur l'état vide des déclinaisons reste ouvert lui aussi.** Le
script rend 6 sur 6 en local, quand le nocturne rapportait 5 sur 6.

Une hypothèse, **non prouvée** : l'étape des mutations lourdes s'exécute en
`if: always()`, donc après celle de bout en bout, dans le même job et sur la même
base 55433. Les douze échecs de LS-232 la précédaient les deux nuits. Le prochain
nocturne tranchera, LS-232 étant corrigé.

## Traçabilité

**Dépôt** : branche `fix/LS-233-rapport-de-mutation-nomme-le-test`, `688f78b`.

**Jira** : LS-233 créé ce matin, à commenter après fusion.

**Mémoire** : rien d'écrit. La leçon « mutation vue par le mauvais test » est
déjà en fiche, et c'est elle qui a permis de lire le symptôme correctement dès la
première minute.

## Prochaine étape

**Le prochain nocturne, vers 7h le 17 septembre**, porte deux vérifications d'un
coup : l'étape de bout en bout doit passer au vert, LS-232, et l'étape des
mutations lourdes dira si l'écart tenait aux douze échecs qui la précédaient.

**LS-218**, l'expédition Sendcloud, reste le chantier de code prioritaire sans
dépendance externe.

Comptes relevés dans Jira le 16 septembre : **197 terminés sur 223 hors epics**,
**26 ouverts**, dont **11 En cours**.
