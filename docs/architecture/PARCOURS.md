# Parcours critiques

Séquences d'états des huit parcours critiques du projet, cas d'erreur compris.

Ce document ne décrit aucun écran. Il décrit ce qui est **persisté** à chaque
étape, ce que **voit la personne**, et ce qui se passe quand ça échoue. Il
sert de contrat d'entrée au modèle conceptuel de données (LS-12) : tout état
mentionné ici doit avoir sa place dans le modèle, sans invention de champ
manquant.

| Champ | Valeur |
|---|---|
| Ticket | LS-11 |
| Source | Cahier des charges V1.0, sections 9, 11 et 15.5 |
| Débloque | LS-12 modèle conceptuel, LS-14 diagramme de séquence |
| Cas d'erreur | 57, dont un ajouté par LS-12, onze par LS-37, onze par LS-40 et trois par LS-41 |

Le document reste ouvert : modéliser révèle des cas que la lecture du cahier des
charges n'avait pas fait apparaître, et le périmètre évolue. Un cas découvert plus
tard s'ajoute ici, il ne vit pas ailleurs.

Le trente-deuxième cas, l'événement de paiement tardif au parcours 1, est venu de
LS-12. Le **parcours 7**, dépôt d'un avis, est venu de LS-37 après le passage des
avis en périmètre d'ouverture, epic LS-36.

## Pourquoi huit parcours et non cinq

Le plan directeur exige en section 4.4 que le modèle logique soit « validé sur
les cinq scénarios critiques sans invention de champ manquant », sans jamais
énumérer ces cinq scénarios.

Deux listes existent dans le cahier des charges. La section 9 décrit cinq
parcours orientés utilisateur. La section 15.5 liste six transactions critiques
orientées données. Elles ne se recouvrent pas entièrement : le rattachement d'une
commande sans compte à un compte vérifié est une transaction critique qui
n'apparaît dans aucun parcours.

Décision : les cinq parcours de la section 9, plus le rattachement de commande en
sixième. Le rattachement appartenait à la V1 cible à cette date, et le modèle
devait le prévoir dès maintenant pour éviter une migration sur des données
historiques. Il est entré en périmètre d'ouverture le 28 juillet 2026, epic
LS-36, ce qui confirme le choix sans le modifier.

Le huitième, la gestion du carnet d'adresses, est venu de LS-40 pour une raison
différente des sept autres : `AdresseCarnet` était modélisée sans qu'aucun
parcours ne la traverse, seule entité du modèle dans ce cas. Une entité qui
n'entre dans aucun parcours n'a subi aucun contrôle.

Les six premiers parcours couvrent ainsi les six transactions critiques de la
section 15.5. Le septième, le dépôt d'un avis, est venu plus tard avec
l'élargissement du périmètre d'ouverture.

## Conventions de lecture

Les statuts sont écrits en majuscules, conformément à la section 11 du cahier des
charges. `Base` désigne ce qui est écrit et doit survivre à un redémarrage.
`Vue` désigne ce que perçoit la personne devant l'écran. `Tâche` désigne un traitement
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
| 3b | Choix du mode de livraison | rien | trois modes, frais de port recalculés côté serveur, point de retrait choisi si `POINT_RELAIS` ou `LOCKER` |
| 4 | Commande et réservation, **une seule transaction** | commande `EN_ATTENTE_PAIEMENT`, lignes historisées, **mode de livraison, point de retrait et frais de port figés**, acceptation CGV horodatée, `quantiteReservee` incrémentée, réservations avec expiration à 30 min et `commandeId` renseigné | passage au paiement |
| 5 | Session de paiement, **après le commit** | identifiant de session prestataire rattaché à la commande | redirection |
| 6 | Attente de l'événement | rien | page d'attente ou retour du prestataire |
| 7 | Événement signé reçu | événement persisté avec identifiant unique, paiement `REUSSI`, commande `CONFIRMEE`, réservation convertie en mouvement de stock, `quantitePhysique` décrémentée | page de confirmation |
| 8 | Facture | facture avec numéro attribué dans la transaction, instantané légal, PDF | facture disponible |
| 9 | Emails | journal d'envoi, deux entrées | commande payée, facture |
| 10 | Préparation | commande `EN_PREPARATION`, historique de statut | suivi |
| 11 | Expédition | expédition avec transporteur, numéro de suivi, commande `EXPEDIEE` | email et lien de suivi |
| 12 | Livraison | commande `LIVREE` uniquement sur source fiable | suivi |

**L'étape 4 est une transaction unique**, décision d'ADR-024. Commande, lignes et
réservations sont écrites ensemble : si l'`UPDATE` conditionnel de réservation ne
trouve pas de stock, toute la transaction est annulée et aucune commande ne
subsiste. Une réservation sans commande est impossible en base,
`Reservation.commandeId` étant obligatoire.

Le motif est un incident qui, autrement, immobilise une pièce trente minutes :
une panne entre la réservation et la création de commande laissait une
réservation orpheline, et le client qui réessayait recevait « cette pièce vient
d'être vendue » alors qu'il était seul à la vouloir.

**L'étape 5 sort de la transaction.** Un appel réseau au prestataire à
l'intérieur tiendrait le verrou de ligne de la variante pendant tout
l'aller-retour, et son échec effacerait la commande par rollback. En la plaçant
après le commit, un échec laisse une commande `EN_ATTENTE_PAIEMENT` que la
réconciliation traite normalement.

