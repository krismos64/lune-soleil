# 10 septembre 2026, f : aucun email ne partait, depuis le début

La séance d'amorçage de LS-175 s'est arrêtée à l'étape 1. L'exploitante s'est
inscrite en production et n'a jamais reçu son lien de vérification, ni dans les
indésirables, ni après avoir cliqué sur « renvoyer ».

## Ce que le diagnostic a trouvé, dans l'ordre

**Le compte existait.** `contact@lune-soleil.fr`, rôle `CLIENT`, créé à 10:23:51.
L'inscription avait parfaitement fonctionné.

**`journal_email` était vide.** Aucune tentative d'envoi n'avait jamais été
enregistrée, ce qui plaçait la cause en amont de la couche d'envoi.

**Aucune variable SMTP n'existait en production.** `/etc/lune-soleil/production.env`
portait treize variables, aucune SMTP. L'application retombait donc sur son
envoyeur de repli, qui journalise l'intention sans rien envoyer.

Les deux tentatives de l'exploitante étaient dans les journaux, à la seconde
près :

```
10:23:51  email non envoye, envoyeur de repli en place   verification-adresse
10:24:55  email non envoye, envoyeur de repli en place   verification-adresse
```

## La configuration posée, et le piège qui a suivi

Les cinq variables d'ADR-008 ont été ajoutées, `SMTP_PASSWORD` rempli par
Christophe lui-même pour que le secret ne transite pas par la session.

**Puis `docker restart` n'a rien changé**, ce que j'avais pourtant prévu comme
la parade. **Et `docker compose up -d` non plus**, ce que je n'avais pas prévu :
Compose ne surveille pas le CONTENU de l'`env_file`, il compare l'image et la
définition du service, juge qu'il n'y a rien à recréer, et le déploiement
réussit sans que les variables entrent dans le conteneur.

Trois horodatages l'ont prouvé, là où j'aurais pu réessayer à l'aveugle :

```
conteneur cree    10:16:17
fichier modifie   10:30:46
conteneur demarre 10:31:33
```

Seul `--force-recreate` donne l'environnement neuf. Le script de déploiement
n'a aucune option pour le forcer, ce qui oblige à sortir de l'outil prévu.

## Le vrai défaut, et il était dans le code

Les cinq variables étaient enfin lues par le conteneur, et **l'envoyeur de repli
était toujours choisi**. La configuration n'était donc pas la cause, seulement
une condition manquante.

`creerAuth()` prenait `envoyeurJournalise` comme valeur **par défaut** de son
paramètre, et `src/lib/auth.ts` l'appelle **sans argument**. Le repli était le
chemin de production depuis toujours.

`creerEnvoyeurSmtp` existait depuis LS-82, et n'était appelé **que** par la tâche
d'expédition de l'outbox : les emails de commande partaient, ceux de
l'authentification non. Deux chemins, un seul câblé.

## Ce qui n'a jamais fonctionné

Trois parcours, depuis la mise en service :

- vérification d'adresse à l'inscription
- **réinitialisation de mot de passe oublié**, aucun client n'aurait pu
  récupérer son compte
- **alerte de connexion à l'administration**, mesure de protection nommée par
  ADR-027

Le troisième est le plus lourd : une mesure de sécurité décidée par un ADR
accepté n'était pas appliquée, et rien ne le signalait.

## Pourquoi personne ne l'a vu pendant des mois

**Le repli ne lève pas**, règle E4, pour qu'une panne d'email ne fasse jamais
échouer une inscription. L'écran annonce donc « email envoyé », et la ligne de
journal qui dit le contraire n'était lue par personne.

Il a fallu qu'une personne réelle ne reçoive jamais son lien et le dise.

## La leçon de test, la plus chère de la journée

`choisirEnvoyeurEmail` a été écrite, puis vingt cas l'ont éprouvée : chaque
variable manquante seule, la configuration complète, le repli rendu à
l'identique. Tous verts.

**Ils restaient verts en remettant `envoyeurJournalise` par défaut dans
`auth.ts`.** Ils testaient la FONCTION, jamais le fait qu'elle soit appelée :
une fonction correcte et du code mort produisent exactement les mêmes tests
verts. Motif « fonction testée jamais appelée », déjà en fiche ici.

Un contrôle du CÂBLAGE a été ajouté, prouvé sur deux mutations dont la garde
contre son propre ancrage :

```
repli remis par defaut          -> 1 failed | 20 passed
signature de creerAuth reecrite -> 1 failed | 20 passed
```

## Deux erreurs de méthode de ma part

**J'ai fusionné la PR #362 avec GitGuardian au rouge.** J'ai lancé la fusion et
lu le résultat dans le même mouvement, au lieu de vérifier les contrôles avant.
`CONTRIBUTING.md` l'interdit explicitement.

La cause était ma propre constante de test, `SMTP_PASSWORD:
"mot-de-passe-de-test"`. **L'analyseur avait raison** : il ne peut pas
distinguer un faux mot de passe d'un vrai, et le dépôt est public. Vérifié
ensuite, et c'est ce qui compte : le mot de passe réel n'est présent nulle part
dans le dépôt, mesuré par `git grep` sur la valeur lue en production.

Le fichier portait déjà `MARQUEUR_MOT_DE_PASSE`, une chaîne assemblée à
l'exécution pour ce besoin exact. J'ai introduit une seconde convention sans
voir la première. PR #363 l'aligne.

**J'ai aussi annoncé SPF, DKIM et DMARC « à vérifier »** alors qu'une fiche
mémoire les documentait depuis le 8 août 2026, sélecteurs compris. Mes premiers
`dig` cherchaient des sélecteurs devinés, tous absents : lire la fiche d'abord
donnait `ovhmo-selector-1` et `-2`, tous deux présents.

## Traçabilité

**LS-214** créée, Bug, LS-7, priorité High. Christophe avait d'abord tranché
« corriger à chaud sans ticket » ; la portée s'est précisée en écrivant les
fiches mémoire, et le ticket a été créé sur nouvelle décision. Un écart de cette
nature doit rester retrouvable pour l'audit d'ouverture.

**PR #362** pour la correction, **PR #363** pour le faux positif, toutes deux
fusionnées sur `main`.

## Ce qui reste

Le déploiement, puis la mesure d'un envoi réel : `journal_email` doit porter une
ligne `ENVOYE` après une demande de vérification. Un `ENVOYE` prouve que le
serveur OVH a **accepté** le message, jamais qu'il est distribué, ADR-008.

Ensuite seulement, la séance de LS-175 reprend à l'étape 1.
