# Preuves par mutation, couverture

`CLAUDE.md` pose le principe : **un contrôle qui n'a jamais échoué sur le défaut
qu'il prétend attraper n'est pas un contrôle.** La preuve par mutation est
l'instrument de ce principe, et elle se périme comme tout le reste.

Ce document est la source unique de ce qui est **écarté** de l'intégration
continue, et de pourquoi. `scripts/verifier-couverture-mutations.sh` le confronte
aux workflows : toute preuve doit être rejouée quelque part, ou figurer ici avec
sa raison.

## Ce que l'inventaire de LS-230 a trouvé

Mesuré le 14 septembre 2026 : le dépôt portait **quarante-trois preuves**, quarante-cinq au 23 septembre 2026, quarante-six au 24,
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

**Aucune, au 24 septembre 2026.** Les **quarante-six** preuves du dépôt
tournent, **trente-neuf par PR et sept au nocturne**, comptes relevés par les
commandes ci-dessous et non recopiés.

`verifier-image-docker-mutation.sh` a rejoint le nocturne le 17 septembre. Elle
existait depuis LS-74 **sans être lancée par aucun workflow**, et n'apparaissait
que dans un commentaire de `controles.yml` affirmant que « sa preuve par mutation
vit toujours » dans ce fichier. Le contrôle de couverture ne l'a pas vue, son
ancrage acceptant une mention en commentaire comme un appel.

Cette section reste ouverte : une preuve peut légitimement ne pas pouvoir entrer
en intégration continue, et l'écart s'écrira ici avec son motif. Une exemption
sans raison est un interrupteur, pas une décision, et
`scripts/verifier-couverture-mutations.sh` refuse une ligne qui nomme une preuve
sans rien dire.

**La dispense ne se lit que dans cette section**, jamais ailleurs dans le
document. Une première version du contrôle cherchait le nom dans tout le
registre : les cinq preuves réparées plus haut, citées dans leur tableau
historique, passaient alors pour écartées. Un récit n'est pas une décision.

## Comment les quarante-six se répartissent

**Trente-neuf par PR**, `controles.yml` : **vingt-quatre** groupées dans l'étape
« 9z octies », qui pèsent **82 s** mesurées en les enchaînant avant l'ajout de
`verifier-grep-q-pipefail-mutation.sh` par LS-237 et de
`verifier-mutations-a-sec-mutation.sh` par LS-254, et **quinze** en
étapes nommées, chacune posée par la story qui l'a écrite. Sur une CI qui dure
environ neuf cents secondes quand le code change.

La décomposition annonçait **seize** nommées, donc trente-huit au total :
recomptée à quinze le 17 septembre 2026.

LE COMPTE SE MESURE, IL NE SE LIT PAS DANS UNE SEULE ÉTAPE, et **il ne se
compte pas non plus par un motif nu** :

```
grep -hE "^[[:space:]]*(-[[:space:]]+)?(run:[[:space:]]+)?\./scripts/verifier-[a-z0-9-]+-mutation\.sh([[:space:]]|[;&|]|$)" \
  .github/workflows/controles.yml | grep -oE "verifier-[a-z0-9-]+-mutation\.sh" | sort -u | wc -l
```

**L'ancrage sur le début de ligne est ce qui rend 38 et non 39.** Un
`grep -oE 'verifier-...'` nu retient la mention de
`verifier-image-docker-mutation.sh` dans un **commentaire** de `controles.yml`,
qui n'exécute rien. C'est le défaut exact que
`verifier-couverture-mutations.sh` portait jusqu'au 17 septembre 2026, et une
commande de comptage fausse dans le document qui proclame de mesurer serait pire
qu'aucune commande.

Une première version de ce document annonçait « vingt-deux par PR », le chiffre
de la seule étape groupée, en oubliant les quinze nommées. Le motif est en
mémoire, « compter ne vérifie pas le contenu » : un nombre écrit en toutes
lettres n'est ancré par rien, et `verifier-couverture-mutations.sh` lit des noms
de fichiers, jamais un récit.

