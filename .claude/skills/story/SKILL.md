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
| **Dépôt** | toujours | code, ADR si décision structurante, script si prototype |
| **Journal** | fin de session significative | ce qui est fait, ce qui a dérapé et pourquoi, prochaine étape, état des tickets |
| **Mémoire** | découverte non dérivable du code | contrainte technique, piège, décision et son pourquoi |
| **Jira** | toujours | commentaire avec l'état réel de chaque critère, le commit, ce qui reste |

Commit avec un message descriptif référençant le ticket. Jamais de
`Co-Authored-By` dans ce projet.

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

Trois questions à se poser, systématiquement :

- Le journal reflète-t-il l'état réel du projet ?
- Une découverte de cette session mériterait-elle d'être en mémoire ?
- Jira dit-il la vérité sur l'avancement ?

Si la réponse est non à l'une des trois, y remédier avant de conclure.

## Ce qu'il ne faut pas faire

Ne pas ouvrir un second chantier tant que le premier n'est pas terminé, sauf
blocage externe réel. Ne pas élargir le périmètre : une idée nouvelle va dans
Jira, pas dans le code en cours. Ne pas contourner un test qui échoue. Ne pas
conclure une session sans avoir passé l'étape 6.
