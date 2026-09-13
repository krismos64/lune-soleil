# 13 septembre 2026, le déploiement, un défaut de l'usage réel, et la suite enfin verte

Session en trois temps : déployer ce que la veille avait fusionné, corriger ce que
Christophe a rencontré en s'en servant, puis fermer l'instabilité des tests.

## Ce qui est livré

| Ticket | Sujet | État |
|---|---|---|
| déploiement | `2e9cd90` vers `e28cb4fe`, migration comprise | **fait** |
| LS-227 | la réauthentification ne ramenait nulle part | **terminé**, PR #424 |
| LS-226 | deux tests mesuraient l'état global de la base | **terminé**, PR #426 |

## Le déploiement, et le garde-fou qui a refusé

Détaillé dans le journal du 12 septembre, qui porte les stories déployées. Le
point à retenir tient en une ligne : **lancé sans migrer d'abord, le workflow
s'est arrêté** sur « migrations attendues 20, appliquées 19, la production n'a
pas été touchée ». L'ordre migration puis bascule est une porte, pas un conseil.

## LS-227, le défaut que seul l'usage réel pouvait montrer

Christophe configure l'adresse de réception des alertes, valide, confirme par
passkey. **Rien n'est enregistré.**

### Ce que la mesure a écarté avant de conclure

```
email_alertes   a-configurer@exemple.invalid
modifie_a       2026-09-12 06:39, soit AVANT la tentative
journal         « Preuve d'identite etablie, moyen PASSKEY », aucune erreur
session         reauthentifiee_le ecrit, fenetre de quinze minutes ouverte
```

Aucun refus n'était en cause, et c'est ce que la lecture du code a établi : un
refus de validation **journalise** « parametres refuses a la validation »,
absent des journaux, et `REFUSE_SEUIL_SOUS_TARIF` ne s'appliquait pas, le seuil
valant 3900 pour un tarif relais de 410.

### La cause, un cul-de-sac

L'écran de confirmation affichait « Identité confirmée. Vous pouvez poursuivre
votre action » **et rien d'autre** : aucun lien, aucune redirection. Le retour à
la main rechargeait le formulaire depuis la base, donc la saisie perdue et
l'ancienne valeur affichée.

**La passkey autorise l'action, elle ne la rejoue pas.** Rien à l'écran ne le
disait.

### Le côté client avait déjà la solution

`compte/reauthentification` accepte une destination **par clé** et y ramène. La
doctrine est écrite dans son propre commentaire : accepter `?retour=<url>` ferait
une redirection ouverte, et filtrer sur « commence par `/` » ne suffirait pas,
`//exemple.fr` étant une URL absolue de schéma relatif.

Le côté administration n'avait rien de tout cela. La correction reprend le motif
tel quel, sur les **trois** écrans concernés : paramètres, remboursement,
rétractations.

## Une garde de sécurité qui n'était testée nulle part

Constat en écrivant le test : **la doctrine côté client vit depuis LS-54 sans
aucun test**. Elle a l'air juste, et rien ne disait qu'elle le restait.

La table est extraite dans un module pur, même motif que `parametres/refus.ts` :
une garde portée par un composant serveur asynchrone ne se teste qu'au prix d'un
rendu complet, donc ne se teste pas.

Vingt cas la couvrent, dont huit formes que le navigateur suit réellement : URL
absolue, schéma relatif, `javascript:`, `data:`, remontée de répertoire, chemin
interne non déclaré.

## Le test de bout en bout s'arrêtait juste avant le défaut

Il vérifiait que le lien « Confirmer mon identité » est **visible**, ce qui était
vrai pendant que le parcours était cassé.

**Un lien visible n'est pas un chemin de sortie.** C'en est la moitié, et c'est
la moitié facile à tester. Le cas neuf suit le lien et vérifie où il mène.

## Quatre mutations

| Cas | Défaut remis | Rouge |
|---|---|---|
| 177 | filtre par clé devient préfixe `/` | **7 tests**, dont les schémas relatifs |
| 178 | paramètre répété non traité | le test du tableau |
| 179 | destination devenue URL absolue | le test de la table |
| D | clé de retour retirée | le cas de bout en bout neuf |

**Le cas 177 est le plus instructif** : « commence par une barre donc c'est
interne » est le raccourci qu'on écrit de bonne foi, et il casse **aussi** le cas
nominal, une clé ne commençant pas par une barre. La mutation est visible des
deux côtés.

## Ce qui reste hors périmètre, et qui se dit plutôt que se taire

**La saisie n'est pas conservée** entre les deux écrans. La corriger demanderait
de persister un brouillon, donc de décider où et combien de temps. Le retour
automatique supprime l'essentiel du coût : l'exploitante retrouve son écran sans
chercher son chemin.

## Déployé dans la foulée, `6ceb5061`

Aucune migration, simple remplacement d'image, la correction n'étant utile qu'en
production, là où le défaut a été rencontré.

