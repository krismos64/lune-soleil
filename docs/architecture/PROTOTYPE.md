# Prototype visuel de référence

Ce document capture l'intention visuelle et les parcours du prototype externe,
pour que le développement de l'interface puisse s'y référer **sans dépendre de sa
disponibilité en ligne**.

| Champ | Valeur |
|---|---|
| Adresse | `https://lune-soleil-prototype.krismos.chatgpt.site/` |
| Hors dépôt | oui, application React servie séparément, aucun code repris |
| Version décrite | passe de finition du **5 août 2026**, explorée le même jour |
| Rattachement | LS-15, livrable de conception, et LS-16 pour les jetons |
| État | **gelé**. Il ne se maintient plus en parallèle du code |

## Sa place dans la hiérarchie des sources

Le prototype porte l'**intention visuelle**, la composition, la hiérarchie de
l'information et l'enchaînement des écrans. Il ne porte ni exigence
fonctionnelle, ni règle métier, ni texte juridique.

En cas de divergence il **perd**, y compris face à un écran qui paraît plus abouti
que la documentation. L'ordre des sources reste celui de `CLAUDE.md` : loi, ADR
accepté, cahier des charges, documentation du dépôt, Confluence, Jira. Le
prototype vient après tout cela.

La séparation à garder pendant le développement tient en une phrase : Jira, les
ADR et la documentation du dépôt disent **ce que le logiciel doit faire**, le
prototype dit **à quoi cela ressemble**.

Il est **gelé** après cette passe. Un prototype maintenu en parallèle du code
revient à développer deux applications, et la seconde n'a pas de tests.

## Ce que le prototype respecte déjà, vérifié

Vérifications faites sur les deux bundles JavaScript et la feuille de style, pas
seulement à l'œil.

**Palette conforme à ADR-022.** Les jetons du `:root` reprennent exactement les
sept valeurs de l'ADR. Aucun bleu nuit, aucun dégradé, aucun glassmorphisme,
aucun dégradé métallique sur un bouton ou un bandeau.

**Rédaction française.** Zéro tiret cadratin ou demi-cadratin sur l'ensemble des
textes des deux bundles, tous les accents présents, aucun accord au féminin par
défaut. « Administratrice » est employé, ce qui est l'exception légitime.

**Aucun débordement horizontal à 320 px**, mesuré sur les dix-sept écrans,
administration comprise.

**Trois formulations rejoignent des invariants délicats**, et méritent d'être
reprises telles quelles :

- « Le navigateur ne constitue jamais une preuve de paiement », invariant 5
- « Vente refusée : cette variante possède une réservation active », avec les
  colonnes Physique, Réservé et Disponible séparées, invariant 6
- « Disponible au Point Relais » distingué de « Remise au destinataire », et le
  dépôt d'un avis conditionné à la remise effective

**Les trois modes de livraison d'ADR-025** avec leurs tarifs, 4,10 € en Point
Relais et Locker, 4,99 € à domicile, et le seuil de gratuité à 39 € cohérent de
la fiche produit au tunnel.

## Table de correspondance, parcours vers écran

Les huit parcours de `PARCOURS.md` et l'écran qui les porte. Un parcours sans
écran n'est pas un manque du prototype : certains sont entièrement serveur.

| Parcours | Écran du prototype |
|---|---|
| 1, achat de référence | `/catalogue`, `/produit/eclipse`, `/panier`, `/commande` en quatre étapes |
| 2, stock en situation de marché | administration, rubrique Stocks et marchés |
| 3, création de produit | administration, rubrique Catalogue, éditeur à sections |
| 4, facture et remboursement | administration, rubrique Factures et avoirs |
| 5, rétractation | `/espace-client/commande?vue=retractation`, quatre étapes |
| 6, rattachement d'une commande | `/espace-client`, bloc « Une ancienne commande sans compte ? » |
| 7, dépôt d'un avis | `/espace-client`, section Achats vérifiés |
| 8, carnet d'adresses | `/espace-client`, rubrique Mes adresses |

## Les six états non nominaux, et leur intention

C'est le seul contenu que la documentation du dépôt ne portait pas encore. Chaque
intention est résumée en une phrase pour survivre à la disparition de l'URL.

