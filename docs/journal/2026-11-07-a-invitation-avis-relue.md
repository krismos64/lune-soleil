# 7 novembre 2026 : première invitation d'avis relue en production, LS-311

Le journal du 4 novembre demandait de relire, après le 5 novembre à 7 h 53 UTC,
l'invitation de C-2026-0001 et son envoi. C'est la première exécution réelle de
la tâche `invitation-avis`, absente du cron de production jusqu'au 4 novembre.

## Relecture

Faite en lecture seule par `psql` dans le conteneur `lune-soleil-db`, sans
afficher l'adresse du destinataire :

| Table | Ligne de C-2026-0001 |
| --- | --- |
| `invitation_avis` | créée le 5 novembre à 07:53:00 UTC, `nombre_envois` 1, `dernier_envoi_a` 07:53:00 |
| `envoi_en_attente` | `invitation-avis`, `ENVOYE`, une tentative, prise à 07:54:00 |
| `journal_email` | `invitation-avis`, `ENVOYE` à 07:54:01, aucun motif d'échec |

L'invitation est partie une minute après sa création, au passage suivant de
l'outbox. La chaîne remise lue dans l'historique, délai, invitation et envoi
SMTP tient donc sur une commande réelle.

Contrôle nocturne vert les 5 et 6 novembre, écart entre la production et
`main` nul, aucune issue ouverte.

## Prochaine étape

- LS-295, la réauthentification par passkey.
- Après toute story qui ajoute une tâche planifiée : pousser le crontab et
  reconstruire `cron`, `EXPLOITATION.md`, le déploiement ne le fait pas.

## État des tickets

LS-311 close, commentée avec cette relecture. Ouverts : LS-295, LS-291, LS-35.
