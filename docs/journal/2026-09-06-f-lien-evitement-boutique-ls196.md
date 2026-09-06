# 6 septembre 2026, session F : le lien d'évitement de la boutique, LS-196

Sixième session de la journée. Une story annoncée comme « purement mécanique »
qui a trouvé **trois écrans cassés**, produit **une correction perdue par mon
propre outillage**, et révélé une **preuve par mutation qui ne prouvait rien**.

## Ce que le ticket demandait

Le lien d'évitement de la boutique, posé en LS-122, divergeait de celui de
l'administration, posé en LS-194, sur cinq propriétés sans qu'aucune raison soit
écrite. Deux étaient des défauts réels : la zone tactile, environ 24 px de haut
quand `frontend-design.md` en exige 44, et le retour à `left: 0` qui coupe le
contour de focus.

Mesuré sur le rendu réel, avant correction : **25,59 px** de haut, `x = 0`.

## Étendre le contrôle a payé immédiatement

`verifier-lien-evitement.sh` s'ancrait sur `src/app/administration` seul, tout en
annonçant « chaque écran porte sa cible focalisable ». L'étendre à la boutique a
trouvé **trois écrans qui rendaient un `<main>` nu** : `catalogue/error.tsx`,
`catalogue/loading.tsx` et `produit/[slug]/error.tsx`. Le lien d'évitement y
menait nulle part, exactement le défaut que LS-191 avait laissé de l'autre côté.

Un quatrième est venu de la revue : **`not-found.tsx`** compose `EnTeteBoutique`
lui-même, hors du groupe de routes, donc il portait le lien sans qu'aucun
contrôle ne garde son ancre. La recherche se fait désormais par **ce qui rend
l'en-tête**, jamais par l'arborescence seule. 54 écrans couverts, 25 + 28 + 1.

## J'ai perdu ma propre correction

**Le point le plus grave de la session.** J'avais ajouté
`(boutique)/catalogue/error.tsx` à la liste `MUTABLES` du script de mutation,
puis lancé ce script **avant** de commiter. Sa restauration par
`git checkout HEAD` a rendu la version d'avant mon travail.

Résultat : le contrôle livré par la story **échouait sur son propre dépôt**, sur
le défaut exact qu'elle prétend fermer. C'est la fiche mémoire « travail non
commité perdu », reproduite à l'identique, quelques heures après l'avoir relue.

## La preuve par mutation annonçait « 8 sur 8 » sur un contrôle rouge

Et c'est le second enseignement, plus large que la story. `jouer()` n'exigeait
que deux choses : un code de sortie non nul, et le motif attendu présent. Le
défaut préexistant remplissait **déjà les deux**.

Le cas 8 était le plus trompeur. Son `perl` cherchait
`<main id="contenu" tabIndex={-1} ...>`, forme absente du fichier puisque
l'ancre avait disparu : **la substitution ne mutait rien**, et le message attendu
venait du défaut qui traînait. Motif « cible de mutation déplacée », aggravé par
l'absence de garde d'état initial.

Deux gardes ajoutées, et **toutes deux éprouvées** :

| Garde | Preuve |
| --- | --- |
| état de référence vert exigé | défaut réintroduit, le script refuse de tourner |
| empreinte des fichiers mutables | cible du cas 7 rendue introuvable, il rougit |

`verifier-contraste-mutation.sh` portait déjà la première. La mienne ne l'avait
pas, et c'est ce qui a laissé passer un vert mensonger.

## Une raison écrite qui était fausse

J'avais justifié le `z-index: 10` conservé par l'enveloppe `sticky` de
`navigation-espace-client`, qui « crée un contexte d'empilement ». La revue a
démonté les deux termes : cette enveloppe **ne déclare aucun `z-index`**, donc
elle ne crée aucun contexte, et elle est rendue **dans `children`**, donc après
cet en-tête dans l'ordre du DOM.

Le commentaire dit désormais ce qui est vrai : ce 10 n'a rien à battre, il est
conservé faute de raison de le changer. **Une justification fausse est pire
qu'absente**, elle sera crue à la relecture suivante et interdira de toucher une
valeur que rien ne défend.

## C34 ne disait rien des deux seuils

C'est la cause des deux défauts de la story : une session qui suivait C34 à la
lettre posait un lien de 24 px revenant à `left: 0`, sans qu'aucune ligne ne l'en
empêche. Motif « règle incomplète franchie de bonne foi », le troisième de la
journée après celui de LS-108.

Les deux seuils y entrent avec leur pourquoi, et un **quatrième sens** du
contrôle vérifie qu'ils y restent.

## Un défaut trouvé hors périmètre, tracé en LS-199

Le **contrôle nocturne échoue depuis deux nuits**, pendant que la CI de `main`
reste verte sur chaque commit. Les deux ne se contredisent pas : LS-177 a déplacé
la suite de bout en bout vers le nocturne, donc aucun échec de ce type n'est
visible sur une pull request.

Un des tests rouges est **périmé par une story ultérieure** :
`navigation-administration.spec.ts:407` exige que « Clients » ne soit pas un
lien, alors que LS-185 a livré cet écran. C'est un défaut de traçabilité plus que
de test, et LS-199 porte les deux, les tests et le mécanisme qui a laissé la
réparation attendre.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| `type-check`, `lint`, `format:check` | verts |
| `npm run test` | **1246 verts** sur 83 fichiers |
| `npm run build` | réussit |
| `verifier-lien-evitement.sh` | 25 + 28 + 1 écrans, quatre sens |
| Mutations sur le contrôle | **8 sur 8**, état de référence prouvé vert |
| Les deux gardes neuves | éprouvées séparément |
| `page-accueil.spec.ts` | 20 verts aux trois largeurs |
| Lien d'évitement, administration | 14 verts |
| Écrans corrigés, catalogue et fiche | 91 verts |

**Les assertions e2e sont prouvées par mutation, séparément.** Sans
`min-height` : 25,59 px pour 44 exigés. Sans la marge : `x = 0` pour 5 exigés. La
même preuve a été faite côté administration, où LS-194 avait posé les 44 px sans
qu'aucun test ne les vérifie.

Rendu mesuré aux quatre largeurs : `x = 8`, `y = 8`, hauteur **44,0** partout.
Capture à 320 px contrôlée, le lien tient dans le cadre avec son contour entier.

## État des tickets

**LS-196 est TERMINÉE**, cinq critères sur cinq.

**LS-199 créée**, priorité Haute, rattachée à LS-7.

## Prochaine étape

**LS-199** mérite de passer devant : un contrôle rouge que personne ne regarde
laisse chaque story suivante livrer sur une base fausse. Sinon **LS-179**, la
bascule d'affichage du mot de passe sur quatre écrans.
