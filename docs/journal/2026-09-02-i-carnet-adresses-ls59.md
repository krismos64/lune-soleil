# 2 septembre 2026, session I : LS-59, le carnet d'adresses

Le client enregistre ses adresses et les retrouve à la commande. Parcours 8,
cinq étapes, aucune migration : `AdresseCarnet` et son index partiel existent
depuis la migration initiale.

Le fil de la session : **les deux revues ont trouvé onze défauts, dont un mesuré
douze fois sur douze et un que j'avais déjà corrigé le matin même sur un autre
écran.**

## Le piège que le ticket annonçait, et celui qu'il n'annonçait pas

Le ticket nomme l'ordre des écritures : retirer le drapeau de l'ancienne adresse
**avant** de le poser sur la nouvelle. `adresse_defaut_unique` est un index
partiel, donc **non différable**, donc vérifié ligne à ligne.

Je l'ai respecté, et le test des dix alternances le prouve.

**Ce que le ticket ne dit pas, c'est que cet ordre ne protège que d'un seul
conflit.** La revue critique l'a mesuré :

```
T1  UPDATE ... WHERE ... AND est_par_defaut   ->  1 ligne
T2  le meme UPDATE                            ->  0 ligne
T2  pose son drapeau                          ->  1 ligne
le second a commiter leve adresse_defaut_unique
```

En `READ COMMITTED`, T2 attend le verrou de ligne de T1, puis **réévalue son
prédicat** sur la version commitée : il ne trouve plus rien à retirer. C'est le
motif « lecture avant verrou », déjà en fiche.

**Douze courses sur douze**, jamais zéro. La donnée restait correcte, le perdant
étant intégralement annulé ; ce qui cassait est l'usage. Deux onglets, ou un
double clic dont les requêtes se recouvrent, faisaient lire « opération
momentanément indisponible » sur un geste banal.

### Le commentaire qui promettait ce que le code ne tenait pas

J'avais écrit que `P2002` « ne devrait jamais survenir, l'ordre ci-dessus le
fermant », et que sa présence signalerait une inversion future.

L'ordre ferme le conflit **intra-transaction**. Il ne dit rien de deux
transactions qui se croisent. Mon signal se déclenchait donc sur un événement
normal, ce qui le rendait inutilisable : un filet qui sonne pour rien n'est pas
un filet.

Fermé par un `FOR UPDATE`, même primitive que la suppression de compte. Les deux
bascules se sérialisent, les deux rendent `FAIT`, dernier clic gagnant.

**Le test d'une seule course ne suffisait pas** : la mutation le laisse vert une
fois sur deux. C'est celui des **dix** courses qui attrape.

## Le défaut que j'avais déjà corrigé le matin, revenu autrement

**Le succès d'une modification n'était jamais affiché.**

`onTermine` referme la carte en édition, donc démonte le formulaire, donc la
région live qui vit dedans. Je posais le message puis j'appelais `onTermine` :
le texte n'était jamais rendu, et `focus()` s'appliquait à un nœud détaché.

C'est le motif « focus sur élément détaché », en fiche depuis LS-101, et c'est
la **deuxième fois de la journée** : `bloc-rattachement` avait le même défaut ce
matin sous une autre forme, `revalidatePath` faisant disparaître la section.

Le message part désormais à la **liste**, dont la région survit à la fermeture.

**La région live disparaissait aussi dans l'état vide** : après la suppression
de la dernière adresse, elle était retirée au moment précis où son message
devenait utile. Même motif, troisième forme.

## Sept identifiants dupliqués

Le formulaire d'ajout est monté en permanence, celui d'édition s'ouvre dans une
carte : **les deux coexistent**. Sept `id` écrits en dur produisaient sept
doublons, donc sept `<label for>` pointant tous vers le premier champ du
document.

Cliquer le label « Ville » de la carte mettait le focus dans le champ « Ville »
du formulaire d'ajout, en bas de page. `axe-core` l'aurait vu ; mon test
n'ouvrait jamais d'édition.

