# ADR-022 : palette publique, bronze du logo au lieu du bleu nuit

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 27 juillet 2026 |
| Décideur | Christophe Mostefaoui |
| Amende | Cahier des charges V1.0, section 7.3 et annexe A |
| Ticket | LS-21 |

## Contexte

Le cahier des charges V1.0 définit en section 7.3 et en annexe A un jeton
`primary-night` valant `#1B2A41`, un bleu nuit, pour les boutons principaux, les
en-têtes, le focus et l'affichage du prix.

La spécification UX/UI du prototype retenu propose au contraire un bronze
`#765720`, et demande explicitement en section 02 qu'un ADR formalise ce
changement avant implémentation, sans modification silencieuse des jetons.

Deux fichiers de logo coexistaient dans les documents de cadrage : une version
où le nom de la marque est écrit en bleu nuit, et une version en rond crème avec
lune et soleil dorés et texte brun. Il fallait déterminer laquelle est le logo
officiel avant de trancher la palette.

## Décision

Le logo officiel est le rond crème avec lune gravée et soleil dorés, texte brun
« Lune-soleil » et surtitre « BIJOUX FAITS MAIN ».

Le jeton `primary-night` est retiré de la palette publique. Il est remplacé par :

- `--ls-primary` valant `#5F4519`
- `--ls-primary-hover` valant `#4A2A0B`

Le prix utilise `#5F4519`, comme les actions principales.

## Justification par la mesure

Une analyse colorimétrique du fichier du logo officiel donne les valeurs
suivantes, obtenues par moyenne pondérée sur les zones significatives :

| Zone du logo | Couleur mesurée | Teinte |
|---|---|---|
| Texte « Lune-soleil » | `#533517` | H30 |
| Traits bruns moyens | `#AD8349` | H35 |
| Dorés de la lune et du soleil | `#D7B784`, pics à `#CB9B53` | H37 |
| Fond crème | `#F7EDE1` | H33 |

Toutes les teintes du logo sont comprises entre H30 et H37, soit une famille
orange-brun homogène. Le logo ne contient aucun pixel bleu.

Le bleu nuit du cahier des charges n'a donc aucun fondement dans l'identité
visuelle de la marque. Il s'agit d'une appréciation initiale que la vérification
du logo contredit.

## Alternatives écartées

Contrastes calculés selon WCAG 2.2, fond crème de référence `#FBF7F0`.

| Candidat | Texte blanc dessus | Sur crème | Verdict |
|---|---|---|---|
| `#1B2A41` bleu nuit | contraste suffisant | — | Écarté, étranger à l'identité du logo |
| `#765720` proposé par la spec UX/UI | 6,66:1 (AA) | 6,23:1 | Écarté, conforme AA seulement |
| `#5F4519` | **8,93:1 (AAA)** | 8,36:1 | **Retenu comme primaire** |
| `#4A2A0B` | **12,91:1 (AAA)** | 12,08:1 | **Retenu comme survol** |
| `#A8792A` | 3,87:1 | 3,62:1 | Écarté, insuffisant pour du texte blanc |

Le choix de `#5F4519` plutôt que le `#765720` de la spécification UX/UI repose
sur deux arguments : une marge d'accessibilité AAA au lieu de AA, et une
proximité plus grande avec le brun réellement mesuré dans le texte du logo
(`#533517`).

## Palette complète retenue

