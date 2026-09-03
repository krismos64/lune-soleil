# 3 septembre 2026, session E : LS-134, la rétractation en ligne

Christophe s'est absenté en accordant l'autonomie complète. Deux arbitrages
tranchés avant son départ : les deux chemins d'accès, session et jeton signé, et
un écran d'information plutôt qu'un refus après saisie quand le délai est expiré.

## Ce que la story livre

La face client du parcours 5, étapes 1 à 5. `src/services/retractation.ts` porte
le cas d'usage, `src/repositories/retractation.ts` les écritures, et trois
fichiers l'écran sous `/compte/commandes/[id]/retractation`.

**Aucune migration n'a été nécessaire.** `DemandeRetractation`, `JetonAcces` et
la portée `RETRACTATION` existaient en base depuis la migration initiale sans
qu'aucun code ne les atteigne, comme pour LS-126 et LS-130.

L'obligation est l'article L221-21 : une fonctionnalité en ligne, gratuite,
accessible pendant tout le délai. Un formulaire à télécharger ne suffit pas.

## Trois choix que la loi impose, pas l'ergonomie

**Le motif est facultatif, et l'écran l'écrit.** Le droit de rétractation est
inconditionnel, article L221-18 : exiger un motif le conditionnerait. Le champ ne
porte ni `required` ni étoile d'obligation, et le bouton n'est jamais désactivé
par une saisie vide.

**Les frais de retour sont annoncés avant la confirmation et dans l'accusé**,
article L221-23. Sans cette mention ils reviennent au vendeur, et la charge de la
preuve pèse sur lui.

**Le lien reste visible même délai expiré ou demande déjà déposée.** C'est la
page cible qui explique la situation. Le masquer laisserait le client sans
réponse sur un droit qu'il croit avoir, ce que l'article L221-20 sanctionne par
un délai porté à douze mois.

## Le défaut que seul le test de bout en bout pouvait voir

**L'accusé de succès était écrasé avant d'être lu.** Le dépôt réussissait, la
demande était bien créée, et le client voyait « une demande de rétractation a
déjà été enregistrée » : un message donnant l'impression d'un doublon, à
l'instant précis où il venait de poser un acte juridique.

La cause est documentée par Next.js 16, vérifiée via **Context7** :

> ce re-rendu est inclus quand l'action appelle `updateTag`, `revalidatePath`,
> `refresh`, modifie les cookies, ou appelle `redirect`

Ma Server Action appelait `revalidatePath` sur le détail de commande. La route
courante était donc re-rendue dans la même réponse, le serveur voyait la demande
désormais créée, et rendait l'état « déjà déposée ».

**Le second argument `"page"` ne corrige rien**, contrairement à ce que j'ai cru
d'abord : il borne la portée de l'invalidation, pas le re-rendu de la route
courante. La correction est de ne pas revalider du tout, les deux pages
concernées étant `force-dynamic` donc relues à chaque visite.

**Aucun des 22 tests d'intégration ne pouvait le voir**, la base étant correcte
dans les deux cas. Seul un test qui regarde l'écran l'attrape.

## Deux tests qui passaient pour la mauvaise raison

**Le test de signature de jeton.** Ma première version altérait un caractère de
la valeur entière. Or `empreinteJeton` porte sur la valeur complète, signature
comprise : l'empreinte changeait, la ligne devenait introuvable, et le refus
venait de là. Neutraliser `signatureJetonValide` laissait **les 22 tests verts**.

LS-132 avait rencontré exactement le même piège le 1er septembre et l'avait
résolu : poser en base l'empreinte de la valeur **modifiée**, ce qui fait exister
la ligne et rend la signature seule capable de refuser. J'ai repris sa solution
après avoir cherché la mienne, moins bonne.

**Le test de débordement mesurait la mauvaise page.** `ouvrirLaRetractation`
rendait la main juste après le clic, donc avant la fin de la navigation. Les
tests qui attendent ensuite un élément se synchronisaient d'eux-mêmes ; celui du
débordement, qui mesure immédiatement, mesurait le détail de commande.

Il annonçait 43 px de débordement sur un formulaire qu'il n'avait jamais
affiché. **Une mesure prise au mauvais moment accuse le mauvais écran.**

## Un défaut préexistant, révélé et ticketé

Ces 43 px sont réels, mais ils appartiennent au **détail de commande** livré par
LS-57 : un libellé de produit long sans espace déborde à 320 px.

```
SPAN  w=288  scrollWidth=331     CollierAurorePendentifLapisLazuliDoreAlOrFin
```

Le point qui intrigue : `compte-commandes.spec.ts` porte la **même** fixture
durcie, choisie exprès pour ce motif, et son test de débordement passe.
**LS-171** est créée sous LS-3 et demande d'élucider cet angle mort **avant** de
corriger le style.

