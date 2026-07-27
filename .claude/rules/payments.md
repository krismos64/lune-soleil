---
paths:
  - "src/integrations/stripe/**"
  - "src/app/api/webhooks/**"
  - "src/services/checkout/**"
  - "src/services/orders/**"
  - "src/services/invoices/**"
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
d'arrivée inattendu, remboursement partiel, remboursement total.

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
alignées. Cible initiale : 30 minutes.

Deux tâches planifiées obligatoires :

- Libération des réservations expirées, toutes les 5 minutes, idempotente.
- Réconciliation des commandes en attente, toutes les 15 minutes : interroger le
  prestataire pour toute commande en attente depuis plus de 60 minutes et
  régulariser. Un événement jamais reçu ne doit pas laisser une commande
  incohérente.

Un verrou applicatif en base empêche deux exécutions simultanées de la même
tâche.

## Documents comptables

Une facture est **immuable**. Jamais modifiée, jamais supprimée, y compris pour
représenter un remboursement. Une correction produit un **avoir** référençant la
facture initiale.

Les données légales sont historisées dans le document : elles ne dépendent ni du
profil courant de la cliente ni du catalogue actuel.

Mention obligatoire sur tout document : `TVA non applicable, article 293 B du
Code général des impôts`. Aucune ligne de TVA, l'entreprise est en franchise en
base.

Une facture existante est renvoyée, jamais recréée.

## Accès aux documents

Contrôle de propriété côté serveur systématique. Pour un achat sans compte,
l'accès passe par un **lien signé expirant**, non devinable. Un identifiant de
commande dans une URL n'autorise rien par lui-même.

Test négatif obligatoire : une cliente demande la commande d'une autre, refus
sécurisé. Lien signé expiré ou modifié, refus sécurisé.

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
