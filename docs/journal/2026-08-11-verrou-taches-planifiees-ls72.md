# 11 août 2026, verrou des tâches planifiées, LS-72

Troisième session de la journée, après LS-81 et LS-80. Story terminée et fusionnée
sur `main`, PR #89, trois commits.

## Un écart sur le premier critère

Le critère 1 demandait « la table de verrou existe dans la migration ». **Elle
existe depuis LS-13**, avec `nom` en UNIQUE (règle E8) et son champ d'expiration.
Aucune migration n'a donc été écrite : la description datait du 30 juillet, avant
que LS-13 ne livre le modèle logique complet. Signalé dans le commentaire Jira
plutôt que re-livré.

## Ce qui est livré

La prise de verrou tient en **une seule instruction**, même principe que
l'`UPDATE` conditionnel de réservation d'ADR-006 :

```sql
INSERT INTO verrou_tache (id, nom, acquis_a, expire_a)
VALUES ($1, $2, now(), now() + make_interval(secs => $3::double precision))
ON CONFLICT (nom) DO UPDATE
  SET id = EXCLUDED.id, acquis_a = EXCLUDED.acquis_a, expire_a = EXCLUDED.expire_a
  WHERE verrou_tache.expire_a < now()
RETURNING id
```

Le `WHERE` du `DO UPDATE` est le cœur. Il n'écrase un verrou existant **que s'il
a expiré**, et son retrait laisse la reprise fonctionner : un test naïf reste
donc vert pendant que le verrou ne protège plus rien.

Deux garanties que le SQL seul ne donne pas : le relâchement porte sur le **jeton
du détenteur**, et il vit dans un **`finally`**. Sans la première, une instance en
retard supprimerait le verrou de sa remplaçante ; sans la seconde, une exception
récurrente bloquerait la tâche pour toujours.

Secret partagé vérifié côté serveur, comparaison à temps constant, **défaut fermé
sur l'absence de secret** : personne ne passe, cron compris. Une tâche qui ne
tourne pas se remarque, une route interne ouverte à tous ne se remarque pas.

Conteneur `alpine:3.22`, dont `crond` et `wget` font partie de l'image de base,
**vérifié plutôt que supposé** : ni `curl` ni `openssl` n'étaient dans `node:slim`
en LS-74.

## Un défaut de mutation, et ce qu'il enseigne

Mon premier cas de mutation retirait `AND id = $2` du `DELETE`. Cela laisse
**deux paramètres pour un seul emplacement** : PostgreSQL lève « wrong number of
parameters », l'erreur est avalée par le `catch` du `finally`, et le verrou de la
remplaçante survit **par accident**. Le test visant ce défaut passait donc au vert
sous mutation, pour une raison étrangère à ce qu'il vérifie.

Le script de mutation a signalé « échec constaté, mais PAS sur le test attendu »,
ce qui est exactement son rôle : il m'a montré que ma mutation testait autre chose
que ce qu'elle annonçait.

Une seconde formulation, `($2 IS NULL OR true)`, échouait en « could not determine
data type of parameter $2 ». La troisième, `$2::text IS NOT NULL`, type le
paramètre, le consomme, et vaut toujours vrai. Les trois tentatives sont
documentées dans le script.

## Un trou dans les garde-fous du projet

La relecture critique a lancé `docker compose config` pour valider le fichier
Compose, et **le mot de passe de la base de développement est apparu dans sa
sortie**. Aucun garde-fou ne l'a vu, et les deux existants avaient chacun leur
raison :

- `hook-block-secret-files.sh` lit `tool_input.file_path`, champ que seuls Read,
  Edit et Write renseignent. Une commande Bash n'en a pas : le hook sort en 0
- les règles `deny` portent sur `Read(./.env)` et attrapent un `cat .env`, mais
  rien contre une commande qui lit le fichier **sans le nommer**

Un second hook `PreToolUse` sur `Bash` ferme ce chemin. Une revue de sécurité
automatique y a ensuite trouvé **trois défauts**, tous reproduits avant
correction :

1. **fail-open** quand `jq` est absent, le pire cas pour un garde-fou de sécurité
2. contournement par `docker compose --file X config`, seul `-f` étant prévu
3. `cat .env` non couvert, que seules les règles `deny` voyaient