**L'étape 3b précède le calcul du total**, ADR-025. Les frais de port dépendent
du mode : 4,10 € en Point Relais ou Locker, 4,99 € à domicile, offerts dès 39 €
pour les trois. Le montant est recalculé côté serveur à partir de la
configuration, jamais lu depuis le navigateur, puis **figé dans la commande** à
l'étape 4 avec le mode et le point de retrait.

Le point de retrait est copié avec son libellé et son adresse, pas seulement son
identifiant. Un point qui ferme rendrait autrement illisible une commande passée,
même raison que les libellés figés des lignes.

L'étape 7 est transactionnelle également, et idempotente par contrainte d'unicité
sur l'identifiant d'événement.

### Cas d'erreur

**Stock insuffisant à la réservation, étape 4**
Base : aucune écriture. L'`UPDATE` conditionnel ne retourne aucune ligne, et la
transaction entière est annulée, y compris la commande et ses lignes déjà
écrites.
Vue : « cette pièce vient d'être vendue », message métier et non erreur technique.
Le panier est conservé, la ligne concernée signalée.

**Panne pendant l'étape 4**
Base : aucune écriture, la transaction n'a jamais été validée. Ni commande, ni
réservation, ni quantité réservée incrémentée.
Vue : erreur technique, le client réessaie sur un stock intact.
C'est le cas que la transaction unique d'ADR-024 supprime. Avant elle, une panne
entre réservation et commande laissait la pièce bloquée trente minutes.

**Échec de création de la session de paiement, étape 5**
Base : la commande et ses réservations existent, la transaction ayant été validée
avant l'appel au prestataire. Aucun identifiant de session n'est rattaché.
Vue : message d'erreur, possibilité de réessayer le paiement.
Tâche : la réservation expire normalement à trente minutes, et la commande est
traitée par la réconciliation comme toute commande restée en attente.
C'est le motif de placer cet appel après le commit : à l'intérieur, son échec
aurait effacé la commande.

**API Mondial Relay indisponible à l'étape 3b, choix du point de retrait**
Base : aucune écriture.
Vue : la liste des points de retrait ne peut pas s'afficher. Le domicile reste
proposé, il n'exige aucun appel au transporteur. Message explicite indiquant que
le retrait en relais est momentanément indisponible, sans jargon technique.
C'est la raison de ne pas rendre le tunnel entièrement dépendant du
transporteur : avec trois modes dont un sans appel externe, une panne de l'API
dégrade le choix au lieu de bloquer la vente.

**Mode de livraison incohérent avec le point de retrait, étape 4**
Base : la contrainte `CHECK` rejette l'écriture, la transaction entière est
annulée. Une commande `DOMICILE` portant un point de retrait, ou un
`POINT_RELAIS` sans point, n'atteint jamais la base.
Vue : erreur technique, le client reprend le choix du mode.
Ce cas ne doit pas survenir, la validation Zod le rejetant en amont. La
contrainte est la dernière ligne de défense si le code échoue.

**Échec de livraison à domicile, après l'étape 11**
Base : `Expedition.mode` peut passer à `POINT_RELAIS` avec le point de report, et
`Expedition.pointRelaisId` est renseigné. **La commande n'est pas réécrite** :
`Commande.modeLivraison` reste `DOMICILE`, le client a choisi et payé ce mode,
ce fait est acquis et figé.
Vue : suivi indiquant le report en relais.
C'est le motif de porter le mode sur les deux entités, ADR-025 : ce que le client
a payé et ce que le transporteur a exécuté sont deux faits distincts.

**Prix ou produit modifié entre l'ajout au panier et la revalidation, étape 3**
Base : aucune écriture.
Vue : récapitulatif corrigé, nouveau prix affiché, confirmation demandée avant de
poursuivre. Le navigateur n'est jamais source de vérité.

**Abandon du paiement, le client ferme l'onglet**
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
Base : commande figée en `EN_ATTENTE_PAIEMENT` alors que le client a payé.
Vue : incertitude côté client, c'est le cas le plus délicat.
Tâche : réconciliation toutes les quinze minutes, interrogation du prestataire
pour toute commande en attente depuis plus de soixante minutes. Si le paiement
existe, la commande est régularisée comme à l'étape 7.

**Événement reçu deux fois, rejeu**
Base : la contrainte d'unicité sur l'identifiant d'événement rejette le second.
Aucun effet métier supplémentaire : pas de seconde facture, pas de second
mouvement de stock, pas d'email dupliqué.
Vue : rien.

**Événement tardif arrivant après la régularisation par réconciliation**
Le cas croise les deux précédents et n'est couvert par aucun des deux. La
réconciliation a déjà régularisé la commande, puis l'événement arrive enfin,
retardé par une file d'attente chez le prestataire. Son identifiant n'ayant
jamais été vu, l'unicité sur l'identifiant d'événement ne le rejette pas.
Base : l'événement est persisté, mais il ne produit aucun second effet métier.
Les unicités qui le garantissent portent sur l'effet et non sur l'événement,
quatre clés : au plus un paiement **encaissé** par commande, les trois états
`REUSSI`, `PARTIELLEMENT_REMBOURSE` et `REMBOURSE` comptant, au plus un mouvement
`VENTE_WEB` par commande **et par variante**, au plus une facture par commande,
au plus un email automatique par commande et par modèle.
Vue : rien, le client a déjà sa confirmation.
Sans ces quatre unicités, une variante à plusieurs exemplaires verrait son stock
décrémenté deux fois sans qu'aucune erreur ne se déclenche.

