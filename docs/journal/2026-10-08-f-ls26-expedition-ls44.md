# 8 octobre 2026 : délai d'expédition dans la FAQ, LS-44 close

Suite de `2026-10-08-e`, toujours en séance avec l'exploitante.

## LS-44, conformité des matières

Tous les matériaux viennent de Cultura, pièces métalliques comprises ; plus
rien de Temu. La prémisse du ticket (composants hors Union européenne) tombe.
Clos par arbitrage de Christophe, avec la consigne de conserver tickets et
emballages. Demande de l'exploitante : écrire « provenance France » sans citer
Cultura. **Déconseillé et non fait** : Cultura distribue, la pâte Fimo est
fabriquée en Allemagne. Seule origine publiée : l'assemblage à Artix.

## LS-26, réponses aux questions 38 à 42

| Question | Réponse |
| --- | --- |
| délai | deux jours au plus après paiement confirmé |
| jours sans expédition | aucun |
| emballage | enveloppe à bulles, présentoir en carton, pochette transparente |
| cadeau | gratuit, sur demande par email |
| fermetures | la vente est mise en pause, aucun délai allongé annoncé |
| absence à domicile | inconnue de l'exploitante, relevée chez Mondial Relay |

**Livré** : `DELAI_EXPEDITION_JOURS_MAX` dans `src/lib/livraison.ts`, source
unique ; quatre questions neuves dans la FAQ (délai, emballage, cadeau, absence
à domicile) ; la note « sera précisé avant l'ouverture » de `/aide` remplacée
par le délai. Le délai borne le **dépôt** du colis, jamais sa réception : aucun
délai d'acheminement n'est annoncé, faute de source vérifiée.

**Absence à domicile** : la FAQ officielle de Mondial Relay est derrière une
protection anti-robot (403). Les pages relevées par recherche se contredisent
sur le nombre de tentatives ; la réponse n'écrit que ce que toutes confirment,
sans chiffre (avis de passage, nouvelle présentation ou point de retrait, retour
à l'atelier).

## Preuves

Types et lint verts. Unitaire 10 passed. Bout en bout 92 passed sur
`informations-legales` et `aide-ls280`, quatre largeurs, débordement compris.
Mutations : un délai d'acheminement inventé dans la FAQ fait rougir deux tests
unitaires ; la constante passée à 3 fait rougir le test de bout en bout, qui
garde le chiffre en dur pour cette raison.

## Écart relevé, non traité

La réponse 42 suppose une **pause de la vente**. Le site ne la permet que
variante par variante (`/administration/stocks`), soit 50 gestes pour fermer
la boutique. Proposé à Christophe, aucun ticket créé.

## État des tickets

LS-44 **close**. LS-26 **En cours** : reste la validation de la FAQ en ligne
par l'exploitante, après déploiement.

## Prochaine étape

Déployer, faire relire `/aide#faq` par l'exploitante, clore LS-26. Puis LS-19.
