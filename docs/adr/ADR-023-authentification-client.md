# ADR-023 : authentification des clients et modèle de rôles

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 28 juillet 2026 |
| Décideur | Christophe Mostefaoui |
| Complète | ADR-021, qui ne couvre que l'administration |
| Ticket | LS-38 |
| Vérifié via | Context7, Better Auth 1.6.23 |

## Contexte

ADR-021 décide l'authentification de l'administration : un compte unique, par
passkey, avec mot de passe de secours à seize caractères. Il a été écrit le 27
juillet, quand le compte client appartenait à la V1 cible et n'existait pas au
lancement.

Le 28 juillet, l'élargissement du périmètre d'ouverture (epic LS-36) fait entrer
l'espace client, les avis vérifiés et le carnet d'adresses avant l'ouverture.
LS-37 a modélisé les avis et le carnet.

Le modèle conceptuel s'est retrouvé contradictoire. L'entité `Utilisateur`
déclare `enum role "ADMINISTRATRICE"`, valeur unique, et la règle E1 pose « un
seul compte administratrice au lancement ». Le même `Utilisateur` porte pourtant
`AdresseCarnet` en cardinalité obligatoire, l'auteur éventuel d'un avis et le
propriétaire éventuel d'une commande. Le carnet d'adresses exigeait donc un
utilisateur qui ne pouvait être que l'administratrice.

Cette décision lève la contradiction et pose ce qu'ADR-021 laissait ouvert :
comment un client s'authentifie.

## Décision

### Un champ `role` à deux valeurs

`Utilisateur.role` prend `CLIENT` ou `ADMINISTRATRICE`. Il n'est jamais nul et
vaut `CLIENT` par défaut. Un rôle absent ou inconnu ne donne aucun droit.

L'unicité du compte d'administration est garantie par un index partiel :

```sql
CREATE UNIQUE INDEX utilisateur_administratrice_unique
  ON utilisateur (role)
  WHERE role = 'ADMINISTRATRICE';
```

Un `UNIQUE (role)` simple interdirait un second compte client, ce qui rendrait le
site inutilisable. Le filtre est ce qui rend la contrainte utilisable.

Prisma ne génère pas les index partiels de cette forme. La migration est écrite à
la main en LS-13, comme les `CHECK` d'ADR-006.

### Le rôle n'est jamais fourni par le client

Le champ est déclaré en `additionalFields` de Better Auth avec `input: false`,
ce qui interdit de le poser depuis le formulaire d'inscription.

```ts
user: {
  additionalFields: {
    role: {
      type: ["CLIENT", "ADMINISTRATRICE"],
      required: true,
      defaultValue: "CLIENT",
      input: false,
    },
  },
}
```

`input: false` est la traduction de l'invariant 2 : une valeur venue d'un
formulaire n'autorise rien. Le rôle se lit dans la session côté serveur, jamais
dans une requête, un paramètre d'URL ou un corps de formulaire.

Le passage d'un compte à `ADMINISTRATRICE` ne se fait par aucune interface. C'est
une opération manuelle en base, réservée au développeur, au même titre que la
procédure de dernier ressort d'ADR-021.

### Les clients s'authentifient par email et mot de passe

La passkey n'est pas imposée aux clients. Elle reste disponible, un client qui en
enregistre une l'utilise, mais elle ne conditionne aucun accès.

Motif : l'exploitante a été accompagnée pour enregistrer sa passkey, sur ses
propres appareils, ce qui est faisable pour une personne et pas pour une base de
clients. Un acheteur qui échoue à créer son compte n'achète pas.

Le lien magique seul est écarté : il rendrait toute connexion dépendante du
fournisseur d'email, dont le choix reste ouvert dans ADR-008.

### La vérification d'email est obligatoire avant tout rattachement

Le parcours 6 l'exigeait déjà : sans vérification, deux personnes partageant une
adresse email accéderaient aux commandes l'une de l'autre.

Better Auth couvre le besoin par `emailVerification.sendVerificationEmail` et
`emailAndPassword.requireEmailVerification`.

### Longueur minimale de mot de passe, seize caractères pour tous

Better Auth expose `minPasswordLength` sur l'instance, pas par utilisateur. Une
seule valeur s'applique donc à l'administratrice et aux clients.

La valeur retenue est seize, celle qu'ADR-021 impose à l'administration.

L'exigence F-ACC-01 est un Must sur le jalon Go-Live et son absence est un
critère de refus d'ouverture. Abaisser le seuil global à douze dégraderait cette
exigence pour un confort de saisie. Seize caractères tiennent dans une phrase de
passe et ne coûtent rien à qui utilise un gestionnaire de mots de passe.

## Alternatives écartées

**Le plugin `admin()` de Better Auth.** Il fournit un champ `role` prêt à
l'emploi, mais stocke les rôles en chaîne séparée par des virgules pour permettre
plusieurs rôles par compte. Une valeur `CLIENT,ADMINISTRATRICE` ne serait pas
égale à `ADMINISTRATRICE`, ce qui viderait l'index partiel de son effet : deux
comptes administrateurs passeraient. Le plugin apporte par ailleurs l'usurpation
d'identité et le bannissement, sans usage ici.