La clé du mouvement porte sur `(commandeId, varianteId)` et non sur la commande
seule : une commande à deux articles décrémente deux variantes, donc produit deux
mouvements. Une unicité par commande seule interdirait tout panier
multi-articles.

**Signature d'événement invalide**
Base : rejet avant tout effet métier, journalisation de la tentative.
Vue : rien.

**Échec d'envoi d'email, étape 9**
Base : la commande et la facture existent, le journal d'envoi porte l'échec avec
son motif.
Vue : le client ne reçoit rien, mais sa commande est valide et ses documents
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
| 3 | Enregistrement | mouvement de stock de type vente externe avec canal **et prix réellement pratiqué**, `quantitePhysique` décrémentée | stock à jour |
| 4 | Pièce invendue, retour | `venteWebActivee` à vrai, aucun mouvement de stock | produit à nouveau achetable |

Le prix saisi à l'étape 3 est celui **réellement encaissé**, pas celui du
catalogue. Il est proposé par défaut à la valeur du catalogue et reste modifiable :
une remise consentie sur un stand est un cas courant. Sans ce montant, le chiffre
d'affaires des marchés n'existe pas, LS-63 et règle S12.

Suspendre la vente web ne crée **aucun** mouvement de stock. Seule une vente
réelle décrémente la quantité physique.

### Cas d'erreur

**Réservation active au moment de la vente externe, étape 2**
C'est la faille que le cahier des charges identifie explicitement. Un client
paie en ligne pendant que la même pièce se vend sur le marché.
Base : aucune écriture, la vente externe est refusée.
Vue : message explicite indiquant qu'un client est en cours de paiement, avec
proposition d'annuler la réservation après confirmation.
Si l'administratrice confirme l'annulation : la réservation est libérée,
`quantiteReservee` décrémentée, et la vente externe peut alors être enregistrée.
Le client en ligne verra son paiement échouer à la conversion.

**Stock physique déjà à zéro**
Base : aucune écriture, la contrainte `CHECK` l'empêcherait de toute façon.
Vue : refus, stock déjà épuisé.

**Vente externe saisie sans montant, étape 3**
Base : aucune écriture, `chk_mouvement_vente_externe_prix` la rejette. Le montant
n'est pas facultatif, et il ne se reconstitue pas après coup.
Vue : le champ de prix est obligatoire au formulaire, prérempli au prix du
catalogue et modifiable.

**Vente externe saisie à tort, montant ou pièce erronés**
Base : le mouvement d'origine n'est **jamais** modifié ni supprimé, règle S4. Un
mouvement compensateur de quantité opposée est écrit, portant le même prix figé et
un `motif` obligatoire, ce qui remet la quantité physique à sa valeur juste.
Vue : action de correction explicite, jamais une édition du mouvement.
Suite : les statistiques somment les deux mouvements et retombent justes. La
correction est imputée à la période où elle est saisie, voir `STATISTIQUES.md`.

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
Base : aucun mouvement de stock, et **alerte critique** au-delà du seuil, règle
L13.
Vue : rien côté client.
La réintégration dépend du retour réel, jamais du remboursement seul.

Précisé par LS-41 : ce cas était traité comme une anomalie muette, « base, aucun
mouvement, vue, rien ». Depuis la règle L7, rembourser sans retour physique est un
chemin **légal** et non plus une anomalie, l'article L221-24 l'imposant dès la
preuve d'expédition. Le silence n'est donc plus acceptable, l'écart de stock doit
devenir visible.

L'ajustement éventuel reste une décision de l'administratrice, un mouvement
`AJUSTEMENT` avec motif quand la pièce est déclarée perdue. Rien ne l'écrit
automatiquement : un colis peut arriver trois semaines plus tard.

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
| 7a | Preuve d'expédition fournie | demande `EXPEDITION_PROUVEE`, `preuveExpeditionA` horodaté | accusé, remboursement annoncé |
| 7b | Réception du colis | `recueA` horodaté, **sans changement de statut** | confirmation |
| 8 | Remboursement | demande `REMBOURSEMENT_EN_COURS` puis `REMBOURSEE`, avoir si nécessaire | remboursement |
| 9 | Réintégration de stock | mouvement de retour selon l'état réel de la pièce, déclenché par `recueA` | stock à jour |

**Les étapes 7a et 7b sont deux faits indépendants, pas une séquence.** Le
remboursement est dû au **premier des deux** qui survient, article L221-24.

L'étape 7b n'a pas de statut, corrigé par LS-41 : la réception peut arriver avant
le remboursement, pendant, ou trois semaines après, et un statut `RECUE` obligerait
soit à faire régresser une demande déjà `REMBOURSEE`, soit à contredire ses propres
horodatages. `recueA` porte seul la réception, règle L12, et déclenche seul
l'étape 9.

