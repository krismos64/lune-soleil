# 7 septembre 2026, k : LS-190, la story dégradait ce qu'elle prétendait améliorer

Le panneau « Documents et actions » est livré, la frise reste bloquée. Trois
défauts trouvés par la revue, et le plus instructif est celui que j'avais
introduit en croyant bien faire.

## Ce que la story a livré

Le panneau rassemble en un bloc ce que l'écran portait en trois endroits : la
facture et ses avoirs, la rétractation, et **le contact qui n'y figurait pas du
tout**. Un client qui voulait écrire au sujet de sa commande devait retrouver la
page de contact par la navigation, sans rien qui rattache son message.

La frise n'est pas construite : elle suppose un suivi de livraison que rien ne
renseigne, et **LS-58 bloque ce ticket par un lien Jira réel**, pas par une
phrase en prose. Le ticket reste En cours avec ses critères 3 et 4 ouverts.

## La correction que seule la mesure imposait

`--ls-focus` vaut **1,45:1** sur le fond brun du panneau, contre 3:1 exigés. Le
contour de focus aurait été quasi invisible, rendant le panneau inutilisable au
clavier.

**Aucun contrôle ne l'aurait vu** : `verifier-contraste.sh` mesure les paires
*texte* et fond, jamais les indicateurs de focus. C'est la limite du contrôle,
et elle n'est pas un défaut du contrôle.

## La story dégradait la navigation qu'elle améliorait

C'est le point à retenir. En fusionnant trois sections en une, j'avais remplacé
deux `h2` par des `<p><strong>`. Mon commentaire justifiait ce choix : « trois
actions de même rang, pas une hiérarchie ».

**L'argument était faux, et vérifiable.** Le même rang *entre elles* est
précisément ce que trois `h3` frères expriment ; la hiérarchie réelle est entre
le panneau et ses groupes. `<strong>` ne produit aucune entrée dans la liste des
titres : la navigation par titres sautait désormais du `h2` du panneau à la fin
de la page, alors qu'elle disposait auparavant de deux points d'entrée.

**Une story qui regroupe des sections retire des points d'entrée par
construction.** Les rendre sous une autre forme n'est pas un détail de balisage,
c'est la condition pour que le regroupement soit un gain.

## Le test ne rendait que le tiers du panneau

La fixture du fichier n'écrit pas `statut`, donc la commande prend le défaut du
schéma, `EN_ATTENTE_PAIEMENT`, que `STATUTS_RETRACTABLES` exclut. Conséquence :
`.groupeActions + .groupeActions` **n'était exercé par aucun test**, aux trois
largeurs comprises. Le séparateur que je venais d'écrire n'avait jamais été
rendu.

Le dépôt documentait déjà ce motif, sur `COMMANDE_FACTUREE_TEST` : « mesurer un
écran qui ne rend jamais la branche intéressante ne prouve rien ». Une seconde
commande `LIVREE` et facturée le ferme.

## Une couleur juste devenue fausse en changeant de fond

`.avoir` gardait `--ls-surface-sand`, choisi quand cette liste vivait sur le fond
crème. Elle restait **visible** sur le brun, 7,49:1, donc aucun contrôle ne
pouvait la voir : le défaut était la **confusion** avec le trait blanc des
groupes, deux traits de sens hiérarchique différent devenus semblables.

C'est C31 dans sa forme exacte, « recopier une couleur en ajoutant un fond casse
l'hypothèse sous laquelle elle était juste ». Deux niveaux désormais mesurés,
5,69:1 pour les avoirs et 8,93:1 pour les groupes.

## Trois erreurs de méthode, dont une coûteuse

**J'ai annoncé huit échecs préexistants qui n'existaient pas.** Ils venaient d'un
serveur que ma propre inspection avait laissé tourner sur le port 3100, servant
un build antérieur. Ma comparaison avec et sans modification donnait les mêmes
échecs précisément parce que les deux passaient par ce serveur périmé. Après
l'avoir arrêté : 75 tests verts.

**J'ai écrit `livre_a` sur `commande`**, où la colonne n'existe pas : elle vit
sur `Expedition`. Elle était de toute façon inutile, la garde d'affichage ne
lisant que le statut.

**Un `git checkout` sur le fichier de test a effacé mon travail non commité.**
Motif déjà en fiche, et il a coûté la réécriture des assertions sur les `h3`.

## Deux dérives corrigées au passage, sans ticket

Sur arbitrage de Christophe. **Le focus passait de 2 à 3 px** : six déclarations
étaient à 2 px, une seule à 3, et aucune décision n'avait réduit la valeur. Elle
s'était propagée par recopie, et la seule ligne conforme était celle qu'une story
avait écrite en lisant la règle.

**Les liens du panneau tiennent 44 px** : ils faisaient **18 px**, mesuré par
mutation. `inline-flex` et non `display: block`, qui étirerait la cible sur toute
la largeur et ferait naviguer sur un clic dans le vide.

## État des tickets

**LS-190 reste EN COURS**, le panneau livré et la frise ouverte. PR #293
fusionnée en rebase, commits `57a8718` et `31b2b8d`.

Comptes inchangés, aucun ticket fermé : **139 tickets terminés sur 192**.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui attend les clés de
Christophe.
