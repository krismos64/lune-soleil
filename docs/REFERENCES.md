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
| `src/lib/commande-cookie.ts` | commande en cours de paiement, cookie signé, LS-118 | étiquette `commande-v1`, **un identifiant technique et rien d'autre**, une heure. Il prouve que ce navigateur a passé la commande, il n'est **pas** le jeton d'accès durable de LS-57 |
| `src/services/paiement.ts` | création de session de paiement et lecture d'état, LS-118, étapes 5 et 6 du parcours 1 | `passerCommandeEtDemarrerPaiement` porte la frontière d'ADR-024, la session **après** le commit. Aucun appel de remboursement, ADR-032, et la mécanique appartient à la phase 4. **Deux protections et non une** contre les sessions concurrentes, corrigé le 27 août 2026 : le rattrapage après création, et un verrou de ligne sur la transaction qui rattache, sans lequel deux rattachements ne se voient pas en `READ COMMITTED` |
| `src/repositories/paiement.ts` | tentatives de paiement : encaissement, dernière session, écriture | le prédicat d'encaissement porte les **trois** états, jamais le seul `REUSSI`, LS-45 |
| `src/services/webhook-paiement.ts` | confirmation par événement signé, LS-119, étape 7 du parcours 1 : encaissement, statut de commande, mouvement de stock, historisation | l'idempotence est ancrée sur l'**effet** et non sur l'identifiant d'événement, qui ne ferme que le rejeu du même événement. **Une violation d'unicité avorte la transaction PostgreSQL entière**, `25P02` : la lecture précède l'écriture, la contrainte restant la seconde ligne de défense. Aucun remboursement automatique, ADR-032 |
| `src/repositories/confirmation.ts` | écritures de l'étape 7 : consommation de réservation et sortie de stock en une instruction, mouvement, historique, alerte | le plancher à zéro est imposé par `chk_variante_physique_positif`, C5 : descendre sous zéro ferait lever la transaction, donc perdre l'événement et le rejouer indéfiniment. Le service alerte à la place, arbitrage du 27 août 2026 |
| `src/app/api/webhooks/paiement/route.ts` | adaptateur d'entrée du webhook, LS-119 | le corps est lu en **texte brut** : la signature porte sur les octets exacts, un aller-retour par `JSON.parse` ferait refuser toute signature légitime. **200 sur toutes les issues métier**, refus de signature compris, un événement mal signé ne devenant pas valide au rejeu ; 500 sur une panne seulement |
| `src/services/document-comptable.ts` | rendu du PDF d'un document et reprise après échec, LS-129 et ADR-034 | **appelé APRÈS le commit du webhook, jamais dedans** : une écriture disque dans la transaction la ferait avorter sur disque plein, perdant le paiement pour un fichier manquant. Il ne lève jamais, **lecture comprise** : une erreur avant le `try` faisait rendre 500, et le rejeu sortant en `DEJA_TRAITE` ne retentait plus le rendu, laissant une facture sans document **et sans alerte** |
| `src/integrations/pdf/rendu-document.ts` | rendu et écriture atomique sur le volume local, ADR-007 | le temporaire est unique **par tentative** et non dérivé du numéro : partagé, deux rendus concurrents faisaient échouer le second en `ENOENT`, qui levait une alerte sur un document pourtant correct. La racine est **distincte de celle des médias**, servis publiquement par Nginx quand une facture ne doit jamais l'être |
| `src/integrations/pdf/gabarit-document.tsx` | gabarit de la facture et de l'avoir, ne lit que l'instantané légal | **la police est embarquée, jamais celle par défaut** : `@react-pdf/renderer` ne lève pas sur un caractère absent, il le **remplace en silence**, et un nom de client déformé sur un document légal ne se signale par rien. Le test extrait le texte du PDF, une assertion sur l'absence d'exception ne prouverait rien |
| `src/lib/jeton-acces.ts` | jetons d'accès sans compte, LS-132 : engendrer, signer, empreinte, composer le lien | **la valeur et l'empreinte ne se confondent pas**, règle L5 : la première part au client et n'existe nulle part côté serveur, la seconde est ce que la base retient. La signature permet de refuser une valeur forgée **sans toucher la base**, ce qui ferme l'énumération à coût constant. Étiquette `document-v1`, distincte des trois cookies signés qui partagent la même clé maître |
| `src/services/acces-document.ts` | les quatre conditions d'un lien de facture et le refus uniforme, LS-132 | **quatre conditions et non trois** : L9 en porte trois d'état, la quatrième est la signature. Le type de retour n'a **qu'un seul cas de refus**, sans motif : une énumération de motifs finirait affichée et reconstituerait un oracle. La portée `DOCUMENT` **ne se consomme pas**, une facture se consultant plusieurs fois |
| `src/app/(boutique)/facture/[jeton]/route.ts` | adaptateur qui sert le PDF sur lien signé, LS-132 | **404 sur tous les refus, jamais 403** : un 403 révélerait que le document existe. Le fichier manquant du volume rend le **même** refus, une anomalie d'exploitation ne devant pas apprendre au client que sa commande existe. `attachment` et non `inline`, l'URL signée resterait sinon dans l'historique du navigateur |
| `src/services/avoir.ts` | remboursement et émission de l'avoir, LS-128, étapes 4 à 6 du parcours 4 | **le prestataire d'abord, la base ensuite** : un avoir ne naît que si l'argent est réellement parti, et l'appel réseau est hors transaction. La clé d'idempotence porte l'**identité de la demande**, jamais un cumul : dérivée de `montantAvoirCentimes`, elle changeait entre deux tentatives du même geste et faisait partir un second remboursement réel, 4000 centimes rendus pour 2000. L'intention est réservée AVANT l'appel, et libérée s'il n'aboutit pas. **`demanderRemboursement` porte les deux gardes**, LS-160 : le rôle puis la fraîcheur d'identité, dans cet ordre, et c'est elle qui porte la marque de famille `REMBOURSEMENT`. La Server Action qui l'appelle exige le rôle une seconde fois, pour fermer le point d'entrée HTTP |
| `src/repositories/avoir.ts` | écriture de l'avoir, cumul de la facture, réservation d'intention, LS-128 | l'avoir et l'`increment` du cumul sont **indissociables**, aucun chemin ne doit appeler la moitié. L'unicité `(facture_id, cle_idempotence)` sérialise deux demandes identiques concurrentes, et `chk_facture_avoir_borne` reste la seconde ligne de défense : il protège l'écriture comptable, **jamais la sortie d'argent**, se déclenchant après le départ des fonds |
| `src/services/liberation-reservations.ts` | tâche des 5 minutes, LS-120 : rend au catalogue les réservations échues | idempotente **par construction**, la ligne étant supprimée dans la même instruction que le décrément. **Elle verrouille les variantes AVANT de supprimer**, ordre imposé par la confirmation de LS-119 : l'ordre inverse s'interbloque et laisse une pièce payée non déstockée, preuve dans `docs/prototypes/interblocage-liberation-confirmation.sh`. Une variante incohérente est **écartée**, jamais bloquante pour les autres |
| `src/services/reconciliation-paiements.ts` | tâche des 15 minutes, LS-120 : régularise les commandes en attente depuis plus d'une heure | elle appelle **le même service que le webhook** avec l'origine `RECONCILIATION`, decision D : réécrire la confirmation produirait deux mécaniques à garder d'accord. **Ne pas savoir n'autorise aucune décision**, une panne fait sauter la commande et jamais annuler. L'échec est porté **commande par commande**, motif de `purge-journaux` |
| `src/services/administration-commandes.ts` | liste, détail et transitions de statut décidées par l'exploitante, LS-121 | `TRANSITIONS_ADMINISTRATRICE` est une **table** et non une suite de conditions : la même source décide de ce qui s'affiche et de ce qui est accepté, donc l'écran et le service ne peuvent pas diverger. **`LIVREE` n'y figure nulle part**, le statut ne se supposant jamais sans source fiable, `payments.md` : la date de livraison fait courir le délai de rétractation, et c'est LS-33 qui décidera comment le site l'apprend |
| `src/app/administration/commandes/` | les deux écrans et leur Server Action, LS-121 | la garde de rôle vit dans la page **et** dans l'action, motif de LS-89. `scripts/verifier-gardes-administration.sh` le vérifie **par fonction** |
| `src/integrations/stripe/` | contrats dans `fournisseur.ts` et `evenements.ts`, appels réels et vérification de signature dans `index.ts` | **vérifié de bout en bout le 31 août 2026** contre l'API réelle, en mode test, LS-18 close. Le passage en clés `sk_live_` reste en phase 6. Sans `STRIPE_SECRET_KEY` le paiement est *indisponible* et non en panne serveur : la commande s'enregistre, l'écran propose le réessai. Même motif que `integrations/email` |
| `src/services/tunnel.ts` | assemblage du récapitulatif, étape 3b du parcours 1 | exige un mode de livraison **choisi** par son type, `null` signifiant « non choisi » |
| `src/integrations/mondial-relay/` | points de retrait derrière une interface, LS-115 | une indisponibilité du transporteur **dégrade le choix, elle ne ferme jamais la vente** : le domicile n'exige aucun appel externe, cas d'erreur du parcours 1. LS-27 interdit toute réponse d'API inventée |
| `src/app/(boutique)/commande/` | les quatre étapes du tunnel, LS-115 | le bouton porte la mention imposée par L221-14 alinéa 2, la zone desservie s'annonce à l'**entrée**, alinéa 3 |
| `src/repositories/stock.ts` | l'`UPDATE` conditionnel d'ADR-006, en `$queryRawUnsafe`, réexporté par `tests/aide/reservation-sql.ts` | aucune |
| `src/lib/auth.ts` | instance Better Auth : mapping vers `Utilisateur`, `role` en `input: false`, seize caractères, plugin passkey, session d'un jour prolongée à l'usage, LS-81 | vérification d'email **désactivée** : l'envoi existe depuis LS-82, le blocage restant est le parcours autour, écran d'attente et renvoi du lien, LS-54 |
| `src/lib/auth-client.ts` | client navigateur, passkey comprise | aucune |
| `src/lib/mot-de-passe.ts` | les deux longueurs, **sans aucun import** pour rester servable au navigateur | aucune |
| `src/services/autorisation.ts` | `lireIdentite`, `exigerSession`, `exigerAdministratrice`, et `exigerRole` qui traduit le refus en `null` pour les Server Actions, LS-158 | aucune, les sept copies locales des écrans sont remplacées |
| `src/lib/montant.ts` | `formaterMontant` et `centimesVersSaisie`, **seul endroit du dépôt où des centimes deviennent des euros**, LS-158 | aucune, neuf copies remplacées ; la division est un affichage, invariant 1 |
| `src/repositories/utilisateur.ts` | profil et lectures de l'export RGPD, LS-158 | **aucune fonction n'écrit `role`**, règle E11, et le type de `mettreAJourProfil` énumère ses champs |
| `src/services/reauthentification.ts` | `exigerReauthentificationRecente`, quatre familles d'actions sensibles, fenêtre de quinze minutes, LS-81 | la première action gardée est la suppression de compte, LS-95, famille `IDENTIFIANTS` ; les familles encore sans action vivent dans `.claude/familles-sans-action.txt` |
| `src/services/journal-connexion.ts` | journal des connexions : écriture qui ne lève jamais, purge à six mois, lecture pour l'écran, LS-80 | aucune, la purge est appelée chaque nuit par `purge-journaux` depuis LS-94 |
| `src/lib/hook-journal-connexion.ts` | hook `after` de Better Auth, table des chemins de connexion, journalisation des refus de cadence, LS-80 | `BETTER_AUTH_TRUSTED_PROXIES` est lue par `proxies-de-confiance.ts` depuis LS-91 ; la constatation en production reste LS-96 |
| `src/lib/issue-connexion.ts` | `lireResultat`, défaut fermé sur l'issue d'une tentative, **sans aucun import du projet** | aucune |
| `src/repositories/verrou.ts` | prise de verrou atomique en une instruction, `ON CONFLICT DO UPDATE` conditionnel à l'expiration, relâchement conditionnel au détenteur, LS-72 | aucune |
| `src/services/tache-planifiee.ts` | `executerSousVerrou`, table des tâches et durées de verrou, relâchement garanti en `finally` | **les cinq tâches travaillent**, `envoi-emails` ajoutée par LS-82. Elle tourne toutes les minutes, la plus fréquente, parce qu'elle porte un délai **vu par le client** ; son verrou de cinq minutes est plus long que les autres, l'appel réseau n'étant borné par rien côté serveur distant |
| `src/lib/secret-cron.ts` | secret partagé des routes internes, comparaison à temps constant, **sans aucun import du projet** | aucune |
| `src/services/preuve-identite.ts` | **seul point d'entrée qui écrit une preuve**, vérification par mot de passe ou fraîcheur de session pour la passkey, LS-89 | aucune |
| `src/services/utilisateur.ts` | mise à jour de profil, schéma Zod `.strict()`, règle E11 | aucune |
| `src/services/catalogue.ts` | catégories et produits, C3, C24, C26. **`creerProduit` écrit le produit ET ses quatre sections dans une seule transaction**, LS-100, et c'est le seul endroit du dépôt qui les écrit | aucune |
| `src/services/sections-produit.ts` | sections éditoriales : C20, C22, C23, les **quatre** sections par défaut d'ADR-026, appartenance vérifiée au produit, LS-100 | aucune |
| `src/repositories/sections-produit.ts` | accès aux sections, `ecrireRang` en SQL brut sous contrainte différable | aucune |
| `src/integrations/medias/traitement.ts` | traitement des photographies : onze déclinaisons, EXIF retiré **par défaut donc invisible**, orientation, aplatissement blanc du JPEG, refus SVG et PDF sur signature, LS-102 | aucune |
| `src/integrations/medias/stockage.ts` | volume à deux dossiers, la publication est un **déplacement** de `quarantaine/` vers `public/`, original supprimé | aucune |
| `src/services/media.ts` | orchestration des trois effets, base, disque et traitement. **Le réordonnancement écrit le rang 1 en dernier**, l'index partiel n'étant pas différable | aucune, la tâche `purge-quarantaine-medias` appelle la purge de quarantaine, LS-102 |
| `src/services/variante.ts` | variantes : C2, C13, C14, refus d'unicité nommant le produit porteur, archivage qui ne touche ni le stock ni les commandes, LS-101 | aucune |
| `src/services/variante-validation.ts` | conversion euros vers centimes **par découpage de chaîne**, invariant 1, et normalisation de la référence en majuscules | aucune |
| `src/repositories/variante.ts` | accès aux variantes. **Aucune fonction de suppression**, C13 | aucune |
| `src/app/administration/produits/[id]/` | éditeur de fiche produit et déclinaisons : page gardée, neuf Server Actions, deux composants clients | ni média, ni publication : LS-102 et LS-103 |
| `src/services/suppression-compte.ts` | suppression de compte et export RGPD, **première action sensible du dépôt**, dissociation plutôt qu'effacement, règle V15 | aucune |
| `src/repositories/limitation.ts` | compteur de débit applicatif sur `RateLimit`, clé préfixée `action:`, LS-92 | aucune |
| `src/services/limitation-action.ts` | seuils par action et journalisation des tentatives, LS-92 | aucune |
| `src/services/purge-journaux.ts` | purges des trois journaux, un échec n'empêche pas les autres, LS-94 | aucune |
| `src/lib/proxies-de-confiance.ts` | lecture de `BETTER_AUTH_TRUSTED_PROXIES`, **sans aucun import du projet**, LS-91 | aucune |
| `src/integrations/email/index.ts` | interface `EnvoyeurEmail`, et l'implémentation d'attente qui journalise sans envoyer | `envoyeurJournalise` survit pour les tests et les environnements sans SMTP ; le chemin de production passe par `smtp.ts` |
| `src/integrations/email/smtp.ts` | envoi réel par nodemailer, LS-82 : lecture de configuration, classement des erreurs, filtrage du motif | **`EAUTH` et `ENOAUTH` n'ouvrent aucune retentative**, un mot de passe faux le restant au troisième essai tout en entamant le quota de 200 messages par heure du MX Plan. Aucune réponse brute du serveur n'entre en base ni au journal, un refus SMTP transportant parfois l'identifiant de connexion |
| `src/integrations/email/modeles.ts` | rendu des trois messages d'authentification, texte brut | **les six textes F-MAIL-01 à F-MAIL-06 restent dus par LS-29**, ils demandent la validation de l'exploitante et n'entrent pas ici sans elle |
| `src/services/envoi-email.ts` | outbox et envoi direct, LS-82 et ADR-033 : `deposerEnvoi`, `expedierEnvoisEnAttente`, `envoyerDirect` | **le partage entre les deux chemins est la décision d'ADR-033** : ce qui découle d'une transaction métier passe par l'outbox, ce qu'une personne attend à l'écran part directement. Un doublon d'intention est **absorbé et non propagé**, lever annulerait la transaction métier entière, donc la confirmation de commande, pour un email en double |
| `src/repositories/envoi-email.ts` | prise de lot en `FOR UPDATE SKIP LOCKED`, marquage, lignes bloquées | **la lecture et le marquage sont une seule instruction**, et le commit de ce marquage précède l'appel SMTP : marquer après reproduirait le trou qu'ADR-033 ferme. `ENVOI_EN_COURS` n'est jamais repris, `ECHOUE` l'est |
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
| ADR-033 | Outbox transactionnelle pour l'envoi des emails | email, envoi, outbox, idempotence d'envoi, doublon d'email, nodemailer, SMTP |
| ADR-034 | Rendu des documents comptables par `@react-pdf/renderer` | PDF, facture, avoir, rendu, gabarit, police, Unicode, `cheminPdf` |