## Les tests mesuraient un écran vide

Le `beforeEach` supprimait sans rien créer. Les tests de débordement et
`axe-core` mesuraient donc un carnet vide : ni carte, ni boutons de gestes, ni
ligne de confirmation, ni adresse longue.

Le critère 6 demande un rendu vérifié à 320 px, et **rien de ce qui peut
déborder n'était rendu**.

### Trois pièges de partage d'état, mesurés en corrigeant

| Tentative | Symptôme | Cause |
|---|---|---|
| nettoyage par libellé exact | quatorze cartes accumulées | chaque exécution laissait les siennes |
| nettoyage total | « cette adresse n'existe plus » | les trois largeurs se marchaient dessus |
| `describe.serial` | insuffisant | il n'ordonne que les tests d'un **même** projet |

Et une découverte utile : **`getByRole("form")` rend 0**. Un `<form>` n'expose ce
rôle que s'il porte un nom accessible.

## Le message d'erreur montrait un identifiant technique

Le socle compose ses messages pour le **diagnostic** : `formaterProblemes`
préfixe le chemin Zod, donc `codePostal` en camelCase, et `EntreeInvalideError`
ajoute « Entree invalide » sans accent. Le tout atterrissait sous les yeux du
client.

La traduction vit désormais dans l'adaptateur, le socle servant aussi des
chemins sans interface, webhook et tâches planifiées, où le nom technique est
précisément ce qu'on veut lire dans un journal.

## Vérifications

```
npm run type-check                                  OK
npm run lint                                        OK
npm run format:check                                All matched files use Prettier code style!
npm run build                                       route /compte/adresses
npm run test                                        997 passed, 64 fichiers
npx playwright test compte-adresses                 32 passed, trois largeurs
./scripts/verifier-contraste.sh                     OK
./scripts/verifier-regles.sh                        OK
./scripts/verifier-loading-et-404.sh                OK
./scripts/verifier-propagation-docs.sh              OK
```

**Huit mutations, huit détectées :**

| Mutation | Test qui rougit |
|---|---|
| ordre de bascule inversé | les deux sens de bascule |
| refus par `return` au lieu de lever | le défaut disparaît du carnet |
| `utilisateurId` retiré, modification | l'adresse d'un tiers est modifiée |
| `utilisateurId` retiré, suppression | l'adresse d'un tiers est supprimée |
| `utilisateurId` retiré, pose du défaut | le défaut d'un tiers est posé |
| promotion automatique ajoutée | A7, personne n'est promu |
| libellé absent conservé | un libellé effacé resterait |
| **verrou retiré** | les **dix** courses, jamais celle d'une seule |

La dernière est instructive : une course unique tombe du bon côté une fois sur
deux, donc un test unique aurait laissé passer la correction.

## Ce qui reste

**Aucune dette ouverte par cette story.**

Un point signalé par la revue et déjà ticketé ce matin : la largeur **768 px**
n'est mesurée par aucun projet Playwright, **LS-166**.

Un point de confort non corrigé, signalé sans gravité : `enCours` est partagé
par toute la liste, donc pendant une suppression tous les boutons se
désactivent. Sûr contre la double soumission, mais l'annonce ne dit pas quelle
carte est concernée.

## Prochaine étape

**LS-60**, le profil client. Elle activera `user.changeEmail`, vérifié via
Context7 : l'adresse n'est mise à jour qu'après vérification de la nouvelle,
donc l'ancienne reste l'adresse de connexion, ce qui est exactement le critère 2.
`sendChangeEmailConfirmation` permettra en plus de confirmer sur l'ancienne
adresse.

Attention, la dépendance est tracée dans `REFERENCES.md` : activer ce drapeau
rend `emailVerifie` atteignable par un **troisième** chemin, donc déclenche le
rattachement de LS-56.

Puis **LS-164** la réauthentification client, et **LS-62** les droits RGPD.

## État des tickets

LS-59 livrée, PR à ouvrir. LS-56 et LS-57 fusionnées et closes plus tôt dans la
journée.
