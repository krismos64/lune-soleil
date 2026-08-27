# 27 août 2026, l'envoi réel des emails, LS-51 et LS-82

La phase 4 commence. Le client reçoit désormais quelque chose après avoir payé,
ce qui n'était le cas d'aucun message jusqu'à ce jour.

Deux stories dans une seule PR, la #162, parce que la seconde ne pouvait pas
démarrer sans la première : `.claude/rules/database.md` portait la consigne
« ne pas coder l'envoi d'email en supposant l'index suffisant ».

## Ce que LS-51 a tranché, ADR-033

La quatrième clé d'idempotence protège la base, pas l'appel au serveur SMTP. Le
scénario qui passait entre les mailles : le message part, le processus tombe
avant d'écrire la trace, la reprise ne trouve rien qui la bloque, et le client
reçoit **deux confirmations de commande identiques**.

**L'outbox transactionnelle est retenue.** L'intention d'envoi s'écrit dans la
transaction qui produit l'effet métier, une cinquième tâche planifiée la
consomme.

Deux des trois options de LS-51 étaient déjà closes en arrivant, et le dire
comptait autant que de choisir :

- la **clé d'idempotence fournisseur** supposait un fournisseur transactionnel.
  ADR-008 ayant tranché pour le SMTP OVH, elle n'existe pas : SMTP accepte un
  message et le remet, sans notion de clé fournie par l'appelant
- le **rapprochement documenté** suppose quelqu'un pour lire un rapport. Une
  boutique artisanale n'a pas ce quelqu'un, le défaut resterait donc invisible
  jusqu'à la réclamation d'un client

Ce qui a fait pencher la décision est un fait mesuré et non une préférence :
LS-51 évaluait l'outbox à « une table, un consommateur, et le conteneur de
tâches planifiées prévu en phase 1 ». Ce conteneur existe depuis LS-72, complété
par LS-120, et porte quatre tâches en service. Le coût était retombé de moitié
depuis l'écriture du ticket.

## L'ordre est le mécanisme entier

```
Transaction métier                 Tâche « envoi-emails », toutes les minutes
  ├─ Commande CONFIRMEE              ├─ SELECT ... FOR UPDATE SKIP LOCKED
  ├─ Mouvement de stock              ├─ statut ENVOI_EN_COURS, commit
  └─ INSERT EnvoiEnAttente           ├─ appel SMTP
                                     └─ JournalEmail ENVOYE ou ECHOUE
```

**Le commit du marquage précède l'appel.** Marquer après reproduirait le même
trou quelques lignes plus loin, et c'est le piège que la mutation a fini par
révéler, voir plus bas.

**Une ligne restée `ENVOI_EN_COURS` est ambiguë par nature** : personne ne sait
si le message est parti. ADR-033 refuse de trancher automatiquement. La rejouer
risquerait le doublon, l'abandonner risquerait le silence : elle sort par une
alerte au-delà de dix minutes, et l'administratrice décide par le renvoi manuel
que la règle E6 laisse ouvert.

## Deux chemins, selon qui attend le message

Le partage n'est pas une commodité d'implémentation, c'est la décision.

**Ce qui découle d'une transaction métier passe par l'outbox.** Un client qui
vient de payer accepte d'attendre une minute sa confirmation.

**Ce qu'une personne attend à l'écran part directement**, vérification d'adresse
et réinitialisation de mot de passe. Quelqu'un qui a cliqué sur « mot de passe
oublié » regarde sa boîte tout de suite ; passer ce message par l'outbox le
ferait paraître cassé. Ces deux messages ne portent aucune commande, donc aucune
ligne `JournalEmail` ne les couvre et la clé d'idempotence ne s'y applique pas,
ce qui est correct : deux liens de réinitialisation valides sont sans
conséquence, contrairement à deux confirmations de commande.

## La mutation a trouvé un test aveugle sur la garantie centrale

Le premier passage a détecté **six cas sur sept**. Le cas manquant était le plus
important : neutraliser le marquage avant l'appel laissait la suite verte.

Le motif, une fois vu, est net. Le test « ne renvoie rien au cycle suivant »
enchaîne deux cycles, mais le premier écrit `ENVOYE` avant que le second ne
démarre : **la ligne sortait du filtre par son statut final, jamais par la
marque**. Le marquage n'était donc exercé pour rien de ce qu'il garantit.

La garantie porte sur deux exécutions qui **se chevauchent**, la seconde
démarrant pendant que la première est suspendue dans son appel réseau. C'est la
situation réelle : un appel SMTP dure des secondes, le verrou de tâche expire, ou
deux conteneurs tournent.

Le test de concurrence a été écrit **pour cette mutation**, et c'est elle qui l'a
exigé. La fenêtre s'y ouvre de façon déterministe, la promesse étant relâchée par
le test lui-même : un `setTimeout` mesurerait une durée là où c'est un **ordre**
qui compte, piège déjà relevé sur ce projet.

Sept cas sur sept sont désormais détectés par le test attendu.

## Trois autres pièges rencontrés

**Une mutation restée sur le disque.** Le script de mutation a tourné pendant que
je corrigeais `auth.ts` : sa restauration par git a effacé ma correction, et j'ai
d'abord cru à une mutation résiduelle. La leçon tient en une phrase, ne pas
toucher au dépôt pendant qu'un script de mutation tourne.

