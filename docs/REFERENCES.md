# Références du projet, quoi lire avant de concevoir

Ce fichier porte les tables d'aiguillage vers la documentation technique et les
décisions d'architecture. Il est sorti de `CLAUDE.md` le 30 juillet 2026, celui-ci
dépassant les 200 lignes recommandées pour un fichier chargé à chaque session.

`CLAUDE.md` garde l'ordre de priorité des sources et renvoie ici pour le détail.

## Documentation technique, les cinq documents à connaître

Les lire avant de concevoir sur le domaine concerné, plutôt que de reconstituer
une règle depuis le schéma.

| Fichier | Ce qu'il porte | À lire avant |
|---|---|---|
| `docs/architecture/PARCOURS.md` | huit parcours et leurs cas d'erreur, contrat d'entrée du modèle | toute fonctionnalité |
| `docs/architecture/MODELE-CONCEPTUEL.md` | entités, règles de gestion numérotées (C, S, V, F, L, R, E, A), décisions A à I | schéma, service, migration |
| `docs/architecture/MODELE-LOGIQUE.md` | traduction physique, index partiels, politiques de suppression, dettes de phase 1 | Prisma, migration |
| `docs/architecture/STATISTIQUES.md` | indicateurs, périodes en `Europe/Paris`, règles de calcul | statistiques, e-reporting, tout agrégat de montant |
| `docs/architecture/PROTOTYPE.md` | intention visuelle du prototype gelé, six états non nominaux, table parcours vers écran, cinq écarts connus | toute interface, publique ou administration |
| `docs/architecture/VALIDATION.md` | socle Zod, où valider et pourquoi à deux endroits, convention d'erreur des adaptateurs, trois pièges de Zod 4 | toute Server Action, gestionnaire de route ou service qui reçoit une entrée |
| `docs/architecture/JOURNALISATION.md` | trois journaux distincts, masquage par nom de clé, erreurs réduites au nom de classe, contrôle de santé et ses quatre décisions | toute ligne de journal, la route de santé, le déploiement |
| `docs/architecture/REGISTRE-DES-TRAITEMENTS.md` | neuf traitements RGPD, durées de conservation tracées à leur source, ce que le registre n'est pas | toute table portant une donnée personnelle, toute durée de conservation |

**Une règle numérotée se cite par son identifiant**, S12 ou V14, jamais
paraphrasée seule : c'est ce qui permet aux contrôles textuels de la retrouver.

`docs/journal/` porte l'avancement réel, une page par session. Lire la plus
récente donne l'état du projet plus vite que Jira.

## Code applicatif existant, et ses dettes

`src/` n'est plus vide depuis LS-50. Ce que la couche métier porte déjà, à
connaître avant d'écrire un service qui la recouvrirait ou la contredirait :

