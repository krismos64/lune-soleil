# 14 août 2026, LS-100, éditeur de fiche produit et sections éditoriales

Troisième session du 14 août, après ADR-007 et la configuration Claude Code.
Première story de code de la phase 2 après LS-99, et **LS-87 y est absorbée** :
elle porte les quatre sections proposées à la création, exactement ce que cette
story écrit. La traiter à part aurait demandé de rouvrir le même fichier.

## Ce qui est livré

Couche métier complète et écran d'administration.

| Fichier | Ce qu'il porte |
|---|---|
| `services/sections-produit.ts` | C20, C22, C23, les quatre sections par défaut, l'appartenance vérifiée |
| `services/sections-produit-validation.ts` | schémas Zod, dérivation de clé ASCII et son unicité |
| `repositories/sections-produit.ts` | accès données, `ecrireRang` en SQL brut |
| `app/administration/produits/[id]/` | page serveur, composant client, six Server Actions, CSS |
| `services/catalogue.ts` | `creerProduit` écrit produit et sections **dans une transaction** |

Vingt-deux tests d'intégration, écrits **avant** le service.

## Les deux fois où le code avait raison contre mon test

Deux assertions que j'avais écrites étaient fausses, et le service correct. Le
noter parce que le réflexe inverse, corriger le code pour verdir le test, aurait
introduit deux défauts réels.

**Le rang après suppression.** Supprimer `matieres`, rang 2, laisse le maximum à
4 : une section recréée prend donc le rang 5, pas 4. J'attendais 4, qui est la
valeur d'un calcul par comptage, c'est-à-dire précisément le défaut que LS-99
avait déjà rencontré sur les catégories.

**La clé d'une section recréée.** Retaper « Matières et composants » après
suppression donne `matieres-et-composants` et non `matieres` : la clé dérive du
titre saisi, C20, et aucune table ne rattache un titre à une clé historique.
Vouloir « rattraper » la clé d'origine reviendrait à rétablir le lien entre
libellé modifiable et identifiant stable qu'ADR-026 a justement coupé. Le
comportement est figé par un test et son commentaire.

## Le contrôle du rendu HTML, et ce qu'il a coûté

Critère d'acceptation : `contenu` n'est jamais rendu en HTML, et un contrôle
textuel l'interdit sur ce chemin. D'où `verifier-rendu-texte-simple.sh`, deux
sens, cinq mutations.

Il cherche **trois formes** et non la seule `dangerouslySetInnerHTML` :
`innerHTML =` et `insertAdjacentHTML` produisent le même effet sans employer
l'API React. Son second sens vérifie que `frontend-design.md` énonce toujours la
règle : un contrôle qui applique une interdiction qu'aucun document ne porte
laisse la session suivante l'ignorer de bonne foi en écrivant LS-105.

### Le script de preuve a réintroduit le défaut qu'il interdit

Le point le plus utile de la session, et il est désagréable.

`restaurer()` faisait `git checkout "$REGLE" "$EDITEUR"`. Deux défauts en
chaîne, mesurés :

```
git checkout .claude/rules/frontend-design.md 'src/app/.../editeur-produit.tsx'
error: pathspec '...editeur-produit.tsx' did not match any file(s) known to git
```

1. **La commande est atomique.** `$EDITEUR` est un fichier neuf, non indexé :
   `git checkout` échoue en entier et ne restaure donc **pas non plus** `$REGLE`,
   pourtant suivi et parfaitement restaurable seul.
2. Corrigée fichier par fichier, elle laissait toujours `$EDITEUR` muté. Le
   `dangerouslySetInnerHTML` injecté par le cas 1 est **resté sur le disque**,
   c'est-à-dire le défaut de sécurité que ce contrôle existe pour interdire,
   réintroduit par son propre script de preuve.

C'est le motif « mutation non restaurée », déjà rencontré ici, sous une forme
nouvelle : le fichier **figure** dans la liste, et c'est son voisin non suivi qui
fait échouer la commande. Toute story écrit des fichiers neufs, le cas se
reproduira.

La restauration passe désormais par une **copie** faite avant les mutations, qui
ne dépend d'aucun état d'indexation.

Ce qui l'a révélé : le contrôle préalable du script, qui refuse de muter un dépôt
non vert. Sans lui, la seconde exécution aurait annoncé « 5 mutations, 5
détectées » sur un dépôt déjà cassé.

## Quatre cas ajoutés à la mutation de la suite de tests

- réordonnancement des sections **hors transaction** : le cas que la story
  demande, la contrainte différable n'a plus rien à différer
- sections par défaut **recréées à l'enregistrement**, ADR-026 décision 5.
  Aucun parcours nominal ne le révèle : sur une fiche intacte la mutation
  n'écrit rien du tout
- rang calculé sur le **nombre** et non le maximum
- **appartenance** d'une section à son produit non vérifiée, invariant 2 : une
  liste de la bonne longueur déplace la section d'un autre produit, et le
  contrôle d'exhaustivité ne voit rien puisqu'il compte

