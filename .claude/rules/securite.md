---
paths:
  - "src/lib/**/*.ts"
  - "src/integrations/email/**/*.ts"
  - "src/integrations/medias/**/*.ts"
  - "src/services/autorisation.ts"
  - "src/services/reauthentification.ts"
  - "src/services/journal-connexion.ts"
  - "src/app/api/auth/**/*.ts"
  - "src/app/api/interne/**/*.ts"
---

# Socle technique, authentification et secrets

Ces chemins portent l'infrastructure transverse : authentification, validation
d'entrée, journalisation, accès à la base et envoi d'email. Aucune règle de
gestion ne vit ici, mais **trois invariants s'y appliquent** et chacun a déjà été
franchi au moins une fois dans ce projet.

| Invariant | Ce qu'il exige | Fichiers concernés |
|---|---|---|
| 2, autorisation | l'identité vient de la session ou d'un jeton signé | `auth.ts` |
| 7, validation | toute entrée non fiable validée côté serveur avec Zod | `validation.ts` |
| 9, secrets | jamais journalisés, jamais commités, le dépôt est public | tous |

Vérifier la documentation de Better Auth 1.6 et de Zod 4 via Context7 avant
d'utiliser une API : ces versions sont plus récentes que la connaissance du
modèle, et deux défauts de LS-70 venaient d'une API supposée.

## Better Auth ne lève pas, il retombe

C'est le mode d'échec dominant de cette bibliothèque : une variable manquante ne
produit pas d'erreur, elle produit un repli silencieux qui a l'air de marcher.

**`BETTER_AUTH_SECRET` absente, Better Auth signe avec un secret par défaut
public** et se contente d'un avertissement dans la sortie de construction.
Forger une session d'administration deviendrait trivial. `auth.ts` lève donc à
l'évaluation du module, sauf pendant `next build`.

**Un repli d'URL retire `Secure` du cookie.** Better Auth décide de cet attribut
par `baseURL ? baseURL.startsWith("https://") : isProduction`. Un
`?? "http://localhost:3000"` d'apparence inoffensive rend `baseURL` toujours
définie, la branche `isProduction` devient inatteignable, et la décision se prend
sur une URL en `http`. Mesuré en LS-70 : `Secure=NON` en `NODE_ENV=production`.
La protection est donc posée sur `useSecureCookies`, explicitement, là où elle
agit.

**`rateLimit.enabled` doit être forcé à `true`.** Better Auth désactive la
limitation de débit hors production par défaut : un réglage faux ne se verrait
qu'en production. `storage: "database"` est l'autre point non négociable, un
compteur en mémoire disparaissant à chaque redémarrage.

**`auth.api.*` n'est jamais soumis à la limitation de débit**, seul
`auth.handler` avec une vraie `Request` l'est. Un test qui appelle `auth.api`
pour vérifier un plafond passe au vert sans rien avoir exercé, six cas en LS-79.

## Construire n'est pas servir

`next build` évalue les modules avec `NODE_ENV=production` pour collecter les
données de page, sans jamais signer de cookie ni servir de requête. Un garde-fou
qui lève sur l'absence d'une variable d'exécution fait donc échouer la
**construction**, étape sans risque, et pousse à mettre une valeur factice en
intégration continue, ce qui apprend à ne plus lire l'alerte.

`NEXT_PHASE` vaut `phase-production-build` pendant cette étape et rien du tout
quand le serveur tourne : c'est le seul signal qui distingue les deux.

## Ce que la validation ne fait pas

`validation.ts` porte les schémas Zod partagés, `valider` et
`EntreeInvalideError`. Trois limites à tenir :

- **elle n'autorise rien.** Un identifiant conforme prouve sa forme, jamais le
  droit d'y accéder, invariant 2
- **elle ne remplace aucune contrainte de base.** Les `CHECK` restent la ligne de
  défense ; la validation améliore la qualité du refus
