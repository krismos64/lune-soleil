---
paths:
  - "src/integrations/stripe/**"
  - "src/integrations/pdf/**"
  - "src/app/api/webhooks/**"
  - "src/services/paiement.ts"
  - "src/services/webhook-paiement.ts"
  - "src/services/reconciliation-paiements.ts"
  - "src/services/commande.ts"
  - "src/services/facture.ts"
  - "src/services/document-comptable.ts"
  - "src/services/tunnel.ts"
  - "src/repositories/paiement.ts"
  - "src/repositories/confirmation.ts"
  - "src/repositories/commande.ts"
  - "src/repositories/facture.ts"
  - "src/app/(boutique)/commande/**"
---

# Paiement, commandes et documents comptables

Stripe Checkout. Vérifier la documentation Stripe via Context7 avant d'utiliser
une API.

## Le serveur est la seule source de vérité

Aucun secret Stripe dans le navigateur. Seule la clé publiable est exposée.

La session de paiement est créée côté serveur, après revalidation du produit, du
prix et du stock. Le panier venant du navigateur n'est jamais cru.

**Le retour du navigateur ne prouve aucun paiement.** Seul un événement serveur
signé le confirme. Une page de succès affiche un état provisoire, jamais une
commande confirmée.

## Idempotence, règle absolue

Tout événement entrant est traité **au plus une fois**.

1. Vérifier la signature **avant tout effet métier**. Signature invalide : rejet
   et journalisation, aucun effet.
2. Persister l'identifiant d'événement fournisseur avec une contrainte `UNIQUE`,
   **dans la même transaction** que les effets métier.
3. Un rejeu ne produit aucun effet supplémentaire : pas de seconde facture, pas
   de second mouvement de stock, pas d'email métier dupliqué.

Tester systématiquement : signature invalide, rejeu du même événement, ordre
d'arrivée inattendu, remboursement partiel, remboursement total, **et l'événement
tardif arrivant après une régularisation par la réconciliation**.

### L'identifiant d'événement ne suffit pas

Le point 2 protège du rejeu du **même** événement. Il ne protège pas du
croisement de deux chemins d'entrée vers le même effet métier, et il y en a deux :
le webhook et la réconciliation.

Le scénario, démontré en LS-12. La réconciliation régularise une commande restée
en attente depuis soixante minutes, crée le paiement, le mouvement de stock, la
facture et les emails. Quarante secondes plus tard le webhook arrive enfin,
retardé chez le prestataire. Son identifiant n'a jamais été vu : la contrainte
`UNIQUE` du point 2 ne le rejette pas. Il recrée tout.

Sur une pièce unique, le `CHECK` fait échouer la transaction, donc une erreur
serveur au lieu d'un traitement propre. Sur une variante à trois exemplaires,
rien n'échoue et le stock est faux sans qu'aucune alerte ne se déclenche.

**L'idempotence doit donc être ancrée sur l'effet.** Quatre clés, détaillées dans
`.claude/rules/database.md` : paiement réussi par commande, mouvement de vente
web par commande et variante, facture par commande, email automatique par
commande et modèle.

Les deux chemins convergent alors vers le même refus en base, quel que soit celui
qui arrive en second, et sans dépendre de l'ordre des écritures dans la
transaction.

## Statuts séparés

Le statut de commande et le statut de paiement sont deux champs distincts. Un
remboursement ne force jamais un statut logistique incohérent.

```
Commande : EN_ATTENTE_PAIEMENT -> CONFIRMEE -> EN_PREPARATION -> EXPEDIEE -> LIVREE
           EN_ATTENTE_PAIEMENT -> ANNULEE
Paiement : EN_ATTENTE -> REUSSI | ECHOUE
           REUSSI -> PARTIELLEMENT_REMBOURSE -> REMBOURSE
```

Le statut `LIVREE` n'est jamais supposé sans source fiable. Chaque transition est
validée côté serveur et historisée avec acteur, date, ancien et nouveau statut.

## Expiration et réconciliation

L'expiration de la session de paiement et celle de la réservation de stock sont
alignées. **30 minutes**, ADR-032 : c'est la borne basse qu'autorise `expires_at`
chez Stripe, et elle vaut la durée de réservation d'ADR-006. Une session qui
survivrait à sa réservation permettrait de payer une pièce que la tâche de
libération vient de rendre au catalogue.

Deux tâches planifiées obligatoires :

- Libération des réservations expirées, toutes les 5 minutes, idempotente.
- Réconciliation des commandes en attente, toutes les 15 minutes : interroger le
  prestataire pour toute commande en attente depuis plus de 60 minutes et
  régulariser. Un événement jamais reçu ne doit pas laisser une commande
  incohérente.

