# 16 septembre 2026, douze échecs lus de travers

Session ouverte sur « où en étions-nous », et la reprise a trouvé mieux que
l'état du projet : le message d'erreur exact que la session précédente déclarait
manquant, et qui traînait depuis deux nuits dans les logs du nocturne.

## Ce que la reprise a corrigé du journal précédent

**La production est à jour**, contrairement à ce que le dernier journal laissait
en prochaine étape. Le déploiement a eu lieu le 14 septembre à 21h29, et le
contrôle automatique de ce matin mesure « écart de 1 commit, aucune migration ».
Ce commit est de la documentation.

Le journal du 15 annonçait « déployer » parce qu'il a été écrit avant. Rien à
reprocher, la ligne est simplement périmée.

## Le nocturne, rouge deux nuits de suite

Deux étapes échouaient les 15 et 16 septembre, sans bloquer `main` : elles sont
au nocturne depuis LS-177.

```
Scenarios critiques de bout en bout    12 failed, 2143 passed
Preuves par mutation lourdes           6 mutations, 1 non detectee
```

**Le geste de LS-231 a été fait avant toute mesure**, `pgrep -f mutation` vide.
C'est ce qui manquait la veille, et la leçon a tenu.

## Ma première lecture du message était fausse

Le log disait :

```
strict mode violation: ...getByRole('link', { name: 'TEST Catégorie A' })
  resolved to 2 elements
```

J'ai annoncé à Christophe un lien de catégorie **rendu deux fois**, en supposant
un jeu de données semé en double. J'ai passé ensuite un moment à chercher ce
doublon : dans le semis, dans les tests qui créent des catégories, dans la base.

**Il n'y en a jamais eu.** Les onze catégories de la base de bout en bout portent
onze noms distincts, vérifié en SQL. Le second élément était « TEST Catégorie
avis », capté parce que `getByRole` retient les **sous-chaînes** et que
« TEST Catégorie A » en est un préfixe.

Le log le disait, d'ailleurs, à la ligne suivante. Je ne l'avais pas lue.

## La cause, une seule pour les huit échecs du catalogue

`commande.setup.ts` sème `TEST Pièce notée LS-140` en `ACTIF` sans `publie_a`,
pour que sa **fiche** rende, un brouillon donnant 404. Le catalogue ne filtre que
sur `statut = 'ACTIF'` : elle entre donc dans la liste, et sa catégorie dans la
barre de filtres.

Le code servi est correct. Les deux tests mesuraient mal.

## Pourquoi le semis n'a pas été corrigé

Le ticket que j'avais écrit proposait de figer une `publie_a` sur cette pièce.
**Cela n'aurait rien réglé** : elle serait restée dans la liste, et le compte de
trois aurait encore cassé.

Surtout, le piège serait resté ouvert. Toute amorce future publiant un produit
l'aurait rejoué. La base de bout en bout est partagée par seize fichiers, et le
projet porte déjà cette leçon sur la base éphémère d'intégration : une assertion
globale y mesure le voisinage autant que son sujet.

Le test des nouveautés comparait la liste entière par `toEqual`. Il vérifie
désormais l'ordre relatif des trois pièces, ce que le tri affirme réellement.

## Le second défaut, un clic sur ce qui ne se clique pas

Quatre échecs sur `avis-parcours`, un timeout de 30 s en boucle :

```
- element is visible, enabled and stable
- scrolling into view if needed
- element is outside of the viewport
- retrying click action
```

Le test cliquait le `span` masqué par `clip-path: inset(50%)` qui porte le nom
accessible. Playwright le tient pour visible, l'arbre d'accessibilité le
conservant, puis refuse de cliquer dessus.

Le composant est correct : ce span répare le nom accessible « 2étoiles sur 5 »
sans espace, mesuré par LS-225. **Ni `getByLabel` ni `getByRole("radio")` ne
conviennent** comme correction, tous deux désignant l'entrée elle aussi masquée.
Le `<label>` se vise par son `for`.

## Les preuves par mutation

Les deux tests corrigés attrapent bien leur défaut, ils ne sont pas devenus
permissifs.

```
tri inverse en ASC              4 failed sur les nouveautes, 4 largeurs
for du libelle pointe sur 5     4 failed sur la notation, 4 largeurs
```

## Le second échec du nocturne, diagnostic partiel

`verifier-etats-non-nominaux-mutation.sh` rapporte une mutation « détectée
ailleurs » sur l'état vide des déclinaisons. **Rejouée en local, elle est
détectée par le test attendu**, sur `mobile-320`. La cause de l'écart en CI reste
inconnue.

Ce que le diagnostic a trouvé en revanche est un défaut du script lui-même : il
prétend lister les « échecs réels » mais imprime `········×F`, la **barre de
progression** de Playwright, que son `grep -E '(×|✘)'` capte au même titre
qu'une ligne nommant un test. Un rapport qui ne nomme rien ne permet pas de
conclure, et c'est ce qui a coûté le plus de temps ici.

Sujet distinct de LS-232, non traité dans cette PR : il est porté par **LS-233**,
avec la piste non vérifiée que la CI joue les quatre largeurs quand la mesure
locale n'en jouait qu'une.

## Traçabilité

**Dépôt** : PR 443 **fusionnée sur `main`** en rebase, branche supprimée,
`c026e90` et `85fd9c0`. Rouge au premier passage sur
`verifier-config-claude.sh`, précisément parce que cette page de journal
n'existait pas encore. Le contrôle a fait son travail, et cette page est la
raison pour laquelle le second passage est vert.

**Jira** : LS-232 créé, rattaché à LS-7, passé En cours, commenté avec l'état
réel des sept critères dont un écarté et argumenté.

**Mémoire** : rien d'écrit. Les trois questions du skill ne passent pas, la leçon
« une assertion globale sur base partagée » étant déjà en fiche, et le reste
relevant de l'incident daté.

## Prochaine étape

**Le critère 5 de LS-232 ne se vérifie qu'au prochain nocturne**, vers 7h du
matin. Le ticket reste En cours jusque-là.

**L'étape des mutations lourdes** reste rouge, et son défaut de rapport est
désormais porté par **LS-233**. Elle rougira encore au prochain nocturne, rien
n'ayant été corrigé de ce côté.

**LS-218**, l'expédition Sendcloud, reste le chantier de code prioritaire sans
dépendance externe.

Comptes relevés dans Jira, jamais déduits : **197 terminés sur 223 hors epics**,
**26 ouverts**, dont **11 En cours**. Deux tickets de plus qu'hier, LS-232 et
LS-233, tous deux ouverts par cette session.
