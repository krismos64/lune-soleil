# 2 septembre 2026, session J : LS-60, le profil client

Changer son nom, son adresse email, son mot de passe. Aucune migration.

Le fil de la session : **la revue critique a trouvé une prise de contrôle
complète de compte, atteignable sur l'état par défaut des comptes, et mon propre
test la validait comme un comportement correct.**

## Le défaut le plus grave de la journée

Better Auth choisit son chemin sur `session.user.emailVerified`. Quand l'adresse
actuelle **n'est pas vérifiée**, l'approbation sur l'ancienne adresse disparaît
et un jeton part directement à la nouvelle.

Or `requireEmailVerification` vaut `false` par arbitrage du 2 septembre : un
compte non vérifié est l'état **normal** de ce projet, un client peut naviguer
et commander sans jamais cliquer son lien.

L'enchaînement, mesuré de bout en bout :

1. un client s'inscrit et ne clique jamais le lien
2. un intrus obtient sa session, poste partagé ou cookie volé, **sans le mot de
   passe**
3. il demande le changement vers son adresse. **Un seul message part, vers lui.**
   La victime ne reçoit rien
4. il clique son propre lien

```
UTILISATEURS: [{ email: 'attaquant@exemple.fr', email_verifie: true }]
la victime se reconnecte : NON, « Invalid email or password »
reinitialisation demandee : aucun message, « User not found »
```

La victime perd **la connexion et le « mot de passe oublié »**, son adresse
n'existant plus en base. L'intrus récupère en prime `emailVerifie: true`, donc le
rattachement des commandes invitées de cette adresse.

### Mon test documentait le trou au lieu de le fermer

J'avais écrit un test intitulé « sur un compte NON vérifié, le lien part à la
nouvelle adresse ». Il mesurait exactement le trou et en faisait une propriété.

C'est le piège le plus coûteux de la journée : un test qui passe et qui protège
un défaut est pire qu'un test absent, parce qu'il décourage de regarder.

La correction refuse le changement tant que l'adresse actuelle n'est pas
vérifiée. Ce choix est cohérent avec le reste du projet, `emailVerifie` fondant
déjà l'accès au rattachement : l'écran de vérification, jusqu'ici purement
incitatif, devient le prérequis d'un geste sensible.

## Une garantie perdue en changeant de chemin

`revokeOtherSessions` fait partie du **corps** de la requête `/change-password` :
le serveur se contente de le lire.

Tant que le changement passait par une Server Action, le service posait `true`
hors de portée du client. Depuis que l'écran appelle `authClient.changePassword`,
c'est devenu un champ que l'appelant choisit. Un intrus détenant session et mot
de passe pouvait changer le mot de passe en **conservant** la session du
propriétaire ouverte.

Trois commentaires affirmaient pourtant que la garantie tenait.

Fermé par un hook `before` qui écrase la valeur, là où aucun appelant ne
l'atteint.

## Changer son mot de passe déconnectait

Trouvé par le test de bout en bout, jamais par les tests d'intégration : ces
derniers passent les en-têtes à la main, donc ne perdent jamais ce qu'un
navigateur aurait perdu.

```
cookie initial   better-auth.session_token=<valeur A>
apres l'appel    better-auth.session_token=<valeur B, differente>
ancien cookie    -> session INVALIDE
url apres clic   -> /compte/connexion
```

Deux tentatives ont échoué avant la bonne :

| Tentative | Ce qui se passait |
|---|---|
| jeter le `set-cookie` | le client repart avec un cookie mort |
| le poser en Server Action | poser un cookie **déclenche un re-rendu serveur**, qui s'exécute avec l'ancien cookie |

Le second point est documenté chez Next.js et je l'ai vérifié via Context7. La
correction passe par le **client** Better Auth, qui pose le cookie par une
réponse HTTP ordinaire.

Effet de bord heureux : le chemin client passe par `auth.handler`, donc **est**
soumis à la limitation de débit, contrairement à `auth.api.*`.

## Quatre comportements de Better Auth mesurés, tous supposés faux d'abord

