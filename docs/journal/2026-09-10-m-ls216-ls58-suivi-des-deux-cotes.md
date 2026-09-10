# 10 septembre 2026, m : LS-216 et LS-58, le suivi des deux côtés

Deux stories sur le même domaine, livrées à la suite. LS-131 avait posé la
synchronisation qui écrit `livreA`, `statutTransporteur` et `synchroniseA` :
**aucun écran ne les lisait**.

## Ce que personne ne voyait, mesuré

Côté administration, mesure du 10 septembre dans tout `src/app/administration/` :

```
numeroSuivi          seulement dans le formulaire de saisie de expeditions/
livreA               aucun rendu
statutTransporteur   aucun rendu
synchroniseA         aucun rendu
```

L'exploitante saisissait un numéro de suivi et **ne le revoyait jamais**.
Répondre à « où est mon colis » imposait d'ouvrir Sendcloud à côté, et rien ne
disait quelles commandes étaient livrées, donc lesquelles avaient démarré leur
délai de rétractation. C'est elle qui traite les rétractations.

Côté client, l'écran portait déjà quatre lignes, mais `statutTransporteur` et
`synchroniseA` n'étaient pas lus par le repository : le client voyait un numéro
de suivi sans jamais savoir où en était son colis.

## Le socle, et le troisième état qui compte

`fraicheurSuivi` rend **trois** états et non deux. « Jamais lu » est distinct de
« bloqué » : le premier est normal le jour du dépôt, Sendcloud pouvant ne pas
encore connaître le numéro ; le second signale un colis immobilisé. Les
confondre ferait alerter sur toute expédition du jour même.

**Une expédition livrée reste fraîche par construction**, et c'est la garde qui
évite une fausse alerte de masse. `listerASuivre` exclut les expéditions
livrées, donc leur `synchroniseA` cesse d'avancer : sans cette condition, toute
commande livrée depuis plus de vingt-quatre heures serait signalée « bloquée »,
c'est-à-dire la totalité de l'historique de la boutique. Un signalement qui
hurle en permanence cesse d'être lu, et le vrai colis bloqué se noie avec.

Le seuil de vingt-quatre heures se déduit du cycle horaire : vingt-trois cycles
ratés avant d'alerter, assez large pour qu'une panne brève ne fasse pas
clignoter l'écran.

## Le mot « Suivi » portait deux notions

La section « Suivi » de l'écran d'administration portait les **transitions de
statut métier**, règle S9, et ne suit aucun colis. Elle devient « Statut de la
commande », et son ancre `aria-labelledby` suit : la laisser dire « suivi »
ferait diverger ce qu'un lecteur d'écran annonce de ce que l'écran affiche.

## Le bouton « actualiser » est abandonné

Point 5 de LS-216, laissé à arbitrer. LS-33 chantier 3 l'exigeait quand la
synchronisation était pensée à la demande. Elle tourne toutes les heures depuis
LS-131 : le bouton coûterait une Server Action, sa garde de rôle, une limitation
de débit et une surface d'appel direct pour gagner **au plus cinquante-neuf
minutes** sur une donnée que personne ne lit à la seconde.

## Quatre défauts trouvés en chemin

**Une assertion d'absence portait sur un nom devenu inexistant.**
`catalogue-administration.spec.ts` vérifiait que le titre « Suivi » n'apparaît
pas pour un visiteur sans session. Après le renommage, ce titre n'existe plus
nulle part : l'assertion restait verte **y compris sur une fuite réelle**. Motif
« valeurs qui coïncident » déjà en fiche, sous une forme neuve, un test de refus
qui cesse d'exercer son refus.

**`chk_expedition_mode_point_relais` couvre deux modes malgré son nom.** Son
prédicat est `(mode IN ('POINT_RELAIS', 'LOCKER')) = (point_relais_id IS NOT
NULL)`, une équivalence. Un test écrit sur la foi du nom a été refusé par la
base ; corriger le commentaire du test valait mieux que contourner la contrainte.

**Une espace parasite dans le rendu, invisible au source.** Prettier avait coupé
une ligne JSX entre le `n` et son `&apos;`, et JSX insère une espace à chaque
coupure : l'écran portait « La commande n 'est pas modifiée ». Le test e2e l'a
mesurée, la relecture ne l'aurait pas vue.