Une demande peut donc être `REMBOURSEE` avec un colis toujours en transit, ou
jamais arrivé. Le second cas produit une alerte, règle L13 : la pièce est sortie
du stock sans y revenir.

**L'étape 7a n'est pas obligatoire.** Une demande passe de `RETOUR_ATTENDU`
directement à `REMBOURSEMENT_EN_COURS` dès que `recueA` est renseigné, sans jamais
voir `EXPEDITION_PROUVEE`. C'est le cas d'un retour déposé en point relais sans
numéro de suivi transmis, qui est courant. Ne jamais renseigner
`preuveExpeditionA` pour débloquer une transition : ce champ prouve un fait, il ne
sert pas à faire avancer une machine à états.

Le parcours conditionnait auparavant le remboursement à la seule réception, ce qui
le bloquait indéfiniment sur un colis lent ou perdu alors qu'il était dû depuis la
preuve d'expédition.

### Cas d'erreur

**Jeton expiré, consommé, révoqué ou modifié, étape 2**
Base : aucune écriture, la tentative est journalisée.
Vue : refus sécurisé, sans révéler si la commande existe.
Un numéro de commande seul n'identifie jamais un contrat.
Les quatre conditions se testent ensemble, règle L9. Un lien parti sur une adresse
email erronée se révoque, et un contrôle qui n'examinerait que l'expiration le
laisserait utilisable jusqu'à son terme.

**Délai légal dépassé**
Base : aucune demande créée.
Vue : message indiquant que le délai est écoulé, avec la date de fin.
Le calcul du délai doit être vérifié aux sources officielles avant l'ouverture.

**Échec d'envoi de l'accusé de réception, étape 5**
Base : la demande reste `DEPOSEE`, l'échec est journalisé.
Vue : le client a confirmé mais ne reçoit rien.
Suite : alerte critique. L'accusé sur support durable est une obligation légale,
son échec doit être traité en priorité, pas simplement journalisé.

**Colis jamais reçu, aucune preuve d'expédition fournie**
Base : la demande reste `RETOUR_ATTENDU`.
Vue : en attente.
Suite : signalement à l'administratrice au-delà d'un seuil d'ancienneté. Le
remboursement peut être différé, aucun des deux faits de l'article L221-24
n'étant survenu.

**Colis jamais reçu, mais preuve d'expédition fournie**
Base : demande `EXPEDITION_PROUVEE`, le remboursement suit son cours.
Vue : remboursement annoncé, indépendamment de l'arrivée du colis.
Le délai court depuis la preuve, article L221-24. Un colis perdu chez le
transporteur ne suspend pas le remboursement : le litige se traite avec le
transporteur, pas en retenant une somme due.

**Colis toujours pas reçu après le remboursement**
Base : demande `REMBOURSEE`, `recueA` nul, **aucun mouvement de stock**, alerte
critique au-delà du seuil, règle L13.
Vue : rien côté client, il a été remboursé.
La pièce est sortie du stock à la vente et n'y est jamais revenue. Sans l'alerte,
l'écart resterait invisible : le journal des mouvements montrerait une vente web,
un avoir total, et rien qui explique où est passée la pièce. C'est à
l'administratrice d'ouvrir le litige transporteur, et de décider d'un ajustement
de stock avec motif si la pièce est définitivement perdue.

**Colis reçu après le remboursement**
Base : `recueA` horodaté, mouvement `RETOUR` créé, statut inchangé à `REMBOURSEE`.
Vue : rien, l'opération est close côté client.
La réception n'est pas un statut, règle L12. Elle survient quand elle survient et
déclenche seule la réintégration.

**Pièce retournée endommagée**
Base : `recueA` horodaté, motif documenté. **L'ajustement du montant n'est
possible que si le remboursement n'est pas encore versé.**
Vue : explication du montant.
Aucune exclusion automatique n'est codée. Les exceptions relèvent du droit
applicable et de la caractéristique concrète du produit, jamais d'une règle
codée en dur pour les boucles d'oreilles.

Deux situations, depuis que le remboursement peut précéder la réception.

**Réception avant remboursement.** `montantRembourseCentimes` est ajusté avant
versement, comportement d'origine, rien ne change.

**Réception après remboursement.** L'ajustement n'est plus disponible : la somme
est versée et l'avoir émis est immuable, invariant 4.

**L'écart est assumé en perte**, décision de Christophe du 28 juillet 2026. Aucune
créance n'est constituée, aucune somme n'est réclamée au client. Le dossier est
clos au remboursement, quel que soit l'état de la pièce à son arrivée.

Le modèle ne représente donc rien de plus : `montantRembourseCentimes` n'est pas
modifiable après `REMBOURSEE`, et aucune entité de créance n'existe. La perte est
constatée en comptabilité, hors du site.

Le cas suppose d'avoir remboursé sur preuve d'expédition sans voir la pièce, ce
que la loi impose. Sur des pièces uniques à faible volume, poursuivre un client
pour la différence coûterait plus que la pièce et abîmerait la relation. La
dégradation constatée alimente en revanche le motif documenté, utile si le même
client recommence.

**Refus de la rétractation**
Base : état refusé avec motif documenté obligatoire.
Vue : motif communiqué.

---

## Parcours 6, rattachement d'une commande à un compte

