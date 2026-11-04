# 4 novembre 2026 : la remise se lit dans l'historique de suivi, LS-311

Le 3 novembre n'a pas de journal : la session s'est limitée à un constat,
porté par la description de LS-311. Il est repris ici.

## Constat du 3 novembre, et relecture du 4

C-2026-0001, mode Locker, colis Sendcloud 734780549. Arrivé au Locker le
2 novembre, retiré par l'exploitante le 3 à 14 h 52 UTC.

Relu le 4 novembre en lecture seule, clés lues dans le conteneur sans être
affichées :

| Source | Ce qu'elle dit le 4 novembre |
| --- | --- |
| `GET /api/v2/parcels/{id}`, seule lue par le code | statut **12**, « Awaiting customer pickup », mis à jour le 2 novembre à 14 h 00 |
| `GET /api/v2/tracking/{numero}` | `delivered` à **2026-11-03 14:52:55+00:00**, puis `picked-up-by-driver` une seconde après |
| base de production | `livre_a` nul, statut « Awaiting customer pickup » |

Plus de vingt heures après le retrait, le statut n'avait pas bougé : ce n'était
pas un retard. Le statut 93 d'ADR-042 décision 1 n'a jamais été observé.

## LS-311, fait

- **`lireLivraison`** dans `integrations/sendcloud/suivi.ts` lit l'historique
  et rend trois états, `remise` (avec l'instant), `aucune`, `retour`. Il
  retient le **premier** `delivered`, quel que soit son rang : l'ordre n'est
  pas documenté, l'exemple officiel et la réponse réelle sont inverses.
- **Liste blanche textuelle** `EVENEMENTS_SUIVI_LIVRES` = `delivered` seul, dans
  `statuts.ts`.
- **Horodatage du transporteur** : décalage horaire exigé (invariant 8),
  futur au-delà de dix minutes refusé, microsecondes tronquées.
- **Service** : l'historique fait foi, les statuts 11 et 93 sont un repli quand
  il se tait. Échec définitif : historique non lu. Panne de l'historique :
  échec compté, rien n'est écrit, la date exacte se relit au cycle suivant.
- **`enregistrerSuivi`** passe en `updateMany` filtré sur `livre_a` nul et rend
  si la ligne a été écrite.
- **V16**, `chk_expedition_remise_apres_envoi`, migration
  `20261104180000_expedition_remise_apres_envoi`, additive, arbitrage de
  Christophe en séance.
- **ADR-042 décision 7**, qui corrige aussi la fin de la décision 6 (« le
  retrait déclenche `livreA` par le statut 93 », démenti par le colis réel).
  `legal.md`, `database.md`, `MODELE-CONCEPTUEL.md` (V16), `REFERENCES.md`,
  `PARCOURS.md` mis à jour.

## Revue critique, deux défauts corrigés dans la branche

`ls-critical-reviewer` a relu le premier commit :

1. **Aucune borne basse** : un numéro de suivi recollé à la déclaration
   manuelle aurait fait lire la remise d'un ancien colis, antérieure à l'envoi,
   et éteint le délai de rétractation avant la livraison réelle. Corrigé : une
   remise antérieure à `expedieA` compte en échec, et V16 le garantit en base.
2. **`is_return` vrai et statut 11** déclenchaient le repli : un `null` unique
   recouvrait « aucune remise » et « retour ». Corrigé par les trois états.

Points jugés sains par la revue : liste blanche, pannes, fuseau, absence de
fuite du numéro de suivi ou des clés, effet sur LS-61 et LS-216.

## Vérifié

- Unitaires `sendcloud-suivi.test.ts` 28 sur 28, intégration
  `expedition.sequential.test.ts` 55 sur 55, dont l'historique réel de
  C-2026-0001 à l'endroit et à l'envers.
- Vitest complet **1972 sur 1972** ; types, lint, `verifier-regles.sh`.
- `db:verifier` 142 sur 142, dont trois contrôles V16 ; contrainte retirée de
  la base de développement, le rejet rougit (141 sur 142), puis remise.
- **Mutation, dix défauts de code**, tous vus par le test visé : historique ignoré,
  date du cycle, attente au point en liste blanche, dernier événement retenu,
  filtre `livre_a` nul retiré, repli pendant une panne, horodatage sans fuseau,
  borne basse retirée, retour traité comme aucune remise (service et client).

## Dérives

- **Les quatre premières mutations d'intégration sont sorties vides**, sans
  verdict. Deux causes : zsh ne découpe pas une variable non quotée, Vitest ne
  lançait pas le fichier ; le filtre attendait `×` quand l'intégration écrit
  ` FAIL `. Rejouées en script bash. Fiche mémoire « liste vide » enrichie,
  seconde occurrence.
- **La mutation « fuseau optionnel » est restée verte** à la première forme :
  le décalage absent devenait la chaîne `undefined`, date invalide, donc
  refusée quand même. Rejouée sous la forme qu'on écrirait (défaut `""`), elle
  rougit deux tests.
- **V16 a fait rougir 21 tests** dans deux fichiers dont les jeux de données
  posaient `expedie_a = now()` et une livraison passée. Ramenés par `LEAST`.
- `paiement-session.sequential.test.ts` a échoué **une fois** dans la suite
  complète, puis 15 sur 15 seul et dans la suite suivante. Instabilité
  observée une fois, non diagnostiquée.
- Le connecteur Atlassian `claude_ai` est retiré par Atlassian (transport SSE) :
  Jira passe par le plugin `atlassian`.

## Risque accepté

L'API v2 de Sendcloud est « en maintenance » depuis avril 2026, sans
dépréciation de l'endpoint `tracking`. À rouvrir au retrait annoncé de la v2,
ADR-042 décision 7.

## Prochaine étape

- Fusion, migration de production par `migrate-production.sh`, déploiement,
  puis relire `livre_a` de C-2026-0001 (critère 7) et le départ de
  l'invitation à l'avis.
- LS-295, la réauthentification par passkey.
