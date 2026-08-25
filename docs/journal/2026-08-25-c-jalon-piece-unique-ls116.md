# 25 août 2026, le jalon qui compte

Troisième session de la journée, après LS-86 et LS-115. Elle livre **LS-116**,
le
test phare du projet.

## Le trou était précis, et le fichier existant le disait

`reservation.sequential.test.ts` prouve la concurrence depuis LS-68, mais il
écrit **lui-même** l'`UPDATE` conditionnel en SQL brut : il valide le SQL du
test. Son en-tête l'annonçait, « ce que ce fichier ne teste pas : le service
applicatif de réservation... il n'existe pas encore ».

Il existe depuis LS-71. La réserve est levée par un fichier neuf, dix tests,
tous
par `reserverPanier`.

## Le critère 7 n'était pas tenu, et personne ne l'avait vu

Un `it.skip` posé sur le test phare passait la CI avec un **code de sortie 0**,
la sortie annonçant tranquillement « 6 passed | 1 skipped ». Le jalon technique
majeur du projet se neutralisait en sept caractères.

`.only` était déjà couvert par Vitest, `allowOnly: !isCI`, et Playwright a
`forbidOnly`. Aucun des deux ne dit rien des `skip`.

Le contrôle neuf distingue deux formes qui se ressemblent : `test.skip("nom",
fn)` désactive un test, `test.skip(condition, raison)` est un skip conditionnel
légitime que le projet emploie trois fois à bon droit. Ma première version les
confondait et signalait trois faux positifs. Corriger le motif valait mieux
qu'exempter trois fichiers, ce qui aurait rouvert le trou ailleurs.

## Trois défauts trouvés par la revue critique

**Le critère 5 ne prouvait pas ce qu'il annonce.** Je comptais les `commande_id`
distincts dans la table `reservation`, ce qui vaut 1 **par construction** dès
qu'une seule réservation subsiste : je mesurais la cardinalité et jamais la
propriété.

L'effet est sérieux. La pièce part sur la commande **perdante** : au webhook du
gagnant, la conversion ne trouve rien, et la pièce reste immobilisée trente
minutes pour une commande jamais payée.

**Le test de rollback ne s'exerçait qu'un tiers du temps.** Il créait la
disponible et l'épuisée sans contrôler l'ordre de leurs UUID, or
`ordonnerLignes`
trie par identifiant croissant : quand l'épuisée passe la première, le refus
tombe avant qu'aucune réservation ne soit écrite. Mesuré sur 40 couples, l'ordre
voulu sort 15 fois.

**Un commentaire promettait une garantie absente.** Le test à trois exemplaires
affirmait fermer la sérialisation excessive. Un `pg_advisory_xact_lock` global
laisse les sept tests verts, les dix acheteurs se disputant la **même** variante
où une sérialisation globale est indiscernable de la contention légitime.

## La mutation non détectée, assumée et écrite

Neutraliser `ordonnerLignes` laisse les dix tests verts, **et ceux de LS-50
aussi**. Mesuré sur 30 essais à stock 1 puis 60 à stock 5 : zéro interblocage.

Les deux `UPDATE` du service s'enchaînent sans rien entre eux, la première ligne
refuse le second panier avant qu'il n'atteigne la seconde, les verrous ne se
croisent jamais. Le test de LS-50 qui rougit sans le tri emploie une
reproduction
locale avec `pauseMs: 300`, qui **fabrique** la fenêtre.

Aucun test n'exerce donc ce tri dans le service réel. C'est écrit dans le
fichier
plutôt que laissé croire.

## Une exactitude que j'ignorais

Le test dit « vingt simultanés » mais le pool de `pg` plafonne à **dix**
connexions, `PrismaPg` ne passant pas de `max`. Dix transactions sont en vol,
jusqu'à sept en attente de verrou sur la même ligne. Écrit dans le fichier pour
que personne ne monte le nombre en croyant renforcer la preuve.

## Preuves

```
322 tests d'intégration, 22 fichiers
types, format, verifier-regles.sh et le contrôle neuf au vert
```

Sept mutations, dont la principale rend une sortie parlante :

```
Raw query failed. Code: 23514
new row for relation "variante" violates check constraint
"chk_variante_pas_de_survente"
```

Sans la garde, c'est la contrainte qui rattrape, en erreur **brute** : le client
verrait une page d'erreur là où le stock était disponible pour l'un des deux.

## État des tickets

| Ticket | État |
|---|---|
| LS-86 | En cours, quatre critères sur cinq |
| LS-115 | Terminé |
| LS-116 | **Terminé**, fusionné sur `main` |
| LS-117 | Débloquée, transaction unique |

## Prochaine étape

**LS-117**, commande et réservation dans une transaction unique, lignes et frais
figés. Trois dettes de la journée y entrent :

- l'expiration de la charge signée du cookie de tunnel, LS-115
- l'appel à `effacerSaisie` une fois la commande écrite, LS-115
- le tri anti-interblocage, qu'aucun test n'exerce dans le service réel

Le critère « aucune commande orpheline » de LS-116 relève aussi de LS-117 : dans
ce fichier, `creerCommande` insère les commandes **hors** de la transaction du
service, donc les deux existent après le test. Ce que le service garantit est
l'inverse, aucune **réservation** orpheline. La commande orpheline ne devient
vérifiable que lorsque sa création entre dans la transaction.
