---
name: story
description: Conduire tout travail sur le projet Lune & Soleil de bout en bout, ticket Jira ou exploration libre, en appliquant le contrôle avant zone critique et en clôturant la traçabilité. Utiliser dès que le travail touche le code, le schéma, un prototype, une décision d'architecture ou un document du projet, que Christophe cite une clé LS-xx ou non.
---

# Conduire un travail sur Lune & Soleil

Ce skill s'applique à **tout** travail sur le projet, pas seulement aux tickets.
Un prototype, une exploration technique, une décision d'architecture ou une
correction de document suivent le même cycle. La seule différence est la présence
ou l'absence d'un ticket Jira au départ.

## 0. Identifier le cadre

**Avec une clé de ticket** (`LS-42`, ou « la story sur le catalogue ») : lire le
ticket via le MCP Atlassian, cloudId `c6efcec7-6c26-47a9-843f-65c5ce351051`.
Vérifier qu'aucun ticket bloquant n'est ouvert. Vérifier que la story est prête :
acteur, critères testables incluant les cas d'erreur, règles métier, dépendances.
Si elle ne l'est pas, poser les questions avant de coder.

**YOU MUST lire les commentaires, pas seulement la description.** Ils ne
reviennent pas par défaut : demander explicitement le champ `comment`.

```
getJiraIssue  fields: ["summary","status","description","comment"]
```

**Un commentaire récent rectifie souvent la description**, qui n'est pas toujours
réécrite ensuite. Le cas s'est produit plusieurs fois ici. Au 29 juillet 2026, la
description de LS-27 annonce « Point Relais et Locker » et un tarif unique, quand
un commentaire du même jour porte trois modes et deux tarifs, ADR-025. LS-33 est
dans le même état sur les événements de suivi.

Se fier à la description seule fait reconstruire une conception abandonnée, et
aucun contrôle automatique ne le signale.

En cas de contradiction, **le plus récent l'emporte**. Signaler l'écart à
Christophe plutôt que de le résoudre en silence, et proposer de réécrire la
description quand elle est franchement périmée, comme LS-48 l'a fait.

**Sans clé de ticket**, travail exploratoire : identifier à quel ticket existant
le travail se rattache, et le dire. Presque tout se rattache à quelque chose. Un
prototype de réservation relève de LS-17, une contrainte de schéma de LS-13.

Si vraiment rien ne correspond, le signaler à Christophe et proposer de créer le
ticket. Le cahier des charges est explicite : toute nouvelle idée entre d'abord
dans Jira et n'intègre le périmètre que par arbitrage explicite.

## 1. Déterminer si le travail touche une zone critique

Zones critiques : stock ou réservation, paiement ou événement de webhook, facture
ou avoir, autorisation ou accès à une ressource, migration de schéma, données
personnelles.

**Si oui, répondre explicitement à ces quinze questions avant d'écrire du code.**
Elles viennent de l'annexe C du cahier des charges. Ne pas les survoler.

1. Le besoin figure-t-il dans le périmètre défini ?
2. Les critères d'acceptation couvrent-ils les cas d'erreur ?
3. Le modèle de données est-il suffisant ?
4. Une transaction est-elle nécessaire ?
5. Une contrainte de base de données peut-elle garantir l'invariant ?
6. Le statut métier est-il clairement défini ?
7. L'autorisation est-elle dérivée de la session ou d'un jeton signé ?
8. Un accès à la ressource d'autrui est-il possible ?
9. L'opération doit-elle être idempotente ?
10. Une donnée doit-elle être historisée ?
11. Une trace d'audit est-elle nécessaire ?
12. Que se passe-t-il si le prestataire de paiement, d'email ou de médias est
    indisponible ?
13. Quels tests unitaires, d'intégration et de bout en bout sont nécessaires ?
14. Quel est l'impact à 320 px ?
15. Une documentation ou un ADR doit-il être mis à jour ?

Si une réponse révèle une décision d'architecture non prise, créer l'ADR avant de
coder. Ne jamais coder par-dessus une décision floue.