**Sept au nocturne**, `nocturne.yml`. Leurs durées du 14 septembre
s'additionnaient à 1024 s, somme de mesures isolées et jamais un temps de step
observé. **Cette somme s'est révélée fausse d'un facteur deux au moins**, et elle
a coûté trois nocturnes annulés : voir plus bas, LS-235.

| Preuve | 14 septembre | 20 septembre | 21 septembre, runner | Ce qui la rend lourde |
|---|---|---|---|---|
| `verifier-tests-mutation.sh` | 456 s | **3507 s le 24**, première exécution complète | **coupée à 1834 s** | 180 cas, dont dix de bout en bout qui reconstruisent l'application |
| `verifier-reintegration-stock-mutation.sh` | 415 s | **447 s** | **716 s** | zone critique, base peuplée |
| `verifier-etats-non-nominaux-mutation.sh` | 67 s | **200 s** | **144 s** | la plus lourde des textuelles |
| `verifier-regles-mutation.sh` | 39 s | à mesurer | non atteinte | schéma, règles et couverture des `paths` |
| `verifier-config-claude-mutation.sh` | 31 s | **34 s** | **14 s** | cohérence de configuration |
| `verifier-image-docker-mutation.sh` | 11 s | non remesurée | hors du step | construit sept images, mesuré le 17 septembre 2026 |
| `verifier-sauvegarde-mutation.sh` | 5 s | **5 s** | **5 s** | lance un conteneur PostgreSQL, que le nocturne a déjà |

**LA TROISIÈME COLONNE EST LA PREMIÈRE MESURÉE SUR LE RUNNER**, nocturne
35573380388 du 21 septembre 2026, et elle contredit les deux autres dans les deux
sens : `reintegration-stock` y coûte **716 s contre 447** mesurées en local,
quand `etats-non-nominaux` y tombe à **144 s contre 200**. Une durée locale ne
prédit donc pas une durée de runner, ni par excès ni par défaut.

Les **quatre** scripts qui ont abouti totalisent **879 s**, soit 14 min 39.
`verifier-tests-mutation.sh` a ensuite consommé les 1834 s restantes sans finir,
et `verifier-regles-mutation.sh` n'a jamais démarré.

**LA COLONNE DU 14 SEPTEMBRE ÉTAIT FAUSSE PAR DÉFAUT**, remesuré le 20 septembre
2026 sur ce poste, LS-235. `verifier-etats-non-nominaux` prend **trois fois** le
temps annoncé. Deux chiffres seulement se confirment, et ce sont les deux plus
courts.

Une durée de ce tableau se **remesure** avant d'être reprise pour dimensionner
quoi que ce soit : celles du 14 septembre ont servi à calculer un budget qui a
annulé trois nocturnes.

**La dernière n'est pas ici pour son poids, mais pour Docker.** À 11 s elle
tiendrait sans peine dans une CI par PR ; elle y manquerait son objet, `docker
build` ne tournant que dans `nocturne.yml`, vérifié par
`grep -nE "^[[:space:]]*(run:[[:space:]]+)?docker build" .github/workflows/*.yml`.

LS-177 avait déjà déplacé le bout en bout, `npm audit` et l'image au nocturne
pour tenir la durée par PR. Les y rejoindre suit le même arbitrage.

**AUCUNE DURÉE DE STEP COMPLET N'A JAMAIS ÉTÉ OBSERVÉE**, et les deux premières
lignes du tableau sont les moins sûres. Le step groupait alors six preuves, la
septième n'ayant rejoint le nocturne que le 17 septembre, dans un seul
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
qu'un échoue. `verifier-image-docker-mutation` a son propre step, donc sept
bilans doivent paraître au rapport.

## Le temps réel du step est tombé, et il a annulé trois nocturnes

Ce document annonçait « le premier temps réel du step complet sera celui du
nocturne du 18 septembre ». Il est tombé les 18, 19 et 20, et voici ce qu'il dit,
LS-235 :

