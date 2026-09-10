# 10 septembre 2026, j : LS-200, l'API Sendcloud raccordée

Christophe a créé les clés d'API dans son navigateur, et le fournisseur de
points de retrait a cessé de lever. Quatre points réels répondent autour
d'Artix.

## Ce que la question de départ a déplacé

La session commençait sur les avis, LS-61. La lecture du ticket a montré que
son blocage n'était pas là où on le cherchait : les avis attendent `livreA`,
qui attend le suivi, qui attendait l'API. La question « on s'occupe de la
livraison avant ? » a donc remonté la chaîne au bon endroit.

**Un trou de backlog est apparu en chemin.** LS-33, commentaire du 29 juillet,
exige l'affichage du suivi « dans l'espace client **et l'administration** ». Au
découpage des epics, seule la moitié cliente avait reçu un ticket, LS-58. La
moitié administration n'existait nulle part : **LS-216** la porte désormais.

Mesure à l'appui, et non supposition : dans tout `src/app/administration/`,
`numeroSuivi` n'apparaît que dans le formulaire de saisie, et `livreA`,
`statutTransporteur`, `synchroniseA` dans aucun rendu. L'exploitante saisit un
numéro de suivi et ne le revoit jamais.

## Le compte existait déjà, les clés non

`README.md` et ADR-035 annonçaient le compte Sendcloud ouvert depuis le
6 septembre. Ce qui manquait était la **paire de clés**, et la distinction
comptait : quatre jours durant, le ticket a pu paraître bloqué par une démarche
commerciale déjà faite.

L'intégration créée s'appelle « Lune-Soleil developpement ». Point relais
activé, **Mondial Relay seul** coché, ADR-035 écartant Colissimo sur son coût,
et **webhook décoché**, arbitrage de Christophe.

**Le webhook a été écarté pour un motif de conception, pas par prudence
vague.** LS-131 est écrite pour une tâche périodique sous verrou. Activer le
webhook ouvrirait un second chemin d'écriture vers `livreA`, non ticketé, non
testé et sans vérification de signature, ce que l'invariant 5 refuse pour
Stripe.

**Sendcloud n'a pas de mode test**, contrairement à Stripe : une même paire de
clés crée de vraies étiquettes facturées. C'est le motif de deux intégrations
distinctes, celle de production restant à créer en LS-153.

## La lecture fautive, et ce qui l'a rattrapée

Le premier appel d'exploration affichait `p.street, p.house_number` séparés par
une virgule. J'ai lu « AVENUE DE LA REPUBLIQUE 911 » comme un seul champ, et
conclu que Sendcloud collait le numéro à la fin du libellé de voie.

**Une protection entière a été bâtie sur cette lecture** : une recherche du
numéro dans la voie avant de l'ajouter, avec son commentaire explicatif, deux
tests et une ligne dans le README de garde.

L'appel de bout en bout a produit `911 AVENUE DE LA REPUBLIQUE`, que j'ai
d'abord pris pour un défaut de mon propre code. C'est en demandant les champs
bruts que la vérité est apparue : **`street` ne porte jamais le numéro**, les
deux champs sont séparés, et l'adresse était juste depuis le début.

**La mesure sur 1040 points de six codes postaux a tranché dans les deux
sens** :

- aucun cas où `street` porte le numéro, la protection était inutile
- **un cas où elle était nuisible**, « RUE DU 8 MAI 1945 » avec un
  `house_number` de « 8 » : elle y voyait un doublon et perdait le vrai numéro
- **16 cas de numéro vide**, « RUE JULES VALLES » sans numéro, ce qui rend le
  repli nécessaire

L'adresse d'un point de retrait est **figée dans la commande** par LS-117. Une
ligne fausse le reste pour toujours sur un document qu'aucune correction ne
modifie.

**La leçon n'est pas « vérifier ses observations », trop vague pour servir.**
C'est qu'un affichage de mise au point qui concatène plusieurs champs sans
séparateur lisible produit une donnée qu'on ne peut plus décomposer. Un
`JSON.stringify` par champ l'aurait montré du premier coup.

## La preuve par mutation a trouvé deux trous

Neuf mutations, **deux vertes** avant correction.

