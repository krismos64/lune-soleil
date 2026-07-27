# Parcours critiques

Séquences d'états des six parcours critiques du projet, cas d'erreur compris.

Ce document ne décrit aucun écran. Il décrit ce qui est **persisté** à chaque
étape, ce que **voit l'utilisatrice**, et ce qui se passe quand ça échoue. Il
sert de contrat d'entrée au modèle conceptuel de données (LS-12) : tout état
mentionné ici doit avoir sa place dans le modèle, sans invention de champ
manquant.

| Champ | Valeur |
|---|---|
| Ticket | LS-11 |
| Source | Cahier des charges V1.0, sections 9, 11 et 15.5 |
| Débloque | LS-12 modèle conceptuel, LS-14 diagramme de séquence |

## Pourquoi six parcours et non cinq

Le plan directeur exige en section 4.4 que le modèle logique soit « validé sur
les cinq scénarios critiques sans invention de champ manquant », sans jamais
énumérer ces cinq scénarios.

Deux listes existent dans le cahier des charges. La section 9 décrit cinq
parcours orientés utilisateur. La section 15.5 liste six transactions critiques
orientées données. Elles ne se recouvrent pas entièrement : le rattachement d'une
commande sans compte à un compte vérifié est une transaction critique qui
n'apparaît dans aucun parcours.

Décision : les cinq parcours de la section 9, plus le rattachement de commande en
sixième. Le rattachement appartient à la V1 cible, mais le modèle de données doit
le prévoir dès maintenant, faute de quoi il faudra une migration sur des données
historiques.

Les six parcours couvrent ainsi les six transactions critiques de la section 15.5.

## Conventions de lecture

Les statuts sont écrits en majuscules, conformément à la section 11 du cahier des
charges. `Base` désigne ce qui est écrit et doit survivre à un redémarrage.
`Vue` désigne ce que perçoit l'utilisatrice. `Tâche` désigne un traitement
planifié qui interviendra plus tard.

---

## Parcours 1, achat de référence

Le parcours central du projet. Sa réussite de bout en bout sur une variante en
stock à un exemplaire est le jalon technique majeur.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Consultation du catalogue | rien | produits actifs, disponibilité dérivée |
| 2 | Ajout au panier | ligne de panier, éphémère | panier mis à jour, compteur |
| 3 | Revalidation serveur | rien | totaux recalculés depuis le serveur |
| 4 | Réservation de stock | `quantiteReservee` incrémentée, ligne de réservation avec expiration à 30 min | passage au paiement |
| 5 | Commande en attente | commande `EN_ATTENTE_PAIEMENT`, lignes historisées, acceptation CGV horodatée | récapitulatif |
| 6 | Session de paiement | identifiant de session prestataire rattaché à la commande | redirection |
| 7 | Événement signé reçu | événement persisté avec identifiant unique, paiement `REUSSI`, commande `CONFIRMEE`, réservation convertie en mouvement de stock, `quantitePhysique` décrémentée | page de confirmation |
| 8 | Facture | facture avec numéro attribué dans la transaction, instantané légal, PDF | facture disponible |
| 9 | Emails | journal d'envoi, deux entrées | commande payée, facture |
| 10 | Préparation | commande `EN_PREPARATION`, historique de statut | suivi |
| 11 | Expédition | expédition avec transporteur, numéro de suivi, commande `EXPEDIEE` | email et lien de suivi |
| 12 | Livraison | commande `LIVREE` uniquement sur source fiable | suivi |

Les étapes 4 à 7 sont transactionnelles. L'étape 7 est idempotente par contrainte
d'unicité sur l'identifiant d'événement.

### Cas d'erreur

**Stock insuffisant à la réservation, étape 4**
Base : aucune écriture, l'`UPDATE` conditionnel ne retourne aucune ligne.
Vue : « cette pièce vient d'être vendue », message métier et non erreur technique.
Le panier est conservé, la ligne concernée signalée.

**Prix ou produit modifié entre l'ajout au panier et la revalidation, étape 3**
Base : aucune écriture.
Vue : récapitulatif corrigé, nouveau prix affiché, confirmation demandée avant de
poursuivre. Le navigateur n'est jamais source de vérité.

**Abandon du paiement, la cliente ferme l'onglet**
Base : commande reste `EN_ATTENTE_PAIEMENT`, réservation active.
Vue : rien.
Tâche : libération des réservations expirées toutes les cinq minutes, la
réservation disparaît à 30 minutes et `quantiteReservee` est décrémentée. La
commande est ensuite régularisée par la réconciliation.