```
etape coupee apres 38, 38 et 40 min SANS AVOIR FINI, les trois nuits
```

La somme de 1024 s, soit 17 minutes, **sous-estimait d'un facteur deux au
moins**. Le coût réel du step reste inconnu à ce jour : aucune des trois nuits ne
l'a laissé aboutir.

**Le job sortait en `cancelled`, et une annulation n'est pas un échec.** L'étape
qui ouvre l'issue d'alerte portait `if: failure()` : elle ne s'est pas exécutée,
et les trois nuits sont passées sans un mot. `npm audit`, placé derrière, n'a pas
tourné non plus.

### Ce que LS-235 a changé

| Geste | Ce qu'il règle |
|---|---|
| borne locale de 45 min sur le step | le dépassement **se nomme** au lieu d'annuler le job |
| plafond du job de 45 à 75 min | le step a de quoi **aboutir**, 19 min ne suffisaient pas |
| alerte en `failure() \|\| cancelled()` | une annulation **se voit** |
| `npm audit` remonté juste après l'installation | plus aucune étape lourde ne peut **l'empêcher de se prononcer** |

**Une borne locale seule n'aurait pas suffi**, et c'est la nuance qui compte : le
budget mesuré ne laissait que 19 minutes à un step qui en demande plus de 40. Le
step aurait échoué proprement chaque nuit sans jamais prouver quoi que ce soit,
ce qui est exactement le défaut que LS-233 venait de fermer.

**Le geste de LS-124 reste juste pour autant.** Il condamne de *remplacer* une
borne locale absente par un plafond plus haut ; ici les deux sont posés ensemble,
et chacun répond à un problème distinct.

### La borne est prouvée

Protocole de LS-124 critère 5, exécution 35508969905 du 20 septembre 2026, borne
abaissée à une minute :

```
##[error]The action 'Preuves par mutation lourdes' has timed out after 1 minutes.

25  failure  Preuves par mutation lourdes
26  success  Ouvrir une issue en cas d'echec ou d'annulation
```

L'étape se nomme, le job sort en `failure` et non en `cancelled`, et l'étape
suivante s'exécute. `npm audit` s'était prononcé dix-sept minutes plus tôt,
`found 0 vulnerabilities`.

### La borne a parlé, et ce qu'elle a dit n'était pas le plafond

Nocturne **35573380388**, 21 septembre 2026, premier à tourner avec la borne.
Elle a coupé, et **c'est une réussite** : au lieu de trois nuits muettes, l'étape
s'est nommée.

```
25  failure  Preuves par mutation lourdes
##[error] The action 'Preuves par mutation lourdes' has timed out after 45 minutes
```

Ce qu'elle a rendu visible change le diagnostic. `verifier-tests-mutation.sh` a
traité **un seul cas sur 180** en 30 minutes :

```
08:02:41  demarrage du script
08:15:14  les deux suites de reference sont vertes
08:27:24  1er cas de mutation detecte     <- 12 min pour UN cas
08:33:15  borne atteinte
```

**Le coût était la cause, pas le dimensionnement.** Chacun des 147 cas
d'intégration relançait la suite entière, mesurée à **419 s** pour 60 fichiers et
947 tests le 21 septembre 2026 sur le poste de développement :

```
147 cas x 419 s  =  61 593 s  =  17 h 06
```

Aucun plafond n'absorbe dix-sept heures. Relever la borne aurait reproduit le
défaut de LS-124, un plafond plus haut à la place d'une correction.

**Le troisième argument de `cas` nommait déjà le test qui doit rougir**, donc le
fichier qui le porte. Le script ne lance plus que celui-là, et le budget tombe à
**2377 s mesurées**, 39 minutes en local. Facteur 26.

Deux effets de bord sont apparus en construisant cette résolution, et ce sont des
défauts réels, du motif « garde-fou jamais exercé » :

- **deux motifs attendus ne désignaient aucun test** et ne pouvaient donc rendre
  que `RATE`. La purge annonce « six tables » depuis qu'elle en couvre six, le
  test de rétractation « 749 » depuis ADR-035 : les deux motifs étaient restés à
  « trois » et « 499 »
