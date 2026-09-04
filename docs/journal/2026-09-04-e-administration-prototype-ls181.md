# 4 septembre 2026, session E : l'administration ressemble enfin au prototype, LS-181

Livrée, commit `32b2972`. Le constat de départ est de Christophe, en testant
l'administration : « visuellement très décevant par rapport au prototype ».

Vingt-trois stories ont livré les **fonctions** de l'administration. Personne
n'avait comparé le **rendu d'ensemble** au prototype, et aucun ticket ne portait
ce sujet.

## Ce qui est livré

**La barre devient latérale**, permanente au-delà de 768 px, repliée derrière un
bouton en dessous. Le prototype ne montre jamais le cas mobile : onze rubriques
empilées à 320 px mangeraient l'écran avant le contenu, ce qui reproduirait sous
une autre forme le défaut que LS-162 avait fermé.

**Les pastilles de comptage existent**, et leur nombre vient des données. Le type
l'impose plutôt que la discipline : une rubrique porte la **clé** du comptage à
lire, jamais un nombre. Aucune valeur numérique ne peut s'écrire dans ce fichier
sans casser la compilation.

**Le tableau de bord existe.** Il tenait en un `h1` et la phrase « Connexion
réussie » depuis LS-70, où il servait à être la première route protégée du
projet. Il porte désormais quatre tuiles, un panneau « À traiter maintenant » qui
masque ce qui est à zéro, et l'encaisse du jour.

**La déconnexion existe.** Elle n'existait nulle part dans l'administration
depuis LS-70 : il fallait vider les cookies du navigateur. Sur un stand,
l'exploitante rangeait un téléphone avec une session ouverte.

## L'arbitrage de la session : onze rubriques, six inertes

Question posée à Christophe, quatre des onze rubriques du prototype n'étant pas
livrées. Réponse : **les montrer grisées plutôt que les cacher**, la barre
annonçant alors la structure complète de l'outil.

Elles sont des `span` sans `href`, dans un tableau **séparé** de celui des
rubriques navigables. Un quatrième sens de
`verifier-navigation-administration.sh` refuse qu'une d'elles porte un chemin :
sans lui, une entrée à qui l'on ajouterait un `chemin` sur place ne serait
attrapée par rien. Prouvé par mutation.

## Trois écarts au prototype, assumés et mesurés

`frontend-design.md` dit qu'en cas de divergence, c'est le prototype qui a tort.
Trois cas s'en réclament ici, chacun mesuré et non supposé :

| Écart | Raison |
| --- | --- |
| Le fond de barre n'est pas le sable | `--ls-text-muted` y donne **4,35:1**, sous AA. Sur le blanc cassé retenu : 5,11:1 |
| Les sur-titres ne sont pas en terracotta | **4,07:1** en petit texte. Le prototype commet cette erreur 35 fois |
| Le bandeau est opaque et non à 97 % | Un contraste sur fond variable ne se mesure pas |

## Ce qui a été trouvé en chemin

**Trois écrans du prototype n'ont aucun ticket**, vérifié dans Jira et non
supposé : Catalogue, Factures et avoirs, Clients. Le **métier** existe, LS-126,
LS-128 et LS-129 ayant livré factures et avoirs : ce sont les **écrans**
d'administration qui manquent. Personne ne peut aujourd'hui lister une facture,
un client, ni même les produits du catalogue. **LS-182** porte ce constat.

Le motif est en fiche depuis LS-140 sous « vérifier la couverture du backlog »,
et il s'est reproduit : la table de `PROTOTYPE.md` recense bien onze rubriques
avec leur colonne « Couverte par », mais cette colonne cite des stories de
**métier**. « Catalogue, phase 2, epic LS-3 » est vrai pour le métier et faux
pour l'écran.

