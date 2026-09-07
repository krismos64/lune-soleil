# 7 septembre 2026, i : C37 était juste, sa portée n'avait jamais été mesurée

Trouvé pendant la vérification de cohérence demandée par Christophe, en
cherchant **quelles règles numérotées n'étaient exercées par aucun script ni
test**. C37 était la seule, et elle était violée onze fois.

## Ce que LS-201 avait laissé

La règle a été posée ce matin même, session B, après que le défaut eut été livré
six fois. Elle est juste. Ce qui manquait est la **mesure de sa portée** :
LS-201 a corrigé les messages et les stocks, deux domaines sur cinq.

Le layout lit **neuf** comptages, pas les quatre que la règle citait :

```
commandesAPreparer  commandesPretesAExpedier  commandesEnCours
variantesStockFaible  variantesIndisponibles
expeditionsEnTransit  messagesNonLus  retractationsEnCours
l'encaissé du jour
```

Onze appels restaient donc en violation, sur les commandes, les expéditions, les
rétractations et les variantes. Sur chacun, l'exploitante voyait l'écran se
rafraîchir pendant que la barre gardait son ancien nombre.

## Le raisonnement se fait sur la donnée, jamais sur le dossier

C'est ce qui distingue cette correction d'un remplacement mécanique. **Quatre
appels restent délibérément sans `"layout"`** :

- `regenererDocument` rend un PDF et ne touche aucun comptage
- les trois transitions intermédiaires de rétractation passent d'un statut *en
  cours* à un autre statut *en cours*, et `retractationsEnCours` exclut les
  seuls `REMBOURSEE` et `REFUSEE` : le nombre ne bouge pas

Ajouter `"layout"` par symétrie ferait recalculer neuf agrégats pour rien.
Chacun de ces quatre cas porte sa raison écrite dans le code, pour qu'on ne les
« harmonise » pas plus tard.

## Le contrôle a rougi sur mon propre code correct

Sa première version cherchait `revalidatePath([^)]*"layout"`. Ce motif s'arrête
à la **première parenthèse fermante**, qui est celle de `chemin(produitId)`, donc
il ne voyait jamais l'option sur `revalidatePath(chemin(produitId), "layout")`.

Il accusait un fichier que je venais de corriger. Sans vérifier, j'aurais pu
conclure que ma correction n'avait pas pris, et la « refaire » sur du code déjà
juste. Le cas 6 de la preuve par mutation ferme cette porte définitivement.

## Ce que le contrôle ne fait pas, et pourquoi

Il raisonne **par fichier et non par fonction** : un fichier portant un appel
correct et un appel oublié passe. Suivre quelle fonction modifie quel comptage
demanderait de remonter les appels jusqu'au SQL, ce qu'un contrôle textuel ne
fait pas.

Il attrape le **domaine entièrement oublié**, ce qui est exactement ce qui s'est
produit : quatre domaines sur cinq n'avaient aucun appel avec `"layout"`. Son
en-tête le dit plutôt que de laisser croire à une couverture complète.

## Le motif, pour la troisième fois de la journée

Une règle écrite et non vérifiée ne tient pas. C'est la même leçon que
`verifier-jira.sh` et que le garde-fou d'étiquette de LS-199. Ici la règle avait
moins de douze heures, et elle était déjà fausse dans les faits sur quatre
domaines : écrire la règle et mesurer sa portée sont deux gestes distincts.

## État des tickets

**Aucun ticket**, correction faite sur arbitrage direct de Christophe pendant la
vérification. PR #289 fusionnée en rebase, commit `d638148`. Les deux étapes
neuves `9w` et `9w bis` ont réellement tourné en CI, vérifié à l'API du run et
non au seul vert global.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui attend les clés de
Christophe.
