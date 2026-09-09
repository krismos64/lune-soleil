# 9 septembre 2026, h : LS-139, les cinq en-têtes de sécurité

Premier volet de LS-139, sur les critères 1, 2 et 7. La story **reste ouverte**,
son gros morceau étant la répétition d'incidents.

## Le constat, mesuré avant de coder

La production ne servait **qu'un en-tête sur cinq** :

```
strict-transport-security: max-age=63072000; includeSubDomains
```

`Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` et
`Permissions-Policy` n'étaient écrits **nulle part** : ni dans Nginx, ni dans
`next.config.ts`, ni ailleurs. La boutique tourne depuis le 9 septembre au
matin.

## ADR-038, trois arbitrages

**La CSP par nonce plutôt que par `unsafe-inline`.** Ce dernier annule
l'essentiel de la protection : c'est précisément l'injection de script inline
que la CSP existe pour bloquer, et le poser rendrait la politique décorative
tout en la laissant parfaitement visible.

Le hash de chaque script inline a été écarté : ceux de Next.js changent à chaque
build et dépendent de la page rendue.

**Le coût du nonce a été mesuré, pas supposé.** Il impose le rendu dynamique, et
le build rend déjà **sept routes dynamiques sur huit**, la seule statique étant
le manifeste. Cette boutique ne perd rien ; la décision serait autre sur un site
majoritairement statique, et l'ADR l'écrit pour que ce soit relisible.

**Les quatre autres chez Nginx**, parce qu'il les sert **même quand
l'application est tombée**. Une page 502 partirait sinon sans `nosniff`,
c'est-à-dire au moment où le client est le plus exposé.

**Pas de `preload` HSTS avant l'ouverture**, arbitrage de Christophe :
l'inscription est difficilement réversible et engage tous les sous-domaines, y
compris ceux qui n'existent pas encore.

## Un piège de Nginx que le contrôle attrape

`add_header` dans un `location` **REMPLACE** le jeu hérité du bloc serveur, il
ne s'y ajoute pas. Un `location` qui pose un seul en-tête perd donc les quatre
autres, en silence.

Le bloc `/medias/` était exactement dans ce cas, et ce sont **des fichiers
téléversés** : précisément ce qui mérite d'être protégé. Le fichier documentait
déjà ce piège pour deux en-têtes, il fallait le suivre pour les deux nouveaux.

## Mon contrôle était aveugle deux fois, et la mutation seule l'a montré

C'est la troisième fois de la journée, et le motif se répète assez pour mériter
d'être dit.

**Première fois** : le contrôle cherchait `unsafe-inline` sur toute ligne
contenant `script-src`, et attrapait le **commentaire** qui explique pourquoi
cette directive est refusée. Il accusait le fichier de porter le défaut qu'il
documente, motif « contrôle satisfait par un commentaire » pris à l'envers.

**Seconde fois** : il vérifiait la présence de `development` **n'importe où**
dans le fichier plutôt que sur la ligne qui pose `unsafe-eval`. Retirer la
condition laissait intacte la ligne `NODE_ENV === "development"` qui la lit plus
bas, et le contrôle restait vert sur une directive devenue inconditionnelle.

Dans les deux cas la relecture ne voyait rien. La mutation, si.

## Les preuves

```
./scripts/verifier-en-tetes-securite.sh            -> 4 sens verts
./scripts/verifier-en-tetes-securite-mutation.sh   -> 9 mutations sur 9

npx playwright test tests/e2e/en-tetes-securite.spec.ts
  -> 11 passed (11.5s)
```

Le test mesure ce qu'un contrôle textuel **ne peut pas** voir : que le nonce
**change à chaque requête** et qu'il **correspond** à celui des scripts inline.
Un nonce figé est devinable, donc réutilisable par un script injecté ; un nonce
décalé bloque tout et laisse croire que la protection est en place.

