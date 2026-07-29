# 29 juillet 2026, un rapport externe, un vrai défaut et un trou que j'ai ouvert

LS-45. Une relecture externe signale huit points. Un seul tient, et sa correction
en a créé un plus grave, trouvé par la revue critique.

## Ce que valait le rapport

Vérification faite point par point contre le dépôt : **un défaut réel sur huit**.

Le point juste : `StatutPaiement` n'avait pas `PARTIELLEMENT_REMBOURSE`, alors
que le modèle conceptuel, `PARCOURS.md` et `payments.md` l'exigent tous les
trois. Défaut réel, sur la zone paiement, que mes 29 contrôles n'avaient pas vu.

Le point le plus instructif est faux. Le rapport bâtit son argumentation la plus
longue, deux options d'arbitrage et une estimation de 8 à 16 heures, sur un
**ADR-013 qui n'existe pas**. `grep -rn "ADR-013"` sur tout le dépôt : zéro
occurrence. Le dépôt compte quatre ADR, 006, 021, 022 et 023.

Deux de ses trois « bloquants » contredisaient des décisions documentées.
Supprimer `montantAvoirCentimes` défaisait la décision F, arbitrée et classée
niveau 2 la veille. Ajouter taux et inclusion de taxe modélisait une TVA que
l'entreprise ne collecte pas, en franchise en base.

Appliquer ces deux recommandations aurait cassé le modèle. Le tri a pris plus de
temps que la correction.

## Le défaut que j'ai introduit en corrigeant

Ajouter `PARTIELLEMENT_REMBOURSE` a ouvert un trou d'encaissement. `ls-critical-reviewer`
l'a trouvé, je l'ai reproduit :

```
1. pay1 en REUSSI sur la commande
2. second REUSSI            -> rejeté par paiement_reussi_unique, correct
3. pay1 -> PARTIELLEMENT_REMBOURSE, il sort du filtre partiel
4. second REUSSI            -> ACCEPTÉ
```

État final mesuré sur PostgreSQL 18.4 : **3220 centimes encaissés sur une
commande de 1610**.

L'index filtrait `WHERE statut = 'REUSSI'`. Un état ajouté à l'enum devient
automatiquement une sortie du filtre. La séquence n'a rien d'exotique, c'est le
parcours 3, un remboursement partiel suivi d'un second.

Le contrôle V14 existant restait vert : il ne testait que l'insertion frontale
d'un second `REUSSI`, jamais le contournement en deux temps.

**Un prédicat d'index partiel énumère des états. Ajouter une valeur à l'enum
modifie ce que le prédicat laisse passer, en silence.**

## Le contrôle censé tout couvrir en oubliait un

J'ai écrit un contrôle générique des enums, et il avait le défaut exact qu'il
devait supprimer : `OrigineEcriture` n'y figurait pas.

La cause est en amont. Le modèle conceptuel écrit `texte origine` et non
`enum origine` aux trois endroits où il apparaît. J'ai bâti ma table en relevant
les lignes `enum` du document : elle en comptait douze, la base en déclare
treize.

Conséquence : retirer `RECONCILIATION` laissait le script vert. C'est la valeur
dont dépend la règle E5, celle qui ferme le second chemin d'entrée de la
décision D. Sans elle, un webhook tardif envoie une seconde confirmation après
régularisation.

La parade n'est pas d'ajouter la ligne manquante, c'est le contrôle de
complétude : `count(*)` sur `pg_type` comparé au nombre d'entrées de la table.
**Un contrôle censé couvrir tous les enums doit prouver qu'il les couvre tous.**

## Deux colonnes libres décrivant le même fait

`statut_traitement` et `traite_a` n'étaient reliés par rien. Quatre combinaisons
acceptées, dont `TRAITE` avec `traite_a` nul : une reprise filtrant sur
`traite_a IS NULL` rejoue un événement déjà traité, donc un second mouvement de
stock sur un rejeu du prestataire.

`CHECK` d'équivalence ajouté. Le motif est documenté trois fois dans la mémoire
du projet, il s'est reproduit une quatrième.

## Mes propres contrôles, deux fois verts pour la mauvaise raison

Pendant l'écriture, deux défauts du type identifié la veille en LS-13.

`docker exec -i` héritait du stdin de la boucle et avalait la liste : le contrôle
s'arrêtait **après le premier enum sur douze**, en affichant OK. Un contrôle qui
n'examine qu'un douzième de son périmètre et annonce vert.

`mapfile` n'existe pas en bash 3.2, la version livrée par macOS. Le script aurait
cassé sur la machine de développement.

## Vérification

