# 18 août 2026, LS-105, la fiche produit publique

Quatrième session du 18 août, après LS-111, LS-112 et LS-104. Elle ouvre
`/produit/[slug]`, route que le catalogue liait depuis la veille et qui rendait
404 : les cartes pointaient vers une page absente.

Une correction hors ticket la précède, le centrage de l'écran de connexion
d'administration, repérée en montrant les écrans existants à Christophe.

## Le centrage qu'aucun test ne voyait

`max-width: 42ch` portait sur le seul conteneur du formulaire, sans centrage ni
borne sur la page : à 1280 px le bloc collait au bord gauche pendant que le titre
s'étendait sur toute la largeur. Invisible à 320 px, où la borne n'est jamais
atteinte.

**La mesure de débordement ne voit pas ce défaut**, et c'est ce qui l'avait laissé
passer : rien ne dépassait, les trois projets restaient verts. Un test de centrage
l'attrape désormais, restreint à `bureau-1280` puisqu'en dessous les deux marges
valent zéro de chaque côté et le test passerait sans rien prouver.

La correction suit `reauthentification.module.css`, écran jumeau que le
commentaire du formulaire disait déjà suivre. Fusionné en PR 126.

## Deux arbitrages de conception

**La disponibilité est calculée par variante, non cumulée.** Le catalogue cumule,
et c'est juste pour une carte qui annonce un produit. Sur une fiche, cumuler
dirait « en stock » alors que la déclinaison affichée est épuisée.

**Un seul composant client porte les blocs 3 à 8.** Prix, disponibilité et
dimensions dépendent tous de la variante choisie : les séparer aurait demandé un
contexte ou un rechargement, que le critère 5 interdit.

## Le 404 qui rendait 200, et c'est le point lourd

Le test e2e a trouvé ce qu'aucune vérification manuelle n'aurait cherché : un
produit en brouillon et un slug inconnu répondaient **200**, pas 404.

La cause est structurelle. `loading.tsx` enveloppe la page entière dans une
frontière Suspense : le streaming de la réponse commence **avant** que
`notFound()` soit atteint, et Next.js laisse alors le statut à 200 en se
contentant d'ajouter un `noindex`. Vérifié par Context7 sur la documentation de
Next.js 16, puis mesuré : 404 sans le fichier, 200 avec.

**Le SEO tranche**, et il est prioritaire sur ce projet. Un brouillon qui répond
200 devient indexable, et le `noindex` ne protège que des moteurs qui le
respectent. L'écran figé pendant le rendu n'est qu'un défaut de confort, un
statut faux est un défaut de correction.

`loading.tsx` est donc retiré de cette seule route, l'arbitrage écrit dans la
page pour qu'il ne soit pas recréé sans le comprendre. Le catalogue n'est pas
concerné, il ne fait jamais de 404 : un slug de catégorie inconnu rend le
catalogue entier, ce qui est voulu.

Ce qui le rétablirait sans le conflit : déplacer le contenu lourd sous un
`<Suspense>` dans la page, en gardant le contrôle d'existence au-dessus. La
lecture étant unique et rapide, l'ajouter compliquerait la page pour un gain nul.
À reconsidérer si la fiche gagne des données lentes, les avis de LS-61 par
exemple.

## Trois défauts trouvés hors des tests

**Le contraste du lien légal**, trouvé par axe-core. `--ls-accent-gold-deep` est
documenté à 4,72:1, ce qui est vrai sur le fond crème et faux sur le sable du
bloc légal, où il tombe à 4,23:1. C'est le motif exact de LS-104 sur un autre
jeton : un rapport annoncé dans un jeton ne vaut que pour un fond. `--ls-primary`
y donne 7,49:1, mesuré.

**Le lien vers `/retractation` menait à une 404.** La route n'existe pas, elle
appartient à LS-28. Le texte obligatoire reste, son absence coûtant plus cher que
l'absence de renvoi ; le lien part, un critère de LS-28 exigeant justement que
les liens « pointent vers ces pages réelles ». La dépendance est tracée en
commentaire sur LS-28 plutôt que laissée dans le code.

**Une fiche sans photographie laissait la moitié de l'écran vide.** La grille
gardait ses deux colonnes de 548 px alors que la galerie n'était pas rendue.
Aucune mesure de débordement ne le voit, rien ne dépassait. Corrigé par
`.achat:first-child`, sélecteur structurel plutôt que classe conditionnelle : le
bloc n'est premier que si la galerie a laissé la place.

## Le bouton qui promettait une action

