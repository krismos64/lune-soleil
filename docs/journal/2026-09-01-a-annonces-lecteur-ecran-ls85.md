# 1er septembre 2026, les annonces au lecteur d'écran, LS-85

Session ouverte sur une question d'état, « où en est-on », et dérivée vers un
constat : LS-85 était bloquée par des écrans qui n'existaient plus. Trois de ses
critères avaient été déclarés « impossibles aujourd'hui » le 19 août, faute de
panier et de tunnel. Les deux écrans ont été livrés depuis, et un achat complet
les a traversés le 31 août.

## Jira disait vrai, le journal ne disait pas tout

La vérification de l'état réel a montré que le journal du 31 août était exact sur
les cinq tickets qu'il citait, et **muet sur cinq autres restés « En cours »** :
LS-82, LS-84, LS-85, LS-86 et LS-9.

Deux d'entre eux méritaient d'être repris, leur blocage ayant disparu sans que
personne ne rouvre le ticket. LS-85 en fait partie, et son commentaire du 19 août
cherchait `src/app/panier/` : le groupe de routes `(boutique)` avait déplacé le
chemin entre-temps.

**72 tickets non terminés hors epics**, 67 à faire et 5 en cours, dont 28 en
priorité High.

## Le critère 4 n'était pas rempli, et le vert le cachait

Les cinq assertions du panier cherchaient le **texte** « Ajouté au panier. »
plutôt que la région live qui le porte.

```
role="status" retiré, avant correction : 24 passed   <- le défaut passait
role="status" retiré, après correction :  5 failed, 5 passed
```

Le message restait affiché à l'écran, devenu muet pour un lecteur d'écran, et
aucun test ne rougissait. Le commentaire du code disait pourtant « LA REGION LIVE
EST LE SEUL RETOUR AUDIBLE ». C'est le motif de la fiche « contrôle satisfait par
un commentaire » sous une autre forme : l'assertion trouve la bonne chaîne pour
la mauvaise raison.

Le tunnel, lui, était déjà solide. Retirer le `tabIndex={-1}` du titre fait
rougir 1 test sur 18, retirer son `role="status"` également : le critère 2 est
réellement couvert, et ces mutations sont ciblées plutôt que brutales.

## Le critère 5 a révélé ce qu'axe-core ne voit pas

Aucun outil ne simule une écoute humaine au lecteur d'écran. La meilleure
approximation est de capturer l'**arbre d'accessibilité** que le navigateur
calcule, `locator.ariaSnapshot()`, qui est la source même que lit un lecteur
d'écran. ✅ Via Context7 pour la forme exacte de `toMatchAriaSnapshot` en
Playwright 1.62.

La capture du parcours réel a montré deux régions anonymes :

```
- status                     <- panier
- status: Le choix d'un...   <- tunnel, points de retrait
```

Une région live anonyme **n'est pas une violation d'accessibilité** : `axe-core`
la laisse passer, et quatre mois de tests verts ne l'avaient pas vue. Un lecteur
d'écran annonce le changement sans dire de quoi il parle, et deux régions
anonymes sur une même page s'annoncent identiquement. La fiche produit portait
déjà ce nommage, avec le commentaire qui l'explique, jamais reporté ailleurs.

Les sept régions live du parcours portent désormais un nom. Deux tests nouveaux
verrouillent l'arbre, écrits d'après la capture réelle et non d'après l'attendu.
Retirer un `aria-label` les fait rougir tous les deux, et eux seuls : 2 échecs,
25 succès.

## Un artefact de mesure, écarté plutôt qu'inscrit dans un test

La première capture montrait le titre de l'étape 1 avec le fil de l'étape 2, ce
qui ressemblait à un défaut sérieux. Elle avait été prise **pendant la
transition**, le bouton portant encore « Enregistrement… ». Une capture
stabilisée par l'attente du focus montre l'étape correcte.

