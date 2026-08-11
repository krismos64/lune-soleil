# 11 août 2026, écran de réauthentification, LS-89

Quatrième et dernière session de la journée, après LS-81, LS-80 et LS-72. Story
**partiellement faite**, fusionnée sur `main`, PR #91, trois commits.

## Périmètre livré

Critères **1, 5 et 7**. Les critères 2, 3 et 6 portent sur le branchement des
actions sensibles, et aucune n'existe dans le dépôt : zéro marque `@sensible`
dans `src/`, vérifié à nouveau ce soir. Les écrire aurait modifié le périmètre du
cahier des charges sans arbitrage.

C'est le motif même de l'arbitrage du 11 août qui a créé cette story : le
mécanisme et son contrôle existent **avant** les actions, ce qui oblige la
première action sensible écrite à les satisfaire.

## Le point signalé comme indétectable, fermé par la structure

`enregistrerPreuveIdentite` ne vérifie rien. La réponse est structurelle :
`services/preuve-identite.ts` est le **seul** module qui l'appelle, et ses deux
fonctions vérifient avant d'écrire. Il n'y a qu'un endroit à relire.

Le chemin passkey mérite une précision que la première version se trompait à
énoncer. La négociation WebAuthn se termine chez Better Auth, qui crée une
session neuve : le serveur ne peut ni la rejouer, ni vérifier l'assertion une
seconde fois. Il constate qu'une session vient d'être ouverte, rien de plus.
**Cette condition n'atteste donc pas le moyen**, une connexion par mot de passe
produisant une session tout aussi neuve. Ce qu'elle ferme est l'appel depuis une
session ancienne, et comme les deux chemins accordent la même chose, il n'y a
rien à gagner à emprunter celui-ci.

## Un défaut grave que j'ai introduit, et qui s'est produit deux fois

La première version ne filtrait que la **présence** d'une session, jamais le
**rôle**. Cet écran était le seul de `/administration` dans ce cas, les deux
autres appelant bien `exigerAdministratrice`.

Un client inscrit sur la boutique, rôle `CLIENT` par défaut, ouvrait l'écran,
saisissait **son** mot de passe et repartait avec une preuve d'identité fraîche :
`verifyPassword` vérifie contre `session.user.id`, donc il réussissait.

Ce qui rend ce défaut instructif : `.claude/rules/securite.md` **signalait déjà**
ce couple comme non mesuré, en demandant nommément à LS-89 de trancher s'il
fallait l'automatiser. J'avais lu cette règle et je n'ai pas fait le lien. La
story n'a pas seulement omis de trancher, elle a ajouté le premier écran qui
fabrique la preuve sans filtrer le rôle.

**Ma première correction a échoué en silence.** Le reformatage Prettier avait
déplacé la cible de ma substitution, et seule `etablirPreuveParPasskey` portait
la garde : le chemin du mot de passe, le plus exposé, restait ouvert. Le test de
comptage que je venais d'écrire l'a attrapé, pas moi.

C'est la troisième forme de « cible de mutation déplacée » sur ce dépôt, la
première fois sur une **correction** et non sur un test.

## Deux assertions resserrées après seconde relecture

Le comptage des gardes portait sur le fichier entier : deux appels dans la
**même** fonction l'auraient satisfait, l'autre restant sans garde. C'est le faux
négatif exact que `verifier-actions-sensibles.sh` a déjà corrigé une fois, en
bornant le corps de chaque fonction. Le test compte désormais par fonction.

Le balayage du critère 7 cherchait le seul nom `enregistrerPreuveIdentite`, ce
qui rate un `prisma.session.update` écrit directement sur `reauthentifieeLe`.
C'est la **seule évasion commettable sans intention** : quelqu'un qui ignore
l'existence de la fonction produit le trou sans jamais toucher au nom recherché.

Les deux sont prouvées en fabriquant l'évasion, et dans le second cas en
retirant toute mention du nom de fonction pour que l'ancien motif soit
réellement aveugle.

## Preuves

```
npm run type-check                        vert
npm run lint                              vert
npm run format:check                      vert
npm run build                             vert
npm run test                              240 tests, 15 fichiers
npm run db:verifier                       95 réussites, 0 échec
./scripts/verifier-regles.sh              vert
./scripts/verifier-actions-sensibles.sh   vert, 4 familles en attente
./scripts/verifier-config-claude.sh       vert
./scripts/verifier-tests-mutation.sh      40 / 40 détectées
```

La suite passe de 224 à **240 tests**, la mutation de 36 à **40 cas**.

Rendu vérifié sur serveur de production local, quatre largeurs, débordement nul,
état d'erreur et message de succès compris. Contrastes **mesurés** : succès
5,16:1 sur sable, erreur 5,50:1, tous deux AA en petit texte.

## Un écart dans la description du ticket

Elle indique de repasser par `/sign-in/passkey`, **chemin qui n'existe pas** : le
plugin expose `/passkey/verify-authentication`. Même erreur que celle trouvée en
LS-80, où elle rendait le journal des connexions muet sur toutes les connexions
par passkey.

## État des tickets

**LS-89 reste « En cours »**, critères 2, 3 et 6 en attente des actions
sensibles.

**LS-92 créée**, limitation de débit sur `verifyPassword`. `auth.api.*` n'est pas
soumis au `rateLimit`, seul `auth.handler` l'est. Le vrai motif n'est pas
l'absence de plafond mais **l'absence de trace** : ces tentatives n'apparaissent
pas dans le journal des connexions. Should, V1 cible, l'enjeu étant borné depuis
que l'appelant doit être administratrice.

## Bilan de la journée

Quatre stories touchées, deux terminées ce soir (LS-80 et LS-72), deux
partielles (LS-81 et LS-89).

**Compté et non recopié** : LS-2 porte **vingt-deux stories filles, seize
terminées**, deux en cours et quatre à faire. J'avais d'abord écrit vingt-quatre
et dix-sept, deux chiffres faux, corrigés en interrogeant Jira plutôt qu'en
relisant un ticket. Motif déjà en mémoire, un compte recopié n'est pas une
mesure.

**Les trois relectures critiques ont trouvé des défauts réels que les suites de
tests ne voyaient pas**, à chaque fois. Neuf au total sur la journée, dont deux
graves : le journal muet sur la passkey, et cet écran sans garde de rôle. Aucun
n'aurait été vu autrement.

Le rapport reste favorable : chaque relecture coûte quelques minutes et a trouvé
en moyenne trois défauts, dont certains auraient été découverts en production ou
jamais.

## Prochaine étape

Six stories restent ouvertes sur LS-2 :

| Ticket | État | Sujet |
|---|---|---|
| LS-81 | En cours | critères 3, 4, 6, 7 reportés en LS-89 |
| LS-89 | En cours | critères 2, 3, 6, en attente des actions sensibles |
| LS-90 | À faire | registre des traitements, **Must / Go-Live** |
| LS-91 | À faire | proxies de confiance, l'IP reste nulle sans eux |
| LS-92 | À faire | limitation de débit sur les Server Actions |
| LS-75 | À faire | **en dernier**, porte de sortie qui vérifie les autres |

LS-90, LS-91 et LS-92 ont été créées aujourd'hui. **LS-90 est la seule Must sur
Go-Live** des trois, et la seule qui ne dépende d'aucune infrastructure : elle
est le meilleur candidat pour la prochaine session.

La purge du journal des connexions n'est toujours appelée par personne : elle
attend la tâche de libération de la phase 3.
