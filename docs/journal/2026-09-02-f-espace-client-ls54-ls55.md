# 2 septembre 2026, session F : LS-54 et LS-55, l'espace client s'ouvre

Christophe a choisi l'espace client avant la mise en ligne, et ces deux stories
en posent le socle : s'inscrire, se connecter, confirmer son adresse, et
reprendre la main sur un mot de passe oublié.

Le fil de la session tient en une phrase : **onze défauts réels, aucun trouvé en
relisant le code**.

Trois l'ont été en écrivant un test qui traverse réellement la chaîne, et ils
étaient totaux : aucun email d'authentification ne partait, et les sessions
survivaient à la réinitialisation. Les huit autres l'ont été par la revue
frontend, dont trois écrans ou chemins simplement absents que mes 579 tests
verts ne pouvaient pas voir.

## Le seul arbitrage demandé, posé avant le départ

LS-54 portait une contradiction apparente. Le commentaire de clôture de LS-82,
le 27 août, disait que le blocage de `requireEmailVerification` n'était plus
l'envoi « mais le parcours autour », ce qui suggérait que LS-54 livre les écrans
**puis active** le drapeau. Le critère 3 dit l'inverse, noir sur blanc : « un
compte non vérifié **peut se connecter** ».

Arbitrage de Christophe : **suivre le critère 3**, le drapeau reste désactivé.

Le motif retenu tient au-delà de la préséance formelle d'un critère sur un
commentaire. Le vrai risque du parcours 6 est le **rattachement** d'une commande
sur une adresse non vérifiée, qui ouvrirait l'historique et les factures d'un
tiers. Ce risque est fermé par la condition de rattachement, portée par LS-56,
pas par un verrou sur la connexion. Verrouiller la connexion aurait ajouté une
gêne sans fermer quoi que ce soit.

Le test d'intégration **fige cet arbitrage** plutôt que de le laisser en
commentaire : activer le drapeau fait rougir le critère 3.

## Premier défaut, aucun email d'authentification ne partait

Trouvé en écrivant le tout premier test, avant d'avoir écrit un seul écran.

`auth.ts` passait `variables: { url }` quand les modèles exigent `lien`.
`rendreModele` levait donc « Variable « lien » absente », et **ni la vérification
d'adresse ni la réinitialisation de mot de passe ne partaient**. Jamais, depuis
LS-70.

Pourquoi rien ne le voyait :

| Test | Ce qu'il appelle | Ce qu'il rate |
|---|---|---|
| `envoi-email-smtp.test.ts` | `rendreModele` directement, avec `lien` | l'appelant réel |
| `authentification.sequential` | `auth.api.*`, sans rendre de message | le rendu |

Chaque moitié était juste, la jonction ne l'était pas. C'est le motif de la
chaîne construite à l'exécution, déjà en fiche, sous une forme neuve : ici les
deux moitiés sont **testées séparément et correctement**.

Le test qui le couvre injecte un envoyeur qui **rend réellement** le message. Un
double qui gobe ses arguments resterait vert sur exactement ce défaut : c'est le
rendu qui lève, pas l'envoi.

## Deuxième défaut, le rappel n'était jamais appelé

Le test corrigé passait pour la réinitialisation, pas pour la vérification :
aucun appel du tout, aucune erreur.

`sendVerificationEmail` était configuré depuis LS-70 et **n'était jamais
appelé** : Better Auth ne déclenche cet envoi que si `sendOnSignUp` le demande,
vérifié via Context7 sur la version 1.6.23.

**Un rappel branché sans appelant ressemble à du code qui marche.** Il est
présent, correct, documenté, et mort. Le premier défaut le masquait d'ailleurs :
même appelé, il aurait levé.

## Troisième défaut, les sessions survivaient à la réinitialisation

Trouvé de la même façon, en écrivant le test du critère 3 de LS-55.

`revokeSessionsOnPasswordReset` n'était pas configuré. Un intrus connecté à un
compte compromis y restait **vingt-quatre heures** après que le propriétaire ait
repris la main : le mot de passe changeait, l'accès restait ouvert.

C'est le scénario que « mot de passe oublié » existe pour traiter, et il ne le
traitait pas.

## Ce que le mécanisme de Better Auth réserve

Les deux flux de jeton diffèrent, et le supposer a coûté un test faux dans
chaque story.

| | Vérification d'adresse | Réinitialisation |
|---|---|---|
| Forme | JWT signé | jeton opaque |
| Emplacement | `?token=` en paramètre | dans le **chemin**, `/reset-password/<jeton>` |
| En base | **rien** | ligne `verification`, identifiant `reset-password:<jeton>` |
| Échéance | dans la charge du JWT | en base |

