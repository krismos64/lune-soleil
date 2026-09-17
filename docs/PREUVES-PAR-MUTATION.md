# Preuves par mutation, couverture

`CLAUDE.md` pose le principe : **un contrôle qui n'a jamais échoué sur le défaut
qu'il prétend attraper n'est pas un contrôle.** La preuve par mutation est
l'instrument de ce principe, et elle se périme comme tout le reste.

Ce document est la source unique de ce qui est **écarté** de l'intégration
continue, et de pourquoi. `scripts/verifier-couverture-mutations.sh` le confronte
aux workflows : toute preuve doit être rejouée quelque part, ou figurer ici avec
sa raison.

## Ce que l'inventaire de LS-230 a trouvé

Mesuré le 14 septembre 2026 : le dépôt portait **quarante-trois preuves**, quarante-quatre depuis,
l'intégration continue en rejouait **quinze**. Sur les vingt-huit dormantes,
**cinq étaient cassées** sans que personne ne le sache, et chacune autrement.

| Preuve | Ce qui l'avait cassée |
|---|---|
| `verifier-chargement-administration-mutation.sh` | mutait deux `loading.tsx` que C32 avait fait retirer, et s'arrêtait sur son propre garde-fou de présence |
| `verifier-ponctuation-chargement-mutation.sh` | mutait les deux mêmes fichiers disparus, cinq de ses six cas ne muaient rien |
| `verifier-navigation-administration-mutation.sh` | élargissait un ancrage sur `RUBRIQUES_A_VENIR`, liste vide depuis LS-98 |
| `verifier-regles-mutation.sh` | quatre cas aveugles, un `paths` en `*.css` couvrant tout `src/` |
| `verifier-registre-traitements-mutation.sh` | une ligne « aucune propre » faisait compter des tables rangées ailleurs |

**Quatre trous réels dans les contrôles** ont été trouvés en les réparant, et
aucun n'était visible tant que ces preuves dormaient :

- un composant de chargement qui **perd son annonce** devenait muet sans alerte,
  l'inventaire comptant simplement un état de moins
- le troisième sens de `verifier-chargement-administration.sh` **ne s'exécutait
  plus du tout** depuis C32, sa boucle parcourant des `loading.tsx` disparus
- le sens de couverture de `verifier-regles.sh` **ne pouvait plus rougir** : le
  nettoyage du glob transformait `"src/**/*.css"` en `src`, qui couvrait alors
  tous les dossiers comme parent. `src/instrumentation.ts` n'était couvert par
  aucune règle, et personne ne pouvait le voir
- `verifier-registre-traitements.sh` laissait **une table sortir du registre**
  si un autre traitement la mentionnait comme consultée, sur un document
  opposable au titre de l'article 30

**Une mutation peut muter et ne rien prouver.** Le cas de
`navigation-administration` le montre : son garde-fou vérifiait par `cksum` que
le fichier changeait, et il changeait bien. L'ancrage visé exigeait pourtant une
déclaration monoligne, quand celle du dépôt tient sur cinq lignes : la mutation
ne pouvait pas produire son effet, et s'annonçait comme un trou du contrôle.

## Les preuves écartées, et leur raison

**Aucune, au 15 septembre 2026.** Les **quarante-quatre** preuves du dépôt
tournent, **trente-huit par PR et six au nocturne**.

Cette section reste ouverte : une preuve peut légitimement ne pas pouvoir entrer
en intégration continue, et l'écart s'écrira ici avec son motif. Une exemption
sans raison est un interrupteur, pas une décision, et
`scripts/verifier-couverture-mutations.sh` refuse une ligne qui nomme une preuve
sans rien dire.

**La dispense ne se lit que dans cette section**, jamais ailleurs dans le
document. Une première version du contrôle cherchait le nom dans tout le
registre : les cinq preuves réparées plus haut, citées dans leur tableau
historique, passaient alors pour écartées. Un récit n'est pas une décision.

## Comment les quarante-quatre se répartissent

**Trente-huit par PR**, `controles.yml` : **vingt-deux** groupées dans l'étape
« 9z octies », qui pèsent **82 s** mesurées en les enchaînant, et **seize** en
étapes nommées, chacune posée par la story qui l'a écrite. Sur une CI qui dure
environ neuf cents secondes quand le code change.