Écrire l'assertion sur la première capture aurait figé un état transitoire comme
s'il était l'état nominal. Les tests attendent donc le focus plutôt que la
visibilité, et le commentaire porte la raison.

## La base de développement bloque la suite e2e

Deux blocages distincts, tous deux hérités de la démonstration du 31 août.

**Le compte administratrice.** `stacy@lune-soleil.fr` occupait la place unique de
l'index partiel `utilisateur_administratrice_unique`, et le setup e2e ne
rétrograde que les comptes préfixés `e2e-`. Sa promotion levait donc sur cette
base. Le garde-fou est juste, son commentaire expliquant qu'un `UPDATE` sans
clause retirerait son rôle au compte réel de l'exploitante.

Arbitrage de Christophe : rétrograder ce seul compte en `CLIENT` plutôt que
recréer la base, ce qui conserve `C-2026-0001` et `F-2026-0001`, la preuve du
premier paiement de bout en bout. Le geste se défait en une instruction.

**Le produit publié.** « Créoles dorées Ariane », publié le 31 août, passe devant
les fixtures et fait échouer `catalogue-public.spec.ts:176` sur les trois
largeurs. Vérifié en remisant les modifications : **l'échec est identique sur
`main`**. Il préexiste à ce travail, et la CI part d'une base neuve.

Le journal d'hier annonçait ce nettoyage pour le catalogue réel. Il bloque en
fait les tests dès aujourd'hui, ce que personne n'avait vu.

**La limitation de débit.** Better Auth a refusé le setup après des lancements
répétés, « Too many requests ». Le mécanisme faisait son travail sur mes propres
essais. Purger `rate_limit` suffit, sans toucher aucune donnée métier.

## État des critères de LS-85

| Critère | 19 août | Aujourd'hui |
|---|---|---|
| 1. Régions live | fait sur les écrans livrés | **fait**, tunnel et panier compris |
| 2. Focus au changement d'étape | impossible | **fait**, prouvé par mutation |
| 3. Nom accessible | fait | fait |
| 4. Test des régions live par mutation | impossible | **fait**, le défaut a été trouvé et corrigé |
| 5. Lecteur d'écran, parcours complet | impossible | **partiellement**, voir ci-dessous |

Le critère 5 demande une vérification **au lecteur d'écran**. Ce qui est livré
est l'assertion sur l'arbre d'accessibilité, qui attrape ce qui se dégrade en
silence entre deux écoutes. L'écoute humaine reste à faire, et aucun outil ne la
simule : la story reste donc ouverte sur ce seul point.

## Vérifications

```
npm run type-check     OK
npm run lint           OK
npm run format:check   All matched files use Prettier code style!
npm run test           791 tests, 50 fichiers, tous verts
playwright, panier + tunnel, trois largeurs      75 passed
suite e2e complète                               386 passed, 3 failed
./scripts/verifier-regles.sh                     règles conformes au schéma
```

Les trois échecs sont ceux du catalogue décrits plus haut, identiques sur `main`.

PR #172, commit `bb5bd4a`.

## Prochaine étape

**LS-129**, le rendu PDF des factures et avoirs, inchangée depuis deux sessions :
elle referme `cheminPdf` et débloque l'envoi du document au client. Un ADR doit
trancher la bibliothèque de rendu avant la première ligne de code, arbitrage de
Christophe du 27 août.

Sur LS-85, il reste l'écoute au lecteur d'écran, qui demande une personne devant
la machine.

Restent ouverts hors code, inchangés : **LS-19**, la médiation de la
consommation, sans aucun commentaire depuis sa création le 27 juillet ;
**LS-34**, la plateforme de facturation électronique, dont l'échéance de
réception tombait le 1er septembre 2026, **aujourd'hui**, sans que la démarche
soit faite ; **LS-27**, le compte Mondial Relay.

Deux autres tickets « En cours » méritent une reprise : **LS-82**, sept critères
sur huit, et **LS-86**, dont le test de bout en bout sur les modes en relais
attend l'API Mondial Relay, donc LS-27.
