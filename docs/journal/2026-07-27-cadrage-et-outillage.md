# 27 juillet 2026, cadrage et outillage

Première session de travail. Aucune ligne de code applicatif, uniquement du
cadrage et de l'outillage.

## Fait

**Analyse des documents de cadrage.** Cahier des charges, plan directeur et
spécification UX/UI lus intégralement. Backlog Jira et espace Confluence
inspectés.

**Vérification des versions de la stack** via Context7 et les registres
officiels. Les cinq versions du cahier des charges sont exactes : Next.js
16.2.12, React 19.2.8, PostgreSQL 18.4, Prisma 7.9.0, Better Auth 1.6.25.
Aucune correction nécessaire.

**Décision de palette.** Deux logos coexistaient dans les documents, l'un avec
du bleu nuit, l'autre entièrement crème et doré. Analyse colorimétrique du logo
officiel retenu : toutes les teintes entre H30 et H37, aucun pixel bleu. Le
`primary-night #1B2A41` du cahier des charges est écarté au profit de
`#5F4519`, qui donne 8,93:1 en texte blanc dessus, conforme AAA. Tracé dans
ADR-022.

**Dépôt créé.** github.com/krismos64/lune-soleil, public, sans licence, branche
`main` protégée. Le cahier des charges et le plan directeur restent hors dépôt :
ils contiennent l'adresse du domicile de l'exploitante.

**Backlog corrigé.** LS-16 pointait vers l'annexe A périmée du cahier des
charges, LS-15 demandait quatre maquettes déjà couvertes par la spécification
UX/UI, LS-4 portait encore une date de calendrier. Corrigés.

**Epic contenus créé** (LS-22) avec huit stories. Il n'existait aucun ticket de
contenu alors que le risque « contenus non prêts » est classé probabilité élevée
et impact élevé.

**Configuration Claude Code.** Version resserrée par rapport à la section 27 du
cahier des charges : trois règles conditionnelles au lieu de sept
inconditionnelles, deux skills au lieu de six, un agent au lieu de trois. La
documentation officielle indique qu'une règle sans frontmatter `paths` coûte le
même contexte qu'une section de CLAUDE.md à chaque session.

**Garde-fous testés**, pas seulement écrits : le hook bloque `.env` et les clés,
autorise `.env.example`. Le pre-commit refuse une clé Stripe live. gitleaks
8.30.1 installé.

**MCP Atlassian migré** de l'endpoint SSE déprécié vers `/v1/mcp/authv2`.

**Stratégie de réservation de stock vérifiée par prototype**, sur PostgreSQL
18.4, avant construction du schéma. C'était le seul vrai point d'incertitude
technique du projet.

Le prototype démontre d'abord que la méthode naïve échoue réellement : deux
transactions concurrentes lisent toutes les deux `disponible = 1` et tentent de
réserver, la seconde n'étant arrêtée que par la contrainte `CHECK`, ce qui
produit une erreur de base de données au lieu d'un refus métier.

L'instruction conditionnelle unique avec `RETURNING` résout le problème. Sur
vingt requêtes simultanées sur une pièce unique, une seule réservation existe en
fin d'exécution, les dix-neuf autres reçoivent zéro ligne.

Treize assertions passent : concurrence à deux et à vingt, vente web désactivée
avant un marché, libération d'une réservation expirée, conversion en vente
payée. Tracé dans ADR-006, script rejouable dans `docs/prototypes/`.

Deux conséquences techniques découvertes : Prisma ne génère pas les contraintes
`CHECK` depuis le schéma, il faudra une migration SQL manuelle. Et la
réservation exigera du SQL brut via `$queryRaw`, l'API Prisma ne sachant pas
exprimer un `UPDATE` conditionnel avec `RETURNING`.

**Skill `story` élargi à tout travail**, pas seulement aux tickets. Voir la
section suivante, c'est une correction issue d'un manquement observé.

**LS-17 fermé**, ses trois points sont tranchés.

Conventions Git écrites dans `CONTRIBUTING.md` : branches en
`type/LS-xx-sujet`, commits Conventional avec `Refs LS-xx`, pull request
systématique même en solo.

