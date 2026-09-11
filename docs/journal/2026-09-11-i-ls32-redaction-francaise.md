# 11 septembre 2026, LS-32 : deux règles de rédaction que rien ne gardait

## Le motif, pour la quatrième fois de la session

`CLAUDE.md` énonce deux règles de rédaction française comme valant **partout** :
tous les accents présents, aucun tiret cadratin ni demi-cadratin. Aucune des deux
n'avait de contrôle, et **les deux s'étaient franchies**.

C'est le motif principal de dégradation de ce dépôt, rencontré quatre fois dans
la même session : une règle juste dont rien ne mesure l'application s'érode sans
bruit. Une règle écrite dans un document ne se déclenche par aucun réflexe.

## Ce que l'absence de contrôle avait laissé passer

**Un tiret cadratin dans le pied de page de chaque facture** remise à un client,
trouvé à la première exécution du contrôle. Sur une boutique artisanale
française, ce caractère est un marqueur de texte généré : il abîme la crédibilité
de la marque sur le document le plus formel qu'un client reçoive.

Les accords au féminin, eux, avaient dû être signalés **deux fois par
Christophe**, les 27 et 28 juillet 2026, la règle ayant été comprise comme portant
sur l'interface seule.

## Deux portées distinctes, et ce n'est pas une approximation

**L'accord n'est traqué que sur les textes visibles**, `src/app` et
`src/components`. Un contrôle textuel ne distingue pas « la route cliente »,
adjectif technique légitime, de « chère cliente » : le motif porte donc sur les
**formes qui ne peuvent désigner qu'une personne**, avec le sujet « vous ».

**Le cadratin est traqué dans `src/` entier**, commentaires compris : un
commentaire recopié dans une interface emporte son cadratin avec lui. Les
journaux et les ADR restent hors portée, la règle étant **prospective** et un ADR
accepté ne se réécrivant pas.

## Le contrôle a accusé une phrase juste, et a été resserré

« La personne qui l'a déposé en est informée » accorde avec « personne », ce qui
est **correct**. Le motif cherchait « est informée » sans exiger de sujet.

**Un contrôle qui accuse du texte sain est pire qu'une absence de contrôle** : la
correction évidente devant une ligne rouge est de changer le texte, donc de
dégrader une phrase qui ne demandait rien.

## Un défaut réel trouvé après le rebase

La branche a été rebasée sur `main` en fin de session, après la fusion de LS-64.
Le contrôle a alors trouvé **un cadratin neuf** : l'écran de statistiques
employait « — » comme état vide du panier moyen.

C'est exactement ce pour quoi ce contrôle existe. Sans lui, le caractère serait
entré sur `main` sans que personne ne le voie, comme celui du pied de page des
factures avant lui.

Corrigé en « Aucun », qui dit ce qu'il y a à comprendre là où un lecteur d'écran
annonce « tiret cadratin » ou se tait selon le moteur.

## Un piège d'écriture

**`perl` et non `sed`.** La syntaxe d'alternation GNU est rejetée par le `sed` de
BSD, et le script imprimait ses erreurs tout en **rendant OK** : un `|| true`
avalait le code de sortie. Un contrôle qui ne peut pas conclure doit bloquer,
jamais rendre vert.

## Traçabilité

**Dépôt** : PR #389. **Journal** : ce document. **Jira** : LS-32 commentée.
`frontend-design.md` porte les deux portées et le motif du resserrement.

Le conflit du workflow avec LS-85 était un **faux conflit**, deux branches ayant
ajouté leur étape au même endroit : les deux contrôles coexistent.
