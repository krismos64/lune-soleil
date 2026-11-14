# ADR-046 : thèmes saisonniers activables par l'exploitante

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 4 octobre 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | ADR-022 (palette publique), ADR-045 (politique d'animation) |
| Ticket | LS-267, LS-277, LS-318, LS-322, LS-323 |

## Amendement du 14 novembre 2026, douze thèmes d'ambiance, LS-323

**Demande de l'exploitante, transmise par Christophe** sur une liste
manuscrite : douze thèmes de plus, à activer depuis Paramètres, « avec un beau
visuel, du motion design et des animations ». **Codé sans maquette** sur la
demande de Christophe, captures relues avant fusion, comme LS-322. Le reste de
l'ADR tient.

| Famille | Thèmes | Valeurs |
|---|---|---|
| Saisons | printemps, été, automne, hiver | `PRINTEMPS`, `ETE`, `AUTOMNE`, `HIVER` |
| Fêtes | Nouvel An, Saint-Valentin, Pâques | `NOUVEL_AN`, `SAINT_VALENTIN`, `PAQUES` |
| Journées | Journée internationale des droits des femmes, Octobre rose, Novembre bleu | `JOURNEE_FEMMES`, `OCTOBRE_ROSE`, `NOVEMBRE_BLEU` |
| Opérations | soldes d'hiver, soldes d'été | `SOLDES_HIVER`, `SOLDES_ETE` |

**Section 1, mécanisme.** La contrainte passe à seize valeurs, migration
`20261114180000_themes_ambiance` : retrait puis pose, donc classée destructive
par `migrate-production.sh`, sans donnée convertie ni thème activé.
**Un seul socle porte les douze** : deux jetons par thème sous les mêmes
noms, `--ls-saison-un` et `--ls-saison-deux`, une ligne dans la table
`AMBIANCES` de `src/lib/theme-saisonnier.ts` (nom de l'événement, deux
accroches, motifs, mouvement), et les composants de `decor-saison.tsx`.
Ajouter un treizième thème d'ambiance ne touche aucune page.

**Section 2, périmètre visuel : le régime ordinaire, sans exception.** Comme
`NOEL_1` : accents, décors et phrases. Le texte courant, les boutons, les
filtres, le focus, les prix, le `h1` et les photographies ne changent pas ;
aucun fond sombre, aucun texte clair. Ce qui s'ajoute : un ruban qui nomme
l'événement, l'accroche du thème, une couronne et une nuée de motifs dans le
cadre de l'emblème de l'accueil, un médaillon de saison dans le bandeau du
catalogue, une frise au pied des deux bandeaux, le motif du thème devant les
filtres, un liseré de couleur tracé au survol hors des cartes. Aucune image
générée, tout est dessiné en SVG.

**Le bleu, le violet et le rose entrent par les thèmes seulement.** ADR-022
écarte le bleu et `frontend-design.md` le rose dominant : ces teintes restent
absentes de l'habillage ordinaire, et ne paraissent que sous un thème que
l'exploitante active, en accent et en décor. Octobre rose et Novembre bleu
portent leur couleur par définition.

**Section 3, contrastes, calculés le 14 novembre 2026.** Chaque jeton d'un
thème d'ambiance peut porter du texte : les deux accents tiennent 4,5:1 sur
crème, sable et blanc, mesurés par `verifier-contraste.sh` dans chaque bloc.
Les teintes claires des décors se font par `color-mix`, jamais par un jeton.

| Thème | `--ls-saison-un` | Pire, sur sable | `--ls-saison-deux` | Pire, sur sable |
|---|---|---|---|---|
| `NOUVEL_AN` | `#2B2F6B` | 10,23:1 | `#8A5A12` | 4,96:1 |
| `SOLDES_HIVER` | `#1F3A63` | 9,55:1 | `#A8241F` | 6,00:1 |
| `SAINT_VALENTIN` | `#A8174B` | 6,10:1 | `#7A1F3D` | 8,42:1 |
| `JOURNEE_FEMMES` | `#6B2D8C` | 7,40:1 | `#8A5A12` | 4,96:1 |
| `PRINTEMPS` | `#3C6B34` | 5,26:1 | `#A63D6E` | 5,01:1 |
| `PAQUES` | `#5E4196` | 6,59:1 | `#2E6B4F` | 5,28:1 |
| `ETE` | `#B03F24` | 4,92:1 | `#0F6470` | 5,72:1 |
| `SOLDES_ETE` | `#B5301C` | 5,17:1 | `#0F6470` | 5,72:1 |
| `AUTOMNE` | `#9C4A14` | 5,17:1 | `#6E2B2B` | 8,62:1 |
| `OCTOBRE_ROSE` | `#B31E68` | 5,33:1 | `#8A1650` | 7,62:1 |
| `NOVEMBRE_BLEU` | `#1F5296` | 6,51:1 | `#173A6B` | 9,50:1 |
| `HIVER` | `#2A5B7A` | 6,12:1 | `#4A5870` | 6,03:1 |

**Section 4, animations.** ADR-045, **amendé le même jour** par LS-323 : la
nuée, le halo, l'anneau pointillé, le grand motif du médaillon, la couronne
et le trait du bandeau d'opération bougent en continu, sous le bouton de
pause ; les entrées restent bornées à cinq secondes.

**La mention « (%) » de la liste : un bandeau d'opération, aucun taux écrit.**
Six lignes de la liste la portent : Saint-Valentin, Journée de la femme,
Octobre rose, Novembre bleu, soldes d'été et d'hiver. Elle est lue comme
« thème que l'exploitante compte associer à une réduction ». Ces six thèmes
portent en tête de l'accueil un bandeau, `BandeauOperation`, au contrat de
celui de LS-322 : **il nomme l'événement seul sans promotion, et reprend le
taux, la portée et la période de la promotion active**, ADR-051. Le thème
n'écrit toujours aucun taux, aucun prix, aucune date.

**Ouvert, à arbitrer par Christophe, hors de ce ticket.** La seule promotion
écrite dans le code est `BLACK_WEEK`, à 30 %, ADR-051. Associer une réduction
à l'une de ces six opérations demande un code de promotion et un taux par
opération, décision commerciale que la liste ne donne pas. D'ici là, une
promotion activée sous l'un de ces thèmes resterait la promotion Black Week :
le bandeau du thème afficherait son taux, l'annonce du catalogue et la
facture diraient « Black Week ».

**Trois points que l'ADR nomme sans les qualifier.**

- **« Soldes » est un mot réglementé.** Il désigne des ventes à des périodes
  fixées par les textes (Code de commerce, article L310-3). L'activation
  étant manuelle, section 6, l'exploitante s'engage à n'activer ces deux
  thèmes que pendant les périodes légales ; les dates se vérifient aux sources
  avant chaque usage. **Le mot s'affiche même sans promotion active**, relevé
  par `ls-frontend-revue` : comme « Black Week » en LS-318, le nom reste
  affiché parce que l'exploitante active la promotion avec le thème, et
  l'écran Paramètres le lui dit. Un « Soldes » affiché sans aucune réduction
  serait une annonce sans objet : c'est à Christophe de confirmer cet usage.
- **Octobre rose et Novembre bleu n'annoncent aucun don.** Les deux phrases
  disent le soutien à la sensibilisation, rien de plus : une promesse de
  reversement qui ne serait pas tenue serait une allégation trompeuse.
- **Le nom de la journée du 8 mars** est écrit en entier, « Journée
  internationale des droits des femmes », son intitulé officiel ; la liste
  disait « journée de la femme ».

**Écarté : douze maquettes et douze jeux de composants.** Le modèle de
`NOEL_2` et de `BLACK_WEEK`, une maquette, une exception au périmètre et des
décors propres par thème, aurait fait douze amendements et douze suites de
tests pour des thèmes actifs quelques semaines chacun. Un socle commun en
régime ordinaire les rend tous cohérents, mesurés par le même contrôle, et
laisse la porte ouverte à un habillage plus poussé d'un thème précis.

**Écarté : écrire un taux par thème.** Ce serait une promotion inventée, que
la section 2 et ADR-051 interdisent.

## Amendement du 13 novembre 2026, bandeau Black Week de l'accueil, LS-322

**Demande de Christophe** après un essai : un bandeau Black Week mis en
évidence et animé en tête de l'accueil. Codé sans maquette sur son arbitrage.

1. **Un bandeau de nuit en tête du héros**, sur l'accueil seulement, sous le
   thème `BLACK_WEEK` ; il remplace le ruban de LS-318. Le `h1` ne change pas
   et le suit.
2. **Texte immobile, ADR-045** : une comète d'or fait le tour du cadre
   (`stroke-dashoffset`) et des étincelles scintillent dans les deux colonnes
   latérales, jamais sur une lettre. Mouvement continu sous `data-continu`,
   figé par le bouton de pause, absent sans script et en mouvement réduit.
3. **Le thème n'écrit toujours aucun taux** : sans promotion, le bandeau dit
   « Black Week » seul. Sous promotion active, il porte le taux, la portée
   calculée par le serveur et la période réglée, ADR-051, et reprend la
   région « Promotion en cours » de `AnnoncePromotion`, masquée sur l'accueil
   sous ce thème.

## Amendement du 12 novembre 2026, thème Black Week, LS-318

**Arbitrage de Christophe sur maquette**, `docs/prototypes/theme-black-week/`,
validée le 12 novembre 2026 pour la semaine du 23 au 29 novembre 2026. Un
troisième thème s'ajoute, sur le modèle de `NOEL_2`. Le reste de l'ADR tient.

**Section 1, mécanisme.** La contrainte passe à **`AUCUN`, `NOEL_1`, `NOEL_2`,
`BLACK_WEEK`**, migration `20261112180000_theme_black_week` : retrait puis
pose de la contrainte, donc classée destructive par `migrate-production.sh`,
sans aucune donnée convertie ni thème activé. Attribut posé sur le `<main>` :
`data-theme="black_week"`. **Activation manuelle**, section 6 inchangée :
l'exploitante l'active et le retire elle-même.

**Section 2, périmètre visuel.** Exception bornée, la même que `NOEL_2` :

- le **bandeau de tête** de l'accueil et du catalogue passe à la nuit, dégradé
  de `#121015` à `#1D1A22` avec une braise `#3A2A0C` en coin ; son titre, son
  texte et ses boutons y passent en blanc ou en or, le bouton plein en or à
  texte de nuit. **Le texte du `h1` ne change pas** : sur le catalogue,
  « Black Week » est un paragraphe d'affichage posé au-dessus du `h1`
  « Le catalogue », et non le titre, section 5 ;
- le **filtre actif** du catalogue passe en aplat de nuit à texte or ;
- les **cartes produit** reçoivent un liseré doré tracé dans leur bord au
  survol, et le bouton « Ajouter au panier » passe à la nuit, texte blanc,
  précédé d'un sac doré. **Le contenu des cartes et la couleur des prix ne
  changent pas** ;
- la bande défilante, le sceau et le pied de page de ces deux pages passent à
  la nuit.

**Le thème n'annonce aucune réduction.** Ni taux, ni prix barré, ni date, ni
urgence : la réduction de 30 %, ses prix barrés et ses dates relèvent de la
promotion de LS-319, qui fera l'objet de son propre ADR. L'exploitante active
les deux ensemble, arbitrage du 12 novembre 2026, et c'est ce qui permet au
nom « Black Week » de rester affiché.

**Section 2, décors.** Soleil levant aux rayons qui se tracent puis tournent,
halo qui respire, poussière d'or dans la zone du soleil et dans les marges de
la grille au-delà de 1240 px, liseré d'or sous le bandeau, liseré doré des
cartes, sac doré du bouton d'achat. Aucune image générée.

**Section 3, contrastes, calculés le 12 novembre 2026** et mesurés par
`verifier-contraste.sh`, qui reconnaît désormais le suffixe `-sur-nuit` comme
`-sur-rouge`.

| Paire | Ratio au pire |
|---|---|
| blanc sur la braise `#3A2A0C`, point le plus clair des bandeaux | 13,85:1 |
| or `#F2C230` sur la braise | 8,27:1 |
| reflet `#FFF4C2` sur la braise, mots dorés du titre | 12,51:1 |
| nuit `#121015` sur bouton or | 11,29:1 |
| encre `#121015` sur crème, sable, blanc | 15,86:1 (sable) |
| texte du pied `--ls-texte-nuit` sur `#121015` | 16,43:1 |

**L'or vif ne s'écrit jamais sur un fond clair** : 1,65:1 sur crème. Il est
texte sur la nuit, décor partout ailleurs.

**Section 4, animations.** ADR-045, **amendé le même jour** par LS-318 :
rotation des rayons, halo et poussière d'or bougent en continu, avec le bouton
de pause ; tout le reste est borné à cinq secondes.

**Écarts à la maquette, non portés** : le reflet qui balaie « Week » (mouvement
sur un texte, animation de `background-position`), la gerbe d'étincelles au
clic (jaillissait sur le libellé du bouton, même motif que les flocons de
Noël), et l'entrée des cartes en fondu (point 5 d'ADR-045).

