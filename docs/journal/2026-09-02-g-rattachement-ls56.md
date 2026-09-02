# 2 septembre 2026, session G : LS-56, le rattachement des commandes invitées

Un client commande sans compte, s'inscrit plus tard avec la même adresse, et
retrouve ses commandes. C'est le parcours 6, et c'est ce que la vérification
d'adresse livrée hier par LS-54 servait à préparer.

Le fil de la session tient en une phrase : **le code que j'ai écrit était juste,
et les deux revues ont trouvé neuf défauts que mes 19 tests verts ne voyaient
pas.** Dont une faille de sécurité réelle, reproduite 10 fois sur 10, que mon
propre travail rendait atteignable.

## Ce que le schéma portait déjà

Aucune migration. `Commande.utilisateurId` est nullable depuis la migration
initiale, `dissocieA` existe depuis LS-41, `emailNormalise` porte son index, et
`JournalAudit` attendait un second appelant.

La story portait donc le **chemin** qui atteint ces colonnes, rien d'autre.

## Les trois conditions, et celle qui se perd

Le ticket les énonce, et aucune n'est dérivable des autres :

| Condition | Où elle vit |
|---|---|
| l'adresse du compte est vérifiée | le service |
| `utilisateurId` est nul | le `where` du repository |
| `dissocieA` est nul | le `where` du repository |

**La troisième est celle qui se perd**, et le piège est mécanique : `ON DELETE
SET NULL` remet `utilisateurId` à nul quand un compte est supprimé. Une commande
dissociée satisfait donc **déjà** les deux autres. La retirer laisse tous les
autres tests verts, ce que la mutation a confirmé.

« Jamais rattachée » est strictement plus fort que « sans propriétaire ».

## Deux déclencheurs, et le second n'est pas un doublon

Christophe avait tranché avant de partir, et l'arbitrage s'est révélé juste pour
une raison que je n'avais pas anticipée.

- `afterEmailVerification` donne l'effet **immédiat** : le client revient de sa
  boîte, ses commandes sont là
- `databaseHooks.session.create.after` **rejoue à chaque connexion**, et
  rattrape les commandes passées *après* la vérification

Le second cas est réel : rien n'oblige un client vérifié à être connecté quand il
commande. Un déclenchement unique aurait laissé ces commandes orphelines pour
toujours, sans qu'aucun écran ne le signale.

Les deux points d'accroche ont été vérifiés **via Context7** sur Better Auth
1.6.23.

## Le premier défaut, trouvé en lisant ma propre sortie de test

`masquerContexte` compare les noms de clés **par inclusion**, ce qui est juste :
c'est ce qui lui fait attraper `emailClient` et `adresseLivraison`.

L'effet de bord est qu'une clé anodine peut contenir un fragment interdit.
`nombre` contient « nom », `declencheur` contient « cle » : ma ligne de journal
sortait avec ses **deux** valeurs en `[masque]`.

```
"message":"Commandes rattachees a un compte","nombre":"[masque]","declencheur":"[masque]"
```

Elle existait sans rien apprendre, et **rien ne le signalait** : le journal ne
lève pas, il masque. Les clés sont renommées `total` et `origine`, et un test
unitaire verrouille les deux sens plutôt que d'affaiblir le filtre.

## La revue critique, une faille reproduite 10 fois sur 10

C'est le défaut sérieux de la session, et **mon travail le rendait atteignable** :
avant LS-56, aucun code du dépôt n'écrivait jamais `Commande.utilisateurId`.

Les deux transactions sont individuellement correctes :

1. la suppression marque `dissocieA` sur les commandes du compte. Une commande
   **invitée**, `utilisateurId` encore nul, n'est pas vue, et c'est normal :
   elle n'appartient à personne
2. le rattachement commite entre-temps : elle porte désormais `utilisateurId`
3. le `DELETE` remet `utilisateurId` à nul. **`dissocieA` reste nul**

La commande a appartenu au compte supprimé sans en garder aucune trace. Elle
retrouve exactement l'état d'une commande « jamais rattachée », donc redevient
rattachable par quiconque contrôle ensuite la même adresse : historique,
factures, adresses figées.

**La parade est un `FOR UPDATE`** dans `suppression-compte.ts`, là où un
`findUnique` nu ne prenait **aucun** verrou. Une lecture ordinaire constate
l'existence du compte sans empêcher personne de le modifier.

### Le verrou que j'ai ajouté puis retiré

J'avais posé un verrou symétrique côté rattachement, par symétrie apparente. Sa
mutation **ne faisait rougir aucun test**, et la mesure dit pourquoi : dans le
sens inverse, l'`UPDATE` de la commande pose déjà un verrou de ligne qui fait
attendre la suppression.

Retiré. Un verrou qu'aucune mutation n'exerce inviterait à croire la protection
portée là, donc à accepter un jour de retirer celle qui agit réellement.

### Le test que j'ai d'abord écrit faux

Ma première assertion vérifiait « orpheline **et** non dissociée ». Elle
échouait, et j'ai cru un instant que le verrou ne marchait pas.

**Cet état est celui d'une commande invitée que personne n'a jamais rattachée**,
mesuré sans aucune concurrence : c'est le cas nominal du parcours 6. L'assertion
ne distinguait donc rien.

La propriété à prouver est conditionnelle : **si** le rattachement a réussi,
**alors** la commande ne doit pas être réattribuable. Le verrou l'obtient en
faisant échouer le rattachement, la clé étrangère refusant d'écrire vers un
compte disparu.

## Un cookie de session valide hors du filtre

