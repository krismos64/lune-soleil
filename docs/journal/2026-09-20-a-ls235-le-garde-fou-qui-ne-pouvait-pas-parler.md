# 20 septembre 2026, le garde-fou qui ne pouvait pas parler

Christophe a demandé où en était le projet. La réponse tenait en un chiffre que
personne n'avait vu : **le contrôle nocturne était annulé depuis trois nuits**,
sans qu'aucune alerte ne parte. LS-235 ouvert, puis corrigé dans la foulée.

## Ce que la question a trouvé

Le journal du 18 attendait le nocturne pour clore LS-233. Ce verdict n'est jamais
tombé :

| Nuit | Résultat | Étape des preuves lourdes | L'alerte |
| --- | --- | --- | --- |
| 17 septembre | `failure` | 2 min 39, rouge | **exécutée** |
| 18, 19 et 20 | **`cancelled`** | coupée après 38 à 40 min | **jamais lancée** |

Un `cancelled` n'ouvre pas d'issue, et personne ne consulte l'onglet Actions d'un
workflow planifié. Les trois nuits sont passées sans un mot.

La preuve tient dans l'issue 346 : un commentaire chaque nuit du 11 au 17
septembre, puis plus rien ces trois nuits-là.

## Deux défauts, et le second était le vrai

**L'étape « Preuves par mutation lourdes » n'avait aucune borne locale.** Elle
consommait tout ce qui restait du plafond du job, puis le runner s'arrêtait.

**L'étape d'alerte portait `if: failure()`**, et une annulation n'est pas un
échec. Elle ne s'exécutait pas.

`npm audit` était l'étape 25, derrière la lourde : **il n'a pas tourné trois
nuits**, alors que `CLAUDE.md` exige un audit à zéro, à mesurer.

## La cause de la bascule, datable à l'heure près

La PR 451 de LS-233 a été fusionnée le 17 à 22h05. Elle a réparé le filtre de
mutation et le step groupé sous `bash -e`, donc **les six scripts tournent
vraiment depuis**, là où deux seulement s'exécutaient.

Le 17, l'étape prenait 2 min 39 en rendant six RATE à liste vide qui ne
mesuraient rien. Le 18, elle dépasse 38 minutes. Le travail du 17 est correct :
il a révélé un coût que le plafond ne couvrait pas.

`docs/PREUVES-PAR-MUTATION.md` avait écrit « le premier temps réel du step
complet sera celui du nocturne du 18 septembre ». Il est tombé, et il dépasse le
budget d'un facteur deux.

## Ce que les mesures ont corrigé

Le tableau de durées du 14 septembre, qui servait de référence, était faux :

| Script | 14 sept. | 20 sept. |
| --- | --- | --- |
| `verifier-etats-non-nominaux` | 67 s | **200 s** |
| `verifier-reintegration-stock` | 415 s | **447 s** |
| `verifier-config-claude` | 31 s | 34 s |
| `verifier-sauvegarde` | 5 s | 5 s |

Trois fois plus pour le premier. `verifier-tests-mutation`, 180 cas, a été
interrompu après 7 : en local il rejoue la suite d'intégration à chaque cas, sans
le cache du runner. Même décision que le 17, pour la même raison.

Le budget de la nuit du 20, qui a dimensionné la correction :

```
16 min  etapes prealables, dont 13 min 27 de bout en bout
10 min  attente avant prise du job, COMPTEE DANS LE PLAFOND
19 min  reste pour une etape qui en demande plus de 40
```

Le job durait **55 minutes pour un plafond de 45** : l'attente avant démarrage
compte dedans.

## Ce qui a dérapé, et c'est le plus instructif

### Ma première correction était fausse, et la preuve l'a dit

J'avais élargi la condition de l'étape d'alerte à `failure() || cancelled()`.
Cela paraissait suffire. Exécution 35509819331, plafond abaissé à 12 minutes pour
forcer une annulation :

```
20 cancelled  Scenarios critiques de bout en bout
26 skipped    Ouvrir une issue en cas d'echec ou d'annulation
```