Authentification de l'administration tranchée dans ADR-021, et elle s'écarte du
cahier des charges sur deux points. Le contexte réel a invalidé l'hypothèse de
la section 6.2 : l'exploitante est seule à gérer le site, sa soeur intervient
sur la création et les marchés sans accès au back-office. Le compte partagé n'a
plus d'objet.

L'exploitante refusait le second facteur par application, jugé trop
contraignant, et proposait de changer son mot de passe régulièrement. Cette
proposition n'a pas été retenue : le back-office contient les données
personnelles de toutes les clientes, et le changement périodique de mot de passe
n'est plus recommandé par la CNIL ni l'ANSSI. La passkey a levé l'objection,
étant moins contraignante qu'un mot de passe tout en résistant au hameçonnage.
L'exploitante possède un iPhone et un MacBook avec Touch ID sur le même compte
iCloud, la synchronisation par trousseau règle la question du second appareil.

Le mot de passe reste en secours, encadré par cinq mesures dont une alerte email
à chaque connexion par mot de passe. C'est la plus utile des cinq : elle
transforme une compromission silencieuse en incident détecté.

## Ce qui a pris plus de temps que prévu

La question de la palette. Elle paraissait tranchée par la spécification UX/UI,
mais le mauvais logo avait été désigné en premier, ce qui a produit une
recommandation à annuler ensuite. La mesure colorimétrique a réglé le débat en
quelques secondes là où l'appréciation visuelle tournait en rond. Leçon : sur
une question de couleur, mesurer avant d'argumenter.

**Autonomie de l'assistant élargie**, en fin de session, avec deux garde-fous
automatiques sur les migrations.

Christophe accorde sa confiance et ne souhaite plus valider chaque commande. Les
règles `allow` passent de douze à cinquante-neuf. La contrepartie qu'il demande
est un point en fin de chaque étape significative, avec une proposition pour la
suite plutôt qu'un enchaînement d'office.

L'écriture dans les fichiers d'environnement est autorisée, en local comme en
production, parce qu'il ne peut pas les éditer lui-même. La lecture des valeurs
reste bloquée : une valeur lue entrerait dans l'historique de session et
pourrait ressortir dans une sortie de commande. Le hook distingue désormais
l'outil appelant, vérifié sur douze cas.

Les migrations de production deviennent autonomes, via
`scripts/migrate-production.sh`. Christophe demandait initialement l'autonomie
totale, y compris destructive. La version retenue est encadrée par deux
contrôles déterministes, portés par un script et non par mon appréciation :
sauvegarde vérifiée avant toute migration, et arrêt sur détection d'une
instruction destructive, qui exige alors une confirmation explicite.

La justification tient à une différence de nature. Un déploiement de code raté
se répare en redéployant l'image précédente taguée par SHA, en trois minutes,
sans perte. Une migration destructive ne se répare pas par un retour arrière :
le code revient, les données non, et il faut restaurer une sauvegarde donc
perdre les commandes passées depuis. Sur une boutique en activité, ce sont des
commandes réelles de clientes réelles.

Détection vérifiée sur dix cas, six instructions destructives bloquées et quatre
migrations additives passées sans faux positif.

## Une régression de sécurité, détectée et corrigée

Pour pouvoir éditer `.env.example`, j'ai remplacé le glob `Read(./.env.*)` et
`Edit(./.env.*)` des règles `deny` par une liste fermée de sept noms. La revue
de sécurité automatique des commits poussés l'a signalé comme régression de
contrôle.

Elle avait raison. Tout fichier d'environnement hors de cette liste,
`.env.staging`, `.env.preprod`, `.env.ovh`, `.env.backup`, n'était plus couvert.
J'avais affaibli une protection pour résoudre un inconfort d'édition, ce qui est
le mauvais arbitrage.

La vérification dans la documentation officielle a établi trois choses. Une
règle `deny` ne peut pas porter d'exception d'autorisation, donc « refuser
`.env.*` sauf `.env.example` » est impossible : le blocage de `.env.example`
était une limite du système, pas un défaut de ma configuration. Un hook
`PreToolUse` qui sort en code 2 bloque avant l'évaluation des permissions, c'est
donc la couche la plus forte et non un filet de secours. Enfin les règles
`Write(path)` ne sont jamais évaluées, seules `Edit(path)` le sont : les huit
règles `Write()` que j'avais écrites étaient inertes.

