# Preuves par mutation, couverture

`CLAUDE.md` pose le principe : **un contrôle qui n'a jamais échoué sur le défaut
qu'il prétend attraper n'est pas un contrôle.** La preuve par mutation est
l'instrument de ce principe, et elle se périme comme tout le reste.

Ce document est la source unique de ce qui est **écarté** de l'intégration
continue, et de pourquoi. `scripts/verifier-couverture-mutations.sh` le confronte
aux workflows : toute preuve doit être rejouée quelque part, ou figurer ici avec
sa raison.

## Ce que l'inventaire de LS-230 a trouvé

Mesuré le 14 septembre 2026 : le dépôt portait **quarante-trois preuves**,
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

**Aucune, au 14 septembre 2026.** Les quarante-trois preuves du dépôt tournent,
vingt-deux par PR et vingt et une au nocturne.

Cette section reste ouverte : une preuve peut légitimement ne pas pouvoir entrer
en intégration continue, et l'écart s'écrira ici avec son motif. Une exemption
sans raison est un interrupteur, pas une décision, et
`scripts/verifier-couverture-mutations.sh` refuse une ligne qui nomme une preuve
sans rien dire.

**La dispense ne se lit que dans cette section**, jamais ailleurs dans le
document. Une première version du contrôle cherchait le nom dans tout le
registre : les cinq preuves réparées plus haut, citées dans leur tableau
historique, passaient alors pour écartées. Un récit n'est pas une décision.

## Comment les quarante-trois se répartissent

**Vingt-deux par PR**, `controles.yml`, étape « 9z octies » plus les étapes
nommées : **82 s** mesurées en les enchaînant, sur une CI qui en dure environ
neuf cents quand le code change.

**Vingt et une au nocturne**, `nocturne.yml`, dont les six lourdes qui pèsent
**1008 s** à elles seules :

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

**UN BESOIN D'ENVIRONNEMENT SE MESURE EN EXÉCUTANT LA PREUVE**, jamais en lisant
son texte. Un premier tri par `grep` de mots-clés rangeait `verifier-nginx`,
`verifier-environnement` et `verifier-migration` parmi les preuves à
environnement, toutes trois citant `docker` ou `psql`. Exécutées, elles passent
en moins de 5 s sans rien lancer : les mentions vivaient dans leurs commentaires.

## Ce que ce document ne dit pas

Il dit **où** chaque preuve tourne, jamais qu'elle prouve encore quelque chose.
`verifier-couverture-mutations.sh` lit des noms de fichiers, il ne les exécute
pas : c'est la preuve elle-même, une fois rejouée, qui répond de son contenu.

Les cinq réparations de LS-230 le rappellent : toutes étaient citées nulle part
et se sont périmées en silence.
