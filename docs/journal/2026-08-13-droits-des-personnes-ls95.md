# 13 août 2026, LS-95, les droits des personnes deviennent exerçables

Deuxième session du jour, après les cinq stories qui ont constaté la porte de
sortie de la phase 1. LS-95 lève la dernière dette du registre des traitements et
fait naître la première action sensible réelle du dépôt.

## Ce qui est livré

Un client supprime son compte lui-même depuis `/compte`, avec confirmation
explicite, saisie d'un mot à recopier, et **preuve d'identité récente**. La
procédure de réponse aux demandes d'accès, de rectification et d'effacement vit
dans `docs/PROCEDURE-DROITS-DES-PERSONNES.md`, délai d'un mois compris.

## La tension du ticket, traitée et non contournée

**Le droit à l'effacement ne prime pas sur l'obligation comptable.** L'article 17
paragraphe 3 point b l'écarte quand la loi impose la conservation, et l'article
L123-22 du code de commerce impose dix ans sur les factures.

Ce que la suppression produit est donc une **dissociation** :

```
PART      carnet d'adresses, sessions, comptes d'authentification,
          passkeys, et l'enregistrement Utilisateur lui-meme
RESTE     commandes, factures, avis publies, journaux, anonymises
```

Supprimer une commande serait une infraction comptable ; ne rien dissocier
viderait le droit de son sens. Chaque test vérifie **les deux sens** : les
séparer laisserait un test vert sur une suppression qui n'efface rien, et l'autre
vert sur une suppression qui efface tout.

**L'ordre est imposé et il ne se devine pas.** `Commande.dissocieA` se marque
avant la suppression : `ON DELETE SET NULL` remet `utilisateurId` à nul mais ne
sait pas écrire un champ. Sans ce marquage, la commande redevient « sans
propriétaire », donc éligible au rattachement du parcours 6 : l'historique et les
factures d'un client parti rouvriraient à quiconque contrôle ensuite la même
adresse email, règle V15.

**Le journal des connexions survit volontairement**, en `SET NULL`. Un intrus qui
compromet un compte ne doit pas pouvoir effacer ses traces en le supprimant. Un
test le verrouille : sans lui, un `CASCADE` ajouté par inadvertance ne ferait
rougir aucun autre test, la suppression continuant de « fonctionner ».

## La première action sensible réelle du dépôt

Le mécanisme existait depuis LS-81 et son écran depuis LS-89, sans que rien ne
l'exerce : les quatre familles étaient en dette, et sept critères attendaient
exactement cela.

**Famille `IDENTIFIANTS`, pas une cinquième.** Le ticket laissait le choix. Elle
est définie comme « changer le mot de passe ou la passkey : ce qu'un intrus fait
en premier », et supprimer un compte emporte l'ensemble des moyens
d'authentification, `Compte` et `Passkey` en `CASCADE`. Une famille pour une seule
action se paierait en saisies quotidiennes sans rien protéger de plus.

**La garde vit dans le service, pas dans la Server Action.** Une garde posée dans
un adaptateur lit `next/headers`, indisponible hors requête : elle serait
inexerçable par un test d'intégration, donc une discipline plutôt qu'une propriété
mesurée. Le fichier de garde de `services/` dit d'ailleurs la même chose,
l'adaptateur ne décidant de rien.

Le contrôle a **refusé la ligne de dette dès que l'action a existé**, sens 3 :
c'est ce sens qui empêche ce fichier de devenir une décharge qui exempte à vie.

## Un défaut du contrôle, trouvé en l'utilisant pour de vrai

`verifier-actions-sensibles.sh` bornait le corps de la fonction à la première
ligne recommençant en colonne zéro après la marque. Sur une signature que Prettier
étale sur trois lignes, forme normale dès que le type de retour est long :

```
export async function supprimerMonCompte(      <- « corps commencé »
  enTetes: Headers,
): Promise<ResultatSuppressionGardee> {        <- colonne zéro, ARRÊT
```

l'extraction s'arrêtait **avant la première instruction**. Le contrôle refusait
une action parfaitement gardée, et son message était indiscernable d'un vrai
défaut : « action `@sensible` sans appel à `exigerReauthentificationRecente` ».

**Le piège tenait à ce que la seule façon de le contenter était d'écrire la
signature d'un seul tenant, que `npm run format` re-découpait aussitôt.** Le
contrôle et le formateur se contredisaient, et la victime aurait été le contrôle :
on finit par retirer la marque plutôt que par comprendre.

J'ai buté trois fois dessus avant de comprendre que le défaut était dans le
contrôle et non dans mon code. Corrigé : `vu` ne passe à vrai qu'après une ligne
portant `{`.

**Un neuvième cas de mutation le verrouille, et il exige un SUCCÈS.** Un faux
positif est aussi grave qu'un faux négatif, et plus insidieux : il pousse à
retirer la marque. Le cas rougit contre l'ancienne version, 8/9, et passe contre
la corrigée, 9/9.