| Ce que je supposais | Ce que la mesure dit |
|---|---|
| `changeEmail` a son propre rappel d'email | il **réutilise** celui de l'inscription |
| `requete.url` distingue les deux origines | `requete` vaut `undefined` |
| `user.email` porte l'ancienne adresse | il porte **déjà la nouvelle** |
| une adresse mal formée lève un `APIError` | c'est un `Error` **nu** |

Le seul discriminant fiable pour le premier point est le **jeton**, qui porte
`requestType: "change-email-verification"`.

Le dernier faisait annoncer une **panne de la boutique** à qui saisit une adresse
mal formée, et écrivait une ligne `error` au journal à chaque faute de frappe.

## Le lien de vérification vaut connexion

Mesuré par la revue : le lien cliqué **sans aucun cookie** crée une session
complète, et le jeton **se rejoue**, la table `verification` restant vide.

```
sessions AVANT le clic : 2
sessions APRES         : 3
rejeu du meme lien     : 4
```

Cela contredit la décision voisine sur `autoSignInAfterVerification`, qui refuse
d'ouvrir une session depuis un canal qu'un accès à la boîte compromet : le
drapeau est bien à `false`, et une autre branche ouvre la session quand même.

La fenêtre passe de soixante à **quinze minutes**, ce qui la borne sans la
fermer. Le comportement vient de la bibliothèque : **LS-167** le porte.

## Ce que la revue frontend a trouvé

Huit défauts, dont un message Zod brut en anglais avec un double deux-points
affiché au client, l'absence de `catch` sur le chemin client qui laissait le
bouton bloqué à la moindre coupure, et `PASSWORD_TOO_LONG` affichant « au moins
16 caractères », soit l'inverse du geste attendu.

Elle a aussi mesuré que mes deux `revalidatePath` ne changeaient **rien** à
l'écran : l'en-tête n'affiche pas le nom, et `defaultValue` est ignoré par React
sur un input déjà monté.

**Aucune cinquième région live détruite**, vérifié : React réconcilie le
composant à la même position.

## Un écart assumé avec le ticket

Le critère 1 demande « nom, adresse email, mot de passe, **téléphone** ».
`Utilisateur` ne porte pas de téléphone : le modèle conceptuel le place sur
`Commande` et sur `AdresseCarnet`, là où il sert, une livraison.

L'ajouter modifierait le modèle sans arbitrage, ce que les interdits du projet
refusent. L'écart est signalé dans le ticket.

## Vérifications

```
npm run type-check                                  OK
npm run lint                                        OK
npm run format:check                                All matched files use Prettier code style!
npm run build                                       route /compte/profil
npm run test                                        1016 passed, 65 fichiers
npx playwright test compte-profil                   26 passed, trois largeurs
./scripts/verifier-contraste.sh                     OK
./scripts/verifier-regles.sh                        OK
./scripts/verifier-actions-sensibles.sh             OK
./scripts/verifier-loading-et-404.sh                OK
```

**Six mutations, six détectées :**

| Mutation | Test qui rougit |
|---|---|
| garde de vérification retirée | la prise de contrôle rouvre |
| hook de révocation retiré | l'intrus garde la session ouverte |
| `instanceof APIError` remis | la faute de frappe redevient une panne |
| `revokeOtherSessions` à false | l'intrus survit au changement |
| modèle d'inscription forcé | le texte parle de création de compte |
| `sendChangeEmailConfirmation` retiré | l'ancienne adresse n'est plus avertie |

## Ce qui reste

**Une dette ticketée**, LS-167 : le lien de vérification ouvre une session et se
rejoue. La fenêtre est bornée à quinze minutes, le comportement demande un
arbitrage.

Un point signalé par la revue frontend, non corrigé : le focus posé sur une
région live n'a **aucun indicateur visuel**, Chrome ne faisant pas correspondre
`:focus-visible` sur un focus programmatique. Le comportement est le même sur
tous les écrans du projet, donc c'est une question à trancher globalement.

## Prochaine étape

**LS-164**, la réauthentification client, qui débloque **LS-62**, les droits
RGPD. Les deux ferment l'epic LS-36 avec LS-58, LS-61 et LS-77, elles-mêmes
bloquées par LS-33 et le compte Mondial Relay.

## État des tickets

LS-60 livrée, PR à ouvrir. LS-56, LS-57 et LS-59 fusionnées et closes plus tôt.
LS-167 créée, rattachée à LS-36.