Périmètre d'ouverture depuis le 28 juillet 2026, epic LS-36. Ce parcours était
classé V1 cible à sa rédaction, l'espace client ayant depuis été avancé avant
l'ouverture.

L'achat sans compte reste le mode par défaut. Ce parcours décrit ce qui se passe
quand un client crée un compte après avoir commandé.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Création de compte | utilisateur avec email non vérifié | formulaire |
| 2 | Vérification de l'email | utilisateur vérifié, jeton consommé | confirmation |
| 3 | Recherche des commandes éligibles | lecture seule, commandes jamais rattachées dont l'email normalisé correspond | liste proposée |
| 4 | Rattachement | commandes rattachées au compte, entrée au journal d'audit | historique visible |

Le rattachement n'est possible que sur des commandes **jamais rattachées** et
après vérification de la **même adresse email normalisée**.

« Jamais rattachée » est plus strict que « sans propriétaire ». Une commande dont
le compte a été supprimé porte `dissocieA` et reste exclue définitivement, sans
quoi la réattribution d'une adresse email par un fournisseur d'accès, ou un tiers
qui la connaît, ouvrirait l'historique et les factures d'un client parti. Voir la
règle A10 et le parcours 8.

### Cas d'erreur

**Email non vérifié, étape 3**
Base : aucune écriture.
Vue : rattachement indisponible tant que l'email n'est pas vérifié.

**Commande appartenant déjà à un autre compte**
Base : aucune écriture.
Vue : la commande n'apparaît pas dans la liste éligible.
Une commande déjà rattachée ne peut jamais changer de propriétaire par ce
parcours.

**Commande dont le compte propriétaire a été supprimé**
Base : aucune écriture, `dissocieA` exclut définitivement de l'éligibilité.
Vue : la commande n'apparaît pas, même si l'email correspond.
Son `utilisateurId` est nul, mais elle n'est pas « jamais rattachée ». Sans cette
distinction, une adresse email réattribuée rouvrirait l'historique complet d'un
client parti, factures comprises.

**Tentative de rattachement par identifiant fourni**
Base : refus, tentative journalisée.
Vue : refus sécurisé.
L'éligibilité est calculée côté serveur depuis la session, jamais depuis un
identifiant transmis par le client.

---

## Parcours 7, dépôt d'un avis

Ajouté par LS-37 le 28 juillet 2026, les avis étant passés en périmètre
d'ouverture. Le cadre légal a été vérifié aux sources avant rédaction : articles
L111-7-2 et D111-16 à D111-19 du Code de la consommation.

### Chemin nominal

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Livraison constatée | `Expedition.livreA` renseignée | suivi |
| 2 | Invitation, quelques jours après | invitation avec jeton d'accès de portée `AVIS`, journal d'envoi | email avec lien personnel |
| 3 | Ouverture du formulaire | vérification du jeton, aucune écriture | note et commentaire, produit rappelé |
| 4 | Dépôt | avis `DEPOSE`, `experienceA` à la date de livraison, `deposeA` horodaté, jeton consommé | accusé, délai de publication annoncé |
| 5 | Relecture | aucune écriture | l'avis apparaît dans l'administration |
| 6 | Publication | avis `PUBLIE`, `publieA` horodaté | visible sur la fiche produit |
| 7 | Réponse, facultative | réponse rattachée à l'avis, horodatée | réponse publique sous l'avis |

L'avis n'est **jamais** visible entre les étapes 4 et 6. Le délai annoncé à
l'étape 4 est une obligation : l'article D111-17 impose de publier le délai
maximum de publication et de s'y tenir.

### Cas d'erreur

**Avis déposé sans achat correspondant**
Base : aucune écriture, un avis sans ligne de commande ne peut pas exister.
Vue : le formulaire n'est pas accessible sans invitation valide.
La preuve d'achat est structurelle, pas déclarative.

**Second avis sur la même ligne de commande**
Base : aucune écriture, contrainte d'unicité sur la ligne.
Vue : l'avis existant est affiché, avec la possibilité de le modifier.
Un client ayant acheté deux fois la même pièce dispose de deux lignes, donc de
deux avis possibles.

**Jeton d'invitation expiré ou déjà utilisé**
Base : aucune écriture, tentative journalisée.
Vue : refus sécurisé, sans révéler si la commande existe.
Suite : un nouveau lien peut être demandé depuis l'espace client. L'invitation
existante est réutilisée, son `jetonAccesId` pointant vers le nouveau jeton et
`nombreEnvois` étant incrémenté. Aucune seconde invitation n'est créée.

L'ancien jeton est révoqué dans la même transaction, sans quoi il reste
valide jusqu'à son expiration alors que plus aucune invitation ne le référence.
Le premier lien, resté dans une boîte email partagée, permettrait de déposer
l'avis à la place de son destinataire.

**Invitation envoyée alors que la commande n'est pas livrée**
Base : l'invitation n'est pas créée, la tâche ne sélectionne que les commandes
livrées.
Vue : rien.
Sans date de livraison fiable, aucune invitation ne part. C'est la dépendance à
LS-33, qui vaut aussi pour le délai de rétractation.

