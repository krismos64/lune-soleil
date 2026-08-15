# 15 août 2026, LS-103, publication et archivage d'un produit

Seconde session du 15 août, après LS-102. Elle ferme la boucle de
l'administration : un produit passe de `BROUILLON` à `ACTIF`, et le catalogue
public de LS-104 aura enfin quelque chose à afficher.

## Les deux questions du ticket, tranchées par les sources

Le ticket laissait deux points explicitement ouverts, « à vérifier au moment
d'écrire plutôt qu'à supposer ici ». Les deux avaient déjà une réponse.

**La variante est exigée.** C'est **C1** du modèle conceptuel, « un produit
publié a au moins une variante non archivée », contrôle applicatif de niveau 3.
Le parcours 3 ne la mentionnait pas dans son étape 7, ce qui rendait la question
légitime, mais la règle existait depuis LS-39.

**La republication garde `publieA`.** Le schéma l'écrit noir sur blanc à côté du
champ : un produit dépublié puis republié doit garder sa date d'origine, comme
`Avis.publieA`, parce qu'elle porte l'antériorité affichée et le tri des
nouveautés. La réécrire ferait remonter en tête du catalogue un produit ancien
qu'on vient de réactiver, ce qu'aucun test de statut ne verrait.

## Le trou trouvé en lisant les règles

**C19 n'était implémentée nulle part.** « Archiver la dernière variante vivante
d'un produit archive le produit. »

Le modèle conceptuel est explicite sur le point qui compte : C1 et C19 « ferment
**ensemble** » le cas d'un produit `ACTIF` sans rien de vendable. C1 ne garde que
le chemin de la **publication**. Depuis LS-101, qui a livré l'archivage de
variante sans son pendant, archiver une à une les variantes d'un produit déjà
publié le laissait `ACTIF` : la fiche s'affiche dans le catalogue sans prix ni
stock, et le bouton d'achat porte sur une variante archivée.

Le ticket ne mentionnait pas C19. Christophe a arbitré de la traiter ici plutôt
que dans un ticket séparé, le trou restant ouvert entre-temps.

Les deux écritures vivent dans **une transaction** : elles décrivent un seul fait
métier, et sans elle une panne entre les deux laisse exactement l'état que la
règle interdit, sans que rien ne le rattrape ensuite.

**Seul un produit `ACTIF` est archivé.** Un brouillon dont on archive la dernière
variante reste un brouillon : il n'est pas dans le catalogue, donc il n'y a rien
à en retirer, et le passer en `ARCHIVE` forcerait à le désarchiver pour reprendre
un travail en cours.

## Les motifs de refus sont cumulés

Un service qui s'arrêterait au premier motif obligerait l'exploitante à publier,
corriger, republier, découvrir le suivant, et recommencer quatre fois. Le
parcours 3 vise **trois minutes au smartphone**.

L'ordre des motifs suit celui du parcours : variante, puis photos, puis
descriptions. C'est l'ordre dans lequel le travail se fait, donc celui dans
lequel il faut le reprendre.

## Cinq mutations avant d'écrire les cas du script

Le service est passé au vert du premier coup, ce qui est suspect pour du code
neuf. Vérifié plutôt que cru, chaque mutation étant détectée par le test attendu
et par lui seul :

| Mutation | Test qui rougit |
|---|---|
| C1 retirée | refuse un produit sans variante (+1) |
| C7 retirée | refuse un produit sans texte alternatif |
| C8 retirée | refuse un produit dont une photo est en échec |
| C11, l'archivage réécrit les lignes | archiver ne modifie aucune ligne de commande |
| C19 archive trop tôt | laisse le produit actif s'il reste une variante |
| C19 n'archive jamais | archive le produit quand sa dernière variante part |

**C19 demande deux cas et non un**, et c'est le point de méthode de la session.
Une règle d'archivage en cascade se trompe de deux façons opposées : trop tôt,
elle retire du catalogue une pièce encore vendable dans une autre déclinaison ;
jamais, elle laisse le trou entier. Un seul test ne distingue pas les deux, et
c'est le second défaut qui existait réellement.

La mutation de C11 est celle qu'une relecture écrirait **de bonne foi**, en
voulant garder catalogue et historique cohérents. C'est l'inverse qu'il faut :
une ligne de commande porte une copie figée, et c'est ce qui rend une facture
opposable.

## La revue d'interface, huit défauts

`ls-frontend-revue` a rendu la revue la plus étayée des trois, avec des calculs
de largeur et des contrastes mesurés.

**Le focus tombait sur `<body>` après un archivage réussi**, et c'est le cas
nominal. `revalidatePath` rafraîchit l'arbre serveur, `statut` passe à `ARCHIVE`,
et la condition qui rend le bouton « Archiver » le retire du DOM pendant que
l'effet tente d'y remettre le focus. Un `focus()` sur un nœud détaché ne fait
rien : le focus retombe au début du document. `isConnected` distingue désormais
le bouton qui survit à une annulation de celui qui a disparu.

**Le `<ul>` des manques mangeait 40 px à 320 px.** `.avertissement` avait été
écrite en LS-101 pour un paragraphe, et aucune réinitialisation globale ne touche
les listes : le `padding-inline-start` par défaut s'appliquait. Avec quatre
motifs, le bloc conçu pour « se lire sans défiler » demandait deux écrans.

**Le refus changeait la liste hors de toute région live**, et son message disait
« corrigez les points ci-dessous » alors que la liste est **au-dessus** dans
l'ordre du DOM. Un lecteur d'écran entendait la phrase, puis rien. Les motifs
sont repris dans le `role="alert"`.

Cinq autres, plus courts : aucune région d'attente alors que les quatre blocs
voisins en ont une, les motifs d'un refus antérieur qui survivaient à un refus
non métier, `.etat` devenue orpheline par ma migration, et deux niveaux de titre
incorrects.

## Le doute de la revue qui a rapporté plus que prévu

La revue signalait, sans pouvoir conclure, que la revalidation de
`/administration/categories` visait peut-être le mauvais chemin.

Vérifié : **aucune liste de produits n'existe dans l'administration.** Elle porte
la création, `produits/nouveau`, et l'édition, `produits/[id]`. L'écran des
catégories ne cite les produits que dans un texte d'aide.

Ma revalidation ne cassait donc rien, et c'est précisément ce qui la rendait
durable : elle affirmait au prochain lecteur qu'une liste existe quelque part.
Retirée, avec le commentaire qui dit pourquoi et renvoie à LS-110.

## État des tickets

LS-103 **En cours** au moment d'écrire, en attente de la fin du passage de
mutation et de la fusion. **LS-110 créée**, epic LS-3 : deux écarts antérieurs de
l'éditeur, le fil d'Ariane en balise native plutôt qu'un `Link`, et deux
ponctuations différentes pour le même état d'attente entre les quatre blocs. Son
troisième point a été traité ici et retiré du ticket.

## Prochaine étape

LS-104, catalogue public, grille, filtres par catégorie et tri. Elle consomme
directement ce que cette story livre : `statut = ACTIF` est son filtre d'entrée,
et `publieA` son tri par nouveautés.
