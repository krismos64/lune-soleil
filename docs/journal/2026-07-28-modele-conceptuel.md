# 28 juillet 2026, modèle conceptuel de données

Session consacrée à LS-12. Un livrable, `docs/architecture/MODELE-CONCEPTUEL.md`,
et une correction de `PARCOURS.md`.

## Fait

**Modèle conceptuel écrit et validé sur les six parcours.** Six domaines,
catalogue, stock, vente, comptabilité, légal, exploitation. Sept diagrammes
Mermaid, tous rendus sans erreur par `mermaid-cli` 11.16.0 avant commit.

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

## Où on en est

Phase 0, cadrage opérationnel. Cinq stories terminées sur treize.

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
| LS-33 | Source de la date de livraison, point de départ de la rétractation | **À trancher avec l'exploitante**, ne bloque pas LS-13 |
| LS-34 | Recevoir les factures électroniques fournisseurs | Démarche externe, échéance 1er septembre 2026 |
| LS-35 | E-reporting du chiffre d'affaires journalier | Échéance 1er septembre 2027, hors ouverture |
| LS-36 | Epic espace client, avis et carnet d'adresses | Créé, en périmètre d'ouverture |
| LS-37 | Étendre le modèle aux avis et au carnet, septième parcours | **Prochaine étape**, bloque LS-13 |

## Prochaine étape

**LS-37**, l'extension du modèle conceptuel aux avis et au carnet d'adresses,
avec le septième parcours. Il bloque LS-13, décidé en fin de session.

**Puis LS-13**, le modèle logique. Le modèle conceptuel lui transmet un
récapitulatif de contraintes rangé en trois niveaux, qui est la partie du
document qui doit survivre en migration.

Points ouverts qui lui reviennent : le format des numéros de commande, facture et
avoir ; la forme de stockage des blocs figés, adresse et instantané légal, en
colonnes ou en document structuré ; les types Prisma, où Context7 sera consulté,
Prisma 7 étant une majeure récente.

Les paramètres d'exploitation restent à confirmer ensemble plutôt qu'un par un :
expiration de réservation à 30 minutes, libération toutes les 5 minutes,
réconciliation toutes les 15 minutes, seuil d'alerte sur un retour non reçu. Le
modèle les rend configurables, il persiste `expireA` et non une durée.

Le calcul du délai de rétractation reste à vérifier aux sources officielles avant
l'ouverture, il n'appartient pas au modèle.

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
