# 4 septembre 2026, session E : l'administration ressemble enfin au prototype, LS-181

**Livrée et FUSIONNÉE**, PR #228 en rebase. Sur `main` : `a8d25c7`, `4c2aba0` et `b18f875`, les SHA ayant changé au rebase. Le constat de départ est de Christophe, en testant
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
| Playwright, navigation | **47 tests verts**, aux trois largeurs, 2 sautés à 1280 px |
| Suite complète de bout en bout | **830 verts, aucun échec** |
| `verifier-contraste.sh` | **129 paires** mesurées, contre 81 avant |
| axe-core | vert sur la barre et le tableau de bord, aux trois largeurs |
| Débordement horizontal | nul, mesuré par `getBoundingClientRect` |
| `verifier-regles.sh`, `verifier-navigation-administration.sh` | verts |

**Six mutations prouvent les tests neufs**, chacune attrapée par le seul test
qui la vise et non par la suite entière, ce qui écarte le motif « mutation trop
brutale » :

| Mutation | Test qui rougit |
| --- | --- |
| Compter le physique au lieu du disponible | « compte le disponible et non le physique » |
| Dater la recette sur la commande | « écarte un paiement confirmé un autre jour » |
| Pastille à une valeur en dur | « la pastille compte les messages réellement non lus » |
| Barre jamais repliée | « la barre est repliée sous 768 px », aux deux largeurs mobiles |
| Focus non rendu à la fermeture | « le focus ne se perd pas », qui rend `"body"`, le défaut exact |
| Formulaire sur les trois colonnes | « le tableau d'expédition porte trois colonnes comptées juste » |

**Une mutation a aussi prouvé un contrôle de script** : donner un `chemin` à une
rubrique « à venir » fait échouer le sens 4 neuf de
`verifier-navigation-administration.sh`.

Le fond de bruit de **LS-168** s'est manifesté deux fois pendant la session, sur
`compte-profil.spec.ts`, un fichier que cette story ne touche pas : il passe
intégralement joué seul, 26 tests verts. La dernière exécution complète est
verte de bout en bout.

## La revue d'interface a trouvé six défauts

`ls-frontend-revue` est passée avant clôture, comme le ticket l'exige. Deux
défauts de correction, un d'accessibilité, trois de justesse.

**Le focus se perdait à chaque navigation au clavier**, sous 768 px. Activer une
rubrique referme le panneau, ce qui applique `display: none` à l'élément
focalisé : le focus retombait sur `body` et la tabulation repartait du haut du
document. Motif « focus sur un élément détaché », déjà en fiche avec
`revalidatePath`. Le test clavier existant ne le voyait pas, il tabule sans
jamais **activer** de lien.

**Les initiales ne pouvaient jamais rendre deux lettres.** L'entrée est la partie
locale d'une adresse, `stacy.menendez`, qui ne contient aucun espace : la
découpe sur `\s+` rendait toujours un seul mot. Vérifié par exécution. Motif
« cible de test inexistante », le commentaire décrivait un cas, « SM Stacy
Menendez », qui ne pouvait pas se produire.

**Le `h2` de la barre précédait le `h1` de chaque page**, le layout rendant la
barre avant le contenu. `axe-core` ne l'attrape pas : sa règle `heading-order`
est classée `best-practice` et n'appartient à aucun des tags WCAG employés par
la suite. Son vert ne disait rien sur ce point.

**`Escape` ne fermait pas le panneau**, alors que `aria-expanded` et
`aria-controls` annoncent un motif de divulgation. La correction a échoué au
premier essai : le gestionnaire posé sur le `nav` ne voit jamais la frappe, le
focus restant sur le bouton, qui est **hors** du `nav`. Il vit désormais sur une
enveloppe en `display: contents`.

**Deux tuiles ne s'adaptaient pas au cas nul**, « 0 / Étiquette à générer » et un
filet vert de recette allumé sur « 0,00 € ». Un marqueur toujours allumé ne
marque plus rien.

**Six décomptes de commentaires étaient faux** et une annotation de contraste
nommait le mauvais fond. Les deux paires sont conformes, mais C31 dit qu'un
rapport ne vaut que pour **un** fond : une annotation fausse rend fausse la
prochaine paire écrite par recopie.

## Le tableau d'expédition, dernier critère

Arbitrage de Christophe : traiter le kanban dans cette story plutôt que d'ouvrir
un ticket. **La requête passe de un à trois statuts**, ce qui élargit ce que
l'écran montre et n'est donc pas qu'une mise en forme.