Un test qui cherchait la vérification en base échouait en accusant un envoi
absent. Un extracteur écrit par analogie rendait une chaîne vide et le test
échouait sur « Invalid token ». **Dans les deux cas la cause désignée n'était pas
la vraie**, et c'est ce qui rend ce genre de rouge coûteux.

## Le défaut du 13 août, corrigé aux deux endroits

`/compte` renvoyait vers `/administration/connexion` quand la session manquait,
à deux endroits : la page et le formulaire de suppression. Observation déposée le
13 août pendant LS-81 et LS-89, laissée volontairement en l'état faute d'écran
de connexion client.

Les deux sont repris **ensemble**. N'en corriger qu'un aurait laissé le motif du
drapeau ajouté sans être porté dans toutes les conditions d'accès, rencontré
trois fois sur ce projet.

Le test e2e existant assertait la redirection vers l'administration : il
**figeait le défaut** au lieu de le signaler. Corrigé, avec le commentaire qui
dit pourquoi.

## Cinq écrans, et un lien pour y accéder

`/compte/inscription`, `/compte/connexion`, `/compte/verification`,
`/compte/mot-de-passe-oublie`, `/compte/nouveau-mot-de-passe`.

L'en-tête de la boutique porte désormais « Se connecter » ou « Mon compte »
selon la session. **Sans ce lien, les cinq écrans auraient été inatteignables**,
le défaut exact de LS-162 côté administration. Le test e2e navigue au clic pour
cette raison, jamais par `goto`.

Deux décisions de conception qui ferment chacune un chemin :

- **l'adresse du renvoi de vérification vient de la session** et traverse le
  rendu serveur. Un champ libre aurait fait de ce bouton un moyen d'envoyer un
  message à n'importe quelle adresse depuis notre domaine, donc un relais signé
  par notre SPF
- **l'écran de nouveau mot de passe n'affiche ni adresse ni nom.** Un lien
  intercepté ne doit pas confirmer à qui appartient l'adresse

## Ce que le test e2e ne fait pas, et pourquoi

**Il n'inscrit personne.** `/sign-up/email` est plafonné à trois appels par
minute et par adresse IP, et la suite tourne sur trois largeurs : une
inscription réelle ferait rougir un fichier **voisin**, défaut déjà mesuré en
LS-81. L'inscription réelle est couverte en intégration, où elle ne passe ni par
le réseau ni par le plafond.

Ce plafond s'est d'ailleurs rappelé pendant la session : mes lancements répétés
l'ont épuisé et la préparation e2e a échoué sur « Too many requests ». Le
diagnostic a pris trente secondes parce que le fichier concerné porte déjà le
récit du défaut.

## La revue frontend a trouvé huit défauts, dont trois graves

Aucun n'était visible dans mes mesures : 579 tests verts, axe-core sans
violation, aucun débordement. **Ce que ces contrôles ne voient pas est
exactement ce qu'elle a vu.**

### Trois écrans ou chemins manquants

**`/compte/verification` était inatteignable.** Sa seule référence dans tout
`src/` était la redirection suivant l'inscription : une fois quitté par « Aller
à mon compte », on ne pouvait plus y revenir sans saisir l'URL. Or le scénario
même de cet écran est « le message n'arrive pas », donc le retour.

C'est C33 transposé côté boutique, et **mes propres tests ne pouvaient pas le
voir** : ils atteignaient la page par `page.goto()`. J'avais écrit dans ce
fichier que la navigation au clic était la leçon de LS-162, et je l'avais
appliquée aux écrans publics sans l'appliquer à celui-là.

**`?verifie=1` était posé sans être lu.** `PageCompte()` ne recevait pas
`searchParams`. Qui cliquait le lien depuis sa boîte atterrissait sur « Mon
compte » sans aucun accusé de réception. Un succès muet se lit comme un échec et
fait recliquer un lien désormais consommé.

**Aucune déconnexion n'existait.** `signOut` était exporté depuis LS-70 sans
appelant : un client sur un appareil partagé ne pouvait fermer sa session
qu'en supprimant son compte. C'est le motif de la fonction exportée sans
appelant, déjà en fiche, et il portait cette fois un état non nominal entier.

### Quatre défauts d'accessibilité dynamique

Ceux-là sont instructifs : **axe-core valide la forme du rôle, jamais le
comportement**. Il voyait `role="status"` bien formé et ne pouvait rien dire de
plus.

- **les régions live étaient insérées en même temps que leur texte**, donc
  jamais annoncées : le nœud doit préexister pour que la mutation soit observée
