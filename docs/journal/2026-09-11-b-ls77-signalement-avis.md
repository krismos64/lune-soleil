# 11 septembre 2026, b : LS-77, le signalement d'un avis

Un Must sur Go-Live qui n'avait aucun objet tant que les avis n'existaient pas.
LS-61 fusionnée le matin même l'a rendu réalisable, et il se serait payé cher :
publier des avis sans canal de signalement expose à un manquement dès le premier
jour d'ouverture.

## Le texte vérifié à la source, et trois mots qui portent du code

Article L111-7-2, vérifié à Légifrance, **version en vigueur depuis le 17 février
2024** :

> Elle met en place une fonctionnalité **gratuite** qui permet aux
> **responsables des produits ou des services** faisant l'objet d'un avis en
> ligne de lui signaler un doute sur l'authenticité de cet avis, à condition que
> ce signalement soit **motivé**.

Le ticket laissait trois points à trancher. Les trois se tranchent en lisant le
texte plutôt qu'en arbitrant du goût.

**« Gratuite » décide de l'authentification.** Les personnes que le texte vise ne
sont pas clientes de la boutique et n'ont aucun compte ici : exiger une
authentification restreindrait un droit que la loi ouvre. Le formulaire est donc
public, avec les trois couches anti-robot du contact, qui sont son seul rempart.

**« Motivé » décide de la contrainte.** Le motif est obligatoire en Zod **et**
par le CHECK C42. Un champ vide n'est pas un signalement au sens du texte.

**« Signaler un doute » décide de ce que le code ne fait pas.** Un signalement ne
dépublie jamais l'avis. C'est la propriété la plus importante de cette
fonctionnalité, et sa violation la plus tentante : le formulaire étant public et
sans compte, une dépublication automatique en ferait un moyen de retirer les avis
d'un concurrent, en trois clics.

## Le délai de traitement, tranché par l'absence

Aucun délai n'est annoncé, et c'est un choix motivé. Le texte n'en impose pas,
contrairement au délai de **publication** d'un avis, que l'article D111-10 exige
d'annoncer et que LS-61 a fixé à sept jours.

Annoncer un délai qu'aucune loi n'impose créerait une obligation de plus,
tenable seulement par une personne qui relève ses signalements entre deux
marchés.

## La contrainte a eu raison contre mon code

Ma première version de la clôture écrivait le statut, puis la date, en deux
instructions séparées. C'est le patron que `publieA` utilise sur un avis, où il
protège la date de première publication.

Le CHECK C43 a refusé aussitôt : il est une **équivalence** vérifiée ligne à
ligne, donc un statut d'examen sans date n'existe pas une microseconde. Les deux
colonnes s'écrivent ensemble, et la lecture préalable devient nécessaire pour ne
pas réécrire la date du premier examen.

**C'est précisément le rôle d'un CHECK, et l'absence de son équivalent sur
`Avis.motifDecision` explique pourquoi le défaut d'écrasement y avait vécu**
jusqu'à la revue critique de la nuit. Une contrainte de base ne se contente pas
d'attraper les défauts des autres : elle attrape ceux de la session qui l'écrit.

## Ce qui a été extrait plutôt que recopié

`adresseAppelante` vivait dans `contact/actions.ts` depuis LS-97. Un second
formulaire public en a besoin, et deux copies de cette règle divergeraient au
premier ajustement : elle passe dans `src/lib/`, motif « élargir la source
plutôt qu'exempter » que ce dépôt applique déjà à ses contrôles.

Le module d'instant d'ouverture, lui, **n'a pas été partagé**, et c'est assumé :
deux fichiers d'une ligne valent mieux qu'un module commun dont le nom devrait
couvrir les deux usages sans en nommer aucun. La fonction ne porte aucune règle
susceptible de diverger.

## Deux contrôles ont attrapé les mêmes oublis que la veille

`verifier-propagation-docs.sh` a vu mes deux schémas Zod absents de
`VALIDATION.md`. `verifier-registre-traitements.sh` a vu la table
`SignalementAvis` absente du registre, qui gagne une fiche T7bis : base légale
**obligation légale** et non intérêt légitime, l'article imposant la
fonctionnalité.

Ces deux contrôles ont maintenant attrapé le même oubli deux fois en deux
stories. Ce n'est pas une négligence isolée, c'est que la propagation
documentaire ne se déclenche par aucun réflexe : seuls ces scripts la rendent
visible.

## Ce que la fiche mémoire des parcours annonçait de faux

Elle disait « sept parcours, un huitième à écrire » alors que le document en
portait neuf, puis dix avec celui-ci. Elle est réécrite pour **mesurer** au lieu
d'écrire, `grep -cE '^## Parcours'`, motif que `REFERENCES.md` applique déjà.

## Vérifications

```
npm run type-check                     vert
npm run lint                           vert
npm run format:check                   vert
npm run test                           91 fichiers, 1469 tests
vitest avis (intégration)              37 tests
npm run db:verifier                    118 réussites, 0 échec
verifier-regles.sh                     règles conformes au schéma
verifier-propagation-docs.sh           26 schémas, tous présents
verifier-registre-traitements.sh       37 tables rangées
verifier-contraste.sh                  toutes paires conformes
verifier-bordure-controle.sh           seuil 3:1 tenu
verifier-loading-et-404.sh             conforme
verifier-lien-evitement.sh             conforme
verifier-actions-sensibles.sh          cohérentes
verifier-revalidation-layout.sh        conforme
```

## État des tickets

**LS-61 FUSIONNÉE** sur `main` en rebase, PR #381, les huit contrôles de
CONTRIBUTING au vert.

**LS-77 développée**, epic LS-36. La fonctionnalité existe, elle est gratuite,
sans compte, motivée et traitée par un écran d'administration.

## Prochaine étape

**LS-190**, la frise d'étapes du détail de commande client, débloquée par LS-58.
Ou **LS-109**, la reprise d'un média bloqué en `EN_ATTENTE`.