| État | Adresse | Intention |
|---|---|---|
| Réservation expirée | `/panier?etat=expiration` | la sélection est conservée, la disponibilité doit être revérifiée avant de poursuivre, aucune erreur technique |
| Dernière pièce partie | `/panier?etat=indisponible` | l'article concerné est désigné nommément, les autres restent commandables, ton non accusateur |
| Paiement refusé | `/commande?etat=refuse` | la commande n'est pas confirmée, le panier et la saisie sont conservés, aucun détail du prestataire n'est montré |
| Paiement en vérification | `/commande?etat=verification` | attente explicite, demande de ne pas fermer ni relancer, et la mention que le navigateur ne prouve rien |
| Fiche épuisée | `/produit/alba?etat=epuise` | la fiche reste consultable avec ses photos, le bouton devient « Épuisé » et porte `disabled`, aucune quantité affichée |
| Catalogue vide | `/catalogue?etat=vide` | jamais une grille vide, un texte court et une action pour effacer les filtres |

Les trois seuls états publics de disponibilité restent **En stock**, **Dernière
pièce** et **Épuisé**, conformes à `frontend-design.md`. Le prototype n'affiche
aucune quantité exacte côté public.

## Ce que le prototype fait et qu'il ne faut pas recopier

**Le code.** C'est du React avec les prix en euros flottants (`price: 32`), quand
l'invariant 1 impose des centimes entiers. Rien n'en est repris.

**La confirmation de paiement simulée.** L'état de vérification bascule en
« confirmé » après 2200 ms par un `setTimeout` **dans le navigateur**. C'est
acceptable pour une démonstration, et c'est exactement ce que l'invariant 5
interdit dans le produit. Le texte de l'écran le dit correctement, la mécanique
le contredit : ne pas s'inspirer de la mécanique.

**Les données de démonstration.** Noms, prix et stocks du prototype n'entrent
jamais comme données réelles, c'est un interdit du projet. Le « Collier Alba » y
est d'ailleurs illustré par une photographie de boucles d'oreilles, et une
allégation d'origine géographique apparaît dans les données d'administration
alors que la fiche publique reste prudente. `frontend-design.md` exige la
confirmation de l'exploitante avant toute publication d'origine.

**Les identifiants de démonstration affichés en clair**, et la mention d'un
prénom réel sur l'écran de connexion de l'administration. Sans objet dans le
produit, qui utilisera Better Auth et une passkey, ADR-021.

## Cinq écarts relevés, et ce qu'ils deviennent

Aucun ne remet en cause la direction visuelle. Ils sont tracés pour ne pas être
recopiés tels quels au moment d'écrire l'interface.

| Écart | Ce qui prime | Suite |
|---|---|---|
| La classe d'accroche emploie le terracotta `#B4643E` en petit texte gras, 4,07:1 sur crème et 4,35:1 sur blanc, sous le seuil AA de 4,5:1 | ADR-022 et `frontend-design.md`, qui l'autorisent en texte large ou gras seulement | LS-84 |
| Aucune région live : ajout au panier, changement d'étape et refus de vente ne sont annoncés à aucun lecteur d'écran | WCAG 2.2 AA sur les parcours critiques | LS-85 |
| Trois boutons de vignettes de la fiche produit sans nom accessible | `frontend-design.md`, nom accessible sur tout bouton icône | LS-85 |
| Le récapitulatif du tunnel n'affiche pas l'adresse de livraison saisie | information précontractuelle, article L221-5 | LS-86 |
| L'éditeur propose cinq sections dont « Dimensions » | ADR-026 en prévoit quatre, la dimension appartient à `Variante.dimensions` | LS-87 |

Le dernier point était **déjà connu** : la description de LS-76 le signalait comme
« tâche et non décision, hors de cette story ». Il n'appelle aucun arbitrage, la
décision est prise depuis le 30 juillet 2026.

## Deux jetons d'ADR-022 que le prototype n'emploie pas

`--ls-accent-gold` `#C4A052` et `--ls-accent-gold-deep` `#8A6A22` sont absents de
la feuille de style du prototype. L'ADR les prévoit, le prototype s'en passe et
reste cohérent visuellement.

Ce n'est **pas** un écart à corriger dans un sens ou dans l'autre avant que
l'interface réelle existe : le doré décoratif est un choix ouvert, à trancher au
moment d'écrire les composants. Noté ici pour que personne ne « corrige » le
prototype vers l'ADR ni l'inverse sans arbitrage.

## Ce que le prototype ne prouve pas

**Un prototype riche n'égale pas le périmètre du Go-Live.** L'écran de
statistiques de l'administration est complet et porte lui-même la mention
« Vision V1 cible ». `STATISTIQUES.md` reste la référence : la **collecte** des
montants est Must au Go-Live, l'**interface** relève de LS-8.

Le prototype ne dit rien non plus des états de chargement, des erreurs serveur ni
du comportement hors ligne. Ils restent exigés par `frontend-design.md`, section
« États obligatoires ».
