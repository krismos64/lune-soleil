# 25 août 2026, le tunnel de commande

Deuxième session de la journée, après LS-86. Elle livre **LS-115**, le tunnel de
commande, deuxième story de la phase 3.

## Ce que la story apporte

Les quatre étapes de l'étape 3b du parcours 1 : coordonnées, adresse, mode de
livraison, récapitulatif. Cinq modules neufs, dont la configuration tarifaire
que LS-114 avait délibérément laissée de côté.

Rien n'est écrit en base, ADR-024 réservant la transaction unique à LS-117.

## Le compte Mondial Relay n'existe pas, et le tunnel marche quand même

LS-27 interdit « aucun identifiant fictif, aucune réponse d'API inventée ». Le
fournisseur lève donc, ce qui place le tunnel dans le **cas d'erreur du parcours
1** : la liste des points ne s'affiche pas, le domicile reste proposé, la vente
continue.

Le critère 6, le plus important de la story, se trouve ainsi vérifié dans l'état
réel du système plutôt que par une panne simulée.

## Huit défauts trouvés par les deux revues

`ls-critical-reviewer` a trouvé le plus grave, que la revue frontend avait
manqué : **l'étape 3 n'était jamais exigée**. En sautant l'étape du mode, le
récapitulatif affichait « À domicile » avec ses frais de port et le bouton
légal, alors que personne ne l'avait choisi. Sur un panier sous la franchise,
4,99 € au lieu de 4,10 €, et une commande `DOMICILE` non voulue en LS-117 que le
`CHECK` ne peut pas attraper.

La cause était une valeur par défaut qui mentait : `SAISIE_VIDE` posait `mode:
"DOMICILE"`, donc « non choisi » était indistinguable d'un choix légitime.

**J'ai refait l'erreur en la corrigeant.** J'ai rendu le type nullable sans
changer la valeur, et six tests l'ont montré, le bouton radio restant
présélectionné. C'est exactement le motif que la revue venait de nommer.

`ls-frontend-revue` a trouvé six défauts, dont un récapitulatif complet affiché
sur une saisie vide, et un message d'erreur **en anglais** atteignable par le
client, le `.max()` de `champAdresse` n'ayant aucun message.

## Trois mutations d'abord vertes à tort

Seize mutations écrites. Trois ont demandé de corriger le test, pas le code.

**La borne de temps.** `setTimeout` ramène toute valeur au-delà de 2^31-1 à une
milliseconde : ma mutation rendait la borne plus stricte au lieu de l'enlever.

**L'étiquette de dérivation.** Le test présentait un vrai cookie de panier, déjà
rejeté par le contrôle de forme avant d'atteindre la signature.

**Le montant dans le cookie**, le plus sérieux. Avec un `...saisie`, un montant
fourni par l'appelant était écrit **et signé** dans le cookie, le décodeur le
retirant ensuite. Le test ne regardait que la sortie du décodage.

## Trois fausses pistes que j'ai dû démêler

**Une erreur 500 sur `/commande`.** Les trois variables de tarif manquaient dans
`.env` : build vert, tests verts, page inaccessible. Seule l'exécution le
montrait.

**Un `grep` qui ne trouvait aucun montant.** `Intl.NumberFormat` produit une
espace insécable étroite avant l'euro. Le rendu était correct depuis le début,
c'est la mesure qui était fausse.

**Un nom accessible introuvable.** J'ai supposé un saut de ligne, tenté
`display: inline`, puis une expression JSX. Les deux hypothèses étaient fausses
: l'`ariaSnapshot` a montré une **espace avant la virgule**, faute de
typographie française que la concaténation JSX insère toute seule.

## Un test instable qui cachait un fait réel

`document-title` remontait trois fois sur cinq. J'ai failli le traiter comme du
bruit. La mesure a montré que **le `<title>` est momentanément vide pendant une
navigation client de Next.js**, et que le test s'arrêtait à l'étape `livraison`
au lieu du récapitulatif. Pendant cette fenêtre, un lecteur d'écran annonce une
page sans titre.

## Preuves

```
318 tests Vitest, 313 Playwright dont 38 sur le tunnel
types, lint, format et les deux contrôles du projet au vert
```

Montants vérifiés au rendu réel : 49,00 + 4,10 = 53,10 € en Point Relais, 49,00
+ 4,99 = 53,99 € à domicile, « Offerte » au-dessus de 39 €. Rendu mesuré à 320,
390 et 1280 px, zéro débordement, zéro violation axe-core.

## Une dette tracée, hors périmètre

La charge signée du cookie **ne porte pas d'expiration**. Le `maxAge` est
appliqué par le navigateur seul : un cookie capté reste accepté indéfiniment
côté serveur, ce qui contredit la justification RGPD écrite en commentaire. Le
code décrit une garantie qu'il ne donne pas.

À traiter en LS-117, quand cette charge deviendra la source de la commande
écrite.

## État des tickets

| Ticket | État |
|---|---|
| LS-86 | **En cours**, quatre critères sur cinq, le test des trois modes attend le compte transporteur |
| LS-115 | **Terminé**, fusionné sur `main` |
| LS-116 | Débloquée, test phare de concurrence |

## Prochaine étape

**LS-116**, le test phare de concurrence sur une variante à un exemplaire, écrit
**avant** tout paiement. C'est le jalon technique majeur du projet, et son ordre
n'est pas négociable : il s'écrit avant LS-117 et LS-118.

Deux points hérités de cette session entrent dans LS-117 : l'expiration de la
charge signée, et l'appel à `effacerSaisie` une fois la commande écrite.