**Écarté : programmer le thème par dates.** Christophe retient l'activation
manuelle, l'exploitante s'engageant à l'activer et à le retirer aux bonnes
dates. La programmation reste un ticket possible, section 6.

## Amendement du 6 octobre 2026, deux thèmes de Noël, LS-277

**Arbitrage de Christophe sur maquette**, `docs/prototypes/themes-noel/`,
validée le 6 octobre 2026 pour l'accueil et la page des créations. Le thème
`NOEL` de LS-267, jamais activé en production, est **écarté** : deux thèmes
en rouge et blanc le remplacent. Les sections 1 à 4 changent comme suit, le
reste de l'ADR tient.

**Section 1, mécanisme.** La contrainte `chk_parametre_theme_connu` passe de
`AUCUN`, `NOEL` à **`AUCUN`, `NOEL_1`, `NOEL_2`**. Une valeur `NOEL` présente
au moment de la migration devient `NOEL_1`, le thème le plus proche ; aucune
migration n'active un thème. Remplacer une contrainte `CHECK` passe par un
`DROP CONSTRAINT` : `migrate-production.sh` la classera destructive et
demandera `--confirm-destructive`, ce qui est attendu. Attributs posés sur le
`<main>` : `data-theme="noel_1"` et `data-theme="noel_2"`.

