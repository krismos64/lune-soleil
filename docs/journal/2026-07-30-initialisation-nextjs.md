# 30 juillet 2026, LS-65 et arbitrages avant LS-66

## Ce qui a été fait

### Analyse du rapport externe sur l'état d'avancement

Un rapport produit hors du dépôt concluait « feu vert sur LS-65, corrections
avant LS-66 ». Chaque point a été vérifié contre le dépôt réel plutôt que repris
sur parole. Ses chiffres sont exacts : 25 modèles, 14 enums, 21 contraintes
`CHECK`, comptées par `grep -c "ADD CONSTRAINT"`.

Quatre de ses six points sont confirmés :

| Point | Vérification |
|---|---|
| `Paiement.confirmeA` absent | confirmé, seul `creeA` existe |
| LS-70 contredit ADR-023 | confirmé, et plus gravement que décrit |
| Node éclaté sur LS-67 | confirmé, LS-67 exige la CI et le Dockerfile qui n'existent qu'en LS-69 et LS-74 |
| LS-68 contradictoire | confirmé, la description dit « il échouera » puis exige `npm run test` vert |

Trois corrections apportées à ce rapport :

**Le cas des sections de fiche produit était mal caractérisé**, et c'est le plus
important. Le rapport décrivait des champs fixes auxquels s'ajouteraient des
sections personnalisables. L'extraction du bundle du prototype,
`AdminPrototype-Gq3RlyTg.js`, montre autre chose : les cinq champs **sont** des
sections par défaut, avec le même état `{id, title, content, visible}` que celles
qu'on ajoute, toutes supprimables et déplaçables.

```js
sections:[{id:`description`,title:`Description détaillée`,...},
          {id:`materials`,title:`Matières et composants`,...},
          {id:`dimensions`,title:`Dimensions`,...},
          {id:`manufacturing`,title:`Fabrication`,...},
          {id:`care`,title:`Conseils d'entretien`,...}]
