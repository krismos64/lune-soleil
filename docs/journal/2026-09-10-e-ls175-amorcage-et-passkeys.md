# 10 septembre 2026, e : le compte d'administration, et l'écran qui manquait

LS-175 était donnée à six critères sur dix. Deux des quatre restants n'attendaient
pas l'exploitante comme le ticket le croyait : ils attendaient du code qui
n'existait pas.

## La demande

Christophe : « lançons LS-175, il faut qu'à la fin de la session le compte admin
unique soit activé et en place. »

La lecture du ticket a d'abord conduit à répondre que trois critères exigeaient
la présence physique de Stacy, et à proposer de préparer la production. Sa
réponse a tranché : elle est disponible.

C'est en préparant réellement cette séance que les deux trous sont apparus.

## Trou 1, les scripts visaient la base de développement

`amorcer-compte-administration.sh` et `verifier-comptes-production.sh` lisent le
`.env` du dépôt. Sur le poste de développement, `DATABASE_URL` désigne le port
55432.

**Lancés le jour de l'ouverture, ils auraient promu un compte sur la mauvaise
base en annonçant « role relu ADMINISTRATRICE ».** Un succès parfaitement
trompeur, sur le geste précis qui ouvre l'administration.

Le nom du second n'aidait pas : `verifier-comptes-production.sh` ne vérifie la
production que si `DATABASE_URL` la désigne, ce que rien ne garantissait.

**Le dépôt n'est pas cloné sur le VPS.** `/opt/lune-soleil` ne porte que la
composition et le répertoire de déploiement, et l'image ne contient pas
`scripts/`. Mesuré, pas supposé.

Le chemin retenu est celui qu'`EXPLOITATION.md` a déjà éprouvé pour les
migrations : un relais `socat` éphémère dans le réseau Docker, un tunnel SSH
par-dessus, les deux détruits à la sortie.

**Le démontage est posé AVANT le montage.** Un `trap` installé après coup laisse
une fenêtre où une interruption abandonne un relais ouvert, c'est-à-dire un accès
non authentifié à la base de production depuis l'hôte.

## Trou 2, aucun écran n'enregistrait de passkey

ADR-021 fait de la passkey le chemin **principal** de l'administration. Le code
savait s'y connecter, `signIn.passkey()` étant appelé par l'écran de connexion et
par celui de réauthentification.

**`addPasskey` n'était appelé nulle part.** Aucun chemin n'existait pour en
enregistrer une, et la procédure d'amorçage renvoyait à `/administration` pour
cette étape, une page qui n'a jamais rien porté de tel.

Le ticket ne pouvait pas le voir : sa part livrée le 8 septembre s'arrêtait avant
la production, et le critère 5 était rangé parmi ceux qui « attendent
l'exploitante ». Il attendait aussi un écran.

## L'état de la production, mesuré avant tout

```
comptes                0
administratrices       0
passkeys               0
rpID                   lune-soleil.fr
```

Base vierge, donc point de départ propre. Le `rpID` vaut le domaine sans `www` :
une passkey enregistrée sur une autre forme ne vaudrait rien.

## Trois erreurs de ma part, et ce qui les a attrapées

**`timeout` n'existe pas sur macOS.** Ma preuve par mutation affichait quatre OK
avec un code 127, « commande introuvable ». Les quatre cas mesuraient l'absence
de la commande au lieu du refus du script. Sans regarder le code de sortie plutôt
que la couleur, je déclarais la preuve faite sur un contrôle vide.

**Mon test de projection ne testait rien.** Il comparait les clés rendues par
`listerPasskeysDuCompte` et passait au vert sur une projection élargie à
`publicKey` : le service reconstruit son objet champ par champ, donc il écarte
lui-même ce que le dépôt ferait sortir en trop. Le test observait la garde du
service en croyant mesurer celle du dépôt. Motif « mutation satisfaite ailleurs ».
La mutation l'a révélé, pas la relecture.