**Section 2, périmètre visuel, par thème.**

- **`NOEL_1`, sobre**, reste dans la table de la section 2 sans exception :
  fond blanc neige, accents rouges, décors. Texte, titres, boutons, focus et
  prix gardent leurs couleurs.
- **`NOEL_2`, franc**, est l'exception, limitée à ce qui suit :
  - **le bandeau de tête** de l'accueil et des créations passe sur fond rouge ;
    son titre `h1`, son texte et ses boutons y passent en blanc, ou en blanc à
    texte rouge pour un bouton plein. **Le texte du titre ne change pas**,
    seule sa couleur ;
  - le **filtre actif** du catalogue passe au rouge ;
  - les **cartes produit** reçoivent un cadre rouge piqué de blanc autour de
    leur contenu, et le bouton « Ajouter au panier » devient blanc à texte
    rouge. **Le contenu des cartes ne change pas** : photographie, nom,
    catégorie, prix, disponibilité, et le prix garde sa couleur ;
  - la bande défilante, le sceau et le pied de page de ces deux pages passent
    au rouge.
- **Commun aux deux** : rien n'est posé sur une photographie de bijou ; le
  focus reste visible et contrasté sur chaque fond ; l'en-tête du site, le
  tunnel, le compte et l'administration ne changent pas.

