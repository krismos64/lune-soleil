# 14 novembre 2026 : LS-325, navigation de l'administration

## Demande

Christophe demande de refaire le visuel de l'interface de l'administratrice :
« un design joli, animé, motion design, mieux pensé, facile et intuitif, afin
que la navigation soit la plus agréable possible, quitte à ajouter des
raccourcis, des boutons ».

## Décisions prises en autonomie

- **ADR-045 amendé avant le code** : il écartait toute animation de
  l'administration. Cadre retenu : une entrée orchestrée sur le tableau de
  bord, des réponses à un geste ailleurs, aucune boucle (pas de bouton de
  pause), rien pendant une saisie, les chiffres ne s'animent pas.
- **Périmètre** : ce qui structure la navigation et se voit partout (barre
  latérale, bandeau, palette) et l'écran d'arrivée. Les listes et les
  formulaires gardent leur disposition, lot suivant possible.
- **Pas de barre d'onglets en bas d'écran sur téléphone** : elle doublerait
  les liens de la barre latérale, que cinq suites de tests désignent par leur
  nom.
- Sans maquette, captures relues, comme LS-322.

## Fait

- **Barre latérale** : une icône par rubrique (`icones-administration.tsx`,
  champ `icone` de `RUBRIQUES`), marque lune et soleil, repère de la rubrique
  courante qui grandit, intitulés de groupe en bas de casse, menu mobile qui
  se déplie.
- **Palette « Aller à… »** (`palette-administration.tsx`) : bouton du bandeau,
  Ctrl+K ou Cmd+K, `<dialog>` natif, recherche sans accents, flèches, Entrée,
  Échap. Les rubriques viennent de `RUBRIQUES`, les actions de
  `actions-administration.ts`.
- **Tableau de bord** : en-tête à l'arc du jour (`ciel-du-jour.tsx`, soleil
  ou lune à l'heure de Paris, calculé côté serveur), salutation, quatre
  actions directes, « À traiter » avant les indicateurs, tuiles à icône,
  jauge du stock.
- `frontend-design.md` : administration et onzième décor de ciel, trois
  chemins vers une rubrique sous C33.

## Preuves

- `administration-navigation-ls325.spec.ts` : 37 passés aux quatre largeurs
  (palette au clic et au clavier, retour du focus, contrastes axe-core,
  actions directes, ordre des blocs, aucune boucle, mouvement réduit, absence
  hors session).
- Suites existantes : `navigation-administration`, `gabarit-titre-ls228`,
  `administration-connectee`, `alertes-administration`, `pages-erreur`, 618
  passés.
- `ciel-du-jour.test.ts` : 5 passés, bornes du lever et du coucher, heure
  d'hiver et d'été.
- `npm run test` : 2104 passés. Seize contrôles du dépôt en sortie 0.
- Mutation : focus du champ retiré à l'ouverture de la palette, le test
  rougit (`Expected: focused, Received: inactive`), puis restauré.

## Revue `ls-frontend-revue`

Mesurée sous Verdana aux quatre largeurs. Bandeau, actions directes, tuiles,
repère et contour de focus de la barre : sans défaut. **Deux défauts
bloquants dans la palette, corrigés** :

- l'option active sortait de la zone visible de la liste dès la huitième
  flèche (`scrollTop` resté à 0 après vingt flèches) : elle est ramenée à
  l'écran par `scrollIntoView` ;
- l'identifiant de l'option active valait toujours `option-0` après un
  filtre, et rien n'annonçait le nombre de résultats : chaque option garde
  l'identifiant de son entrée, et la région d'état dit « 2 résultats ».

Corrigé aussi : « stock » proposait d'abord « Créer un produit », dont la
précision cite le stock (les noms passent désormais avant les précisions) ;
Cmd+K sur Mac et Ctrl+K ailleurs, jamais les deux, pour laisser Ctrl+K effacer
la fin de ligne sous macOS ; soleil cerné de nuit au crépuscule, où l'or se
perdait dans l'orangé (1,4 à 1,7:1) ; jauge du stock sur le disponible du
serveur ; un glisser relâché sur le voile ne ferme plus la palette ;
commentaires de style remis à leur place. Le test couvre le classement, le
compte annoncé et la visibilité de l'option active.

Non vérifié : un lecteur d'écran réel, le clavier virtuel d'un téléphone
ouvert sur la palette (le bas de la liste passe sans doute dessous), WebKit
et Firefox. Laissé : l'arc dessiné sur 400 px au centre d'un en-tête large.

## Ce qui a dérapé

- **Le champ de la palette ne recevait pas le focus** : demandé dans le même
  geste que le changement d'état, il n'existait pas encore. Trouvé par le
  test, corrigé par un effet après le rendu.
- **Deux options partageaient la même clé React**, l'action « vente de
  marché » et la rubrique « Stocks » menant au même écran : une recherche
  rendait une option en trop. Clé passée au libellé.
- Mon test de l'ordre des blocs mesurait l'armature de chargement : il attend
  désormais le contenu réel.

## Mise en production, même jour

Sur accord de Christophe (« oui enchaîne »). PR #680 fusionnée en rebase,
`main` à `a05d407`, CI verte. Aucune migration.

- **Image** publiée par la fusion, run 43610658772.
- **Déploiement** run 43610912071 : `1c97956` vers `a05d407`, réussi. `/`,
  `/catalogue`, `/panier`, `/api/sante` et `/administration/connexion` en 200,
  santé opérationnelle.
- L'écran de connexion servi ne porte pas la palette : elle n'existe que pour
  une session administratrice.

## Reste

- Non vérifié en production : le tableau de bord et la palette avec la
  session de l'exploitante, et la palette sur son téléphone, clavier ouvert.
- Lot suivant possible : refonte des listes et des formulaires, écran par
  écran.
- Issue #647 : à fermer sur le premier nocturne vert.

## État des tickets

- LS-325 : Terminé, déployé.
