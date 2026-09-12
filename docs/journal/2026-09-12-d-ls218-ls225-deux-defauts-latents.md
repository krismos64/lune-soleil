# 12 septembre 2026, LS-218 et LS-225, et deux défauts que rien n'exerçait

Quatrième session du jour, en autonomie : Christophe absent pour quelques heures,
consigne d'enchaîner LS-218 et LS-225 et de trancher seul.

## Ce qui est livré

| Ticket | Sujet | État |
|---|---|---|
| LS-218 | le poids du colis devient un réglage, critère 11 | **10 critères sur 11**, PR #417 |
| LS-225 | modifier son propre avis, R10 | **terminé**, PR #418 |
| LS-226 | deux tests d'intégration instables | **créée**, sa cause établie |

Quatre pull requests fusionnées : #417 et #418 portent le code, **#419** les
comptes et le README, **#420** une correction du présent journal.

**Ce tableau a porté « 9 critères sur 11 » à sa première écriture**, et c'était
faux : les neuf audités **plus** le onzième livré ce jour font dix. Seul le
critère 10 reste ouvert, celui qui exige un colis réel. Le commentaire Jira,
lui, disait juste dès le départ, ce qui montre à quoi sert de tenir les deux.

## Deux questions posées avant le départ, deux arbitrages rendus

**LS-218 était déjà livrée à neuf critères sur dix** par la session du
10 septembre. Son critère 10 exige un colis réel, donc un achat facturé de 4,10 €
à 7,49 € et une commande réelle : Christophe a écarté l'achat et demandé un audit
du code livré à la place. C'est cet audit qui a trouvé le critère 11 non rempli.

**La modification d'avis est sans limite de nombre**, arbitrage de Christophe.
Chaque passage renvoyant en modération, l'effet réel reste borné.

## LS-218, le critère que le tableau de clôture ne listait pas

L'arbitrage du 10 septembre ajoutait un onzième critère : « le poids est un
paramètre **configurable et non une constante** », « même règle que le seuil de
franco de LS-27 ». Le seuil de franco vit dans `ParametreBoutique` depuis LS-98,
réglable sans redéploiement.

Le poids, lui, avait été posé en constante TypeScript. Le commentaire de clôture
de la story listait dix critères et ne mentionnait pas celui qu'il venait
d'ajouter.

**La revue critique a contesté ce constat, et elle avait tort sur la source.**
Elle citait le journal, qui résume par « le forfait reste lisible et
configurable » ; le commentaire Jira, lui, écrit « même règle que le seuil de
franco de LS-27 », ce qui lève l'ambiguïté. Son objection de fond était bonne en
revanche : rendre le poids réglable sans le borner créerait un défaut neuf.

**Les deux bornes viennent du transporteur, et la haute est celle qui compte.**
Un poids au-delà de 250 g ne fait échouer aucun appel : Sendcloud crée
l'étiquette et facture un rattrapage **après coup**, sans qu'aucun code de retour
ne le signale. Le refus ne peut donc venir que du projet, et il vient de trois
endroits, la base, Zod et le message d'écran.

La borne basse, 15 g, est le `min_weight` du transporteur. Un test existant la
citait déjà pour justifier le forfait, ce qui l'a fait entrer dans la contrainte.

## Le défaut latent depuis LS-98, trouvé par le test de concurrence

C'est la part la plus instructive de la session.

Après avoir fait lire le poids par le service, **le test de concurrence de la
création d'étiquette a rougi**, et les 44 autres tests du fichier sont restés
verts. Les deux appels concurrents rejetaient tous les deux.

```
Invalid `client.parametreBoutique.findUnique()` invocation
Unknown argument `in`. Did you mean `not` ?
```

**La cause, vérifiée via Context7 et non devinée** : le dataloader de Prisma
**compacte les `findUnique` du même tick** en un `findMany` portant un filtre
`in`. La clé de `parametre_boutique` est un `Boolean`, type qui n'a pas de filtre
`in` : la requête compactée échoue, et les deux appelants avec elle.

**Le défaut vivait depuis LS-98 sans qu'aucun test ne l'exerce.** Une lecture
seule ne se compacte avec rien, et tous les appelants d'avant lisaient les
paramètres une fois par requête HTTP. Le premier chemin qui en a lancé deux dans
le même tick l'a révélé.

`findFirst` n'est pas compacté et rend la même ligne, l'unicité étant garantie en
base. Le commentaire du repository prescrivait pourtant `findUnique` en
expliquant que `findFirst` « laisserait croire qu'un ordre existe » : un argument
de lisibilité qui ne pèse rien face à une lecture qui échoue.

## LS-225, le test de composant a trouvé un défaut vieux de LS-61

L'écran rendait correctement. Le test de composant, lui, a listé les noms
accessibles réels :

```
Name "2étoiles sur 5"
```

Sans espace. Le calcul du nom accessible concatène les nœuds puis **normalise les
espaces de bord** : l'espace initial du texte masqué disparaît. Le défaut vivait
sur l'écran de dépôt depuis LS-61, invisible à l'œil, les deux `<span>` étant
séparés visuellement.