**Paiement refusé par le prestataire**
Base : paiement `ECHOUE`, commande reste `EN_ATTENTE_PAIEMENT`, réservation
maintenue jusqu'à expiration.
Vue : message de refus, possibilité de réessayer avec le panier intact.
Tâche : même libération à expiration.

**Événement de paiement jamais reçu, panne réseau ou prestataire**
Base : commande figée en `EN_ATTENTE_PAIEMENT` alors que la cliente a payé.
Vue : incertitude côté cliente, c'est le cas le plus délicat.
Tâche : réconciliation toutes les quinze minutes, interrogation du prestataire
pour toute commande en attente depuis plus de soixante minutes. Si le paiement
existe, la commande est régularisée comme à l'étape 7.

**Événement reçu deux fois, rejeu**
Base : la contrainte d'unicité sur l'identifiant d'événement rejette le second.
Aucun effet métier supplémentaire : pas de seconde facture, pas de second
mouvement de stock, pas d'email dupliqué.
Vue : rien.

**Signature d'événement invalide**
Base : rejet avant tout effet métier, journalisation de la tentative.
Vue : rien.

**Échec d'envoi d'email, étape 9**
Base : la commande et la facture existent, le journal d'envoi porte l'échec avec
son motif.
Vue : la cliente ne reçoit rien, mais sa commande est valide et ses documents
accessibles par lien signé.
Suite : l'administratrice voit l'échec dans l'administration et peut renvoyer.
Une panne d'email ne bloque jamais une commande.

**Génération de facture en échec**
Base : commande `CONFIRMEE`, paiement `REUSSI`, aucune facture.
Vue : commande confirmée.
Suite : alerte critique persistée, acquittable. La facture est régénérée sans
recréer la commande. Le numéro n'est attribué qu'à la création réussie, aucun
trou dans la séquence.

---

## Parcours 2, stock en situation de marché

Le parcours qui distingue ce projet d'une boutique en ligne ordinaire. Les mêmes
pièces sont vendues en ligne et sur des marchés physiques.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Avant le marché, suspension de la vente web | `venteWebActivee` à faux, entrée au journal d'audit | produit visible, non achetable |
| 2 | Vente en main propre sur le marché | contrôle qu'aucune réservation n'est active | formulaire de vente externe |
| 3 | Enregistrement | mouvement de stock de type vente externe avec canal, `quantitePhysique` décrémentée | stock à jour |
| 4 | Pièce invendue, retour | `venteWebActivee` à vrai, aucun mouvement de stock | produit à nouveau achetable |

Suspendre la vente web ne crée **aucun** mouvement de stock. Seule une vente
réelle décrémente la quantité physique.

### Cas d'erreur

**Réservation active au moment de la vente externe, étape 2**
C'est la faille que le cahier des charges identifie explicitement. Une cliente
paie en ligne pendant que la même pièce se vend sur le marché.
Base : aucune écriture, la vente externe est refusée.
Vue : message explicite indiquant qu'une cliente est en cours de paiement, avec
proposition d'annuler la réservation après confirmation.
Si l'administratrice confirme l'annulation : la réservation est libérée,
`quantiteReservee` décrémentée, et la vente externe peut alors être enregistrée.
La cliente en ligne verra son paiement échouer à la conversion.

**Stock physique déjà à zéro**
Base : aucune écriture, la contrainte `CHECK` l'empêcherait de toute façon.
Vue : refus, stock déjà épuisé.

**Produit en rupture consulté en ligne**
Base : rien.
Vue : la fiche reste consultable, l'ajout au panier est impossible. Le produit
n'est jamais masqué, seulement rendu non achetable.

---

## Parcours 3, création de produit

Le parcours de l'administratrice, réalisé au smartphone. Cible : moins de trois
minutes, photographies comprises.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Nouveau produit | produit `BROUILLON` | formulaire |
| 2 | Informations et catégorie | produit mis à jour | aperçu |
| 3 | Variante | variante avec référence unique, prix, `quantitePhysique`, `quantiteReservee` à zéro | ligne de variante |
| 4 | Téléversement des photographies | média avec identifiant fournisseur, métadonnées supprimées, orientation corrigée, déclinaisons générées | progression puis vignettes |
| 5 | Texte alternatif | média mis à jour | champ obligatoire |
| 6 | Choix du média principal | ordre des médias | vignette principale |
| 7 | Publication | produit `ACTIF` | visible dans le catalogue |