```

Conséquence : garder les colonnes **et** ajouter une entité de sections aurait
créé deux systèmes concurrents pour la même donnée. L'admin n'aurait pas su où
ranger « Matières » renommé en « Composants ».

**Sur LS-70, le défaut est plus grave que « contredit un ADR ».** ADR-023
ligne 151 examine et écarte nommément l'alternative exacte que LS-70 réclame,
« douze caractères en global, seize vérifiés côté serveur pour l'administration »,
au motif que la garantie deviendrait applicative.

**Les ADR-007 et ADR-008 ne sont pas des références cassées.** Le rapport les
signalait comme cités mais inexistants. Ce sont des numéros réservés dans la
table de planification de `.claude/skills/adr/SKILL.md`, et deux ADR qui
mentionnent explicitement qu'un choix reste ouvert. Rien à corriger.

### LS-65, initialisation du projet

Next.js 16.2.12, React 19.2.4, App Router, TypeScript strict, ESLint 9, Prettier.
Les cinq dossiers de couches existent, chacun avec un fichier de garde qui énonce
ce qui a le droit d'y entrer.

Commits `d3f1949` et `56f62dc`, pull request 43 fusionnée en rebase sur `main`.

Quatre écarts assumés par rapport à une initialisation par défaut :

1. **Mode strict complété.** `strict: true` n'active ni
   `noUncheckedIndexedAccess` ni `exactOptionalPropertyTypes`. Sur un projet où
   l'euro est un entier de centimes, `lignes[0].prixCentimes` sans vérification
   est une erreur de calcul silencieuse.
2. **Tailwind écarté**, la palette venant d'ADR-022 et de `tokens.css`.
3. **Trois overrides npm** ramènent `npm audit` de douze alertes hautes à zéro.
4. **`engine-strict=true`**, sans quoi `engines` ne bloque rien.

## Ce qui a dérapé

### Prettier a reformaté vingt-six fichiers de documentation

`npm run format` sans restriction a réaligné les tables markdown de `CLAUDE.md`,
des sept ADR, des quatre documents d'architecture, du journal et des règles.
Diff massif, sans aucun rapport avec la story.

Restauré par `git checkout`. `.prettierignore` limite désormais Prettier au code :
la rédaction du projet suit ses propres règles de largeur et de mise en forme,
pas celles d'un formateur.

### L'avis de sécurité conduisait à un override qui casse ESLint

L'avis sur `brace-expansion` invite à monter en 5.x. Fait tel quel, ESLint meurt
sur `TypeError: expand is not a function` : `minimatch` 3.x appelle l'ancienne
API. Le bon override porte sur `minimatch` en 10.x, qui appelle la nouvelle.

Suivre l'avis à la lettre a donc produit un dépôt qui ne lint plus, avec un
`npm audit` à zéro. Un audit vert ne prouve pas que la chaîne fonctionne.

### `engines` seul ne protégeait rien

Le README, `CLAUDE.md` et LS-65 traitent la fixation de Node comme une
protection. Mesure faite : sans `engine-strict`, npm affiche `EBADENGINE` en
avertissement puis installe les 343 paquets. C'est exactement le scénario Node
23.9.0 qui avait fait perdre du temps, l'avertissement se perdant dans le
défilement.

```
sans engine-strict : npm warn EBADENGINE ... « added 343 packages »
avec engine-strict : npm error code EBADENGINE, sortie en erreur
```

Le garde-fou était déclaratif. Il est maintenant bloquant, et prouvé rouge puis
vert.

## Arbitrages de Christophe, 30 juillet

1. **Dimensions** : `Variante.dimensions` reste la source de vérité. Aucune
   section « Dimensions » par défaut, pour éviter la double saisie. Une section
   personnalisée peut porter un guide des tailles, jamais la dimension
   structurée. Le prototype devra être ajusté sur ce point.
2. **Mots de passe** : ADR-023 conservé tel quel, seize caractères pour tous. Pas
   d'ADR-026, pas de règle différente entre clients et administration. L'achat
   sans compte reste disponible, donc la contrainte ne bloque aucune vente.
3. **Sections produit** : validées avant LS-66. `descriptionCourte` reste un
   champ fixe, quatre sections par défaut, texte structuré sans HTML libre ni
   EAV. Les blocs livraison, retours et avis restent hors des sections
   personnalisables.
4. **`Paiement.confirmeA`** : validé avant la migration initiale.

## Prochaine étape

Avant LS-66, dans cet ordre :

1. ADR sur les sections de fiche produit, à présenter à Christophe pour
   acceptation explicite, le processus du dépôt l'exigeant.
2. Story de correction du schéma : sections produit et `Paiement.confirmeA`.
3. Correction des descriptions LS-66, LS-67, LS-68 et LS-70.

**Ne pas lancer LS-66 avant que les modifications de schéma soient décidées,
appliquées et contrôlées.**

Un point ouvert à trancher dans l'ADR : le nombre de sections par défaut. Les
arbitrages citent « les cinq sections proposées par défaut » dans une phrase
tronquée, mais l'arbitrage 1 retire Dimensions. Quatre sections retenues, à
confirmer.

## État des tickets

| Ticket | État | Note |
|---|---|---|
| LS-65 | Terminé | fusionné sur `main`, tous critères vérifiés sur clone neuf |
| LS-66 | À faire | **bloqué** jusqu'à la correction du schéma |
| LS-67 | À faire | description à corriger, Node et `prisma.config.ts` |
| LS-68 | À faire | description à corriger, contradiction sur le test |
| LS-70 | À faire | description à corriger, seize caractères pour tous |

## Impacts documentaires à traiter avec l'ADR

`.claude/rules/frontend-design.md` porte une table « Fiche produit, ordre des
blocs » dont les lignes 8 à 12 citent `Produit.description`, `Produit.matieres`,
`Produit.entretien` et `Produit.fabrication`. Ces quatre sources disparaissent
avec la migration en sections. La table est à reprendre dans la même story.