**Je n'ai lancé que les contrôles auxquels j'avais pensé.** La CI a rejeté la
première PR sur `verifier-chargement-administration.sh` : tout écran
d'administration en `force-dynamic` doit porter un état de chargement. Le dépôt
en porte 48, j'en avais lancé sept. La correction est un `<Suspense>` interne,
jamais un `loading.tsx`, C32 imposant que l'autorisation reste au-dessus de la
frontière.

## Un piège d'écriture, nouveau

**Un commentaire qui cite la balise principale entre chevrons casse
`verifier-lien-evitement.sh`.** Il lit la balise en partant de sa première
occurrence dans le fichier jusqu'au chevron fermant : un commentaire qui l'écrit
sous sa forme littérale devient cette première occurrence, la fenêtre se referme
sur le commentaire, et le contrôle annonce l'ancre absente sur un écran qui la
porte.

C'est la forme déjà connue ici, « un garde-fou qui cite la valeur interdite se
fait détecter par le contrôle qu'il éprouve », rencontrée cette fois dans du code
d'écran et non dans un script.

## Un piège d'API

Le client et le serveur de `@better-auth/passkey` ne nomment pas la même chose
pareil : le client expose `listUserPasskeys`, l'endpoint serveur s'appelle
`listPasskeys` sur `/passkey/list-user-passkeys`. Lire les types **serveur** pour
écrire du code **client** a produit `listPasskeys`, que `tsc` a rejeté.

La leçon n'est pas « lire les types plutôt que la doc », les deux disaient vrai de
leur côté : c'est vérifier les types du côté où l'appel est écrit.

## Les preuves

**Le script contre la vraie production :**

```
--verifier   AUCUN compte ne porte le role d'administration      code 1
--comptes    ECHEC 1 anomalie(s) : aucun compte ne porte le role code 1
```

Relais et tunnel démontés dans les deux sens après chaque exécution, vérifié sur
l'hôte et en local.

**Preuve par mutation de l'amorçage, 4 cas sur 4 détectés** : base de
développement visée, verdict tiré du code de sortie, démontage retiré, hôte
injoignable.

**Tests d'intégration, 3 mutations détectées** : filtre par utilisateur retiré,
projection élargie à `publicKey`, puis à `credentialID`.

**Vérifications** : `type-check` vert, `lint` vert, `format:check` vert,
1295 tests sur 85 fichiers, et **48 contrôles de la CI joués en local, aucun en
échec**.

## Ce qui reste ouvert

**LS-175, critères 5, 6 et 7.** Les deux premiers se jouent avec Stacy, le
conducteur est écrit dans `docs/SEANCE-AMORCAGE-EXPLOITANTE.md`. Le troisième
part dans LS-212.

**LS-212 créée**, codes de récupération, rattachée à LS-7, priorité High, bloquant
LS-153, sens du lien vérifié après pose. Le plugin `twoFactor` de Better Auth
impose un `secret` TOTP obligatoire dont ADR-021 ne veut pas : l'arbitrage de
Christophe est de traiter ce critère dans un ticket dédié avec son ADR, plutôt
que d'adopter une mécanique 2FA jamais décidée.

## Un défaut préexistant, signalé et non corrigé

`verifier-prefetch-administration.sh` échoue sur `main` **avant** ce travail, sur
trois fichiers non touchés ici : `factures/page.tsx:211`,
`produits/[id]/page.tsx:124`, `produits/nouveau/formulaire-produit.tsx:73`.
Vérifié par `git stash`. Il n'entre pas dans cette PR : **LS-213 le porte**.

**Il n'est branché dans AUCUN workflow**, mesuré : `grep` sur `.github/workflows/`
ne le trouve nulle part, alors qu'il existe depuis le 7 septembre avec sa preuve
par mutation. C'est ce qui explique que les trois violations soient restées
invisibles. Motif « contrôle jamais déclenché », déjà rencontré avec
`verifier-actions-sensibles.sh` qui dormait depuis LS-81.

## Prochaine étape

Fusionner la PR, déployer, puis la séance avec Stacy. L'écran des passkeys n'est
pas en production tant que le déploiement n'a pas eu lieu : la séance ne peut pas
commencer avant.
