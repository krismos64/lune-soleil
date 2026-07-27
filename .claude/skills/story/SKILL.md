---
name: story
description: Implémenter une story Jira du projet LS de bout en bout, en appliquant le contrôle obligatoire avant story critique. Utiliser quand Christophe demande de travailler sur un ticket LS-xx, d'implémenter une story, ou de reprendre le développement d'une fonctionnalité du backlog.
disable-model-invocation: true
---

# Implémenter une story LS

Argument : la clé du ticket, par exemple `LS-42`. Sans argument, demander lequel
ou proposer les stories prêtes de la phase en cours.

## 1. Lire le ticket

Récupérer le ticket via le MCP Atlassian (`getJiraIssue`, cloudId
`c6efcec7-6c26-47a9-843f-65c5ce351051`). Lire la description, les critères
d'acceptation, les liens de blocage et l'epic parent.

Vérifier qu'aucun ticket bloquant n'est encore ouvert. Si un blocage existe, le
dire et s'arrêter là.

Vérifier que la story est prête : acteur identifié, critères testables incluant
les cas d'erreur, règles métier définies, dépendances connues. Si elle ne l'est
pas, poser les questions manquantes avant de coder.

## 2. Déterminer si la story est critique

Une story est critique si elle touche l'un de ces sujets : stock ou réservation,
paiement ou événement de webhook, facture ou avoir, autorisation ou accès à une
ressource, migration de schéma, données personnelles.

**Si la story est critique, répondre explicitement à ces quinze questions avant
d'écrire une ligne de code.** Ne pas les survoler, elles viennent de l'annexe C
du cahier des charges.

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

## 3. Vérifier la documentation des bibliothèques

Si la story utilise une API de Next.js 16, React 19, Prisma 7, Better Auth 1.6 ou
Stripe, consulter Context7 d'abord. Ces versions sont récentes. Signaler quand
Context7 a été utilisé.

## 4. Écrire le test d'abord sur les zones à risque

Pour toute story touchant le stock, le paiement ou les documents comptables, le
test s'écrit **avant** l'implémentation. C'est une exigence du plan directeur, pas
une préférence.

Le test de concurrence sur le stock à un exemplaire est le test phare du projet :
deux tentatives simultanées, une seule réservation valide, aucun stock négatif,
aucune double commande, aucune double facture.

## 5. Implémenter

Par petites étapes, en respectant les couches : présentation, services, dépôts,
ORM, base. Aucune logique métier dans un composant ou une Server Action.

Passer le ticket en `En cours` dans Jira au démarrage.

## 6. Vérifier

Exécuter, dans cet ordre :

```bash
npm run type-check
npm run lint
npm run test        # au moins les tests concernés
```

Pour une story d'interface, contrôler le rendu à 320, 390, 768 et 1280 px, et
vérifier les états vide, erreur, pending, disabled et succès.

Pour une story critique, ajouter un test négatif de sécurité, un test de
concurrence ou d'idempotence, et la simulation d'une panne de fournisseur.

**Montrer la sortie réelle des commandes.** Ne jamais affirmer que les tests
passent sans le prouver.

## 7. Clore

Commit avec un message descriptif référençant le ticket. Jamais de
`Co-Authored-By` dans un commit de ce projet.

Mettre à jour le ticket Jira : commentaire indiquant ce qui est fait, l'état
réel de chaque critère d'acceptation, et le hash du commit. Si un critère n'est
pas rempli, le dire et laisser le ticket ouvert plutôt que de le clore à tort.

Mettre à jour l'ADR ou la documentation si une décision a changé.

## Ce qu'il ne faut pas faire

Ne pas ouvrir une seconde story tant que celle-ci n'est pas terminée, sauf blocage
externe réel. Ne pas élargir le périmètre : une idée nouvelle va dans Jira, pas
dans le code en cours. Ne pas contourner un test qui échoue.