- **deux autres nomment un `it.each`**, dont le `%s` n'existe qu'en sortie et
  jamais dans le source

**Une durée locale ne prédit pas une durée de runner**, dans les deux sens :
`reintegration-stock` coûte 716 s sur le runner contre 447 en local, quand
`etats-non-nominaux` y tombe à 144 s contre 200. La borne se resserre donc sur
une mesure de runner, pas sur celle de ce poste.

**À resserrer dès qu'un nocturne complet aura donné un temps de step réel.** Les
45 minutes sont posées au-dessus du plus grand temps observé sur une étape qui
n'a jamais fini, donc au-dessus d'une borne inférieure, et non sur le double du
pire cas nominal que ce document exige ailleurs.

### La première exécution complète, et ce qu'elle a coûté d'aller au bout

LS-252, le 24 septembre 2026. `verifier-tests-mutation.sh` n'était **jamais allé
au bout** : arrêté au cas 93 le 22, au cas 98 le 23, coupé par la borne au
premier cas de bout en bout les nuits des 22 et 23. Les « 2377 s mesurées »
ci-dessus venaient de ces exécutions interrompues, et ne formaient donc pas un
budget.

**Les nuits des 22 et 23 avaient une cause que le ciblage de LS-235 avait
laissée** : les dix cas de bout en bout rejouaient chacun la suite Playwright
entière. Sur le runner, le premier a pris 11 minutes à lui seul, la suite en
dure 13,6, et le commentaire du script affirmait que ces cas « ne pèsent pas dans
le budget ». Ils ne lancent plus que leur fichier porteur ; les préparations
tournent toujours, mesuré par `--list`.

Aller au bout a exigé **six corrections**, toutes du motif « garde-fou jamais
exercé », aucune visible tant que le script mourait avant :

| Cas | Défaut | Depuis |
|---|---|---|
| 96 | l'expression énumérait les arguments de `passerCommande` d'avant `fraisPortPresenteCentimes` | LS-98, 11 septembre |
| 134 | la garde de l'émetteur non configuré avait été retournée par la revue critique | LS-126, 31 août |
| vignette | l'accueil levait sous mutation, Playwright attendait `/` 180 s puis s'arrêtait sans lancer un test : liste d'échecs vide | la disponibilité lue sur `/` |
| 148 | deux autres gardes masquaient l'absence de celle-ci ; ce qui tombait était un **oracle** sans test | la garde d'`avoir.ts` |
| 180 | la détection dépendait de l'ordre des fichiers, « NON détecté » en fichier seul **et** en suite entière | LS-226 |
| éditeur, débordement et garde | un motif générique désignait vingt-cinq et trois fichiers, le porteur est désormais imposé | LS-111 |

**Le contrôle à sec aurait vu les deux premiers en quelques secondes**, en
appliquant chaque expression à son fichier sans lancer de test : 188 expressions,
une seule périmée restait après la première. Ils se sont révélés après 29 et
30 minutes d'exécution.

**Deux défauts réels, et non de script** : le cas 148 a fait écrire le test
« ne révèle pas l'état de la demande à un compte CLIENT », qui rougit sous
mutation sur `statutActuel: "DEPOSEE"` ; le cas 180 a rendu déterministe un test
qui ne tenait qu'à son voisinage.

**Le budget en découle, et la borne monte cette fois.** 3507 s en local, 58 min,
contre 12 min 37 et 7 min pour les suites de référence, soit un runner 1,5 à
1,8 fois plus lent : environ 100 à 115 min pour ce seul script. La borne de
l'étape passe à 150 min et le plafond du job à 180, **après** la correction du
coût et non à sa place, ce que LS-124 exige. Arbitrage de Christophe le même
jour : une durée plus longue la nuit ne pose pas de problème. Le script imprime
désormais la durée de chaque cas, sur laquelle les deux se resserreront.

