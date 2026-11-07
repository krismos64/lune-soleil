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

## Mise en production

- PR #634, CI verte (huit contrôles en 15 min 47 s), fusionnée en rebase :
  `620a8eb`, `249e2f7`, `83577c4`, `eb697ad`.
- **Migration V16** par `migrate-production.sh`, sur autorisation ponctuelle de
  Christophe (la procédure lit `DATABASE_URL` du fichier d'environnement) :
  27 puis 28 migrations, contrainte relue en base, sauvegarde vérifiée
  conservée sur le poste, relais et tunnel fermés.
- Déploiement run 41894013258 : `ghcr.io/krismos64/lune-soleil:eb697ad…`,
  `/api/sante` en 200.
- **Critère 7** : la synchronisation de 19 h 23 UTC a écrit `livre_a` =
  **2026-11-03 14:52:55 UTC** pour C-2026-0001, à la seconde de la remise ;
  `traitees: 1, echecs: 0, livrees: 1`. **LS-311 close.**

## Le cron de production n'avait jamais reçu `invitation-avis`

En vérifiant le départ de l'invitation à l'avis : le conteneur
`lune-soleil-cron` portait **six** tâches, le crontab du dépôt sept. Son image,
`lune-soleil-cron:local`, construite sur la machine le 10 septembre 2026 à
18 h 32 UTC, précède le commit de LS-61 du même jour. **La tâche d'invitation
n'a donc jamais tourné en production**, sans conséquence jusqu'ici puisque
C-2026-0001 est la première livraison.

**Seconde occurrence du même défaut** : le 10 septembre, `suivi-livraison`
manquait de la même façon, `EXPLOITATION.md` l'écrit déjà. Le déploiement ne
reconstruit pas le cron, et le contrôle `9y` ne compare que deux fichiers du
dépôt.

Appliqué sur accord de Christophe, par la procédure d'`EXPLOITATION.md` :
crontab poussé (l'ancien gardé en `crontab.avant-ls311`), seul `cron`
reconstruit. Relu : sept tâches, `53 7 * * * invitation-avis`, `envoi-emails`
déclenché à 19 h 27 et 19 h 28. **Arbitrage de Christophe : pas de ticket pour
un contrôle**, la récidive est tracée ici et dans la mémoire.

L'invitation de C-2026-0001 sera déposée le 5 novembre à 7 h 53 UTC.

## Relecture de fin de session

À la demande de Christophe, j'ai relu `CLAUDE.md` (200 lignes), le README, les agents, les skills, les hooks, `docs/` et la mémoire, en cherchant chaque affirmation que LS-311 rendait fausse.

Six passages présentaient encore les deux statuts comme la source de `livreA`. Ils sont corrigés :

- `MODELE-CONCEPTUEL.md`, deux endroits ;
- `PARCOURS.md`, ligne 903 ;
- la table de `legal.md` (11 et 93 marqués « en repli ») ;
- le README d'`integrations/sendcloud` ;
- `ETAT.md`, qui affirmait que toutes les tâches tournaient.

L'agent `ls-conteneurisation` sait désormais que le cron ne se reconstruit pas au déploiement. Rien à changer dans `CLAUDE.md`, le README, les skills ni les hooks : aucun ne traite du suivi ni du cron.

Côté Jira, LS-61 et LS-131 portent un commentaire de traçabilité. Les contrôles `verifier-config-claude.sh`, `verifier-regles.sh` et `verifier-propagation-docs.sh` sont verts. Seule reste l'heuristique d'exclusivité déjà connue (`VERIFICATION.md:38`).

## Risque accepté

L'API v2 de Sendcloud est « en maintenance » depuis avril 2026, sans
dépréciation de l'endpoint `tracking`. À rouvrir au retrait annoncé de la v2,
ADR-042 décision 7.

## Prochaine étape

- Le 5 novembre après 7 h 53 UTC : relire l'invitation de C-2026-0001
  (`invitation_avis`, `envoi_en_attente`, `journal_email`) et son envoi.
  Fait le 7 novembre, envoyée le 5 à 07:54 UTC, journal `2026-11-07-a`.
- Après toute story qui ajoute une tâche planifiée : pousser le crontab et
  reconstruire `cron`, `EXPLOITATION.md`, le déploiement ne le fait pas.
- LS-295, la réauthentification par passkey.
