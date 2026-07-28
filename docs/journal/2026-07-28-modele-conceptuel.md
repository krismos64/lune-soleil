# 28 juillet 2026, modèle conceptuel de données

Session consacrée au modèle de données, LS-12 puis LS-37. Un livrable,
`docs/architecture/MODELE-CONCEPTUEL.md`, et deux enrichissements de
`PARCOURS.md`. Trois vérifications aux sources officielles, deux arbitrages de
périmètre, une revue de la configuration Claude Code.

## Fait

**Modèle conceptuel écrit et validé sur les parcours critiques.** Six domaines à
l'issue de LS-12, sept après LS-37 : catalogue, stock, vente, comptabilité, légal,
avis, exploitation. Tous les diagrammes Mermaid rendus sans erreur par
`mermaid-cli` 11.16.0 avant chaque commit.

Le document sépare explicitement trois niveaux de garantie, distinction qui
manquait dans la première version et que la revue a imposée : ce que garantit une
contrainte de base, ce que garantit une transaction, ce que contrôle
l'application. La différence compte, une contrainte tient sous concurrence, un
contrôle applicatif tient si personne ne l'oublie.

**Six décisions structurantes tranchées et tracées avec leur scénario.**

Statut de commande et statut de paiement séparés. Un statut unique produirait des
états composites, « payée mais partiellement remboursée et en préparation » n'est
pas un état.

Le paiement est une entité, pas des colonnes sur la commande. Le parcours 1
prévoit le refus suivi d'un nouvel essai, des colonnes écraseraient le motif
d'échec.

La ligne de commande fige référence, libellé et prix. Le `varianteId` existe mais
reste nullable et n'est jamais lu pour afficher une commande.

L'idempotence porte sur l'effet et pas seulement sur l'événement. C'est la
découverte technique de la session, détaillée plus bas.

L'unicité de facture par commande est une contrainte, pas une cardinalité de
diagramme.

Le total des avoirs est borné par un `CHECK` sur la facture, motif identique à
`quantiteReservee` sur la variante.

**Deux arbitrages demandés à Christophe**, parce qu'ils engagent la conformité et
ne se rattrapent pas sans migration sur données historiques.

L'adresse est recopiée figée dans la commande, sans table `Adresse`. Une table
référencée laisserait une modification d'adresse altérer rétroactivement une
facture émise, ce qui viole les invariants 3 et 4. Le carnet d'adresses de la V1
cible ajoutera une table sans migrer l'historique.

Aucune entité `Client`. L'achat sans compte est le seul mode au lancement, la
commande porte l'email normalisé. Regrouper les commandes par email avant
vérification créerait un accès aux commandes d'autrui dès que deux personnes
partagent une adresse.

**Le total des avoirs et le lien avoir vers rétractation** ont fait l'objet de
deux arbitrages supplémentaires en cours de correction, même logique.

## La découverte de la session, l'idempotence à deux clés

Mon modèle ancrait l'idempotence sur l'unicité de l'identifiant d'événement
Stripe. C'est correct pour le rejeu du même événement, et c'est le cas d'école.

La revue a montré que le parcours 1 prévoit un **second chemin d'entrée** vers le
même effet métier. La réconciliation interroge le prestataire quand aucun webhook
n'est arrivé au bout de soixante minutes, et régularise la commande. Si le
webhook arrive ensuite, retardé chez le prestataire, son identifiant n'a jamais
été vu : l'unicité ne le rejette pas. Il recrée le mouvement de stock.

Sur une pièce unique, la contrainte `CHECK` fait échouer la transaction, donc une
erreur serveur. Sur une variante à trois exemplaires, rien n'échoue et le stock
est faux, sans alerte.

La correction ancre l'idempotence sur l'effet. L'étape 7 du parcours 1 en produit
quatre, chacun avec sa clé : paiement réussi par commande, mouvement de vente web
par commande et variante, facture par commande, email automatique par commande et
modèle.

Ce cas n'existait dans aucune des deux listes du cahier des charges. Il devient le
trente-deuxième cas d'erreur de `PARCOURS.md`. Le document porte désormais une
note disant qu'il reste ouvert : modéliser révèle des cas que la lecture seule ne
fait pas apparaître.

## Ce que j'ai cassé en corrigeant

En fermant cette faille, j'ai posé « au plus un mouvement `VENTE_WEB` par
commande ». La seconde passe de revue l'a rattrapé : une commande à deux articles
décrémente deux variantes, donc produit deux mouvements. Mon unicité rejetait le
second. Aucun panier multi-articles n'aurait pu être confirmé.

La bonne clé est `(commandeId, varianteId)`. Elle garde l'idempotence et laisse
passer le cas nominal.

Leçon : resserrer une contrainte pour fermer un cas d'erreur peut fermer un cas
nominal. La vérification ne doit pas porter seulement sur ce que la contrainte
empêche, mais sur ce qu'elle empêche **par accident**.

Deux autres corrections de la seconde passe. L'email dupliqué n'était protégé par
rien sur le chemin du webhook tardif, d'où la quatrième clé et un champ `origine`
sur le journal d'envoi, qui laisse passer le renvoi manuel prévu au parcours 1.
Et j'affirmais qu'une transaction unique suffisait à permuter des rangs de
médias, ce qui est faux : PostgreSQL vérifie l'unicité à chaque instruction. La
contrainte porte maintenant sur le seul rang 1, ce qui suffit à déterminer le
média principal sans créer de problème de permutation.

## Ce qui a été retiré