La suppression des métadonnées à l'étape 4 est une exigence de sécurité : les
photographies prises au smartphone contiennent la position GPS du domicile de
l'exploitante.

### Cas d'erreur

**Référence de variante déjà utilisée, étape 3**
Base : aucune écriture, contrainte d'unicité.
Vue : message indiquant que la référence existe déjà, avec le produit concerné.

**Téléversement interrompu, étape 4**
Base : aucun média créé, ou média orphelin si l'interruption survient après
l'envoi au fournisseur.
Vue : progression arrêtée, possibilité de reprendre.
Suite : les médias orphelins sont purgés par la tâche de nettoyage.

**Traitement des métadonnées en échec**
Base : le média n'est **pas** publié.
Vue : erreur explicite, la publication est refusée.
Aucune image n'est jamais servie publiquement sans traitement. C'est un blocage,
pas un avertissement.

**Publication tentée sans média principal ou sans texte alternatif, étape 7**
Base : le produit reste `BROUILLON`.
Vue : la publication est refusée, le champ manquant est indiqué.

**Archivage d'un produit déjà commandé**
Base : produit `ARCHIVE`, les lignes de commande historiques ne changent pas.
Vue : produit retiré du catalogue, commandes passées intactes.
Une commande ne dépend jamais du catalogue actuel.

---

## Parcours 4, facture et remboursement

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Paiement confirmé | déclenché par le parcours 1, étape 7 | rien |
| 2 | Facture | numéro attribué dans la transaction, instantané légal, mention de franchise en base | facture disponible |
| 3 | Envoi | journal d'envoi | email avec facture |
| 4 | Remboursement décidé | rien encore | formulaire |
| 5 | Remboursement exécuté | paiement `PARTIELLEMENT_REMBOURSE` ou `REMBOURSE` | statut mis à jour |
| 6 | Avoir | avoir avec numéro propre, séquence distincte, référence à la facture initiale | avoir disponible |
| 7 | Réintégration de stock | mouvement de stock de type retour, si la pièce revient réellement | stock à jour |

La facture initiale n'est **jamais** modifiée ni supprimée. Un remboursement
produit un avoir, il ne corrige pas la facture.

### Cas d'erreur

**Remboursement refusé par le prestataire, étape 5**
Base : le statut de paiement ne change pas, la tentative est journalisée.
Vue : message d'échec, possibilité de réessayer.
Aucun avoir n'est créé tant que le remboursement n'est pas effectif.

**Échec de transaction pendant l'attribution du numéro, étape 2 ou 6**
Base : rollback complet, aucun numéro consommé.
Vue : erreur, nouvelle tentative possible.
Le numéro étant attribué dans la transaction, un échec ne crée pas de trou dans
la séquence.

**Remboursement partiel puis second remboursement**
Base : paiement passe de `PARTIELLEMENT_REMBOURSE` à `REMBOURSE`, un second
avoir est créé, référençant la même facture initiale.
Vue : deux avoirs distincts.

**Pièce non retournée malgré le remboursement, étape 7**
Base : aucun mouvement de stock.
Vue : rien.
La réintégration dépend du retour réel, jamais du remboursement seul.

**Génération du PDF en échec**
Base : le document existe en base avec son numéro, le PDF manque.
Vue : document annoncé mais non téléchargeable.
Suite : alerte critique, régénération du PDF sans réattribuer de numéro.

---

## Parcours 5, rétractation

Obligation légale depuis le 19 juin 2026, article L221-21 du Code de la
consommation. Son absence prolonge le délai de rétractation de douze mois.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Accès à la fonctionnalité | rien | lien visible et permanent, disponible pendant tout le délai légal |
| 2 | Identification du contrat | vérification du jeton signé ou de la session | commande identifiée |
| 3 | Déclaration | rien encore | formulaire, motif facultatif |
| 4 | Confirmation non ambiguë | demande de rétractation `DEPOSEE` | récapitulatif |
| 5 | Accusé de réception | demande `ACCUSEE`, journal d'envoi, horodatage conservé | email sur support durable |
| 6 | Attente du retour | demande `RETOUR_ATTENDU` | instructions de retour |
| 7 | Réception du colis | demande `RECUE` | confirmation |
| 8 | Remboursement | demande `REMBOURSEMENT_EN_COURS` puis `REMBOURSEE`, avoir si nécessaire | remboursement |
| 9 | Réintégration de stock | mouvement de retour selon l'état réel de la pièce | stock à jour |

