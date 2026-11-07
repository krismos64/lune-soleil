# 7 novembre 2026 : avis en cartes animées et entrée « Avis » dans la navigation, LS-314

## Demande

Christophe, après LS-313 : la page `/avis` et la section d'avis de l'accueil
plus attractives et animées en motion design, la section d'avis de la fiche
plus jolie, et un lien vers les avis dans la barre de navigation.

## Fait

- **Cartes d'avis** (`components/avis-boutique.tsx`) : fond blanc, guillemet
  doré décoratif, cinq étoiles dessinées (`aria-hidden`, la note restant
  écrite « N sur 5 »), commentaire en serif, la pièce en tête de carte.
- **Mouvement**, ADR-045 amendé (type « Avis ») : étoiles tracées puis
  remplies sous `data-borne`, cartes en glissement seul ; immobile en
  mouvement réduit et sans script. Fiche produit : mêmes cartes, **rien ne
  bouge**.
- **`/avis`** : en-tête en ciel d'aube avec le médaillon de la lettre cachetée,
  note moyenne en grand, cartes sur deux colonnes à partir de 768 px.
- **Accueil** : cartes sur trois colonnes à partir de 1024 px, une en deçà.
- **Navigation** : entrée « Avis », active aussi sur `/avis/signaler`.
- `frontend-design.md` : dixième décor où le dégradé de ciel est permis.

## Ce que la revue d'interface a trouvé

1. **À 768 px, le nom de la boutique recouvrait « Accueil » de 14 px** avec
   « Avis clients » en cinquième entrée. Le test de l'en-tête ne mesurait que
   le côté des actions : une mesure symétrique du côté de la marque est
   ajoutée, rouge à −14 px, puis 9 px avec « Avis », puis verte en resserrant
   l'espacement des entrées à 12 px entre 768 et 1023 px.
2. **`/avis` n'était éprouvée en mouvement par aucun test** : ajoutée aux pages
   de `legales-catalogue-ls282.spec.ts` (bornes, mouvement réduit, débordement).
3. **Le nom de la pièce, titre de la carte, était passé en fin de carte**,
   faussant la navigation par titres : remis en tête, dans le code et à l'écran.

## Preuves

- e2e avis, parcours d'avis, en-tête (54), menu mobile, accueil animé, pages
  animées : 213 tests verts après correction, quatre largeurs.
- Suite Vitest complète : 2004 tests verts.
- Captures en mouvement normal, dont 320 × 568 : la note tient au-dessus du pli.

## Validation et production

Captures validées par Christophe. PR #644 fusionnée (`7645f71`), déployée par
le workflow, run 42403847396, aucune migration. Relu : `/avis` répond 200 avec
l'avis réel, l'entrée « Avis » porte `aria-current` sur sa page, la fiche
n'a aucun attribut d'animation dans le HTML servi.

## Prochaine étape

- LS-291 : délais d'acheminement d'ADR-035, après vérification de L111-1 et
  L216-1 sur Légifrance.

## État des tickets

LS-314 close. Ouverts : LS-291, LS-35.