## La revue d'interface, premier emploi de `ls-frontend-revue`

L'agent écrit la veille a servi pour la première fois, et il a trouvé **sept
défauts**, dont un que je n'avais pas vu et qui comptait.

**Le message d'état du produit était écrit en dur.** `produit.statut` était
chargé par le dépôt et jamais lu : l'écran affirmait « cette fiche n'est pas
visible dans la boutique » quel que soit l'état réel. `tsc` ne voyait rien,
aucun ternaire ne consommant la valeur, et **LS-103 aurait rendu ce texte faux
sans qu'aucun contrôle ne rougisse**. C'est la variante silencieuse du piège de
l'enum ajouté, rencontré deux fois ici.

La correction est un `Record<StatutProduit, string>`, et elle est **prouvée** :

```
src/app/administration/produits/[id]/page.tsx(46,7): error TS2741:
Property 'EPUISE' is missing in type '{ BROUILLON: ...; ACTIF: ...; ARCHIVE: ... }'
but required in type 'Record<StatutProduit, string>'
```

Ajouter une valeur à l'enum casse désormais la compilation au lieu de passer.
`ProduitDetaille.statut` est typé `StatutProduit` et non `string`, sans quoi le
`Record` n'aurait rien garanti.

Cinq autres corrections, toutes appliquées :

- `role="alertdialog"` sans nom accessible, sans description liée et sans sortie
  au clavier. Un dialogue déclaré sans son contrat se comporte plus mal qu'un
  `div`, le lecteur d'écran annonçant un dialogue dont il ne trouve pas le
  contenu
- **la frappe était perdue en silence** pendant un envoi : le service capture la
  valeur à l'appel, donc l'écran annonçait « section enregistrée » en montrant un
  texte absent de la base. Les champs passent en `readOnly` pendant la
  transition, et non en `disabled` qui ferait perdre le focus en pleine saisie
- le titre de section, saisi jusqu'à 80 caractères, est réinjecté dans les
  messages et la confirmation sans `overflow-wrap` : un titre sans espace mesure
  environ 650 px pour 228 px disponibles à 320 px
- le message de succès survivait indéfiniment au geste qu'il décrivait
- trois boutons sur cinq sans nom accessible distinctif, la règle ayant été
  appliquée à « Monter » et « Descendre » seulement

**Un défaut est sorti du périmètre**, et c'est le bon geste : `--ls-border` vaut
1,57:1 sur blanc, contre 3:1 exigé par WCAG 2.2 AA critère 1.4.11 pour la limite
d'un contrôle de saisie. Mesuré à nouveau par moi plutôt que cru sur parole, un
rapport externe se trompant souvent de formulation en pointant la bonne zone. Le
jeton sert tout le back-office et la correction modifie ADR-022 : c'est **LS-108**,
rattachée à LS-3, à l'arbitrage de Christophe.

L'agent a correctement distingué ce qu'il pouvait affirmer de ce qui demande un
œil : il a signalé que `flex-wrap` garantit l'absence de débordement des cinq
boutons, sans se prononcer sur l'utilisabilité du résultat à 320 px.

## Ce qui a été écarté

**Pas de glisser-déposer** pour l'ordre des sections. Deux boutons par ligne
fonctionnent au clavier, au lecteur d'écran et au doigt à 320 px ; une fiche
porte quatre à six sections, le gain aurait été mince pour une implémentation
accessible bien plus lourde.

**Aucun assainissement HTML à l'entrée.** Le risque naît du rendu, jamais du
stockage. Nettoyer à l'écriture donnerait l'illusion que le stockage protège, et
masquerait le jour où un rendu HTML apparaîtrait ailleurs.

## Preuves

```
npm run type-check     tsc --noEmit, sans erreur
npm run lint           eslint, sans erreur
npm run test:unitaire  8 fichiers, 158 tests
npm run test:integration  14 fichiers, 183 tests, dont 22 neufs
npm run test:e2e       88 tests sur trois largeurs
npm run build          route /administration/produits/[id] en rendu dynamique
./scripts/verifier-tests-mutation.sh          62 mutations, 62 détectées
./scripts/verifier-rendu-texte-simple-mutation.sh   5 mutations, 5 détectées
./scripts/verifier-actions-sensibles.sh       13 fichiers de Server Actions
./scripts/verifier-regles.sh                  règles conformes au schéma
./scripts/verifier-config-claude.sh           aucun point à vérifier
```

## État des tickets

LS-100 terminée, **LS-87 traitée avec elle** et à clore. **LS-108 créée**,
rattachée à LS-3, bordure des contrôles sous le seuil AA.

## Prochaine étape

LS-101, variantes d'un produit : référence unique, prix en centimes entiers,
quantité physique. Elle est bloquée par LS-100 dans Jira.
