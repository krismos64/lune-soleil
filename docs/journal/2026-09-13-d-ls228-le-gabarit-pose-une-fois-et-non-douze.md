# 13 septembre 2026, le gabarit de titre que deux stories avaient livré sans le garder

Quatrième session du jour. Christophe a regardé les deux espaces déployés et
trouvé le rendu en deçà du prototype : « le prototype n'est pas correctement
respecté sur le rendu visuel qui paraît plus fini, plus professionnel ».

La comparaison écran par écran a montré que **le sujet avait déjà été ticketé et
livré**, et que le défaut venait d'ailleurs.

## Deux stories portaient déjà ce constat, et elles ont tenu

LS-180 et LS-181, créées le 4 septembre sur presque les mêmes mots de Christophe,
sont terminées. La navigation latérale, les pastilles de comptage, le bandeau, le
bloc d'identité : tout est en place et conforme.

**Chercher le ticket existant avant d'en ouvrir un a évité de refaire le travail
de deux stories.** Le réflexe vient de LS-76, où le même geste avait évité de
rouvrir ADR-026.

## Ce que la mesure a montré

Session ouverte par Christophe sur la production, police relevée par
`getComputedStyle` et non lue dans la feuille de style :

```
7 titres sur 14 rendaient en system-ui
3 echelles cohabitaient : 24, 36 et 44 px
```

Confirmé dans le dépôt : le jeton `--ls-police-titre` posé par LS-181 était
employé par **7 fichiers CSS**, et **14 dossiers d'administration sur 18** ne
l'employaient jamais. Quatre écrans portaient un `h1` nu, sans aucune classe.

**Le jeton était correct, il n'était simplement pas atteint.** Un contrôle qui
aurait mesuré sa valeur serait resté vert.

## La cause, et pourquoi elle se reproduira sans contrôle

Les écrans conformes sont ceux que LS-180 et LS-181 ont touchés. Les autres ont
été écrits **après** leur clôture, Statistiques, Avis et Paramètres le
11 septembre, « Mes avis » par LS-221, en recopiant un voisin **antérieur au
jeton**.

Une convention posée sur une classe que chaque écran doit penser à employer ne
se propage pas. La règle passe donc sur `.colonne h1` dans les deux layouts, et
tout écran en hérite, y compris ceux au `h1` nu.

`tokens.css` prévenait déjà qu'un jeton déclaré et jamais employé est invisible à
`verifier-contraste.sh`, qui ne mesure que les paires colocalisées. Le même angle
mort valait pour la police, et personne ne l'avait tiré.

## Ce que la preuve par mutation n'aurait pas montré seule

Les quatre mutations passent, chacune détectée. Mais le skill avertit qu'une
mutation ne prouve que **la forme qu'elle fabrique**.

Le geste qui compte a donc été fait : lancer le contrôle sur le dépôt **d'avant
la correction**.

```
16 defauts designes, dont les 14 modules fautifs
```

Il voit plus que ce que les mutations construisaient. Sans ce geste, quatre
mutations vertes auraient laissé croire à une couverture qu'aucune ne prouvait,
exactement le piège de `verifier-graphie-marque.sh` le 8 septembre.

## Le contrôle textuel ne suffisait pas, et l'inverse non plus

Un script lit des règles CSS, il ne rend pas une page. Le défaut d'origine se
mesurait précisément par `getComputedStyle`, et aucune lecture de feuille de
style ne l'avait montré en dix-neuf jours.

`tests/e2e/gabarit-titre-ls228.spec.ts` mesure donc la police **calculée** sur
22 écrans aux 4 largeurs, débordement compris dans la même assertion : un titre
plus grand est exactement ce qui pousse un écran hors cadre à 320 px.

Sa mutation est instructive : retirer le jeton du layout d'administration fait
rougir **les 16 écrans d'administration en laissant les 6 de l'espace client
verts**. Le test discrimine l'espace touché, il ne rougit pas en bloc.

## Deux gardes qui ont fonctionné pendant la session