**Section 2, décors.** Ils remplacent ceux de `NOEL` : boules suspendues,
bandes sucre d'orge, bande de papier cadeau, paquet au ruban, guirlande
rouge et blanche, neige ; et sur les cartes, liseré, ruban et nœud sous la
photographie, flocons dans les coins du cadre. Deux images générées par Codex
le 6 octobre 2026, sans bijou ni texte, métadonnées retirées : le papier cadeau
et le paquet au ruban.

**Section 3, contrastes, calculés le 6 octobre 2026.**

| Paire | Ratio au pire |
|---|---|
| `NOEL_1` rouge `#9B1B1E` sur crème, sable, blanc, fond `#FFFDFA` | 6,85:1 (sable) |
| `NOEL_1` vert sapin `#2F5A43` sur crème, blanc, fond | 7,38:1 |
| `NOEL_2` blanc sur le dégradé rouge, zone la plus claire `#BB4348` | 5,24:1 |
| `NOEL_2` or pâle `#F0CF7A`, mots du titre seulement, grand texte | 3,47:1 |
| `NOEL_2` rouge `#9B1B1E` sur bouton blanc | 8,17:1 |
| `NOEL_2` texte du pied `#E9DCC2` sur `#3D080C` | 12,50:1 |

**Correction du 6 octobre 2026, revue d'interface de LS-277** : le héros de
`NOEL_2` porte le papier cadeau en filigrane à 5 %, qui éclaircit le fond
sous ses motifs. Mesuré sur les pixels réels, l'or des mots du titre y tombe à
**3,19:1** et le blanc à **5,17:1**, au-dessus de leurs seuils ; le tableau
ci-dessus, calculé sans le filigrane, les surestimait.