`scripts/verifier-hook-secrets.sh` joue 24 cas **dans les deux sens**. Les
passages comptent autant que les refus : un hook qui bloquerait
`env -u DATABASE_URL npm run test:unitaire` serait désactivé dans la semaine.

Le contrôle est lui-même prouvé par mutation : retour au fail-open donne 1 échec,
retrait du filtre `.env` donne 6 échecs.

## Un contrôle de mutation qui ne mutait plus rien

`verifier-config-claude-mutation.sh` cherchait `casse **vingt-et-une fois**` dans
le README pour fausser le compte. Le chiffre est passé à vingt-trois, vingt-sept,
puis trente-six : la substitution ne trouvait plus rien, ne mutait donc rien, et
le script concluait « non détecté » sur un contrôle parfaitement voyant. Il
s'accusait lui-même à la place du contrôle.

Corrigé en `\S+ fois`, avec un garde-fou qui échoue franchement si la formulation
change. Motif déjà connu, la cible de mutation déplacée, et c'est sa quatrième
occurrence sur ce dépôt.

La table des nombres en lettres de `verifier-config-claude.sh` a aussi été étendue
de trente à quarante : `trente-et-une` n'était pas reconnu, l'alternance retenait
`une` seul, et le contrôle annonçait « README annonce **1** mutations ». Juste dans
son intention, faux dans son chiffre.

## Preuves

```
npm run type-check                            vert
npm run lint                                  vert
npm run format:check                          vert
npm run build                                 vert
npm run test                                  224 tests, 14 fichiers
env -u DATABASE_URL npm run test:unitaire     126 tests sans base
npm run db:verifier                           95 réussites, 0 échec
./scripts/verifier-regles.sh                  vert
./scripts/verifier-regles-mutation.sh         12 / 12 détectées
./scripts/verifier-config-claude.sh           vert
./scripts/verifier-config-claude-mutation.sh  13 / 13 détectées
./scripts/verifier-hook-secrets.sh            24 cas conformes
./scripts/verifier-tests-mutation.sh          36 / 36 détectées
```

La suite passe de 203 à **224 tests**, la mutation de 31 à **36 cas**.

Déclenchement réel vérifié de bout en bout, conteneur vers application à travers
le réseau Docker : `{"tache":"liberation-reservations","etat":"EXECUTEE"}`.

Tests négatifs en conditions réelles : `404` sans secret, `404` avec un faux
secret, `404` sur tâche inconnue, `405` sur `GET`.

## Ce que la relecture a validé au-delà de ma suite

Elle a exercé trois cas que mes tests ne couvraient pas, tous conformes : vingt
concurrents sur un verrou **expiré** (un seul servi, aucune erreur d'unicité), le
croisement `DELETE(A)` contre `PRENDRE(B)`, et la transmission de l'environnement
par BusyBox `crond`, réputé le réduire.

Elle a aussi mesuré que **prendre le verrou depuis une transaction change la forme
du refus** : `READ COMMITTED` rend `[1, 0, 0]`, `REPEATABLE READ` rend
`[40001, 40001, 1]`. Jamais deux détenteurs, le mode d'échec reste sûr, mais le
refus lève au lieu de rendre `false`. Documenté dans le repository pour la phase 3.

## État des tickets

**LS-72 terminée**, les sept critères remplis, le premier l'étant depuis LS-13.

LS-2 compte vingt-et-une stories filles, **seize terminées**.

## Ce qui reste ouvert

**La purge du journal des connexions n'est toujours appelée par personne.** Le
ticket LS-72 dit explicitement « le squelette accueille, il n'exécute pas » :
brancher la purge ici aurait débordé du périmètre. Elle trouvera sa place quand la
tâche de libération s'écrira en phase 3, ou dans une troisième tâche.

## Prochaine étape

**LS-89**, écran de réauthentification. Périmètre réduit à l'écran, critères 1, 5
et 7 : les quatre familles d'actions sensibles restent en dette dans
`.claude/familles-sans-action.txt`, aucune action à garder n'existant dans le
dépôt. Vérifié à nouveau ce soir, aucune marque `@sensible` dans `src/`.
