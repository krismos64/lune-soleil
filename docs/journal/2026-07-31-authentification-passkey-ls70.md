# 31 juillet 2026, l'authentification, et deux tests verts pour la mauvaise raison

| Champ | Valeur |
|---|---|
| Ticket | LS-70 |
| Commits | `afbcbbf` le code, PR à ouvrir |
| Contrôles | 54 Vitest (37 avant, 17 ajoutés), 24 Playwright (12 avant, 12 ajoutés), types, lint, format, règles, config stricte, 92 contrôles de schéma, audit à zéro |
| Mutations | 9 injectées, **8 détectées d'emblée, 1 non détectée** |
| Nouveaux fichiers | 4 modèles Prisma, 1 migration, 7 modules `src/`, 2 fichiers de test |

Sixième page du 31 juillet. Better Auth entre dans le projet, et avec lui la
première route protégée.

## Trois questions posées avant de coder, trois réponses de Christophe

La zone est critique, autorisation. Les quinze questions de l'annexe C ont
révélé trois décisions non prises, tranchées avant la première ligne de code.

**Le champ `name` de Better Auth.** Il est requis dans son schéma cœur,
`name: z.string()`, et notre `Utilisateur` n'en avait pas. Retenu : colonne
`nom` **nullable** en base, mappée par `fields:`. Better Auth en écrit toujours
une, sa route d'inscription l'exige ; la rendre obligatoire imposerait une
valeur aux comptes créés par un autre chemin, sans rien à y mettre.

**Les mesures qui dépendent de l'email.** Trois des cinq mesures compensatoires
d'ADR-021 supposent un fournisseur qu'ADR-008 n'a pas tranché. Retenu : une
interface `EnvoyeurEmail` et une implémentation qui journalise sans envoyer.
`requireEmailVerification` reste désactivé, dette assumée et tracée, plutôt que
d'activer une vérification dont aucun message ne partirait : l'inscription
serait impossible.

**Le test négatif sur la mise à jour de profil.** Le ticket l'exige, aucune
Server Action de profil n'existait. Retenu : écrire `services/utilisateur.ts`
dans cette story. Sans lui, le test n'aurait rien à cibler et reproduirait le
code, l'erreur exacte de LS-50.

## La migration allait supprimer une contrainte sans la recréer

`prisma migrate dev` est interactif, donc impossible à scripter, et
`--create-only` l'est aussi dès qu'un avertissement apparaît. Le SQL a donc été
produit par `migrate diff`, puis écrit à la main. Il contenait trois `DROP INDEX` :

```
DROP INDEX journal_email_systeme_unique
DROP INDEX paiement_reussi_unique
DROP INDEX section_produit_ordre_unique
```

Les deux premiers sont la fausse dérive déjà connue, prédicat en `IN` que
PostgreSQL normalise en `= ANY (ARRAY[...])`. Ils étaient suivis de leur
recréation, donc inutiles mais inoffensifs.

**Le troisième n'avait pas de recréation.** `section_produit_ordre_unique` est
une contrainte `UNIQUE DEFERRABLE` créée par LS-67, forme que Prisma ne sait pas
exprimer : il la voit à supprimer et ne la reconstruit jamais. Appliquer le SQL
généré tel quel aurait retiré en silence la contrainte qui permet de permuter
deux rangs de sections, ADR-026, et rien n'aurait échoué avant qu'une
administratrice ne réordonne une fiche produit.

Vérification après migration : `unicite differable: t`, et les 92 contrôles de
schéma au vert, dont les sept qui exercent cette contrainte précise.

**Un outil qui génère du SQL propose ce qu'il comprend du schéma, pas ce que la
base contient.** Ce qu'il ne sait pas exprimer, il le lit comme à supprimer.

## Une deuxième dérive, réelle celle-là