**Le runner l'a confirmé le lendemain, nocturne 35967594574** : l'étape est
allée au bout en **2 h 05**, et six preuves ont rendu leur verdict. Il a aussi
rendu cinq RATE que ce poste ne produisait pas :

- **trois motifs portant « : »** : sur le runner, seule l'annotation `::error`
  nomme le test, et GitHub y encode `:` en `%3A`. Les filtres ne décodaient que
  `%2C`, dans trois scripts. Ils décodent désormais `%2C`, `%3A`, `%0A`, `%0D`
  et `%25`, ce dernier en dernier
- **le cas 112** produisait du SQL invalide, puis, corrigé, restait vert sur un
  test que la garde `quantite_reservee >= ...` protégeait déjà. Il est porté
  par un test de double vente, écrit pour lui
- **deux listes vides** non reproduites : la branche RATE imprime la sortie
  brute dans ce cas

**Une preuve verte sur ce poste ne dit rien du runner**, et c'est le troisième
écart de ce genre sur ce document, après les durées et les reporters.

### Le premier nocturne vert, et le coût qu'il a montré

Nocturne **36011272260**, 24 septembre 2026 : `180 mutations, 180 detectees`,
étape en **2 h 05** pour une borne de 150 min, soit une marge de 20 %, sous le
double exigé plus haut. La durée par cas, désormais imprimée, a désigné la
cause : médiane **9 s**, mais **seize cas à 104 s**, qui relançaient chacun les
cinquante-trois tests de `avis.sequential.test.ts`.

**Chaque cas ne lance plus que le test attendu**, filtré par son nom, `-t`.
Arbitrage de Christophe : réduire le coût plutôt que relever la borne. Mesuré
en local sur l'exécution complète : **3507 s avant, 1902 s après**, médiane
4 s, et `180 mutations, 180 detectees`.

**Un test isolé peut échouer sans la mutation** s'il dépendait de l'état laissé
par ses voisins, et sa détection ne prouverait alors rien. Le script le **rejoue
sans mutation** quand le filtre a joué, et refuse de conclure s'il échoue.
Prouvé en cassant exprès le test du cas 2 : `RATE ... le test attendu echoue
aussi SANS mutation`, avec l'assertion en cause.

**Mesuré sur le runner ensuite, nocturne 36039763238** : étape en **1 h 22**
contre 2 h 05, job en 1 h 40, `180 mutations, 180 detectees`. La borne de
l'étape passe à **165 min**, le double de ce temps, et le plafond du job à 200.

### Le contrôle à sec, LS-254

Les trois expressions périmées de ce jour se sont révélées après une trentaine
de minutes chacune, au moment où l'exécution les atteignait.
`verifier-mutations-a-sec.sh` applique **chaque expression `mute` à son fichier,
en mémoire et sans lancer de test**, à chaque PR : 215 expressions dans six
scripts, en quelques centièmes de seconde, le 24 septembre 2026. Il découvre
lui-même tout script qui définit `mute()`, lit la signature des fonctions qui
l'appellent, et repart du fichier d'origine après chaque `cas`, comme le vrai
script.

**Rejoué sur le dépôt d'avant les corrections, `d08e14d`, il désigne exactement
les deux expressions** qui ont coûté deux nocturnes, `paiement.ts` et
`webhook-paiement.ts`.

**Ce qu'il ne voit pas** : une expression qui mute bien son fichier mais rate son
test, ce que seule la preuve réelle mesure, et les mutations écrites autrement
qu'avec `mute`, `perl -pi` direct dans `verifier-regles-mutation.sh` et
`verifier-config-claude-mutation.sh`.

**Sa première version portait deux défauts, trouvés en l'exécutant** : sans
remise à zéro après `cas`, les mutations s'accumulaient et onze expressions
saines passaient pour périmées ; une fonction écrite sur une ligne faisait
sauter le reste d'un script, qui rendait zéro appel. La garde « zéro appel » a
attrapé le second, sa preuve par mutation garde le premier.

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
