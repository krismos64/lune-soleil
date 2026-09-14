# 14 septembre 2026, la règle qui s'arrêtait aux portes d'entrée

Deuxième session du jour. LS-229 était créée le matin, cette session l'implémente
et y ajoute le panneau visuel demandé par Christophe sur les écrans de connexion
et d'inscription.

## Deux mécanismes, pas un

Le défaut paraissait simple : les titres publics en police système. La cause
tenait en réalité à **deux mécanismes distincts**, et le second est le plus
instructif.

Les **pages publiques** n'ont aucun layout où accrocher la règle.
`(boutique)/layout.tsx` rend un fragment, et ce choix est motivé sur vingt
lignes : un conteneur y cassait le lien d'évitement de LS-122.

Les **écrans sans session** vivent pourtant sous les dossiers que C42 couvre.
Mais `compte/layout.tsx` sort avant le gabarit faute d'identité, `return
<>{children}</>` à ses lignes 72 et 87 : `.colonne` n'est jamais rendu.

**Un chemin couvert par une règle ne suffit pas à conclure qu'un écran l'est.**
La garde s'évalue à l'exécution, et un layout qui sort tôt la retire sans bruit.
C'est ce qui rendait le défaut invisible : le contrôle regardait les bons
fichiers.

## La règle globale a débordé de son objet

Première version : `font-family` ET `font-weight: 500` sur `h1, h2, h3`. Le
raisonnement excluait `font-size` des sous-titres, « un module règle ses
sous-titres selon sa densité », et ne tenait pas ce raisonnement pour la graisse.

`ls-frontend-revue` a mesuré la conséquence : **neuf blocs changeaient hors du
périmètre de la story**, dont trois qui ne fixaient aucune taille et passaient
d'un gras par défaut du navigateur à un serif 500.

Pire, les trois étiquettes du pied de page rendaient en **serif 12 px capitales
avec 0,08em d'interlettrage**, sur toutes les pages publiques. La combinaison la
moins lisible du jeu.

**Une règle globale qui déborde de son objet est le défaut que LS-229 corrige, à
l'envers.** La graisse ne vaut plus que pour `h1`, comme l'échelle, et pour la
même raison.

## Le fichier que deux sens laissaient passer

`erreur.module.css` vit sous `src/app/` directement. Le sens 2 cherche dans
`administration/` et `compte/`, le sens 4 cherchait dans `(boutique)` : personne
ne l'examinait. Son `font-weight: 600` avait survécu au passage des huit modules
publics en 500, et les pages d'erreur rendaient leur titre plus gras que tout le
reste, sur les écrans qu'un visiteur atteint quand quelque chose va mal.

Le sens 4 couvre désormais la racine, **11 modules au lieu de 10**.

## Une simplification a cassé l'ancrage en silence

En voulant condenser la recherche de fichiers en une commande, j'ai combiné
`-maxdepth` et `-o` dans un `find`. Le contrôle est resté **vert** en n'examinant
plus qu'**un seul module au lieu de onze**.

```
   OK   1 modules publics examinés, aucun ne repose sa police
```

Le nombre était la seule trace, et il aurait fallu le lire pour s'en apercevoir.
Deux commandes distinctes valent mieux qu'une expression habile.

## Une mutation qui ne mutait plus

En restreignant la graisse à `h1`, elle a rejoint `font-size` dans le même bloc.
La mutation 6 supprimait un bloc supposé ne contenir que la taille : elle ne
correspondait plus à rien, ne mutait donc rien, et le cas passait au vert.

**Une mutation qui ne mute plus annonce son succès de la même voix qu'une
mutation détectée.** Elle retire maintenant la seule ligne visée, et laisse le
bloc debout avec ce qu'il porte d'autre.

## Un test masqué que je croyais vert

Le test de centrage de LS-194 ne tourne que sur `bureau-1280`. Sur ce projet, la
préparation échouait faute de place dans la limitation de débit, mes lancements
répétés l'ayant épuisée : le test ne s'exécutait pas.

Mesuré à la main, il **échouait** : mon gabarit place le `main` dans la colonne
droite, 690 px de marge à gauche contre 146. Son référentiel devient la colonne
du contenu, le premier ancêtre plus large que lui, et son exigence est inchangée.

Prouvé par mutation du rendu : plaquer le `main` à gauche le fait bien rougir.

**Le compte de tests le dit, 2142 avant, 2143 après.** Un test masqué se compte
comme absent, jamais comme vert.

## Ce que la capture d'écran m'a fait croire

Le panneau visuel est apparu vide sur plusieurs captures. J'ai incriminé `sizes`,
puis le chargement différé, et modifié les deux.

La mesure a tranché autrement : `getImageData` sur le canvas donnait une étendue
de 183 à 226 sur 255, donc une image franchement contrastée. **L'aplat était un
artefact de la capture, pas l'état de la page.** Le zoom l'a confirmé.

Un seul changement comptait vraiment, `object-position: 72%` : l'image est cadrée
pour l'accueil, ses bijoux occupent la moitié droite, et un recadrage centré sur
une colonne étroite ne montrait que le lin.

## Vérifications

```
npm run type-check              OK
npm run lint                    OK
npm run format:check            All matched files use Prettier code style
npm run test                    104 fichiers, 1702 tests verts
npx playwright test             2143 verts, 70 ignores
verifier-gabarit-titre.sh       4 sens, 28 modules prives et 11 publics
verifier-gabarit-titre-mutation 7 cas sur 7 detectes
verifier-contraste.sh           218 paires conformes
36 mesures aux 4 largeurs       0 defaut sur 9 ecrans
```

Le contrôle étendu rejoué **sur le dépôt d'avant la correction** y désigne les
deux défauts réels. Sans ce geste, sept mutations vertes auraient laissé croire à
une couverture qu'aucune ne prouvait.

Contraste des trois accroches mesuré sur le fond réel, **4,72:1** pour un seuil
de 4,5:1 : 13 px en graisse 600 n'est pas du grand texte, le seuil applicable
n'est pas 3:1.

## Ce qui reste ouvert

**Les cartes du catalogue et de la fiche produit** ne peuvent pas être jugées :
le catalogue est vide en production. L'ombre portée absente reste le principal
écart de profondeur avec le prototype, et elle se verra sur ces cartes. LS-23 et
LS-24 d'abord.

**Les sections manquantes de l'accueil**, créations et catégories, demandent des
photographies. Trois sections contre sept au prototype.

**`accueil-hero.jpg` est un visuel engendré non contractuel**, à remplacer avant
l'ouverture. Il montre des bijoux absents du catalogue, et le panneau de
connexion l'affiche désormais en grand : l'enjeu d'allégation trompeuse porté par
`public/habillage/README.md` vaut maintenant pour trois écrans de plus.

## Prochaine étape

PR #438 ouverte. LS-218, expédition Sendcloud, reste le chantier de code ouvert
qui ne dépend d'aucune réponse de l'exploitante.

Comptes relevés dans Jira, jamais déduits : **195 terminés sur 219 hors epics**,
**24 ouverts**, dont **10 En cours** depuis que LS-229 y est passée.
