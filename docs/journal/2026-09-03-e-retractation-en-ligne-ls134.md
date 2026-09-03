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

## Vérifications

```
npm run type-check                       aucune erreur
npm run lint                             aucun signalement
npx prettier --check                     All matched files use Prettier code style
npm run test:integration -- retractation 22 tests, tous verts
npx playwright test compte-retractation  26 tests sur 3 largeurs, tous verts
axe-core sur le formulaire               aucune violation
./scripts/verifier-regles.sh             code 0
./scripts/verifier-actions-sensibles.sh  code 0
./scripts/verifier-tests-non-ignores.sh  code 0
mutations                                9 jouées, 9 détectées
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

LS-134 **livrée**, epic LS-6. LS-171 créée sous LS-3, priorité Medium.
