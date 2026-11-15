# 15 novembre 2026 : LS-327, lien vers le compte TikTok

## Demande

Christophe : « www.tiktok.com/@lunesoleil.fr ajoute ce lien TikTok de lune
soleil en plus du Facebook ». L'arbitrage lève la règle de LS-30, « Facebook
seul canal social officiel ». LS-30 étant close, le travail entre par un
ticket neuf, LS-327, sous l'epic LS-22.

## Fait

- `PAGE_TIKTOK` dans `src/lib/seo.ts`, seule source de l'adresse
  `https://www.tiktok.com/@lunesoleil.fr`.
- `sameAs` du JSON-LD `Organization` : Facebook puis TikTok.
- Pied de page : les deux liens réunis dans une liste, empilés, « Suivre
  l'atelier sur TikTok » sous Facebook, logo SVG décoratif en `currentColor`,
  même onglet, aucun script tiers.
- Commentaires « seul canal officiel » corrigés (`seo.ts`, pied de page,
  mentions légales) et `docs/ETAT.md`.

Aucune donnée ne part vers TikTok : c'est un lien, pas une intégration. Le
registre des traitements n'est pas touché.

## Preuves

- Test unitaire `sameAs` et test de bout en bout du lien (adresse, 44 px, sous
  Facebook sans chevauchement).
- **Mutations** : TikTok retiré du `sameAs`, le test unitaire rougit ; adresse
  du lien changée, le test de bout en bout rougit (`toHaveAttribute`).
- `page-accueil.spec.ts` aux quatre largeurs : 37 passés, axe-core et
  débordement compris. `seo.test.ts` : 50 passés.
- Rendu relu à 320 et 1280 px, survol compris.
- Types, lint, Prettier au vert.

## Reste

- Déploiement en production sur accord, avec le correctif du nocturne du
  même jour (journal `2026-11-15-a`).

## État des tickets

- LS-327 : terminé à la fusion.