## 2. Vérifier la documentation des bibliothèques

Pour toute API de Next.js 16, React 19, Prisma 7, Better Auth 1.6 ou Stripe :
consulter Context7 d'abord, ces versions sont récentes. Signaler son usage.

## 3. Écrire le test d'abord sur les zones à risque

Stock, paiement, documents comptables : le test s'écrit **avant**
l'implémentation. Exigence du plan directeur, pas une préférence.

Le test de concurrence sur le stock à un exemplaire est le test phare du projet.
Sa version de référence est `docs/prototypes/reservation-test.sh`.

## 4. Travailler

Par petites étapes, en respectant les couches. Aucune logique métier dans un
composant ou une Server Action.

Passer le ticket concerné en `En cours` dans Jira au démarrage.

## 5. Vérifier

```bash
npm run type-check
npm run lint
npm run test
```

Pour de l'interface : rendu à 320, 390, 768, 1280 px, et les états vide, erreur,
pending, disabled, succès.

Pour une zone critique : test négatif de sécurité, test de concurrence ou
d'idempotence, simulation d'une panne de fournisseur.

**Montrer la sortie réelle des commandes.** Ne jamais affirmer qu'un test passe
sans le prouver. Si un résultat paraît incohérent, le vérifier plutôt que de
l'accepter : un test qui passe pour la mauvaise raison est plus dangereux qu'un
test qui échoue.

## 6. Clôturer la traçabilité, sur les quatre canaux

**Cette étape n'est pas optionnelle, y compris pour un travail exploratoire.**
Un travail non tracé sera refait ou contredit plus tard.

Passer les quatre canaux en revue et dire explicitement ce qui a été mis à jour
et ce qui ne l'a pas été.

| Canal | Quand le mettre à jour | Quoi y mettre |
|---|---|---|
| **Dépôt** | toujours | code, ADR si décision structurante, script si prototype, **commité, poussé et fusionné** |
| **Journal** | fin de session significative | ce qui est fait, ce qui a dérapé et pourquoi, prochaine étape, état des tickets |
| **Mémoire** | découverte non dérivable du code | contrainte technique, piège, décision et son pourquoi |
| **Jira** | toujours | commentaire avec l'état réel de chaque critère, le commit, ce qui reste |

Commit avec un message descriptif référençant le ticket. Jamais de
`Co-Authored-By` dans ce projet.

### Ce que le travail propage, à parcourir avant de clore

Une modification ne s'arrête presque jamais au fichier modifié. Cette table dit
quoi mettre à jour selon ce qui a été touché. La parcourir ligne à ligne, et dire
pour chaque ligne concernée ce qui a été fait.

| Si la story a touché | Alors mettre à jour |
|---|---|
| `prisma/schema.prisma` | `schema.sql`, les fichiers de contraintes, `verifier-schema.sh`, `MODELE-LOGIQUE.md`, `MODELE-CONCEPTUEL.md` si une règle numérotée change |
| une règle de gestion numérotée | `MODELE-CONCEPTUEL.md`, la règle de `.claude/rules/` correspondante, et `verifier-schema.sh` qui doit l'exercer |
| un ADR accepté | la table de `docs/REFERENCES.md`, et **ce que l'ADR périme** : descriptions de tickets, règles, documents d'architecture |
| `src/app/` ou `src/components/` | `frontend-design.md` si l'ordre des blocs ou une source de donnée change |
| une variable de configuration | `.env.example`, et le ticket qui porte la décision commerciale correspondante |
| une commande npm ou un script | `README.md`, et la section Commandes de `CLAUDE.md` si elle la cite |
| un piège rencontré deux fois | une fiche mémoire, plus un contrôle automatique si le piège est mécaniquement détectable |
| la config Claude Code, skills, agents, hooks | `docs/REFERENCES.md` si l'aiguillage change, `CLAUDE.md` s'il dépasse 200 lignes |

**Le dernier point compte autant que les autres.** `CLAUDE.md` a atteint 312
lignes avant qu'on s'en aperçoive, et quatre de ses affirmations étaient devenues
fausses.