Le diff résiduel après migration montrait
`ALTER COLUMN "mis_a_jour_a" DROP DEFAULT`. J'avais mis un `DEFAULT
CURRENT_TIMESTAMP` dans la migration, absent du schéma Prisma.

Le défaut n'est pas décoratif : sans lui, `NOT NULL` sans valeur par défaut
échoue sur une table peuplée. La table `utilisateur` est vide aujourd'hui, la
migration serait passée en local dans les deux cas. Une migration qui ne vaut
que pour une base vide n'est pas une migration.

`@default(now())` ajouté au schéma, la dérive a disparu.

## La mutation qui est restée verte

Neuf mutations injectées. Huit détectées immédiatement, dont les plus
importantes :

| Mutation | Détectée par |
|---|---|
| `input: false` retiré | le compte devient réellement `ADMINISTRATRICE` depuis un formulaire |
| `.strict()` retiré du schéma Zod | la tentative passe en silence, promesse résolue au lieu de rejeter |
| Vérification du rôle retirée d'`exigerAdministratrice` | le test « session valide, rôle client », et lui seul |
| Minimum abaissé à douze | les deux tests de longueur, dont celui qui vise l'alternative qu'ADR-023 écarte |
| `UNIQUE` dégradé en index sur `credential_id` | l'insertion de la credential partagée réussit |
| `CASCADE` retiré de `passkey` | violation de clé étrangère à la suppression du compte |
| Mapping `emailVerified` retiré | 11 tests |

**La neuvième est passée au vert.** Inverser le défaut de `normaliserRole` vers
`ADMINISTRATRICE` ne changeait rien aux quinze tests d'alors :

```ts
- return valeur === "ADMINISTRATRICE" ? "ADMINISTRATRICE" : "CLIENT";
+ return valeur === "CLIENT" ? "CLIENT" : "ADMINISTRATRICE";
```

Le comportement nominal est **identique dans les deux sens**. `CLIENT` sort
`CLIENT`, `ADMINISTRATRICE` sort `ADMINISTRATRICE`. Seule une valeur inattendue,
absente, nulle ou vide, sépare un défaut fermé d'un défaut ouvert, et aucune
session de test n'en portait.

C'est la règle E10, « un rôle absent ou inconnu ne donne aucun droit », et rien
ne la vérifiait. Test ajouté sur la fonction elle-même, avec les valeurs qu'une
session dégradée peut porter, dont `ADMINISTRATRICE,CLIENT` qui couvre en prime
le piège du plugin `admin()`. La mutation rougit maintenant.

**Troisième occurrence du même motif** après LS-68 et LS-50 : quand un défaut et
sa correction produisent le même état observable, seul un cas limite les sépare.
Ici le cas limite n'était traversé par aucun test.

## Un test de bout en bout verdissait sans rien exercer

Le test « un identifiant faux produit un message d'erreur » passait. La sortie du
serveur disait autre chose :

```
ERROR [Better Auth]: Invalid origin: http://127.0.0.1:3100
```

`BETTER_AUTH_URL` désignait le port 3000 quand Playwright sert sur 3100. Better
Auth dérive ses origines de confiance de `baseURL` et rejetait la requête en
protection CSRF, **avant toute vérification d'identifiant**. Le message d'erreur
s'affichait bien, pour une raison qui n'avait rien à voir avec le test.

Deux corrections. `playwright.config.ts` passe l'URL réellement servie, et le
test capture désormais la réponse du serveur : un refus d'identifiants rend
**401**, un refus d'origine rend **403**. Mutation vérifiée, remettre la mauvaise
URL fait échouer sur `Expected: 401, Received: 403`.

Sans cette assertion, la configuration pouvait redériver et le test rester vert.

## Better Auth ne lève pas sur un secret manquant

Le build affichait :

```
[Error [BetterAuthError]: You are using the default secret.]
```

Un message d'erreur, mais **la construction réussissait**. Better Auth retombe
sur un secret par défaut, publiquement lisible dans son dépôt, et se contente
d'avertir. Une production où la variable a été oubliée signerait ses cookies de
session avec cette clé : forger une session d'administration deviendrait
trivial, sans le moindre symptôme.

`src/lib/auth.ts` lève désormais à l'évaluation du module. Garde-fou prouvé dans
les deux sens, ce qu'un garde-fou jamais exercé ne vaut pas :

```
=== 1. SANS secret ===
RESULTAT: BLOQUE : BETTER_AUTH_SECRET absente.
=== 2. AVEC secret ===
RESULTAT: DEMARRE
```

**Un avertissement que rien ne lit n'est pas un garde-fou.**

## Deux choix de conception plus stricts que la bibliothèque

**`passkey.credential_id` porte un `UNIQUE`.** Le schéma de référence du plugin
n'y met qu'un index ordinaire. Une credential WebAuthn est unique par
construction, mais rien en base ne l'imposait : deux comptes pouvaient porter la
même, et la recherche par credential à la connexion aurait eu deux comptes à
départager. C'est le risque d'accès croisé nommé par ADR-021.

**Aucun middleware.** Un middleware Next.js s'exécute sur la périphérie et ne
peut pas relire la session en base : il verrait la présence d'un cookie, ni sa
validité ni le rôle. La protection vit dans le composant serveur, qui appelle
`exigerAdministratrice` avant tout rendu.

## Ce qui reste hors de cette story

**La passkey n'est pas exercée de bout en bout.** WebAuthn exige un
authentificateur matériel ou un virtuel piloté par le navigateur. Ce qui est
testé est ce qui protège la base, l'unicité de la credential et la cascade. La
négociation elle-même relève de la recette avec l'exploitante, ADR-021 imposant
de toute façon un enregistrement sur ses propres appareils.

**Aucun email ne part.** ADR-008 n'a pas tranché le fournisseur. Trois mesures
d'ADR-021 et ADR-023 en dépendent : alerte de connexion, réinitialisation,
vérification d'adresse. Le point d'extension existe, l'implémentation viendra
avec l'epic email.

**Trois mesures compensatoires d'ADR-021 restent à porter** : limitation de débit
par identifiant de compte, journal des connexions, session courte avec
réauthentification sur action sensible. Aucune n'était dans les critères
d'acceptation de LS-70.

## Prochaine étape

**LS-71**, socle de validation Zod, qui doit aussi remplacer la garde locale sur
la quantité dans `services/reservation.ts`. L'ordre des stories restantes de
LS-2 est libre.

## État des tickets

| Ticket | État |
|---|---|
| LS-70 | **Terminé**, neuf critères vérifiés |
| LS-50, LS-65 à LS-69, LS-78 | **Terminés**, pages précédentes |
| LS-71 à LS-75 | À faire, ordre libre |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
