# Procédure d'amorçage du compte d'administration

**Ticket : LS-175. Décision : ADR-021 pour l'authentification, ADR-023 pour le
mot de passe.**

Cette procédure crée le seul compte d'administration du site, celui de
l'exploitante. Elle se déroule **une fois**, avant l'ouverture, et bloque LS-153 :
l'étape « saisie des données réelles » suppose que l'exploitante peut déjà se
connecter.

## Pourquoi une procédure et non un écran

Le code **interdit délibérément de se promouvoir**. Le champ `role` porte
`input: false` dans la configuration de Better Auth, règle E11 : aucune requête
HTTP ne peut poser `ADMINISTRATRICE`, ce qui est exactement l'invariant 2.

La conséquence est directe : **personne ne peut créer ce compte depuis le site**,
ni l'exploitante, ni le développeur. Il faut une écriture en base.

Ce comportement est correct et ne doit pas changer. Un test capable de se
promouvoir par l'API signalerait un défaut de production. C'est la procédure qui
manquait, jamais la protection.

Aucun écran d'administration des comptes n'est prévu non plus : il n'y a qu'un
compte, et un écran pour le gérer serait une généralisation prématurée.

## Qui fait quoi

| Étape | Qui | Où |
|---|---|---|
| 1. Inscription | **l'exploitante** | `/compte/inscription`, sur le domaine de production |
| 2. Promotion en base | le développeur | `scripts/amorcer-compte-administration.sh` |
| 3. Enregistrement de la passkey | **l'exploitante** | `/administration`, sur son propre appareil |
| 4. Vérification par seconde connexion | **l'exploitante** | `/administration/connexion` |
| 5. Codes de récupération | **l'exploitante**, en présence du développeur | imprimés, conservés hors ligne |

**Trois de ces cinq étapes ne se délèguent pas.** Le mot de passe, la passkey et
les codes de récupération n'appartiennent qu'à elle.

## Étape 1, l'inscription

L'exploitante s'inscrit par `/compte/inscription`, l'écran **client**, avec
l'adresse qui servira ensuite au compte d'administration.

**Elle passe donc par un parcours client pour devenir administratrice.** C'est
fonctionnel et voulu : le formulaire d'inscription est le seul chemin qui crée un
compte, et la promotion vient après.

**Elle choisit son mot de passe elle-même**, seize caractères minimum, ADR-023.
Le développeur ne le connaît jamais, à aucun moment de la procédure.

Le champ de saisie porte sa bascule de lisibilité, règle C38 : saisir seize
caractères à l'aveugle sur un clavier mobile fait raccourcir le mot de passe
jusqu'à la limite basse ou renoncer.

## Étape 2, la promotion

```bash
./scripts/amorcer-compte-administration.sh contact@exemple.fr
```

Le script :

- **refuse d'agir si l'adresse n'existe pas**, plutôt que de rendre un succès
  silencieux. Un `UPDATE` sur une adresse absente touche zéro ligne et ne lève
  pas
- **rétrograde puis promeut dans une seule transaction**. L'index partiel
  `utilisateur_administratrice_unique` n'admet qu'une administratrice, règle E1 :
  deux instructions séparées laisseraient une fenêtre sans aucune administratrice,
  et un échec de la seconde rendrait l'administration inaccessible
- **nomme sa cible dans la clause de rétrogradation**. Un `UPDATE` sans filtre
  retirerait son rôle au compte réel, en silence
- **vérifie par une relecture**, jamais par le compte de lignes : `rowCount`
  prouve qu'une instruction a porté, pas que l'état final est celui attendu

Il est **idempotent** : un second passage ne rétrograde rien et laisse l'état
stable.

Vérifier à tout moment, sans rien écrire :

```bash
./scripts/amorcer-compte-administration.sh contact@exemple.fr --verifier
```

## Étape 3, la passkey

**Elle s'enregistre depuis l'appareil de l'exploitante, sur le domaine de
production.** Les deux conditions sont indispensables :

- une passkey est liée au **matériel**, donc à son iPhone ou son MacBook
- le `rpID` est le **domaine** : une passkey enregistrée sur un domaine de test
  ne vaut rien en production

Cette étape ne se délègue pas et ne s'anticipe pas.

## Étape 4, la vérification

**Une seconde connexion par la passkey prouve qu'elle fonctionne.** Sans elle,
l'exploitante découvrirait un enregistrement raté le jour où elle en a besoin.

## Étape 5, les codes de récupération

ADR-021 les nomme comme **seul recours** en cas de perte des appareils, et exige
que « leur existence soit vérifiée avant l'ouverture, pas supposée ».

Ils sont **imprimés et conservés hors ligne**. Leur possession par l'exploitante
se constate, elle ne se suppose pas : le développeur la lui demande explicitement
avant de considérer l'ouverture possible.

## Procédure de dernier ressort

**Réservée au développeur**, après perte de tous les appareils et des codes de
récupération.

ADR-021 la prévoit comme « une intervention manuelle en base ». Concrètement :

1. l'exploitante s'inscrit à nouveau, ou réutilise son compte existant
2. le développeur rejoue `amorcer-compte-administration.sh` sur son adresse
3. l'exploitante enregistre une nouvelle passkey, étapes 3 et 4 ci-dessus

**Les passkeys perdues ne se suppriment pas automatiquement.** Une passkey liée à
un appareil perdu reste en base : elle ne peut plus être présentée, l'appareil
ayant disparu, mais son nettoyage relève du même geste manuel.

## Vérification finale, avant l'ouverture

```bash
./scripts/amorcer-compte-administration.sh contact@exemple.fr --verifier
```

Et, en base, qu'**aucun compte de test ne subsiste** :

```sql
SELECT email, role FROM utilisateur WHERE role = 'ADMINISTRATRICE';
SELECT email FROM utilisateur WHERE email LIKE 'e2e-%' OR email LIKE '%exemple.test';
```

La première requête doit rendre **exactement une ligne**, celle de l'exploitante.
La seconde doit être **vide** sur la base de production.

## Ce qui reste à faire le jour de l'ouverture

Les étapes 1, 3, 4 et 5 exigent la présence de l'exploitante et le domaine de
production. Elles ne peuvent pas être jouées à l'avance, et c'est pourquoi cette
procédure est écrite plutôt qu'exécutée : le jour de la bascule ne s'improvise
pas.