**Le script de mutation a refusé de tourner sur un dépôt sale**, avec le bon
motif : il restaure par `git checkout` et aurait effacé le travail non commité.
Le piège est en fiche depuis deux occurrences, la garde l'a fermé.

**`verifier-config-claude.sh` a trouvé un défaut dans mon propre travail** :
j'avais numéroté l'étape de CI « 9h », déjà prise. L'étape est passée en
« 9z septies », en fin de série et dans l'ordre d'exécution.

## Vérifications

```
npm run type-check     OK
npm run lint           OK
npm run test           104 fichiers, 1702 tests verts
verifier-regles.sh     regles conformes au schema
verifier-contraste.sh  218 paires, toutes conformes
verifier-redaction     aucun cadratin, aucun accord au feminin
test:e2e gabarit       96 verts, 22 ecrans aux 4 largeurs
mutation du controle   4 cas sur 4 detectes
```

Rendu vérifié sur serveur local, avant et après :

```
/compte/avis                          system-ui 32px  ->  Iowan Old Style 36px
/administration/parametres            system-ui 24px  ->  Iowan Old Style 44px
/administration/journal-connexions    h1 nu           ->  Iowan Old Style 44px
```

Le dernier est celui qui valide le choix de cibler `h1` : il n'a **aucune
classe**, et une règle ancrée sur `.titre` ne l'aurait jamais couvert.

## Ce qui reste ouvert sur LS-228

**Le second volet, les blocs d'état des deux vues d'ensemble.** Le tableau de
bord n'a ni panneau « État du stock » ni tableau des commandes récentes ; la vue
d'ensemble client rend cinq cartes de liens là où le prototype montre l'état du
compte.

Ils demandent des données que les comptes de production n'ont pas, ni commande,
ni adresse, ni avis. **Cinq écrans n'ont donc pas pu être jugés** : Expéditions,
Commandes, Mes commandes, Mes adresses et Mes avis rendent tous leur état vide.
Les colonnes kanban, les badges de statut et la frise d'étapes attendent LS-153.

Le ticket le dit explicitement, pour que personne ne conclue sur ces écrans avant
de les voir peuplés.

## Une limite d'outillage rencontrée

Le navigateur piloté rend les pages dans un **panneau de 625 px**, ce qui force
la mise en page mobile et rendait la comparaison de bureau impossible. La fenêtre
Chrome était par ailleurs positionnée de 970 à 1970 px sur un écran large de
1470, donc à moitié hors champ : tout redimensionnement était rejeté.

Christophe a ouvert les deux espaces lui-même, et la mesure a pu se faire à
1400 px. À retenir pour toute session de contrôle visuel.

## La CI a rougi sur mon propre contrôle, trop étroit

**Premier passage en échec, étape « 3b. Format ».** Deux lignes vides
consécutives dans `controles.yml`, laissées en déplaçant l'étape de CI.

La cause n'est pas l'étourderie, c'est la **portée de ma vérification** :

```
ce que j'ai lance   npx prettier --check "src/**/*.css" "tests/e2e/*.ts"   vert
ce que la CI lance  prettier --check .                                     rouge
```

Mon contrôle était plus étroit que celui qui juge, donc il est resté vert sur un
fichier que je venais de modifier. C'est le motif que le dépôt documente déjà,
« un contrôle dont la portée est plus étroite que la règle qu'il énonce ment par
omission », et je l'ai reproduit dans la session qui en écrivait un autre.

**Valider le YAML m'a donné une fausse assurance.** La validité syntaxique ne dit
rien du format, et j'ai pris l'une pour l'autre.

**Le geste à retenir** : lancer la commande **du workflow**, `npm run
format:check`, jamais une variante resserrée sur les fichiers qu'on croit avoir
touchés.

## Prochaine étape

**La PR #433 est fusionnée sur `main`** en rebase, le 13 septembre 2026 à 16h21
UTC, branche supprimée, les huit contrôles verts. Le premier volet de LS-228 est
livré, le second attend LS-153.

Comptes relevés dans Jira, jamais déduits : **195 terminés sur 218 hors epics**,
**23 ouverts**, dont **9 En cours**. LS-228 est le 218e et reste en cours, son
second volet attendant LS-153.