**Tout petit texte sur le rouge est blanc pur.** Le surtitre rose pâle de la
maquette, `#FFE3DC`, tombe à 4,31:1 sur la zone la plus claire : il n'est pas
porté. L'or ne sert qu'aux mots dorés du titre, au-dessus du seuil de 3:1 du
grand texte.

**Section 4, animations.** Elles suivent ADR-045, **amendé le même jour** par
LS-277 : neige, rayons et boules bougent en continu sous les deux thèmes, avec
un bouton de pause ; tout le reste est borné à cinq secondes. « La neige tombe
une fois puis fond » ne vaut plus pour ces thèmes.

**Écarté : garder `NOEL` et lui ajouter un second thème.** L'ancien thème ne
plaît pas à Christophe, et le garder laisserait trois habillages de Noël à
maintenir et à tester pour un usage de quelques semaines.

**Écarté : `NOEL_2` dans le cadre actuel de la section 2.** Un fond rouge
porteur impose du blanc sur le titre, le texte et les boutons pour tenir les
contrastes : sans exception à la section 2, le thème franc est impossible.

## Contexte

Demande de Christophe du 4 octobre 2026 : l'exploitante active depuis
l'administration un thème qui change l'habillage du site, le premier étant
Noël, sur l'accueil et la page des créations. **La maquette du thème Noël est
validée le même jour**, commentaire de LS-267 : ruban « Fêtes de fin
d'année », accents rouge houx et vert sapin, baies de houx sur l'emblème,
neige qui tombe une fois dans la zone de l'emblème, guirlande d'étoiles
au-dessus du titre des créations, deux phrases d'accroche saisonnières.

Quatre contraintes du projet pèsent sur la décision :

- **ADR-022** fixe la palette publique, et `frontend-design.md` interdit toute
  valeur hexadécimale hors de `tokens.css` ;
- **ADR-045** borne toute animation à cinq secondes, la supprime en mouvement
  réduit, et interdit les paillettes par-dessus un bijou ou un contrôle ;
- **ADR-043** a déjà posé le modèle d'un réglage commercial modifiable sans
  redéploiement : une table `ParametreBoutique` à ligne unique ;
- les allégations restent vraies : aucune promotion, urgence ni promesse de
  délai inventée, `frontend-design.md` et le droit de la consommation.