**Trois clefs de ticket écrites de mémoire étaient fausses.** En première
intention, la liste des rubriques à venir citait LS-87 et LS-95, deux stories
**closes** portant tout autre chose, et LS-125 qui concerne la confirmation de
commande. C'est la vérification dans Jira qui l'a montré, pas la relecture.

**L'ancrage d'un contrôle était plus fragile qu'il n'y paraissait.** L'ajout
d'une annotation de type sur `RUBRIQUES`, `readonly Rubrique[]`, a suffi à ce
que `awk '/^export const RUBRIQUES = \[/'` ne trouve plus le tableau. Le script
est sorti en ECHEC en le disant, ce qui est le bon défaut, mais le contrôle ne
vérifiait plus rien entre-temps.

**Le nom accessible collait le compteur au libellé**, « Commandes3, 3 en
attente ». Trouvé par le test clavier, pas à la relecture : `aria-hidden` retire
un élément de l'arbre d'accessibilité **sans ajouter de frontière de mot**, donc
le chiffre masqué de la pastille se colle quand même au texte voisin dans le
calcul du nom.

**Cinq jetons de couleur déclarés n'étaient utilisés nulle part.** Écrits en
anticipant les badges et le kanban, que la story n'a finalement pas retouchés.
L'écran des commandes portait **déjà** ses badges, mesurés et conformes : les
garder aurait fait deux palettes pour une même notion. Retirés.
`verifier-contraste.sh` ne les voyait pas, ne mesurant que les paires
colocalisées dans une règle.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| Vitest | **1123 tests verts**, 73 fichiers, dont 10 neufs sur les comptages |
| Playwright | **41 tests verts** sur la navigation, aux trois largeurs |
| Suite complète de bout en bout | 812 verts, 2 échecs de LS-168 reproduits hors de cette story |
| `verifier-contraste.sh` | **128 paires** mesurées, contre 81 avant |
| axe-core | vert sur la barre et le tableau de bord, aux trois largeurs |
| Débordement horizontal | nul, mesuré par `getBoundingClientRect` |
| `verifier-regles.sh`, `verifier-navigation-administration.sh` | verts |

**Quatre mutations prouvent les tests neufs**, chacune attrapée par le seul test
qui la vise et non par la suite entière :

| Mutation | Test qui rougit |
| --- | --- |
| Compter le physique au lieu du disponible | « compte le disponible et non le physique » |
| Dater la recette sur la commande | « écarte un paiement confirmé un autre jour » |
| Pastille à une valeur en dur | « la pastille compte les messages réellement non lus » |
| Barre jamais repliée | « la barre est repliée sous 768 px », aux deux largeurs mobiles |

Les deux échecs de la suite complète sont ceux de **LS-168**, le fond de bruit
des plafonds d'authentification quand plusieurs fichiers s'inscrivent en
parallèle. `compte-profil.spec.ts` passe intégralement joué seul, 26 tests
verts, et cette story ne touche pas ce fichier.

## Ce qui n'est pas fait

**Les écrans Commandes, Stocks et Expéditions gardent leur mise en forme
actuelle.** Le ticket demandait que « Expéditions et Tableau de bord portent
leur mise en forme propre » : seul le tableau de bord est traité. Le kanban à
trois colonnes des expéditions reste à faire, et la story reste **ouverte** sur
ce critère plutôt que d'être close à tort.

**Le nom affiché est la partie locale de l'email**, `lireIdentite` ne rendant
pas le nom. Suffisant pour une administration à compte unique, à reprendre si
l'identité de session s'élargit.

## État des tickets

**LS-181 reste EN COURS**, un critère sur treize n'étant pas rempli, la mise en
forme propre de l'écran Expéditions. **LS-182 est créée**, sous LS-3, Medium.

## Prochaine étape

Terminer LS-181 par l'écran Expéditions, puis **LS-180**, la story jumelle pour
l'espace client, qui partagera le gabarit posé ici. Côté code sans dépendance
externe, **LS-137** et **LS-147** restent les deux suivantes.
