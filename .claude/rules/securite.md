---
paths:
  - "src/lib/**/*.ts"
  - "src/integrations/email/**/*.ts"
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

**Ce module n'est pas un journal métier.** `JournalAudit`, `JournalEmail` et le
journal de connexions d'ADR-027 sont persistés, conservés six mois et opposables.
Celui-ci vit en sortie standard et se perd au redémarrage du conteneur : y écrire
une trace métier la ferait disparaître.

## Email, l'échec ne s'absorbe pas ici

`integrations/email/` isole le fournisseur derrière `EnvoyeurEmail`. ADR-008
retient le SMTP OVH ; le reste du code ne connaît que l'interface.

**Ce module signale l'échec, il ne décide pas de ses conséquences.** La règle E4
pose qu'un échec d'email ne bloque jamais une commande, et cette décision
appartient à `services/`, qui attrape `FournisseurEmailIndisponibleError`.

**Une trace d'envoi dit « accepté par le serveur », jamais « reçu ».** Ne pas
écrire l'inverse dans un statut ni dans une interface.

**L'idempotence d'envoi n'est pas acquise**, dette ouverte de LS-51 : un index
protège la base contre un doublon de ligne, il n'empêche pas un second appel au
fournisseur. Ne pas supposer qu'un renvoi est inoffensif.

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
