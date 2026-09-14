# 15 septembre 2026, le ticket qui mesurait mon propre bruit

Session courte, et son résultat principal est une correction plutôt qu'une
livraison. LS-231 reposait sur des chiffres que je fabriquais moi-même.

## Ce que le ticket annonçait, et ce qui est vrai

Ouvert la veille au soir : « 21 tests en échec sur `main`, jamais les mêmes », sur
la réservation de stock et la transaction de commande.

Remesuré aujourd'hui, sur `main` propre, aucun processus concurrent :

```
6 executions completes    1 seul echec, sur tableau-bord.sequential.test.ts
le meme fichier seul      10 sur 10, cinq fois de suite
```

**Pas 21 échecs mais un. Pas sur la réservation mais sur le tableau de bord.**

## La cause de l'erreur, prouvée dans les deux sens

`verifier-tests-mutation.sh`, lancée la veille pour mesurer sa durée, tournait
encore **des heures après** et mutait `tests/aide/reservation-sql.ts` en boucle.

```
avec la mutation posee    1 echec, precisement « rend la piece definitivement
                          indisponible apres conversion en vente »
sans la mutation          8 tests sur 8
```

C'est exactement le test observé la veille. **J'ai ouvert un ticket d'instabilité
sur un dépôt que j'abîmais sous la mesure.**

Le geste manquant tient en une commande, `pgrep -f mutation`. La mémoire du
projet portait déjà « un test instable ne se mesure pas une fois », et j'avais
conclu sur une mesure unique et polluée.

## Deux autres affirmations du ticket étaient fausses

**« Les fichiers fautifs portent `.sequential` »** : les 60 fichiers d'intégration
le portent, c'est la convention de tous et non un marqueur.

**La concurrence entre fichiers était soupçonnée** : `fileParallelism: false` est
déjà posé sur le projet d'intégration, elle n'a jamais été en cause.

Trois affirmations sur quatre, écrites sans les vérifier. Le ticket est réécrit,
titre compris, et un commentaire garde trace de ce qu'il disait.

## Une piste suivie et écartée, pour ne pas la refaire

Le comptage du tableau de bord lit huit tables, dont `avis` et
`demande_retractation` que le `TRUNCATE` du fichier ne nettoie pas. L'écart est
réel.

**Mais il n'est pas la cause** : ces deux tables alimentent `retractationsEnCours`
et `avisAModerer`, et le fichier n'assert sur aucun des deux. Vérifié par `grep`
avant de l'annoncer comme une trouvaille.

## Ce que la vérification de fin de session a trouvé

Christophe a demandé un contrôle avant de quitter. Deux défauts, dont un qui
comptait.

**LA PRODUCTION N'EST PAS À JOUR.** Dernier déploiement le 13 septembre sur
`89c83df`, quand `main` est à `d3d18f5` : **48 commits d'écart**, dont tout
LS-229. Mesuré sur `lune-soleil.fr/catalogue`, le titre rend en `system-ui` 40 px,
l'état d'avant la correction.

**La fiche mémoire d'entrée était très périmée** : « 111 tickets terminés sur
178 » et « prochaine étape LS-180 », une story close depuis longtemps. Elle
annonçait aussi « production À JOUR », ce qui aurait trompé la prochaine session
exactement comme le 13 septembre. Réécrite, et raccourcie de 1876 lignes à une
centaine.

## Prochaine étape

**Déployer**, le workflow « Déployer en production », après avoir attendu que
`publier-image.yml` ait fini.

**LS-231** reste en cours, diagnostic interrompu à la demande de Christophe. Ce
qui manque est le message d'erreur exact, jamais capturé : sans lui, toute
correction serait une supposition.

**LS-218**, l'expédition Sendcloud, reste le seul chantier de code prioritaire
sans dépendance externe.

Comptes relevés dans Jira, jamais déduits : **197 terminés sur 221 hors epics**,
**24 ouverts**, dont **10 En cours**.
