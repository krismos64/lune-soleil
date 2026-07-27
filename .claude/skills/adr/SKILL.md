---
name: adr
description: Rédiger une décision d'architecture versionnée pour le projet Lune & Soleil. Utiliser quand une décision structurante doit être tranchée et tracée, quand Christophe demande un ADR, ou quand une story révèle un choix d'architecture non documenté.
disable-model-invocation: true
---

# Rédiger un ADR

Argument : le sujet de la décision. Par exemple `stockage des médias`.

## Numérotation

Lister `docs/adr/` et prendre le numéro suivant. Les numéros 001 à 021 sont
réservés aux décisions du cahier des charges, 022 est la palette publique. Les
nouvelles décisions démarrent à 023.

Nom de fichier : `docs/adr/ADR-0XX-sujet-en-kebab-case.md`.

Les décisions déjà identifiées comme ouvertes dans le cahier des charges :

| Numéro | Sujet | À trancher avant |
|---|---|---|
| ADR-007 | Stockage des médias, Cloudinary ou objet S3 | l'epic médias |
| ADR-008 | Fournisseur d'email transactionnel | l'epic emails |
| ADR-010 | Technique de génération des PDF | l'epic facturation |

Si le sujet correspond à l'une d'elles, reprendre son numéro d'origine.

## Structure obligatoire

Suivre le format d'`ADR-022-palette-publique.md`, qui sert de modèle.

```markdown
# ADR-0XX : titre court et factuel

| Champ | Valeur |
|---|---|
| Statut | Accepté, Proposé, Remplacé par ADR-0YY |
| Date | jour mois année |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-xx |

## Contexte
Ce qui rend la décision nécessaire. Les contraintes réelles du projet.

## Décision
Ce qui est décidé, en une ou deux phrases nettes.

## Alternatives écartées
Chaque option envisagée, et pourquoi elle n'est pas retenue. Avec des
mesures ou des chiffres quand c'est possible.

## Conséquences
Ce que la décision implique concrètement pour le code, les coûts, les
autres décisions.

## Risques
Ce qui pourrait mal tourner, et comment c'est atténué.
```

## Règles de rédaction

Une décision se justifie par des faits, pas par des préférences. Quand une mesure
est possible, la faire : contraste calculé, coût mensuel réel, taille de bundle,
temps de réponse. ADR-022 s'appuie sur des couleurs extraites du logo et des
ratios WCAG calculés, pas sur une impression visuelle.

Nommer les alternatives écartées et dire pourquoi. Un ADR sans alternative est une
note, pas une décision.

Ne jamais décider d'une obligation juridique dans un ADR. Le droit se vérifie aux
sources officielles et, si nécessaire, auprès d'un professionnel.

Aucun tiret cadratin. Aucun secret, aucune valeur de clé, aucune donnée
personnelle de l'exploitante ou d'une cliente : le dépôt est public.

## Un ADR n'écrase pas le cahier des charges

Quand une décision contredit le cahier des charges, l'ADR **l'amende** et le dit
explicitement, en citant la section concernée. Le document d'origine n'est pas
réécrit. C'est le mécanisme prévu par sa section 1.2.

## Après rédaction

Committer le fichier. Mettre à jour le ticket Jira associé avec le chemin du
fichier et le hash du commit. Si la décision débloque une story, le signaler.

Si la décision remplace un ADR existant, marquer l'ancien comme remplacé plutôt
que de le supprimer : l'historique des décisions fait partie de la valeur du
dépôt.
