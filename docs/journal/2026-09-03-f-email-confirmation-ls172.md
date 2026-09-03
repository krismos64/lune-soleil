# 3 septembre 2026, session F : LS-172, l'email qui transmet les liens

Christophe a demandé d'enchaîner LS-172 puis LS-171 en autonomie. Cette page
porte la première.

## Le trou que la story ferme

**Deux jetons étaient émis à chaque commande et personne ne les transmettait.**
Le jeton de facture depuis LS-132, celui de rétractation depuis LS-134. Leur
valeur en clair n'existe qu'à l'instant de leur création, règle L5 : la base ne
garde que l'empreinte.

Conséquence, un acheteur sans compte n'avait ni facture atteignable ni moyen de
se rétracter, alors que la route existait et fonctionnait. L'article L221-21
exige une mise à disposition, pas une existence.

Le commentaire de `jeton-acces.ts` l'annonçait depuis LS-132 : « Compose le lien
complet à transmettre au client, **LS-82 le consommera** ». LS-82 a livré la
délivrabilité, jamais ce contenu.

## Un seul message et non deux

`PARCOURS.md` prévoyait deux entrées à l'étape 9, « commande payée » puis
« facture ». Elles partaient du même événement, à la même seconde, vers la même
adresse : le client aurait reçu deux messages coup sur coup dont le second
n'aurait porté qu'un lien.

**Arbitrage : un seul message, `commande-confirmee`, portant les deux liens.**
`PARCOURS.md` est corrigé et porte la raison, plutôt que de laisser la table
contredire le code.

Les deux liens restent **distincts**, règle L6 : une fuite du lien de facture ne
doit pas donner le pouvoir de rétracter la commande d'autrui.

## Ce que la mutation a établi sur la garde de rejeu

`deposerConfirmationAuClient` sort quand les deux jetons sont absents. **Retirer
cette garde laisse la suite entièrement verte**, et j'ai d'abord cru à un trou
de test. Deux tentatives de correction ont échoué avant que je cherche la cause.

Deux barrières en amont ferment le chemin, chacune plus tôt que la précédente :

1. le rejeu du **même** événement sort en `DEJA_TRAITE`, `evenement_fournisseur`
   étant unique
2. un **second** événement sur une commande déjà payée sort en `DEJA_ENCAISSE`,
   première clé d'effet, avant même d'atteindre la facture

**La garde reste nécessaire, et le commentaire interdit de la retirer.** Elle
protège d'une conséquence et non d'un chemin : sans elle, un appelant futur
composerait `/facture/undefined`. Mesuré, `lienDocument` ne lève pas sur
`undefined` et rend un lien mort.

C'est le cas d'une garde dont **l'absence de couverture prouve la profondeur,
pas l'inutilité**. Le test vérifie la propriété observable, un seul message par
commande, sans prétendre exercer ce qui la sous-tend.

## Le piège du jour, pour la seconde fois

Deux tests de LS-134 ont rougi : ils lisaient « l'envoi de la commande » sans
filtrer par modèle, et trouvaient désormais deux lignes.

**C'est exactement le motif rencontré le matin avec les deux jetons** : ce qui
est unique par commande cesse de l'être dès qu'un second usage apparaît. La
lecture est maintenant ancrée sur `modele`, comme celle des jetons l'est sur
`portee`.

## Une variable manquante, anticipée cette fois

`NEXT_PUBLIC_SITE_URL` n'était pas définie en intégration continue.
`lienDocument` **lève** quand elle manque, défaut fermé délibéré, et cette
erreur serait remontée **hors** du `catch` de `EmetteurNonConfigureError`,
faisant échouer la transaction donc perdant le paiement.

Ajoutée à la CI **avant** que le test ne la découvre, en application directe de
la leçon de LS-134 sur les variables `FACTURE_*`.

## Vérifications

```
npm run type-check                          aucune erreur
npm run lint                                aucun signalement
npx prettier --check                        code style conforme
npx vitest run --project unitaire           411 tests, tous verts
npm run test:integration                    48 fichiers, 679 tests, tous verts
npx playwright test                         736 tests, tous verts
./scripts/verifier-regles.sh                code 0
./scripts/verifier-tests-non-ignores.sh     code 0
./scripts/verifier-registre-traitements.sh  code 0
mutations                                   5 jouées, 4 détectées, la cinquième expliquée
```

Une exécution e2e ultérieure a échoué sur « Too many requests », le fond de
bruit de **LS-168** et non un défaut de cette story : le passage complet
précédent donne 736 succès.

## Prochaine étape

**LS-171**, enchaînée immédiatement : un nom de produit sans espace déborde de
43 px à 320 px sur le détail de commande.

Ensuite, la fiche `docs/prive/QUESTIONS-EXPLOITANTE.md`, dont Christophe a
obtenu une partie des réponses : les propager dans la documentation et ne
laisser visibles que les questions restantes.

## État des tickets

LS-172 **livrée**, epic LS-5. **LS-136 est débloquée** : son lien `is blocked by`
vers LS-172 n'a plus d'objet, le lien transmis au client existant désormais.