Un verrou applicatif en base empêche deux exécutions simultanées de la même
tâche.

## Deux sessions payées pour une même commande

**Le scénario, et il est prévu par le parcours 1.** Une session est créée, le
client la laisse ouverte, revient plus tard, une seconde session est créée. Il
paie la seconde, retrouve l'onglet de la première et paie aussi. Deux événements
arrivent avec deux identifiants distincts : **rien dans l'idempotence par
identifiant ne les rapproche**, et l'unicité d'effet refuse la seconde écriture
sans rien rembourser. Le prestataire a encaissé deux fois.

ADR-032 tranche les trois volets.

**Prévention.** Avant de créer une session, **expirer celle que la commande porte
encore**, `POST /v1/checkout/sessions/:id/expire`. L'appel n'agit que sur une
session `open` : son échec parce qu'elle est déjà payée ou expirée n'est pas une
panne, c'est l'information que la prévention n'avait rien à faire.

**La clé d'idempotence ne peut pas être le seul `commandeId`.** Les clés Stripe
sont purgées après au moins 24 heures, et une clé réutilisée avec des paramètres
différents rend une **erreur** : dériver du seul identifiant de commande casserait
le nouvel essai légitime après un refus de paiement. La clé porte la commande
**et** la tentative.

**La réservation est prolongée jusqu'à l'`expires_at` de chaque session créée**,
complément d'ADR-032 arbitré le 26 août 2026, et c'est la même identité d'instant
qui vaut aux deux bouts : le service calcule un seul `expireA`, l'envoie au
prestataire et le pose sur les réservations actives. Sans cela l'alignement se
rompait au **réessai**, une nouvelle session durant obligatoirement 30 minutes
quand la réservation posée à la commande pouvait n'en avoir plus que cinq.

**Une réservation déjà expirée est un refus métier, sans aucun appel au
prestataire** : la tâche de libération a pu rendre la pièce au catalogue, et
créer une session permettrait de payer une pièce revendue. Seules les
réservations **actives** se prolongent, jamais une expirée que l'on ferait
renaître sur un stock qui ne la porte plus.

**La garde est universelle, jamais existentielle** : chaque ligne de commande
doit porter sa réservation active, et la comparaison porte sur le **nombre de
lignes prolongées**. « Au moins une réservation active » répond vrai sur un
panier à deux pièces dont une seule est encore réservée, et le client paierait
les deux. C'est la prolongation elle-même qui sert de garde, son compte de lignes
étant lu : une lecture préalable rouvrirait la fenêtre que l'appel réseau
d'expiration, jusqu'à vingt secondes, laisse grande ouverte.

**Une session ne se crée jamais sans que sa tentative soit déjà en base.** La
ligne `Paiement` est réservée **avant** l'appel, `identifiantFournisseur` nul, et
complétée après. Écrite après l'appel, une écriture perdue laissait une session
orpheline : payable trente minutes, inconnue de la base, donc jamais expirée par
la prévention au réessai.

**Après avoir rattaché sa session, un démarrage expire toute autre session encore
ouverte de la commande.** C'est ce rattrapage, et non un verrou, qui tient
l'invariant sous concurrence : un verrou pris avant l'appel serait relâché avant
que la session existe, donc deux démarrages simultanés liraient tous deux
« aucune session précédente ». Le dernier à rattacher expire les précédentes.

**Une panne réseau sur l'expiration de la session précédente arrête tout.**
`DEJA_FERMEE` n'est pas une panne et laisse continuer ; une indisponibilité, si :
créer une session sans savoir si la précédente est encore payable rouvre
exactement le double encaissement que cette prévention ferme.

**Détection.** Un refus par `paiement_reussi_unique`, dont le prédicat porte les
trois états d'encaissement `REUSSI`, `PARTIELLEMENT_REMBOURSE` et `REMBOURSE`, ne
se journalise pas silencieusement. Il produit une `AlerteCritique` de gravité `CRITIQUE`, portant
`typeCible = "Paiement"`, l'identifiant du paiement en trop et son montant.
L'événement reste persisté, il ne doit pas être rejoué indéfiniment.

**Traitement : remboursement MANUEL**, par l'exploitante depuis le tableau de
bord du prestataire. **Ne pas appeler de remboursement automatique**, y compris
si cela paraît plus serviable : le chemin qui décide « ce paiement est en trop »
est celui qui, s'il se trompe, rend l'argent d'une commande valide.

## Documents comptables

Une facture est **immuable**. Jamais modifiée, jamais supprimée, y compris pour
représenter un remboursement. Une correction produit un **avoir** référençant la
facture initiale.

Les données légales sont historisées dans le document : elles ne dépendent ni du
profil courant du client ni du catalogue actuel.