Sur une pièce en stock, « Ajouter au panier » était **actif et sans effet** : la
mécanique de réservation appartient à la phase 3, epic LS-4. Un clic ne produisait
rien, ni message ni changement d'état, ce que `frontend-design.md` interdit,
« jamais de faux succès optimiste ».

Arbitrage de Christophe : le bouton est désactivé et son libellé dit pourquoi,
« Vente en ligne bientôt disponible ».

**Les deux libellés se distinguent, et c'est tout l'intérêt de la formulation.**
« Épuisé » dit que cette déclinaison n'est plus disponible ; l'autre dit que la
boutique n'ouvre pas encore alors que le badge affiche « En stock » juste
au-dessus. Les confondre ferait croire à une rupture sur le catalogue entier.

Les tests visent donc le bouton par un motif couvrant ses trois libellés
possibles. Figer l'un des trois ferait rougir les tests d'ordre le jour où LS-4
rendra au bouton son état actif, sans qu'aucun ordre n'ait bougé.

## Deux tests qui ne prouvaient rien

**Le test des vignettes se passait en `skip`** sur les trois largeurs : la
préparation ne posait qu'une photographie, et la galerie n'affiche ses vignettes
qu'à partir de deux. La correction LS-85 des noms accessibles n'était donc
vérifiée nulle part. Une seconde photographie entre dans la préparation, le test
s'exécute.

**Une assertion cherchait « 7 » dans la fiche sérialisée** pour prouver qu'aucune
quantité ne fuit. Elle rougissait sur les UUID et sur le prix, donc elle aurait
rougi quel que soit le code. Remplacée par une comparaison sur les valeurs
numériques, avec une quantité improbable.

## Chiffres

**495** tests unitaires et d'intégration, dont 17 neufs sur la fiche. **231** de
bout en bout, contre 200 avant cette story, dont 33 sur la fiche seule.

**Six** mutations exercées et détectées, chacune sur le défaut que le test prétend
attraper :

| Mutation | Ce qui rougit |
|---|---|
| `statut: "ACTIF"` retiré | les 3 tests de garde, et eux seuls |
| filtre de contenu vide retiré | les 2 tests C23 |
| `trim()` remplacé par `!== ""` | le seul test des espaces |
| prix déplacé après le bouton | le test d'ordre, en montrant le déplacement |
| `loading.tsx` recréé | les 2 tests de 404, « Expected: 404, Received: 200 » |
| règle de pleine largeur retirée | « Expected: <= 2, Received: 572 » |

Le décompte annonçait « quatre » dans un premier jet quand la liste en portait
six. C'est le motif de [[lune-soleil-compte-recopie-nest-pas-mesure]] : un nombre
écrit à côté d'une liste se périme dès que la liste bouge, la table le rend
vérifiable d'un coup d'œil.

## Deux erreurs de conduite

`git checkout` lancé pour annuler une mutation a effacé **deux fois** du travail
non commité, qu'il a fallu réécrire. Le piège est documenté en mémoire depuis
longtemps. La règle qui en sort : commiter avant toute mutation, sans exception.

Un `UPDATE` sans clause dans un script jetable a écrasé les dimensions des deux
variantes d'un coup, ce qui a fait croire un instant à un défaut du sélecteur.

## État des tickets

LS-105 **En cours** au moment d'écrire, en attente de la PR et de la fusion.

**LS-85** avance : les trois vignettes sans nom accessible du prototype sont
corrigées, et le test qui le prouve s'exécute vraiment. L'autre écart de LS-85,
les régions live, était déjà traité en LS-104.

**LS-28** porte une dépendance nouvelle, tracée en commentaire : ajouter le renvoi
vers la page de rétractation depuis le bloc légal de la fiche, une fois cette page
publiée.

**LS-4**, phase 3, devra rendre au bouton d'achat son état actif.

## Prochaine étape

**LS-106**, huitième et dernière story du découpage de LS-3 : stock multicanal,
journal des mouvements, suspension de la vente web et seuil d'alerte. Elle ferme
la tranche verticale de l'epic.

Deux points à ne pas confondre en l'abordant, sa description les détaille :
suspendre la vente web ne crée **aucun** mouvement de stock, invariant 6 ; et la
clé d'unicité de `MouvementStock` est filtrée sur `type = 'VENTE_WEB'`, donc elle
ne couvre pas les ventes externes. L'étendre sans mesurer rouvrirait le piège
d'index partiel déjà rencontré deux fois.

**LS-63** est voisine et peut se traiter avec elle : elle porte le montant
encaissé d'une vente externe, dont la conception en base est déjà livrée.