**Une substitution qui ne mutait rien.** Le premier cas 123 laissait le fichier
intact, faute d'échappement des parenthèses. Une mutation sans effet accuse les
tests à la place du script, et le sens de l'échec est alors inversé. Les sept
substitutions ont donc été vérifiées une par une **avant** de lancer les tests.

**Une mutation satisfaite ailleurs.** Pour prouver la force du marqueur de mot de
passe, j'ai d'abord muté vers `process.env.SMTP_PASSWORD` : les treize tests sont
restés verts, le test injectant son environnement en paramètre et n'empruntant
jamais ce chemin. La fuite réaliste est de recopier **l'environnement reçu** dans
le message d'erreur, ce que ferait quelqu'un voulant aider au diagnostic. Deux
tests rougissent alors, dont celui attendu.

## GitGuardian, un refus justifié sur la forme

La PR a été bloquée sur « 1 secret uncovered », pointant
`tests/unitaire/envoi-email-smtp.test.ts` : une chaîne littérale posée sur une
clé nommée `SMTP_PASSWORD`. **Le détecteur avait raison sur la forme**, rien ne
lui permet de savoir qu'une valeur est inventée.

La constante n'a pas été retirée pour autant, elle est **assemblée à
l'exécution**. Un test écrit avec une chaîne vide prouverait moins, la fonction
refusant déjà le vide : ce qui est vérifié est qu'une valeur **présente** ne
ressort pas dans le message d'erreur.

Corriger dans un commit ultérieur n'a pas suffi, GitGuardian scannant tous les
commits de la PR. La branche a donc été aplatie en un seul commit, après
vérification que son arbre était identique à la sauvegarde. Christophe a ensuite
résolu l'incident, ouvert avant la correction et qui ne se referme pas seul.

## Preuves

```
npm run db:verifier                         111 réussites, 0 échec
npm run test                                770 tests, 48 fichiers, 0 échec
npm run type-check                          aucune sortie
npm run lint                                aucune sortie
npx prettier --check .                      All matched files use Prettier code style!
./scripts/verifier-regles.sh                règles conformes au schéma
./scripts/verifier-propagation-docs.sh      socle Zod et son document accordés
./scripts/verifier-registre-traitements.sh  34 tables rangées
./scripts/verifier-tests-non-ignores.sh     toute la suite s'exécute
mutation, sept cas neufs                    7 mutations, 7 detectees
CI de la PR #162                            les deux contrôles verts
```

**Envoi réel** : deux messages remis au serveur OVH, vers une boîte Yahoo et une
boîte Gmail. Aucune erreur d'authentification, ce qui prouve la validité des
identifiants SMTP, jamais éprouvée jusqu'ici. **La réception reste à constater**,
ADR-008 : le classement en indésirable est invisible en SMTP.

## État des tickets

| Ticket | État |
|---|---|
| LS-51 | **Terminé**, ADR-033 écrit, les deux options écartées motivées |
| LS-82 | **En cours**, sept critères sur huit remplis, le critère 1 attend la constatation de réception |
| LS-154 | créée, purge de l'outbox, bloquée par LS-82 |

LS-82 reste ouverte délibérément. Le critère 1 exige qu'un email **arrive**, et
personne n'a encore ouvert les deux boîtes : le fermer aujourd'hui reviendrait à
cocher un critère sur une supposition, alors qu'un défaut d'authentification de
domaine se voit précisément là et nulle part ailleurs.

## Ce qui n'a pas été fait, et pourquoi

**Les six textes F-MAIL-01 à F-MAIL-06 restent dus par LS-29.** Ils demandent la
validation de l'exploitante, ces emails étant la voix de sa marque. Seuls les
trois messages d'authentification ont un rendu, sobre et en texte brut : un texte
de service se relit moins qu'une confirmation de commande.

**`requireEmailVerification` reste désactivé**, et son motif a changé. Le blocage
n'est plus l'envoi mais le **parcours autour** : écran d'attente, renvoi du lien,
message quand l'email n'arrive pas. Activer le drapeau sans ces écrans laisserait
un client bloqué sur un compte non vérifié sans aucun moyen d'agir, ce qui serait
pire que la dette actuelle. C'est LS-54.

**La purge de l'outbox est LS-154.** Une purge par âge supprimerait les lignes
bloquées avant que quiconque ne les regarde, ce qui reviendrait à taire
l'incident au lieu de le résoudre.

## Deux comptes périmés corrigés au passage

Antérieurs à cette story, relevés et non recopiés. Le README annonçait
« vingt-et-un scripts » pour vingt-six, et `reservation-test.sh` manquait à la
liste alors qu'il porte le prototype du test phare du projet.
`MODELE-LOGIQUE.md` comptait « six index partiels » pour sept.

## Prochaine étape

**Constater la réception des deux emails**, ce qui ferme LS-82. Objet
« Connexion à l'administration par mot de passe », expéditeur
`contact@lune-soleil.fr`. Trois choses à regarder : boîte de réception ou
indésirable, avertissement d'expéditeur, accents corrects.

Si les messages arrivent, **DMARC peut passer de `p=none` à `quarantine`**, ce
que le commentaire du 8 août sur LS-29 interdisait de faire avant ce test.

Ensuite, **LS-126** ouvre la chaîne des documents comptables et referme la
troisième clé d'idempotence, la dernière non exercée. C'est la suite naturelle de
la phase 4.