L'accueil et le catalogue sont déjà rendus **à chaque requête**
(`export const dynamic = "force-dynamic"` dans les deux pages) : lire un
réglage en base n'y change rien au cache.

## Décision

**Un thème est un jeu fermé de jetons, de décors et de textes écrit dans le
code ; l'exploitante choisit lequel est actif, dans l'administration, et rien
d'autre.** Six points tranchés.

### 1. Mécanisme

- Une colonne `theme_saisonnier` dans `ParametreBoutique`, **texte borné par
  une contrainte `CHECK`** à deux valeurs, `AUCUN` et `NOEL`, défaut `AUCUN`.
  **Pas un type énuméré PostgreSQL** : `verifier-schema.sh` exige que chaque
  énumération figure au modèle conceptuel, dont `ParametreBoutique` est exclue
  à dessein, la table étant de configuration et non métier. Le `CHECK` donne
  la même garantie en base, Zod la donne côté serveur. Migration additive,
  créée à la main, passée par `migrate-production.sh`.
- Le thème actif est lu côté serveur par le service des paramètres, comme le
  seuil de franchise, et posé en attribut `data-theme` sur le `<main>` des deux
  pages concernées. **Pas sur `<html>`** : le layout racine lirait alors la
  base pour tout le site, administration comprise, pour un habillage qui ne
  concerne que deux pages.
- Les jetons du thème vivent dans `tokens.css`, sous `[data-theme="noel"]`. Ils
  **redéfinissent** des jetons existants ou en ajoutent ; aucun composant ne
  porte de couleur propre à un thème.
- Ajouter un thème, c'est ajouter une valeur à l'énumération, son jeu de
  jetons et ses décors : un changement de code relu, jamais un réglage.

### 2. Périmètre visuel

| Ce qu'un thème change | Ce qu'il ne change jamais |
|---|---|
| couleurs d'accent (surtitre, filets, ruban, feuillage) | couleur du texte courant, des boutons, du focus, des prix |
| décors : feuillage de l'emblème, neige, guirlande | titre `h1`, métadonnées, contenu des cartes produit |
| deux ou trois phrases d'accroche **écrites dans le code** | photographies des bijoux, aucun décor posé dessus |
| | l'en-tête, le pied, le tunnel, le compte, l'administration |

**Aucun texte saisi par l'exploitante.** Un champ libre ouvrirait la porte à
« -20 % jusqu'à dimanche » ou à « livré avant Noël », qu'aucun contrôle ne
saurait vérifier. Les phrases du thème Noël sont celles de la maquette validée.

### 3. Contrastes

Chaque jeton d'un thème est une **paire mesurée** sur les trois fonds du
projet, C31. Pour Noël :

| Jeton | Valeur | Crème `#FBF7F0` | Sable `#F2EADF` | Blanc |
|---|---|---|---|---|
| `--ls-noel-rouge` | `#8E2A22` | 7,85:1 | 7,03:1 | 8,39:1 |
| `--ls-noel-vert` | `#2F5A43` | 7,38:1 | 6,61:1 | 7,88:1 |

Tous deux tiennent 4,5:1 en petit texte. `verifier-contraste.sh` est étendu
pour mesurer les paires sous chaque thème, et pas seulement sous `:root`.

### 4. Animations

Soumises sans exception à ADR-045 : bornées à cinq secondes par `data-borne`,
supprimées en mouvement réduit, `transform`, `opacity` et
`stroke-dashoffset` seulement. **La neige tombe une fois puis fond**, dans la
zone de l'emblème seulement, jamais par-dessus un texte ni un contrôle ; la
guirlande se trace puis s'allume. Positions fixes, aucun canvas, comme la
poussière d'or.

### 5. Référencement et cache

- Le `h1`, les métadonnées et l'adresse canonique ne changent pas avec le
  thème : rien d'indexé ne bascule deux fois par an.
