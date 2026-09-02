# 3 septembre 2026, session A : LS-164, LS-62 et LS-167

Trois stories de l'epic LS-36, livrées d'affilée : la réauthentification client,
les droits RGPD, et le lien de vérification qui ouvrait une session.

Le fil de la session : **quatre fois sur cinq, mon premier diagnostic était faux,
et c'est la mesure qui a tranché.** Un contrôle refusait la PR pour une raison
que j'ai mise trois tentatives à voir ; un test mesurait l'inverse de ce qu'il
annonçait ; deux tiers d'une correction de sécurité étaient du code mort.

## LS-164, le message qui menait dans le mur

`formulaire-suppression.tsx` affichait « confirmez votre identité avant de
supprimer votre compte » sans qu'aucun écran ne le permette : le seul existant
exige `ADMINISTRATRICE` et renvoie un client vers la connexion de
l'administration. Le message demandait une action impossible, ce qui privait le
client du droit à l'effacement, RGPD article 17.

Trois décisions que le ticket laissait ouvertes :

- **mot de passe et non passkey**, ADR-023. `prouverIdentiteParPasskey` accorde
  la preuve sur le seul constat qu'une session est neuve, ce qu'une reconnexion
  ordinaire produit déjà sur un compte client : ce serait un second chemin, plus
  faible, vers la même preuve
- **un écran générique** plutôt qu'un champ par formulaire. Quatre actions
  sensibles côté client à terme, dont l'export de LS-62
- **le retour se désigne par une clé**, jamais par un chemin fourni. Filtrer sur
  « commence par `/` » ne suffirait pas, `//exemple.fr` étant absolue

### Le point à ne pas corriger par symétrie

L'adaptateur client **n'exige aucun rôle**, contrairement à son voisin
d'administration. Les deux fichiers se ressemblent, et les aligner paraîtrait
prudent : ce geste interdirait la suppression de compte à toute la population
qu'elle concerne. Un test verrouille l'asymétrie.

## GitGuardian, trois tentatives pour lire le rapport

Le contrôle refusait la PR avec « 3 secrets uncovered ». J'ai accusé les
**valeurs** : mots de passe de test, secret de test recopié dans neuf fichiers.
Deux refactorisations plus tard, il refusait toujours.

Le rapport détaillé, obtenu par l'API des check-runs, nommait trois **lignes**.
Le détecteur reconnaît une **paire d'identifiants**, une adresse et un mot de
passe voisins, quelle que soit la chaîne.

```
| Secret           | Filename                                   |
| Generic Password | reauthentification-client...test.ts (R101) |
| Generic Password | reauthentification-client...test.ts (R112) |
| Generic Password | reauthentification-client...test.ts (R260) |
```

Les lignes 101, 112 et 260 portaient `email:` et `password:` sur deux lignes
consécutives. Les tests existants du dépôt y échappent en tenant leur `body` sur
une seule ligne, ce qui tient au **hasard de la mise en forme** : il suffit qu'un
champ s'allonge pour que Prettier les redécoupe.

La correction porte la forme attendue par l'API dans le **type**, l'objet se
transmettant entier. Les deux refactorisations faites en chemin restent, elles
valent par elles-mêmes.

**Ce que je n'ai pas fait** : poser un `.gitguardian.yml`. Il réglait la PR en
une ligne et aveuglait durablement des fichiers de test, sur un dépôt public.

## Le test qui a cassé 33 tests voisins

La CI a rougi sur **quatre fichiers**, dont trois que LS-164 ne touche pas.
Symptôme : « Mon compte » introuvable partout, loin de la cause.

Un de mes tests établissait une preuve d'identité, valable quinze minutes, sur la
session **partagée** par le projet `preparation`.
`compte-suppression-connecte.spec.ts` clique alors « Supprimer définitivement »
et **réussit**, là où il attend le refus qui est l'état nominal de son écran. Le
compte part, et tout ce qui partage cette session s'effondre.

**Invisible en lançant le fichier seul**, ce que je faisais : la session est
recréée à chaque exécution, et plus rien n'en dépend ensuite.

Trois parades essayées, toutes mesurées :

| Parade | Pourquoi écartée |
|---|---|
| un compte par largeur | trois inscriptions, le plafond en accepte trois par minute |
| une quatrième session partagée | même budget épuisé, « la marge est nulle » disait déjà la config |
| effacer la preuve en base après chaque test | les trois largeurs tournent en parallèle : une course, pas un oubli |

Le test est retiré, et le critère 3 est couvert par les tests d'intégration, où
aucune session n'est partagée.

## LS-62, le service existait, l'écran manquait

`exporterDonneesPersonnelles` était livré depuis LS-95. Pire, `/compte`
annonçait « la demande se fait par email et la réponse intervient sous un mois
au plus » : ce texte **dissuadait** d'employer le chemin, en annonçant un délai
d'un mois là où le fichier se télécharge en un clic.

### DONNEES_CLIENTS sort de la liste d'attente

`.claude/familles-sans-action.txt` annonçait depuis le 13 août que cette famille
ne couvrait rien, en précisant où la question se reposerait : « LS-36 porte
l'espace client, où la question se reposera entière ». C'était ici.

Un export qui livre en **un** fichier le nom, les adresses, l'historique
d'achat, les factures et le journal des connexions est « exporter en masse » au
sens propre d'ADR-027. La nuance qui aurait pu faire hésiter, la personne exporte
ses **propres** données, ne change rien : le scénario d'ADR-027 est l'ordinateur
resté ouvert.

### Deux corrections de tests, toutes deux mesurées