Une entité `Message` figurait dans la première version sans qu'aucun des six
parcours ne la mobilise. Le principe directeur interdit d'entrer une entité sans
parcours qui la justifie, et l'exception assumée était déjà consommée par
`Commande.utilisateurId`. Le formulaire de contact relève d'un ticket propre, où
sa règle principale devra être posée : persister avant d'envoyer, sinon une panne
d'email perd le message.

Un champ `estPrincipal` sur le média a été retiré pour la même raison de fond :
il encodait deux fois l'information déjà portée par `ordre`, donc deux sources de
vérité qui peuvent diverger.

## Méthode

Deux passes de `ls-critical-reviewer`, huit défauts corrigés au total. La
première passe a trouvé six défauts, dont trois de correction. La seconde, portant
sur mes corrections, en a trouvé deux de plus dont le bloquant sur le panier
multi-articles.

La consigne donnée à l'agent a compté : lui demander de traverser les parcours
lui-même plutôt que de croire mon tableau de vérification. C'est ce tableau qui
s'est révélé complaisant, en déclarant « couvert » un remboursement de
rétractation dont l'avoir n'avait aucun lien vers sa demande.

Les sept diagrammes ont été rendus avant commit. Un a cassé : la syntaxe Mermaid
n'accepte pas `FK UK` sur un même attribut. Sans ce contrôle, le document serait
parti avec un diagramme illisible.

## LS-37, les avis et le carnet d'adresses

Story lancée dans la foulée, terminée le même jour.

### La vérification légale a précédé la modélisation, et elle a changé le modèle

Articles L111-7-2 et D111-16 à D111-19, vérifiés sur Légifrance avant d'écrire
une ligne. Trois découvertes ont produit des champs qui n'auraient pas existé
autrement.

**Deux dates obligatoires, pas une** : la date de publication de chaque avis et
la date de l'expérience de consommation. D'où `experienceA`, qui reçoit la date
de livraison. Sans la vérification, j'aurais mis une seule date et le modèle
aurait été non conforme.

**Un avis refusé doit être conservé**, son auteur devant être informé des motifs.
Le motif doit donc exister et survivre.

**Aucune obligation de contrôler les avis.** La loi impose de dire si un contrôle
existe, pas d'en faire un. Choisir la modération crée en revanche l'obligation
d'annoncer un délai de publication et de s'y tenir.

### Trois décisions arbitrées avec Christophe

L'avis est ancré sur la **ligne de commande**, ce qui rend la preuve d'achat
structurelle plutôt que déclarative. Le dépôt se fait **après livraison, sur
invitation**. La **modération précède la publication**.

Conséquence non anticipée de la deuxième : LS-33 devient structurant. Sans date
de livraison fiable, ni le délai de rétractation ni l'invitation à déposer un avis
ne se déclenchent. Deux fonctionnalités dépendent désormais de cette question.

Le délai de conservation est **indéfini**, choix explicite. L'alternative aurait
imposé un statut d'expiration, une tâche de dépublication et une distinction entre
avis expiré et avis retiré, pour aucun bénéfice sur un catalogue de pièces uniques.

### Ce que la revue a trouvé, et ce que j'ai cassé en corrigeant

Deux passes, huit défauts. **Quatre venaient de mes propres corrections**, ce qui
est le chiffre marquant de cette story.

Premier tour, quatre défauts. Le motif de retrait n'avait aucun champ porteur
alors que mon tableau de vérification cochait « couvert ». Aucun horodatage de
décision, donc impossible de savoir combien de temps un avis était resté en ligne.
Le délai de conservation annoncé mais non traité. Et surtout, la décision G ne
tenait pas.

**L'erreur de raisonnement sur la décision G.** J'affirmais qu'on pouvait
regrouper les avis par `referenceFigee` « puisqu'elle est unique par la règle
C2 ». Confusion entre deux propriétés : C2 garantit l'unicité dans la table
`variante` à un instant donné, pas la stabilité d'une copie morte dans le temps.
Une référence libérée puis réattribuée ferait remonter les avis d'une pièce
disparue sur la fiche d'une pièce neuve.

La correction retenue évitait d'ajouter de la structure : une variante ne se
supprime jamais, elle s'archive.

**Et c'est là que j'ai cassé le jalon central.** En ajoutant `archiveeA`, j'ai
créé un second drapeau d'indisponibilité sans dire lequel gagne. La condition de
l'`UPDATE` de réservation d'ADR-006 ne le mentionnait pas : une pièce archivée
restait réservable et payable. Le scénario est banal, l'administratrice archive à
14 h 00, un client ayant la fiche ouverte depuis 14 h 02 paie à 14 h 05.

Corrigé par cinq règles, C15 à C19, et la condition `archivee_a IS NULL` portée
dans `.claude/rules/database.md` pour qu'elle ne se perde pas.

Second défaut introduit : C1, « un produit a au moins une variante », devenait
invérifiable. Un produit actif dont l'unique variante est archivée la satisfait
tout en n'ayant plus rien de vendable.

**Un trou de parcours trouvé par la revue** : modifier un avis publié ne repassait
par aucune relecture. La modération se contournait en deux gestes, déposer un avis
anodin puis le remplacer après publication. Ce n'était pas une faille théorique,
c'était le chemin évident.

### Leçon

Corriger un défaut dans une zone critique en crée souvent un autre. C'est la
deuxième fois de la journée : en LS-12, resserrer une unicité pour fermer une
faille d'idempotence avait interdit les paniers multi-articles.

La parade a fonctionné les deux fois : faire relire les corrections elles-mêmes,
pas seulement le travail initial. Sans la seconde passe, les deux défauts seraient
partis en LS-13.

