# 5 septembre 2026, session C : l'écran Clients, LS-185

Dernière des trois stories du découpage de LS-182. La plus délicate, et la seule
qui commençait par un arbitrage plutôt que par du code.

## L'arbitrage a précédé le code, critère 1

Trois questions posées à Christophe avant d'écrire une ligne, et tracées dans le
ticket avant de commencer.

**Finalité** : trois retenues, répondre à une demande RGPD, retrouver un acheteur
qui contacte la boutique, et suivre l'activité commerciale.

**Données** : vue complète. J'avais recommandé la minimisation stricte, il a
tranché autrement en connaissance de la recommandation.

**Recherche** : libre, sans journalisation.

## L'écart à ADR-027, et pourquoi il est écrit quatre fois

`.claude/familles-sans-action.txt` annonçait **deux fois**, avant cette story, ce
qui ferait basculer un écran dans « consulter en masse » :

> une recherche par nom ou par adresse dans cette rubrique, ou un export, feraient
> basculer l'écran dans « consulter en masse », et la ligne devrait partir.
> **LS-36 porte l'espace client, où la question se reposera entière.**

Elle s'est reposée. Un écran Clients avec recherche libre **est** le fichier
client au sens d'ADR-021, dont l'énumération est « nom, adresse postale,
téléphone, historique d'achat, factures » : il n'y a rien à étirer pour l'y
ranger.

**Trois options ont été présentées**, deux plus protectrices : recherche avec
garde de réauthentification, recherche avec journalisation, ou liste bornée sans
recherche. Christophe a retenu la recherche libre nue, et je le lui ai fait
confirmer une seconde fois en lui montrant ce que le fichier de règles disait
déjà.

L'écart est tracé dans le ticket, dans `familles-sans-action.txt`, dans le
traitement T11 du registre et dans le service. **Ce n'est pas un oubli**, et
chacun de ces quatre endroits le dit, pour que personne ne le « corrige » en
croyant réparer une négligence.

## Le registre a précédé la livraison, critère 2

**T11 est neuf**, et il porte **deux bases légales** et non une : exécution du
contrat pour les deux premières finalités, intérêt légitime pour le suivi
d'activité commerciale.

Les distinguer n'est pas un raffinement de rédaction. Si l'intérêt légitime venait
à être contesté, les deux premières finalités survivraient et l'écran resterait
légitime en retirant les totaux : une base légale unique et large ferait tomber
l'ensemble.

## Ce que la revue d'interface a trouvé

**Un caractère cyrillique invisible.** Le mot « délibéré » d'un commentaire
portait un `е` en `U+0435` au lieu d'un `é`. Un `grep` sur ce mot ne l'aurait
jamais trouvé, et aucun contrôle ne le voyait. Je ne l'aurais pas trouvé seul.

**Le registre sur-déclarait deux catégories de données.** T11 annonçait le
téléphone et les adresses du carnet ; l'écran n'affiche ni l'un ni l'autre, et le
carnet n'apparaît que par son **nombre**. Un registre qui sur-déclare est aussi
faux qu'un registre qui sous-déclare, et c'est celui-là qu'on présente en cas de
contrôle. Corrigé aux trois endroits qui le répétaient.

**`verifier-registre-traitements.sh` était vert sur cet écart, à juste titre** :
il confronte le registre au **schéma**, jamais à ce que les écrans affichent.
Aucun contrôle automatique ne peut poser cette question.

**`action=""` sur le formulaire.** React 19 traite `action` comme une prop
spéciale, point d'entrée des Server Actions : lui donner une chaîne vide est
exactement la forme qui prête à confusion sur un formulaire dont le commentaire
insiste qu'il n'en est pas un. Et une chaîne vide se résout vers l'URL courante
**query comprise**, ce qui effacerait un filtre ajouté plus tard. Remplacé par
`method="get"` avec `action` absent.

**Trois attributs manquaient sur le champ de recherche.** `spellCheck={false}`,
`autoCorrect` et `autoCapitalize` désactivés : le correcteur orthographique de
macOS et d'iOS transmet le contenu des champs texte à un service système, ce qui
n'a rien à faire sur un champ recevant des noms de personnes.

**La trace laissée dans l'URL n'était documentée nulle part**, alors que l'écart
ADR-027 l'était sur trois documents. Le terme sérialisé entre dans l'historique de
navigation et dans les suggestions de la barre d'adresse : c'est le scénario de
l'ordinateur laissé ouvert, aggravé d'un cran. Ajouté à T11.