**La CSP est servie par le build standalone**, mesuré sur `node server.js` et
non supposé : c'est celui que l'image de production embarque. Un proxy absent de
la sortie autonome n'aurait servi aucune politique en ligne, et rien ne l'aurait
dit avant le déploiement.

Six pages publiques répondent 200 avec la politique, et les **trois scripts
inline portent le nonce**, JSON-LD compris : Next.js le propage seul.

## Ce que la CI a refusé, deux fois, et qu'elle avait raison de refuser

Écrit après coup : ces deux défauts sont sortis **après** la première rédaction
de ce journal, et ils portent la leçon la plus utile du volet.

### Le composant asynchrone cassait cinq tests de sécurité

Rendre `DonneesStructurees` asynchrone pour lire le nonce a cassé les cinq tests
unitaires de LS-137 : ils appellent le composant **comme une fonction** pour
mesurer le HTML réellement rendu, et un composant asynchrone leur rend « A
component suspended while responding to synchronous input ».

Ces tests gardent une propriété réelle : une saisie contenant `</script>`
refermerait la balise au milieu du JSON. React n'échappe rien dans un `<script>`,
son contenu étant du texte brut au sens HTML.

**Deux voies existaient.** Rendre les tests asynchrones aurait marché, et aurait
mêlé l'échappement à une dépendance de requête : chaque test aurait dû simuler
`headers()` pour vérifier une propriété qui n'a rien à voir avec lui. Le
composant est donc coupé en deux, `BlocJsonLd` rendant et `DonneesStructurees`
lisant le nonce.

### Puis mon contrôle s'est contenté du transport du nonce, pas de sa pose

Le découpage a fait apparaître `nonce={nonce}` **deux fois** : passé en
propriété, puis posé sur la balise. Le contrôle cherchait `nonce={` n'importe où
dans le fichier : il trouvait le passage et restait **vert** alors que la balise
ne portait plus rien.

C'est exactement le défaut à attraper, et le seul qui compte : un nonce
transporté mais non posé laisse la CSP bloquer le bloc, et les données
structurées disparaissent pour les moteurs **sans que rien ne change à l'écran**.

**La mutation visait aussi à côté**, et les deux défauts se masquaient : une
substitution sans `/g` retirait la première occurrence, celle qui ne protège
rien. Le contrôle restait donc vert **à juste titre**, et la mutation l'accusait
à tort.

**C'est la quatrième fois de la journée** qu'un contrôle écrit ici se révèle
décoratif, et à chaque fois seule la mutation l'a vu. Le motif mérite d'être
retenu : un contrôle qui cherche un nom **n'importe où** dans un fichier se fait
satisfaire par un commentaire, par une déclaration de type, ou par le simple
passage d'une valeur.

## Propagation

ADR-038 entre dans la table de `docs/REFERENCES.md`. Les deux scripts entrent
dans le `README.md`. `securite.md` gagne la règle **et** le chemin
`src/proxy.ts`, qu'aucune règle ne couvrait : motif « règles non ancrées », déjà
en fiche, et le fichier neuf est justement celui qui porte la politique.

## État des tickets

**LS-139 reste EN COURS**, et il faut dire précisément ce qui manque :

- critère 3, `npm audit` à zéro : **bloqué par LS-210**, trois vulnérabilités
  vitest que npm refuse de résoudre
- critères 5 et 6, la **répétition d'incidents** : base indisponible, paiement en
  panne, disque plein. C'est le gros morceau, et il touche la production
- le **durcissement SSH** et le pare-feu
- l'**alerte de seuil sur l'espace disque**, du commentaire du 9 septembre

Les critères 1, 2 et 7 sont faits et prouvés. Le critère 4, la limitation de
débit derrière le proxy, était déjà couvert et mesuré par LS-96 le matin même.

## Prochaine étape

La **répétition d'incidents**, critères 5 et 6, dans une session dédiée : elle
touche la production et mérite d'être abordée à froid.