## Le manquement de la journée, et sa correction

Christophe a demandé en fin de session si la fusion sur `main` avait été faite.
Elle ne l'avait pas été. Six commits, deux stories déclarées terminées sur les
quatre canaux de traçabilité, et rien n'avait quitté la machine.

Cause : le skill `story` s'arrêtait au commit. `CONTRIBUTING.md` exige pourtant
une pull request systématique même en solo, avec fusion en rebase après contrôles
au vert. Les deux documents ne se parlaient pas.

C'est **la troisième fois en deux jours** que le même défaut se manifeste sous une
forme différente. Le 27 juillet, le skill ne se déclenchait pas sur un travail
exploratoire. Ce matin, la règle d'accord au féminin ne portait que sur les textes
visibles et ne se chargeait que sur les fichiers d'interface. Cet après-midi, la
convention de livraison n'était rappelée nulle part au moment de clore.

Une règle rangée au mauvais endroit, ou que rien ne déclenche, ne s'applique pas.

### Corrections

Livraison effectuée : pull request [#1](https://github.com/krismos64/lune-soleil/pull/1),
contrôle GitGuardian attendu, fusion en rebase pour l'historique linéaire, branche
supprimée. Les SHA cités dans les commentaires Jira ont été réécrits par le
rebase : la correspondance a été postée sur LS-12 et LS-37 plutôt que de laisser
des références mortes.

Le skill couvre désormais la livraison, avec la séquence de commandes et quatre
pièges nommés. Son étape 7 passe de trois à quatre questions de contrôle, la
première étant « le travail est-il sur `main` distante ». Les trois autres peuvent
être parfaites pendant que le code dort en local.

Un hook `Stop` avertit en fin de session s'il reste des commits absents de
`origin/main`. Testé sur cinq cas, dont celui d'une branche poussée mais non
fusionnée, qui est le piège suivant : une pull request ouverte puis oubliée laisse
le travail aussi invisible qu'une branche locale.

Le hook avertit sans bloquer, une session pouvant légitimement s'arrêter en cours
de travail.

### Ce qui aurait dû me mettre la puce à l'oreille

Le journal du 27 juillet contient déjà la phrase « une bonne intention documentée
ne suffit pas », écrite après un manquement de même nature. Je l'ai relue ce matin
en écrivant la suite du journal, sans faire le rapprochement avec ma propre
branche non poussée.

## Où on en est

Phase 0, cadrage opérationnel. Dix stories terminées.

| Ticket | Sujet | État |
|---|---|---|
| LS-21 | ADR palette publique | Terminé |
| LS-16 | Jetons de design | Terminé |
| LS-9 | Kickoff des outils | Fait en pratique, reste Confluence à remplir |
| LS-11 | Plan du site et parcours critiques | Terminé, enrichi d'un trente-deuxième cas par LS-12 |
| LS-12 | Modèle conceptuel de données | Terminé : `docs/architecture/MODELE-CONCEPTUEL.md`, six domaines, six décisions |
| LS-13 | Modèle logique de données | À faire, débloqué, prochaine étape |
| LS-14 | Diagramme de séquence de l'achat | À faire, débloqué |
| LS-15 | Filaire mobile création produit admin | À faire |
| LS-17 | Décisions et conventions bloquantes | Terminé |
| LS-10 | Benchmark court | À faire, faible priorité |
| LS-18 | Compte de paiement Stripe | Démarche externe à lancer |
| LS-19 | Médiateur de la consommation | Démarche externe à lancer |
| LS-20 | Photographies | Démarche externe à lancer |
| LS-31 | Agent conteneurisation propre au projet | À faire, phase 1 |
| LS-33 | Source de la date de livraison, point de départ de la rétractation | **Tranché** : Mondial Relay Start, suivi par API. Attention aux deux événements du transporteur |
| LS-34 | Recevoir les factures électroniques fournisseurs | Démarche externe, échéance 1er septembre 2026, portée faible mais obligation maintenue |
| LS-35 | E-reporting du chiffre d'affaires journalier | Échéance 1er septembre 2027, hors ouverture |
| LS-36 | Epic espace client, avis et carnet d'adresses | Créé, en périmètre d'ouverture |
| LS-37 | Étendre le modèle aux avis et au carnet, septième parcours | Terminé : domaine 6, carnet d'adresses, parcours 7 |
| LS-38 | Aligner le modèle sur le périmètre d'ouverture élargi | Terminé : ADR-023, rôles clients, huit défauts corrigés |
| LS-39 | Cohérence du modèle conceptuel après LS-38 | Terminé : `revoqueA`, R20 et R21, sémantique des envois |
| LS-40 | Parcours 8, gestion du carnet d'adresses | Terminé : dernière entité traversée, A7 à A11, V15 |
| LS-41 | Finaliser le modèle avant la traduction logique | Terminé : L221-24, `RECUE` retiré, huit références, L12 et L13 |
| LS-42 | Mode fail-open du script de migration | À faire, avant la première migration de production |
| LS-43 | Deux sessions Checkout payées pour une commande | À faire, avant d'implémenter le paiement |
| LS-44 | Conformité REACH et étiquetage, matières hors UE | À faire, arbitrage de l'exploitante, touche LS-24 |
| LS-27 | Politique commerciale, transporteur et tarifs | **Tranché** : Mondial Relay, 4,10 €, offert à 39 €, retours au client |
| LS-18 | Compte Stripe | En attente du compte bancaire professionnel |
| LS-19 | Médiateur de la consommation | L'exploitante se renseigne |
| LS-20 | Photographies | L'exploitante s'en occupe prochainement |

## LS-38, ce qu'une relecture extérieure a trouvé

Story ouverte en fin de journée, après qu'un rapport d'analyse extérieur a signalé
que plusieurs documents contredisaient encore le nouveau périmètre. Vérification
faite fichier par fichier : les cinq points du rapport étaient exacts, et trois de
plus ont été trouvés en vérifiant.

### La contradiction que LS-37 avait laissée

`Utilisateur` déclarait `enum role "ADMINISTRATRICE"`, valeur unique, et E1 posait
« un seul compte administratrice au lancement ». Le même utilisateur porte pourtant
`AdresseCarnet` en cardinalité obligatoire, l'auteur d'un avis et le propriétaire
de commande. Le carnet exigeait donc un utilisateur qui ne pouvait être que
l'administratrice.

Le modèle était contradictoire depuis LS-37, sans que ni la story ni ses deux
passes de revue ne le voient. Le défaut n'était visible qu'en croisant le domaine 3
et le domaine 7, que les revues avaient regardés séparément.

### Ce que Context7 a changé, deux fois

Le plugin `admin()` de Better Auth stocke les rôles en **chaîne séparée par des
virgules**, pour permettre plusieurs rôles par compte. Une valeur
`CLIENT,ADMINISTRATRICE` n'est pas égale à `ADMINISTRATRICE` : l'index partiel
aurait laissé passer un second compte administrateur. Le plugin paraissait le
choix évident, il était le mauvais.

`minPasswordLength` est une option **globale** de l'instance, pas un réglage par
utilisateur. Les douze caractères que j'avais proposés pour les clients étaient
infaisables sans abaisser le seuil de l'administration, donc sans dégrader un Must
porté par un critère de refus d'ouverture. Seize pour tous, l'alternative écartée
est tracée dans l'ADR et reste renversable.

### Une affirmation technique fausse, prise en flagrant délit

J'avais écrit dans `database.md` que regrouper la bascule d'adresse par défaut en
une seule instruction « ne sauve rien ». La revue a monté un PostgreSQL 18.4 pour
le vérifier. J'ai reproduit sur la même version :

```
SENS A : bascule de 1 vers 2, instruction unique   -> UPDATE 2, COMMIT
SENS B : bascule de 2 vers 1, MEME instruction     -> ERROR duplicate key
```

La même instruction réussit dans un sens et échoue dans l'autre, selon l'ordre de
parcours des lignes. Mon affirmation était fausse dans une règle permanente, et
d'une manière plus nuisible qu'une simple erreur : un développeur qui teste
l'instruction unique la voit marcher, la garde, et elle casse en production quand
la bascule se fait dans l'autre sens.

Leçon : une affirmation technique dans une règle permanente se vérifie sur la base
réelle, elle ne se déduit pas.

### Deux failles de sécurité fermées

**Le renvoi d'invitation laissait l'ancien jeton valide.** `JetonAcces` porte sa
propre expiration, remplacer `InvitationAvis.jetonAccesId` ne touche pas
l'ancienne ligne. Un client qui demande un renvoi le 10 août laisse un jeton actif
jusqu'au 24 : sur une boîte email partagée, le premier lien dépose l'avis à sa
place. Ce n'était pas un cas de panne, c'était le chemin nominal, chaque renvoi
produisant l'orphelin. Règle R19.

**La limitation de débit allait fermer un cas nominal.** ADR-021 la pose sur la
route de connexion, calibrée pour un compte unique. Appliquée par IP aux clients,
elle empêche un client de se connecter parce qu'un autre a échoué sur la même IP,
courant en mobile et en entreprise. Elle se compte désormais par identifiant de
compte. C'est la troisième fois en deux jours qu'une mesure de sécurité ferme un
cas légitime par effet de bord.

### Une garantie qui n'en était pas une

J'avais rangé E11, « le rôle n'est jamais fourni par une entrée client », dans une
colonne « Garantie », à côté de contraintes de base. Or `input: false` ne couvre
que les routes de Better Auth. Une Server Action de mise à jour de profil qui
transmettrait un objet de formulaire à Prisma écrirait `role` sans que Better Auth
soit sur le chemin.

L'index partiel rejetterait l'écriture, un compte d'administration existant déjà,
mais par effet de bord et non par conception : si l'index est oublié en migration,
l'élévation passe. E11 reclassée niveau 3, et le test négatif couvre maintenant la
mise à jour de profil et pas seulement l'inscription.

### Ce que j'ai cassé en corrigeant, encore

Trois des huit défauts des deux passes venaient de mes propres corrections.

En corrigeant le principe directeur, j'ai écrit « toutes les entités décrites ici
servent un parcours du périmètre d'ouverture ». Faux : `AdresseCarnet` n'apparaît
dans aucun parcours, zéro occurrence de « carnet » dans `PARCOURS.md`. La phrase
d'origine était honnête, elle nommait une exception ; la mienne affirmait une
propriété que le document ne vérifie plus.

Et j'avais cru lever la contradiction sur l'entité Client alors que je l'avais
déplacée : le rôle acceptait `CLIENT` pendant que la section expliquant pourquoi
il n'y a pas d'entité Client gardait la prémisse « l'achat sans compte est le seul
mode au lancement ».

C'est la même leçon qu'en LS-12 et LS-37, sous une troisième forme : faire relire
les corrections elles-mêmes, pas seulement le travail initial.

### Point ouvert transmis à LS-13

`AdresseCarnet` n'a subi aucune traversée de parcours, contrairement aux 24 autres
entités. Le champ `libelle` n'a aucun cas d'usage écrit, la règle A5 n'est vérifiée
par aucune étape, et la transaction critique du choix par défaut décrit une
opération dont le déroulement fonctionnel n'existe nulle part.

**Un parcours 8 est à écrire avant que LS-13 ne fige les tables.** L'exception est
déclarée explicitement dans le modèle plutôt que masquée.

## LS-33, une erreur juridique qui dormait dans une règle

Trouvée en relisant le ticket. `.claude/rules/legal.md` posait comme repli, tant
que la source de la date de livraison n'est pas tranchée, de faire courir les
quatorze jours **depuis l'expédition**, en affirmant que le consommateur
bénéficierait d'un délai « plus long que le minimum légal, jamais plus court ».

C'est l'inverse. Le délai court à compter de la réception, article L221-18, et
l'expédition la précède. Expédié le 1er, reçu le 4 : un délai parti du 1er expire
le 15 alors que le minimum légal court jusqu'au 18. Le droit serait éteint trois
jours trop tôt, sur un article dont l'information incorrecte fait passer le délai
à douze mois.

L'origine de la confusion est visible dans le ticket : « fenêtre de rétractation
allongée de deux à quatre jours ». La fenêtre totale est plus large, mais elle
s'ouvre **et se ferme** plus tôt. C'est la fermeture qui compte.

Corrigé séparément, commit `a1b2d27`, avant toute autre chose : une règle chargée
au moment de coder ne pouvait pas attendre la fin des deux stories.

Leçon : « plus favorable au client » est une intuition, pas une démonstration. Un
délai se vérifie sur une date concrète, avec des chiffres.

## LS-39, la cohérence du modèle

Sept défauts, dont trois venus de mes propres corrections.

**Le plus grave venait de LS-38, la story que je venais de clore.** R19 imposait
de révoquer un jeton alors qu'aucun champ ne portait la révocation. Avec `expireA`
et `utiliseA` seuls, la lecture naturelle de « révoquer » est de poser `utiliseA` :
un client suivant son nouveau lien aurait vu « avis déjà déposé » sans rien avoir
déposé.

**Et le manque dépassait l'avis.** `JetonAcces` sert quatre portées. Le parcours 5
et son tableau de couverture ne testaient que l'expiration : un lien de
rétractation révoqué serait resté utilisable. C'est le motif exact du défaut
`archiveeA` de la veille, un drapeau ajouté sans être porté dans toutes les
conditions d'accès.

**Une cardinalité écrite deux fois de travers.** `|o--o|` autorisait une
invitation sans jeton ; ma correction en `|o--||` disait l'inverse dans les deux
sens, un jeton `DOCUMENT` n'ayant aucune invitation et un jeton révoqué non plus.
J'ai fini par vérifier la convention Mermaid contre trois relations du document
dont la nullabilité est connue, au lieu de la supposer.

**Une affirmation technique fausse dans une règle permanente.** J'avais écrit que
regrouper la bascule d'adresse par défaut en une instruction « ne sauve rien ».
Vérifié sur PostgreSQL 18.4 : la même instruction réussit dans un sens de bascule
et échoue dans l'autre, selon l'ordre de parcours des lignes. Plus nuisible qu'une
erreur simple, puisqu'elle marche en développement et casse en production.

## LS-40, ce que la traversée du carnet a révélé

`AdresseCarnet` était la seule entité qu'aucun parcours ne traversait. L'exercice
a produit six règles manquantes et fermé deux failles de données personnelles.

**Les écritures ne portaient aucun recoupement de session.** J'avais écrit
« `utilisateurId` pris dans la session » à l'étape d'ajout seulement. Les trois
opérations qui reçoivent un identifiant n'en portaient aucun. Au tunnel, un
identifiant appartenant à autrui aurait recopié son nom et son adresse dans une
facture téléchargeable.

**La suppression de compte n'était traitée nulle part**, zéro occurrence dans tout
`docs/`. La décision diverge selon l'entité : le carnet en cascade, la commande
jamais. Une politique oubliée vaut `RESTRICT` et bloquerait toute demande
d'effacement ; une cascade posée par réflexe détruirait des factures.

**Et ma correction a ouvert une fuite.** La règle A10 dissociait les commandes en
remettant `utilisateurId` à nul. Or le parcours 6 définit l'éligibilité au
rattachement par « commandes sans propriétaire » : une adresse email réattribuée
par un fournisseur d'accès, ou connue d'un tiers, rouvrait l'historique complet
d'un client parti. Champ `dissocieA`, et le cas d'erreur du parcours 6 qui
affirmait « ne peut jamais changer de propriétaire » a été corrigé, cette
propriété étant devenue fausse en deux temps.

**Un champ mort que je documentais au lieu de le trancher.** `libelle` était
déclaré « sans rôle fonctionnel » et conservé, ce qui contredit le principe
interdisant les champs sans usage. Deux issues seulement : lui donner son rôle ou
le supprimer. Documenter un champ mort n'en est pas une.

### Ce que ces trois stories disent du rythme

Onze défauts sur les trois viennent de mes propres corrections. La parade a
fonctionné à chaque fois, une seconde passe de revue portant sur les corrections
elles-mêmes. Sans elle, chacun serait parti en LS-13.

Deux affirmations techniques ont été prises en défaut par une vérification sur
base réelle, pas par un raisonnement. C'est devenu la règle : une affirmation
destinée à un document permanent se teste.

## LS-41, la seconde erreur juridique de la journée

Une relecture croisée a signalé que la règle L7 était fausse. Vérification faite
sur Légifrance : l'article L221-24 permet de différer le remboursement « jusqu'à
récupération des biens **ou** jusqu'à ce que le consommateur ait fourni une preuve
de l'expédition, la date retenue étant celle du **premier** de ces faits ».

Le modèle posait l'inverse, un remboursement conditionné à la seule réception.
Colis renvoyé le 3 avec numéro de suivi, colis perdu, remboursement dû depuis le 3
et bloqué indéfiniment. Aucun champ ne portait la preuve d'expédition, d'où un
défaut structurel et pas seulement rédactionnel.

**Le point commun avec l'erreur de LS-33** : j'avais vérifié les délais aux
sources, jamais les conditions qui les déclenchent. Deux fautes en une journée
dans le même domaine, sur la même méthode incomplète.

### Deux défauts créés par mes propres corrections, en cascade

**Le premier a cassé la réintégration du stock.** En ajoutant
`EXPEDITION_PROUVEE`, j'ai rendu le statut `RECUE` inatteignable : preuve le 4,
remboursement le 6, colis arrivé le 24. Il aurait fallu faire régresser une
demande `REMBOURSEE`, ou renseigner `recueA` en contradiction avec son statut.

`RECUE` sort donc de l'enum. La réception devient un fait porté par `recueA`
seul, parce qu'elle survient avant, pendant ou longtemps après le remboursement.
C'est la traduction directe de S8, qui disait déjà que la réintégration dépend du
retour physique et de rien d'autre.

Au passage, un cas de perte sèche devenait visible : une demande `REMBOURSEE`
sans `recueA` signifie une pièce sortie du stock et jamais revenue. Le journal des
mouvements montrerait une vente web, un avoir total, et rien qui explique où est
passée la pièce. Règle L13.

**Le second a fermé un chemin nominal.** Sans `RECUE`, une demande reçue **sans**
preuve d'expédition n'avait plus aucune transition vers le remboursement. Retour
déposé en point relais, sans numéro de suivi transmis : cas courant. La revue a
nommé le piège que cela aurait produit, renseigner `preuveExpeditionA` pour
débloquer la machine à états, donc inscrire une preuve qui n'a jamais existé dans
un champ à valeur probatoire.

### Une décision d'exploitation tranchée dans la foulée

Corriger L7 a ouvert un cas que personne n'avait envisagé : la pièce arrive
**endommagée alors que le remboursement est déjà versé** et l'avoir émis, donc
immuable. L'ajustement du montant n'est plus disponible.

Christophe a tranché le jour même : **la perte est assumée**, aucune créance, rien
n'est réclamé au client. Sur des pièces uniques à faible volume, poursuivre pour
la différence coûterait plus que la pièce.

Ce qui compte pour la suite est moins la décision que sa trace. Le modèle reste
silencieux sur ce point, et ce silence est désormais écrit comme délibéré aux deux
endroits concernés. Sans cela, une relecture ultérieure l'aurait pris pour un
oubli et aurait proposé de modéliser une créance, comme elle a proposé de
modéliser tout le reste.

### Une affirmation technique fausse, la troisième de la journée

J'affirmais que Prisma ne génère pas les index partiels. Faux, la fonctionnalité
`partialIndexes` existe en avant-première. Le SQL manuel reste défendable comme
**choix de stabilité**, pas comme impossibilité, et l'ADR demande désormais de
revérifier ce statut au moment de LS-13.

Les mentions sur les `CHECK` restent vraies, Prisma ne les génère toujours pas.

### Ce que trois relectures croisées ont produit

LS-38 à LS-41 ont corrigé une trentaine de défauts. La proportion qui compte :
**une quinzaine venaient de mes propres corrections**, jamais du travail initial.

La parade a fonctionné à chaque fois, une seconde passe de revue portant sur les
corrections elles-mêmes. Sans elle, chacun serait parti en migration.

Trois affirmations techniques ont été prises en défaut par une vérification sur
base réelle ou sur documentation officielle, aucune par un raisonnement.

## Séance avec l'exploitante, fin de journée

Christophe a vu Stacy et a tranché sept sujets qui l'attendaient depuis le
cadrage. Deux relevaient d'une décision commerciale, cinq de démarches.

### Décisions commerciales

| Sujet | Décision |
|---|---|
| Transporteur | Mondial Relay, offre Start, Point Relais et Locker, suivi par API |
| Frais de port | 4,10 € TTC |
| Livraison offerte | à partir de 39 € |
| Minimum de commande | aucun |
| Frais de retour en rétractation | à la charge du client |

Tracé sur LS-27 et LS-33. Le suivi automatique par API était l'option
recommandée : la date vient du transporteur, donc elle est opposable en cas de
litige, là où une case cochée à la main ne prouve rien.

### Le piège que le choix du transporteur introduit

Mondial Relay produit **deux événements distincts** : « disponible au Point
Relais » et « remis au destinataire ». Seul le second renseigne `Expedition.livreA`.

Un colis peut rester une semaine en relais avant retrait. Prendre le premier
événement ferait courir le délai de rétractation trop tôt et éteindrait le droit
du client avant terme, avec le risque des douze mois de l'article L221-20.

Porté dans `.claude/rules/legal.md` plutôt que dans le seul ticket : c'est le
genre de nuance qui se perd entre l'arbitrage et le code.

### Une décision légale seulement sous condition

Les frais de retour à la charge du client sont autorisés, **à condition d'en
informer le client avant sa commande**, article L221-23 vérifié aux sources. À
défaut ils reviennent au vendeur, et la charge de la preuve pèse sur lui.

La mention doit apparaître dans le tunnel de commande, pas seulement dans les
conditions générales que personne ne lit. C'est l'emplacement qu'on oublie.

### Un sujet nouveau, ouvert par une réponse anodine

Stacy achète ses matières premières sur Temu. Cette information, donnée en
passant pour justifier qu'elle ne tient pas de comptabilité détaillée, ouvre un
sujet que le cadrage n'avait pas vu.

**Assembler des composants achetés hors Union européenne fait d'elle la
responsable du produit fini sur le marché français.** La DGCCRF impose de pouvoir
justifier la conformité REACH en cas de contrôle, plomb, nickel et cadmium, et
d'afficher les matériaux sur les fiches produits.

Le nickel est le premier allergène de contact en Europe, et les boucles d'oreilles
touchent une peau percée. Une vente en ligne laisse par ailleurs une trace écrite
qu'un marché ne laisse pas.

Ticket **LS-44**, avec trois voies à arbitrer : justificatifs du fournisseur,
test en laboratoire, ou changement de source. Aucun développement, mais cela
touche le contenu des fiches produits, LS-24.

### Ce que sa réponse ne changeait pas

Elle ne tient pas de comptabilité précise et souhaitait écarter LS-34. La
franchise en base ne dispense pourtant pas de pouvoir **recevoir** une facture
électronique au 1er septembre 2026. La portée reste faible ici, Temu n'étant pas
soumis au dispositif français, mais un fournisseur français d'emballages le
serait. Ticket laissé ouvert avec cette nuance.

### Leçon de la séance

Deux des points les plus utiles ne figuraient dans aucun ordre du jour. Ils sont
venus d'une réponse de contexte, l'origine des matières, et d'une conséquence
légale attachée à un choix commercial apparemment neutre.

## Prochaine étape

**LS-13**, le modèle logique. Toutes les entités du modèle sont traversées par au
moins un parcours, huit parcours et cinquante-sept cas d'erreur.

LS-12, LS-37, LS-38, LS-39, LS-40 et LS-41 lui transmettent un modèle complet,
sept domaines, et un récapitulatif de contraintes rangé en trois niveaux qui est
la partie devant survivre en migration.

Trois points appellent une vigilance particulière en migration, parce qu'ils ne
font échouer aucun test s'ils sont oubliés : l'index partiel de l'administratrice,
les politiques de suppression des **huit** références vers `Utilisateur`, et les
contraintes `CHECK` que Prisma ne génère pas.

Ce que LS-13 doit traiter :

- traduire les contraintes des trois niveaux en schéma Prisma et migration SQL
- les entités Better Auth pour l'administratrice, ADR-021, **et les clients**,
  ADR-023
- le format des numéros : `F-2026-0001` tranché pour les factures, à décliner pour
  les commandes et les avoirs, séquence distincte par type
- la forme de stockage des blocs figés, adresse et instantané légal, en colonnes
  ou en document structuré
- les types, avec **Context7 obligatoire** : Prisma 7 est une majeure récente
- rappel d'ADR-006 : Prisma ne génère pas les `CHECK`, migration SQL manuelle
- **revérifier le statut de `partialIndexes`**, en avant-première au 28 juillet.
  Le SQL manuel de l'index partiel est un choix de stabilité, il se rejoue si la
  fonctionnalité est devenue stable

Deux paramètres d'exploitation restent à confirmer, sans bloquer : libération des
réservations toutes les 5 minutes, réconciliation toutes les 15 minutes.

Un point ouvert qui ne bloque pas LS-13 mais qu'il faut discuter avec
l'exploitante : **LS-33**, d'où vient la date de livraison. Elle conditionne
désormais deux fonctionnalités visibles, le délai de rétractation et l'invitation
à déposer un avis.

## Seconde partie de session, périmètre et vérifications juridiques

Christophe a posé une série de questions sur la suite. Deux ont exigé une
vérification aux sources officielles, trois ont produit un arbitrage de
périmètre.

### Facture électronique, vérifiée

Je ne savais pas répondre et je l'ai dit plutôt que d'improviser. Vérification
faite sur les fiches 2 et 7 de la DGFiP, mises à jour juin 2026.

**Les ventes aux particuliers ne relèvent pas de la facturation électronique.**
L'obligation vise les opérations entre entreprises. Les factures clients restent
générées par le site. Stripe n'y participe pas.

Au 1er septembre 2026, une seule obligation : pouvoir **recevoir** les factures
électroniques des fournisseurs, ce qui est une démarche administrative. Au 1er
septembre 2027, e-reporting du chiffre d'affaires journalier, en données
globalisées, sans aucune donnée personnelle transmise.

J'avais suggéré que la franchise en base pourrait exonérer de tout. C'est faux :
la fiche 2 dit que ces entreprises restent assujetties. Ce qui écarte
l'obligation d'émission, c'est la nature B2C de l'activité et le calendrier
échelonné. Tickets LS-34 et LS-35.

### Rétractation, vérifiée

Quatorze jours à compter de la **réception du bien**, article L221-18. Le calcul
n'est pas un simple ajout : le jour de réception ne compte pas, et l'échéance est
reportée au premier jour ouvrable si elle tombe un samedi, un dimanche ou un jour
férié, article L221-19. Le calendrier des jours fériés est donc nécessaire côté
serveur.

Le risque le plus coûteux est l'article L221-20 : sans information correcte du
consommateur, le délai passe à douze mois et quatorze jours. Détail porté sur
LS-6 et dans la nouvelle règle `legal.md`.

### Périmètre d'ouverture élargi

Christophe décide que l'espace client, les avis vérifiés et le carnet d'adresses
entrent **avant l'ouverture**. Motif : la crédibilité du site, et l'autonomie des
clients sur leur historique, leurs factures et leur suivi si un email échoue.

J'avais recommandé l'inverse, ouvrir sans et livrer juste après, en avançant que
la charge augmente et que l'authentification élargit la surface d'attaque avant
le durcissement. Recommandation non retenue, l'arbitrage appartient à Christophe.
Décision appliquée, epic LS-36 créé, LS-8 réduit de 70 h à 38 h.

Le modèle conceptuel tient : `Commande.utilisateurId` et le parcours 6 avaient
été prévus pour cela. Deux ajouts reviennent à LS-13, l'entité Avis et la table
Adresse du carnet.

L'avoir commercial, un solde à dépenser sur le site, est écarté explicitement.
Aucun ticket créé.

### Une question laissée ouverte volontairement

Christophe a demandé comment le délai de rétractation démarrerait
automatiquement. La réponse honnête : ce n'était pas prévu. Le modèle porte une
date de livraison « sur source fiable » sans définir la source.

Trois options, du suivi automatique par API transporteur au repli sur la date
d'expédition. Le choix dépend du transporteur retenu, décision commerciale qui
appartient à l'exploitante. Christophe a demandé de ne pas trancher maintenant et
de le lui rappeler : ticket LS-33, mémoire, et point ouvert inscrit dans les deux
documents d'architecture.

Ça ne bloque pas LS-13, le modèle stocke la date quelle que soit sa provenance.

### Une story intercalée plutôt qu'un ticket rouvert

Christophe a demandé si LS-12 et le modèle devaient être rouverts du fait des
trois fonctionnalités qui entrent en périmètre.

Réponse tranchée : non pour LS-12, oui pour une partie du modèle. LS-12 demandait
un modèle couvrant les scénarios critiques, et il les couvre. Rouvrir un ticket
clos parce que le périmètre s'élargit ensuite brouille la traçabilité, on ne sait
plus ce qui a été livré quand.

Le modèle en revanche est incomplet sur deux points. L'espace client était déjà
couvert, `Commande.utilisateurId` et le parcours 6 ayant été prévus pour ça. Mais
le carnet d'adresses est décidé sans être dessiné, et l'entité Avis n'existe nulle
part.

J'avais d'abord renvoyé ces deux ajouts à LS-13. C'était une erreur de niveau :
LS-13 traduit un modèle conceptuel en schéma physique, il ne le conçoit pas. Lui
demander de dessiner deux entités jamais modélisées ferait passer des décisions
structurantes sans le cadre de revue que LS-12 a suivi, ce qui est exactement le
manquement du 27 juillet sous une autre forme.

**LS-37 créé**, intercalé entre LS-12 et LS-13, avec les liens de blocage posés.
Il produit l'entité Avis, la table Adresse et un septième parcours dans
`PARCOURS.md`, avec ses cas d'erreur et la revue critique.

Une décision d'ancrage tranchée à cette occasion : **l'avis est rattaché à une
ligne de commande**, pas au produit. La ligne est la preuve d'achat, structurelle
plutôt que déclarative. Deux achats de la même pièce permettent deux avis, et
archiver un produit n'invalide aucun avis puisque la ligne porte sa copie figée.

La contrepartie, signalée dans le ticket : regrouper les avis sur une fiche
produit suppose de remonter par `LigneCommande.varianteId`, nullable par
conception. Le cas nul devra être traité explicitement, sinon un avis devient
invisible sur la fiche du produit concerné.

Le commentaire posté sur LS-13 quelques minutes plus tôt a été corrigé, il
annonçait ces entités comme siennes.

### Configuration Claude Code revue

Trois modifications, validées avec Christophe.

`database.md` et `payments.md` affirmaient que l'unicité de l'identifiant
d'événement Stripe suffit à garantir l'idempotence. LS-12 a prouvé le contraire.
Les deux règles portent désormais les quatre clés et le scénario du webhook
tardif. Sans cette correction, le trou aurait été réintroduit au moment de coder
le webhook, dans la phase la plus risquée du projet.

Nouvelle règle `legal.md`, ciblée sur les chemins de rétractation et de
facturation, portant les délais vérifiés avec leurs articles. Motif : les valeurs
vivaient dans Jira et en mémoire, donc nulle part au moment de coder. C'est
exactement le manquement d'hier, une règle que rien ne déclenche ne s'applique
pas.

### Une correction que j'ai dû faire deux fois

Christophe m'avait signalé le 27 juillet de ne pas accorder au féminin. J'ai
écrit « clientes » partout dans une réponse le 28. La règle existait dans
`frontend-design.md` mais ne portait que sur les textes visibles, et cette règle
ne se charge que sur les fichiers d'interface.

Corrigé en la remontant dans le CLAUDE.md, chargé à chaque session, avec une
portée explicite : interface, documentation, commentaires, Jira et réponses de
conversation. Treize occurrences corrigées dans les documents d'architecture,
quatre dans les règles.

Leçon, la même qu'hier sous une autre forme : une règle rangée au mauvais niveau
ne se déclenche pas quand il faudrait.

## À noter pour plus tard

Le MCP Atlassian signale que le transport HTTP+SSE n'est plus supporté depuis le
30 juin 2026, et la session en cours passe encore par lui. La migration vers
`/v1/mcp` avait été faite le 27 juillet, la configuration est donc à revérifier.
Sans effet sur le travail d'aujourd'hui, les appels Jira ont tous abouti.
