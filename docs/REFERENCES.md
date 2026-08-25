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
| `docs/PROCEDURE-DROITS-DES-PERSONNES.md` | répondre à une demande d'accès, de rectification ou d'effacement, délai d'un mois, ce qui part et ce qui reste | toute demande d'une personne sur ses données |

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
| `src/services/commande.ts` | passation de commande, LS-117 : la transaction unique d'ADR-024, numéro, figement, réservation | supprime `panier/actions.ts`, dont le `commandeId` reçu d'un argument permettait de réserver le stock d'autrui ; le rejeu d'interblocage vit ici, seul chemin de production |
| `src/app/(boutique)/panier/actions-panier.ts` | Server Actions du panier, LS-114 : ajout, changement de quantité, retrait, écriture du cookie | ne touche aucun stock, la réservation reste à l'étape 4 du parcours 1 |
| `src/lib/panier-cookie.ts` | signature HMAC du cookie de panier, LS-114 | le cookie ne porte **jamais** de prix, et la signature établit l'intégrité, jamais une autorisation |
| `src/services/panier.ts` | revalidation du panier contre la base, étape 3 du parcours 1 | tout montant vient d'ici, jamais du cookie ni du navigateur |
| `src/lib/livraison.ts` | tarifs et calcul serveur des frais de port, LS-115 | **source unique** des tarifs et du seuil : un montant écrit en dur dans un composant serait une information précontractuelle fausse |
| `src/lib/tunnel-cookie.ts` | saisie du tunnel en cookie signé, LS-115 | étiquette `tunnel-v1` distincte de `panier-v1`, **aucun montant** dans la charge signée, et un `emisA` signé que le serveur vérifie au décodage, LS-117 : le `maxAge` seul ne lie que le navigateur |
| `src/services/tunnel.ts` | assemblage du récapitulatif, étape 3b du parcours 1 | exige un mode de livraison **choisi** par son type, `null` signifiant « non choisi » |
| `src/integrations/mondial-relay/` | points de retrait derrière une interface, LS-115 | une indisponibilité du transporteur **dégrade le choix, elle ne ferme jamais la vente** : le domicile n'exige aucun appel externe, cas d'erreur du parcours 1. LS-27 interdit toute réponse d'API inventée |
| `src/app/(boutique)/commande/` | les quatre étapes du tunnel, LS-115 | le bouton porte la mention imposée par L221-14 alinéa 2, la zone desservie s'annonce à l'**entrée**, alinéa 3 |
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
| `src/services/catalogue.ts` | catégories et produits, C3, C24, C26. **`creerProduit` écrit le produit ET ses quatre sections dans une seule transaction**, LS-100, et c'est le seul endroit du dépôt qui les écrit | aucune |
| `src/services/sections-produit.ts` | sections éditoriales : C20, C22, C23, les **quatre** sections par défaut d'ADR-026, appartenance vérifiée au produit, LS-100 | aucune |
| `src/repositories/sections-produit.ts` | accès aux sections, `ecrireRang` en SQL brut sous contrainte différable | aucune |
| `src/integrations/medias/traitement.ts` | traitement des photographies : onze déclinaisons, EXIF retiré **par défaut donc invisible**, orientation, aplatissement blanc du JPEG, refus SVG et PDF sur signature, LS-102 | aucune |
| `src/integrations/medias/stockage.ts` | volume à deux dossiers, la publication est un **déplacement** de `quarantaine/` vers `public/`, original supprimé | aucune |
| `src/services/media.ts` | orchestration des trois effets, base, disque et traitement. **Le réordonnancement écrit le rang 1 en dernier**, l'index partiel n'étant pas différable | la purge de quarantaine n'est appelée par aucune tâche, LS-72 |
| `src/services/variante.ts` | variantes : C2, C13, C14, refus d'unicité nommant le produit porteur, archivage qui ne touche ni le stock ni les commandes, LS-101 | aucune |
| `src/services/variante-validation.ts` | conversion euros vers centimes **par découpage de chaîne**, invariant 1, et normalisation de la référence en majuscules | aucune |
| `src/repositories/variante.ts` | accès aux variantes. **Aucune fonction de suppression**, C13 | aucune |
| `src/app/administration/produits/[id]/` | éditeur de fiche produit et déclinaisons : page gardée, neuf Server Actions, deux composants clients | ni média, ni publication : LS-102 et LS-103 |
| `src/services/suppression-compte.ts` | suppression de compte et export RGPD, **première action sensible du dépôt**, dissociation plutôt qu'effacement, règle V15 | aucune |
| `src/repositories/limitation.ts` | compteur de débit applicatif sur `RateLimit`, clé préfixée `action:`, LS-92 | aucune |
| `src/services/limitation-action.ts` | seuils par action et journalisation des tentatives, LS-92 | aucune |
| `src/services/purge-journaux.ts` | purges des trois journaux, un échec n'empêche pas les autres, LS-94 | aucune |
| `src/lib/proxies-de-confiance.ts` | lecture de `BETTER_AUTH_TRUSTED_PROXIES`, **sans aucun import du projet**, LS-91 | aucune |
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
| ADR-007 | Stockage des médias sur volume local, traitement par sharp | médias, photographies, téléversement, sauvegarde, Nginx |
| ADR-008 | Envoi des emails par le SMTP du domaine | emails, factures, vérification d'adresse |
| ADR-021 | Authentification de l'administration | connexion, rôles |
| ADR-022 | Palette publique | interface, styles |
| ADR-023 | Authentification client | espace client, comptes |
| ADR-024 | Atomicité réservation et commande | tunnel, transactions |
| ADR-025 | Modes de livraison, trois modes | livraison, transporteur, tunnel |
| ADR-026 | Sections de fiche produit ordonnées | fiche produit, catalogue, administration des produits |
| ADR-027 | Limitation de débit, journal des connexions, réauthentification | connexion, sessions, actions sensibles |
| ADR-028 | Conservation des avis, sans limite de durée | avis, modération, registre des traitements |
| ADR-029 | Référence de variante modifiable, avertissement à l'écran | variante, référence, avis, statistiques par référence |
| ADR-030 | Un mouvement de stock ne se compense qu'une fois | stock, mouvement, compensation, correction, inventaire |
| ADR-031 | Le numéro de commande vient d'une table compteur, sans trou | numéro, numérotation, commande, facture, avoir, séquence |
| ADR-032 | Un double encaissement est alerté et remboursé à la main | double paiement, deux sessions, remboursement, expiration de session, idempotence Stripe |

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

