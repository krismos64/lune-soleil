# 9 septembre 2026, i : l'incident 1 de LS-139, et deux erreurs de ma part

Session longue. Un vrai trou de sécurité fermé en production, le premier des
trois incidents joué et rétabli, et **deux corrections successives ratées sur un
même défaut**, dont une régression que j'ai livrée avant de la mesurer.

## Ce qui a été fermé, et qui compte

**La production ne servait que deux en-têtes de sécurité sur cinq.** Le premier
volet de LS-139, livré la veille, était écrit, prouvé par neuf mutations,
fusionné sur `main` **et déployé**. Il ne protégeait rien.

```
curl -sSI https://lune-soleil.fr/ | grep -icE 'content-security|...'
2
```

La CSP était arrivée, elle vient de l'application. Les trois autres non.

**La cause est structurelle et elle reste vraie.**
`docker/nginx/lune-soleil.conf` est un fichier de **l'hôte** : ni le workflow de
déploiement ni `deployer.sh` ne le transportent, et rien ne le fera. Une version
antérieure dormait sur la machine depuis le 8 septembre, et son bloc `/medias/`
ne redéclarait que deux en-têtes sur quatre, c'est-à-dire **sans protection sur
des fichiers téléversés**.

**Aucun des deux contrôles existants ne pouvait le voir.** Le contrôle textuel
lit le fichier du dépôt, qui était correct : il était vert à juste titre. La
suite de bout en bout mesure un serveur local monté depuis ce même dépôt, donc
elle mesure toujours la bonne version.

`verifier-en-tetes-production.sh` interroge le domaine public et distingue
« écrit » de « en service ». **Prouvé par la configuration défectueuse réelle**,
pas par une forme fabriquée : l'ancienne conf remise en service, le contrôle a
rougi en nommant les trois en-têtes manquants et les deux de `/medias/`, puis
restauration.

`EXPLOITATION.md` annonçait « les quatre autres arriveront avec la prochaine mise
en production ». C'était faux, et cette phrase a **masqué le défaut** en le
faisant passer pour une attente normale.

## L'incident 1, joué quatre fois

```
14:52:55Z  docker stop lune-soleil-db
           /api/sante   503 en 0,18 s   {"operationnel":false,"base":"indisponible"}
14:53:37Z  docker start lune-soleil-db
   t+5s    /api/sante   200             sans aucune intervention
```

**Le critère 6 est satisfait pour cet incident.** L'application raccroche seule
en moins de cinq secondes, `app` n'a jamais redémarré, « Up 22 minutes » avant
comme après.

**L'argument central d'ADR-038 est vérifié en conditions réelles pour la
première fois** : les cinq en-têtes partent bien sur une réponse **500**, c'est-à-dire
au moment où le client est le plus exposé. C'était affirmé depuis la veille,
jamais mesuré.

## Le défaut qu'il a révélé, et mes deux erreurs

`/catalogue` répondait **200** avec « Chargement des pièces… » comme état final,
quand l'accueil rendait un vrai 500.

### Première correction : nécessaire, insuffisante

Une sonde en tête de page. Déployée, puis mesurée : toujours 200, HTML identique
à deux octets près.

La cause, ✅ via Context7 : **la sonde était elle-même un `await` sous la
frontière** du `loading.tsx`. Elle suspendait, donc elle démarrait le flux avant
de lever. La documentation le disait, « before any await that may suspend », et
je l'avais lue trop vite.

Le remède réel était écrit **dans le dépôt** depuis LS-188, dans le commentaire
de la fiche produit : retirer le `loading.tsx` de segment, poser un `<Suspense>`
interne. Dix écrans l'ont reçu, le catalogue plus neuf d'administration, l'ancrage
du contrôle ne cherchant que `lireCataloguePublic` et ne voyant donc que la
boutique.

### Seconde correction : une régression que j'ai proposée comme sûre

Toujours 200 après le `<Suspense>`. La mesure qui a trouvé la cause :

```
navigateur ordinaire  200      Twitterbot  500      Googlebot  200
```

**Next.js 16 diffuse les métadonnées séparément** sur une page dynamique, sans
bloquer le rendu, ✅ via Context7. La réponse est engagée avant que
`generateMetadata` ait fini de lire la base. Le 500 de Twitterbot vient de
`htmlLimitedBots`, qui y désactive ce streaming.

J'ai proposé un `try/catch` avec repli, **présenté comme local et sûr**, et il a
été choisi sur cette recommandation. Mesure après déploiement :

```
AVANT le repli   navigateur 200   Twitterbot 500   Googlebot 200
APRÈS le repli   navigateur 200   Twitterbot 200   Googlebot 200
```

