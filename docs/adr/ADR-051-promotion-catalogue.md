# ADR-051 : une promotion fermée, activée à la main, figée sur la ligne de commande

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 12 novembre 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | ADR-024 (commande et réservation atomiques), ADR-046 (thèmes saisonniers) |
| Ticket | LS-319 |

## Contexte

L'exploitante veut une réduction de 30 % sur tout le catalogue pendant la
Black Week, du lundi 23 au dimanche 29 novembre 2026. **Le site ne porte
aucune notion de promotion** : la promotion entre au périmètre par arbitrage
de Christophe du 12 novembre 2026, avec ces règles déjà tranchées (description
de LS-319) : taux fixe de 30 %, tout le catalogue, port non réduit, activation
et désactivation manuelles, chaque bascule historisée, arrondi au centime
inférieur, franchise calculée sur le montant réduit, prix figé à la création de
la commande.

**Ce que le droit impose, lu aux sources le 12 novembre 2026, sans le
trancher ici** :

- article L112-1-1 du Code de la consommation (Légifrance,
  `LEGIARTI000044549592`, en vigueur depuis le 28 mai 2022) : toute annonce de
  réduction indique le **prix antérieur**, le prix le plus bas pratiqué à
  l'égard de tous les consommateurs au cours des trente derniers jours
  précédant la réduction ; en cas de réductions successives pendant une période
  déterminée, celui d'avant la première réduction ;
- arrêt de la CJUE du 26 septembre 2024, affaire C-330/23, Aldi Süd
  (communiqué de presse n° 152/24 lu) : une réduction annoncée en pourcentage
  « doit être déterminée sur la base du prix le plus bas appliqué par le
  professionnel au cours d'une période qui n'est pas inférieure à 30 jours
  avant l'application de la réduction de prix » ;
- article L441-9 du Code de commerce (en vigueur depuis le 26 avril 2019) :
  la mention des réductions sur facture vise « tout achat de produits [...]
  pour une activité professionnelle ». Elle ne s'impose donc pas, par ce
  texte, à une vente à un consommateur.

**Ce que le code fait aujourd'hui, mesuré** : le prix catalogue
`variante.prix_centimes` n'est figé qu'en un point, `lireDonneesAFiger`
(`repositories/commande.ts`), sous `FOR UPDATE` dans la transaction de
`passerCommande`. Stripe (`unit_amount`), la facture (instantané légal),
l'avoir, le remboursement et les statistiques lisent tous
`ligne_commande.prix_fige_centimes`, jamais le catalogue. Le panier,
le catalogue, la fiche et le JSON-LD `Product` lisent le prix catalogue pour
l'affichage, et le sous-total affiché est confronté au sous-total figé
(`SousTotalChangeError`, LS-269). **Aucun changement de prix n'est tracé** :
ni table d'historique, ni écriture dans `journal_audit`.

## Décision

**Une promotion est un jeu fermé écrit dans le code, comme un thème : un code,
un taux, un libellé. L'exploitante l'active et la désactive, rien d'autre. Le
prix réduit se calcule côté serveur par une seule fonction, et se fige sur la
ligne de commande avec le prix de référence.**

1. **Promotions écrites dans le code** : `BLACK_WEEK`, taux 30, libellé
   « Black Week ». Aucun taux ni texte saisi par l'exploitante, même motif
   qu'ADR-046 : un champ libre laisserait passer une réduction inventée.
2. **Table `promotion`**, qui est aussi l'historique : une ligne par
   activation, avec le code, `active_depuis`, `desactivee_a`, et les
   identifiants de l'administratrice qui active et qui désactive. **Une seule
   promotion active à la fois**, garantie par un index unique partiel sur
   `desactivee_a IS NULL`. Désactiver renseigne `desactivee_a`, ne supprime
   rien (LS-246).
3. **Table `historique_prix_variante`** : toute modification de
   `variante.prix_centimes`, unitaire ou en masse, écrit l'ancien et le
   nouveau prix dans la même transaction. Elle sert à la garde du point 5, et
   à prouver le prix antérieur en cas de contrôle. Aucune donnée personnelle.
4. **Une seule fonction** `prixDeVente(prixCatalogueCentimes, promotion)`,
   dans `services/promotion.ts` : `floor(prix * (100 - taux) / 100)` en
   entiers, invariant 1. Le catalogue, la fiche, le panier, le JSON-LD et
   `passerCommande` l'appellent tous ; aucun composant ne calcule un prix.
5. **Éligibilité par variante, en échec fermé** : une variante n'entre dans la
   promotion que si elle existe depuis au moins trente jours à l'activation
   et que son prix n'a pas changé pendant ces trente jours (lu dans
   `historique_prix_variante`). Une variante inéligible se vend au prix
   catalogue, sans badge. **L'activation entière est refusée** dans un seul
   cas, la réactivation tardive de l'arbitrage 2 ci-dessous ; le refus nomme
   sa cause.
6. **Prix gelés pendant la promotion** : modifier un prix, unitaire ou en
   masse, est refusé tant qu'une promotion est active. Le prix barré reste
   ainsi le prix catalogue, exactement le prix antérieur constaté à
   l'activation.