## Les deux skills du projet

`.claude/skills/` les porte, un dossier par skill avec son `SKILL.md`.

| Skill | Invocation | Ce qu'il porte |
|---|---|---|
| `story` | automatique dès qu'un travail touche le code, le schéma, un prototype ou un document | le cycle complet : cadre du ticket, quinze questions avant zone critique, test d'abord sur le stock, clôture sur les quatre canaux |
| `adr` | **manuelle seulement**, `disable-model-invocation: true` | la rédaction d'une décision d'architecture versionnée, sa numérotation et son ajout à la table ci-dessus |

`adr` ne s'invoque pas tout seul, et c'est voulu : décider qu'une décision est
structurante appartient à Christophe, pas au modèle. Une story qui rencontre un
choix non tranché le signale et propose l'ADR, elle ne l'écrit pas d'office.

## Les cinq hooks, et ce que chacun garde

`.claude/settings.json` les déclare, `.claude/scripts/` les porte. Un hook
présent mais non déclaré ne s'exécute jamais, et un script absent produit une
erreur non bloquante que rien ne signale : la cohérence des deux sens est
vérifiée par `./scripts/verifier-config-claude.sh`.

| Événement | Script | Ce qu'il garde |
|---|---|---|
| `SessionStart` | `hook-session-start.sh` | injecte branche, état du dépôt et prochaine étape du dernier journal. Matcher `startup\|clear` seulement, pour ne pas réinjecter après chaque compaction |
| `PreToolUse` | `hook-block-secret-files.sh`, `hook-block-secret-commands.sh` | bloque la lecture d'une valeur de secret, fichier comme commande |
| `PostToolUse` | `hook-verifier-regles.sh` | rejoue `verifier-regles.sh` après une écriture |
| `PreCompact` | `hook-precompact.sh` | avertit avant que le contexte disparaisse. **Ne peut pas injecter de contexte**, seuls `SessionStart`, `UserPromptSubmit` et `UserPromptExpansion` le peuvent |
| `Stop` | `hook-warn-unpushed.sh`, `verifier-config-claude.sh`, `verifier-jira.sh` | contrôle le canal Dépôt, la configuration et Jira en fin de session |

Les hooks de `SessionStart` écrivent leur contexte sur **stdout**, en JSON portant
`hookSpecificOutput.hookEventName` et `additionalContext`. Les autres écrivent
leurs diagnostics sur **stderr** : une écriture parasite sur stdout casserait
l'analyse du JSON, et le contexte serait perdu sans message d'erreur.

## Les trois agents projet, et quand les appeler

`.claude/agents/` les porte. Ils ne se déclenchent pas seuls : c'est la session
qui décide de les invoquer, ce qui rend cette table utile.

| Agent | À appeler | Ne relit pas |
|---|---|---|
| `ls-critical-reviewer` | après une story touchant stock, réservation, paiement, webhook, facture ou autorisation | l'interface, la conteneurisation |
| `ls-conteneurisation` | Dockerfile, Compose, déploiement, image GHCR, retour arrière, sauvegarde | le code applicatif |
| `ls-frontend-revue` | après un écran d'administration ou une page publique, avant clôture | la logique métier, domaine du premier |

**Ne pas invoquer les agents globaux** `docker-devops`, `security-auditor` ni
`nextjs-architect` : ils sont calibrés sur NextAuth v5, PostgreSQL 16, Redis 7 et
du multi-tenant, quand ce projet est en Better Auth 1.6, PostgreSQL 18, sans
Redis et mono-tenant, que `docker-devops` traite pourtant comme requis.