Cette table se met à jour à chaque ADR créé. Un ADR absent d'ici reste
opposable : la table est un raccourci, `docs/adr/` fait foi.

## Les cinq fichiers de règles, et quand ils se chargent

`.claude/rules/` porte l'application détaillée des invariants : l'instruction SQL
exacte, la valeur du délai, le jeton de couleur. Chacun porte un frontmatter
`paths` et **se charge quand une session touche les chemins concernés**.

| Fichier | Se charge sur |
|---|---|
| `database.md` | `prisma/**`, `src/repositories/**`, `src/services/**` |
| `payments.md` | `src/integrations/stripe/**` et `pdf/**`, webhooks, les services et repositories de paiement, commande, facture et tunnel |
| `legal.md` | facturation et rendu PDF, tunnel de commande, Mondial Relay, tarifs de livraison |
| `frontend-design.md` | `src/app/**`, `src/components/**`, styles |
| `securite.md` | `src/lib/**`, `src/integrations/email/**`, `src/services/autorisation.ts`, `src/services/reauthentification.ts` |

Une session qui conçoit sur un domaine sans toucher aux chemins de sa règle doit
la lire explicitement. Chaque motif `paths` doit matcher au moins un fichier
suivi du dépôt, contrôle de `verifier-config-claude.sh` : les motifs de ces
fichiers ont déjà pointé quatre dossiers anglais jamais créés, et `payments.md`
ne se chargeait pas sur le service du webhook, LS-157.

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

## Les cinq événements de hook, et ce que chacun garde

**Cinq événements, huit commandes déclarées**, et les deux comptes se
confondent facilement : `PreToolUse` en porte deux et `Stop` trois, dont deux
contrôles réutilisés du dossier `scripts/`. Compter les scripts de
`.claude/scripts/` en donne six, et aucun de ces trois chiffres n'est faux.
Nommer lequel est compté évite de « corriger » celui qui ne l'est pas.

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