## Ce que les deux revues ont trouvé

**La revue critique a trouvé le défaut majeur de la session, et il était grave.**

Le service annonçait deux chemins d'autorisation. Recherche exhaustive : les
deux seuls appels à `ecrireJeton` du dépôt écrivent une portée `DOCUMENT`, et
aucune route publique ne consommait la voie `JETON`. **Un acheteur sans compte
n'avait donc aucune fonctionnalité en ligne pour se rétracter**, ce qui est le
manquement même à l'article L221-21 que cette story doit fermer. Le critère 1
n'était pas rempli, et le code avait la forme d'un travail complet.

Corrigé dans la session : le jeton naît dans la transaction d'émission de
facture, protégé du rejeu par la même sortie anticipée, et la route
`(boutique)/retractation/[jeton]` le consomme. **Deux jetons distincts et non
un seul**, règle L6 : une fuite du lien de facture ne doit pas donner le pouvoir
de rétracter la commande d'autrui. Sa durée est de soixante jours quand celle du
document est de trente, le délai courant à compter de la réception.

**Ce qui reste ouvert, et qui est ticketé.** Personne ne transmet encore ces
jetons : `jetonAcces` non plus n'a jamais eu de consommateur depuis LS-132,
l'email de confirmation n'étant pas branché. **LS-172** le porte, en High, et
bloque LS-136. Tant qu'elle n'est pas livrée, la route existe mais le lien
n'arrive pas au client : le commentaire de `facture.ts` le dit explicitement
plutôt que de laisser croire le contraire.

**Deux commentaires décrivaient une garde qui n'existe pas.** Ils annonçaient
une lecture préalable avant la création de la demande. Il n'y en a aucune :
`P2002` est le seul rempart. Le rattrapage **hors** transaction est correct
précisément parce que la création est la première écriture du bloc, donc son
échec n'y laisse rien à annuler et le `25P02` ne peut pas se produire. Les
commentaires disent maintenant cela, et interdisent de déplacer la création.

**La revue frontend a trouvé six défauts réels**, tous corrigés :

- **le lien « Contact » menait à `/aide#contact`, une route qui n'existe pas**,
  sur l'écran du délai expiré où c'était la seule issue offerte au client
- il ne portait aucune classe, donc rendait en bleu du navigateur, qu'ADR-022
  écarte du projet
- **le focus retombait sur `body`** quand le bloc de succès remplaçait le
  formulaire : au clavier, la confirmation était inatteignable
- le `role="status"` n'avait ni `aria-live` ni `aria-label`, contre la
  convention du projet et la fiche sur l'ambiguïté de `getByRole("status")`
- **l'écran affirmait « nous vous avons envoyé un accusé »** alors que l'envoi
  n'est qu'en attente dans l'outbox, et désignait cet email comme preuve unique.
  C'est `deposeeA` qui fait foi, et le texte le dit maintenant
- **le bloc du détail de commande annonçait la rétractation sans les frais de
  retour**, alors que c'est le premier endroit où le droit apparaît et le seul
  atteint par un client qui ne clique pas

**Deux défauts signalés n'en étaient pas**, vérifiés avant correction : le
détail de commande porte bien `force-dynamic`, donc mon commentaire était exact,
et la revue avait eu raison de dire qu'elle ne pouvait pas conclure.

## L'ajout du jeton a fait rougir deux tests de LS-132

Tous deux supposaient **un seul jeton par commande**. Le premier les comptait,
le second exigeait la révocation de tous les jetons actifs alors que
`reemettreJetonDocument` ne doit précisément pas toucher celui de rétractation.

Le même piège m'a repris dans mon propre test de consommation, deux fois de
suite : d'abord « le premier jeton de la commande », puis « il y a exactement un
jeton `RETRACTATION` ». L'assertion désigne maintenant le jeton **par son
empreinte**, ce qui est insensible au nombre de jetons présents.

## La preuve par mutation, neuf sur neuf

| # | Mutation | Tests rouges |
|---|---|---|
| 1 | motif rendu obligatoire | 6 |
| 2 | signature non vérifiée | **1**, après correction du test |
| 3 | expiration non vérifiée | 2 |
| 4 | consommation non vérifiée | **1** |
| 5 | révocation non vérifiée | **1** |
| 6 | portée non vérifiée | **1** |
| 7 | garde hors délai retirée | **1** |
| 8 | session non restreinte au propriétaire | **1** |
| 9 | jeton non consommé | **1** |

Sept mutations sur neuf sont détectées par **exactement un test**, celui qui les
vise : c'est ce qui prouve qu'aucun test n'est sauvé par ses voisins.

