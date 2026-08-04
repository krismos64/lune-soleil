# 4 août 2026, le prototype visuel est gelé et capturé, cinq écarts mesurés

| Champ | Valeur |
|---|---|
| Ticket | Aucun au départ, exploration rattachée à LS-15 et LS-16. Quatre créés : LS-84 à LS-87 |
| Documents produits | **`docs/architecture/PROTOTYPE.md`** |
| Documents modifiés | `docs/REFERENCES.md`, `.claude/rules/frontend-design.md` |
| Contrôles | `verifier-config-claude.sh` vert, `verifier-regles.sh` vert, aucun cadratin, accents complets |
| Jira | 4 stories créées, 3 tickets commentés dont une affirmation fausse rectifiée |
| Mémoire | 1 fiche réécrite, 1 fiche créée |

Deuxième session de la journée. Aucune ligne de code applicatif : Christophe a
livré la passe de finition du prototype visuel, et le but était de la capturer
avant qu'elle ne se périme, pas d'écrire l'interface.

## Ce que le prototype vaut, mesuré et non regardé

La vérification a porté sur les deux bundles JavaScript et la feuille de style
servis, pas seulement sur les écrans.

**Palette exactement conforme à ADR-022.** Les sept valeurs principales du
`:root` correspondent. Aucun bleu nuit, aucun dégradé, aucun glassmorphisme,
aucun dégradé métallique.

**Rédaction irréprochable.** Zéro tiret cadratin ou demi-cadratin sur l'ensemble
des textes des deux bundles, tous les accents présents, aucun accord au féminin
par défaut. « Administratrice » est employé, ce qui est l'exception légitime.

**Aucun débordement horizontal à 320 px** sur dix-sept écrans, administration
comprise. La mesure a d'abord été faussée : `window.open` rouvre à 500 px minimum
et rendait un faux « aucun débordement » sur tous les écrans à la fois. Un
résultat parfait obtenu du premier coup méritait la suspicion qu'il a reçue, et
l'émulation d'appareil a donné la vraie mesure.

**Les six états non nominaux existent**, en routes paramétrées, plus deux vues de
rétractation. Le parcours de rétractation n'invente aucune règle juridique : ni
délai, ni déclencheur, ni montant.

Trois formulations rejoignent les invariants les plus délicats et méritent d'être
recopiées telles quelles : « le navigateur ne constitue jamais une preuve de
paiement », « vente refusée, cette variante possède une réservation active » avec
les colonnes Physique, Réservé et Disponible séparées, et « disponible au Point
Relais » distingué de « remise au destinataire ».

## Les cinq écarts

| Écart | Ce qui prime | Suite |
|---|---|---|
| terracotta en 11,52 px gras, sous le seuil AA | ADR-022 | LS-84 |
| aucune région live, trois boutons sans nom accessible | WCAG 2.2 AA | LS-85 |
| adresse de livraison absente du récapitulatif | à vérifier aux sources | LS-86 |
| cinq sections proposées dont « Dimensions » | ADR-026 | LS-87 |
| les deux jetons dorés d'ADR-022 inemployés | rien, choix ouvert | aucun |

## La règle était incomplète, et elle a été franchie 35 fois

ADR-022 dit que le terracotta `#B4643E` est « conforme AA en texte large **ou
gras** seulement ». Le prototype l'applique en 11,52 px gras : du gras, donc
conforme à la lettre.

Et pourtant sous le seuil. Le chiffre manquant est celui du **texte large, 18,66
px en gras**, ou 24 px en graisse normale. Sans lui, « ou gras » se lit comme une
dispense alors que c'est une condition qui s'ajoute à une taille.

Personne n'a triché : la règle a été lue et suivie, et le défaut est apparu
quand même, sur 35 occurrences du site public. Une règle qui énonce une condition
qualitative sans son seuil chiffré n'est pas une protection.
`frontend-design.md` porte désormais le nombre.

### Et j'ai moi-même publié un chiffre faux avant de le mesurer

J'ai écrit **3,94:1** pour le terracotta sur blanc, dans la règle et dans le
document, avant de calculer. La vraie valeur est **4,35:1**.

La conclusion ne changeait pas, les deux étant sous 4,5:1. Le chiffre, lui, était
faux, et un chiffre faux dans une règle se propage ensuite sans être revérifié :
c'est le motif du compte recopié qui n'est pas une mesure, rencontré le matin même
sur `CLAUDE.md` et le README. Corrigé aux deux endroits après calcul.

## Un écart déjà arbitré n'est pas une décision à reprendre

