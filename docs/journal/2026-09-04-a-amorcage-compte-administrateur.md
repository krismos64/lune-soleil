# 4 septembre 2026, session A : le compte que personne ne peut créer

Session sans code, **deux tickets créés**. Christophe demandait d'abord un état
du projet et les prochaines étapes, puis comment tester les comptes admin et
client en local. La réponse à la seconde question a fait apparaître un trou que
la première n'avait pas vu, LS-175. La chaîne de contrôle a suivi, LS-176.

## La question qui a trouvé le défaut

En expliquant la promotion d'un compte en administratrice, Christophe a demandé
si un ticket prévoyait de créer ce compte pour l'exploitante avant la mise en
ligne, **puisqu'elle ne peut pas le faire elle-même**.

**Aucun ticket ne le portait.** Vérifié dans les 59 tickets ouverts, dans les
tickets fermés mentionnant compte, administratrice, exploitante, passkey et
guide d'exploitation, et dans ADR-021.

## Pourquoi la décision paraissait complète

ADR-021 tranche « un seul compte administrateur, celui de l'exploitante » et
l'authentification par passkey. Il décrit comment elle **se connecte**, jamais
comment son compte **apparaît**. La lacune ne se voit pas à la lecture, l'ADR
répondant complètement à la question qu'il se pose.

Le code, lui, interdit délibérément l'élévation : `role` porte `input: false`
dans Better Auth, règle E11, donc aucune requête HTTP ne peut poser
`ADMINISTRATRICE`. C'est l'invariant 2 appliqué, et **ce comportement est
correct**. Sa conséquence l'est moins : ni l'exploitante ni le développeur ne
peuvent créer ce compte depuis le site.

**Le motif est réutilisable au-delà de ce ticket.** Une garde qui interdit une
élévation de privilège par l'API interdit aussi la création du **tout premier
compte**, et rien ne le signale tant qu'on travaille sur une base de
développement où un compte de test existe déjà. Fiche mémoire écrite.

## Ce que LS-153 supposait

Son étape 3 fait saisir les produits et les contenus par l'exploitante. Elle
suppose donc qu'elle peut déjà se connecter, sans qu'aucune étape antérieure ne
lui en donne le moyen. Une étape manquante dans un ordre d'opérations dont
l'objet déclaré est de ne rien improviser le jour de la bascule.

## Trois pièges écrits dans la story plutôt que découverts

**L'index partiel E1 n'admet qu'une ligne `ADMINISTRATRICE`.** Un compte de test
resté en base fait lever la promotion. Il faut rétrograder avant de promouvoir,
et **nommer la cible** : un `UPDATE` sans clause retirerait son rôle au compte
réel. `tests/e2e/session-administration.setup.ts` porte déjà cette recette,
éprouvée en intégration continue.

**La passkey est liée au matériel et au domaine**, `rpID`. Elle s'enregistre
depuis l'iPhone ou le MacBook de l'exploitante, sur la production, en sa
présence. Cette étape ne se délègue pas.

**Les codes de récupération n'avaient aucun ticket**, alors qu'ADR-021 les nomme
comme seul recours en cas de perte des appareils et exige que leur existence
soit « vérifiée avant l'ouverture, pas supposée ». Deux autres exigences du même
ADR étaient dans le même cas : le test négatif d'accès croisé, annoncé « à
couvrir en phase fondations », et la procédure de dernier ressort renvoyée à un
guide d'exploitation qui n'existe pas.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `verifier-jira.sh` | LS-175 non signalée, epic et liens conformes |
| Sens du lien `Blocks` | vérifié après pose, LS-175 **blocks** LS-153 |
| Comptes | relevés dans Jira, jamais dérivés |

Le sens du lien a été vérifié plutôt que supposé : `createIssueLink` pose
`Blocks` à l'envers de ce que son nom suggère, piège déjà en fiche. Le contrôle
signale une seule dépendance textuelle sans lien, LS-68 vers LS-50, préexistante
et sans rapport.

## La chaîne de contrôle, second ticket de la session

Christophe a demandé si la chaîne pouvait être allégée, proposant de ne lancer la
suite qu'en fin de session pour économiser le quota et l'attente.

**La mesure a déplacé le sujet.** Un run complet dure 17 min 30, dont 7 min 54 de
tests d'intégration et 5 min 02 de bout en bout : deux étapes pèsent **74 %** du
temps, tout le reste rendant son verdict en deux minutes.

Surtout, **la chaîne tourne deux fois par livraison**, sur la pull request puis
sur `main` après fusion, et **le run sur `main` ignore le filtre de portée de
LS-169**. Une pull request documentaire passe en allégée, puis rejoue dix-sept
minutes de tests complets après fusion. Le défaut que LS-169 corrigeait est resté
ouvert sur sa moitié `main`.

**Le doublon se justifiait par une raison devenue sans objet.** Le workflow
invoque le rebase qui « rejoue les commits sur une base différente ». Vrai en
général, faux ici : `strict: true` est actif sur la protection de branche,
relevé par l'API, donc l'arbre fusionné est exactement celui que la pull request
a testé.

**La proposition initiale a été écartée, et la raison est écrite dans le
ticket** : `main` exige le vert, donc une suite repoussée en fin de journée
interdirait toute fusion entre-temps, ou obligerait à retirer la protection, ce
que LS-69 a déjà eu à corriger. Elle est conservée en déclencheur manuel, en
complément.

**Un risque a été trouvé en vérifiant, absent de la proposition initiale.** Le
check exigé par la protection porte un nom de job, `Les huit controles de
CONTRIBUTING`. Découper le job **renomme les checks**, et la protection cesserait
d'exiger quoi que ce soit : une pull request deviendrait fusionnable **sans aucun
contrôle vert**, en silence. Deux critères le couvrent, dont l'obligation de
prouver le défaut avant de le refermer.

## État des tickets

**LS-175 créée**, sous LS-7, priorité High. Elle **bloque LS-153**, la première
mise en ligne, et **est bloquée par LS-152**, la base de production sur laquelle
l'amorçage s'exécute.

Dix critères d'acceptation, dont trois reprennent des exigences d'ADR-021 restées
sans porteur.

**LS-176 créée**, sous LS-7, priorité High : alléger la chaîne de contrôle, quatre
changements et dix critères. Aucun lien de blocage, elle ne dépend de rien et ne
bloque rien.

Comptes relevés dans Jira ce jour, hors epics : **105 terminés sur 166**.

## Prochaine étape

Inchangée par rapport à la session J, LS-175 n'étant pas réalisable avant le VPS
et la base de production. Côté code sans dépendance externe : **LS-137**, le
référencement technique, et **LS-147**, l'identité du site au partage.

Les deux blocages lourds restent les **photographies** et la **composition des
métaux**.