- **elle ne convertit rien en silence.** Aucun `z.coerce` : coercer `"19.99"`
  réintroduirait le décimal que l'invariant 1 refuse

La validation s'appelle **dans l'adaptateur ET au point d'entrée du cas
d'usage**. Ce n'est pas une redondance : un service reste appelable depuis un
autre service ou une tâche planifiée, chemins par lesquels aucun adaptateur ne
passe.

**Une erreur de validation ne porte jamais la valeur refusée**, invariant 9 : une
entrée invalide peut être un mot de passe collé dans le mauvais champ. Zod ne
fuit pas les valeurs mais **les noms de clés** : `unrecognized_keys` porte les
noms choisis par l'appelant, à ne pas recopier tels quels dans un message.

## Journaliser sans fuiter

`journal.ts` masque les valeurs dont **la clé** est reconnue sensible. Le
masquage porte sur les clés et non sur les valeurs : reconnaître un secret à sa
forme est perdu d'avance, un mot de passe ressemble à n'importe quelle chaîne.

**Ne jamais appeler `console.*` dans le code applicatif.** Un appel direct
échappe entièrement au masquage, et c'est par là qu'une adresse email finit en
clair dans le journal d'un dépôt public : le cas s'est produit en LS-73, sur
l'envoyeur d'email d'attente.

```ts
import { journaliser, journaliserErreur } from "@/lib/journal";
```

Le contexte n'accepte ni `unknown` ni objet imbriqué, volontairement : une forme
libre laisserait passer `{ client: utilisateur }` d'un geste, et l'objet entier
partirait sérialisé avec son adresse.

**Ce module n'est pas un journal métier.** `JournalAudit`, `JournalEmail` et
`JournalConnexion` sont persistés, conservés six mois et opposables. Celui-ci vit
en sortie standard et se perd au redémarrage du conteneur : y écrire une trace
métier la ferait disparaître.

## Journal des connexions, LS-80

`services/journal-connexion.ts` écrit une ligne par tentative, réussie comme
échouée, sur les comptes d'administration comme clients, règle E13. Cinq points
se perdent facilement, et chacun a été franchi une fois.

**Aucun mot de passe n'entre dans cette table, par aucun champ.** Le hook ne lit
jamais `ctx.body.password`, que Better Auth expose pourtant en clair. Le champ
`emailTente` est l'autre porte : une saisie sans arobase y est remplacée par un
marqueur, parce qu'un mot de passe collé dans le mauvais champ y arrivait sinon
en clair. Invariant 9, critère 2 de LS-80.

**L'écriture ne fait jamais échouer une connexion**, règle E15.
`enregistrerTentativeConnexion` avale ses erreurs et les envoie au journal
technique. Ne pas « améliorer » cela en propageant l'exception : une base en
souffrance fermerait la porte à l'exploitante au pire moment.

**Le chemin de la passkey est `/passkey/verify-authentication`**, jamais
`/sign-in/passkey`, qui n'existe pas. Le nom évident est faux, et l'erreur est
silencieuse : le hook sort sans rien écrire, sur le moyen de connexion principal
de l'administration.

**Une tentative refusée par la limitation de débit n'atteint aucun hook.** Better
Auth rend le 429 dans `onRequest` et `better-call` sort alors sans appeler
l'endpoint, les hooks `after`, ni `onResponse`. Ces lignes sont écrites depuis
l'adaptateur de route `api/auth/[...all]`, seul endroit en aval qui les voit, avec
l'issue `REFUSEE_LIMITATION`. Le volume refusé est le signal d'une attaque, pas du
bruit.

**Six mois de conservation, délibération CNIL n° 2021-122 du 14 octobre 2021
point 8**, règle E14. La purge existe avec la table. `limiteDeConservation` borne
le quantième à la main : `setUTCMonth` seul déborde, le 31 août moins six mois
donnant le 3 mars, ce qui supprimait des lignes trop tôt.

