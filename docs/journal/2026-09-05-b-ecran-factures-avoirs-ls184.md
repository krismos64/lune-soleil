# 5 septembre 2026, session B : l'écran Factures et avoirs, LS-184

Deuxième des trois stories du découpage de LS-182, après LS-183 qui a livré le
Catalogue la veille.

## Le défaut qu'elle ferme

**Aucun écran ne listait les pièces comptables.** Elles sont émises depuis
LS-126, numérotées par ADR-031, rendues en PDF par LS-129 et servies au client
par LS-57 et LS-132. L'exploitante, elle, devait **connaître une commande** pour
retrouver sa facture, et retrouver une facture depuis son numéro était
impossible.

L'entreprise est en franchise en base de TVA, ce qui allège les obligations
déclaratives sans supprimer celle de conserver et de présenter les pièces.

## Le point de conception qui commandait tout

**`Facture` et `Avoir` sont deux entités sans ancêtre commun.** Le prototype les
mélange dans une seule liste chronologique, et c'est la forme juste : une
comptabilité se lit par date d'émission, pas par nature de document.

Les deux tables sont donc lues séparément puis fusionnées. Une union SQL brute
rendrait les colonnes typées à la main, ce que `database.md` réserve aux cas où
l'ORM ne suffit pas : ici il suffit, deux requêtes indexées.

**Le signe de l'avoir est posé à la lecture, une seule fois.** Le montant est
stocké **positif** en base, `chk_facture_avoir_borne` le comparant au total de
la facture : le signe ne peut donc pas vivre dans la colonne. Le rendre négatif
au moment de lire évite qu'un appelant l'oublie en sommant, ce qui compterait un
remboursement comme une recette.

## Ce que le prototype a donné, et ce qu'il ne montre pas

Parcouru avant de concevoir, comme le ticket l'exige. Il porte le sur-titre
« COMPTABILITÉ », trois tuiles, un encart de franchise en base de TVA citant
l'article 293 B du CGI, et un tableau à six colonnes où les avoirs figurent avec
un montant négatif.

**Il ne montre aucun filtre par période**, que le ticket exige pourtant. Ajouté :
quatre entrées relatives, « Tout », « Ce mois-ci », « Mois précédent », « Cette
année ». Des périodes absolues auraient produit une liste d'années et de mois qui
grandit sans fin.

**Son bouton « Exporter les documents » est hors périmètre**, le ticket l'écarte.

**Le tableau à six colonnes ne tient pas à 320 px.** Chaque pièce est donc une
carte dont les couples libellé-valeur s'empilent, motif de l'écran des commandes.

## Le fuseau, sujet du module de périodes

« Le mois de juillet » ne veut rien dire sans fuseau. Un serveur en UTC, ce
qu'est la production, ferait commencer juillet à **2 h du matin le 1er juillet**
heure française, et une facture émise à 00 h 30 ce jour-là tomberait dans le
mois de juin.

Trois pièges traités, chacun avec son test :

- le décalage vaut 60 ou 120 minutes selon la saison, donc il se **calcule**
- un mois à cheval sur le changement d'heure a ses deux bornes dans deux régimes
  différents, d'où la reprise du calcul dans `minuitAParis`
- `hour12: false` rend **24** à minuit sur certaines versions d'ICU, jamais 0, et
  passer 24 à `Date.UTC` déborde en silence sur le jour suivant

La borne haute est rendue inclusive d'une milliseconde près : le repository
filtre en `lte`, et prendre minuit du jour suivant ferait tomber une facture
émise exactement à minuit dans **deux** périodes voisines.

## Ce que la revue d'interface a trouvé

**Le défaut principal était dans la preuve, pas dans le rendu.** La base de test
porte une facture **sans PDF et sans avoir** : la branche « PDF indisponible »
était donc la seule jamais rendue, et ni le lien de téléchargement, ni le badge
d'avoir, ni le montant négatif n'atteignaient axe-core ni la mesure de
débordement. Les états que les critères 2 et 3 demandent de vérifier n'étaient
couverts qu'en intégration, côté service.

Le fichier de test greffe désormais ses propres données et les retire, sans
toucher à la fixture partagée qui sert cinq autres fichiers.

**`min-width: 0` manquait sur les couples libellé-valeur.** `overflow-wrap`
agit **à l'intérieur** de la boîte, une fois sa largeur décidée ; un item flex
porte `min-width: auto` et refuse de passer sous la largeur de son contenu. Sur
un nom sans espace, le `dd` pousse la ligne avant que la coupure n'ait lieu.
Motif de LS-171, déjà posé cinq fois dans le dépôt, et cet écran était le seul à
empiler un couple en flex sans lui.

**Un contraste annoncé était faux**, 7,86 pour 8,36:1, dans le sens prudent. Les
neuf autres paires du fichier sont exactes.

**Un écart au prototype n'était pas documenté** : « Total de la période » plutôt
que « Montant encaissé ». Le changement se défend, la tuile portant une somme
signée dont les avoirs sont déduits, mais il devait être écrit.

## Un critère qui aurait été faux ailleurs

Le ticket demande que « la liste plafonne et le dit », motif de LS-163. C'est le
**même critère que LS-183 avait déclaré faux** la veille : `frontend-design.md`
interdit d'introduire un plafond que le schéma ne porte pas, et le catalogue est
borné par le métier à quarante références.

Ici il est **juste** : les factures s'accumulent sans limite, une par commande
payée, pour toujours. Deux situations qui se ressemblent et ne sont pas les
mêmes, et c'est la deuxième fois en deux jours que la distinction compte.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| Vitest | **1164 tests verts**, 76 fichiers, dont 20 neufs |
| Playwright, administration | **273 verts**, trois largeurs |
| `verifier-contraste.sh` | 157 paires, toutes conformes |
| `verifier-navigation-administration.sh` | vert, 15 routes, 10 rubriques |
| `verifier-regles.sh`, gardes, format, lint, types | verts |

**Deux mutations prouvent les tests neufs**, chacune attrapée par les seuls
tests qui la visent :

| Mutation | Test qui rougit |
| --- | --- |
| Signe de l'avoir retiré | 2, le signe lui-même et sa conséquence sur le total |
| Recherche dans la table `avoir` retirée | 1 seul, le téléchargement d'un avoir |

## Trois routes PDF coexistent désormais, et c'est voulu

`compte/commandes/[id]/facture` sert le client **connecté** par sa session,
`facture/[jeton]` le client **sans compte** par un jeton signé, et la neuve sert
l'**exploitante** par son rôle. Trois preuves pour trois populations.

**Une pièce dissociée reste servie côté administration**, et c'est l'inverse du
côté client : un compte supprimé ne reçoit plus ses documents, LS-57, quand
l'exploitante doit pouvoir présenter les siens, article L123-22 du code de
commerce, dix ans.

## Ce qui n'est pas fait

**Aucun contrôle visuel dans un navigateur.** Trois points signalés par la revue
restent à regarder à l'œil : un nom de client long à 320 px une fois le
`min-width` posé, la carte d'un avoir avec son montant négatif au format
français, et la tuile de total avec un montant à cinq chiffres.

## État des tickets

**LS-184 est TERMINÉE**, onze critères sur onze. **LS-180 close**, **LS-189 et
LS-190 créées**.

## Prochaine étape

**LS-185**, l'écran Clients, dernier du découpage de LS-182. Elle commence par un
arbitrage RGPD sur ce qu'il est légitime d'afficher, tranché par Christophe le
5 septembre : vue complète du client, avec un ADR qui écrira la finalité de
chaque champ.
