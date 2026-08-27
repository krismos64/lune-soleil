# 27 août 2026, trois livrables de cadrage que le code a dépassés

Suite immédiate du découpage des phases 4 à 6. Christophe a demandé si LS-10, le
benchmark, pouvait se clore, puis d'examiner LS-14 et LS-15 dans la même logique.
**Les trois sont fermées**, et une story naît de l'examen.

## Le motif commun, et pourquoi il fallait le nommer

Ces trois tickets de phase 0 devaient produire un livrable de conception **avant**
le code : un benchmark, un diagramme de séquence, un filaire. Aucun n'a été
produit, et le code est arrivé sans eux.

Fermer sans rien dire aurait laissé croire que leurs critères étaient remplis.
Chacun porte donc un commentaire qui distingue **ce qui a été fait** de **ce qui
ne l'a pas été**, et pourquoi ce dernier n'est plus un manque.

## LS-10, benchmark : les conclusions ont survécu au ticket

Une seule boutique observée sur les trois demandées, Les Paulinas le 29 juillet.
La page de conclusions n'existe pas, et le panier comme la navigation à une main
n'ont jamais été examinés dans ce cadre.

Ce n'est plus un manque : **les deux ont été conçus, écrits et mesurés** par
LS-114 et LS-115, aux quatre largeurs. Observer un concurrent ne modifierait pas
du code testé et fusionné.

Les huit enseignements des Paulinas ne dorment pas dans Jira, ils sont passés
dans `frontend-design.md`, ADR-026 et LS-100. Le ticket a rendu son service quel
que soit le compte de boutiques.

## LS-14, diagramme de séquence : couvert deux fois, et mieux

`PARCOURS.md` porte les douze étapes du parcours 1 avec ce qu'un diagramme
n'aurait pas montré : la frontière transactionnelle d'ADR-024, pourquoi l'étape 5
sort de la transaction, l'idempotence ancrée sur l'effet, le code `25P02` et le
plancher de stock à zéro.

Et `parcours-complet.sequential.test.ts` **exécute** cette séquence. Une
documentation exécutée ne se périme pas en silence.

Le dessiner aurait produit une **troisième représentation** à tenir d'accord avec
les deux autres, moins précise que chacune. Ses deux bloqueurs, LS-11 et LS-12,
étaient terminés depuis longtemps : c'est son utilité qui a disparu, pas un
blocage qui l'a retenue.

## LS-15, filaire produit : le seul des trois qui laissait quelque chose derrière

Les sept points du contenu attendu sont tous couverts par LS-99 à LS-103, et la
tension identifiée le 29 juillet a été tranchée exactement comme le commentaire
la proposait : sections facultatives non bloquantes, seul le texte alternatif
obligatoire.

**Mais le filaire portait une cible chiffrée que le code n'a pas reprise.**
`F-ADM-07`, créer un produit complet en moins de trois minutes au smartphone,
photographies comprises.

Vérifié plutôt que supposé : `grep` sur `docs/`, `.claude/`, `src/` et `tests/`.
La cible est citée dans `frontend-design.md` et dans un commentaire de
`publication-produit.tsx`. **Aucune mesure n'existe.**

Aggravant : **cinq champs ont été ajoutés le 29 juillet 2026, après que la cible
a été posée**. La tension était connue à l'époque, notée dans le ticket, et
jamais rejouée sur l'écran fini.

Fermer sans plus l'aurait fait disparaître. Christophe a arbitré : fermer et
créer une story de mesure.

## LS-145, ce que la fermeture a produit

Mesurer le parcours 3 au chronomètre sur l'écran réel, et **publier le chiffre**.
La story porte les trois façons de rendre la mesure fausse :

- **sans le téléversement réel**, alors que le traitement produit onze
  déclinaisons et que la photographie est la partie lente
- **sur un poste de développement**, quand la cible dit smartphone
- **en confondant temps de saisie et temps de traitement**, qui ne se corrigent
  pas au même endroit

Elle prévoit aussi le cas où la cible ne tiendrait pas : soit des corrections
d'ergonomie, soit un arbitrage explicite révisant la cible ou le contenu
obligatoire. Une story qui ne peut se fermer que sur un chiffre.

## Un compte annoncé de mémoire, faux

En annonçant l'état de la phase 0 à Christophe, j'ai dit « trois stories
ouvertes ». La requête Jira en rend **quatre** : LS-9, « Kickoff des outils »,
était oubliée.

Le README a donc été écrit depuis la requête et non depuis mon annonce. C'est
la troisième fois que ce piège se présente en une journée, après le compte de
la phase 2 corrigé ce matin.

## Preuves

```
LS-10   Terminé, commentaire de clôture posé
LS-14   Terminé, commentaire de clôture posé
LS-15   Terminé, commentaire de clôture posé, cible reprise par LS-145
LS-145  créée, rattachée à LS-3, assignée
comptes relevés par requête : LS-1 en compte 4, LS-3 en compte 11
```

Aucun test à jouer, cette session ne touche pas au code.

## État des tickets

| Ticket | État |
|---|---|
| LS-10, LS-14, LS-15 | fermées par péremption, chacune avec son motif écrit |
| LS-145 | créée, la cible F-ADM-07 ne se perd pas |
| LS-1, phase 0 | quatre tickets ouverts, tous des démarches externes |

## Prochaine étape

Inchangée. **LS-82**, l'envoi réel des emails, reste la story la plus utile :
priorité haute, aucune dépendance externe, et le client ne reçoit aujourd'hui
aucune confirmation de commande. **LS-126** ouvre la chaîne des documents
comptables.

Les quatre tickets restants de la phase 0 dépendent de l'exploitante et des
comptes externes, dont le bloqueur bancaire est levé.