## Email, l'échec ne s'absorbe pas ici

`integrations/email/` isole le fournisseur derrière `EnvoyeurEmail`. ADR-008
retient le SMTP OVH ; le reste du code ne connaît que l'interface.

**Ce module signale l'échec, il ne décide pas de ses conséquences.** La règle E4
pose qu'un échec d'email ne bloque jamais une commande, et cette décision
appartient à `services/`, qui attrape `FournisseurEmailIndisponibleError`.

**Une trace d'envoi dit « accepté par le serveur », jamais « reçu ».** Ne pas
écrire l'inverse dans un statut ni dans une interface.

**L'idempotence d'envoi passe par l'outbox**, ADR-033, décidé en LS-51 et livré
par LS-82 : un index protège la base contre un doublon de ligne, il n'empêche pas
un second appel au fournisseur. `envoi_en_attente` ferme cette fenêtre en
marquant la ligne avant l'appel.

**Ne jamais appeler l'envoyeur directement depuis un service métier.** Ce qui
découle d'une transaction passe par `deposerEnvoi`, dans cette transaction ; ce
qu'une personne attend à l'écran passe par `envoyerDirect`. Un appel direct
depuis un chemin transactionnel rouvre le doublon qu'ADR-033 ferme.

**Le classement des erreurs décide de la retentative, pas l'appelant.**
`EAUTH` et `ENOAUTH` sont définitives : retenter sur un mot de passe faux épuise
le quota de 200 messages par heure de l'offre MX Plan et fait tomber les envois
légitimes avec lui.

**Aucune réponse brute du serveur n'entre en base ni au journal.** Un refus SMTP
transporte parfois l'identifiant de connexion dans son texte : seul le code est
conservé, invariant 9.

## Prisma, une seule instance

Ne jamais instancier `PrismaClient` ailleurs que dans `prisma.ts`. Le client
exige un adaptateur de pilote depuis Prisma 7, et l'instance est mise en cache
pour survivre au rechargement à chaud : une seconde instanciation ouvrirait un
pool concurrent que la base finirait par refuser.

```ts
import { prisma } from "@/lib/prisma";
```

`vi.resetModules()` ne vide pas ce cache, porté par `globalThis` : un test qui
compte sur un module neuf obtient l'ancienne instance et peut passer pour la
mauvaise raison.

## Réauthentification avant action sensible

Une session ouverte prouve qu'on s'est connecté un jour, pas que la personne
devant l'écran est l'exploitante maintenant. Quatre familles d'actions, ADR-027
décision 3, exigent une preuve d'identité récente : `IDENTIFIANTS`,
`DONNEES_CLIENTS`, `REMBOURSEMENT`, `PARAMETRES_BOUTIQUE`.

**Toute action de ces familles porte la marque `@sensible FAMILLE` et appelle
`exigerReauthentificationRecente`.** `scripts/verifier-actions-sensibles.sh` le
vérifie dans les deux sens et échoue sinon. Ne pas contourner la marque : c'est
elle qui rend la liste mesurable plutôt qu'opinion.

**Ne pas employer `freshAge` de Better Auth pour cela.** Son middleware compare
`session.createdAt` et jamais `updatedAt`, vérifié via Context7 : seule une
reconnexion complète y remet le compteur à zéro. Une exploitante connectée depuis
vingt-cinq heures serait bloquée sans qu'aucun geste ne la débloque. Le projet
porte son propre horodatage, `Session.reauthentifieeLe`, nullable et sans valeur
par défaut, une session qui n'a rien prouvé n'ouvrant aucune action sensible.

**`enregistrerPreuveIdentite` ne vérifie rien**, elle enregistre un fait déjà
établi. Son appelant doit avoir validé la passkey ou le mot de passe juste avant.
L'appeler sans vérification préalable revient à se déclarer réauthentifié
soi-même, et aucun contrôle automatique ne détecte cela.