**Trois commentaires affirmaient que `livreA` n'est jamais écrit**, « aucun
chemin ne l'écrivant avant LS-33 ». Faux depuis LS-131. Une affirmation au futur
se périme sans bruit, motif du journal `l` de ce matin.

## La revue frontend a trouvé cinq défauts, dont un sérieux

`ls-frontend-revue` a été lancée après la fusion de LS-216, sur les deux écrans.
Elle a confirmé deux points sans rien trouver, la neutralité de genre et la
hiérarchie des titres, et relevé cinq défauts réels. Tous vérifiés avant
correction, aucun pris au mot.

**Le signalement d'un suivi jamais lu était inatteignable sur l'expédition qui
en a le plus besoin.** La condition portait `numeroSuivi !== null`. Or le numéro
est **facultatif** à la déclaration, choix assumé du formulaire d'expédition, et
`listerASuivre` filtre sur `numeroSuivi: { not: null }` : une expédition sans
numéro n'est **jamais** synchronisée, et ce n'est pas transitoire. Sa réception
ne sera jamais constatée, donc ni le délai de rétractation ni l'invitation à
déposer un avis ne démarrent, et l'écran affichait une section d'apparence
normale. Un troisième message le dit maintenant, des deux côtés : côté client
l'état était entièrement muet.

**Le bloc d'acheminement était un `div` là où quatre écrans d'administration
emploient un `dl`.** Conséquence mesurable : `.detail dt` porte l'atténuation du
libellé, que mes `span` ne recevaient pas, donc « Transporteur » et « Sendcloud »
s'affichaient à l'identique alors que les sections voisines distinguent les deux.
Le bloc se combine désormais à `.detail` au lieu de la recopier.

**La valeur repassait à gauche après retour à la ligne.** Seule sur sa ligne,
une boîte flex est placée à gauche par `space-between`, et le `text-align: right`
n'agit qu'à l'intérieur d'une boîte dimensionnée par son contenu.
`margin-left: auto` tient l'alignement dans les deux cas.

**La gravité se transmettait par la couleur seule.** Les deux paragraphes,
alerte et information neutre, étaient structurellement identiques : même fond,
même liseré de 3 px, seule la teinte les séparait. Le signalement passe à 5 px
et en gras, principe que `.sectionDanger` de l'espace client appliquait déjà.

**Deux articles de loi différents pour le même fait**, L216-2 et L216-4, quatre
occurrences, tous écrits de mémoire dans la journée. Le dépôt ne porte aucune
source qui tranche, et `CLAUDE.md` interdit de décider d'une obligation juridique
sans vérifier aux sources : les quatre citations sont retirées, le principe reste
énoncé sans numéro. Motif « numérotation juridique périmée », D111-17 devenu
D111-10 en juillet 2024.

**Une septième commande de test** porte le cas du numéro absent, avec son
contrôle de cohérence : un numéro renseigné par mégarde éteindrait les deux
paragraphes, et leurs tests passeraient sans rien prouver.

## LS-33 bloque LS-58 sans raison

Le lien `Blocks` existe toujours dans Jira. La décision qu'il attend est prise :
ADR-042 tranche la correspondance des statuts, LS-131 l'a implémentée. Ce qui
reste réellement sous LS-33 est la **souscription commerciale**.

L'écart est **signalé en commentaire sur LS-33**, sans modifier le lien :
l'arbitrage appartient à Christophe. LS-58 a été traitée sans attendre.

## Le contraste, mesuré et non recopié

`--ls-warning` a été écarté pour le signalement, mesure refaite plutôt que
reprise :

```
--ls-warning   blanc 4,04:1   crème 3,78:1   sable 3,39:1   sous AA partout
--ls-error     blanc 6,56:1   crème 6,14:1   sable 5,50:1
```

Le projet avait déjà tranché ce point deux fois, mêmes chiffres. Le jeton reste
légitime en **bordure**, où seul le 3:1 de WCAG 1.4.11 s'applique.

Les deux écrans ne portent **pas** le même traitement visuel, délibérément. Le
client ne peut rien faire d'un suivi arrêté sinon patienter ou écrire : lui
peindre une alerte rouge annoncerait un incident établi quand le site sait
seulement qu'il n'a plus de nouvelles. L'exploitante, elle, a un geste à faire.

