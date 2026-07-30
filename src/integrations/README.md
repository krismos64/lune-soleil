# integrations/

Isolation des fournisseurs externes : Stripe, email, médias, IA.

Chaque intégration expose une interface pensée pour le projet, pas pour le
fournisseur. Le reste du code ne connaît jamais le nom du prestataire.

## Ce qui entre ici

- les appels réseau au fournisseur et sa configuration
- la traduction de ses erreurs en erreurs du domaine
- la vérification de signature d'un webhook

## Ce qui n'entre pas

- la décision de ce qu'un événement provoque, qui appartient à `services/`
- une clé ou un secret en clair : tout vient de l'environnement

## Point de vigilance

Seul un événement serveur signé confirme un paiement. Le retour du navigateur ne
prouve rien. L'idempotence s'ancre sur l'effet et non sur l'identifiant
d'événement, voir `.claude/rules/payments.md`, décision D.

Prévoir le cas du fournisseur indisponible : une panne d'email ne doit jamais
faire échouer une vente déjà payée.