**Depuis LS-89, un seul module l'appelle** : `services/preuve-identite.ts`. C'est
ce qui rend la relecture humaine tenable, il n'y a qu'un endroit à relire. Ne pas
l'appeler ailleurs ; une nouvelle façon de prouver son identité s'ajoute dans ce
module, à côté des deux existantes.

Les deux chemins livrés vérifient chacun quelque chose avant d'écrire :

- **mot de passe** : `auth.api.verifyPassword`, qui lève sur un mot de passe
  faux. L'enregistrement est donc inatteignable sans preuve, et rien ne s'exécute
  entre les deux instructions
- **passkey** : la négociation WebAuthn se termine chez Better Auth, qui crée une
  session **neuve**. Le serveur ne peut ni la rejouer ni vérifier l'assertion une
  seconde fois ; il constate qu'une session vient d'être ouverte, fenêtre d'une
  minute, âge négatif refusé. **Cette condition n'atteste pas le moyen** : une
  connexion par mot de passe produit une session tout aussi neuve. Ce qu'elle
  ferme est l'appel depuis une session ouverte de longue date, et les deux
  chemins accordant la même chose, il n'y a rien à gagner à emprunter celui-ci

**Les deux gardes vont ensemble sur cet écran, et LS-89 a tranché** la question
que cette règle laissait ouverte : la page **et** les deux Server Actions
appellent `exigerAdministratrice`. Protéger la page seule laisserait le chemin
ouvert, une Server Action étant invocable directement. Sans cela, un client
inscrit sur la boutique fabriquait une preuve d'identité avec son propre mot de
passe, `verifyPassword` vérifiant contre `session.user.id`.

**Le chemin de la passkey est `/passkey/verify-authentication`**, jamais
`/sign-in/passkey` qui n'existe pas, voir la section du journal des connexions.

### Le contrôle ne voit pas une marque manquante

`verifier-actions-sensibles.sh` confronte les marques `@sensible` aux gardes dans
les deux sens : il prouve leur **cohérence**. Il ne peut pas dire qu'un écran
aurait dû être marqué. Un écran sensible que personne n'a marqué est invisible
des deux côtés : le contrôle reste vert, et `.claude/familles-sans-action.txt`
continue d'affirmer qu'il n'existe rien à protéger.

Le cas s'est produit entre LS-80 et le 13 août 2026. La ligne `DONNEES_CLIENTS`
disait « aucun export ni consultation en masse » alors que l'écran du journal des
connexions affichait déjà cinquante lignes d'adresses email, d'adresses IP et
d'agents utilisateur de clients. Personne n'avait relu ce fichier après LS-80.

**Relire `.claude/familles-sans-action.txt` à chaque story qui ajoute un écran
d'administration ou une Server Action**, et se demander si la ligne est encore
vraie. Aucun script ne pose cette question à la place de quelqu'un.

Cet écran reste **non classé**, arbitrage de Christophe du 13 août 2026 : la
finalité de T8 est la sécurité et non le fichier client, que vise ADR-021, et
« en masse » y serait étiré sur cinquante lignes sans recherche ni export.
Élargir la définition d'une famille pour fermer une dette déplacerait la règle
au lieu de la satisfaire. La première action sensible réelle naîtra de LS-95.

**Les deux gardes vont ensemble sous `administration/`, et le sens 4 du contrôle
le vérifie depuis LS-89.** `exigerReauthentificationRecente` répond à « l'identité
est-elle récente », `exigerAdministratrice` à « qui agit ». Une action
d'administration qui n'appelle que la première laisse un client authentifié
franchir la garde de fraîcheur avec son propre mot de passe : le défaut s'est
produit sur l'écran de réauthentification lui-même.

**Toute Server Action sous `administration/` exige `exigerAdministratrice`, et
le sens 6 le vérifie depuis LS-99.** Distinct du sens 4, qui n'examine que les
fichiers touchant à la réauthentification : une Server Action d'administration
qui ne l'appelle pas sortait de sa boucle, donc une garde de rôle manquante y
était invisible des deux côtés.