## Une sixième commande de test

Aucune des cinq existantes ne portait d'expédition synchronisée : le bloc
d'acheminement n'aurait été rendu à aucune largeur. `COMMANDE_SUIVIE_TEST` porte
un mode reporté, un suivi vieux de trois jours et `livreA` nul, ce qui rend les
trois branches à la fois.

Elle ne pouvait être greffée sur aucune autre, et le fichier documentait déjà
pourquoi : `COMMANDE_FACTUREE_TEST` porte la demande de rétractation de LS-135,
les deux commandes `EN_PREPARATION` disparaîtraient de la file d'expédition, et
`COMMANDE_TEST` est en attente de paiement.

**Son amorce se vérifie elle-même**, trois contrôles : la ligne existe, les deux
modes diffèrent, et l'âge du suivi dépasse vingt-quatre heures. Un `ON CONFLICT
DO NOTHING` qui n'écrit rien laisserait les tests mesurer une section absente.

## Vérifications

```
npm run type-check                     vert
npm run lint                           vert
npm run format:check                   vert
vitest affichage-commande.test.ts      20 tests, les deux bornes exactes du seuil
vitest administration-commandes        17 tests d'intégration
vitest espace-client-commandes         18 tests d'intégration
playwright compte-commandes            20 tests sur mobile-320
playwright administration-connectee    11 tests d'acheminement
verifier-contraste.sh                  191 paires, toutes conformes
verifier-regles.sh                     règles conformes au schéma
verifier-actions-sensibles.sh          cohérentes
verifier-bordure-controle.sh           181 sélecteurs, seuil 3:1 tenu
```

**Quatre cas de mutation ajoutés**, cas 149 à 152, et rejoués isolément :

```
OK  seuil de suivi bloque rendu inclusif        -> detecte par le test attendu
OK  garde sur une expedition livree retiree     -> detecte par le test attendu
OK  synchroniseA retire de la lecture client    -> detecte par le test attendu
OK  acheminement retire de la lecture admin     -> detecte par le test attendu

4 mutations, 4 detectees, 0 ratees
```

Deux portent sur des défauts qui **ne se voient pas à l'écran**. Le seuil rendu
inclusif, `>` devenu `>=`, ne change le verdict que sur un instant, l'âge
exactement égal au seuil : seules les deux bornes exactes l'attrapent, et des
tests qui n'éprouveraient que « une heure » et « trois jours » resteraient verts.
La garde `livreA` retirée produit la fausse alerte de masse décrite plus haut.

Les deux fichiers neufs ont été ajoutés à `MUTABLES` avant d'être mutés : un
fichier muté hors de cette liste n'est jamais restauré, et le script s'arrête
désormais de lui-même dans ce cas.

## Ce que la production ne porte toujours pas

**Inchangé depuis le journal `l`, et toujours bloquant.** Aucune clé Sendcloud
en production, mesuré : 19 variables dans `/etc/lune-soleil/production.env`,
zéro `SENDCLOUD_*`. La tâche horaire échouera dès sa première exécution, en
silence, et les deux écrans livrés ici afficheront « Aucun statut n'a encore été
lu » sur toutes les commandes.

**Poser les clés avant le prochain déploiement**, qui porte par ailleurs une
migration, l'index `alerte_ouverte_unique`, donc passe par
`./scripts/migrate-production.sh`.

## État des tickets

**LS-216 terminée**, PR #376 fusionnée. Neuf critères sur neuf. Le défaut du
signalement inatteignable a été trouvé **après** cette fusion et corrigé dans la
PR de LS-58 : la story reste close, son critère 4 est désormais vrai dans un cas
qu'il ne couvrait pas.

**LS-58 terminée**, PR #377. Six critères sur six.

Trois échecs e2e préexistants subsistent, tous liés à l'absence délibérée des
clés Sendcloud en bout en bout : mesurés sur le dépôt d'avant ce travail, ils
lui sont antérieurs.

## Prochaine étape

**LS-61**, les avis vérifiés, qui dépend de `livreA` désormais lu et affiché des
deux côtés. **LS-190** est aussi débloquée : son commentaire du 5 septembre
disait que la frise d'étapes supposait le suivi que LS-58 porte.
