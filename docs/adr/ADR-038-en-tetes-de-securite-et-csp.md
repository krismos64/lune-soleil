# ADR-038 : en-têtes de sécurité, CSP par nonce et HSTS sans preload

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 9 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-139 |

## Décision

Les cinq en-têtes de sécurité sont servis par **Nginx**, sauf la
`Content-Security-Policy` qui est posée par un **proxy Next.js** avec un **nonce
par requête**.

Le `preload` HSTS **n'est pas posé** avant l'ouverture de la boutique.

## Ce qui a été mesuré avant de décider

La production ne servait **qu'un en-tête sur cinq**, mesuré le 9 septembre 2026 :

```
strict-transport-security: max-age=63072000; includeSubDomains
```

Manquaient `Content-Security-Policy`, `X-Content-Type-Options`,
`Referrer-Policy` et `Permissions-Policy`.

**La page ne charge aucune ressource externe**, vérifié sur le rendu réel :
aucun `src` ni `href` vers un autre domaine, aucune balise `<style>`, et zéro
police distante. La CSP peut donc être stricte sans négocier avec un tiers.

**Trois scripts inline existent** : le JSON-LD des données structurées, et deux
scripts d'hydratation de Next.js.

## Pourquoi le nonce plutôt que `unsafe-inline`

`unsafe-inline` sur `script-src` **annule l'essentiel de la protection** : c'est
précisément l'injection de script inline que la CSP existe pour bloquer. Le
poser reviendrait à écrire l'en-tête pour la forme.

Les deux autres voies ont été écartées :

**Le hash de chaque script inline** ne tient pas : les scripts d'hydratation de
Next.js changent à chaque build, et leur contenu dépend de la page rendue. Il
faudrait recalculer les hash à chaque déploiement, et une page oubliée casserait
en silence.

**Renoncer à la CSP** au motif qu'il n'y a pas de tiers laisserait sans défense
le seul endroit où une injection est plausible : les champs de saisie de
l'administration et les avis clients, epic LS-36.

## Le coût du nonce, mesuré et non supposé

Le nonce **impose le rendu dynamique**, la valeur devant être unique par
requête. C'est le prix habituel de cette décision, et il est **quasi nul ici** :
le build du 9 septembre 2026 rend **sept routes dynamiques et une seule
statique**, le manifeste.

Une boutique dont le catalogue, le panier, le tunnel et l'administration sont
tous dynamiques ne perd donc rien. La décision serait autre sur un site
majoritairement statique.

## `unsafe-eval` en développement seulement

React emploie `eval` en développement pour reconstruire les piles d'erreur
serveur dans le navigateur. Ni React ni Next.js ne l'emploient en production.
La directive est donc conditionnée à `NODE_ENV`, et **jamais posée en
production**.

## Pourquoi Nginx pour les quatre autres

Ils ne dépendent d'aucune donnée de requête, et Nginx les sert **même quand
l'application est tombée**. Une page d'erreur 502 partirait sinon sans
`X-Content-Type-Options`, c'est-à-dire au moment où le client est le plus exposé.

C'est le même raisonnement que le `always` du HSTS, déjà en place : sans lui,
`add_header` ne pose l'en-tête que sur une partie des réponses.

## Pourquoi pas de `preload` HSTS

L'inscription sur la liste des navigateurs est **difficilement réversible** et
engage **tous les sous-domaines**, y compris ceux qui n'existent pas encore. Une
erreur de certificat sur un sous-domaine futur rendrait le site injoignable, sans
recours rapide.

Le domaine sert déjà la boutique en production et la décision peut attendre
l'ouverture, quand les sous-domaines réellement utilisés seront connus. Le
`max-age` de deux ans reste posé, qui est la protection utile.

## Conséquences

- un fichier `src/proxy.ts` naît, qui n'existait pas
- toute page devient dynamique, ce qui est déjà le cas de sept sur huit
- le composant `donnees-structurees.tsx` porte le nonce sur son `<script>`
- `docker/nginx/lune-soleil.conf` gagne quatre `add_header`, tous en `always`
- un contrôle vérifie les cinq en-têtes sur les réponses réelles, avec sa preuve
  par mutation : retirer un en-tête doit faire rougir séparément, critère 7 de
  LS-139

## Ce que cet ADR ne décide pas

La `report-uri` de la CSP, qui suppose un point de collecte. Le projet écarte
les services tiers pour le transfert de données, Sentry ayant été écarté pour ce
motif, et un point de collecte interne appartient à la journalisation plutôt
qu'à cet ADR.

Le durcissement SSH et la répétition d'incidents, qui restent dans LS-139 sans
demander d'arbitrage d'architecture.
