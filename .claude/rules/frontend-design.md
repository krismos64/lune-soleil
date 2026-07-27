---
paths:
  - "src/app/**/*.{ts,tsx}"
  - "src/components/**/*.{ts,tsx}"
  - "src/features/**/*.{ts,tsx}"
  - "src/styles/**/*.css"
---

# Design et accessibilité

Direction : artisanal, féminin, élégant, chaleureux, naturel, légèrement premium.
La photographie et la matière portent l'identité, pas les ornements.

## Palette, fixée par ADR-022

Utiliser les jetons de `src/styles/tokens.css`, jamais une valeur hexadécimale en
dur.

| Jeton | Valeur | Usage |
|---|---|---|
| `--ls-background` | `#FBF7F0` | fond de page |
| `--ls-surface` | `#FFFFFF` | cartes, formulaires |
| `--ls-surface-sand` | `#F2EADF` | sections alternées, footer |
| `--ls-text` | `#3B2F2A` | texte courant |
| `--ls-text-muted` | `#7A6A5D` | légendes |
| `--ls-primary` | `#5F4519` | actions, bandeau, focus, prix |
| `--ls-primary-hover` | `#4A2A0B` | survol |
| `--ls-accent-gold` | `#C4A052` | décor seulement |
| `--ls-accent-gold-deep` | `#8A6A22` | liens, texte accentué |
| `--ls-accent-terracotta` | `#B4643E` | badge ponctuel |

### Deux règles de contraste, mesurées

1. `--ls-accent-gold` (`#C4A052`) donne **2,31:1** sur crème. **Interdit pour
   tout texte**, y compris large. Filets, icônes décoratives, éclats uniquement.
   Tout texte doré utilise `--ls-accent-gold-deep` (4,72:1).
2. `--ls-accent-terracotta` (`#B4643E`) donne **4,07:1**. Conforme AA en texte
   large ou gras seulement. Un badge en petit texte passe en fond terracotta avec
   texte blanc.

Le jeton `primary-night` `#1B2A41` du cahier des charges est **écarté**. Aucun
bleu dans ce projet, le logo n'en contient pas.

## Interdits visuels

Pas de glassmorphisme, pas de carte transparente flottante, pas de dégradé
violet ou bleu, pas d'esthétique SaaS, pas de rose dominant, pas de
suranimation. Aucun **dégradé métallique** sur un bouton, un bandeau ou un
footer : c'est un marqueur de site généré automatiquement. Les aplats unis
uniquement.

Les primitives shadcn/ui et Radix servent pour l'accessibilité, jamais comme
identité visuelle par défaut.

Pas de faux avis, faux compteur, promotion inventée ni urgence artificielle.
Pas de tableau dans la boutique publique.

## Mobile first

Référence 320 à 430 px d'abord, puis 390, 768, 1280. Aucun débordement
horizontal à 320 px, y compris avec un nom de produit long et un prix à trois
chiffres. Zones tactiles proches de 44 par 44 px. Zoom à 200 % sans perte de
contenu ni blocage de l'achat.

Le back-office adopte cartes et listes quand un tableau devient illisible sur
mobile. Cible : créer un produit complet en moins de trois minutes sur
smartphone, photographies comprises.

## Accessibilité, WCAG 2.2 AA sur les parcours critiques

Focus visible d'environ 3 px, jamais supprimé sans remplacement. Navigation
clavier complète et ordonnée. Texte alternatif décrivant le bijou ou le geste,
alt vide réservé au décor dupliqué. Erreur associée à son champ, jamais
transmise par la couleur seule. Nom accessible sur tout bouton icône. Respect
systématique de `prefers-reduced-motion`.

## États obligatoires

Le prototype ne les montre pas, ils doivent exister : vide, chargement, erreur
serveur, pending, disabled, indisponible, aucun résultat de filtre, rupture.
Jamais de faux succès optimiste : une erreur serveur produit un message visible
associé à l'action.

## Frontière avec le métier

Les composants rendent des données et émettent des intentions. Le calcul métier
reste dans les services. Un prix, un total ou une disponibilité affichés viennent
du serveur, jamais d'un calcul dans le navigateur.

L'état des filtres et du tri est sérialisé dans l'URL, pour que le retour
navigateur et le partage de lien fonctionnent.

## Paillettes

Could, jalon V1 cible. CSS déterministe, pas de bibliothèque, `aria-hidden`,
`pointer-events: none`, supprimé en mouvement réduit, jamais par-dessus un bijou
ou un contrôle. Ne bloque jamais l'ouverture.
