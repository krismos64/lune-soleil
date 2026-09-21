# 21 septembre 2026, la borne a parlé et ce n'était pas le plafond

Première session du jour, sur LS-235 critère 7. Le nocturne de la nuit avait
échoué, et le ticket attendait précisément ce verdict.

## La borne a coupé, et c'est sa réussite

Nocturne 35573380388, premier à tourner avec la borne locale posée la veille.

```
25  failure  Preuves par mutation lourdes
##[error] The action 'Preuves par mutation lourdes' has timed out after 45 minutes
```

Au lieu de trois nuits muettes, l'étape s'est **nommée**. Le garde-fou de LS-235
a fait exactement ce pour quoi il avait été posé.

## Ce qu'elle a rendu visible change le diagnostic

`verifier-tests-mutation.sh` avait traité **un seul cas sur 180** en 30 minutes.

```
08:02:41  demarrage du script
08:15:14  les deux suites de reference sont vertes
08:27:24  1er cas de mutation detecte     <- 12 min pour UN cas
08:33:15  borne atteinte
```

Chacun des 147 cas d'intégration relançait la suite **entière**, mesurée ce soir
à 419 s pour 60 fichiers et 947 tests :

```
147 cas x 419 s  =  61 593 s  =  17 h 06
```

**Le coût était la cause, pas le dimensionnement.** Relever la borne aurait refait
le défaut que LS-124 condamne, un plafond plus haut à la place d'une correction.

Le troisième argument de `cas` nommait déjà le test qui doit rougir, donc le
fichier qui le porte. Le script ne lance plus que celui-là, et le budget tombe à
**2377 s mesurées**, 39 minutes. Facteur 26.

Tous les fichiers porteurs sont retenus, jamais le premier : « sert exactement un
acheteur sur vingt simultanes » vit dans deux fichiers, l'un portant le même nom
suivi de « , sans aucune violation ». En retenir un seul aurait lancé le mauvais
et conclu « le test est aveugle » sur un test parfaitement voyant.

## Trois défauts que seul le premier passage au-delà du cas 1 pouvait voir

Le nocturne mourait au cas 1 depuis trois nuits. Aucun de ces défauts ne pouvait
se voir tant que le budget n'était pas corrigé, et tous relèvent du motif
« garde-fou jamais exercé ».

**Quatre motifs attendus ne désignaient aucun test.** Ces cas ne pouvaient rendre
que `RATE`, jamais `OK`. Deux étaient périmés : le test dit « six tables » depuis
que la purge en couvre six, et « 749 » depuis ADR-035, quand les motifs étaient
restés à « trois » et « 499 ». Les deux autres nomment un `it.each` dont le `%s`
n'existe qu'en sortie et jamais dans le source.

**Le cas 92 ne mutait rien.** Il cherchait `sum(greatest(...))` d'un seul tenant,
quand le code étale `sum(` et `greatest(` sur deux lignes avec un `CASE WHEN`
entre les deux. Le garde-fou de LS-70 l'a dit franchement :

```
ECHEC la mutation n'a modifie aucun caractere de src/repositories/catalogue.ts
```

La garantie visée n'est pas mince : la réservation ignorée dans le calcul de
disponibilité promet le même bijou à deux clients. Muter la soustraction seule
porte sur les deux occurrences, vitrine et fiche, et la détection est prouvée.

**La branche `RATE` imprimait `head -3`**, soit le diagnostic amputé là où il
compte le plus, avec un `$TMP` effacé à la restauration qui rendait la sortie
brute inconsultable après coup.

## Ce qui a dérapé, et ce que ça enseigne

**J'ai modifié le script pendant qu'il tournait.** Bash relit un fichier par
décalage d'octets : les lignes insérées en amont ont fait reprendre
l'interpréteur à un mauvais offset.

```
./scripts/verifier-tests-mutation.sh: line 1533: 2: command not found
```

Quatre `RATE` ont suivi, tous artefacts de cette corruption. Ce qui a mis sur la
piste : **le même cas apparaissait deux fois dans le log**, en `OK` puis en
`RATE`, ce qui est impossible. Un même cas de mutation ne peut pas être à la fois
détecté et non détecté.

L'exécution a été arrêtée plutôt que de produire un verdict sans valeur, et le
garde-fou d'interruption de LS-230 a restauré tous les fichiers. La preuve a été
relancée sur un script figé.

La leçon vaut d'être notée : **un script en cours d'exécution ne se modifie
jamais**, et une preuve corrompue s'arrête au lieu de se terminer.

## Ce qui reste

**Le critère 7 ne se ferme pas.** Il demande un nocturne complet au vert, et seul
le prochain le dira. Ce qui est prouvé ce soir est le budget, pas le passage.

**Les 45 minutes restent en place.** Les resserrer sur ma mesure locale répéterait
l'erreur du 14 septembre, un budget calculé sur des chiffres non confirmés : le
runner coûte 716 s là où ce poste en coûte 447, et 144 s là où il en coûte 200.
Une durée locale ne prédit pas une durée de runner, dans les deux sens.

**`test:e2e` est absent du contrôle préalable de verdeur**, alors que dix cas
s'appuient dessus. Le commentaire du script énonce pourtant ce raisonnement pour
les deux autres suites. L'ajouter coûterait environ 13 minutes par exécution pour
426 tests : arbitrage de budget qui touche le nocturne, remonté à Christophe et
non tranché.

`controles.yml` porte toujours son défaut latent, vingt-deux scripts sous
`bash -e` sans borne locale. Signalé depuis hier, non traité.
