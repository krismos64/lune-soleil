# 16 novembre 2026 : LS-328, le `lastmod` d'une fiche suit ses avis

## Demande

Christophe signale un avis publié ce soir. Relu en production : 5 sur 5 sur
« Fleur dorée », commande C-2026-0005 livrée le 13, déposé à 18:46 UTC et
publié à 19:05 UTC, visible sur `/avis`, l'accueil et la fiche, dont le
JSON-LD porte `aggregateRating` (5, 1 avis). À sa question sur le SEO et le
GEO, le seul défaut relevé : le sitemap datait la fiche du 7 octobre 2026,
`produit.modifieA` seul (LS-308). Arbitrage : corriger, sans interruption.
Ticket neuf **LS-328** sous l'epic LS-7, étiquette `seo`.

## Fait

- `listerDernierChangementAvisParProduit` (`src/repositories/avis.ts`) : par
  produit, la plus récente de `publie_a`, `decide_a`, `modifie_a`, `efface_a`
  et des dates de la réponse, sur les seuls avis à `publie_a` non nul. Exposée
  par `lireDernierChangementAvisParProduit` (`src/services/avis.ts`).
- `src/app/sitemap.ts` : `lastModified` est la plus récente des deux dates.
- `decide_a` compte parce que `publie_a` n'est écrit qu'à la première
  publication : une republication après modification ne la déplace pas.
- Limite écrite dans le code : un avis publié, modifié puis refusé date la
  fiche au refus et non à la modification, un délai de modération plus tard.

## Preuves

- Cinq tests d'intégration dans `avis.sequential.test.ts`, qui appellent le
  vrai sitemap. Avant le code : critères 1 et 2 rouges (`expected
  1767225600000 to be 1794856486790`), 3 et 5 verts.
- **Mutations**, toutes attrapées : `decide_a` retiré du `greatest` (critère 2
  rougit), sitemap qui ignore les avis (1 et 2), date d'avis qui l'emporte
  toujours (5), filtre `publie_a IS NOT NULL` retiré. **Cette dernière
  survivait d'abord** : un avis seulement déposé n'a aucune date, il ne
  distingue pas le filtre. Cas ajouté, un avis refusé sans publication, qui
  rougit sous la mutation.
- Types, lint, `verifier-regles.sh` au vert ; `npm run test` : 130 fichiers,
  2 110 tests passés.

## Hors story

- Issue #647 (nocturne du 8 novembre) toujours ouverte, à fermer sur le
  premier nocturne vert.

## État des tickets

- LS-328 : terminée à la fusion, déploiement à suivre.