### Le contrôle qui rattrape les oublis mécaniques

```bash
./scripts/verifier-config-claude.sh
```

Il vérifie ce qui est mesurable : ADR absent de la table d'aiguillage, `CLAUDE.md`
au-delà de 200 lignes, renvoi vers un fichier inexistant, fiche mémoire hors
index, lien mémoire mort, journal manquant alors que du code a été commité, et
formulations qui se périment.

Un hook `Stop` le lance en fin de session. **Il avertit, il ne corrige pas**, et
il ne dit rien de ce qui relève du jugement : la pertinence d'une fiche mémoire ou
la justesse d'un ADR se relisent.

### Un commit local ne livre rien

**Le canal Dépôt n'est pas clos tant que le travail est sur `main` distante.**
Une branche locale, même parfaitement commitée, n'existe pour personne d'autre.
Le 28 juillet 2026, deux stories ont été déclarées terminées avec six commits qui
n'avaient jamais quitté la machine.

`CONTRIBUTING.md` exige une pull request systématique, même en solo, et `main` est
protégée : historique linéaire, pas de force-push.

```bash
git push -u origin type/LS-xx-sujet
gh pr create --base main --title "..." --body "..."
gh pr view <n> --json mergeStateStatus,statusCheckRollup   # attendre le vert
gh pr merge <n> --rebase --delete-branch
```

Quatre points qui se ratent facilement :

- **Attendre les contrôles**, ne pas fusionner sur un `UNSTABLE` ou un
  `IN_PROGRESS`. `CONTRIBUTING.md` l'interdit explicitement.
- **Fusionner en `--rebase`**, jamais en merge commit, l'historique de `main`
  devant rester linéaire.
- **Le rebase réécrit les SHA.** Ceux cités dans un commentaire Jira posté avant
  la fusion deviennent invalides. Poster la correspondance, ou ne citer les SHA
  qu'après fusion.
- La pull request porte ce que `CONTRIBUTING.md` attend, dont **la sortie réelle
  des commandes de vérification** et non une affirmation.

Si la fusion n'est pas possible (contrôle rouge, conflit, revue en attente), le
dire et laisser le ticket en `En cours`. Ne jamais clore un ticket dont le
travail n'est pas sur `main`.

**Rédaction, sur les quatre canaux sans exception.** Français orthographiquement
correct, tous les accents présents. Jamais « decision », « verifie » ou
« donnees » sans accent, y compris dans un commentaire Jira : l'API accepte
l'UTF-8. Aucun tiret cadratin ni demi-cadratin. Les identifiants techniques
restent en ASCII.

Sur Jira, si un critère n'est pas rempli, le dire et laisser le ticket ouvert
plutôt que de le clore à tort. Un ticket partiellement fait passe en `En cours`
avec la liste de ce qui reste.

Si le journal contient une affirmation devenue fausse (une tâche présentée comme
« à faire » alors qu'elle est faite), la corriger. Un journal périmé est pire
qu'un journal absent.

## 7. Vérifier avant de rendre la main

Quatre questions à se poser, systématiquement :

- **Le travail est-il sur `main` distante ?** `git status -sb` et `git log
  origin/main..HEAD` répondent en deux secondes. Une sortie non vide signifie que
  rien n'est livré.
- Le journal reflète-t-il l'état réel du projet ?
- Une découverte de cette session mériterait-elle d'être en mémoire ?
- Jira dit-il la vérité sur l'avancement ?

Si la réponse est non à l'une des quatre, y remédier avant de conclure.

La première est en tête parce que c'est celle qui a été ratée : les trois autres
peuvent être parfaites pendant que le code dort sur une branche locale.

## Ce qu'il ne faut pas faire

Ne pas ouvrir un second chantier tant que le premier n'est pas terminé, sauf
blocage externe réel. Ne pas élargir le périmètre : une idée nouvelle va dans
Jira, pas dans le code en cours. Ne pas contourner un test qui échoue. Ne pas
conclure une session sans avoir passé l'étape 6.
