# 19 août 2026, la page d'accueil et une mesure fausse

Suite de la session du matin, qui avait constaté qu'aucun ticket ne portait la
vitrine publique. LS-122 est livrée et fusionnée.

## Ce que LS-122 apporte

L'accueil remplace la page d'attente : hero, réassurance, dernières créations,
entrée par catégorie, bloc éditorial.

Surtout, **le site a maintenant une navigation**. Un visiteur arrivé sur
`/catalogue` ne pouvait aller nulle part : ni en-tête, ni pied de page
n'existaient, et `src/components/` ne contenait qu'un README.

Les routes publiques sont passées dans un groupe `(boutique)` qui porte le
layout public. L'en-tête boutique ne doit pas apparaître sur `/administration`,
et un groupe de routes n'entre pas dans l'URL : les adresses sont inchangées.

## Trois écarts assumés avec le prototype

Le bandeau de réassurance porte **trois** éléments et non quatre. Le prototype
affiche « Livraison offerte dès 39 € », que `frontend-design.md` interdit
d'écrire en dur : le seuil vient de la configuration qui sert au calcul serveur
des frais de port, laquelle appartient à LS-27 et LS-115.

La rétractation ne s'annonce jamais seule, la mention des frais de retour à
charge l'accompagne, article L221-20.

Aucune mention d'origine géographique, non confirmée par l'exploitante.

## Trois défauts trouvés par la mesure, aucun à l'œil

| Défaut | Mesure | Correction |
|---|---|---|
| Doré sur fond primaire | 3,61:1 | `--ls-surface-sand`, 7,49:1 |
| Surtitre doré sur fond sable | 4,23:1 | `--ls-primary`, 7,49:1 |
| Lien d'évitement | focus retombait sur `body` | cible sur `main`, `tabIndex={-1}` |

Le premier, je l'avais **supposé conforme** sans le calculer. Le deuxième est le
piège de LS-84 : `--ls-accent-gold-deep` donne 4,72:1 sur crème et 4,23:1 sur
sable, une couleur n'est ni conforme ni non conforme, une paire l'est.

Le troisième vient de `ls-frontend-revue`, qui l'a signalé avant de tomber sur
une erreur réseau. Un lien d'évitement dont la cible n'est pas focalisable a
l'apparence exacte d'un lien qui marche : la page défile, mais la tabulation
suivante repart du haut.

## Une dérive à consigner : deux mesures fausses de ma part

La CI a bloqué deux fois sur l'installation du navigateur Playwright. J'en ai
tiré deux affirmations, toutes deux inexactes, et Christophe a créé LS-124 sur
cette base avant que je ne les corrige.

**« La chaîne met 39 minutes de contrôles. »** Faux. Le travail tient en 5 à 8
minutes. Les 39 minutes venaient d'une attente d'exécuteur GitHub de 33 minutes
sur **une** exécution, prise pour la norme quand quatre sur cinq n'attendent
pas.

**« L'installation du navigateur prend 25 minutes. »** Faux. Elle prend 34 à
146 secondes. Les 25 minutes étaient la durée d'un **blocage**.

La faute est la même dans les deux cas : conclure d'une observation unique sans
la confronter à d'autres. Une durée d'exécution GitHub mélange la file et le
travail, elles se séparent en comparant `createdAt` de l'exécution à
`startedAt` du job.

LS-124 a été réécrite : titre, description et critères. Le cache Playwright y
est écarté, la documentation officielle le déconseillant.

## Le visuel du hero, à remplacer avant l'ouverture

Christophe a fourni l'image. Elle montre des bijoux qui **ne sont pas au
catalogue** : les laisser en ligne ferait passer des pièces inexistantes pour
des créations de la boutique, interdit de LS-22.

Arbitrage : conservé pendant le développement, remplacé avant la mise en ligne.
Tracé à trois endroits pour ne pas dépendre d'une mémoire, un commentaire dans
`page.tsx`, `public/habillage/README.md` et un commentaire sur LS-23.

## Preuves

513 tests Vitest, 256 Playwright, types, lint, format et les deux contrôles du
projet au vert. Rendu mesuré à 320, 390, 768 et 1280 px : zéro débordement par
`getBoundingClientRect`, 60 textes mesurés sans un seul sous le seuil AA, zéro
cible tactile sous 44 px, `axe-core` sans violation.

Deux mutations, chacune attrapée par le seul test concerné : retirer
`NULLS LAST` du tri, retirer `tabIndex` de la cible d'évitement.

## État des tickets

| Ticket | État |
|---|---|
| LS-122 | **Terminé**, fusionné sur `main` |
| LS-123 | À faire, bloquée par LS-25, LS-26 et LS-28 |
| LS-124 | En cours, réécrite, il reste la borne de temps |
| LS-23 | échéance du visuel ajoutée |

## Prochaine étape

**LS-124**, courte : un `timeout-minutes` sur l'étape d'installation. Puis
**LS-114**, le panier, qui reste la tête de la chaîne de la phase 3.