`generateMetadata` **réussit** quand sa lecture est rattrapée, donc la page rend
son titre et continue. J'avais supprimé le seul chemin qui produisait un statut
honnête.

**Annulé par `revert`, ET DÉPLOYÉ**, ce dernier point comptant autant que le
premier : une régression annulée dans le dépôt reste en service tant que la
production ne l'a pas reçue, motif que cette même session a documenté deux fois.
Vérification après déploiement, base réellement arrêtée :

```
/catalogue navigateur  200      /catalogue Twitterbot  500      /  500
```

Twitterbot a retrouvé son 500 : l'état d'avant mon erreur est rétabli en
production.

## Les deux erreurs, nommées

**Affirmer avant de mesurer.** J'ai proposé une option comme sûre sans l'avoir
éprouvée. Une recommandation engage la décision de Christophe : elle doit reposer
sur une mesure, pas sur un raisonnement vraisemblable.

**Un argumentaire trop affirmatif.** J'ai écrit dans deux pull requests et un
commit qu'« un moteur indexe Chargement… en 200 ». La mesure nuance : Googlebot
reçoit 200, Twitterbot reçoit 500. L'argument SEO est **partiel**, et ce projet a
une règle explicite contre les affirmations non mesurées.

Ce qui reste entier, et suffisait à justifier le travail : un visiteur **sans
JavaScript** devant un chargement perpétuel, et une **supervision** qui lit le
code HTTP et conclut que tout va bien.

## Ce que les contrôles ont attrapé, dont deux fois moi-même

**Le contrôle se laissait satisfaire par une déclaration.** Le motif cherchait
`await verifierSante` n'importe où : retirer l'appel du corps de page laissait
intacte la ligne de la fonction d'aide devenue morte. Seule la mutation l'a vu.

**Puis par l'ordre.** Une sonde placée après la lecture ne protège rien, et le
contrôle restait vert.

**Une mutation visait à côté.** Renommer la propriété `annonce` laissait quatorze
annonces sur quinze ailleurs : le contrôle restait vert **à juste titre**, et la
mutation l'accusait à tort. Motif déjà en fiche.

**Un motif dépendant de la locale.** `[a-zà-ÿ]` trouvait seize fichiers sur ce
poste et **aucun** en CI : le contrôle y déclenchait sa propre garde « l'ancrage
est cassé » sur un dépôt sain. Il passait en local et rougissait en intégration,
ce qui fait douter du code alors que le défaut est dans l'outil.

**Un contrôle a rougi quand sa cible a disparu**, et c'était le bon comportement :
`verifier-ponctuation-chargement.sh` inventoriait les `loading.tsx`, tous retirés.
Il l'a dit au lieu de rendre un OK muet.

## L'incident 2, déjà couvert

Vérifié avant de jouer, plutôt qu'écrit à nouveau :

```
npx vitest run tests/integration/paiement-session.sequential.test.ts
  Tests  15 passed (15)
```

Trois cas de panne, dont celui qui porte l'invariant 5 : après une panne du
prestataire, la commande reste `EN_ATTENTE_PAIEMENT` avec ses réservations.
`verifier-tests-mutation.sh` porte le cas 115 qui l'éprouve.

**Ce qui reste non couvert et doit être dit** : le comportement de bout en bout
sur la production réelle, qui demande les clés Stripe de LS-153. Un test
d'intégration prouve la logique, pas que Stripe se comporte comme son double.

## Ce que la préparation de l'incident 3 a trouvé

Les quatre garde-fous de `sauvegarder-base.sh` (conteneur arrêté, dump sous 1024
octets, archive illisible, moins de dix objets) **n'ont jamais été exercés** :
`verifier-tests-mutation.sh` ne cite pas ce script. `EXPLOITATION.md` affirme
pourtant qu'il « s'arrête plutôt que de produire une sauvegarde douteuse ».

C'est une hypothèse, et ce dépôt a déjà rencontré plusieurs garde-fous qui ne
fonctionnaient pas.

## État des tickets

**LS-139 reste EN COURS.** Fait : les critères 1, 2 et 7 (la veille), le critère
4 (déjà couvert par LS-96), l'incident 1 des critères 5 et 6, et le constat
documenté de l'incident 2.

Reste : l'incident 3, le durcissement SSH et le pare-feu, l'alerte de seuil
disque, et le critère 3 bloqué par LS-210.

**LS-211 créée**, rattachée à LS-7 : l'arbitrage entre statut honnête et
canonical par filtre de LS-137. Le fichier porte le motif complet et la mention
de ne pas réessayer le repli.

## Prochaine étape

L'incident 3, disque plein, sur un système de fichiers dédié et jamais le disque
réel, partagé avec SmartPlanning. Il éprouvera au passage les quatre garde-fous
de la sauvegarde, jamais déclenchés.