7. **Figé à la commande** : dans la transaction de `passerCommande`, la
   promotion active est lue **une fois**, et chaque ligne fige
   `prix_fige_centimes` (le prix réduit, payé), `prix_reference_fige_centimes`
   (le prix catalogue, barré) et `promotion_id`. Contrainte : sans promotion,
   les deux colonnes sont nulles ; avec, `prix_fige < prix_reference`. Stripe,
   facture, avoir, remboursement et statistiques suivent sans changement, car
   ils lisent déjà le prix figé. **La collecte du montant de réduction est
   ainsi acquise dès la première commande**, une donnée non capturée étant
   perdue.
8. **Bascule pendant un achat** : le sous-total affiché au récapitulatif est
   déjà confronté au sous-total figé (`SousTotalChangeError`). Une activation
   ou une désactivation entre l'affichage et le clic fait donc relire le
   récapitulatif au client, jamais payer un montant qu'il n'a pas lu.
9. **Affichage** : l'annonce dit « sur toute la boutique » seulement si
   chaque variante en vente est éligible, « sur les pièces signalées » sinon,
   calculé côté serveur. Prix barré, prix réduit et « -30 % » sur le catalogue, la
   fiche, le panier, le tunnel et la confirmation ; mention « Prix barré :
   prix le plus bas pratiqué au cours des 30 jours précédant la réduction. »
   sur la fiche ; `price` du JSON-LD égal au prix réduit. Rien de tout cela
   sans promotion active.
10. **Facture** : instantané légal en version 3, chaque ligne portant en plus
    son prix de référence et le libellé de la promotion. Les factures déjà
    émises restent en version 2, invariant 4.

## Arbitrages de Christophe, 12 novembre 2026

Les trois propositions ont été validées. Les deux premières tranchent une
question juridique : c'est la décision de Christophe, que l'ADR enregistre
sans la qualifier.

1. **Une pièce créée moins de trente jours avant l'activation n'entre pas**
   dans la promotion : vendue au prix catalogue, sans badge. Même règle pour
   une pièce dont le prix a changé pendant ces trente jours.
2. **Réactivation** : une promotion désactivée peut être réactivée dans les
   **24 heures** (désactivation par erreur, même opération) ; au-delà, toute
   activation est refusée pendant **trente jours** après la dernière
   désactivation, le prix réduit étant devenu le prix le plus bas pratiqué.
3. **Facture** : chaque ligne réduite porte « dont réduction Black Week
   -30 % » sous son prix, avec le prix de référence.

## Alternatives écartées

- **Un booléen sur `ParametreBoutique`, comme le thème.** Il ne garde aucune
  trace des périodes, que le prix antérieur exige de connaître, et l'arbitrage
  impose l'historisation de chaque bascule.
- **Un taux saisi par l'exploitante.** Ouvrirait des réductions que rien ne
  vérifie, et le calcul du prix antérieur se compliquerait à chaque taux.
  Arbitrage de Christophe : 30 % fixe.
- **Réduire au moment du paiement, dans la session Stripe**, par un coupon
  Stripe. Le prix figé sur la ligne de commande ne serait plus le prix payé :
  facture, avoir et remboursement divergeraient de Stripe, invariant 3.
- **Calculer le prix réduit dans les composants.** Interdit par
  `frontend-design.md` : un prix affiché vient du serveur. Et l'affichage
  divergerait du montant figé au premier arrondi différent.
- **Ne pas figer le prix de référence sur la ligne.** La réduction accordée
  ne se reconstruirait que depuis le prix catalogue actuel, qui aura changé,
  invariant 3 et règle S13.
- **Programmer par dates.** Écarté par Christophe : activation manuelle,
  l'exploitante s'engageant à respecter les dates annoncées.

## Conséquences

- **Migration additive** : tables `promotion` et `historique_prix_variante`,
  deux colonnes nullables et un `CHECK` sur `ligne_commande`, l'index unique
  partiel. Aucune donnée existante touchée.
- `services/variante.ts` écrit l'historique et refuse un changement de prix
  sous promotion active ; `passerCommande` lit la promotion dans sa
  transaction ; un écran d'administration active et désactive, aux côtés du
  thème.
- `verifier-registre-traitements.sh` exigera de ranger les deux tables : la
  première porte l'identifiant de l'administratrice.
- Les tests de bout en bout du catalogue refusent aujourd'hui tout « -NN % »
  (LS-318) : ils l'admettront sous promotion active seulement.
- Tests écrits **avant** le code : arrondi au centime inférieur, prix réduit
  encaissé et figé, prix de référence figé, port non réduit, franchise sur le
  montant réduit, refus d'un changement de prix sous promotion, refus
  d'activation par la garde, bascule concurrente d'une commande (une seule
  vérité de prix par commande), activation réservée au rôle administratrice.

## Risques

- **Une promotion oubliée active après le 29** rendrait fausse l'annonce
  datée. Atténuation : l'écran d'administration affiche depuis quand elle est
  active ; l'exploitante s'y est engagée, arbitrage du 12 novembre 2026.
- **Une désactivation entre récapitulatif et paiement** : couverte par
  `SousTotalChangeError`, prouvée par un test de concurrence.
- **Une réduction sur un prix gonflé avant la promotion**, le défaut que
  l'arrêt Aldi Süd sanctionne : couverte par la garde des trente jours et le
  gel des prix, à partir du jour où l'historique existe. Pour cette première
  Black Week, aucun historique ne précède le déploiement : la conformité
  repose sur la confirmation de Christophe qu'aucun prix n'a changé depuis
  fin octobre 2026.
