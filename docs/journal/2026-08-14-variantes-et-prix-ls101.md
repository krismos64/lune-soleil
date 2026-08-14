# 14 août 2026, LS-101, variantes, référence unique et prix en centimes

Quatrième session du 14 août, après LS-100. Elle rend le produit vendable en lui
donnant des déclinaisons : référence, libellé, dimensions, prix et stock.

## L'arbitrage rendu en cours de route, ADR-029

Le contrôle avant zone critique a buté sur une question que ni la story ni la
documentation ne tranchaient : **la référence d'une variante est-elle modifiable
après création ?**

`MODELE-CONCEPTUEL.md` décrit précisément le dégât d'une modification, sans en
tirer d'interdiction : le passage sert à écarter `referenceFigee` comme clé de
regroupement des avis, pas à figer le champ. Aucune règle numérotée ne tranchait,
C2 et C14 portant sur l'**attribution** d'une référence et non sur la stabilité
de sa valeur.

**Christophe a retenu la référence librement modifiable**, avec avertissement à
l'écran. J'avais recommandé de la figer, et j'ai signalé une fois les deux
conséquences avant de coder : les avis déjà déposés restent sur l'ancienne
référence, et les statistiques par référence se scindent. La décision tient, et
elle est tracée dans **ADR-029** plutôt que laissée implicite dans le code.

L'ADR fixe aussi la contrainte pour plus tard : **LS-61 devra regrouper les avis
par `varianteId` et jamais par `referenceFigee`.** C'est la parade que le modèle
conceptuel nommait déjà, et elle rend la question sans objet.

`MODELE-CONCEPTUEL.md` est corrigé : son second scénario n'est plus hypothétique.

## Le prix, et la justification que j'avais écrite fausse

`prixCentimes` est un entier, invariant 1. L'exploitante saisit des euros. La
conversion se fait par **découpage de la chaîne**, partie entière et partie
décimale lues comme deux entiers puis recombinées, sans qu'aucun flottant
n'apparaisse.

**J'ai d'abord justifié cette forme par une affirmation fausse**, et c'est le
script de mutation qui l'a révélée. Le cas 63 remplaçait le découpage par
`Math.round(x * 100)` et exigeait que les tests rougissent. Ils sont restés
**verts**, et l'enquête a donné raison à la mutation :

```
Recherche exhaustive de 0 à 2000 euros, montants à deux décimales :
  écarts entre Math.round(x * 100) et la valeur exacte  ->  0
```

Sur des montants à deux décimales au plus, `Math.round(x * 100)` ne se trompe
**jamais** : l'erreur du flottant y reste toujours inférieure au demi-centime.
Les valeurs souvent citées, `0.07 * 100` valant 7.000000000000001 ou
`4.35 * 100` valant 434.99999999999994, sont bien inexactes, mais l'arrondi les
rattrape toutes.

**La vraie protection est donc le filtre** `/^(\d+)(?:\.(\d{1,2}))?$/`, qui borne
l'entrée à deux décimales, et non la méthode de conversion. Le découpage reste
retenu pour une raison différente de celle que j'avais écrite : il ne **dépend
pas** de cette borne. Le jour où quelqu'un élargit le filtre à trois décimales
pour une remise au millième, la multiplication commencerait à perdre un centime
là où le découpage continue de rendre un entier exact.

Le cas de mutation a été remplacé en conséquence : il élargit désormais le
filtre, ce qui fait rougir le test du refus au-delà de deux décimales. C'est une
propriété réelle, là où l'ancien cas testait une différence qui n'existe pas.

**`padEnd` et non `padStart`**, et une seule lettre les sépare : « 5,5 » vaut 550
centimes, pas 55. Un test sur deux décimales seulement ne le verrait jamais.

### Le garde-fou du script a servi deux fois

D'abord en refusant de conclure : `mute` exige qu'une substitution modifie
réellement le fichier, et il a échoué franchement quand mon expression Perl ne
mordait pas. `\\d{1,2}` en Perl désigne un backslash littéral suivi d'un `d`,
forme absente du fichier. Sans ce garde-fou, le cas aurait annoncé « non
détecté, le test est aveugle » en accusant les tests.

Ensuite en révélant la justification fausse, ce qu'aucune relecture n'aurait
fait : le commentaire était plausible et les tests verts.

## Trois erreurs de ma part, le code avait raison à chaque fois

Toutes dans mes tests, et le motif se répète depuis LS-100.

**`1,005` que j'attendais converti en 101.** C'est le montant que toute
démonstration du flottant binaire cite, et je l'avais rangé parmi les cas à
convertir. Ma propre règle le refuse : trois décimales n'existent pas en euros, et
l'arrondir encaisserait un centime non saisi. Le cas est passé dans les refus,
avec son explication.

**`PAYEE` comme statut de commande.** L'enum n'en porte pas : c'est `CONFIRMEE`.
Le statut de la **commande** est un axe distinct de celui du **paiement**, règle
V5, et je l'avais confondu en écrivant la commande de test.

**Une clé `prixEuros` portant des centimes.** Le `transform` de Zod convertit la
valeur sans renommer la clé : le service aurait reçu un champ dont le nom ment sur
son unité, exactement la forme de défaut que l'invariant 1 cherche à empêcher. Un
second `transform` renomme la clé.

