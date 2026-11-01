# 1er novembre 2026 : Search Console, tri des tickets, données structurées, LS-308

Fin de soirée d'ouverture. Christophe a demandé ce qu'il restait et ce qui
était utile.

## Arbitrages de Christophe

- **LS-293 abandonnée** : la clé Stripe standard reste en production, risque
  accepté après exposé (remboursements, lecture des clients, réglages). En cas
  de fuite, révocation immédiate dans le tableau de bord.
- **LS-307 abandonnée** : « je sais de source sûre qu'on est bon », la mention
  « art. 293 B du CGI » reste. Le constat (Légifrance l'affiche abrogé par
  l'ordonnance n° 2025-1247) reste écrit dans le ticket.
- **LS-301 abandonnée** : jugée inutile, aucune conséquence de sécurité.
- **LS-291, pistes 1 à 3 retenues**, découpées dans **LS-308**.

## LS-290, Search Console

Configurée par Christophe, guidée en séance. Propriété **Domaine**, vérifiée
par un TXT à la racine de la zone OVH, publication constatée sur
`ns106.ovh.net`, `dns106.ovh.net` et `8.8.8.8`, SPF intact. Sitemap lu,
**74 pages découvertes**, autant que les `<loc>` comptés en ligne.
`/informations-legales` et l'accueil déjà indexés, `/catalogue` demandé (rien
ne l'empêche : 200, canonique sur elle-même, pas de `noindex`). **Close.**

## LS-308, fait

Constaté en ligne avant de coder : `Offer` sans livraison ni retour,
`Organization` « crees a l'unite » sans logo, neuf `lastmod` à l'heure de la
requête.

- `Offer.shippingDetails` : relais et domicile, montant de `calculerFraisPort`
  sur le prix publié, tarifs lus en base par `lireConfigurationLivraisonPublique`
  (nouvelle, `lireSeuilFranchise` s'appuie dessus). Configuration illisible :
  bloc omis. La fiche lit les tarifs une fois pour le bandeau et le balisage.
- `Offer.hasMerchantReturnPolicy` : `DUREE_RETRACTATION_JOURS`, courrier, frais
  au client, FR.
- `Organization` : accents, `logo` absolu (`logo-sceau.jpg`, 720 px),
  `areaServed`.
- Sitemap : plus de date sur les pages fixes ni les catégories ; produit daté
  de `produit.modifie_a`, remonté par `listerProduitsPublies`. Limite écrite :
  un prix ou une photo modifiés ne touchent pas la ligne produit.
- `sku` écarté : une fiche à plusieurs variantes n'a pas de référence unique.

## Vérifié

- Unitaires `seo.test.ts` 44 sur 44 ; unitaires et intégration du catalogue et
  des paramètres, **919 sur 919**.
- Bout en bout `referencement` et `reassurance`, **132 sur 132**, construction
  comprise ; tarifs confrontés à la base et non à une constante.
- **Mutation**, huit défauts, tous vus : franchise ignorée, politique de retour
  retirée, retour offert, livraison devinée sur configuration nulle, accents
  perdus, durée en dur, fiche qui ne transmet pas les tarifs, sitemap qui
  redate les pages fixes. Les deux derniers ne se voient qu'en bout en bout.

## LS-304

Le nocturne manuel 41322608670 a échoué sur un seul test, celui des mentions
écrit le matin même pour LS-28 : sans `LEGAL_*` en CI, la page rend le repli.
Valeurs fictives `TEST` ajoutées aux deux workflows, PR #626 ; preuve locale
dans les deux sens. Nocturne relancé sur `faac9ac`, run 41337341367 : **vert**, audit,
bout en bout aux quatre largeurs et image compris. Issue #612 fermée,
**LS-304 close**.

## Déploiement de LS-308

Run 41340397966, sans migration. Relu en production : fiche à 15 € annonçant
relais 4,10 € et domicile 7,49 €, retour sous 14 jours aux frais du client ;
`Organization` accentuée, logo servi en 200 ; sitemap à 74 `<loc>` et
65 `lastmod`, identique sur deux lectures. **LS-308 close.**

## Prochaine étape

- Christophe : rapport « Fiches de marchand » de la Search Console d'ici une
  semaine, indexation de `/catalogue` sous deux semaines.
- LS-295, la réauthentification par passkey.
- Relire le rapport « Performances » de la Search Console vers mi-décembre,
  pour la suite de LS-291.