`page.request` **ne transmet pas** un cookie `Secure` sur HTTP, là où
`page.goto` le fait : la route rendait 401 au lieu de 403. Le test aurait pu être
« corrigé » en attendant 401, ce qui aurait mesuré une absence de session là où la
propriété visée est le refus d'une session **valide** sans preuve.

Un contexte ouvert par `browser.newContext()` **hérite du `storageState`** posé
par `test.use` : le contexte « anonyme » portait le cookie et recevait 403. Le
test mesurait l'inverse de ce qu'il annonce. La route, elle, était correcte
depuis le début, vérifié au `curl` sans cookie.

## LS-167, deux tiers de ma correction étaient du code mort

Le lien de changement d'adresse, cliqué sans cookie, créait une session complète
et se rejouait. `auth.ts` refuse pourtant `autoSignInAfterVerification` avec ce
motif exact : le drapeau ne gouverne que la branche de vérification **simple**,
et `change-email-verification` ouvrait la sienne inconditionnellement.

### Le flux a deux étapes, ce que le ticket ne disait pas

```
lien 1  requestType: change-email-confirmation   n'ouvre rien, envoie le lien 2
lien 2  requestType: change-email-verification   OUVRAIT la session
```

Ma première version du test cliquait le premier : verte sans jamais approcher le
défaut.

### La mutation a démonté mon hypothèse

J'avais ajouté deux traitements, sur `ctx.context.returned` et sur les symboles
propres de l'erreur, en supposant que `ctx.redirect` recopiait les en-têtes hors
de portée du hook.

```
retrait de objet.headers        -> 3 tests VERTS
retrait des symboles propres    -> 3 tests VERTS
retrait de responseHeaders      -> 1 test ROUGE
```

`mergeAPIErrorHeaders` recopie bien, mais **après** ce hook : vider
l'accumulateur suffit. Les deux autres étaient du code mort, et un code mort dans
une correction de sécurité donne l'impression d'une défense en profondeur qui
n'existe pas. Supprimés.

### Ce qui est fermé, et ce qui ne l'est pas

Le **cookie** est retiré, pas la ligne de session : un hook `after` s'exécute
après l'endpoint, donc après l'écriture. Une session dont le jeton n'a été
transmis nulle part n'ouvre rien, et le défaut était l'accès. C'est dit dans le
code, dans le test et dans le ticket plutôt que tu.

Le compte de sessions n'était d'ailleurs pas la bonne assertion. Le test mesure
le cookie, et **constate** la ligne.

## Vérifications

```
npm run type-check                          OK
npm run lint                                OK
npm run format:check                        All matched files use Prettier code style!
npm run build                               ƒ /compte/reauthentification, /compte/donnees
npm run test                                1035 passed, 68 fichiers
npx playwright test                         700 passed
./scripts/verifier-actions-sensibles.sh     OK, 3 actions @sensible sur 219
./scripts/verifier-contraste.sh             OK, 108 paires mesurées
./scripts/verifier-regles.sh                OK
./scripts/verifier-registre-traitements.sh  OK, 36 tables rangées
./scripts/verifier-loading-et-404.sh        OK
./scripts/verifier-propagation-docs.sh      OK
```

**Neuf mutations, neuf détectées**, dont deux qui ont changé le code livré :

| Story | Mutation | Test qui rougit |
|---|---|---|
| LS-164 | garde de rôle ajoutée au chemin client | l'adaptateur client n'exige aucun rôle |
| LS-164 | preuve écrite sur toutes les sessions | deux sessions du même compte ne partagent pas la preuve |
| LS-164 | lien de confirmation retiré | le refus mène à l'écran, aux trois largeurs |
| LS-62 | garde de fraîcheur retirée | refuse sur une session qui n'a rien prouvé |
| LS-62 | filtre `where` de l'export retiré | ignore les commandes d'un autre compte |
| LS-62 | marquage `dissocieA` retiré | bout à bout, suppression puis nouveau compte |
| LS-62 | refus 403 devenu succès vide | le refus est un refus, jamais un fichier vide |
| LS-167 | retrait du cookie supprimé | le rejeu n'ouvre rien |
| LS-167 | distinction connecté/anonyme neutralisée | le client connecté n'est pas déconnecté |

## Ce qui reste

**LS-168 créée** : la suite e2e est instable **avant** ces trois stories, mesuré
sur `main` avec l'arbre propre, 2 échecs sur `compte-profil` liés aux plafonds
d'inscription et de connexion quand plusieurs fichiers s'inscrivent en parallèle.
Chaque fichier passe seul. Ces stories ne l'aggravent ni ne le corrigent.

**Le critère 6 de LS-62 dépend de LS-28**, les textes légaux, qui n'existent pas.
Le lien Jira le porte, plutôt qu'un commentaire.

## Prochaine étape

L'epic LS-36 ne garde que **trois stories**, toutes bloquées par le même
obstacle : **LS-33**, comment le site apprend qu'un colis est livré, et
**l'ouverture du compte Mondial Relay**. LS-58 en dépend directement, LS-61 en
dépend par `livreA`, et LS-77 n'a d'objet qu'une fois les avis publiés.

Aucune ne peut avancer sans une décision qui n'est pas du code. Le reste du
périmètre est ailleurs : conformité, epic LS-6, et mise en ligne, epic LS-7.

## État des tickets

LS-164, LS-62 et LS-167 livrées et closes, PR #202, #203 et #204 fusionnées.
LS-168 créée, rattachée à LS-7. **59 stories ouvertes** au total, dont trois dans
LS-36.