| Jeton | Valeur | Usage | Contraste sur crème |
|---|---|---|---|
| `--ls-background` | `#FBF7F0` | Fond de page | référence |
| `--ls-surface` | `#FFFFFF` | Cartes, formulaires | référence |
| `--ls-surface-sand` | `#F2EADF` | Sections alternées, footer | référence |
| `--ls-border` | `#D9CDBA` | Séparateurs fins | décoratif |
| `--ls-text` | `#3B2F2A` | Texte courant | 12,09:1 (AAA) |
| `--ls-text-muted` | `#7A6A5D` | Légendes | 4,86:1 (AA) |
| `--ls-primary` | `#5F4519` | Actions, bandeau, focus | 8,93:1 blanc dessus (AAA) |
| `--ls-primary-hover` | `#4A2A0B` | Survol, état actif | 12,91:1 blanc dessus (AAA) |
| `--ls-accent-gold` | `#C4A052` | Filets, icônes décoratives | 2,31:1, décor uniquement |
| `--ls-accent-gold-deep` | `#8A6A22` | Liens, texte accentué | 4,72:1 (AA) |
| `--ls-accent-terracotta` | `#B4643E` | Décor, texte large | 4,07:1, texte large ou gras |
| `--ls-accent-terracotta-deep` | `#9C4F2B` | Fond de badge | 5,89:1 avec texte blanc, AA |
| `--ls-success` | `#3F6B4A` | Disponibilité | AA |
| `--ls-warning` | `#A9741A` | Stock faible | AA |
| `--ls-error` | `#A33A2E` | Erreur, rupture | AA |
| `--ls-price` | `#5F4519` | Prix, graisse renforcée | 8,36:1 (AAA) |

## Conséquences

### Deux règles d'accessibilité contraignantes

Ces règles découlent des mesures et sont reportées dans les règles de
l'assistant de développement.

1. `#C4A052` plafonne à 2,31:1 sur crème. Interdit pour tout texte, y compris
   large. Réservé aux filets, icônes décoratives et éclats. Tout texte doré
   utilise `#8A6A22`.
2. `#B4643E` donne 4,07:1, conforme AA uniquement en texte large ou gras.

### Amendement du 18 août 2026, LS-104

**La décision 2 ci-dessus était fautive dans son application.** Elle prescrivait
un badge « en fond terracotta avec texte blanc » : cette combinaison donne
**4,35:1**, sous le seuil AA de 4,5:1. Le défaut a été mesuré par `axe-core` sur
le badge « Dernière pièce » du catalogue, écrit en suivant la prescription à la
lettre.

La palette gagne donc un jeton, `--ls-accent-terracotta-deep` `#9C4F2B`, qui
donne **5,89:1** avec du texte blanc. C'est désormais le fond de tout badge en
petit texte. `#B4643E` reste en place pour le décor et le texte large ou gras.

Le reste de l'ADR est inchangé : aucune autre couleur n'est touchée, et le choix
d'un accent terracotta demeure.

### Sur le prototype exploratoire

Le prototype généré en amont applique un doré métallique en dégradé sur le
bandeau supérieur, le bouton principal et le footer. Ce traitement est écarté
pour trois raisons : la spécification UX/UI l'exclut explicitement, un dégradé
métallique est un marqueur visuel de site généré automatiquement interdit par la
section 7.2 du cahier des charges, et le contraste du texte devient imprévisible
selon la position dans le dégradé.

Le bandeau, le bouton principal et le footer utilisent un aplat uni `#5F4519`
avec texte blanc.

Le bouton à contour doré clair sur fond crème du prototype, par exemple
« Entrer dans notre univers », est non conforme et doit être refait.

La structure, la hiérarchie et la composition du prototype restent valables et
servent de référence pour les quatre écrans publics.

### Sur les documents de cadrage

Le cahier des charges n'est pas réécrit. Sa section 1.2 prévoit ce cas : toute
évolution modifiant une décision structurante est tracée dans un ADR. L'annexe A
reste inchangée dans le document d'origine, le présent ADR l'amende sur les
couleurs.

L'espacement, les rayons, les ombres et les durées de l'annexe A restent
valables et ne sont pas modifiés par cette décision.

## Risques

Le bronze et le crème forment une palette monochrome chaude. Le risque est un
manque de tension visuelle sur les écrans denses. Il est atténué par le
terracotta en accent ponctuel et par le contraste fort du texte brun foncé.

La vérification du contraste doit être automatisée dans les contrôles
d'accessibilité, faute de quoi la règle sur `#C4A052` sera enfreinte par
inadvertance lors de l'écriture de nouveaux composants.