## Le piège du jour, rencontré deux fois

Une commande porte **deux** jetons : celui de la facture, émis par LS-132 à la
confirmation, et celui de la rétractation. Mon test lisait « le premier jeton de
la commande » et tombait sur celui de la facture, jamais consommé. Il accusait un
service pourtant correct.

La portée est désormais dans la clause, et le test vérifie en plus que le jeton
de facture **reste intact** : consommer la rétractation ne doit pas fermer
l'accès au document, qui est une consultation répétable.

## Ce qui reste à LS-131 et n'a pas été inventé

`Expedition.livreA` n'est renseigné par personne tant que LS-131 n'existe pas.
C'est un **état**, pas une panne : `AVANT_RECEPTION` est distinct d'`EXPIREE`, et
le dépôt reste possible, le droit courant dès la conclusion du contrat.

Le repli en l'absence de suivi appartient à LS-131, qui allonge le délai sans
jamais l'avancer. L'inventer ici aurait été la faute que `legal.md` nomme
explicitement.

## Deux défauts que seule la CI pouvait révéler

**Les quatre variables `FACTURE_*` n'étaient pas définies en intégration
continue**, et c'est un défaut préexistant depuis LS-126.

`emettreFacture` lève `EmetteurNonConfigureError` quand elles manquent, et la
confirmation **attrape** cette erreur pour ne pas perdre le paiement : elle
journalise et continue. Le défaut était donc écrit **trente fois par exécution
en niveau `error`** sans faire échouer une seule assertion.

```
{"niveau":"error","message":"Facture non emise, emetteur non configure",
 "erreur":"EmetteurNonConfigureError"}
```

Il s'est vu quand un test a exigé une **conséquence** de la facture : les jetons
de LS-134 naissent dans sa transaction, donc aucune facture signifie aucun
jeton. Reproduit en local en vidant les quatre variables, quatre échecs
identiques à ceux de la CI.

**Le motif est réutilisable** : une erreur rattrapée pour ne pas perdre un
paiement devient une erreur invisible aux tests. Ce qui l'a révélée n'est pas un
contrôle, c'est une assertion sur un effet en aval.

**Mon nettoyage de test laissait vingt-cinq commandes derrière lui.** Le
`afterEach` ne supprimait que les quatre tables propres à la story.
`commande-transaction.sequential.test.ts` lit `SELECT commande_id FROM
reservation` **sans filtre** et attend une seule ligne : son test de concurrence
sur la pièce unique, **test phare du projet**, a échoué en annonçant vingt-cinq
acheteurs servis.

Invisible en local, l'ordre d'exécution des fichiers y différant de celui de la
CI. Un fichier qui laisse des lignes ne casse que ses successeurs, et seulement
selon l'ordre.

## Vérifications

```
npm run type-check                           aucune erreur
npm run lint                                 aucun signalement
npx prettier --check                         code style conforme
npx vitest run --project unitaire            411 tests, tous verts
npm run test:integration                     47 fichiers, 670 tests, tous verts
npx playwright test compte-retractation      26 tests sur 3 largeurs
npx playwright test retractation-sans-compte 20 tests sur 3 largeurs
axe-core sur les deux formulaires            aucune violation
./scripts/verifier-regles.sh                 code 0
./scripts/verifier-actions-sensibles.sh      code 0
./scripts/verifier-tests-non-ignores.sh      code 0
mutations                                    9 jouées, 9 détectées
```

**Le plafond de débit a fait échouer la préparation e2e trois fois**, ce qui est
le fond de bruit décrit par **LS-168** et non un défaut de cette story. La table
`rate_limit` a été vidée avant chaque exécution complète.

## Prochaine étape

L'epic LS-6 garde **trois** stories : LS-135, le traitement d'une rétractation
côté administration, qui dépend de LS-33 ; LS-136, l'information aux trois
emplacements ; LS-148, les cookies, bloquée par LS-141.

**LS-136 est faisable sans l'exploitante ni le VPS**, et elle est le complément
naturel de celle-ci : la fonctionnalité existe, reste à l'annoncer avant la
commande, dans les conditions générales et dans le formulaire type.

Les autres directions sont inchangées : LS-137 le référencement, LS-156 le
contrôle d'environnement, LS-141 puis LS-148, LS-168 sur le fond de bruit e2e, et
désormais LS-171.

## État des tickets

LS-134 **livrée**, epic LS-6, les neuf critères remplis.

**LS-171** créée sous LS-3, priorité Medium : le débordement du détail de
commande. **LS-172** créée sous LS-5, priorité High : l'email de confirmation
porteur des deux liens, qui **bloque LS-136**.
