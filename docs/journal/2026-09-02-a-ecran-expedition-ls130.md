# 2 septembre 2026, session A : LS-130

L'écran d'expédition, dernier écran d'administration manquant de la phase 4.
`Expedition` était en base depuis la migration initiale et **rien ne l'écrivait**
: l'exploitante n'avait aucun moyen de déclarer qu'un colis est parti.

Aucune migration. La table et sa contrainte existaient déjà, la story portait le
chemin qui les atteint.

Sept défauts trouvés par les deux revues, **aucun dans la logique métier**, que
la revue critique a validée sur ses sept axes en reproduisant l'interblocage, le
rollback et le `25P02` sur PostgreSQL 18.4.

## Les deux modes, et pourquoi ils ne se confondent jamais

`Expedition.mode` est ce que le transporteur a **exécuté**,
`Commande.modeLivraison` ce que le client a choisi et payé. Un échec de livraison
à domicile rebasculé vers un Point Relais change le premier et **jamais** le
second : réécrire la commande ferait mentir la facture sur ce qui a été vendu.

La lecture de la commande ne sélectionne que `statut`. `modeLivraison` n'est même
pas dans le `select`, ce qui rend la confusion structurellement impossible plutôt
que seulement interdite.

`livreA` n'est atteignable par aucun chemin, et par **quatre barrières
indépendantes** : aucun champ au formulaire, l'adaptateur ne lit que cinq clés
nommées, le schéma est un `strictObject`, et le `data` du repository est un
littéral de six champs. La date de remise fait courir le délai de rétractation,
elle vient du suivi automatique de LS-131.

## Deux clés, un seul chemin, et le test qui manquait

Le premier jet avait un test qui **ne prouvait rien**. Il déclarait deux
expéditions successives et attendait `DEJA_EXPEDIEE`, mais la garde de statut
sort **avant** l'unicité : la commande étant déjà `EXPEDIEE`, elle n'est plus
dans un état d'où l'on expédie, et l'unicité `commande_id` n'est jamais atteinte.

Le refus par la garde de statut est d'ailleurs **meilleur**, il porte l'état réel.

**L'unicité ne s'exerce que dans la course**, où les deux transactions lisent
`EN_PREPARATION` avant que l'une commite. Un `Promise.all` ne suffit pas à
l'atteindre de façon déterministe, le pool chaud sérialisant les deux appels.

Le test qui l'atteint construit donc l'état où la première garde **ne joue pas** :
une expédition insérée à la main, puis la déclaration. Neutraliser le refus de
doublon fait rougir ce test **et lui seul**.

## Les mesures qui ont servi, et celles qui étaient fausses

**Le contraste de l'état vide était à 4,35:1**, sous le seuil AA. Le jeton
`--ls-text-muted` annonce « 4,86:1, AA », mais cette valeur vaut **sur crème** :
j'ai recopié la couleur de l'écran voisin en ajoutant un fond sable, ce qui a
cassé l'hypothèse sous laquelle elle était juste.

`axe-core` ne l'a pas vu, et c'était prévisible : la file de test portait toujours
une commande, donc cette branche n'était rendue par aucun test. Même angle mort
que le contraste à 4,04:1 de LS-121. C'est de surcroît l'état le **plus souvent
affiché**, une file vide étant le cas normal.

**La mesure de rendu, elle, a été prouvée** : un champ élargi volontairement à
900 px fait rougir les trois largeurs et la bascule 768 px de cet écran, et elles
seules.

## Le test qui prouvait le contraire de ce qu'il annonçait

C'est le point le plus important de la session, et il vient de
`ls-frontend-revue`.

Mon commentaire affirmait que `getByLabel` prouvait l'unicité des `id` entre
cartes, cet écran rendant un formulaire **par** commande. **La file de test n'en
portait qu'une.** Avec une seule carte, `getByLabel` passe quel que soit l'état
des identifiants.

**Mesuré plutôt que raisonné** : les identifiants remplacés par des constantes
fixes, les trois tests restaient **verts**. Le composant était correct, la preuve
ne l'était pas.

Une seconde commande `EN_PREPARATION` corrige cela, en `POINT_RELAIS` pour que
les deux formulaires soient dans des états **distincts** et croisent réellement
leurs identifiants. La même mutation les fait désormais rougir.

La mesure de débordement gagne au passage : elle annonçait « la densité la plus
forte de l'administration » sur une carte unique.

## Quatre autres défauts d'interface, tous réels

- **l'irréversibilité n'était écrite que dans des commentaires**, invisibles pour
  l'exploitante. LS-121 ne permet aucun retour depuis `EXPEDIEE` : l'avertissement
  passe avant le formulaire, même règle que le remboursement
- **l'état réel manquait au message de refus**, alors que le commentaire
  promettait de le dire. La cause était un type élargi à `string` dans
  l'adaptateur, qui interdisait d'indexer `LIBELLES_STATUT` : un type trop large
  ne casse rien à la compilation, il ferme une possibilité en silence
- **le focus retombait sur `body` après un succès**, le bouton qui le portait
  devenant désactivé. C'est la variante **désactivée** du piège déjà rencontré sur
  un élément détaché, qu'aucune vérification d'`isConnected` n'attraperait
- **l'apparition du champ de point de retrait n'était pas annoncée**, alors qu'il
  est obligatoire : la synthèse vocale ajoutait un champ en silence, et l'envoi
  échouait ensuite sur un champ jamais nommé

