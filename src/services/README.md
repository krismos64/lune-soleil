# services/

Cas d'usage et orchestration métier.

Un service porte une intention métier complète : réserver le stock d'un panier,
confirmer un paiement, émettre une facture. Il compose des repositories, applique
les règles de gestion et décide des transactions.

## Ce qui entre ici

- les règles de gestion numérotées de `docs/architecture/MODELE-CONCEPTUEL.md`
- les calculs monétaires, en centimes entiers
- les frontières de transaction
- la validation Zod des entrées non fiables

## Ce qui n'entre pas

- l'accès direct à Prisma, il passe par `repositories/`
- la lecture d'un objet `Request`, d'un cookie ou d'un `FormData`, qui restent
  dans l'adaptateur d'entrée
- le rendu, y compris la mise en forme d'un montant pour l'affichage

Un service s'appelle depuis un gestionnaire de route, une Server Action ou un
autre service, jamais depuis un composant client.
