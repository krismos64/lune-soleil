# 6 septembre 2026, session E : la bordure des contrôles de saisie, LS-108

Cinquième session de la journée. Une story annoncée comme « cadrée » qui a
demandé **trois écritures successives du même contrôle**, chacune fautive dans
un sens différent.

## Le défaut, mesuré

`--ls-border` vaut `#d9cdba` et sert de bordure aux champs de saisie depuis
LS-100. WCAG 2.2 AA, critère **1.4.11 « contraste des éléments non textuels »**,
exige 3:1 pour la limite d'un contrôle que rien d'autre n'identifie.

| Combinaison | Rapport | Exigé |
| --- | --- | --- |
| `#d9cdba` sur `--ls-surface` `#ffffff` | **1,57:1** | 3:1 |
| `#d9cdba` sur `--ls-background` `#fbf7f0` | **1,47:1** | 3:1 |
| `#d9cdba` sur `--ls-surface-sand` `#f2eadf` | **1,31:1** | 3:1 |

La condition « rien d'autre ne l'identifie » est vérifiée et non supposée : le
fond du champ et celui de la carte qui le porte sont **tous deux**
`--ls-surface`. La bordure est le seul indice de la présence du champ.

## Deux arbitrages rendus avant de coder

**La valeur, `#95836a`.** Le sable a dicté le choix et non le blanc. Deux
candidats plus clairs passaient le seuil sur blanc en échouant sur sable :
`#a89170` donne 3,02:1 sur blanc et 2,53:1 sur sable. Les retenir aurait recréé
exactement le piège de la règle C31, un jeton légitime dont une paire sur deux
est fautive. `#95836a` tient sur les cinq fonds du projet, le plus exigeant
étant le sable à 3,07:1.

**Le périmètre, contrôles seulement.** Remonter `--ls-border` en entier aurait
assombri les quatre-vingt-un séparateurs, cartes et filets du site sans qu'aucun
critère ne l'exige.

## Le contrôle s'est trompé dans les deux sens

C'est le fait marquant de la session. Trois écritures, deux fautes opposées.

**Première écriture : chercher `var(--ls-border)` sur un contrôle.** Elle rate
tout le reste. La revue d'interface a trouvé **trois champs de saisie bordés de
`--ls-text-muted`**, un contournement local posé de bonne foi en attendant ce
jeton, dont le commentaire de `commande.module.css` disait encore « défaut
ouvert en LS-108 ». Ils étaient conformes en contraste, 4,86:1, et parfaitement
invisibles au contrôle. Une couleur écrite en dur passait de la même façon.

**Deuxième écriture : exiger `--ls-border-controle`.** L'erreur inverse, et elle
s'est vue immédiatement : **treize boutons du dépôt bordent avec
`--ls-primary`**, à 8,93:1, parce qu'un bouton primaire porte la couleur de son
propre aplat. Les pousser vers un jeton à 3,66:1 aurait **dégradé** leur
contraste au nom de la conformité.

**Troisième écriture : mesurer la paire.** C'est la règle C31 appliquée à une
bordure. Le jeton existe pour le cas majoritaire ; toute autre couleur est
admise dès lors qu'elle atteint 3:1 sur le fond réellement peint.

Un cas particulier a fallu écrire : un bouton plein bordé de la couleur de son
propre aplat rend 1,00:1 contre lui-même. Ce n'est pas une bordure au sens
visuel, le trait et l'aplat sont une seule surface.

## Le contrôle générique a battu ma liste écrite à la main

Ma liste manuelle comptait 28 sélecteurs. Le contrôle en a trouvé **quatre de
plus** que j'avais ratés, puis un cinquième après l'élargissement aux blocs
d'état. Motif déjà en fiche : une liste écrite à la main est une opinion.

Les exemptions s'écrivent donc **dans le CSS**, par un marqueur
`@bordure-decorative` suivi d'une raison que le script **exige non vide**. Un
marqueur posé seul serait un interrupteur, pas une décision, et n'importe quel
défaut se tairait d'un commentaire de trois mots.

