# 7 septembre 2026, b : le layout qui ne se revalide pas, et trois seuils déplacés

LS-201, menée en autonomie après LS-168. Le ticket annonçait trois tests
d'administration instables sous charge. **La cause principale était un défaut
produit**, qu'il ne soupçonnait pas.

## Le défaut produit

`revalidatePath(chemin)` invalide la **page** seule, vérifié via Context7 :
l'option `"layout"` invalide en plus le layout et ce qui vit dessous.

La pastille des messages est calculée par le **layout**, `lireComptages`, alors
que la liste est rendue par la page, qui porte `dynamic = "force-dynamic"`.
Classer un message rafraîchissait donc la liste en laissant la pastille sur son
ancienne valeur.

**Ce que l'exploitante voyait** : elle classe son dernier message non lu, la
liste se vide, et la barre continue d'annoncer « 1 ». Elle rouvre l'écran pour
n'y rien trouver.

Le même défaut existait sur les stocks, moins visible et tout aussi faux :
`variantesStockFaible` et `variantesIndisponibles` alimentent le tableau de bord
depuis le layout, et les cinq actions de stock ne le revalidaient pas.

**Six appels corrigés au total.**

### Comment il a été trouvé, et ce que cela coûte de ne pas instrumenter

Par un message d'assertion écrit exprès, seule trace exploitable sur un défaut
qui ne se voit que sous charge :

```
Error: Pastille « 1 » pour 0 affiches. Sujets non lus : []
```

Deux hypothèses ont été vérifiées puis **écartées** avant celle-là : la page ne
marque pas les messages comme lus en les affichant, et la limite de cent lignes
n'était pas en cause, deux messages seulement étant en base. Les vérifier a
coûté quelques minutes ; les retenir aurait coûté la session.

## Trois seuils déplacés, aucune cause fermée

C'est l'enseignement méthodologique de la journée, et il vaut au-delà de ce
ticket.

```
expect.timeout 5 s   ->  echecs a 5,5 / 5,3 / 8,9 s
expect.timeout 15 s  ->  echecs a 15,7 / 18,7 / 15,3 s
workers 5 -> 3       ->  echecs a 11,0 / 10,5 / 10,2 s
```

**Un correctif qui déplace le seuil sans rien fermer n'est pas un correctif.**
Chaque réglage paraissait justifié isolément, et les échecs revenaient au
nouveau plafond, sur des tests jamais les mêmes.

La raison est mesurable : **charge de 4,48 au repos**, Playwright arrêté, les
outils de développement consommant déjà la moitié des dix cœurs. Calibrer un
plafond dans ces conditions revient à calibrer sur du bruit.

## Ce que la session ne prouve pas

La stabilité de la suite sur cette machine. Ces tests passent tous en isolation,
100 tests en 24,5 s pour les deux fichiers concernés, et la référence est la
chaîne d'intégration sur exécuteur dédié.

`expect.timeout` reste posé à dix secondes et `workers` à trois, deux en CI : ces
réglages sont justes indépendamment du défaut, Playwright ignorant que le serveur
Next.js et PostgreSQL se partagent les mêmes cœurs.

## Mon erreur de protocole, la même qu'à la session précédente

**J'ai enchaîné trois exécutions sans purger `rate_limit`**, ce que ma propre
fiche mémoire écrite le matin même dit explicitement de faire. Les exécutions 2
et 3 étaient donc invalides, et j'ai failli en tirer une conclusion.

Une fiche mémoire relue ne suffit pas : c'est le geste qui doit être outillé.

## État des tickets

**LS-201 reste ouverte.** Le défaut produit est corrigé à la source et ne dépend
d'aucune condition de charge ; la stabilité de la suite se jugera sur la CI.

## Prochaine étape

**LS-200**, le raccordement de l'API Sendcloud, qui débloque la chaîne la plus
longue du backlog : elle bloque LS-131, qui bloque LS-33 et son délai légal de
rétractation.
