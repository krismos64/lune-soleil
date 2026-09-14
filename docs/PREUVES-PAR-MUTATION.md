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

Une preuve n'entre pas en intégration continue quand elle exige une machine, un
service ou une durée que la CI par PR ne peut pas porter. **L'écart s'écrit ici
avec son motif** : une exemption sans raison est un interrupteur, pas une
décision.

### Écartées pour un environnement absent de la CI par PR

| Preuve | Durée | Motif |
|---|---|---|
| `verifier-sauvegarde-mutation.sh` | 5 s | **lance un conteneur PostgreSQL** et y crée des bases, quatre appels à `docker` et `psql` dans son corps. Elle éprouve la restauration d'une sauvegarde, ce qui n'a de sens que sur une vraie base : le nocturne, qui en dispose déjà, la porte mieux |

**CE CLASSEMENT A ÉTÉ MESURÉ, ET IL A CORRIGÉ UNE SUPPOSITION.** Un premier tri
par `grep` de mots-clés rangeait ici `verifier-nginx`, `verifier-environnement`
et `verifier-migration`, toutes trois citant `docker` ou `psql`. Exécutées, elles
passent en moins de 5 s sans rien lancer : les mentions vivaient dans leurs
commentaires. Elles entrent donc en CI par PR comme les autres textuelles.

Un besoin d'environnement se mesure en exécutant la preuve, jamais en lisant son
texte.

### Écartées pour leur durée

| Preuve | Durée mesurée | Motif |
|---|---|---|
| `verifier-reintegration-stock-mutation.sh` | 415 s | près de sept minutes sur une CI qui en dure quinze. Elle éprouve une zone critique et doit tourner, mais au nocturne |
| `verifier-etats-non-nominaux-mutation.sh` | 67 s | la plus lourde des textuelles, à elle seule la moitié du budget des vingt autres |
| `verifier-config-claude-mutation.sh` | 31 s | éprouve la cohérence de configuration, qu'un contrôle du même nom rejoue déjà par PR |

LS-177 a déjà déplacé le bout en bout, `npm audit` et l'image au nocturne pour
tenir la durée par PR. Ajouter ces trois-là referait le même problème : à elles
seules elles pèsent **513 s**, quand les dix-sept autres textuelles coûtent
**42 s** ensemble.

## Ce que ce document ne dit pas

Il dit **où** chaque preuve tourne, jamais qu'elle prouve encore quelque chose.
`verifier-couverture-mutations.sh` lit des noms de fichiers, il ne les exécute
pas : c'est la preuve elle-même, une fois rejouée, qui répond de son contenu.

Les cinq réparations de LS-230 le rappellent : toutes étaient citées nulle part
et se sont périmées en silence.
