# ADR-028 : durée de conservation des avis de consommateurs

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 13 août 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-93 |

## Ce que cet ADR tranche

Deux documents du dépôt disaient l'inverse l'un de l'autre sur la même donnée.

`MODELE-CONCEPTUEL.md`, décision I du 28 juillet 2026, LS-37 : « le délai de
conservation est indéfini, et c'est un choix, pas un oubli », avec sa motivation
et l'alternative écartée.

`REGISTRE-DES-TRAITEMENTS.md`, traitement T7, écrit le 12 août 2026 par LS-90 :
« trois ans après publication, durée retenue par ADR non encore rédigé ».

LS-93 a été ouverte en décrivant le second comme un chiffre sans source à
motiver. **C'était en réalité une contradiction avec un arbitrage déjà rendu**,
que personne n'avait remarquée : le registre a introduit une durée qui contredit
le modèle conceptuel, en s'annonçant lui-même comme provisoire.

Cet ADR confirme la décision du 28 juillet et corrige le registre, plutôt que
l'inverse. Il ne crée pas de règle nouvelle, il rend opposable celle qui existait.

## Contexte

### Ce que la loi impose, et ce qu'elle laisse libre

**Aucun texte ne fixe de durée de conservation pour un avis publié.** Vérifié à la
source le 13 août 2026 :

- le **référentiel CNIL n° 2021-131** du 23 septembre 2021, sur la gestion des
  activités commerciales, cite « la gestion des avis des personnes sur des
  produits, services ou contenus » parmi les finalités couvertes, sans lui
  attacher de durée. **Ses trois ans visent les prospects non clients** et
  l'après-relation commerciale, jamais la publication d'un avis. C'est cette
  confusion qui a produit le chiffre du registre
- le **code de la consommation** n'en fixe aucune non plus

**La loi impose en revanche d'annoncer la durée retenue.** L'article **D111-10**
du code de la consommation, 2° b), exige d'indiquer « dans une rubrique spécifique
facilement accessible [...] le délai maximum de publication **et de conservation**
d'un avis ». Deux délais distincts, et le second est celui de cet ADR.

Cette obligation change la nature de la décision : la durée n'est pas un
paramètre interne, elle **engage vis-à-vis des acheteurs** une fois publiée. Un
délai annoncé puis non tenu est un manquement, pas une négligence.

> **Note de numérotation.** Cet article était **D111-17** jusqu'au 9 juillet 2024.
> Le décret n° 2024-753 du 7 juillet 2024, article 1er, 3°, dispose que « les
> articles D. 111-16, D. 111-17, D. 111-18 et D. 111-19 deviennent respectivement
> les articles D. 111-9, D. 111-10, D. 111-11 et D. 111-12 ». Le contenu est
> inchangé, seule la numérotation a bougé. Le dépôt citait l'ancien numéro à douze
> endroits, corrigés par LS-93.

### Ce que le modèle de données impose

`Avis.ligneCommandeId` est en `onDelete: Restrict` et unique, règle R2 : la preuve
d'achat est **structurelle**, un avis ne peut exister sans la ligne de commande
qui l'a rendu possible. Or cette ligne est immuable et conservée dix ans, article
L123-22 du code de commerce.

Une purge des avis se heurterait donc à une contrainte de base, et devrait choisir
entre supprimer l'avis en laissant la ligne, ou inventer un état intermédiaire.
Ce n'est pas un obstacle décisif, mais c'est un coût réel qui pèse dans la
balance.

## Décision

**Un avis publié est conservé sans limite de durée, tant qu'il reste publié.**

Il ne quitte l'affichage que par une **décision de modération motivée**, statut
`RETIRE` avec `motifDecision` obligatoire, règle R5. Aucune expiration
automatique, aucun statut d'expiration, aucune tâche planifiée de purge.

**La rubrique publique exigée par D111-10 annonce cette absence de limite**, elle
ne la tait pas. Une rubrique muette sur la conservation serait le manquement que
cet article vise, et « sans limite de durée » est une réponse recevable dès lors
qu'elle est vraie et annoncée.

Formulation retenue pour cette rubrique, à reprendre telle quelle par la story qui
écrira la page :

> Les avis publiés sont conservés sans limite de durée. Ils restent en ligne tant
> qu'ils ne sont pas retirés sur décision de modération motivée, et vous pouvez
> demander le retrait du vôtre à tout moment.

**La suppression du compte n'emporte pas celle des avis**, et le modèle le porte
déjà : `Avis.utilisateurId` est en `onDelete: SetNull`. L'avis survit, dissocié de
son auteur, comme la commande l'est par LS-95. Voir la section « Ce que cela
implique » plus bas.

## Motivation

**Le catalogue est fait de pièces uniques.** Faire disparaître un avis ancien
n'appauvrit pas seulement l'information : sur un article vendu à un exemplaire,
l'avis est souvent le seul témoignage existant. Une purge y détruirait une
information qui ne se reconstitue pas.

**Le volume ne justifie aucune minimisation par le temps.** Une boutique
artisanale produira des avis en dizaines, pas en millions. L'argument de
proportionnalité qui fonde une purge de journal technique, LS-94 sur `RateLimit`,
ne se transpose pas ici.