**Avis refusé en modération**
Base : avis `REFUSE`, `motifDecision` obligatoire, `decideA` horodaté, l'avis est
**conservé**.
Vue : l'auteur est informé des motifs du refus, obligation de l'article
L111-7-2.
Un avis refusé n'est jamais supprimé : le motif doit pouvoir être justifié.

**Avis modifié par son auteur après publication**
Base : `modifieA` horodaté, `statut` repasse à `DEPOSE`, `publieA` conserve la
première publication.
Vue : l'avis disparaît de la fiche le temps de la relecture, son auteur en est
informé.
Sans ce retour en modération, la relecture se contournerait en deux gestes :
déposer un avis anodin, attendre sa publication, puis le remplacer.

**Avis publié puis retiré**
Base : avis `RETIRE`, `motifDecision` obligatoire, `decideA` horodaté, avis
conservé.
Vue : l'avis disparaît de la fiche, son auteur est informé.
`decideA` permet de savoir combien de temps l'avis est resté en ligne, ce que
`publieA` seul ne dit pas.

**Délai de publication annoncé dépassé**
Base : l'avis reste `DEPOSE`, `decideA` nul.
Vue : le client ne voit rien venir alors qu'un délai lui a été annoncé.
Suite : alerte à l'administratrice au-delà du délai publié. Ne pas tenir le délai
annoncé est un manquement à l'article D111-17, pas seulement une négligence
commerciale.

**Produit archivé après dépôt de l'avis**
Base : aucune modification de l'avis.
Vue : l'avis reste visible tant que la fiche produit l'est.
La ligne de commande porte la copie figée du produit, l'avis ne dépend pas du
catalogue actuel.

**Variante retirée du catalogue**
Base : la variante est **archivée**, jamais supprimée, l'avis subsiste et reste
rattaché à elle.
Vue : l'avis reste visible sur la fiche du produit.
Une variante supprimée libérerait sa référence, qui pourrait être réattribuée à
une autre pièce : les avis de l'ancienne remonteraient alors sur la fiche de la
nouvelle. L'archivage l'empêche.

**Échec d'envoi de l'invitation**
Base : le journal d'envoi porte l'échec, l'invitation existe.
Vue : le client ne reçoit rien.
Suite : renvoi possible depuis l'administration, comme pour les autres emails.
Une panne d'email ne fait perdre aucun avis, l'invitation restant valide.

---

## Parcours 8, gestion du carnet d'adresses

Ajouté par LS-40 le 28 juillet 2026. `AdresseCarnet` était la seule entité du
modèle qu'aucun parcours ne traversait, défaut relevé par la revue de LS-38.

**Le carnet est un confort, jamais un préalable.** L'achat sans compte reste le
mode par défaut, et aucune étape du parcours 1 ne dépend de l'existence d'un
carnet. Cette propriété se vérifie à chaque évolution.

### Chemin nominal, gestion depuis l'espace client

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Ouverture du carnet | lecture seule, filtrée sur le compte de la session | liste des adresses avec leur `libelle`, celle par défaut signalée |
| 2 | Ajout d'une adresse | `AdresseCarnet` créée, `utilisateurId` pris dans la session, `libelle` facultatif | l'adresse apparaît dans la liste |
| 3 | Choix de l'adresse par défaut | `estParDefaut` retiré de l'ancienne **puis** posé sur la nouvelle, même transaction, les deux lignes recoupées sur la session | le repère se déplace |
| 4 | Modification | champs mis à jour, ligne recoupée sur la session, aucune commande touchée | l'adresse corrigée |
| 5 | Suppression | ligne supprimée, recoupée sur la session, aucune commande touchée | l'adresse disparaît de la liste |

**Les étapes 3, 4 et 5 reçoivent un identifiant d'adresse et n'en tirent aucune
autorisation.** Toute écriture porte `AND utilisateurId = <session>` dans sa
condition, jamais `WHERE id = :id` seul. Sans ce recoupement, un identifiant posté
depuis un formulaire laisse modifier ou supprimer l'adresse d'autrui : c'est la
faille d'autorisation la plus banale, et l'invariant 2 existe pour elle.

L'ordre de l'étape 3 n'est pas indifférent : l'index partiel est vérifié ligne à
ligne, poser le nouveau drapeau d'abord fait échouer la transaction. Le détail
est dans `.claude/rules/database.md`, avec sa vérification sur PostgreSQL 18.4.

La suppression est **réelle**, pas un archivage. Elle est sans risque parce
qu'aucune commande ne référence le carnet, règle A3.

### Chemin nominal, usage au tunnel de commande

| # | Étape | Base | Vue |
|---|---|---|---|
| 1 | Arrivée au tunnel | rien | adresses du carnet proposées, celle par défaut présélectionnée **si elle existe, aucune présélection sinon** |
| 2 | Choix ou saisie | rien, le carnet n'est pas modifié, identifiant reçu recoupé sur la session | formulaire prérempli, modifiable |
| 3 | Validation de la commande | `Commande.adresseLivraison` et `adresseFacturation` reçoivent une **copie figée du formulaire revalidé** | récapitulatif |
| 4 | Enregistrement facultatif | `AdresseCarnet` créée si le client le demande | l'adresse entre au carnet |