| Module | Ce qu'il porte | Dette attachée |
|---|---|---|
| `src/services/reservation.ts` | réservation d'un panier : tri déterministe des variantes, rejeu borné sur interblocage, refus par exception, validation par `schemaPanier` | aucune, la garde locale a été remplacée par le socle en LS-71 |
| `src/lib/validation.ts` | socle Zod partagé, `valider`, `EntreeInvalideError`, six schémas de domaine, voir `VALIDATION.md` | aucune |
| `src/app/panier/actions.ts` | Server Action de réservation : valide puis délègue, traduit refus, contention et panne en résultats | reçoit `commandeId` sans le produire, ADR-024 imposant que la commande naisse dans la transaction de réservation |
| `src/repositories/stock.ts` | l'`UPDATE` conditionnel d'ADR-006, en `$queryRawUnsafe`, réexporté par `tests/aide/reservation-sql.ts` | aucune |
| `src/lib/auth.ts` | instance Better Auth : mapping vers `Utilisateur`, `role` en `input: false`, seize caractères, plugin passkey, session d'un jour prolongée à l'usage, LS-81 | vérification d'email **désactivée** tant qu'ADR-008 n'est pas implémenté |
| `src/lib/auth-client.ts` | client navigateur, passkey comprise | aucune |
| `src/lib/mot-de-passe.ts` | les deux longueurs, **sans aucun import** pour rester servable au navigateur | aucune |
| `src/services/autorisation.ts` | `lireIdentite`, `exigerSession`, `exigerAdministratrice` | aucune |
| `src/services/reauthentification.ts` | `exigerReauthentificationRecente`, quatre familles d'actions sensibles, fenêtre de quinze minutes, LS-81 | **aucune action n'est encore gardée**, les quatre familles sont en attente dans `.claude/familles-sans-action.txt`, LS-89 |
| `src/services/journal-connexion.ts` | journal des connexions : écriture qui ne lève jamais, purge à six mois, lecture pour l'écran, LS-80 | **la purge n'est appelée par personne**, la tâche planifiée est LS-72 |
| `src/lib/hook-journal-connexion.ts` | hook `after` de Better Auth, table des chemins de connexion, journalisation des refus de cadence, LS-80 | `trustedProxies` non configuré, l'adresse IP restera nulle derrière Nginx |
| `src/lib/issue-connexion.ts` | `lireResultat`, défaut fermé sur l'issue d'une tentative, **sans aucun import du projet** | aucune |
| `src/repositories/verrou.ts` | prise de verrou atomique en une instruction, `ON CONFLICT DO UPDATE` conditionnel à l'expiration, relâchement conditionnel au détenteur, LS-72 | aucune |
| `src/services/tache-planifiee.ts` | `executerSousVerrou`, table des tâches et durées de verrou, relâchement garanti en `finally` | **les deux tâches sont vides**, elles se remplissent en phase 3 et 4 |
| `src/lib/secret-cron.ts` | secret partagé des routes internes, comparaison à temps constant, **sans aucun import du projet** | aucune |
| `src/services/preuve-identite.ts` | **seul point d'entrée qui écrit une preuve**, vérification par mot de passe ou fraîcheur de session pour la passkey, LS-89 | aucune |
| `src/services/utilisateur.ts` | mise à jour de profil, schéma Zod `.strict()`, règle E11 | aucune |
| `src/integrations/email/index.ts` | interface `EnvoyeurEmail`, implémentation qui journalise sans envoyer | **aucun email ne part** : ADR-008 retient le SMTP OVH et nodemailer, implémentation à écrire |
| `src/lib/journal.ts` | journalisation JSON, masquage par nom de clé, erreurs réduites au nom de classe, `LOG_LEVEL`, voir `JOURNALISATION.md` | aucune |
| `src/services/sante.ts` | sonde `SELECT 1` avec délai de garde de deux secondes, ne lève jamais | aucune |
| `src/app/api/sante/route.ts` | route publique 200 ou 503, sans cache, en-tête `X-Correlation-Id` | aucune |

**Toute route d'administration appelle `exigerAdministratrice` dans son
composant serveur, avant tout rendu.** Il n'y a délibérément pas de middleware :
celui de Next.js s'exécute sur la périphérie et ne peut pas relire la session en
base, il ne verrait que la présence d'un cookie, ni sa validité ni le rôle.

Trois propriétés de ce code se perdent facilement. `input: false` ne couvre que
les routes de Better Auth, toute autre écriture sur `Utilisateur` y échappe,
règle E11. Le défaut de `normaliserRole` est **fermé**, une valeur inconnue vaut
`CLIENT`, et son sens n'est visible par aucun parcours nominal : une mutation
l'a prouvé en restant verte sur quinze tests. Enfin `lib/mot-de-passe.ts`
existe pour que le formulaire de connexion n'importe pas `lib/auth.ts`, qui
tirerait Prisma et le secret dans le paquet du navigateur.

Deux propriétés de ce code se perdent facilement, portées par ADR-006 et
`database.md` : un refus métier **sort de la transaction par une exception**, un
`return` la ferait valider ; et un interblocage arrive en `P2010` sur requête
brute, pas en `40P01`.

**Portée de `reserverPanier`** : il reçoit un `commandeId` déjà créé et n'écrit
que les réservations. ADR-024 exige que la commande, ses lignes et ses
réservations partagent une seule transaction : la story qui créera la commande
devra donc l'englober, pas l'appeler à la suite.