Une Server Action est un **point d'entrée HTTP**, invocable sans jamais charger
la page qui la porte : protéger la page seule ne la couvre pas. L'ancrage est le
marqueur `"use server"` et non le nom du fichier, qu'un renommage suffirait à
contourner, et l'appel indirect par une fonction locale gardée est accepté pour
ne pas pousser à recopier la garde cinq fois.

**Ce sens vérifie le corps de chaque fonction, jamais le fichier entier.** Sa
première version cherchait la garde n'importe où et ne prouvait rien : retirer
celle d'une seule action la laissait verte, ses voisines satisfaisant le motif à
sa place. Même défaut que le sens 1 avait dû corriger, et seule la mutation l'a
montré. Cas 10 de `verifier-actions-sensibles-mutation.sh`.

**La portée s'arrête à `administration/`, et ce n'est pas une approximation.**
Exiger le couple partout serait faux : `supprimerMonCompte` est une action
sensible de l'**espace client**, famille `IDENTIFIANTS`, et elle doit
précisément ne pas exiger le rôle administratrice. Une personne supprime son
propre compte, article 17. Un contrôle plus large aurait poussé à lui ajouter une
garde de rôle interdisant l'effacement à tous les clients, c'est-à-dire à créer
un vrai défaut pour satisfaire une règle mal cadrée.

**Le contrôle textuel ne remplace pas un test, et réciproquement.** Il prouve que
l'appel figure dans le corps de la fonction marquée, propriété du fichier ; il ne
dit rien de l'exécution. Une garde placée **après** l'effet le satisfait mot pour
mot en laissant le compte partir. Mesuré le 13 août 2026 : la garde retirée de
`supprimerMonCompte`, les neuf tests de suppression restaient verts. Les cas 57
et 58 de `verifier-tests-mutation.sh` ferment les deux formes.

**La durée de session est d'un jour, `updateAge` d'une heure.** Ce second nombre
n'est pas un détail de confort : Better Auth étrangle la prolongation, qui ne se
déclenche qu'à partir de `expiresAt - expiresIn + updateAge`. Un `updateAge` égal
à `expiresIn` ne prolongerait qu'à l'instant de l'expiration, déconnectant
l'exploitante en pleine tâche.

## Routes internes et secret partagé, LS-72

Les routes de tâches planifiées ne sont derrière aucune session : le conteneur
cron n'a pas de compte. Le seul chose qui distingue un appel légitime d'un appel
arbitraire est `CRON_SHARED_SECRET`, vérifié côté serveur. **Un appel qui se
présente comme le cron n'est pas le cron**, invariant 2.

**La comparaison est à temps constant**, `timingSafeEqual`. Un `===` s'arrête au
premier caractère différent : le temps de réponse dépend du nombre de caractères
corrects en tête, et un attaquant qui le mesure reconstitue le secret caractère
par caractère.

**Défaut fermé : secret non configuré vaut refus de tous**, y compris du cron.
Une tâche qui ne tourne pas se remarque ; une route interne ouverte à tous ne se
remarque pas. Ne jamais inverser en « pas de secret donc on laisse passer », qui
marche parfaitement en développement et publie deux routes le jour du
déploiement.

**Le refus rend 404 et non 401**, sans en-tête `WWW-Authenticate` : une route
interne ne confirme pas son existence à qui ne prouve rien. Tâche connue et tâche
inconnue rendent la même réponse, sans quoi le code publierait la liste des
tâches internes.

**Le nom de tâche vient de l'URL, donc il n'autorise rien** : il n'est accepté
qu'après validation contre la table `TACHES`. Sans ce filtre, un appelant muni du
secret créerait un verrou portant le nom de son choix, que rien ne relâcherait.

**Le préfixe `/api/interne/` ne protège rien**, il se lit. C'est le secret qui
protège.