LE COMPTE SE MESURE, IL NE SE LIT PAS DANS UNE SEULE ÉTAPE :

```
grep -oE 'verifier-[a-z0-9-]+-mutation\.sh' .github/workflows/controles.yml | sort -u | wc -l
```

Une première version de ce document annonçait « vingt-deux par PR », le chiffre
de la seule étape groupée, en oubliant les seize nommées. Le motif est en
mémoire, « compter ne vérifie pas le contenu » : un nombre écrit en toutes
lettres n'est ancré par rien, et `verifier-couverture-mutations.sh` lit des noms
de fichiers, jamais un récit.

**Six au nocturne**, `nocturne.yml`, les six lourdes. Leurs durées **s'additionnent
à 1013 s**, et c'est une somme de mesures isolées, jamais un temps de step
observé : la distinction compte, voir plus bas.

| Preuve | Durée mesurée | Ce qui la rend lourde |
|---|---|---|
| `verifier-tests-mutation.sh` | 456 s | relance toute la suite d'intégration |
| `verifier-reintegration-stock-mutation.sh` | 415 s | zone critique, base peuplée |
| `verifier-etats-non-nominaux-mutation.sh` | 67 s | la plus lourde des textuelles |
| `verifier-regles-mutation.sh` | 39 s | schéma, règles et couverture des `paths` |
| `verifier-config-claude-mutation.sh` | 31 s | cohérence de configuration |
| `verifier-sauvegarde-mutation.sh` | 5 s | lance un conteneur PostgreSQL, que le nocturne a déjà |

LS-177 avait déjà déplacé le bout en bout, `npm audit` et l'image au nocturne
pour tenir la durée par PR. Les y rejoindre suit le même arbitrage.

**AUCUNE DURÉE DE STEP À SIX N'A JAMAIS ÉTÉ OBSERVÉE**, et les deux premières
lignes du tableau sont les moins sûres. Le step groupait les six dans un seul
`run`, donc sous `bash -e` : **le premier échec coupait tout**, et les suivants
ne tournaient pas. Mesuré le 17 septembre 2026 sur trois nocturnes consécutifs,
`verifier-etats-non-nominaux` échouant en deuxième position :

```
15, 16 et 17 septembre    2 scripts sur 6 executes, environ 98 s consommees
```

`verifier-reintegration-stock`, `verifier-sauvegarde`, `verifier-tests` et
`verifier-regles` n'ont donc **rien prouvé du 14 au 17 septembre**. Ils étaient
verts, vérifié en local le 17 : ils ne prouvaient simplement plus rien, ce qui
équivaut à un garde-fou absent. Le step boucle désormais sur les six et retient
le premier code non nul, donc chacun rend son verdict et le step reste rouge dès
qu'un échoue.

Les 456 s et 415 s datent du 14 septembre et n'ont pas été réattestées depuis.
Celle de `verifier-tests` est en outre sous-estimée, le script étant passé de
166 à 180 cas. Le premier temps réel à six sera celui du nocturne du 18.

**UN BESOIN D'ENVIRONNEMENT SE MESURE EN EXÉCUTANT LA PREUVE**, jamais en lisant
son texte. Un premier tri par `grep` de mots-clés rangeait `verifier-nginx`,
`verifier-environnement` et `verifier-migration` parmi les preuves à
environnement, toutes trois citant `docker` ou `psql`. Exécutées, elles passent
en moins de 5 s sans rien lancer : les mentions vivaient dans leurs commentaires.

## Ce que ce document ne dit pas

Il dit **où** chaque preuve est déclarée, et il y a **deux trous distincts**
derrière ce mot.

Une preuve déclarée peut ne rien prouver : `verifier-couverture-mutations.sh` lit
des noms de fichiers, il ne les exécute pas, et c'est la preuve elle-même, une
fois rejouée, qui répond de son contenu.

Une preuve déclarée peut aussi **ne pas s'exécuter du tout**, ce que le 17
septembre 2026 a montré : quatre des six du nocturne étaient masquées par un
`bash -e`. Trouver ce second trou demande de **compter les bilans** dans le
rapport, six scripts qui n'en impriment que deux étant le signe. Un nom présent
dans un workflow ne garantit ni l'un ni l'autre.

Les cinq réparations de LS-230 le rappellent : toutes étaient citées nulle part
et se sont périmées en silence.