**Un identifiant d'adresse reçu à l'étape 2 est recoupé sur la session avant
toute résolution.** Sans ce contrôle, un identifiant appartenant à un autre compte
recopierait son nom, sa rue et son téléphone dans la commande, puis dans une
facture téléchargeable en toute légitimité. Un identifiant qui ne se résout pas
dans le carnet du compte est traité comme une saisie libre, jamais comme une
erreur silencieuse.

**La copie de l'étape 3 vient du formulaire revalidé, jamais d'une relecture du
carnet.** Refaire un `SELECT` sur `AdresseCarnet` au moment de figer
réintroduirait une dépendance que la règle A3 écarte, et ferait partir le colis à
une adresse que le client n'a pas vue sur son récapitulatif.

L'étape 1 ne présélectionne rien quand aucune adresse n'est marquée par défaut,
règle A7. Retenir la plus récente ou la première de la liste serait la
désignation arbitraire que cette règle refuse.

**Aucune clé étrangère ne part de la commande vers le carnet.** La commande
recopie, elle ne référence jamais, règle A3. C'est ce qui protège les factures
émises.

Le client choisit à cette étape quelle adresse sert à la livraison et laquelle à
la facturation. Le carnet ne porte pas cette distinction, règle A5 : une même
adresse sert souvent aux deux, et dupliquer une adresse identique pour deux
usages serait absurde.

L'étape 4 est le seul chemin d'écriture du carnet depuis le tunnel. Une adresse
saisie directement n'y entre pas d'office : un client qui envoie un cadeau chez
quelqu'un d'autre n'a aucune raison de conserver cette adresse.

### Cas d'erreur

**Adresse supprimée alors qu'elle a servi à une commande**
Base : la ligne du carnet disparaît, aucune commande n'est modifiée.
Vue : l'historique et les factures restent intacts, avec l'adresse d'origine.
C'est la règle A4, conséquence directe de A3. Une adresse référencée aurait
altéré rétroactivement une facture émise, ce qui viole les invariants 3 et 4.

**Deux adresses par défaut sur le même compte**
Base : aucune écriture, l'index partiel `adresse_carnet (utilisateurId)` filtré
sur `estParDefaut` rejette la seconde.
Vue : refus, l'adresse par défaut reste celle d'avant.
Le refus décrit ci-dessus ne survient que si le code oublie l'ordre de l'étape 3.

Deux onglets qui basculent chacun le défaut, en respectant cet ordre, ne
produisent aucun refus : la dernière transaction validée gagne, et le compte se
retrouve avec une seule adresse par défaut. L'invariant tient sous concurrence,
mais laquelle des deux l'emporte dépend de l'ordre de validation.

**Suppression de l'adresse par défaut**
Base : la ligne disparaît, le compte se retrouve **sans** adresse par défaut.
Vue : plus aucune adresse n'est signalée, la sélection au tunnel redevient
manuelle.
Aucune promotion automatique d'une autre adresse : désigner arbitrairement une
adresse par défaut ferait expédier un colis à une adresse que personne n'a
choisie. Le carnet sans défaut est un état légitime, l'index partiel l'autorise.

**Carnet vide au moment de commander**
Base : aucune écriture.
Vue : le formulaire d'adresse s'affiche vide, la commande se poursuit
normalement.
Un carnet vide ne bloque jamais un achat. C'est le cas de tout premier achat
d'un client authentifié.

**Client sans compte au tunnel de commande**
Base : aucune écriture au carnet, la commande fige ses adresses comme toujours.
Vue : saisie directe, aucune mention du carnet.
L'achat sans compte est le mode par défaut, ADR-023. Le tunnel ne propose ni
création de compte ni enregistrement d'adresse comme préalable.

**Accès à l'adresse d'un autre compte**
Base : refus, tentative journalisée.
Vue : refus sécurisé.
La liste est calculée côté serveur depuis la session, jamais depuis un
identifiant transmis. Un identifiant d'adresse fourni par un formulaire
n'autorise rien, invariant 2 et règle A1.

**Adresse choisie au tunnel puis supprimée avant validation**
Base : aucune écriture, la commande n'est pas créée.
Vue : le formulaire redemande une adresse.
Le cas suppose deux sessions simultanées. Il ne corrompt rien puisque la copie
ne se fige qu'à la validation.

**Adresse modifiée au carnet pendant qu'une commande est en cours**
Base : le carnet est à jour, la commande fige ce que le formulaire portait.
Vue : le récapitulatif montre l'adresse affichée, pas la version corrigée.
Le client ouvre le tunnel à 14 h 00, corrige la même adresse dans un second
onglet à 14 h 03, valide à 14 h 05. La commande retient ce qu'il a vu et validé.
C'est le cas jumeau du précédent, et il est plus insidieux : la suppression se
voit, la modification est silencieuse. Aller relire le carnet au moment de figer
enverrait le colis à une adresse qui n'est jamais apparue sur le récapitulatif.

**Suppression du compte propriétaire du carnet**
Base : les adresses du carnet sont supprimées, les commandes sont **dissociées**,
leur `utilisateurId` passant à nul et `dissocieA` étant horodaté, et jamais
détruites. Leurs adresses figées restent intactes, règle A3.
Vue : l'accès en libre-service à l'historique est perdu. Les commandes restent
consultables par l'administration, au titre de la conservation comptable.
Le carnet et la commande divergent ici, et c'est délibéré : le carnet se supprime
en cascade, une commande facturée ne se supprime jamais. Une cascade posée sur
`Commande` détruirait des documents comptables, en violation des invariants 3
et 4.
`dissocieA` exclut définitivement ces commandes du parcours 6, règle V15. Sans
lui, elles redeviendraient « sans propriétaire », donc éligibles au rattachement
par quiconque contrôle ensuite la même adresse email.

