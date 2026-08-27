# 27 août 2026, les trois dernières phases sont découpées

Session de cadrage sans code, demandée par Christophe après la clôture de la
phase 3 : vérifier que les tickets couvrent le produit final, et créer ce qui
manque. **Dix-sept stories créées** : LS-128 à LS-142 pour les trois phases,
plus LS-143 et LS-144 pour deux points laissés en suspens par LS-121.

## Ce que la vérification a trouvé

Le backlog paraissait complet parce que les épics existaient tous. Confronter les
61 tickets ouverts à `PARCOURS.md`, `PROTOTYPE.md` et aux descriptions d'épics a
montré autre chose.

| Epic | Stories filles avant | Ce que la description annonçait |
|---|---|---|
| LS-5, phase 4 | 8, aucune issue d'un découpage | parcours 4 entier |
| LS-6, phase 5 | **0** | 130 lignes de parcours, machine à états complète |
| LS-7, phase 6 | 2 | **douze sujets** |

LS-2, LS-3 et LS-4 avaient été découpés en 11, 8 et 9 stories avant d'être
attaqués. Les trois suivants ne l'avaient jamais été, et personne ne l'avait
décidé : c'est le même motif d'érosion silencieuse que la convention des liens
Jira, mesurée le 4 août.

**Les huit stories de LS-5 étaient arrivées une par une**, par effet de bord
d'autres sessions. LS-126 en clôturant LS-119, LS-97 et LS-98 en inventoriant le
prototype. Aucune n'était le produit d'une lecture du parcours 4, et il y
manquait l'avoir, le PDF, l'expédition et l'accès aux documents.

## Le trou le plus coûteux était LS-6

Zéro story pour une obligation légale dont la sanction est chiffrée : l'article
L221-20 porte le délai de rétractation de quatorze jours à **douze mois** quand
l'information est absente ou incorrecte, sur toutes les commandes concernées.

Quatre stories la couvrent désormais. Le découpage a séparé deux choses qui se
ratent indépendamment : **la fonctionnalité** (LS-134) et **l'information**
(LS-136). Un site dont le formulaire marche parfaitement mais qui a oublié une
mention subit la sanction entière.

**Le calcul du délai est une story à part**, LS-133, parce qu'il sert trois
appelants : l'affichage au client, l'acceptation d'une demande, le refus d'une
demande hors délai. Trois implémentations produiraient un écran qui annonce une
date et un service qui en applique une autre.

## LS-33 était présentée comme non prise, à tort

Le journal de ce matin et la table des transitions de LS-121 disent que la
décision de LS-33 n'est pas prise. **`.claude/rules/legal.md` la porte depuis le
28 juillet 2026**, avec la table des quatre événements Mondial Relay dont un seul
renseigne `livreA`.

L'écart a été signalé à Christophe plutôt que résolu en silence, et son arbitrage
est net : la décision tient. LS-131 porte l'implémentation, LS-33 reste ouverte
pour la seule souscription de l'offre Start.

LS-121 avait raison sur le fond, `LIVREE` ne doit pas être atteignable d'un clic.
Le motif change : « LS-131 le renseignera » et non « la décision manque ».

## Trois arbitrages demandés, trois pris

Christophe a tranché avant l'écriture des tickets plutôt qu'après.

| Question | Décision |
|---|---|
| LS-33 | la décision tient, requalifier en story d'implémentation |
| bibliothèque de rendu PDF | trancher par un ADR dans la story, pas maintenant |
| mesure d'audience | story avec ADR préalable, contrainte « pas de service tiers » |

Les deux ADR sont portés en critère d'acceptation, LS-129 et LS-141 : la première
ligne de code attend la décision écrite.

## Le lien Jira était encore à l'envers

Deux fiches mémoire se contredisaient sur le sens de `createIssueLink`. Celle du
4 août dit bloqueur en `outwardIssue`, celle du 10 août dit l'inverse, et la
description de l'outil dit encore autre chose.

Le premier lien posé a tranché : **`inwardIssue` porte le bloqueur**, la fiche du
10 août a raison. Le lien inversé a été supprimé puis reposé, et **les quatorze
liens ont été relus un par un** plutôt que supposés corrects après vérification
du premier.