- **le focus retombait sur `body`** à chaque confirmation, trois écrans. Après
  avoir changé son mot de passe, il fallait retraverser tout l'en-tête au
  clavier pour atteindre le lien « Se connecter »
- **le renvoi de lien n'était jouable qu'une fois**, état terminal, sur l'écran
  dont le sujet est précisément de redemander
- **l'opacité 0,7 des boutons désactivés** n'est mesurée par aucun contrôle :
  `verifier-contraste.sh` compare des jetons, il ne calcule pas l'opacité

### Un commentaire qui figeait une hypothèse fausse

Le lien de compte annonçait « texte courant sur crème à 12,09:1 » alors que
l'en-tête pose un fond blanc, où la paire vaut 12,92:1. Les deux passent AA,
donc rien ne cassait. Mais C31 dit que c'est **par recopie d'un rapport écrit
sous une autre hypothèse** que le défaut est entré deux fois sur ce projet.

J'ai d'ailleurs commis le même écart dans ma propre correction, en annonçant
7,74:1 là où la mesure donne 7,49:1. Corrigé.

### Le neuvième point, signalé et ticketé plutôt que corrigé

Le message de suppression demande « confirmez votre identité » sans qu'aucun
écran client ne le permette : le seul écran de réauthentification exige le rôle
`ADMINISTRATRICE`. Un client ne peut donc pas supprimer son compte, droit que le
RGPD lui garantit.

Le défaut est **antérieur**, il vient de LS-95. Le corriger ici aurait ajouté
une surface d'authentification que ni le ticket ni ADR-023 ne prévoient.
**LS-164** le porte, rattachée à LS-36 et bloquée par LS-54.

## Vérifications

```
npm run type-check                                    OK
npm run lint                                          OK
npm run format:check                                  All matched files use Prettier code style!
npm run build                                         31 routes, les cinq ecrans de compte

npm run test                                          937 passed, 60 fichiers
npx playwright test                                   585 passed, 4 skipped, trois largeurs

./scripts/verifier-contraste.sh                       96 paires, OK
./scripts/verifier-loading-et-404.sh                  25 segments, OK
./scripts/verifier-regles.sh                          regles conformes au schema
./scripts/verifier-gardes-administration.sh           32 actions, toutes gardees
./scripts/verifier-propagation-docs.sh                20 schemas, accordes
axe-core sur les cinq ecrans, trois largeurs          aucune violation
```

**Huit mutations, huit détectées par le test attendu :**

| Mutation | Test qui rougit |
|---|---|
| `variables: { lien: url }` remis à `{ url }` | la réinitialisation traverse le rendu |
| `sendOnSignUp: true` à `false` | la vérification part à l'inscription |
| `requireEmailVerification` à `true` | critère 3, le compte non vérifié se connecte |
| `input: false` retiré | critère 5, élévation de privilège refusée |
| `revokeSessionsOnPasswordReset` à `false` | critère 3 de LS-55, la session tombe |
| envoyeur muet | critère 2, six sur sept |
| lien de vérification retiré | le compte mène à la vérification |
| `BoutonDeconnexion` retiré | le compte propose de fermer la session |

La dernière mérite d'être lue : elle prouve que le test du critère 2 ne se
contente pas de comparer deux réponses identiques. Sans sa seconde assertion,
une implémentation qui n'enverrait **jamais** rien aurait passé le test tout en
cassant la fonctionnalité.

## Ce qui reste

**Aucune dette ouverte par ces deux stories**, et une dette **antérieure**
ticketée en LS-164, la réauthentification client.

Un point signalé plutôt que décidé seul : `PROTOTYPE.md` place l'espace client
sur `/espace-client` avec un formulaire de connexion intégré à la page. Le dépôt
sert `/compte` depuis LS-95 et porte désormais deux écrans distincts. Le
prototype a raison sur le **principe**, un écran de connexion propre aux clients,
et seul le chemin diffère : l'écart est tracé dans sa table, septième entrée.

## Prochaine étape

**LS-56**, l'achat sans compte et le rattachement des commandes invitées. C'est
la suite directe : la vérification d'adresse que LS-54 vient de rendre
fonctionnelle n'a d'utilité que là, et le parcours 6 attend ses trois conditions
cumulatives.

Ensuite **LS-57**, l'historique des commandes et l'accès aux factures, qui est le
motif principal de l'arbitrage du 28 juillet.

**LS-58, LS-61 et LS-77 restent bloquées** par LS-33 et le compte Mondial Relay :
la livraison constatée commande l'invitation à déposer un avis.

## État des tickets

LS-54 et LS-55 livrées. Comptes relevés dans Jira après les fusions, jamais de
mémoire, et repris dans le commentaire de clôture.