## ADR acceptés

Les lire avant de travailler sur le domaine concerné. Un ADR prime sur toute
documentation technique, ticket ou règle qui le contredirait.

| ADR | Sujet | À lire avant de toucher |
|---|---|---|
| ADR-006 | Réservation de stock | stock, panier, commande |
| ADR-008 | Envoi des emails par le SMTP du domaine | emails, factures, vérification d'adresse |
| ADR-021 | Authentification de l'administration | connexion, rôles |
| ADR-022 | Palette publique | interface, styles |
| ADR-023 | Authentification client | espace client, comptes |
| ADR-024 | Atomicité réservation et commande | tunnel, transactions |
| ADR-025 | Modes de livraison, trois modes | livraison, transporteur, tunnel |
| ADR-026 | Sections de fiche produit ordonnées | fiche produit, catalogue, administration des produits |
| ADR-027 | Limitation de débit, journal des connexions, réauthentification | connexion, sessions, actions sensibles |

Cette table se met à jour à chaque ADR créé. Un ADR absent d'ici reste
opposable : la table est un raccourci, `docs/adr/` fait foi.

## Les cinq fichiers de règles, et quand ils se chargent

`.claude/rules/` porte l'application détaillée des invariants : l'instruction SQL
exacte, la valeur du délai, le jeton de couleur. Chacun porte un frontmatter
`paths` et **se charge quand une session touche les chemins concernés**.

| Fichier | Se charge sur |
|---|---|
| `database.md` | `prisma/**`, `src/repositories/**`, `src/services/**` |
| `payments.md` | `src/integrations/stripe/**`, webhooks, checkout, commandes |
| `legal.md` | services de rétractation et de facturation, pages légales |
| `frontend-design.md` | `src/app/**`, `src/components/**`, styles |
| `securite.md` | `src/lib/**`, `src/integrations/email/**`, `src/services/autorisation.ts`, `src/services/reauthentification.ts` |

Une session qui conçoit le paiement sans toucher à `src/integrations/stripe/`
doit donc lire `payments.md` explicitement.

`frontend-design.md` renvoie vers `docs/architecture/PROTOTYPE.md`, qui n'est
**pas** une source de vérité : il décrit une intention visuelle et perd contre un
ADR, une règle ou la loi. Il documente lui-même les cinq points sur lesquels le
prototype diverge du projet.

## Lire les commentaires Jira, pas seulement la description

Un commentaire récent rectifie souvent la description, qui n'est pas toujours
réécrite ensuite. Demander explicitement le champ `comment`, il ne revient pas par
défaut.

Le cas s'est produit plusieurs fois sur ce projet, sur LS-27 et LS-33. Le motif
est constant : une décision évolue, un commentaire la porte, la description garde
l'ancienne version. **Se fier à la description seule fait reconstruire une
conception abandonnée**, sans qu'aucun contrôle ne le signale.

En cas de contradiction, le plus récent l'emporte, et l'écart se signale plutôt
que de se résoudre en silence.

**Deux exceptions à cette règle, rencontrées toutes deux.** Une description
*réécrite* est à jour et n'a plus de commentaire rectificatif : LS-70 est dans ce
cas depuis le 30 juillet 2026, chercher un commentaire qui la corrige ne donnerait
rien. Et un commentaire peut être périmé à son tour par un **ADR accepté après
lui**, l'ADR étant au-dessus de Jira dans l'ordre des sources de vérité : c'est ce
qui est arrivé au commentaire du 29 juillet de LS-50, réclamant un travail
qu'ADR-024 avait déjà tranché.

Réécrire une description plutôt qu'empiler un commentaire de plus est donc la
bonne réponse quand elle devient franchement fausse, ce que LS-48 a fait pour
LS-27 et LS-33.

Aucun exemple daté n'est recopié ici : il se périmerait au commentaire suivant,
ce qui est arrivé à celui que `CLAUDE.md` portait sur LS-27.