L'opacité des états désactivés passe de 0,6 à 0,75, mesurée : 4,52:1 contre
3,15:1. Un composant désactivé est formellement exempté de WCAG 1.4.3, mais après
un succès le formulaire reste dans cet état **en permanence** jusqu'au
rafraîchissement.

## Un numéro de suivi invisible

Trouvé par `ls-critical-reviewer`, et vérifié : `"​".trim()` ne rend **pas**
la chaîne vide. Un espace sans chasse, couramment ramené par un copier-coller
depuis l'interface d'un transporteur, traversait la validation et se persistait.

L'exploitante croit avoir laissé le champ vide, la base porte un numéro non nul
et invisible, et LS-131 construirait une URL de suivi sur du vide. Le prédicat
est désormais celui de `champAdresse`, qui porte ce `refine` depuis le défaut
mesuré le 25 août sur `nomClient`.

## Ce que la relecture d'un fichier a coûté

`.claude/familles-sans-action.txt` demande une relecture écrite à chaque story
qui ajoute une Server Action. L'arbitrage a été posé : **l'expédition n'est pas
une action sensible**, aucune des quatre familles ne la couvre, et l'adresse
affichée relève du même raisonnement qu'en LS-80, une file bornée sans recherche
ni export.

**Cet arbitrage a été effacé une première fois** :
`verifier-actions-sensibles-mutation.sh` restaure ce fichier après ses mutations,
ce qui a écrasé un ajout non commité. Motif « travail non commité perdu », déjà
en mémoire, rencontré ici sous une forme nouvelle : c'est un **contrôle** qui a
détruit le travail, pas une commande de restauration.

## Un trou de périmètre trouvé, pas corrigé

**Aucun écran d'administration ne renvoie vers un autre.** L'accueil rend deux
lignes et aucun lien : l'exploitante doit connaître sept URL par cœur.

Les tests de bout en bout appellent `page.goto()` avec l'URL en dur, donc
l'absence de navigation ne fait rougir aucune assertion. **LS-162** le porte,
rattachée à LS-3, plutôt que d'élargir LS-130 sans arbitrage.

## Vérifications

```
npm run type-check                                    OK
npm run lint                                          OK
npm run format:check                                  All matched files use Prettier code style!
npm run build                                         OK, /administration/expeditions rendue dynamique
npm run test:unitaire                                 388 tests verts
npm run test:integration                              509 verts, 36 fichiers
tests e2e administration-connectee                    130 verts, 3 largeurs et bascule 768
./scripts/verifier-actions-sensibles.sh               OK, 31 fichiers
./scripts/verifier-gardes-administration.sh           31 actions, toutes gardées
./scripts/verifier-actions-sensibles-mutation.sh      10/10
./scripts/verifier-gardes-administration-mutation.sh  5/5, contre 4/4 sur main
./scripts/verifier-regles.sh                          35 services, frontière respectée
./scripts/verifier-registre-traitements.sh            35 tables rangées
./scripts/verifier-propagation-docs.sh                19 schémas, tous dans VALIDATION.md
```

**Quatre mutations ciblées, quatre détections précises.** Écrire le mode de la
commande au lieu du mode saisi fait rougir un seul test, celui du rebasculement.
Tolérer le doublon en fait rougir un seul autre, celui qui atteint l'unicité.
L'ancienne condition sur le numéro de suivi en fait rougir un troisième.
Retirer la garde de rôle est détecté par le contrôle, qui nomme l'action.

Le cinquième cas de `verifier-gardes-administration-mutation.sh` vise ce dossier
neuf : il prouve que le relevé par `use server` voit un fichier **créé après**
l'écriture du script, et pas seulement les quatre qu'il connaissait.

## Un échec de test préexistant, hors périmètre

`catalogue-public.spec.ts` « les nouveautés sortent en tête » échoue **en local**,
et **il échoue aussi sur `main`**, vérifié en basculant de branche. La cause est
un produit réel créé à la main le 31 août, « Créoles dorées Ariane », resté dans
la base de développement.

La CI part d'une base vierge et ne le voit pas. Rien à corriger dans le code : la
base locale se réamorce par `npm run db:preparer`.

## Ce qui reste

**Le rafraîchissement de l'écran n'est pas automatique**, convention de LS-160 :
`revalidatePath` invalide le cache serveur, mais le composant client déjà monté ne
se remonte pas. Ici la carte devrait **disparaître** de la file, ce qui rend le
message « rafraîchir la page » plus visible qu'ailleurs. Un `router.refresh()`
reste la correction propre, sur les trois écrans à la fois, notée dans LS-161.

**Trois points demandent un contrôle visuel** que le code ne tranche pas : la
grille à deux colonnes à 768 px exactement avec le champ de point de retrait
affiché, l'atterrissage réel du focus après un succès, et le rendu avec cinq à
dix cartes à 320 px, qu'aucun test ne produit.

## Prochaine étape

**LS-97**, le formulaire de contact, avec l'arbitrage déjà pris : l'écran affiche
les messages et propose un lien `mailto:`, la réponse intégrée relèvera d'une
story distincte si elle est voulue. Puis **LS-154**, la purge de l'outbox.

## État des tickets

LS-130 livrée. **LS-162 créée**, la navigation de l'administration, rattachée à
LS-3. LS-84, LS-85, LS-82, LS-86, LS-9 et LS-161 restent ouvertes, inchangées.