La section « Dimensions » de l'éditeur de produit contredit ADR-026. Premier
réflexe : c'est un arbitrage à demander à Christophe.

Faux. La description de **LS-76, terminée**, portait déjà la phrase : « Le
prototype devra être ajusté sur un point, il propose une section Dimensions par
défaut qu'ADR-026 écarte. Tâche et non décision, hors de cette story. »

Le point était connu, tranché depuis le 30 juillet, et attendait seulement son
ticket. Chercher le ticket existant avant d'ouvrir un arbitrage a évité de
rouvrir un ADR accepté. LS-87 est donc une tâche, et sa description le dit.

## Une affirmation de LS-15 était devenue fausse

Sa description se termine par « aucune vue mobile du prototype n'est disponible,
les six captures existantes sont toutes en desktop ».

Le prototype est maintenant une application navigable, vérifiée à 320 px sur
dix-sept écrans. Rectifié par commentaire, description non réécrite : l'écart
tient en un paragraphe et le reste de la story est juste.

## Ce que le prototype ne doit pas transmettre

Son **code** est à laisser où il est : prix en euros flottants, contraire à
l'invariant 1.

Sa **confirmation de paiement** bascule de « vérification » à « confirmé » après
2200 ms, par un `setTimeout` dans le navigateur. Acceptable en démonstration, et
exactement ce que l'invariant 5 interdit. Le texte de l'écran est juste, la
mécanique le contredit : c'est la mécanique qu'il ne faut pas reprendre.

Ses **données de démonstration** portent une allégation d'origine géographique
côté administration, quand la fiche publique laisse prudemment le point à
confirmer. Le risque est de recopier la première en peuplant le vrai catalogue.
Signalé sur LS-24.

## La question de Christophe a révélé une convention érodée

En fin de session, Christophe a demandé si les tickets étaient bien rattachés à
des epics et reliés entre eux. La mesure a donné pire que sa question ne le
suggérait.

| Tranche | Epic parent | Lien de dépendance |
|---|---|---|
| LS-9 à LS-41 | 31/31 | 20/31 |
| LS-42 à LS-64 | 23/23 | 2/23 |
| LS-65 à LS-87 | 12/23 | **0/23** |

La convention `blocks` existait bien, appliquée systématiquement jusqu'à LS-41.
Elle s'est **arrêtée sans qu'aucune décision ne soit prise**, et personne ne l'a
vu : chaque ticket créé sans lien ressemblait à un cas isolé.

Résultat, **38 tickets déclaraient une dépendance en texte que l'outil
ignorait**, dont la chaîne LS-65 à LS-69 que la mémoire du projet cite pourtant
comme imposée. Les quatre tickets créés plus tôt dans cette session avaient le
même défaut.

Corrigé : onze rattachements, **zéro orphelin restant**, et vingt-cinq liens
`Blocks` sur les dépendances réellement bloquantes. La couverture passe de 22 à
51 tickets sur 77.

Deux choix explicites. Les liens `relates to` entre tickets qui se citent sont
**écartés** : 80 à 100 liens dont beaucoup de bruit, un graphe dense se lit moins
bien qu'un graphe juste. Et **LS-84 à LS-86 restent sans lien à dessein**, leur
bloqueur naturel étant l'implémentation de l'interface, qui n'existe pas encore
comme ticket. Un lien artificiel affirmerait une contrainte d'ordre fausse.

Le sens des liens a été vérifié après le premier plutôt que supposé : le bloqueur
va en `outwardIssue`, le bloqué en `inwardIssue`.

## Prochaine étape

**Inchangée : LS-71**, socle de validation Zod. Cette session n'a pas déplacé la
chaîne de phase 1, elle a mis de côté un actif qui se serait périmé.

Les quatre stories créées ici s'exécuteront **au moment d'écrire l'interface**,
pas avant : LS-84 et LS-85 avec les premiers composants, LS-86 avec le tunnel,
LS-87 avec l'éditeur de produit. Aucune n'est bloquante pour la phase 1.

Le prototype est **gelé**. Le lien reste consultable, et `PROTOTYPE.md` le
remplace s'il disparaît.

## État des tickets

| Ticket | État |
|---|---|
| LS-84 à LS-87 | **Créés**, à faire, aucun bloquant pour la phase 1 |
| LS-15 | À faire, une affirmation rectifiée par commentaire |
| LS-16, LS-24 | commentés, aucune description modifiée |
| LS-71 | À faire, **prochaine étape** |
| LS-72 à LS-75 | À faire, ordre libre |
| LS-79 à LS-83 | À faire, hors chaîne de phase 1 |