### Cas d'erreur

**Jeton expiré ou modifié, étape 2**
Base : aucune écriture, la tentative est journalisée.
Vue : refus sécurisé, sans révéler si la commande existe.
Un numéro de commande seul n'identifie jamais un contrat.

**Délai légal dépassé**
Base : aucune demande créée.
Vue : message indiquant que le délai est écoulé, avec la date de fin.
Le calcul du délai doit être vérifié aux sources officielles avant l'ouverture.

**Échec d'envoi de l'accusé de réception, étape 5**
Base : la demande reste `DEPOSEE`, l'échec est journalisé.
Vue : la cliente a confirmé mais ne reçoit rien.
Suite : alerte critique. L'accusé sur support durable est une obligation légale,
son échec doit être traité en priorité, pas simplement journalisé.

**Colis jamais reçu**
Base : la demande reste `RETOUR_ATTENDU`.
Vue : en attente.
Suite : signalement à l'administratrice au-delà d'un seuil d'ancienneté. Aucun
remboursement automatique sans réception.

**Pièce retournée endommagée**
Base : demande `RECUE`, montant de remboursement ajusté selon le droit
applicable, motif documenté.
Vue : explication du montant.
Aucune exclusion automatique n'est codée. Les exceptions relèvent du droit
applicable et de la caractéristique concrète du produit, jamais d'une règle
codée en dur pour les boucles d'oreilles.

**Refus de la rétractation**
Base : état refusé avec motif documenté obligatoire.
Vue : motif communiqué.

---

## Parcours 6, rattachement d'une commande à un compte

V1 cible. Le modèle de données doit néanmoins le prévoir dès maintenant, faute de
quoi le rattachement exigera une migration sur des commandes historiques.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Création de compte | utilisateur avec email non vérifié | formulaire |
| 2 | Vérification de l'email | utilisateur vérifié, jeton consommé | confirmation |
| 3 | Recherche des commandes éligibles | lecture seule, commandes sans propriétaire dont l'email normalisé correspond | liste proposée |
| 4 | Rattachement | commandes rattachées au compte, entrée au journal d'audit | historique visible |

Le rattachement n'est possible que sur des commandes **sans propriétaire** et
après vérification de la **même adresse email normalisée**.

### Cas d'erreur

**Email non vérifié, étape 3**
Base : aucune écriture.
Vue : rattachement indisponible tant que l'email n'est pas vérifié.

**Commande appartenant déjà à un autre compte**
Base : aucune écriture.
Vue : la commande n'apparaît pas dans la liste éligible.
Une commande déjà rattachée ne peut jamais changer de propriétaire par ce
parcours.

**Tentative de rattachement par identifiant fourni**
Base : refus, tentative journalisée.
Vue : refus sécurisé.
L'éligibilité est calculée côté serveur depuis la session, jamais depuis un
identifiant transmis par la cliente.

---

## Ce que ces parcours imposent au modèle de données

Synthèse pour LS-12. Chaque élément apparaît dans au moins un parcours ci-dessus.

**États à persister** : statut de commande et statut de paiement séparés, statut
de produit, statut de demande de rétractation, statut de message, statut d'alerte
critique.

**Historisation obligatoire** : lignes de commande figées avec prix et libellés,
instantané légal de facture et d'avoir, historique des transitions de statut avec
acteur et date, journal des mouvements de stock immuable.

**Unicité contrainte** : référence de variante, numéro de commande, numéro de
facture, numéro d'avoir, identifiant d'événement fournisseur, nom de verrou de
tâche planifiée, `slug` de produit.

**Expiration** : réservation de stock, jeton de rétractation, lien signé de
document, jeton de vérification d'email.

**Traces** : journal d'audit pour les actions administratives sensibles, journal
des envois d'email, alertes critiques acquittables.

**Champs prévus mais inutilisés au lancement** : propriétaire de commande, pour
le rattachement en V1 cible. Champs fiscaux à zéro, tant que la franchise en base
s'applique.

## Points ouverts

Le calcul exact du délai de rétractation doit être vérifié aux sources
officielles avant l'ouverture, il n'est pas tranché ici.

Le seuil d'ancienneté déclenchant le signalement d'un retour non reçu reste à
définir, avec les autres paramètres commerciaux.