**Le refus HTTP était attrapé par la mauvaise garde.** L'espion rendait
`{error: "unauthorized"}`, qui n'est pas un tableau : retirer `!reponse.ok`
laissait la garde du corps non-liste lever la même erreur. Deux gardes qui se
recouvrent ne se distinguent qu'en donnant au refus un corps que la seconde
accepterait, ici `[]`.

**Le corps illisible n'avait aucun test.** Avaler l'échec de `json()` et
poursuivre avec une liste vide passait au vert. Une passerelle en surcharge qui
rend du HTML avec un statut 200 est le cas réel.

## Trois faux « vert » qui n'en étaient pas

La première série de mutations était écrite en Perl. Trois substitutions ont
**échoué à compiler**, `Unknown regexp modifier "/t"`, et le script a conclu
« VERT, le contrôle ne voit rien » sur des fichiers **jamais modifiés**.

C'est la fiche mémoire « cible de mutation déplacée », rencontrée une fois de
plus : une mutation qui ne change aucun caractère accuse les tests au lieu du
script.

**Le script vérifie désormais que le fichier a réellement changé** avant de
lancer la suite, par comparaison du contenu avant et après. Une ancre
introuvable est signalée comme telle, jamais confondue avec un test faible.

## Ce qui reste pour LS-131

Le vocabulaire des statuts Sendcloud ne ressemble pas à la table des quatre
événements de `legal.md`, et le commentaire du 6 septembre l'avait anticipé.
Consulté via Context7 sur la documentation officielle.

**Trois cas sortent du cadre** : « Unable to deliver », « Refused by
recipient », « Returned to sender ». Un colis refusé ou retourné n'est pas
livré, donc `livreA` reste nul, mais la commande n'est pas non plus en cours
d'acheminement. Ni ADR-025 ni LS-131 ne nomment cet état.

**Le statut du domicile livré reste à identifier.** « Shipment collected by
customer » décrit un retrait en relais, et supposer qu'il vaut pour le domicile
serait exactement le genre d'erreur que LS-131 interdit.

## Vérifications

```
npm run type-check    vert
npm run lint          vert
npm run format:check  vert
npm run test          86 fichiers, 1325 tests, tous verts
verifier-regles.sh    72 dossiers de src/ couverts, 47 services conformes
mutations             9 jouees, 9 rouges apres correction
```

Appel réel, à travers `chercherPointsRetrait` et le fournisseur
d'environnement :

```
disponible : true
points     : 4
  10858167  CAFE DU CENTRE          911 AVENUE DE LA REPUBLIQUE, 64170 ARTIX
  14252372  LOCKER 24/7 SUPER U     51 RUE DES ECUREUILS, 64170 ARTIX
  11772888  LOCKER 24/7 BRICOMARCHE 20 CHEMIN DE LA CAMPAGNE DU BAS, 64150
```

## Un renommage qui touche une règle

`integrations/mondial-relay/` devient `integrations/sendcloud/` : Mondial Relay
reste le transporteur, Sendcloud est le fournisseur d'API.

**Le `paths` de `.claude/rules/legal.md` a suivi.** Sans cette ligne, la règle
qui porte la table des quatre événements ne couvrirait plus aucun fichier de
l'intégration, et personne ne le verrait : c'est la fiche mémoire « couverture
des règles par leur paths ».

`docs/REFERENCES.md` a suivi aussi. Les journaux d'août citant l'ancien chemin
sont **laissés intacts**, la règle de rédaction étant prospective.

## État des tickets

**LS-200** : les sept critères sont remplis, la pull request
[#369](https://github.com/krismos64/lune-soleil/pull/369) attend le vert de la
CI. Les étiquettes sont **différées** et tracées comme telles, critère 7 : elles
coûtent de l'argent réel et supposent le paiement, donc LS-153.

**LS-216** créée, epic LS-5, bloquée par LS-131.

**LS-131 est débloquée** par cette story.

## Prochaine étape

**LS-131**, le suivi automatique. Elle demande d'abord d'établir la
correspondance réelle des statuts Sendcloud vers la table des quatre
événements, et un arbitrage sur les trois cas qu'elle ne prévoit pas.