Correction : glob large restauré et élargi aux sous-répertoires, aux formats
`p12` et `pfx` et aux clés SSH, règles inertes retirées, et le hook porte
l'exception `.env.example` avec la répartition des rôles documentée en tête de
fichier.

Leçon : ne pas affaiblir un contrôle de sécurité pour lever un inconfort.
Vérifier d'abord si le contrôle est justifié, et déplacer l'exception vers la
couche qui sait la porter.

## Un manquement à noter

Après le prototype de réservation, l'ADR et le script ont été produits mais
Jira, la mémoire et le journal n'ont pas été mis à jour. Le journal présentait
même encore le prototype comme « à faire » alors qu'il était réalisé et validé.
Christophe l'a relevé.

Cause : le skill `story` exigeait une clé de ticket et portait
`disable-model-invocation`, il ne s'appliquait donc pas à un travail
exploratoire. La discipline de traçabilité existait sur le papier mais n'était
déclenchée par rien.

Correction : le skill couvre désormais tout travail sur le projet, ticket ou
non. Son étape 0 demande d'identifier à quel ticket existant le travail se
rattache. Son étape 6 détaille les quatre canaux de traçabilité et exige de dire
lesquels ont été mis à jour. Son étape 7 ajoute trois questions de contrôle
avant de rendre la main. Le CLAUDE.md porte un rappel des quatre canaux.

Leçon plus générale : une règle qui n'est déclenchée par rien ne s'applique pas.
Soit elle vit dans un mécanisme qui se déclenche tout seul, soit elle est
déterministe via un hook. Une bonne intention documentée ne suffit pas.

## Décisions prises avec Christophe

Calendrier retiré du pilotage, aucune date de livraison. Le plan directeur garde
ses portes de sortie de phase et sa règle de coupe, ses dates sont abandonnées.

Finalité double assumée : vrai commerce pour l'exploitante et projet
démonstrateur professionnel.

Les contenus sont produits par Christophe, validés par l'exploitante. Le plan
directeur supposait l'inverse. Conséquence : ces tickets consomment la capacité
de développement, le budget de 180 heures du Go-Live était sous-évalué.

## Où on en est

Phase 0, cadrage opérationnel. Deux stories terminées sur treize.

| Ticket | Sujet | État |
|---|---|---|
| LS-21 | ADR palette publique | Terminé |
| LS-16 | Jetons de design | Terminé |
| LS-9 | Kickoff des outils | Fait en pratique, reste Confluence à remplir |
| LS-11 | Plan du site et cinq parcours critiques | À faire, prochaine étape |
| LS-12 | Modèle conceptuel de données | À faire, bloqué par LS-11 |
| LS-13 | Modèle logique de données | À faire |
| LS-14 | Diagramme de séquence de l'achat | À faire |
| LS-15 | Filaire mobile création produit admin | À faire |
| LS-17 | Décisions et conventions bloquantes | Terminé : réservation validée (ADR-006), conventions Git (CONTRIBUTING.md), authentification (ADR-021) |
| LS-10 | Benchmark court | À faire, faible priorité |
| LS-18 | Compte de paiement Stripe | Démarche externe à lancer |
| LS-19 | Médiateur de la consommation | Démarche externe à lancer |
| LS-20 | Photographies | Démarche externe à lancer |

## Prochaine étape

LS-11 puis LS-12 et LS-13, le modèle de données. C'est ce qui conditionne tout
le reste, et la porte de sortie de la phase 0 exige qu'il soit validé sur les
cinq scénarios critiques sans invention de champ manquant.

LS-17 est fermé. Le format des numéros de commande, facture et avoir reste à
définir, mais il relève de LS-13 et non de LS-17.

Le contrôle de la stratégie de réservation est fait, ADR-006. Le modèle de
données peut donc être construit sans risque : la variante portera
`quantiteReservee` et les trois contraintes `CHECK`.

## Rappel du jalon qui compte

Un achat de bout en bout sur une variante en stock à un exemplaire, avec
réservation atomique, événement idempotent, commande cohérente, mouvement de
stock unique et facture exacte. Tout le reste est secondaire.