**Un booléen `estAdministratrice`.** Fonctionne, et l'absence de valeur y est sûre
puisqu'elle vaut faux. Écarté pour la lisibilité du journal d'audit, où une valeur
nommée se lit mieux qu'un drapeau, et parce qu'un troisième rôle éventuel
imposerait une migration.

**Douze caractères en global, seize vérifiés côté serveur pour l'administration.**
Techniquement possible par un contrôle applicatif au changement de mot de passe.
Écarté : la garantie deviendrait applicative alors qu'elle est aujourd'hui portée
par la configuration, et le projet pose comme principe qu'un invariant ne se
garantit pas par du code qu'on peut oublier. Décision renversable si la longueur
se révèle un obstacle réel à l'inscription.

**Deux instances Better Auth, une par population.** Écarté sans hésitation : deux
jeux de cookies et de sessions sur le même domaine, pour un bénéfice nul.

## Conséquences

### Une dépendance nouvelle à l'email, à ne pas laisser bloquer une vente

La vérification d'email obligatoire crée un chemin où une panne du fournisseur
empêche un client de finir son inscription.

**L'achat sans compte reste le chemin par défaut et ne dépend d'aucune
vérification.** Un client qui ne peut pas créer son compte doit pouvoir acheter
malgré tout. Le parcours 1 ne passe par aucune authentification, et cette
propriété est à préserver dans toute évolution.

La conséquence pratique pour LS-13 et pour la phase de commande : ne jamais
placer la création de compte sur le chemin critique du paiement.

### Les mesures compensatoires d'ADR-021 ne s'appliquent pas toutes aux clients

ADR-021 entoure le mot de passe de cinq mesures, calibrées pour un compte unique.
La route de connexion étant la même pour tous, il faut dire lesquelles suivent le
rôle. Défaut relevé par la revue de LS-38.

| Mesure d'ADR-021 | Portée retenue |
|---|---|
| Longueur minimale de seize caractères | globale, l'option est globale, voir ci-dessus |
| Limitation de débit sur la connexion | globale, **par identifiant de compte** et pas par IP seule |
| Alerte email à chaque connexion par mot de passe | **administration seulement** |
| Journal des connexions | globale |
| Session courte, réauthentification sur action sensible | administration seulement |

**L'alerte de connexion reste réservée à l'administration.** Appliquée à tous,
elle enverrait un email à chaque connexion client, sans destinataire intéressé,
avec un coût chez le fournisseur d'email et une entrée dans `JournalEmail` à
chaque fois. Elle protège un compte qui donne accès à toutes les données
personnelles, ce qu'un compte client n'est pas.

**La limitation de débit se compte par identifiant de compte.** Une limitation
par IP seule, calibrée pour une personne, ferme un cas nominal dès que plusieurs
clients partagent une IP, ce qui est courant en mobile et en entreprise : un
client légitime ne peut plus se connecter parce qu'un autre a échoué. Une
limitation par IP reste utile contre le balayage, à un seuil nettement plus haut.

Ces contrôles sont conditionnés au rôle, donc portés par du code. Ils entrent
dans le niveau 3 du récapitulatif de contraintes, pas dans les garanties de base.

### Sur le modèle conceptuel

`Commande.utilisateurId` reste nullable, l'achat sans compte étant le mode par
défaut. Ce qui change est sa description : le champ est renseigné quand une
commande appartient à un compte authentifié, ou après rattachement vérifié. Il
n'est plus un champ inutilisé au lancement.

La partie de la règle V13 qui compte survit : `utilisateurId` **n'autorise
jamais** un accès. L'autorisation vient de la session, recoupée côté serveur.
C'était vrai quand le champ était vide, ça reste vrai maintenant qu'il est
renseigné.

### Sur le journal d'audit

Un changement de rôle est une action sensible au sens de la règle E3. Il est
tracé avec son acteur, sa cible et son horodatage.

## Risques

**Élévation de privilège.** Le risque principal.

`input: false` ne protège que les routes de Better Auth. Toute autre écriture sur
`Utilisateur` échappe à cette garantie : une Server Action de mise à jour de
profil qui transmettrait à Prisma un objet issu d'un formulaire écrirait `role`
sans que Better Auth soit sur le chemin. La règle E11 du modèle conceptuel est
donc de niveau 3, un contrôle applicatif, et le document la range comme telle.

L'index partiel rejetterait l'écriture puisqu'un compte d'administration existe
déjà, mais cette protection est un effet de bord et non une conception. Elle
disparaît si l'index a été oublié.

Deux tests négatifs sont attendus en phase fondations, au même titre que le test
d'accès croisé par passkey d'ADR-021 : une inscription ne produit pas un compte
`ADMINISTRATRICE` en forçant le champ dans le corps de la requête, **et une mise
à jour de profil ne modifie pas `role`**.

**Deux comptes administrateurs par contournement de l'index.** L'index partiel
s'écrit à la main. S'il est oublié dans la migration, rien n'échoue et le défaut
reste invisible jusqu'à l'incident. La migration de LS-13 doit être vérifiée sur
ce point précis, pas supposée correcte.

**Un client qui partage une adresse email avec un autre.** Traité par la
vérification d'email avant rattachement, déjà posée au parcours 6.

**La longueur de seize caractères décourage des inscriptions.** Réel, non mesuré.
Si le cas se constate à l'ouverture, l'alternative écartée ci-dessus est le
chemin de repli, et elle exige alors un ADR qui la trace.