48 réussites, 0 échec. Neuf mutations injectées, chacune fait rougir le contrôle
correspondant, y compris les trois défauts trouvés par la revue. Contre-épreuve :
un enum réordonné ne rougit pas.

## LS-46, une règle fausse en cachait deux autres

Enchaîné dans la foulée. `.claude/rules/database.md` annonçait trois champs
fiscaux, `taxRate`, `taxAmount` et `priceIncludesTax`, dont aucun n'existe. Le
schéma porte `montantTaxeCentimes`, en centimes entiers.

Le ticket exigeait d'auditer tout `.claude/rules/` et pas seulement la ligne
signalée. L'audit a sorti **deux défauts de plus**, dans le même fichier :

| Cité par la règle | Réalité |
|---|---|
| `evenement_webhook` | table renommée `evenement_fournisseur` |
| `quantite_ligne` | colonne réelle `ligne_commande.quantite` |

Les trois champs fiscaux cumulaient trois écarts : noms faux, en anglais alors
que le schéma est en français, et ils appellent un taux décimal et un booléen là
où l'invariant 1 impose des centimes entiers.

La recommandation du rapport externe, ajouter taux et inclusion de taxe à quatre
entités, est écartée : elle modéliserait une TVA que l'entreprise ne collecte
pas. Le rapport pointait la bonne zone dans le mauvais sens, la règle annonçait
des champs surnuméraires plutôt que d'en réclamer.

`scripts/verifier-regles.sh` confronte désormais les identifiants cités par les
règles au vocabulaire du schéma. Purement textuel, ni Docker ni base. 28
identifiants vérifiés, trois mutations le font rougir en nommant fichier et
ligne.

**Une correction manuelle ne se répète pas, un contrôle si.** Troisième fois en
deux jours que ce fichier porte une règle périmée : le filtre d'email en LS-13,
puis ces trois identifiants.

## LS-47, la règle que personne ne lisait

Audit de la configuration Claude Code, demandé par Christophe en fin de session.
Il en sort un défaut qui invalide la justification de LS-46.

Mon premier diagnostic était trop catégorique, et il a fallu deux commits.

**Ce que j'ai affirmé** : les quatre fichiers de `.claude/rules/` ne sont chargés
dans aucune session, `CLAUDE.md` ne les référence nulle part. J'ai ajouté quatre
références `@`.

**Ce que j'avais raté** : chaque règle porte un frontmatter `paths` et se charge
quand une session touche les chemins concernés. Le mécanisme existait, je ne
l'avais pas ouvert avant de conclure. Résultat, `database.md` se chargeait deux
fois, par `paths` sur `prisma/**` et inconditionnellement par `@`.

Même défaut que celui reproché à LS-46, dont la description invoquait un
chargement automatique jamais vérifié. Deux fois en deux heures, sur le même
sujet, dans les deux sens.

**Ce qui reste vrai et justifie le ticket** : `src/` contient un seul fichier.
Trois des quatre règles ciblent exclusivement des chemins qui n'existent pas
encore.

| Fichier | Se charge aujourd'hui ? |
|---|---|
| `database.md` | oui, via `prisma/**` |
| `payments.md` | non, cible `src/integrations/stripe/**` |
| `legal.md` | non, cible `src/services/retractation/**` |
| `frontend-design.md` | non, cible `src/app/**` |

Une session qui conçoit le paiement avant la phase 1 doit donc lire
`payments.md` explicitement. `CLAUDE.md` documente maintenant le mécanisme réel
et cette limite.

Deux autres changements :

- Un hook `PostToolUse` lance `verifier-regles.sh` après toute écriture sur
  `.claude/rules/` ou `prisma/schema.prisma`. Il avertit sans bloquer et reste
  silencieux au vert.
- `verifier-regles.sh` vérifie que chaque règle porte un frontmatter `paths`.
  Une règle sans `paths` ne se déclenche jamais, seul cas d'invisibilité totale.
  Il ne vérifie pas que les chemins existent : ils désignent `src/`, encore vide,
  ce serait rougir sur un état normal.

### Deux partis pris sur le hook

**Avertir sans bloquer.** Une correction en deux temps, renommer dans le schéma
puis dans la règle, passe forcément par un état transitoire incohérent. Un hook
bloquant rendrait cet ordre impossible.

**Silencieux au vert.** Un hook qui parle à chaque écriture devient un bruit
qu'on apprend à ignorer, donc un hook mort.

## LS-48, un second rapport externe, bien meilleur que le premier

Sept points réels sur dix, aucun document inventé, et un défaut technique que je
n'avais pas vu. Le contraste avec le premier rapport est net.