## Une ligne de CSS que la mutation a démontrée fausse

`.nom` portait `min-width: 0` **et** `overflow-wrap: anywhere`, au motif habituel
qu'un item flex refuse de passer sous la largeur de son contenu.

Deux mutations ont tranché :

| Ligne retirée | Résultat |
| --- | --- |
| `min-width: 0` | **13 tests verts**, la ligne ne sert à rien |
| `overflow-wrap: anywhere` | **débordement de 125 px** à 320 px |

`.enTeteClient` est en `flex-wrap: wrap` : l'élément passe **à la ligne** au lieu
de pousser, donc la taille minimale automatique ne se manifeste jamais. La ligne
est supprimée, avec sa mesure écrite : une justification démontrée fausse apprend
à ne plus lire les voisines.

## Le contrôle qui se déclenchait sur sa propre explication

`verifier-actions-sensibles.sh` a échoué sur un **commentaire**. Il expliquait
comment revenir sur l'arbitrage, en citant la marque à poser : le script cherche
l'annotation dans `src/` sans distinguer une citation d'une marque réelle, et
comptait **cinq** actions sensibles au lieu de quatre.

Les accents graves ne protègent pas : une première correction gardait la forme
courte, le contrôle est resté rouge. La marche à suivre vit désormais dans
`familles-sans-action.txt`, hors de la portée du contrôle.

Motif « le hook bloque son explication », déjà rencontré sur le hook des secrets.
Fiche mémoire écrite.

## La protection qu'aucune donnée n'exerçait

Le CSS porte `overflow-wrap` sur quatre éléments, tous justifiés par le motif de
LS-171. **Aucune fixture ne les exerçait** : les tests n'employaient que des noms
courts, donc la protection était affirmée et non mesurée. Motif « un défaut
absent n'est pas un défaut empêché ».

Un compte au nom de quarante-cinq caractères sans espace est désormais posé par
le fichier de test, et c'est lui qui a rendu les deux mutations ci-dessus
possibles.

## Vérification

| Contrôle | Résultat |
| --- | --- |
| Vitest | **1177 tests verts**, 77 fichiers, dont 13 neufs |
| Playwright, écran Clients | **13 verts à 320 px**, dont le nom hostile |
| `verifier-contraste.sh` | 171 paires, toutes conformes |
| `verifier-registre-traitements.sh` | vert, 36 tables rangées |
| `verifier-actions-sensibles.sh` | vert, 4 actions marquées |
| `verifier-navigation-administration.sh` | vert, 16 routes, 11 rubriques |
| `verifier-regles.sh`, gardes, format, lint, types | verts |

**Trois mutations**, dont une qui a changé le code plutôt que le test :

| Mutation | Résultat |
| --- | --- |
| `exigerAdministratrice` remplacé par `exigerSession` | 2 tests rougissent, dont celui du client connecté |
| Filtre `issue: "REUSSITE"` retiré | **vert en e2e**, rouge après ajout du test d'intégration |
| `min-width: 0` retiré de `.nom` | vert, donc la ligne était fausse et a été supprimée |

La deuxième est la plus instructive : elle passait au vert sur les douze tests de
bout en bout, faute d'un compte portant un échec de connexion. Le test
d'intégration pose maintenant une réussite **suivie** d'un échec plus récent, ce
qui rend le filtre détectable.

## Ce qui n'est pas fait

**Aucun contrôle visuel dans un navigateur** au-delà des mesures automatisées.

**Aucun `error.tsx` sous `administration/`**, relevé par la revue : si une lecture
lève, c'est `global-error.tsx` qui prend, celle qui remplace le layout racine et
fait perdre la barre de navigation. Le défaut vaut pour les **seize** écrans
d'administration, pas seulement celui-ci, donc il relève d'un ticket.

## État des tickets

**114 terminés sur 180**, relevé dans Jira APRES la fusion de LS-185 : le
chiffre de 113 vu pendant la session comptait avant sa clôture. LS-180, LS-184 et
LS-185 sont closes et fusionnées. **LS-189, LS-190 et LS-191 créées** dans la
journée.

## Prochaine étape

**LS-137**, le référencement technique, puis **LS-136** et **LS-148**, les deux
tickets de conformité. LS-175 reste bloquée par l'achat du VPS.