## Un angle mort trouvé et fermé dans la session

La revue signalait qu'un bloc d'état isolé passait vert :

```css
.actionSecondaire:hover { border-color: var(--ls-border); }
```

Ce bloc ne porte ni nom d'élément, ni `cursor`, ni `min-height` : ces propriétés
vivent dans le bloc de base. **C'est la forme exacte que prendra la rechute**, on
ajoute un état à un composant existant, jamais un bloc complet.

La reconnaissance remonte désormais de l'état à sa base, en deux passes, le bloc
d'état pouvant précéder sa base dans le fichier. L'élargissement a fait passer le
contrôle de 94 à **166 sélecteurs examinés**, et il a immédiatement trouvé un
cinquième cas réel sur l'accueil.

## Quatre chiffres faux, tous recopiés

La revue les a tous trouvés, et ils ont une cause commune : aucun n'avait été
relevé après coup.

| Écrit | Réel |
| --- | --- |
| `#d9cdba` sur sable : 1,47:1 | **1,31:1**, le 1,47 est celui de la crème |
| vingt-huit sélecteurs | **trente-cinq** bordures |
| deux blocs `:disabled` | **six** |
| huit écrans | **vingt-cinq** fichiers d'écran |

Le « huit écrans » venait du commentaire de `retractations.module.css`, écrit
quand le défaut n'en concernait que huit, recopié à quatre endroits sans être
remesuré. Le README annonçait par ailleurs « trente-huit scripts dont quatorze de
mutation » quand le dépôt en porte **54 dont 22**.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `npm run test` | **1246 verts** sur 83 fichiers |
| `npm run build` | réussit |
| `verifier-bordure-controle.sh` | 166 sélecteurs, 5 exemptions motivées |
| Mutations sur le contrôle | **9 sur 9**, chacune par son propre message |
| `verifier-contraste.sh` | 178 paires, vert |
| Rendu réel à 320, 390, 768, 1280 px | **44 bordures mesurées, 0 sous le seuil** |

La mesure de rendu est elle-même **prouvée par mutation** : jeton ramené à
`#d9cdba`, reconstruction, et elle rapporte 28 échecs sur 32 avec les 1,57:1 et
1,47:1 du ticket. Sans cette preuve, « 0 sous le seuil » serait indistinguable
d'une mesure qui ne voit rien.

**Un échec de test a été écarté à tort au départ.** La première exécution
montrait 1 rouge sur `jalon-piece-unique`. J'avais lancé deux `npm run test` en
parallèle sur la même base éphémère : `fileParallelism: false` protège des
voisins DANS une exécution, pas entre deux exécutions concurrentes. Le fichier
relancé seul passe, 10 sur 10.

## Vérification visuelle

La frontière actif / désactivé était le point d'incertitude de la revue,
`#95836a` étant au ras du seuil sur sable. Capture à 390 px avec un champ
désactivé posé à côté d'un champ actif : la distinction est **renforcée** par le
changement, l'actif étant nettement plus sombre.

## Propagation

ADR-022 amendé avec ses mesures, règle **C36** posée dans `frontend-design.md`,
les deux scripts déclarés au README avec les comptes relevés, contrôle branché à
la CI en étape **6i bis**. Le commentaire de dette de `retractations.module.css`
est corrigé : il annonçait LS-108 comme ouverte.

## État des tickets

**LS-108 est TERMINÉE**, cinq critères sur cinq.

## Prochaine étape

**LS-196**, le lien d'évitement de la boutique, purement mécanique : LS-194 a
livré le motif correct côté administration, il s'agit d'aligner la boutique et
d'étendre `verifier-lien-evitement.sh` qui s'ancre sur `src/app/administration`
seul. Ensuite **LS-179**, la bascule d'affichage du mot de passe sur quatre
écrans.
