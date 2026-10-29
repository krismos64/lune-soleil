# 29 octobre 2026 : recette avec l'exploitante, étiquette Sendcloud en API v3, LS-296

Première commande réelle, C-2026-0001, passée en Locker par l'exploitante.
Christophe a relevé cinq défauts pendant la recette.

## Fait

**Cinq tickets créés**, chacun sous son epic :

| Ticket | Sujet | Priorité |
| --- | --- | --- |
| LS-296 | étiquette refusée, API v2 fermée au compte | Highest, en cours |
| LS-297 | facture : « Lune-Soleil » en titre, nom légal avec « EI » | High |
| LS-298 | message « adresse email vérifiée » | Medium |
| LS-299 | adresse du carnet dans le tunnel | High |
| LS-300 | vignette et lien des pièces au récapitulatif | Medium |

**LS-295** créée plus tôt : réauthentification par passkey contournable avec une
session volée, Should, après l'ouverture, arbitrage de Christophe.

### LS-296, la cause mesurée sans payer

Journal de production : cinq clics de 17 h 04 à 17 h 06, tous
`TransporteurIndisponibleError`, sans la cause. Lectures Sendcloud depuis le
conteneur, clés lues dans l'environnement et jamais affichées : authentification,
méthode 29145 et expéditeur répondent 200, aucun colis créé pour la commande.
Puis la même demande que le site, en `request_label: false`, gratuite :

```
POST /api/v2/parcels  ->  403
"Creating parcels via API v2 is not available for this account. Please use API v3."
```

### LS-296, ce qui change

- **Création par `POST /api/v3/shipments/announce`**, étiquette par
  `GET /api/v3/parcels/{id}/documents/label?paper_size=A4`. Codes d'option,
  contrat 239536 et expéditeur 914836 relevés sur `POST /api/v3/shipping-options`.
- **Cause journalisée** : code HTTP, codes d'erreur et chemins de champ, jamais
  une valeur (`resumerRefus`).
- **Message sous son bouton** : il tombait sous le formulaire manuel, hors de
  l'écran à 320 px. C'est le « rien ne se passe » de l'exploitante.

**Deux défauts graves trouvés par `ls-critical-reviewer`, corrigés** :

1. une annonce échouée chez Mondial Relay revient en **201 avec un numéro de
   suivi** et le statut `ANNOUNCEMENT_FAILED` : elle aurait passé la commande en
   `EXPEDIEE` et envoyé au client un numéro inconnu. Seul `READY_TO_SEND` passe ;
2. `external_reference_id` reçoit le numéro de commande : un second envoi rend
   409 et l'envoi existant, sans seconde étiquette facturée. Le commentaire du
   service disait cette fenêtre impossible à fermer, vrai de la v2 seulement.

**Quatre défauts relevés par `ls-frontend-revue`, corrigés** : test qui ne liait
pas le texte à la région, double annonce possible pendant l'appel, focus perdu
sur `<body>` après un refus (sept issues), paire de contraste sur sable non
mesurée. Plus : messages périmés vidés, `overflow-wrap` à 320 px.

## Preuves

```
npm run type-check, lint     OK
npm run test                 115 fichiers, 1832 tests verts (avant les tests de revue)
tests unitaires Sendcloud    24 verts
verifier-contraste.sh        OK
```

| Mutation | Détectée par |
| --- | --- |
| statut d'annonce ignoré | 3 tests unitaires |
| référence externe retirée | 1 test unitaire |
| 409 traité en panne | 1 test unitaire |
| région du message remise en bas | e2e, `toBeInViewport`, 320 et 1280 |
| message « indisponible » dans la mauvaise région | e2e, `toHaveText`, 320 et 768 |

## Reste ouvert

- **LS-296, critère 8** : le premier envoi réel. L'exploitante reclique sur
  C-2026-0001 après déploiement ; ce sera la vraie étiquette du colis, facturée.
  Il fermera le critère 10 de LS-218 et le critère 1 de LS-27, et dira si le
  suivi v2 lit un colis créé en v3.
- **LS-297** : arbitrage de Christophe, « Lune-Soleil » en titre et le nom légal
  en petit avec « EI », seulement sur la facture et `/informations-legales`
  (R526-27 du Code de commerce, article 6 de la LCEN). La facture F-2026-0001
  n'a pas la mention « EI » et ne se modifie pas, invariant 4.
- LS-298, LS-299, LS-300 à faire.
