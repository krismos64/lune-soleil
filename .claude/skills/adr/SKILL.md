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
| ADR-010 | Technique de génération des PDF | l'epic facturation |

Si le sujet correspond à l'une d'elles, reprendre son numéro d'origine. Une
décision tranchée sort de ce tableau et entre dans la table des ADR acceptés de
`docs/REFERENCES.md`, qui fait foi sur ce qui est en vigueur.

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

Français orthographiquement correct, tous les accents présents. Aucun tiret
cadratin ni demi-cadratin. Aucun secret, aucune valeur de clé, aucune donnée
personnelle de l'exploitante ou d'un client : le dépôt est public.

**Ne pas écrire d'état transitoire au présent.** Une phrase du type « tant que tel
dossier est vide » ou « la table compte tant de contraintes » se périme sans que
rien ne le signale. Écrire la règle, et pour un compte, la commande qui le
produit. <!-- [exemple-perimable] -->

`./scripts/verifier-config-claude.sh` signale ces formulations.

## Un ADR n'écrase pas le cahier des charges

Quand une décision contredit le cahier des charges, l'ADR **l'amende** et le dit
explicitement, en citant la section concernée. Le document d'origine n'est pas
réécrit. C'est le mécanisme prévu par sa section 1.2.

## Après rédaction, quatre gestes

YOU MUST faire les quatre, un ADR accepté qu'aucune table ne référence sera
contredit par une future session qui ne l'a pas lu.

1. **Ajouter la ligne dans la table de `docs/REFERENCES.md`**, section « ADR
   acceptés » : identifiant, sujet, et **à lire avant de toucher à quoi**. Cette
   troisième colonne est celle qui sert : c'est elle qui fait qu'une session
   travaillant sur le stock sait qu'elle doit lire ADR-006.
2. **Committer**, passer en pull request, fusionner. Un ADR sur une branche locale
   n'est pas opposable.
3. **Mettre à jour le ticket Jira** avec le chemin du fichier et le hash du
   commit. Si la décision débloque ou bloque une story, le dire explicitement dans
   les deux tickets.
4. **Vérifier ce que l'ADR périme.** Une décision structurante contredit presque
   toujours quelque chose : une description de ticket, une règle de
   `.claude/rules/`, un passage d'un document d'architecture. Chercher les
   occurrences et les corriger dans la même story, ou créer le ticket qui le fera.

Le point 4 n'est pas théorique. ADR-025 a été accepté le 29 juillet en laissant
LS-27 annoncer un tarif unique et `.env.example` ne porter qu'une variable de
tarif : l'écart n'a été corrigé que le 30, après avoir été signalé de l'extérieur.
ADR-026 a rendu fausse la table des blocs de fiche produit de
`frontend-design.md`, corrigée dans la même story.

Si la décision remplace un ADR existant, marquer l'ancien comme remplacé plutôt
que de le supprimer, et **retirer sa ligne de la table** ou la marquer comme telle :
l'historique des décisions fait partie de la valeur du dépôt, mais la table
d'aiguillage ne doit pointer que vers des décisions en vigueur.

## Le contrôle qui rattrape l'oubli

`./scripts/verifier-config-claude.sh` compare les ADR de `docs/adr/` à la table de
`docs/REFERENCES.md` et signale tout écart. Un hook `Stop` le lance en fin de
session. Ce n'est pas une raison de sauter le point 1 : le hook avertit, il ne
corrige pas.