`.gitignore` listait les états de session **nommément**, trois lignes.
`.session-verifiee.json`, produit par mon travail e2e, n'y figurait pas : un
cookie signé et valide, sur un dépôt public, qu'un `git add -A` aurait poussé.

Remplacé par `tests/e2e/.session-*.json`. Une liste écrite à la main est une
opinion tant qu'elle n'est pas générique, motif déjà en fiche.

## La revue frontend, sept défauts dont le plus grave était invisible

**Le succès du rattachement détruisait son propre compte rendu.**

`revalidatePath` fait retomber `nombreEligibles` à zéro. Ma page rendait la
section sous `{nombreEligibles > 0 && ...}` : après un rattachement réussi, la
section entière était retirée du DOM, emportant trois choses à la fois.

- le message de succès, disparu avec son conteneur
- le focus clavier, retombé sur `body`
- la région live, retirée à peu près au moment où son texte y entrait

Le geste réussi ne produisait **rien de visible ni de durable**. Le commentaire
que j'avais écrit affirmait exactement l'inverse.

La signature de ce démontage apparaît en clair dans le rapport Playwright :
« element(s) not found » **après** que le sélecteur a résolu le nœud.

La décision d'affichage vit désormais dans le composant, qui connaît la
différence entre « rien à rattacher » et « je viens de rattacher ».

### Les six autres

- **`useTransition`** remplace un drapeau maison, qui réactivait le bouton
  pendant que la revalidation était encore en vol
- **les `set` d'après `await` doivent être enveloppés dans un second
  `startTransition`**, limitation documentée de React vérifiée via Context7.
  Sans lui la région restait bloquée sur « Rattachement en cours… » et le
  message n'apparaissait **jamais**
- **`aria-live` et `aria-label`** ajoutés : deux régions `status` coexistent sur
  cet écran, un rôle nu s'annonce sans dire de quoi il parle
- **le texte d'attente entre dans la région live**, muette jusque-là : personne
  ne perçoit le changement de libellé d'un bouton qu'il n'a plus sous le curseur
- **`color` redéclarée sur `.bouton:disabled`** : `verifier-contraste.sh`
  n'apparie une couleur et un fond que dans le **même** bloc, la paire n'était
  donc jamais mesurée alors que mon commentaire invoquait ce contrôle comme
  motif du choix. Elle vaut 5,19:1
- **le refus de session porte un lien de reconnexion**, au lieu d'un message
  seul sur une page affichant encore les données du client

## Trois pièges du partage d'état entre projets de largeur

Le test e2e a coûté plus que le code, et pour trois raisons distinctes qui se
ressemblent toutes de loin.

| Piège | Symptôme | Correction |
|---|---|---|
| le rattachement **consomme** son état | 11 tests sur 12 rouges | le test qui clique passe en dernier |
| le hook rattache à la **connexion** | `utilisateur_id` déjà posé | la commande se crée après le cookie |
| les plafonds de débit | « Too many requests » | une seule inscription, réessai espacé |

Le troisième mérite un mot : `/sign-up/email` accepte trois appels par minute et
par IP, et le dépôt en consomme désormais **les trois**. La marge est nulle, et
la config le dit maintenant. Aucun plafond n'a été neutralisé en test.

Le comptage exact est prouvé par les tests d'intégration, sur base réelle et
sans partage ; l'écran prouve qu'un compte rendu apparaît, survit et prend le
focus.

## Vérifications

```
npm run type-check                                  OK
npm run lint                                        OK
npm run format:check                                All matched files use Prettier code style!
npm run test                                        958 passed, 62 fichiers
npx playwright test                                 601 passed, 4 skipped, trois largeurs
./scripts/verifier-contraste.sh                     OK
./scripts/verifier-regles.sh                        OK
./scripts/verifier-loading-et-404.sh                OK
./scripts/verifier-gardes-administration.sh         OK
./scripts/verifier-actions-sensibles.sh             OK
./scripts/verifier-config-claude.sh                 OK
```

**Sept mutations, sept détectées par le test attendu :**

| Mutation | Test qui rougit |
|---|---|
| filtre `dissocieA` retiré de la lecture | la dissociée n'apparaît pas dans la liste |
| filtre `dissocieA` retiré de l'écriture | elle n'est jamais rattachée |
| filtre `utilisateurId` retiré | la commande d'autrui est reprise |
| vérification d'adresse ignorée | le compte non vérifié rattache |
| `toLowerCase` retiré | la casse fait rater la jonction |
| audit écrit même à vide | le rejeu noierait les entrées réelles |
| `FOR UPDATE` remis en `findUnique` nu | les deux tests de course |

La dernière est celle qui compte : elle prouve que la protection ajoutée est
réellement exercée, et non seulement présente.

## Ce qui reste

**Aucune dette ouverte par cette story.**

Un point signalé par la revue frontend, qui mérite un arbitrage plutôt qu'une
correction : le bloc de rattachement est un écran de **rattrapage**, pas le
chemin courant. Le hook rattachant à chaque connexion, un client ne le voit que
s'il a commandé sans compte depuis sa dernière connexion. Le chemin nominal est
silencieux, et c'est voulu.

## Prochaine étape

**LS-57**, l'historique des commandes et l'accès aux factures. C'est le motif
principal de l'arbitrage du 28 juillet, et LS-56 vient d'y faire entrer les
commandes invitées.

Puis **LS-59** le carnet d'adresses, **LS-60** le profil, **LS-164** la
réauthentification client, et **LS-62** les droits RGPD en bout de chaîne.

## État des tickets

LS-56 livrée, PR à fusionner sur `main` en rebase.
