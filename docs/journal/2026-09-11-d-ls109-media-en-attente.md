# 11 septembre 2026, d : LS-109, le média bloqué en attente

Trouvé par `ls-frontend-revue` pendant la clôture de LS-102, le 15 août, et
classé hors périmètre. Un défaut d'exploitabilité, sans fuite de données, mais
qui rendait un écran menteur.

## Le cas exact, et ce qui le distingue d'un échec ordinaire

Le traitement d'une photographie est **synchrone** dans la Server Action :
dépôt en quarantaine, ligne en base à `EN_ATTENTE`, traitement, publication,
statut `TRAITE`. Environ deux secondes.

Le code gère très bien un échec **pendant** le traitement : le `catch` écrit
`ECHOUE`, et l'écran affiche un message qui dit quoi faire.

Ce que LS-109 ferme est autre chose : l'onglet fermé ou le processus redémarré
**avant** que ce `catch` ne s'exécute. Rien n'écrit jamais, et la ligne reste
`EN_ATTENTE` indéfiniment.

## L'écran aggravait la situation

Le message affiché disait « rechargez la page dans quelques instants ». Il
invitait à attendre alors que **rien ne changerait jamais**, et le bouton
« Supprimer » existait sur la carte sans qu'aucun texte n'y renvoie, à la
différence du message d'`ECHOUE` qui dit explicitement « supprimez-la et
téléversez-la à nouveau ».

## Trois pistes, une retenue

Le ticket en proposait trois sans préjuger. J'ai tranché pour la **première**,
l'expiration vers `ECHOUE`.

**La reprise du traitement est écartée.** Elle ne vaut que tant que l'original
est en quarantaine, donc dans la même heure, et elle relancerait un traitement
que **personne n'attend** : l'exploitante a fermé son onglet, retrouver une
photographie publiée sans l'avoir demandée est plus déroutant qu'un échec
reprenable.

**Le message honnête seul est écarté** comme seule mesure : il corrige ce que
l'écran dit, il laisse la ligne mentir. Un média `EN_ATTENTE` éternel bloque
aussi la publication du produit, LS-103, sans que rien ne l'explique.

**L'expiration fait les deux.** La ligne passe à `ECHOUE`, l'écran rend le
message qui dit déjà quoi faire, et la publication redevient possible.

Le message d'`EN_ATTENTE` est corrigé quand même, pour l'heure qui précède
l'expiration, où le traitement peut réellement être en cours.

## Aucune tâche de plus

L'expiration se branche sur `purge-quarantaine-medias`, quotidienne depuis
LS-102. **Les deux ferment le même incident par ses deux bouts** : la purge
retire l'original du disque, l'expiration corrige la ligne qui le désignait. Deux
seuils différents feraient exister une fenêtre où l'un a agi et l'autre pas.

Une heure, la même valeur que la purge, et très au-dessus des deux secondes que
le traitement prend réellement, mesurées à ADR-007.

## Un commentaire périmé trouvé en chemin

`purgerQuarantaine` portait en tête : « **appelée par aucune tâche
aujourd'hui**, le branchement relèvera de LS-72 ». Elle est branchée depuis
LS-102, donc depuis le 15 août. Le commentaire annonçait un travail à faire qui
était fait.

## La contrainte a eu raison contre mon test

Mon test « ne publie ni ne supprime aucun fichier » insérait un second média au
rang 1 à côté d'une photographie publiée. `media_principal_unique`, index partiel
filtré sur `ordre = 1`, l'a refusé.

C'est exactement son rôle. Le test lui donne désormais un rang libre, et le
paramètre porte la raison.

## Ce que le test de branchement prouve, et que le reste ne prouve pas

Les tests d'expiration exercent la fonction **prise isolément** : ils diraient la
même chose si aucune tâche ne l'appelait jamais, ce qui était l'état du dépôt.
Trouver l'appel dans le fichier de la route prouverait que le **texte** y figure,
jamais qu'il s'exécute.

L'assertion porte donc sur la base, après un appel réel de la route. Prouvé par
mutation : l'appel retiré, ce test seul rougit.

## Vérifications

```
npm run type-check                    vert
npm run lint                          vert
npm run format:check                  vert
vitest medias (intégration)           32 tests
mutation du branchement               1 cas, détecté
verifier-regles.sh                    règles conformes au schéma
```

## État des tickets

**LS-109 développée**, epic LS-3.

## Prochaine étape

**LS-165**, le contrôle d'atteignabilité des écrans de la boutique, ou
**LS-125**, les états de la page de confirmation.
