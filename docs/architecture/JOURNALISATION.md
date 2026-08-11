# Journalisation et contrôle de santé

Convention issue de LS-73. À lire avant d'ajouter une ligne de journal ou de
toucher au contrôle de santé.

Le module est `src/lib/journal.ts`, le service de santé `src/services/sante.ts`,
la route `src/app/api/sante/route.ts`.

## Trois journaux distincts, à ne jamais confondre

C'est la distinction qui coûte le plus cher si elle se perd, parce que les trois
portent le même mot.

| Journal | Où il vit | Ce qu'il vaut | Qui l'écrit |
|---|---|---|---|
| **technique** | sortie standard | perdu au redémarrage, aucune valeur probante | `lib/journal.ts` |
| **métier** | base, tables `JournalAudit` et `JournalEmail` | conservé, opposable | les services |
| **connexions** | base, table `JournalConnexion`, ADR-027 | conservé six mois, recommandation CNIL | `services/journal-connexion.ts`, LS-80 |

Une trace métier écrite dans le journal technique disparaît au premier
redémarrage du conteneur. Une trace technique écrite en base fait grossir la
base sans rien apporter.

Ce document ne traite que du premier. Le journal des connexions a ses propres
règles dans `.claude/rules/securite.md` : ce qu'il n'écrit jamais, pourquoi son
écriture ne lève pas, et les deux chemins d'entrée qui l'alimentent.

**Les deux se croisent sur un point.** Quand l'écriture du journal des connexions
échoue, l'échec part dans le journal technique, en `error`. C'est voulu : un
`catch` vide rendrait une panne d'écriture indétectable, ce qui reviendrait à
n'avoir aucun journal tout en croyant en avoir un. Le contexte transmis ne porte
que l'issue et le moyen, jamais l'adresse.

## Ce qui ne doit jamais sortir

L'invariant 9 est absolu et le dépôt est **public**. S'y ajoutent les données
personnelles : le projet traite des adresses de livraison et des adresses email.

La règle de conduite du projet vaut ici : pour diagnostiquer, lister les **noms**
de variables sans leur contenu.

Le masquage est automatique sur le contexte, par nom de clé, comparaison en
minuscules et sans séparateur. `motDePasse`, `mot_de_passe` et `MOT-DE-PASSE`
sont équivalents, et la comparaison se fait par **inclusion** : `emailClient` et
`adresseLivraison` sont masqués comme `email` et `adresse`.

**Le masquage ne protège que le contexte.** Deux chemins l'esquivent
entièrement :

```ts
// NON. Le message est du texte libre, aucun filtre ne le traverse.
journaliser("info", `commande de ${client.email}`);

// OUI. Tout ce qui varie passe par le contexte.
journaliser("info", "commande creee", { emailClient: client.email });
```

Le message est une **constante de code**, jamais une valeur d'entrée.

## Les erreurs, seul le nom de la classe

`journaliserErreur` n'écrit ni le message, ni la pile, ni la cause. Ce n'est pas
un excès de prudence, les trois vecteurs sont mesurés sur ce dépôt :

- PostgreSQL recopie la valeur en conflit dans le message d'une violation
  d'unicité, `Key (email)=(personne@exemple.fr) already exists`
- une pile d'appel porte des chemins de fichiers, parfois des arguments
- `cause` chaîne les erreurs de pilote, qui portent **l'URL de connexion avec son
  mot de passe**

Ce qui reste, le nom de la classe, suffit à orienter :
`PrismaClientKnownRequestError` et `EntreeInvalideError` ne mènent pas au même
diagnostic. Le détail complet reste écrit sur la console **en développement
seulement**.

## Identifiant de corrélation

Il relie les lignes d'une même requête. Engendré par l'adaptateur d'entrée, passé
explicitement aux services, et renvoyé au client par l'en-tête
`X-Correlation-Id` sur la route de santé.

Il **n'autorise rien**, invariant 2. Ce n'est pas un jeton, il ne se substitue à
aucune vérification de session.

## Niveau de détail

`LOG_LEVEL` vaut `error`, `warn`, `info` ou `debug`. Absent ou inconnu, il
retombe sur `info` sans lever : une faute de frappe dans une variable
d'environnement ne doit pas empêcher l'application de démarrer.

La valeur est **relue à chaque appel**, jamais mise en cache. Un niveau figé au
chargement du module ne pourrait plus changer sur un conteneur en cours
d'incident, précisément quand on en a besoin.

## Contrôle de santé

`GET /api/sante` répond **200** si la base répond, **503** sinon.

Le code HTTP est ce qui compte : Docker et les sondes d'orchestrateur décident
dessus, pas sur le corps. Répondre 200 avec `{"operationnel": false}` serait lu
comme un service sain.

Quatre décisions à connaître avant d'y toucher :

- **`SELECT 1` et non un comptage sur une table métier.** Un `count` sur
  `Produit` ferait échouer le contrôle pendant une migration qui verrouille la
  table, alors que le service peut servir.
- **Un délai de garde de deux secondes.** Le cas qui fait mal n'est pas la base
  qui refuse la connexion, celle-là échoue vite : c'est celle qui accepte la
  connexion TCP et ne répond plus. Sans délai, la sonde attend indéfiniment et le
  diagnostic est un silence au lieu d'un état.
- **La route est publique**, un orchestrateur ne porte pas de session. Elle ne
  dit donc **rien** d'exploitable : pas de version de PostgreSQL ni de Node, pas
  de nom d'hôte, aucune trace d'erreur.
- **Jamais de cache.** Une réponse mise en cache ferait répondre « en bonne
  santé » à une application dont la base est morte.

`./scripts/controle-fumee.sh` l'interroge après déploiement et rend 0 ou 1. Il
vise la **route** et non PostgreSQL directement : une base joignable depuis le
poste de déploiement ne prouve pas que l'application la joint.

## Aucun service de supervision tiers

Arbitrage de Christophe, 10 août 2026. Aucune trace ne part vers un prestataire
externe.

`README.md` annonçait Sentry et `.env.example` portait `SENTRY_DSN` : rien ne les
lisait, aucun ADR ne les décidait. Une trace d'exception envoyée à un
sous-traitant hors UE ferait sortir des données personnelles du périmètre, ce qui
demanderait un ADR et une inscription au registre des traitements.

La question se rouvrira en phase 6, avec le VPS, si le besoin apparaît. Elle ne
tient pas au coût : Sentry a une offre gratuite.

## Aucune dépendance externe

Même arbitrage. Le besoin tient dans un formateur JSON ; une bibliothèque
ajouterait une surface à `npm audit`, qui porte déjà sept overrides dont deux
posés dans les trois jours précédant cette story.

## Preuve

Quatre mutations de `verifier-tests-mutation.sh` couvrent ces garanties, cas 16 à
19 : masquage neutralisé, comparaison de clé rendue exacte, message d'erreur
recopié, base injoignable déclarée disponible. Toutes détectées par le test qui
porte la garantie.

Le cas 18 a d'abord échoué pour une raison étrangère au code : Perl interprétait
`${erreur.name}` dans la chaîne de remplacement comme une de ses variables. La
mutation testait autre chose que ce qu'elle annonçait.