## Le test qui compte

Il écrit une **vraie commande** avec ses copies figées, relève l'état de sa ligne,
archive la variante ou change son prix, et relit.

Un service qui « mettrait à jour » les lignes pour rester cohérent avec le
catalogue passerait tous les autres tests du fichier. Seul celui-ci le voit, et
c'est l'invariant 3 : une commande ne dépend jamais du prix ou du nom actuel du
catalogue. C'est aussi ce qui rend une facture opposable.

## Le trou trouvé par la revue d'interface

`ls-frontend-revue` a signalé, hors de son périmètre déclaré, que
**`database.md` exige de refuser l'archivage tant qu'une réservation active
existe**, règle que mon service n'appliquait pas.

Le scénario ouvert : un client paie, sa réservation tient la pièce, et
l'exploitante archive la variante. La commande se confirme sur une pièce sortie
du catalogue, et la conversion de la réservation en vente porte sur une variante
que plus rien ne vend. **Aucune contrainte de base ne l'exprime**, `archivee_a`
et `reservation` vivant dans deux tables.

La garde compte les réservations dont `expire_a > now()`, avec l'horloge de
PostgreSQL. Deux tests, et le second compte autant que le premier : archiver
**malgré** une réservation expirée doit réussir, sans quoi une variante resterait
inarchivable pendant les cinq minutes qui séparent l'expiration du passage de la
tâche de libération. Deux cas de mutation couvrent les deux sens.

L'agent a trouvé ce défaut en relisant une interface, en partant d'une
observation d'écran : la carte affiche « Réservé : 1 » et, juste en dessous, un
bouton « Archiver » dont la confirmation affirme que rien ne change.

## Le travail perdu, et pourquoi

La première écriture de cette garde a été **effacée** : le script de mutation
tournait en arrière-plan, et sa restauration a réécrit `services/variante.ts` et
`repositories/variante.ts` par-dessus mes modifications.

Le risque était identifié depuis LS-100, où j'avais noté qu'il ne fallait pas
écrire dans un fichier mutable pendant l'exécution du script. Je l'ai fait quand
même. Le remède est le même que d'habitude : ne pas lancer la mutation en fond
pendant qu'on modifie encore le code qu'elle mute.

## Ce qui a été écarté

**Aucune fonction de suppression, nulle part.** Ni dans le dépôt, ni dans le
service, ni dans les Server Actions, ni comme bouton. Règle C13 : une variante
supprimée libérerait sa référence, et les avis comme les statistiques de
l'ancienne pièce remonteraient sur celle qui la reprendrait. L'absence est
commentée aux trois endroits, sans quoi une relecture l'ajouterait de bonne foi.

**Aucune transaction.** Chaque écriture porte sur une seule ligne, et rien ne doit
être cohérent avec elle au même instant : `quantiteReservee` part à zéro par
défaut, et aucun rang n'est à permuter comme pour les sections de LS-100.

**Archiver ne touche pas le stock physique**, arbitrage du 14 août. La pièce
existe toujours et reste vendable en main propre ; la remettre à zéro serait un
mouvement de stock déguisé, contre l'invariant 6.

## Les autres corrections issues de la revue

**Une phrase fausse à stock nul.** La confirmation d'archivage rendait « Ses 0
pièce en stock reste disponible pour la vente en main propre » sur une variante à
zéro, cas atteignable de plein droit puisque le formulaire l'accepte
explicitement. Le cas zéro n'est pas un accord, c'est une autre phrase : la
mention de la vente en main propre disparaît au lieu de s'accorder. C'est la
forme française du piège du ternaire non exhaustif, déjà rencontré deux fois ici.

**Deux arbitrages rendus par Christophe.**

L'ordre des blocs de l'écran : informations générales d'abord, puis déclinaisons,
puis sections. À 320 px tout est empilé, et corriger un nom ne doit demander aucun
défilement. C'est aussi l'ordre du parcours 3.

Le focus des panneaux de confirmation, corrigé **aux deux endroits** plutôt que
ticketé. Le défaut était hérité de LS-100 : le focus n'entrait jamais dans
l'`alertdialog`, donc la plupart des lecteurs d'écran ne l'annonçaient pas, et la
sortie par Échap ne servait à rien puisque son gestionnaire ne recevait jamais
l'événement. Le focus entre à l'ouverture et revient au bouton déclencheur à la
fermeture, avec `tabIndex={-1}` pour ne pas s'intercaler dans l'ordre de
tabulation.

Trois corrections mineures : l'aide de format de la référence manquait en
édition, la confirmation d'archivage se ferme désormais explicitement à
l'ouverture d'une édition plutôt que par la disposition du JSX, et le bouton
d'ajout affiche sa progression comme les autres.

## État des tickets

LS-101 en cours au moment d'écrire ces lignes. ADR-029 accepté.

## Prochaine étape

LS-102, téléversement et traitement des photographies. La plus lourde de la
phase, et la seule dont un critère est une exigence de sécurité : les
photographies prises au smartphone portent la position GPS du domicile de
l'exploitante. ADR-007 en fixe déjà le stockage.