## Ce que `ls-frontend-revue` a trouvé, et que mes tests ne voyaient pas

**Une affirmation causalement fausse.** L'écran disait « un avis qui n'a pas été
publié ne peut plus être modifié » sur tout avis non modifiable, `RETIRE`
compris. Or un avis retiré **a été publié**, puis dépublié : son auteur l'a vu en
ligne, et lire le contraire contredit son souvenir.

**Le test ne pouvait pas l'attraper**, et c'est le motif connu du dépôt : il
cherchait `/ne peut plus être modifié/`, sous-chaîne présente dans les deux
versions, alors que sa fixture est justement un avis `RETIRE`. Il traversait le
cas faux sans le voir. Une assertion négative s'ajoute, prouvée par mutation.

**Aucun accusé de succès n'existait.** Le bloc se refermait sans un mot : la
carte se re-rendait avec la nouvelle note, ce qui se lit comme un effet de bord,
et surtout **un lecteur d'écran n'annonçait rien**, la région live restant vide.

La région live vit désormais **hors** du bloc repliable, et ce placement porte la
correction : le succès referme le bloc, donc une région posée dedans passerait
`hidden` à l'instant même où elle reçoit son message. Le seul état qu'elle
n'annoncerait jamais serait la réussite.

## Six preuves par mutation

| Cas | Défaut remis | Rouge |
|---|---|---|
| 171 | `findFirst` redevient `findUnique` | 1 sur 45, le test de concurrence |
| 172 | poids remis en constante | 1 sur 711 |
| 173 | filtre par auteur retiré | invariant 2 |
| 174 | `publieA` réécrit | R8 et R11 |
| 175 | retour en modération retiré | R10 |
| 176 | avis écarté rendu modifiable | l'arbitrage sur les statuts |

**Le cas 174 mute par ajout et non par retrait**, et c'est ce que R11 impose : la
protection de `publieA` n'est pas une garde, c'est l'**absence** de la colonne
dans les données écrites. Un défaut par omission ne se mute qu'en ajoutant ce que
l'auteur a délibérément omis.

**Le script complet n'a pas été rejoué en entier**, il rejoue la suite pour
chacun des 176 cas, soit plusieurs heures. Les six cas neufs ont été prouvés un à
un, ce que le critère exige.

## Une instabilité préexistante, observée dans les deux sens

Trois exécutions de la suite complète, sur trois états du dépôt :

```
main avant LS-225   2 echecs   comptabilite ET action-sensible
main avec LS-225    1 echec    comptabilite seule
main fusionnee      1 echec    action-sensible seule
```

**La troisième est la démonstration directe** : même dépôt, même commit, et
l'échec a changé de fichier. Aucun code n'a bougé entre la seconde et la
troisième, seul l'ordre d'exécution a changé.

**La cause est la même dans les deux cas, et elle est nommée.** Les deux
assertions mesurent l'état **global** de la base au lieu de celui que leur propre
fichier a produit : « aucune pièce émise » d'un côté, « exactement un
utilisateur » de l'autre. La base d'intégration est partagée entre fichiers.

Le second test porte d'ailleurs la forme saine deux lignes plus bas : il compte
les lignes **de cet utilisateur précis**, et celle-là est juste.

LS-226 porte le sujet, et son critère 1 est déjà rempli, les deux causes étant
établies par la mesure.

## Documentation propagée

`PARCOURS.md` annonçait **quatre** absences du parcours 7, et **deux de ses
lignes étaient fausses** : le renvoi d'invitation est livré par LS-61 et éprouvé
par un test, la modification l'est par cette story. La phrase « une invitation
part une fois et une seule » tombait avec la première.

`MODELE-CONCEPTUEL.md` porte les deux arbitrages ouverts et la remise à `null` de
`decideA`. `MODELE-LOGIQUE.md` porte les bornes du poids et le piège de la clé
booléenne. `VALIDATION.md` recense les deux schémas neufs.

## Prochaine étape

**LS-218 attend LS-153** pour son critère 10, un colis réel. Rien d'autre ne la
bloque, son code étant servi et audité.

**LS-226 est faisable immédiatement** et sans dépendance, et son diagnostic est
déjà fait : deux assertions à ancrer sur les données que leur fichier a créées
plutôt que sur l'état global de la base. La réparation évidente, vider la table
dans un `beforeAll`, ferait rougir les fichiers voisins, défaut rencontré en
livrant LS-219.

**LS-145 reste le candidat sans dépendance** signalé par les sessions
précédentes : mesurer F-ADM-07 au chronomètre, cible posée en LS-15 et jamais
mesurée.

**L'adresse d'alertes vaut toujours `a-configurer@exemple.invalid`** en
production. Tant qu'elle n'est pas remplacée dans l'écran Paramètres, aucune des
cinq alertes n'arrive nulle part. C'est une action de Christophe.
