# Références du projet, quoi lire avant de concevoir

Ce fichier porte les tables d'aiguillage vers la documentation technique et les
décisions d'architecture. Il est sorti de `CLAUDE.md` le 30 juillet 2026, celui-ci
dépassant les 200 lignes recommandées pour un fichier chargé à chaque session.

`CLAUDE.md` garde l'ordre de priorité des sources et renvoie ici pour le détail.

## Documentation technique, les quatre documents à connaître

Les lire avant de concevoir sur le domaine concerné, plutôt que de reconstituer
une règle depuis le schéma.

| Fichier | Ce qu'il porte | À lire avant |
|---|---|---|
| `docs/architecture/PARCOURS.md` | huit parcours et leurs cas d'erreur, contrat d'entrée du modèle | toute fonctionnalité |
| `docs/architecture/MODELE-CONCEPTUEL.md` | entités, règles de gestion numérotées (C, S, V, F, L, R, E, A), décisions A à I | schéma, service, migration |
| `docs/architecture/MODELE-LOGIQUE.md` | traduction physique, index partiels, politiques de suppression, dettes de phase 1 | Prisma, migration |
| `docs/architecture/STATISTIQUES.md` | indicateurs, périodes en `Europe/Paris`, règles de calcul | statistiques, e-reporting, tout agrégat de montant |

**Une règle numérotée se cite par son identifiant**, S12 ou V14, jamais
paraphrasée seule : c'est ce qui permet aux contrôles textuels de la retrouver.

`docs/journal/` porte l'avancement réel, une page par session. Lire la plus
récente donne l'état du projet plus vite que Jira.

## Code applicatif existant, et ses dettes

`src/` n'est plus vide depuis LS-50. Ce que la couche métier porte déjà, à
connaître avant d'écrire un service qui la recouvrirait ou la contredirait :

| Module | Ce qu'il porte | Dette attachée |
|---|---|---|
| `src/services/reservation.ts` | réservation d'un panier : tri déterministe des variantes, rejeu borné sur interblocage, refus par exception | garde locale sur la quantité, **à remplacer par le socle Zod de LS-71** |
| `src/repositories/stock.ts` | l'`UPDATE` conditionnel d'ADR-006, en `$queryRawUnsafe`, réexporté par `tests/aide/reservation-sql.ts` | aucune |

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
| ADR-021 | Authentification de l'administration | connexion, rôles |
| ADR-022 | Palette publique | interface, styles |
| ADR-023 | Authentification client | espace client, comptes |
| ADR-024 | Atomicité réservation et commande | tunnel, transactions |
| ADR-025 | Modes de livraison, trois modes | livraison, transporteur, tunnel |
| ADR-026 | Sections de fiche produit ordonnées | fiche produit, catalogue, administration des produits |

Cette table se met à jour à chaque ADR créé. Un ADR absent d'ici reste
opposable : la table est un raccourci, `docs/adr/` fait foi.

## Les quatre fichiers de règles, et quand ils se chargent

`.claude/rules/` porte l'application détaillée des invariants : l'instruction SQL
exacte, la valeur du délai, le jeton de couleur. Chacun porte un frontmatter
`paths` et **se charge quand une session touche les chemins concernés**.

| Fichier | Se charge sur |
|---|---|
| `database.md` | `prisma/**`, `src/repositories/**`, `src/services/**` |
| `payments.md` | `src/integrations/stripe/**`, webhooks, checkout, commandes |
| `legal.md` | services de rétractation et de facturation, pages légales |
| `frontend-design.md` | `src/app/**`, `src/components/**`, styles |

Une session qui conçoit le paiement sans toucher à `src/integrations/stripe/`
doit donc lire `payments.md` explicitement.

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
