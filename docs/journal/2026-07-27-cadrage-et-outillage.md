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
avant un marché, libération d'une réservation expirée, conversion en vente payée.
Tracé dans ADR-006, script rejouable dans `docs/prototypes/`.

Deux conséquences techniques découvertes : Prisma ne génère pas les contraintes
`CHECK` depuis le schéma, il faudra une migration SQL manuelle. Et la réservation
exigera du SQL brut via `$queryRaw`, l'API Prisma ne sachant pas exprimer un
`UPDATE` conditionnel avec `RETURNING`.

## Ce qui a pris plus de temps que prévu

La question de la palette. Elle paraissait tranchée par la spécification UX/UI,
mais le mauvais logo avait été désigné en premier, ce qui a produit une
recommandation à annuler ensuite. La mesure colorimétrique a réglé le débat en
quelques secondes là où l'appréciation visuelle tournait en rond. Leçon : sur
une question de couleur, mesurer avant d'argumenter.

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
| LS-17 | Décisions et conventions bloquantes | Partiel : stratégie de réservation validée (ADR-006), restent les conventions et le second facteur |
| LS-10 | Benchmark court | À faire, faible priorité |
| LS-18 | Compte de paiement Stripe | Démarche externe à lancer |
| LS-19 | Médiateur de la consommation | Démarche externe à lancer |
| LS-20 | Photographies | Démarche externe à lancer |

## Prochaine étape

LS-11 puis LS-12 et LS-13, le modèle de données. C'est ce qui conditionne tout
le reste, et la porte de sortie de la phase 0 exige qu'il soit validé sur les
cinq scénarios critiques sans invention de champ manquant.

LS-17 est partiellement fait. Restent les conventions de branches et de commits,
le format des numéros de commande, facture et avoir, et le mode du second facteur
pour l'administration.

Le contrôle de la stratégie de réservation est fait, ADR-006. Le modèle de
données peut donc être construit sans risque : la variante portera
`quantiteReservee` et les trois contraintes `CHECK`.

## Rappel du jalon qui compte

Un achat de bout en bout sur une variante en stock à un exemplaire, avec
réservation atomique, événement idempotent, commande cohérente, mouvement de
stock unique et facture exacte. Tout le reste est secondaire.