La fiche du 4 août est corrigée, sa section sur le sens des liens étant fausse.

## Un compte du README était périmé

Le tableau d'état annonçait « sept stories ouvertes » en phase 2. Jira en compte
**huit** depuis la création de LS-127 hier soir. Le compte a été relevé dans Jira
et non de mémoire, ce que la table de propagation du skill exige précisément pour
cette raison.

## Deux tickets de plus, demandés en fin de session

Les deux points relevés par la revue frontend de LS-121 et laissés sans ticket
sont entrés à leur tour, sur demande de Christophe.

**LS-143**, le `default` de `formaterOrigine`. Le code a été relu avant d'écrire
le ticket, et le défaut est réel : une quatrième valeur de `OrigineEcriture`
s'afficherait « Système » sans qu'aucun test ni aucun type ne bronche. C'est la
**troisième forme** du même piège ici, après le prédicat d'index partiel et
l'affichage d'enum. La story demande une exhaustivité vérifiée à la compilation,
et le recensement des autres `switch` portant le même angle mort.

Le repli de `traduireStatut`, juste à côté, est **délibéré et commenté** : les
colonnes d'historique sont typées `string`, un statut disparu doit s'afficher.
La story dit explicitement de le conserver.

**LS-144**, la découvrabilité des filtres à 320 px. La relecture du CSS a
**corrigé l'énoncé du défaut** : le débordement est déjà traité correctement,
`overflow-x` sur le conteneur et non sur la page, zones tactiles à 44 px. Le
sujet réel est que sept filtres ne tiennent pas sur une ligne et que rien ne
signale ceux qui dépassent. Le ticket dit de ne pas défaire le choix existant, et
prévoit une porte de sortie : si le constat à 320 px montre que le défaut n'en est
pas un, la story se ferme sur ce constat.

## Un écart trouvé en écrivant LS-141

`README.md` et `.claude/agents/ls-conteneurisation.md` annoncent tous deux
**« Umami auto-hébergé »** en mesure d'audience. **Aucun ADR ne le décide**, et
aucun document d'architecture ne le mentionne.

C'est une pré-décision de stack jamais formalisée. Signalée en commentaire sur
LS-141 plutôt que résolue en silence : l'ADR de cette story ne part donc pas
d'une page blanche, il confirme ou infirme Umami en énonçant les raisons. Les
deux mentions ne sont pas retirées, elles témoignent d'une intention réelle et se
mettront à jour avec l'ADR.

## Preuves

```
./scripts/verifier-jira.sh    zéro orphelin sur les 17 stories créées
                              1 signalement résiduel, LS-68, story terminée
liens vérifiés                14/14 dans le bon sens, relus un par un
stories rattachées            24/24 sur LS-5, LS-6 et LS-7, plus 2 sur LS-3
assignation                   17/17 à Christophe
```

Aucun test à jouer, cette session ne touche pas au code.

## État des tickets

| Ticket | État |
|---|---|
| LS-5 | découpée, cinq stories créées, commentaire de découpage posé |
| LS-6 | découpée, quatre stories créées, elle ne portait rien |
| LS-7 | découpée, six stories créées |
| LS-33 | requalifiée, décision confirmée, reste la démarche commerciale |
| LS-128 à LS-142 | créées, assignées, liées |
| LS-143, LS-144 | créées, rattachées à LS-3, sans lien Blocks, corrections indépendantes |
| LS-141 | commentaire d'écart sur Umami annoncé sans ADR |

## Prochaine étape

Le chemin jusqu'au Go-Live est visible d'un bout à l'autre. **LS-82**, l'envoi
réel des emails, reste la story la plus utile à prendre maintenant : priorité
haute, aucune dépendance externe, et le client ne reçoit aujourd'hui aucune
confirmation de commande.

**LS-126** ouvre l'autre chaîne, celle des documents comptables, et referme la
troisième des quatre clés d'idempotence que LS-119 a laissée non exercée.

Les comptes Stripe et Mondial Relay Pro vont être ouverts, ce qui débloquera
LS-18 puis LS-131.