```
Étape 5, attente d'un conteneur sain   conteneur sain après 10 s
Étape 6, vérification domaine public   /api/sante rend 200
Étape 8, non-régression SmartPlanning  smartplanning.fr 200, analytics 200
Port 3002 injoignable depuis l'extérieur, conforme.
```

**L'adresse d'alertes est configurée**, vérifié en base à 08h47 : le marqueur
`a-configurer@exemple.invalid` n'y est plus, et les cinq interrupteurs sont
actifs. Les alertes partent réellement, ce qui n'était pas le cas depuis
l'amorçage d'ADR-043.

## LS-226, la sonde qui a tranché

Deux tests passaient **lancés seuls** et rougissaient en suite complète. Le même
commit rendait deux résultats différents à quelques minutes d'intervalle, et
l'échec changeait même de fichier.

**La mesure a remplacé la déduction.** Trois hypothèses ont été essayées et
abandonnées : les deux fichiers soupçonnés de polluer ne suffisaient pas à
reproduire l'échec, et une comparaison par `git stash` s'est révélée invalide,
le travail ayant déjà été commité en `wip`.

Ce qui a tranché est une **sonde écrite sur disque** pendant une exécution
complète, la sortie console étant avalée par Vitest :

```
comptabilite : factures=8 utilisateurs=0
```

**Huit factures d'autres fichiers** étaient présentes au moment où le test
comptable lisait « aucune pièce émise ». Il ne pouvait passer que par chance.

### Les deux corrections

La lecture comptable est bornée par `depuis`, qui porte sur `emiseA` : aucune
pièce antérieure n'entre, quel qu'en soit l'auteur. **Aucun code applicatif
ajouté**, la fonction acceptait déjà une période.

Le compteur d'utilisateurs est filtré sur l'identifiant. **Le premier cas portait
déjà la bonne assertion deux lignes plus bas** : la version globale n'ajoutait
rien, elle apportait seulement la fragilité.

### Ce qui est conservé, et pourquoi

**Le `TRUNCATE` des deux fichiers reste.** Il protège les VOISINS de ce que ces
fichiers écrivent ; il ne pouvait rien contre ce qui les PRÉCÈDE, et c'est la
moitié qui manquait. Un `TRUNCATE` en `beforeAll` a été écarté : il emporterait
les données d'un voisin en cours de suite, défaut rencontré en livrant LS-219.

### La limite de la preuve, dite plutôt que tue

Le cas 180 est inscrit : retirer la fenêtre fait rougir le test **en suite
complète**, et lui seul. Lancé isolément le fichier passe, ce qui est exactement
ce qui a fait prendre l'échec pour un aléa pendant deux jours.

**Le second test n'a pas de cas inscrit.** Son défaut est **latent** dans l'ordre
actuel, aucun voisin ne laissant de compte avant lui aujourd'hui : la mutation
reste verte. Il a été prouvé en **fabriquant** la pollution, compteur ciblé cinq
verts contre compteur global un rouge. Inscrire ce cas ferait tester
l'échafaudage plutôt que le dépôt.

### La suite complète est verte

```
integration, trois executions   947 verts a chaque fois
suite complete                  1702 sur 1702
```

Première exécution intégralement verte depuis deux jours.

## L'état de LS-222, vérifié sans la faire avancer

Arbitrage de Christophe : l'observation sur boîtes réelles se fera plus tard. Le
diagnostic est consigné au ticket pour ne pas être à refaire.

**Rien ne bloque techniquement**, mesuré sur la machine : l'envoyeur réel est
actif, aucune trace de repli sur vingt-quatre heures, les quatre variables SMTP
sont posées, et la tâche d'envoi tourne chaque minute en trouvant la file vide.

**La production n'a jamais envoyé que DEUX emails**, tous deux du 10 septembre,
donc **avant** le gabarit HTML déployé le 12. Les critères 2 et 6 n'ont, à ce
jour, rien à observer : il faut d'abord qu'un geste du site déclenche un envoi.

L'un des deux avait échoué sur `EENVELOPE`, une adresse refusée par le serveur :
c'était l'ancienne adresse d'alertes invalide, corrigée depuis. Ce n'est pas un
défaut ouvert.

## Prochaine étape

**Tout le code est déployé**, `6ceb5061`. L'écart restant entre `main` et la
production ne contient **aucun fichier de `src/` ni de `prisma/`** : des tests,
un script de mutation et de la documentation. Aucun déploiement n'est dû.

**Les deux seuls tickets en cours attendent un geste physique**, aucun ne dépend
du code : LS-222 demande d'**observer** de vrais emails dans trois clients de
messagerie, LS-218 d'expédier un **colis réel**, ce qui ferme aussi le critère 1
de LS-27.

**Les vingt-deux autres tickets ouverts dépendent de l'exploitante**, dont les
dix de l'epic LS-22 : photographies, textes, contenus juridiques.

**La suite de tests est intégralement verte**, 1702 sur 1702, depuis LS-226. Un
échec y est désormais un signal plutôt qu'un bruit de fond.
