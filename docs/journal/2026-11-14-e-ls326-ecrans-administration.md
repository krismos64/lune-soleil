# 14 novembre 2026 : LS-326, tous les écrans de l'administration

## Demande

Christophe, à la suite de LS-325 : « attaque le lot suivant, tu dois repenser
toutes les pages de son espace admin, simplifier, animer, colorer, motion
design, UI UX intuitives, attractives, la page Paramètres également, tout
repenser ».

## Décision prise en autonomie : une couche commune d'abord

L'administration compte dix-sept écrans, environ 7 200 lignes de style et
16 500 lignes de composants, sous plus de 3 000 tests de bout en bout.
Réécrire dix-sept écrans un par un dans un seul lot aurait été long et
risqué. Le lot livre donc **ce qui change tous les écrans d'un coup**, posé
par le layout, puis repense Paramètres et les listes où l'on travaille le
plus. Ce qui reste est écrit plus bas, écran par écran.

ADR-045 amendé avant le code : deux signes d'orientation courts par écran,
le contenu ne part jamais d'une opacité nulle.

## Fait

**Sur les dix-sept écrans, par le layout, sans retoucher leur titre :**

- **Une couleur par famille de rubriques**, cinq couleurs prises dans les
  jetons d'ADR-022 (vue d'ensemble, ventes, relation client, catalogue,
  réglages) : icônes de la barre latérale, médaillon du repère, trait sous le
  titre.
- **Le repère d'écran** (`repere-ecran.tsx`) remplace le mot
  « Administration » du bandeau : famille, rubrique, icône qui se trace à
  chaque changement d'écran. Il pose `data-famille`, que le layout remonte à
  tout l'écran par `:has()`.
- **Rayons adoucis** dans l'administration seulement, cartes, champs et
  boutons, par deux jetons redéfinis sur le gabarit.
- **Repère d'état des lignes de travail** : `data-etat`, quatre tons
  (`src/lib/ton-etat.ts`), un bord de couleur défini une fois dans le layout.
  La couleur double le badge écrit.
- Quatre surtitres retirés (« Catalogue », « Relation client », « Mondial
  Relay », « Comptabilité »), redondants avec le repère.

**Écrans repensés :**

- **Paramètres** : sommaire d'état en tête (tarifs, thème actif, promotion,
  période) qui mène à chaque réglage, sections en cartes, groupes de champs
  sans cadre dans le cadre, page élargie.
- **Commandes** : une commande tient en une ligne à partir de 1100 px (numéro
  et client à gauche, total, date et paiement à droite), repère d'état.
- **Produits, Messages, Rétractations, Alertes** : repère d'état sur chaque
  ligne.

## Ce qui n'est pas refait, écran par écran

Ces écrans ont reçu la couche commune (couleur, repère, trait de titre,
rayons) et **gardent leur disposition** : Expéditions, Factures et avoirs,
Avis, Clients, Catégories, Stocks et marchés, Statistiques, Passkeys, Journal
des connexions, fiche d'un produit et son éditeur, détail d'une commande.

## Preuves

- `administration-ecrans-ls326.spec.ts` : repère et couleur de famille sur
  seize écrans, cinq couleurs distinctes, écran de détail, sommaire de
  Paramètres et ancre sous le bandeau, repère d'état contre le badge, aucune
  boucle, mouvement réduit.
- Suite de bout en bout complète, premier passage : 3 070 tests, 2 974
  passés, 92 ignorés par largeur, **4 échecs, dont un défaut réel** ; second
  passage après correction : 3 094 tests, 3 002 passés, 92 ignorés, aucun
  échec.
- `npm run test` : 2 104 passés.
- Types, lint et contrôles du dépôt au vert.

## Revue `ls-frontend-revue`

Aucun défaut bloquant. Dix-huit écrans mesurés à 320, 768 et 1280 px sous
Verdana, 54 mesures de débordement à zéro ; aucun état dit par la couleur
seule ; contrastes des cinq couleurs de famille recalculés, tous au-dessus de
4,5:1 avec le blanc. Six points corrigés :

- **bandeau à 320 px** : le nom de rubrique était tronqué et « Aller à… » se
  coupait sur deux lignes. C'est désormais le repère qui se replie, sur deux
  lignes au besoin ; sous 480 px le bouton garde sa loupe seule, 44 par
  44 px, son nom restant « Aller à… » ; « Voir la boutique » fait 46 par
  44 px. Mesuré sous Verdana aux quatre largeurs, aucun débordement ;
- **le survol soulevait la ligne d'un pixel et déplaçait un champ en cours de
  saisie** dans une carte de rétractation : la ligne prend une ombre sans
  bouger ;
- les trois déplacements d'icône au survol sont placés sous
  `prefers-reduced-motion: no-preference`, celui de la barre de LS-325
  compris ;
- **le sommaire de Paramètres disait « Aucune date annoncée » quand la
  lecture de la période échouait** : il dit désormais que l'état est
  illisible ;
- accords faux, « Soldes d'hiver est actif », « Noël est active » :
  tournures sans accord, « Actif : … », sur le sommaire, le tableau de bord
  et les messages de confirmation ;
- ton d'une alerte calculé par une table exhaustive et non par un ternaire.

Corrigé aussi : chiffres de contraste du commentaire, longueur de tiret de
l'icône tracée, légende des groupes de Paramètres, focus rendu aux quatre
ancres. **Une correction de la revue a été défaite** : retirer la marge
d'ancre de Paramètres, jugée trop large sur grand écran, faisait passer la
carte sous le bandeau sur téléphone ; mon test l'a signalé, la marge est
revenue.

Laissé, signalé : le trait sous un titre placé dans une ligne décale de 6 à
10 px le badge ou le bouton voisin ; l'icône seule de « Voir la boutique »
peut suggérer un nouvel onglet ; à l'ouverture d'une fiche produit à 320 px,
le titre passe sous le bandeau, défaut antérieur. Non vérifié : Safari et
Firefox.

## Ce qui a dérapé

- **La ligne de commande débordait de 89 px à 768 px** : j'avais posé la
  disposition en ligne dès 768 px, où la barre latérale ne laisse que 518 px.
  Trouvé par `gabarit-titre-ls228` dans la suite complète, pas par mes
  captures à 1280 et 390 px. Seuil porté à 1100 px.
- **La palette de LS-325 ne se rouvrait pas toujours au clavier** : son
  ouverture passait par un effet qui suivait l'état, et ne rejouait rien si
  l'état n'avait pas changé. Ouverture rendue synchrone (`flushSync`),
  fermeture écoutée sur l'événement natif. Mesuré ensuite sur trente
  répétitions à 320 et 1280 px : 30 frappes reçues, 30 ouvertures, 30 retours
  de focus.
- Mon test du repère visait `[data-famille]`, que les liens de la barre
  portent aussi : il lisait « Tableau de bord » sur tous les écrans.

## État des tickets

- LS-326 : En cours.