## Traitement des photographies, LS-102 et ADR-007

**La suppression des métadonnées EXIF est une exigence de sécurité, pas une
optimisation.** Une photographie prise au smartphone porte la position GPS du
lieu de prise de vue, c'est-à-dire le domicile de l'exploitante. `PARCOURS.md` :
« Aucune image n'est jamais servie publiquement sans traitement. C'est un
blocage, pas un avertissement. »

**Cette protection ne se voit dans aucune ligne de code**, et c'est le risque
principal nommé par ADR-007. sharp retire l'EXIF **par défaut**, mesuré :

```
sortie par défaut  ->  aucun EXIF
avec keepExif()    ->  les octets d'origine sont conservés
```

**Ne jamais appeler `keepExif()` sur le chemin de traitement**, y compris pour
conserver un profil colorimétrique ou une orientation. La rotation se fait avant
l'encodage, par `rotate()`, précisément parce que la consigne d'orientation
disparaît avec le reste des métadonnées.

Une photographie retouchée n'est pas exemptée : les applications de retouche
**conservent** souvent l'EXIF d'origine et en ajoutent (logiciel, auteur).
Aucun raccourci du type « si pas de GPS, publier l'original ».

**Les coordonnées GPS sont encodées en rationnels binaires**, donc introuvables
par une recherche textuelle dans le fichier. Un test qui chercherait une latitude
en clair ne prouverait rien : la preuve porte sur l'absence du bloc EXIF entier.

**SVG et PDF sont refusés sur la signature du fichier, avant tout décodage.**
libvips sait les lire, ce qui suffirait à les faire passer ; ce ne sont pas des
photographies, et ce sont les deux formats d'entrée les plus complexes qu'il
expose. L'override de `package.json` corrige quatre CVE de libvips : ne pas lui
donner un document à analyser. Le refus ne porte ni sur l'extension ni sur le
type MIME annoncé, que l'appelant peut mentir.

**Un média non traité n'est pas à un endroit servable.** Le volume porte deux
dossiers, `quarantaine/` et `public/`, et le déplacement de l'un à l'autre est le
seul geste qui publie. C8 est ainsi une propriété physique : ADR-007 a écarté le
filtre applicatif parce que ce projet a déjà oublié trois fois un champ d'état
dans une condition d'accès.

**Tout segment de chemin est validé par une liste d'autorisés.** Un identifiant
ou un nom de déclinaison qui porterait `..` ou un séparateur ferait écrire hors
du volume. Énumérer les formes de traversée revient toujours à en oublier une.

## Ce qui ne se change pas sans ADR

**Seize caractères de mot de passe, pour tous les comptes.** ADR-023 examine
nommément l'alternative « douze en global, seize vérifiés applicativement pour
l'administration » et l'écarte. C'est une option globale de Better Auth, la même
valeur pour les deux populations. Abaisser cette valeur dégrade F-ACC-01, un Must
sur le jalon Go-Live.

**Le plugin `admin()` de Better Auth reste absent.** Il stocke les rôles en
chaîne séparée par des virgules : une valeur `CLIENT,ADMINISTRATRICE` ne serait
pas égale à `ADMINISTRATRICE`, l'index partiel `utilisateur_administratrice_unique`
ne la verrait pas, et un second compte d'administration entrerait sans erreur.

**`role` porte `input: false`, règle E11**, ce qui empêche de le poser depuis le
corps d'une requête. Cela ne couvre que les routes de Better Auth : toute autre
écriture sur `Utilisateur` y échappe, et c'est pourquoi `services/utilisateur.ts`
refait le filtrage de son côté.

**`mot-de-passe.ts` n'importe rien et ne doit jamais le faire.** Ces constantes
sont lues par un composant client ; les servir depuis `auth.ts` ferait entrer
dans le paquet du navigateur le client Prisma et la lecture de
`BETTER_AUTH_SECRET`.
