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

Le cas s'est produit plusieurs fois sur ce projet, sur LS-27, LS-33 et LS-70. Le
motif est constant : une décision évolue, un commentaire la porte, la description
garde l'ancienne version. **Se fier à la description seule fait reconstruire une
conception abandonnée**, sans qu'aucun contrôle ne le signale.

En cas de contradiction, le plus récent l'emporte, et l'écart se signale plutôt
que de se résoudre en silence.

Aucun exemple daté n'est recopié ici : il se périmerait au commentaire suivant,
ce qui est arrivé à celui que `CLAUDE.md` portait sur LS-27.