**La donnée reste nécessaire à sa finalité tant que l'avis est publié**, ce qui
est exactement le critère de l'article 5.1.e du RGPD. Une durée fixe couperait la
conservation alors que la finalité, informer les acheteurs, est toujours
poursuivie. C'est le raisonnement inverse de celui de `RateLimit`, dont la
finalité s'épuisait en soixante secondes.

**Le droit d'effacement reste entier et il est le vrai contrepoids.** L'auteur
peut demander le retrait de son avis à tout moment, article 17, sans avoir à
attendre une échéance. Une durée fixe n'aurait rien ajouté à ce droit, elle aurait
seulement supprimé des avis dont personne n'avait demandé le retrait.

**Le coût d'implémentation d'une durée serait réel et sans contrepartie** : un
statut distinguant un avis expiré d'un avis retiré, ces deux faits ne se
justifiant pas de la même façon auprès de leur auteur, une tâche planifiée, et
l'arbitrage du sort de `ligneCommandeId`. Trois pièces de mécanique pour un
bénéfice de minimisation que le volume rend négligeable.

## Alternatives écartées

**Trois ans après publication**, le chiffre du registre. Écarté parce qu'aucun
texte ne l'impose et que sa source apparente, le référentiel CNIL n° 2021-131, ne
dit pas ce qu'on lui faisait dire. Retenir un chiffre par mimétisme avec un
référentiel qui vise autre chose, c'est se donner l'apparence d'une base légale
sans en avoir une.

**Une durée longue, cinq ou dix ans.** Écartée parce qu'elle coûte exactement le
même travail d'implémentation que trois ans, pour un gain de minimisation encore
plus faible : un avis de quatre ans resterait en ligne de toute façon.

**Une dépublication avec conservation en base.** Écartée parce qu'elle cumule les
inconvénients : la donnée personnelle reste conservée, donc rien n'est minimisé,
et l'information disparaît de la fiche produit, donc l'acheteur y perd. Elle
n'aurait servi qu'à afficher une durée dans la rubrique.

## Conséquences

**Aucun code à écrire.** C'est la conséquence la plus notable de cette décision, et
elle est volontaire : la story d'implémentation que LS-93 annonçait « hors
périmètre » n'a pas lieu d'être créée.

**Une mention à publier**, rubrique exigée par D111-10, à porter par la story qui
écrira les pages d'information sur les avis, epic LS-36. Elle doit annoncer les
**deux** délais : celui de publication, encore à fixer et qui reste un paramètre
commercial, et celui de conservation que cet ADR fixe.

**Le registre des traitements est corrigé**, traitement T7, et la ligne de dette
correspondante disparaît de la section « Ce qui reste dû ».

**La décision I du modèle conceptuel est confirmée**, non modifiée. Elle gagne une
référence vers cet ADR, qui la rend opposable au lieu de la laisser dans un
document d'architecture.

## Risques

**Un avis devient inexact avec le temps** sans que rien ne le signale. Un article
dont la fabrication a changé garde les avis portant sur l'ancienne version.
Atténué par l'obligation d'afficher la **date de l'expérience de consommation**,
article D111-10 1° b), qui est déjà tenue : `experienceA` est obligatoire. Le
lecteur date lui-même la pertinence de ce qu'il lit.

**Une demande d'effacement peut arriver longtemps après.** Sans échéance, un avis
de sept ans reste en ligne, et son auteur peut avoir oublié l'avoir déposé.
Atténué par le droit d'effacement, exerçable à tout moment, et par la procédure
écrite de `docs/PROCEDURE-DROITS-DES-PERSONNES.md`, délai d'un mois. Le risque
résiduel est celui d'une personne qui ne pense pas à demander : il est assumé,
l'avis étant public et daté, donc visible d'elle.

**La rubrique peut ne jamais être écrite**, ce qui transformerait une décision
licite en manquement à D111-10. C'est le risque le plus concret de cet ADR, parce
qu'il porte sur une action future et non sur le présent. Atténué en inscrivant la
formulation exacte dans cet ADR plutôt qu'en la laissant à écrire, et en la
rappelant dans le registre des traitements, T7.

**Un volume inattendu changerait la donne.** Le raisonnement s'appuie sur des avis
en dizaines. Un afflux, ou une extension du catalogue à des pièces produites en
série, rouvrirait la question de la proportionnalité. Cet ADR serait alors à
réviser, et non simplement contourné.

## Ce que cet ADR ne tranche pas

**Le délai maximum de publication**, l'autre moitié de l'obligation de D111-10.
C'est un engagement commercial sur le temps de modération, pas une durée de
conservation : il appartient à la story qui livrera la modération des avis, epic
LS-36. Le modèle permet déjà de le mesurer dans les deux sens, `deposeA` pour
alerter avant l'échéance et `decideA` pour démontrer après coup qu'elle a été
tenue.

**Le sort d'un avis dont la variante est archivée.** Une variante n'est jamais
supprimée, seulement archivée, et ses avis restent rattachés. Aucune question de
conservation ne s'y pose.
