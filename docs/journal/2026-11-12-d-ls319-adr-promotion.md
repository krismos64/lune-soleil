# 12 novembre 2026 : promotion de la Black Week, ADR-051 proposé, LS-319

## Demande

Après la mise en production de LS-318, enchaîner sur la promotion de 30 % :
l'ADR d'abord, zone critique (prix encaissé, Stripe, facture, remboursement).

## Fait

- **Chaîne du prix mesurée** : le prix catalogue n'est figé qu'en un point,
  `lireDonneesAFiger` sous `FOR UPDATE` dans `passerCommande`. Stripe, la
  facture, l'avoir, le remboursement et les statistiques lisent le prix figé ;
  panier, catalogue, fiche et JSON-LD lisent le catalogue pour l'affichage.
  Aucun changement de prix n'est tracé aujourd'hui.
- **Sources lues** : L112-1-1 (Légifrance), communiqué n° 152/24 de la CJUE sur
  l'arrêt C-330/23 Aldi Süd (pourcentage calculé sur le prix le plus bas des
  30 jours au moins), L441-9 du Code de commerce (mention des réductions sur
  facture limitée aux achats pour une activité professionnelle).
- **ADR-051 proposé**, PR #663 : promotions fermées écrites dans le code,
  table `promotion` qui sert d'historique, `historique_prix_variante`, une
  seule fonction de prix de vente, garde d'activation en échec fermé, prix
  gelés sous promotion, prix réduit et prix de référence figés sur la ligne de
  commande, facture en instantané version 3.
- Quinze questions de zone critique répondues dans LS-319.

## Prochaine étape

Réponses de Christophe aux trois questions ouvertes de l'ADR (pièce récente,
réactivation, mention sur facture), puis ADR accepté, tests écrits avant le
code. Échéance : en production avant le lundi 23 novembre 2026.

## État des tickets

- **LS-319** : En cours, ADR proposé, code non commencé.
