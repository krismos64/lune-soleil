# ADR-046 : thèmes saisonniers activables par l'exploitante

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 4 octobre 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | ADR-022 (palette publique), ADR-045 (politique d'animation) |
| Ticket | LS-267 |

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

- Une colonne `theme_saisonnier` dans `ParametreBoutique`, d'un type énuméré
  `ThemeSaisonnier` à deux valeurs, `AUCUN` et `NOEL`, défaut `AUCUN`.
  Migration additive, créée à la main, passée par `migrate-production.sh`.
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
- **Aucun décalage de mise en page** : les décors sont en position absolue, et
  le ruban est rendu par le serveur dès le premier octet, jamais inséré après
  coup.

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

- Migration additive : énumération `ThemeSaisonnier` et colonne
  `theme_saisonnier` sur `parametre_boutique`, défaut `AUCUN`. `schema.sql`,
  `MODELE-LOGIQUE.md` et `verifier-schema.sh` suivent.
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