**L'invariant 5 de `CLAUDE.md` contredisait la décision D.** Il affirmait que
tout effet métier est idempotent par identifiant d'événement, thèse que LS-12
avait explicitement écartée. Le risque n'était pas théorique : `CLAUDE.md` est
chargé à chaque session sans condition, alors que `payments.md` ne se déclenche
pas encore, ses chemins `src/` n'existant pas. Une session codant le webhook
aurait lu la version écartée, pas la bonne.

**`verifier-schema.sh` ne s'arrêtait pas quand Docker manquait.** Il affichait
« 7 réussites, 41 échecs ». Les sept étaient des contrôles d'acceptation :
`verifier_accepte` cherche une erreur SQL dans la sortie, et
`docker: command not found` n'en est pas une, donc l'écriture était réputée
acceptée.

C'est le mécanisme exact du `grep violation` corrigé en LS-13, réapparu par un
autre chemin. Quatre gardes ajoutées, toutes fatales, plus `ON_ERROR_STOP=1` sur
les applications `psql`. Les quatre cas testés s'arrêtent avec **zéro réussite
affichée**.

Trois corrections plus modestes : `MODELE-LOGIQUE.md` annonçait seize `CHECK`
pour dix-sept (le compteur est remplacé par la commande qui le calcule), le
README acceptait « Node 22 ou plus » alors que Node 23 casse Prisma 7, et les
descriptions de LS-33 et LS-27 dataient d'avant les arbitrages.

LS-33 était le plus gênant : sa description conservait l'option fondée sur la
date d'expédition, **juridiquement fausse**, la correction ne vivant qu'en
commentaire. Une session future l'aurait reprise.

### Deux points écartés, argumentés

Le rapport voyait une ambiguïté sur `motifDecision`. En pratique la dégradation
d'une pièce *est* le motif de la décision de remboursement, un champ pour un
sens.

Il voyait aussi une contradiction entre l'autonomie de migration et la section
Interdits de `CLAUDE.md`. Vérifié : cette section ne mentionne ni déploiement ni
migration, il n'y a pas de contradiction. Le rapport confondait avec l'instruction
donnée à l'assistant externe. Son lien avec LS-42 reste juste en revanche :
l'autonomie repose sur un script en mode fail-open.

## Où on en est

| Ticket | Sujet | État |
|---|---|---|
| LS-45 | Alignement des enums, V14, cohérence événement | Terminé, fusionné, `52b3680` |
| LS-46 | Identifiants inexistants dans les règles | Terminé, fusionné, `675248c` |
| LS-47 | Chargement des règles et hook de contrôle | Terminé, fusionné, `bfb4c57` |
| LS-48 | Invariant 5, arrêt du script, compteurs, README | Terminé, fusionné, `dcddbec` |
| LS-14 | Diagramme de séquence de l'achat | À faire, débloqué |
| LS-2 | Phase 1, fondations techniques | Prochaine phase |

## Prochaine étape

**LS-14**, le diagramme de séquence de l'achat, ou la **phase 1**.

Les deux scripts de vérification restent **manuels**. Ensemble ils gardent treize
enums, quatre clés d'idempotence, l'invariant V14 et la conformité des règles au
schéma, et rien ne les déclenche. Un contrôle qu'il faut penser à lancer ne garde
rien de façon fiable.

### Arbitrage, brancher ces deux scripts tout de suite ?

Question posée, réponse de Christophe : **non, la chaîne d'intégration reste
entière dans LS-2.**

L'option étudiée était un workflow minimal lançant les deux scripts existants sur
chaque pull request, sans toucher au reste. Faisable : ils ne dépendent que de
Docker et de bash, et ne consomment aucun choix de la phase 1, ni version de
Next.js, ni structure de dossiers.

Ce qui l'a emporté : `CONTRIBUTING.md` décrit une chaîne de huit contrôles dont
**six sont impossibles aujourd'hui**, faute de `package.json`, de TypeScript et
de tests. Le même fichier prévoit déjà que « le détail de la chaîne est mis en
place en phase 1 ». Découper l'intégration continue en deux moments produirait un
workflow partiel à réécrire, pour gagner quelques semaines de couverture sur un
dépôt où seul moi travaille.

Conséquence assumée : jusqu'à LS-2, ces deux scripts se lancent à la main. Les
commandes sont dans `CLAUDE.md`. À lancer après toute modification du schéma ou
de `.claude/rules/`.

---

**Suite le même jour**, `2026-07-29-alignement-sources-verite.md`. Un troisième
rapport externe a précédé le découpage de la phase 1 et produit LS-49 : le
prédicat de paiement corrigé le matin subsistait dans trois documents, dont
`database.md` qui se charge au moment de coder. Deux scripts s'ajoutent aux deux
mentionnés ici, dont la preuve par mutation de `verifier-regles.sh`.