**Le formulaire ne s'affiche que sur la colonne du milieu, et ce n'est pas la
protection.** `declarerExpedition` relit le statut en base dans sa transaction :
une commande `CONFIRMEE` ou `EXPEDIEE` est refusée même appelée directement en
HTTP. Le test d'affichage évite de proposer un geste voué au refus.

**Deux tests d'intégration disaient l'inverse**, et ils avaient raison pour un
écran à une seule file. Réécrits en gardant leur garantie d'origine : une
commande non payée reste exclue, invariant 5.

## Ce qui n'est pas fait

**Le nom affiché est la partie locale de l'email**, `lireIdentite` ne rendant
pas le nom. Suffisant pour une administration à compte unique, à reprendre si
l'identité de session s'élargit.

**Les écrans Commandes et Stocks gardent leur mise en forme actuelle.** Le
ticket ne nommait qu'Expéditions et Tableau de bord, « les deux plus éloignés du
rendu actuel », et ils sont traités.

**Aucune frontière d'erreur ne couvre le nouveau layout**, relevé par la revue :
`lireComptages` lève quand la requête ne rend rien, et un `error.tsx` ne
rattrape pas l'erreur du layout de son propre segment. Une base injoignable
envoie donc l'administration sur `global-error.tsx`. Hors périmètre de cette
story, à ticketer.

## Le découpage de LS-182, décidé en fin de session

Arbitrage de Christophe : découper avant d'enchaîner. Trois stories, chacune
sous l'epic où le travail s'exécute réellement.

| Story | Epic | Priorité | Sujet |
| --- | --- | --- | --- |
| **LS-183** | LS-3 | **High** | Écran Catalogue |
| **LS-184** | LS-5 | Medium | Écran Factures et avoirs |
| **LS-185** | LS-36 | Low | Écran Clients, précédé d'un arbitrage RGPD |

**Aucun des trois ne se réduit à de la mise en forme**, et c'est ce que le
découpage a montré : il n'existe **aucune fonction de liste** pour ces trois
domaines. `listerProduitsPublies` sert le catalogue public et filtre sur les
produits publiés ; `facture.ts` lit la facture d'une commande, `avoir.ts` les
avoirs d'une facture ; `utilisateur.ts` lit un profil. Chaque story crée sa
lecture.

**LS-185 commence par un arbitrage, pas par du code.** Un écran qui liste des
personnes est un traitement de données personnelles, et la réponse peut être
« cet écran ne se fait pas ».

## Un workflow cassé depuis le matin même, LS-186

Trouvé en vérifiant la CI avant de fusionner. `derive-documentation.yml`
échouait sur **chaque push**, `main` comprise, et pas seulement sur cette
branche.

**La cause** : `administration: read` n'est pas une portée valide de
`permissions:`, vérifié sur la documentation officielle de GitHub, qui en liste
seize et pas celle-ci. Le workflow est **rejeté au chargement**, avant tout job.

**Elle a été introduite le matin même** par `b349d36`, LS-176, dans le commit
qui ajoutait `verifier-protection-branche.sh` et la permission censée lui donner
ses droits. Le workflow tournait bien avant : quatre succès les lundis du mois
d'août, sur sa planification.

**Le contrôle hebdomadaire de dérive documentaire n'aurait donc pas tourné
lundi**, sans que rien ne le signale : personne ne consulte l'onglet Actions
d'un workflow planifié qui se tait.

**Une correction de syntaxe ne suffira pas.** Le script lit
`branches/main/protection`, endpoint qui exige des droits d'administration du
dépôt : le `GITHUB_TOKEN` ne peut pas les obtenir par une clé `permissions:`,
quelle qu'elle soit. LS-186 porte les trois voies possibles et l'arbitrage.

## État des tickets

**LS-181 est TERMINÉE et FUSIONNÉE**, les treize critères remplis. **LS-182 est
créée puis close**, son objet étant le constat et le découpage. **LS-183,
LS-184, LS-185 et LS-186 sont créées.**

## Prochaine étape

**LS-183**, l'écran Catalogue, dont la conception est faite : le ticket est
prêt, `motifsNonPubliable` existe déjà et servira à dire pourquoi un brouillon
n'est pas publiable, et deux arbitrages sont rendus, les archivés derrière un
filtre et « Nouveau produit » devenant un bouton de cet écran.

Puis **LS-180**, la story jumelle pour l'espace client, qui partagera le gabarit
posé ici.
