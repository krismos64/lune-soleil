# 3 septembre 2026, session G : LS-171, le libellé qui débordait

Deuxième story de l'enchaînement demandé par Christophe, après LS-172.

## L'angle mort, établi avant toute correction

Le critère 1 exigeait d'élucider pourquoi le test de LS-57 ne voyait rien, et de
l'écrire **avant** de toucher au style. C'est fait, et la cause est nette.

`compte-commandes.spec.ts` cliquait sur le lien du détail puis **mesurait
immédiatement**, sans attendre la fin de la navigation :

```ts
await page.getByRole("link", { name: `Commande ${numero}` }).click();
expect(await debordementHorizontal(page)).toBeLessThanOrEqual(...)
```

Il mesurait donc la page d'**historique**, où le libellé n'apparaît pas.

**La preuve tient en une ligne** : ajouter l'attente du titre de niveau 1 fait
échouer le test aussitôt, à 43 px, sans avoir rien changé au style.

C'est exactement le défaut que j'avais corrigé la veille dans mon propre test de
LS-134, et pour la même raison : les autres tests du fichier attendent un
élément, donc se synchronisent d'eux-mêmes ; celui du débordement mesure sans
attendre.

## La correction, et ce que la mutation a démenti

`overflow-wrap: anywhere` sur `.article`, qui porte le texte.

**`anywhere` et non `word-break: break-all`** : le premier ne coupe que les mots
trop longs pour leur ligne, le second couperait aussi les mots courts au milieu
et abîmerait tous les libellés normaux.

**Aucune troncature**, exigence du ticket : `text-overflow: ellipsis` masquerait
une partie du nom du bijou acheté, sur l'écran même où le client vérifie sa
commande.

**La première version posait aussi `min-width: 0`**, au motif habituel qu'un
enfant de flexbox a pour taille minimale celle de son contenu. **La mutation l'a
démenti** : le retirer laisse le test vert, parce que cette taille minimale
automatique porte sur l'axe **principal**, et `.article` est en
`flex-direction: column`, donc son axe principal est vertical.

La ligne est supprimée. Une justification démentie qui reste apprend à ne plus
lire les commentaires voisins.

## L'administration était déjà protégée

Le ticket demandait de vérifier les autres écrans affichant `libelleProduitFige`.
Il y en a un seul, `/administration/commandes/[id]`, et son CSS porte déjà
`overflow-wrap: anywhere` sur `.articleLibelle`. Vérifié à 320 px, 19 tests
verts.

Le défaut était donc circonscrit à l'espace client.

## Un garde-fou de mutation inopérant

Mon contrôle « la mutation est-elle posée » cherchait `overflow-wrap: anywhere`
dans le fichier. Or le motif apparaît **trois fois** : ma règle, une règle
voisine sur les adresses email, et mon propre commentaire. Il annonçait donc
« RATÉE » sur une mutation correctement posée.

Corrigé en comptant les occurrences avant et après, et en exigeant la
décroissance. **Un garde-fou de mutation doit être aussi spécifique que la
mutation elle-même**, sinon il ment dans les deux sens.

## Vérifications

```
npm run lint                            aucun signalement
npx prettier --check                    code style conforme
npx playwright test compte-commandes    29 tests sur 3 largeurs, tous verts
administration a 320 px                 19 tests verts
./scripts/verifier-contraste.sh         code 0
mutations                               2 jouées, 1 détectée, 1 ayant démenti sa cible
```

La mutation détectée l'est par **un seul test, à 320 px**, les deux autres
largeurs restant vertes : c'est la signature d'un défaut de largeur et non d'une
régression générale.

## Prochaine étape

La fiche `docs/prive/QUESTIONS-EXPLOITANTE.md`, dont Christophe a obtenu une
partie des réponses : les propager dans la documentation, puis mettre la fiche à
jour pour ne laisser visibles que les questions restantes.

## État des tickets

LS-171 **livrée**, epic LS-3.
