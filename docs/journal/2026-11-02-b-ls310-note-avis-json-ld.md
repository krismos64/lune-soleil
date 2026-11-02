# 2 novembre 2026 (b) : trois mails de la Search Console, LS-310

Christophe a transmis trois mails de Google reçus le jour même.

## Tri des trois mails

- **« Fiches de marchand »**, `shippingDetails` et `hasMerchantReturnPolicy`
  manquants dans `offers` : déjà corrigé par LS-308, déployé la veille au
  soir. Relu en production sur `/produit/boucles-d-oreilles-tresor-de-noel` :
  relais 4,10 €, domicile 7,49 €, retour sous 14 jours aux frais du client.
  Google avait lu les fiches avant le déploiement. **Christophe a lancé
  « Valider la correction »**.
- **« Extraits de produits »**, `review` et `aggregateRating` manquants :
  **LS-310**, ci-dessous.
- **Onglet Shopping**, Merchant Center pour « 8 produits actifs » : une
  proposition, pas une erreur. **Arbitrage de Christophe : abandonnée**, piste 9
  de LS-291 close par commentaire.

## LS-310, fait

- `jsonLdProduit` reçoit la synthèse des avis publiés et pose
  `aggregateRating` : `ratingValue` (moyenne au dixième), `ratingCount`,
  bornes 5 et 1. Aucune note sans avis publié.
- **La fiche lit les avis une fois**, pour la section « Avis vérifiés » et pour
  le balisage : `AvisProduit` reçoit la liste au lieu de la lire. La lecture
  sort du `<Suspense>` de LS-61 et suit le contrôle d'existence (C32 tient :
  404 avant toute autre lecture). Garder la frontière aurait scindé le
  `Product` en deux blocs, que Google ne fusionne pas de façon documentée.
- `ratingCount` et non `reviewCount` : le commentaire est facultatif.
- `AvisPublie` réexporté par `services/avis`, pour le composant.

## Arbitrage pris dans la story, à confirmer par Christophe

**Aucun `review` individuel.** Google exige un `author` nommé pour chacun, et
la fiche n'affiche aucun nom. En publier un dans le balisage seul serait une
donnée invisible au visiteur, et un nom de client de plus en ligne.
L'alerte « champ review manquant » reste donc, non critique. Les étoiles dans
les résultats ne dépendent que d'`aggregateRating`.

## Vérifié

- Unitaires `seo.test.ts` 49 sur 49, dont 5 neufs ; Vitest complet
  1944 sur 1944 ; types, lint, `verifier-regles.sh`, construction.
- Bout en bout `avis-parcours` et `referencement`, 188 sur 188 aux quatre
  largeurs : la note balisée est confrontée à la synthèse affichée sur la même
  page, et une fiche sans avis ne porte aucune note.
- **Mutation**, quatre défauts, tous vus par le test visé : nombre faux,
  garde « zéro avis » retirée, page qui ne transmet rien, note inventée par la
  page. Les deux derniers ne se voient qu'en bout en bout.

## Déploiement

PR #631, CI run 41470726131 verte, fusionnée en rebase (`8c30e32`). Image
publiée, déploiement run 41473657391 sans migration ; la production sert
`ghcr.io/krismos64/lune-soleil:8c30e32…`, `/api/sante` en 200. Les 65 fiches du
sitemap relues : aucune ne porte de note ni de section d'avis, ce qui confirme
qu'aucun avis n'est publié à ce jour. **LS-310 close.**

## Relecture de fin de session

Contenus relus à la demande de Christophe : `CLAUDE.md` (200 lignes), agents,
skills et hooks sans rapport avec la story ; `verifier-config-claude.sh` ne
signale qu'une exclusivité heuristique déjà présente dans `VERIFICATION.md`,
juste (jsdom ne calcule aucune largeur). Complétés : `docs/REFERENCES.md`
(ligne `seo.ts`) et `PARCOURS.md` (étape 6 du parcours d'avis). La production
est redéployée sur le dernier commit de `main` après chaque PR de documentation,
pour que le contrôle d'écart reste muet.

## Prochaine étape

- Les étoiles apparaîtront dans Google avec les premiers avis modérés ; relire
  alors le JSON-LD d'une fiche concernée et le rapport « Extraits de
  produits ».
- LS-295, la réauthentification par passkey.