## Un compte périmé, encore

`.claude/rules/database.md` disait « les six autres références » depuis LS-41. Il
y en a **onze**, douze au total, mesurées sur la base et non recomptées de
mémoire. Les tables ajoutées depuis n'ont pas fait suivre le compte.

Un test interroge maintenant `information_schema` et vérifie la **cardinalité** :
une référence ajoutée sans politique explicite vaudrait `RESTRICT` par défaut,
donc **bloquerait toute suppression de compte**, sans qu'aucun test fonctionnel ne
le montre tant que la table reste vide.

## Une mutation qui ne mutait pas ce qu'elle annonçait

**Le même piège s'est refermé deux fois, dans les deux sens.**

Premier essai : charger `comptes: true` dans le `select` seul, en croyant faire
fuiter l'empreinte du mot de passe. Resté **vert**, à juste titre : le compte rendu
est construit **champ par champ**, donc charger une relation ne la fait pas sortir.

Second essai, passé au script permanent : recopier l'objet, `...utilisateur`, sans
le `comptes: true`. Le script a annoncé « NON détecté, le test est aveugle » sur
les 56 cas, et le test n'y était pour rien : sans la relation chargée, l'objet ne
contient aucune empreinte, donc le recopier ne fait rien fuiter.

**Aucune des deux moitiés ne suffit, et le défaut réalisable exige les deux
ensemble** : quelqu'un ajoute `comptes: true` pour enrichir l'export, et recopie
l'objet pour économiser six lignes. Le cas porte désormais les deux substitutions,
et il rougit.

C'est le motif déjà connu, rencontré deux fois de suite : **suspecter la mutation
avant le test**, et vérifier qu'elle atteint bien le chemin de sortie.

## L'analyse de secrets a refusé la PR, deux fois

**Premier refus.** Le test de fuite écrivait une valeur témoin dans la colonne de
mot de passe, d'un seul tenant. La valeur est inventée, mais le dépôt est
**public** et l'analyse ne peut pas le deviner : c'est le bon comportement, un
faux positif toléré apprend à ignorer l'alerte et c'est le vrai secret suivant qui
passe. Valeur et nom de colonne sont donc assemblés, même traitement que l'URL de
connexion en morceaux dans le workflow d'intégration continue.

**Second refus, et il était de ma main.** Le commentaire qui expliquait cette
correction **citait la forme interdite**. C'est le piège du hook qui bloque sa
propre explication, déjà rencontré en LS-73, dans sa version distante.

Deux choses s'ajoutaient : l'analyse porte sur **tous les commits de la branche**,
donc la ligne d'origine restait vue même après correction du fichier, et il a fallu
réécrire l'historique en deux commits propres où la forme n'a jamais existé.

**La reformulation ne devait pas neutraliser le test**, ce qui aurait été le pire
résultat. Vérifié plutôt que supposé : il rougit toujours sur la mutation qui ferait
fuiter l'empreinte.

## Ce qui reste hors périmètre, et pourquoi

`/compte` porte le strict nécessaire aux droits des personnes. **Ce n'est pas
l'espace client de LS-36**, qui portera l'historique des commandes, le carnet
d'adresses et les avis. Écrire davantage aurait modifié le périmètre du cahier des
charges sans arbitrage.

L'export d'article 15 n'est déclenché par aucun écran : le ticket l'admettait, et
une demande d'accès se compte en unités par an sur une boutique de cette taille.
Le délai d'un mois laisse largement le temps d'un traitement manuel.

## Traçabilité

| Canal | État |
|---|---|
| Dépôt | **PR #103 fusionnée** sur `main` en rebase, deux commits, dernier `d1614c1` |
| Journal | cette page |
| Mémoire | fiche d'état réécrite, plus `suppression-est-une-dissociation` et `marque-sensible-et-prettier` |
| Jira | **LS-95 en Terminé**, commentaire critère par critère. LS-81 et LS-89 restent **En cours**, leurs critères désormais débloqués |

## Chiffres

De 262 à **271 tests**, de 33 à **42 e2e**. De 52 à **56 cas de mutation**, plus un neuvième cas sur le contrôle des
actions sensibles. Le cas 56 a dû être corrigé après un premier passage rouge,
sa mutation n'exprimant aucun défaut réalisable. Rendu vérifié aux quatre
largeurs, aucun débordement à 320 px avec une adresse email longue, contrastes
mesurés à 6,56:1 et 10,83:1.

## Prochaine étape

**LS-81 et LS-89 peuvent être reprises** : leurs sept critères en dette attendaient
une action sensible réelle, qui existe désormais. Les critères 3 et 4 de LS-81,
les critères 2, 3 et 6 de LS-89 sont couverts par cette story ; les critères 6 et
7 de LS-81 restent à vérifier sur cette action.

**LS-93** reste la dernière dette du registre : la durée de conservation des avis,
posée à trois ans sans texte qui l'impose. Un ADR doit trancher.
