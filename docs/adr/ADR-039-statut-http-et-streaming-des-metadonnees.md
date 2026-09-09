# ADR-039 : statut HTTP honnête, streaming des métadonnées désactivé

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 9 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-211 |

## Décision

Le streaming des métadonnées de Next.js 16 est **désactivé pour tous les
agents**, par `htmlLimitedBots: /.*/` dans `next.config.ts`.

Le `generateMetadata` dynamique du catalogue est **conservé**, et avec lui le
canonical par filtre de LS-137.

## Le défaut, mesuré sur la production réelle

En arrêtant la base de production le 9 septembre 2026, incident 1 de LS-139 :
`/catalogue` répondait **200** avec « Chargement des pièces… » comme état final,
là où l'accueil rendait un vrai **500**.

Même URL, même instant, seul l'agent changeant :

| Agent | Code |
|---|---|
| navigateur ordinaire | 200 |
| Googlebot | 200 |
| Twitterbot | **500** |

## La cause, ✅ via Context7

Next.js 16 **diffuse les métadonnées séparément** sur une page dynamique, sans
bloquer le rendu de l'UI. La réponse est donc **engagée** avant que
`generateMetadata` ait fini de lire la base, et un statut ne se change plus une
fois les octets partis.

**L'écart entre agents est ce qui a identifié la cause.** Twitterbot figure dans
`HTML_LIMITED_BOT_UA_RE`, la liste des robots pour lesquels le streaming est déjà
désactivé parce qu'ils lisent les métadonnées dans le `<head>` sans exécuter de
JavaScript. Chez eux la lecture bloque le rendu, donc son échec fixe le statut.

`generateMetadata` **avale ses erreurs** par ailleurs : Next.js y attache un
`.catch()` qui transforme tout rejet en valeur résolue, jamais relancée.

## Ce qui a été mesuré avant de décider

**Deux builds du même commit**, base réellement arrêtée :

```
                  SANS le réglage      AVEC le réglage
navigateur             200                  500
Googlebot              200                  500
Twitterbot             500                  500
accueil `/`            500                  500
```

Le catalogue rejoint l'accueil pour tous les agents.

**Le coût annoncé par la documentation est une dégradation du TTFB et du LCP**,
le rendu attendant désormais la lecture. Mesure sur le build de production local,
base vivante, médiane de dix appels après trois de chauffe :

```
/catalogue                   avant 0,005 s   après 0,008 s
/catalogue?categorie=...     avant 0,003 s   après 0,007 s
/                            avant 0,006 s   après 0,007 s
```

**Trois à quatre millisecondes, et ce chiffre est local.** La base répond ici en
moins d'une milliseconde, quand la production mesure 0,270 s de TTFB sur
`/catalogue`. L'écart réel s'y noiera d'autant plus, mais il **n'a pas été mesuré
sur le VPS** : LS-140 porte cette mesure.

**La portée est de deux pages**, relevé et non supposé : seules `/catalogue` et
`/produit/[slug]` ont un `generateMetadata`. Tout le reste du site porte des
métadonnées statiques, que ce réglage ne touche pas.

## Les options écartées

**Retirer le `generateMetadata` dynamique** alignerait le catalogue sur l'accueil,
qui rend un vrai 500 parce qu'il n'a qu'un `metadata` statique. Le coût est le
**canonical par filtre** de LS-137 : un canonical figé sur `/catalogue` dirait aux
moteurs que `?categorie=colliers` **est** le catalogue complet, et la page
filtrée quitterait l'index en emportant les mots-clés de la catégorie. Écartée,
le réglage corrigeant le statut sans rien sacrifier.

**Assumer le 200 en documentant la limite.** Écartée : un visiteur sans
JavaScript reste devant un chargement qui n'aboutit jamais, et une supervision
qui lit le code HTTP conclut que tout va bien pendant une panne de base.

**Un `try/catch` avec repli dans `generateMetadata`.** Essayée le 9 septembre
2026, **livrée puis annulée par `revert`**. La mesure a montré l'inverse de
l'effet voulu : le repli faisait **réussir** la fonction, donc la page rendait
son titre et continuait, et Twitterbot passait de 500 à 200. Le seul chemin qui
produisait un statut honnête disparaissait. **Ne pas réessayer**, le fichier et
`next.config.ts` portent tous deux cette mention.

## Conséquences

**Une supervision qui lit le code HTTP voit désormais la panne** sur le
catalogue comme sur l'accueil, ce qui était l'objet de la décision.

**Un visiteur sans JavaScript reçoit une erreur** au lieu d'un chargement
perpétuel. Avec JavaScript, `error.tsx` s'affiche après hydratation dans les deux
cas.

**Le TTFB augmente de quelques millisecondes en local**, et l'effet sur le VPS
reste à mesurer, LS-140.

**L'argument SEO qui a servi à justifier ce travail était partiel**, et il faut
le dire : Googlebot recevait 200 sur une page « Chargement… », Twitterbot 500.
Ce n'était donc pas « les moteurs indexent un chargement », mais « certains
oui ». Ce qui reste entier est le visiteur sans JavaScript et la supervision.

## Traçabilité

LS-139 pour l'incident qui a trouvé le défaut, LS-137 pour le canonical par
filtre, LS-140 pour la mesure de performance sur le site déployé. Le fichier
`src/app/(boutique)/catalogue/page.tsx` porte le motif au point de lecture.