Mention obligatoire sur tout document : `TVA non applicable, article 293 B du
Code général des impôts`. Aucune ligne de TVA, l'entreprise est en franchise en
base.

Une facture existante est renvoyée, jamais recréée.

### Le rendu PDF, ADR-034

`Facture.cheminPdf` et `Avoir.cheminPdf` sont **nullables, et c'est le mécanisme
de détection** : le champ nul est l'état « PDF en échec », qui lève une
`AlerteCritique`. Le document existe donc en base **avec son numéro avant que le
fichier existe**, et l'invariant 4 porte sur l'instantané, pas sur le fichier.

**Le rendu s'exécute APRÈS le commit, jamais dans la transaction.** C'est une
écriture disque : l'y placer tiendrait la transaction du webhook pendant une
entrée-sortie, et un disque plein l'avorterait, perdant le paiement et le
mouvement de stock pour un fichier manquant. Un échec laisse `cheminPdf` nul,
lève l'alerte et n'annule rien.

**Une régénération ne réattribue jamais de numéro.** Elle ne modifie que
`cheminPdf`, le seul `update` autorisé sur une facture.

**Le gabarit ne lit que l'instantané légal.** Il ne reçoit aucun identifiant qui
lui permettrait de remonter au catalogue : une facture émise ne change pas parce
qu'un prix a bougé depuis.

**Une police Unicode est enregistrée explicitement**, jamais celle par défaut.
`@react-pdf/renderer` **ne lève pas** sur un caractère qu'il ne sait pas rendre,
il le **remplace en silence** : « Straẞe Łódź Tōkyō » sortait « Straže Aódz
TMkyM ». Le nom et l'adresse du client sont des saisies libres, et un nom
déformé sur un document légal ne se signale par rien. Le fichier de police est
versionné dans le dépôt, jamais chargé par URL.

**Un test de rendu extrait le texte du PDF produit** et le compare à la source.
Vérifier qu'aucune exception n'est levée ne prouve rien, la substitution étant
silencieuse.

## Accès aux documents

Contrôle de propriété côté serveur systématique. Pour un achat sans compte,
l'accès passe par un **lien signé expirant**, non devinable. Un identifiant de
commande dans une URL n'autorise rien par lui-même.

Test négatif obligatoire : un client demande la commande d'un autre, refus
sécurisé. Lien signé expiré ou modifié, refus sécurisé.

**Livré par LS-132**, `src/lib/jeton-acces.ts`, `src/services/acces-document.ts`
et la route `(boutique)/facture/[jeton]`. Cinq points s'y perdent facilement.

**Quatre conditions, pas trois.** La règle L9 en énonce trois, qui sont l'état en
base : expiré, consommé, révoqué. La quatrième est la **signature**, qui ne se
lit pas en base et se vérifie avant toute requête. Un contrôle limité à
l'expiration laisse utilisable jusqu'à son terme un lien parti sur une adresse
erronée, ce que la révocation existe pour fermer.

**L'ordre des contrôles porte une garantie.** La signature d'abord, en mémoire :
une valeur forgée ne doit pas coûter une requête, sans quoi l'énumération reste
possible à coût constant.

**Le refus est indiscernable, et le type le garantit.** `autoriserAccesDocument`
rend `REFUSE` sans motif, et la route rend **404 pour tous les cas**, jamais 403 :
un 403 signifierait « ce document existe mais vous n'y avez pas droit », donc
révélerait une commande. Le motif est journalisé côté serveur, jamais rendu.

**La portée `DOCUMENT` ne se consomme pas.** `utiliseA` marque une action faite,
une rétractation déposée ou un avis écrit. Une facture se consulte plusieurs
fois : consommer à la première lecture casserait le second clic du client. La
borne est `expireA`, trente jours, et la révocation reste disponible.

**Le jeton naît dans la transaction d'émission**, `services/facture.ts`. Un
chemin séparé laisserait exister des factures sans moyen d'accès, découvertes une
par une par des clients qui réclament. Le rejeu d'un événement sort avant, sur la
facture existante, et n'engendre donc pas de second jeton.

## Montants

Centimes entiers en base. La conversion vers le format attendu par Stripe est
explicite et isolée dans la couche d'intégration. Frais de livraison, remise,
taxes et totaux sont **figés dans la commande** au moment de la validation.

## Acceptation des CGV

Recueillie avant redirection vers le paiement. Version, horodatage et contexte de
commande persistés. Le bouton final exprime sans ambiguïté l'obligation de payer.

## Ce qui ne se coupe jamais

Même sous contrainte de temps : la réservation atomique, l'idempotence des
événements, l'exactitude des factures et avoirs, le contrôle d'accès aux
documents, l'utilisabilité du paiement sur smartphone. Ce sont les critères de
refus d'ouverture.
