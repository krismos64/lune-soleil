# 10 septembre 2026, g : le contrôle qui dormait depuis trois jours

LS-213 annonçait un travail de trente minutes. Elle en a pris le double, à cause
d'un effet de bord que la correction elle-même a produit.

## Le défaut

`verifier-prefetch-administration.sh` existait depuis le 7 septembre, écrit par
LS-166 avec sa preuve par mutation sur quatre sens. Il n'était **branché dans
aucun workflow**, et trois liens le violaient sur `main` pendant ce temps.

Motif « contrôle jamais déclenché », déjà rencontré avec
`verifier-actions-sensibles.sh` qui dormait depuis LS-81. Un contrôle écrit,
prouvé, et déclenché par rien ne garde rien.

## Ce qui est livré

Les trois liens portent `prefetch={false}` : les quatre filtres de période des
factures, le fil d'Ariane de la fiche produit, le renvoi vers les catégories.

Le contrôle est branché en étape `9s bis`, à côté de son voisin thématique. **La
CI joue désormais 49 contrôles au lieu de 48.**

## L'effet de bord, et il est instructif

Corriger les trois liens a **cassé `verifier-navigation-client-mutation.sh`**.

Ses motifs citaient les balises sous leur forme littérale d'une seule ligne.
L'ajout de `prefetch={false}` a fait passer les balises sur trois lignes sous
Prettier, et les substitutions ont cessé de trouver leur cible.

**Le script annonçait alors « non détecté » et accusait le contrôle**, quand
c'était la mutation qui n'avait rien muté. Motif « correction échouée en
silence », déjà connu ici.

Trois mutations sur quatre sont tombées d'un coup. Sans les 49 contrôles joués en
local, la régression partait en CI.

Les motifs suivent désormais la forme réelle, et le commentaire dit pourquoi ils
ne citent plus la balise entière.

## Le quatrième critère, mesuré plutôt qu'estimé

Le ticket demandait de chercher si d'autres contrôles étaient dans le même cas.
Sur **85** scripts `verifier-*`, **35** ne sont référencés par aucun workflow.

Le chiffre brut trompe : **26 sont des scripts `-mutation`**, qui prouvent les
contrôles et n'ont pas vocation à tourner à chaque pull request.

Restent **neuf contrôles réels**, dont **sept** ne peuvent pas tourner en CI :
production, accès SSH, ou variables absentes. Arbitrage de Christophe, corriger
directement plutôt que d'ouvrir des tickets.

**Un seul a été branché**, `verifier-graphie-marque.sh`, celui dont le dépôt
retient qu'il a été prouvé par quatre mutations réussies **pendant qu'il laissait
passer quatre défauts réels**, dont l'en-tête de toutes les pages publiques. Le
brancher ne répare pas cette limite, il l'expose : un contrôle qui tourne se
corrige, un contrôle qui dort ne se corrige jamais.

## Le second a été branché puis retiré, et l'erreur est de méthode

`verifier-emetteur-facture.sh` a été branché avec l'autre, puis retiré après un
échec en CI : **il exige un `.env` à la racine**, absent chez GitHub.

Il paraissait vert pour la seule raison qu'un `.env` existe sur mon poste. **J'ai
mesuré sur ma machine et conclu sur la CI**, ce qui est exactement le défaut que
la fiche « contrôler sur la base réelle » nomme, transposé à l'environnement.

Le geste qui l'aurait vu tient en trois commandes, et il a été fait après coup :

```
mv .env .env.mise-de-cote
graphie-marque sans .env    : 0
emetteur-facture sans .env  : 1
```

**La CI joue donc 50 contrôles** au lieu de 48 ce matin, et la raison du retrait
est écrite dans `controles.yml` pour qu'il ne soit pas rebranché tel quel.

## L'échec préexistant, corrigé lui aussi

`tests/e2e/navigation-administration.spec.ts:662`, « le tableau d'expédition
porte trois colonnes comptées juste », échouait à toutes les largeurs. Vérifié
sur `main` avant la PR : l'échec la précédait.

**La cause n'était pas le tableau**, mais l'absence d'attente. Les trois colonnes
vivent sous un `<Suspense>` interne, C32 : `page.goto` rend la main dès que le
document est servi, donc AVANT que le contenu suspendu arrive. Le relevé était
vide, d'où la comparaison d'un tableau vide aux trois titres attendus.

C'est le motif « loading.tsx escamote le DOM » sous sa forme `<Suspense>`.

**L'ancre est le titre de la première colonne et non un délai** : une attente en
millisecondes passerait sur une machine rapide et échouerait sur une machine
chargée, ce qui est pire qu'un échec franc. Prouvée nécessaire par mutation, le
test rougit sans elle.

## Vérifications

```
npm run type-check     vert
npm run lint           vert
npm run format:check   vert
npm run test           1314 passed, 85 fichiers
50 controles           0 en echec
verifier-navigation-client-mutation.sh   4 sur 4
```

Le contrôle **détecte** le défaut d'origine, vérifié en retirant l'attribut d'un
des trois liens : une pull request qui le réintroduirait serait rejetée, ce qui
n'était pas le cas ce matin.

## Prochaine étape

LS-212, les codes de récupération, reste le seul critère ouvert de l'amorçage.
Elle demande un ADR avant tout code, le plugin `twoFactor` de Better Auth
imposant un secret TOTP dont ADR-021 ne veut pas.