- Les deux pages restent dynamiques, le thème est lu à chaque requête ; aucun
  cache à purger. L'action de l'administration revalide quand même `/` et
  `/catalogue`, pour que la règle tienne le jour où une page deviendrait
  statique.
- **Aucun décalage de mise en page** : la neige est en position absolue dans
  le cadre de l'emblème ; le ruban et la guirlande du catalogue sont rendus par
  le serveur dès le premier octet, jamais insérés après coup. **Précision du
  4 octobre 2026, revue de LS-267** : la guirlande est dans le flux, au-dessus
  du titre, faute de marge où la poser en position absolue sans chevaucher ce
  titre ; elle ne décale rien après l'affichage.

### 6. Programmation

**Activation manuelle seulement.** L'exploitante choisit le thème actif et le
retire elle-même. Une programmation par dates pourra suivre dans un ticket
distinct si le besoin se confirme après une première saison.

L'écran d'administration offre un **aperçu** : un lien qui ouvre l'accueil
avec le thème choisi, honoré **pour une session administratrice seulement**,
invariant 2. Un paramètre d'URL ne change jamais le thème d'un visiteur.

## Alternatives écartées

- **Classe ou attribut sur `<html>`.** Le layout racine lirait la base pour
  chaque page du site, administration comprise, pour un habillage qui ne
  concerne que deux pages.
- **Thème entièrement paramétrable par l'exploitante** (couleurs et textes
  saisis). Il contournerait ADR-022 et la règle de contraste, et laisserait
  passer une allégation commerciale fausse que rien ne relit.
- **Programmation par dates dès la V1.** Elle exige une gestion de fuseau, de
  chevauchement et de fin de période, pour un usage d'une à deux bascules par
  an : l'exploitante le fait en un clic.
- **Variable d'environnement et redéploiement**, le choix d'avant ADR-043.
  Écartée pour la même raison que les tarifs : l'exploitante ne doit pas
  dépendre d'un déploiement pour un geste saisonnier.
- **Feuille de style chargée à part par thème.** Une requête de plus et un
  risque de flash sans thème au premier rendu, là où des jetons dans
  `tokens.css` coûtent quelques centaines d'octets déjà chargés.

## Conséquences

- Migration additive : colonne `theme_saisonnier` sur `parametre_boutique`,
  défaut `AUCUN`, et contrainte `chk_parametre_theme_connu`. `schema.sql`,
  `001_contraintes_check.sql`, `MODELE-LOGIQUE.md` et `verifier-schema.sh`
  suivent.
- `tokens.css` reçoit le bloc `[data-theme="noel"]` ; `verifier-contraste.sh`
  apprend à mesurer sous chaque thème.
- `frontend-design.md` reçoit une section « Thèmes saisonniers, ADR-046 » :
  ce qu'un thème peut changer, et la liste des décors permis.
- L'écran `/administration/parametres` gagne le choix du thème et l'aperçu ;
  action gardée par `exigerRole`, validation Zod sur l'énumération.
- **Thème `AUCUN` strictement identique au site actuel**, prouvé par les tests
  existants de l'accueil et du catalogue, qui tournent sans thème.
- Tests de bout en bout sur les deux thèmes, en mouvement réduit et sans
  JavaScript, aux quatre largeurs.

## Risques

**Un thème oublié actif en février.** Atténuation : l'écran de l'administration
affiche le thème actif en tête, et le tableau de bord le rappelle tant qu'il
n'est pas `AUCUN`.

**Une phrase saisonnière qui devient fausse**, par exemple une mention de
délai. Atténuation : les phrases sont dans le code et relues en revue ; aucune
ne parle de livraison ni de date.

**Un jeton de thème qui casse un contraste sur un fond non prévu.**
Atténuation : le contrôle de contraste mesure chaque thème sur les trois fonds,
et `axe-core` tourne sur les deux thèmes dans la suite de bout en bout.

**Une animation de thème qui dépasse ADR-045.** Atténuation : les décors du
thème vivent sous un élément `data-borne`, et le test du mode animé vérifie
l'arrêt sous cinq secondes comme pour LS-268.