**Rattachement de commandes à un compte au carnet vide**
Base : aucune écriture au carnet, les adresses figées des commandes rattachées ne
sont pas recopiées.
Vue : historique complet, carnet vide.
Le carnet ne se peuple jamais rétroactivement. Recopier les adresses de quatre
commandes créerait autant de doublons, et la règle A3 interdit tout lien entre
les deux. Proposer au client d'enregistrer une de ces adresses reste possible,
comme geste explicite de sa part, jamais automatiquement.

---

## Ce que ces parcours imposent au modèle de données

Synthèse pour LS-12, complétée par LS-37 et LS-40. Chaque élément apparaît dans
au moins un parcours ci-dessus.

**États à persister** : statut de commande et statut de paiement séparés, statut
de produit, statut de demande de rétractation, statut de message, statut d'alerte
critique.

**Historisation obligatoire** : lignes de commande figées avec prix et libellés,
instantané légal de facture et d'avoir, historique des transitions de statut avec
acteur et date, journal des mouvements de stock immuable.

**Unicité contrainte** : référence de variante, numéro de commande, numéro de
facture, numéro d'avoir, identifiant d'événement fournisseur, nom de verrou de
tâche planifiée, `slug` de produit.

L'identifiant d'événement ne suffit pas à lui seul. Il protège du rejeu du même
événement, pas du croisement entre le webhook et la réconciliation, qui sont deux
chemins distincts vers le même effet. LS-12 y ajoute quatre clés portant sur
l'effet plutôt que sur l'événement : paiement réussi par commande, mouvement de
vente web par commande et variante, facture par commande, email automatique par
commande et modèle.

**Expiration** : réservation de stock, jeton de rétractation, lien signé de
document, jeton de vérification d'email.

**Traces** : journal d'audit pour les actions administratives sensibles, journal
des envois d'email, alertes critiques acquittables.

**Apporté par le parcours 7** : un avis rattaché à une ligne de commande et non à
un produit, deux dates distinctes exigées par l'article D111-17, la conservation
des avis refusés ou retirés avec leur motif et leur date de décision, et une
portée de jeton supplémentaire pour l'invitation.

Le regroupement des avis sur une fiche produit se fait par `varianteId`. Cela
suppose qu'une variante ne soit **jamais supprimée** mais archivée, faute de quoi
sa référence redeviendrait libre et pourrait être réattribuée à une autre pièce,
faisant remonter d'anciens avis sur une fiche qui n'est pas la leur.

**Champs prévus mais inutilisés au lancement** : champs fiscaux à zéro, tant que
la franchise en base s'applique.

Le propriétaire de commande figurait dans cette liste. Il en sort : l'espace
client est passé en périmètre d'ouverture le 28 juillet 2026, epic LS-36, donc
`utilisateurId` est renseigné dès le lancement sur les commandes rattachées à un
compte. Il reste nullable, l'achat sans compte demeurant le mode par défaut, et
il n'autorise jamais un accès à lui seul, règle V13 et ADR-023.

## Ce qui a été tranché depuis

**Délai de rétractation**, vérifié aux sources officielles le 28 juillet 2026.
Quatorze jours à compter de la réception du bien par le consommateur, article
L221-18 du Code de la consommation. Le jour de réception n'est pas compté, et
l'échéance est reportée au premier jour ouvrable suivant si elle tombe un samedi,
un dimanche ou un jour férié, article L221-19. En cas de livraison échelonnée, le
délai court à compter du dernier bien reçu.

Le calendrier des jours fériés français est donc nécessaire côté serveur.

Point de vigilance de l'article L221-20 : sans information correcte du
consommateur sur son droit, le délai est prolongé de **douze mois**. Le parcours 5
prévoit déjà la fonctionnalité en ligne exigée par l'article L221-21.

**Signalement d'un retour non reçu : immédiat**, pour permettre de contacter le
transporteur sans attendre. Le seuil d'ancienneté envisagé est abandonné au
profit d'une alerte dès que le retour annoncé n'arrive pas.

## Point ouvert

**D'où vient la date de réception du colis**, qui fait courir le délai de
rétractation. Le parcours 1 persiste une date de livraison « uniquement sur
source fiable », sans définir cette source : interrogation automatique du
transporteur, saisie par l'administratrice, ou repli sur la date d'expédition.

Ticket LS-33, à trancher avec l'exploitante.

**Faire courir le délai depuis l'expédition seule est une faute**, corrigée par
LS-41 ici comme dans `.claude/rules/legal.md`. Le délai légal court depuis la
réception, et l'expédition la précède : expédié le 1er, reçu le 4, un délai parti
du 1er expire le 15 alors que le minimum légal court jusqu'au 18. Le droit serait
éteint trois jours trop tôt.

Le repli sûr est la date d'expédition **plus une marge couvrant l'acheminement**.
À défaut de date de réception connue, retenir la date la plus tardive plausible,
jamais la plus précoce.