**L'étape portait pourtant la nouvelle condition.** Quand un job dépasse son
plafond, le runner s'arrête et toutes les étapes restantes sont **sautées**,
quelle que soit leur condition. Aucune étape interne n'a la main.

Sans cette mesure, j'aurais déclaré le défaut corrigé alors qu'il restait entier,
et les nuits seraient restées muettes. Motif « garde-fou jamais exercé », qui
vient de servir à quelque chose.

L'alerte vit désormais dans `veilleur-nocturne.yml`, déclenché par
`workflow_run` : son propre job, son propre plafond, hors d'atteinte de celui du
nocturne.

### Une rédaction qui aurait supprimé le nocturne

`ANNULE: ${{ cancelled() }}` dans un bloc `env:` fait refuser le workflow entier
par l'API :

```
HTTP 422: Unrecognized function: 'cancelled'
```

Aucun job créé, workflow refusé au parsing. Les fonctions de statut ne valent que
dans un `if:`. Corrigé par `job.status`. Une correction censée réparer le
nocturne l'aurait supprimé.

### Un banc d'essai qui ne pouvait pas tourner

`workflow_dispatch` exige que le fichier existe sur la branche par défaut, HTTP
404 sinon. Le banc a été retiré, et les preuves sont passées par le nocturne
lui-même, déjà enregistré, déclenché sur la branche.

## Les quatre corrections

| Geste | Ce qu'il règle |
| --- | --- |
| borne locale de 45 min sur le step | le dépassement **se nomme** au lieu d'annuler le job |
| plafond du job de 45 à 75 min | le step a de quoi **aboutir**, 19 min ne suffisaient pas |
| alerte dans un workflow séparé | une annulation **se voit** |
| `npm audit` remonté en position 11 | plus rien ne peut **l'empêcher de se prononcer** |

**Une borne locale seule n'aurait pas suffi**, et c'est la nuance. Le budget ne
laissait que 19 minutes à un step qui en demande plus de 40 : il aurait échoué
proprement chaque nuit sans rien prouver, soit le défaut que LS-233 venait de
fermer. Le geste de LS-124 reste juste, il condamne de *remplacer* une borne
locale absente par un plafond plus haut ; ici les deux sont posés ensemble.

## Preuves

Borne prouvée par abaissement, protocole de LS-124 critère 5, exécution
35508969905 :

```
##[error]The action 'Preuves par mutation lourdes' has timed out after 1 minutes.

25  failure  Preuves par mutation lourdes
26  success  Ouvrir une issue en cas d'echec ou d'annulation
```

L'étape se nomme, le job sort en `failure` et non en `cancelled`, l'étape
suivante s'exécute.

`npm audit` en position 11, dix-sept minutes avant la casse :

```
11 success Audit des dependances  ->  found 0 vulnerabilities
```

Première mesure de l'audit depuis trois nuits, et il est à zéro.

## Ce qui reste ouvert

**Le veilleur n'est pas prouvé.** GitHub ne déclenche un `workflow_run` que
depuis la définition présente sur la branche par défaut : il ne garde rien tant
que la PR n'est pas fusionnée, et sa preuve doit se faire **après** fusion, en
forçant un nocturne annulé. Le critère 5 de LS-235 reste donc ouvert.

**Les 45 minutes de borne sont une borne supérieure, pas une mesure.** Elles sont
posées au-dessus du plus grand temps observé sur une étape qui n'a jamais fini. À
resserrer dès qu'un nocturne complet aura donné un temps de step réel.

**LS-233** attend toujours son critère 5, un nocturne vert, désormais possible.

**LS-29** attend l'arbitrage de Christophe sur ses huit modèles d'email sans
envoi réel, inchangé depuis le 18.

`controles.yml` porte le même défaut latent : vingt-deux scripts sous `bash -e` à
l'étape « 9z octies », sans borne locale, sous le même plafond de 45 minutes.
Signalé dans LS-235, non traité, faute d'arbitrage sur son périmètre.
