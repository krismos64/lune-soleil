# 8 octobre 2026 : tri du backlog, et LS-30, le lien Facebook

Suite de `2026-10-07-k`. Demande de Christophe : clore un maximum de tickets
sans en créer, et corriger en autonomie ce qui peut l'être.

## Le tri

Les 34 tickets ouverts sont relus en entier, commentaires compris, puis
confrontés au dépôt, à la CI et à la base de production (lecture seule,
`BEGIN READ ONLY`). **Neuf clos**, chacun avec un commentaire de preuve :

- **LS-33**, sans objet : Mondial Relay a redirigé vers Sendcloud (ADR-035),
  décision livrée par ADR-042 et LS-131 ;
- **LS-123**, huit critères remplis, `#accessibilite` livrée le 11 septembre ;
- **LS-25**, le visuel engendré de l'accueil est remplacé le 23 septembre puis
  retiré le 4 octobre (LS-260), ce que le ticket ignorait ;
- **LS-170**, la fiche est livrée, les réponses vivent dans leurs tickets ;
- **LS-4**, **LS-36** et **LS-8**, epics dont toutes les stories sont terminées, LS-8 étant annoncée close par le README depuis le 11 septembre sans que Jira suive ;
- **LS-29**, arbitrage de Christophe : critère de réception rempli sur trois
  fournisseurs, les huit autres modèles s'éprouveront au premier achat réel ;
- **LS-150**, arbitrage de Christophe : rien de plus que LS-137.

## Mesuré en production, lecture seule

- **aucune commande** : LS-153, LS-218 et LS-27 restent bloquées ;
- 50 pièces actives, **46 avec une seule photo** (LS-23 en exige deux) ;
- **aucune section d'entretien remplie, aucune dimension de variante** :
  LS-24 attend l'exploitante.

## LS-30

L'exploitante ne veut pas de QR code. La page Facebook, confirmée active par
Christophe, devient le seul canal social officiel :

- `PAGE_FACEBOOK` dans `src/lib/seo.ts`, paramètre `&locale=fr_FR` retiré ;
- lien texte « Suivre l'atelier sur Facebook » dans le pied de page, sans
  icône ni script tiers, même onglet ;
- `sameAs` du JSON-LD `Organization`.

Aucune donnée ne part vers Facebook : un lien, pas une intégration. La mesure
par paramètre de source que décrivait le ticket est sans objet depuis ADR-040.

Preuves : type-check, lint, format, `seo.test.ts` (35), `page-accueil.spec.ts`
(32, quatre largeurs, axe-core et débordement), sept contrôles textuels verts.
Mutations : adresse changée dans le pied, le test de bout en bout rougit ;
`sameAs` retiré, le test unitaire rougit.

## Prochaine étape

LS-278 (archivage massif sans garde), une fois tranché son critère 2 :
confirmation renforcée ou refus d'archiver toutes les pièces d'un coup. Puis
LS-140 et LS-107, rendues mesurables par les 50 pièces photographiées.

## État des tickets

LS-30 close après fusion, LS-8 close aussi (epic aux stories toutes terminées, que Jira laissait ouvert). 19 tickets ouverts hors epics, 260 terminés sur 279, relevés dans Jira.
