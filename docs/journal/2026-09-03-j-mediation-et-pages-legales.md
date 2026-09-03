# 3 septembre 2026, session J : médiation, mentions légales et pages publiques

Christophe a demandé d'enchaîner LS-19, LS-28 puis LS-123 sans interruption.
Les trois avancent, aucune n'est close, et les raisons diffèrent.

## LS-19, le comparatif des médiateurs

L'exploitante a demandé qu'une sélection lui soit proposée. Quatre dispositifs
comparés dans `docs/COMPARATIF-MEDIATION.md`, dont trois vérifiés sur la
plateforme européenne officielle de règlement des litiges plutôt que sur les
sites commerciaux des organismes.

**Deux faits qu'un comparatif de surface aurait manqués.** L'AME est devenue
**AVENIR CONSO** au 1er juillet 2026, et les conditions générales doivent porter
le nom actuel. Médicys a été **retirée de la liste des médiateurs référencés par
la CECMC en février 2021**, ce qui a obligé tous les professionnels l'ayant
désignée à en changer : le référencement se perd, et il se vérifie le jour de la
signature, jamais sur un article de blog.

Le classement tient compte de l'échelle réelle : sur 10 à 20 pièces à faible
prix, le coût d'adhésion pèse plus que le coût par litige, l'inverse d'un
commerce à fort volume. **CM2C ressort le moins coûteux d'un facteur deux à
trois**, dans les deux colonnes.

Le ticket reste ouvert : le choix, la vérification du référencement et la
signature appartiennent à l'exploitante.

## LS-28, les mentions légales publiées

`src/lib/identite-legale.ts` porte l'identité affichée, **distincte de celle des
factures et lue à la même source**. Les deux décrivent la même entreprise pour
deux obligations opposées : l'émetteur de facture est figé dans l'instantané au
moment de l'émission, invariant 3, quand les mentions légales affichent l'état
courant, un déménagement devant s'y voir immédiatement. Écrire l'adresse en clair
dans la page aurait permis au site et aux factures d'annoncer deux identités
différentes.

**Le téléphone est publié parce qu'il est obligatoire**, article L221-5 vérifié
sur Légifrance : le 4° du I énumère les coordonnées « postales, téléphoniques et
électroniques » sans les présenter comme alternatives. L'exploitante demandait à
ne pas le publier sauf obligation.

Le ticket reste ouvert : **les CGV ne sont pas publiables sans médiateur**,
article L612-1. La section existe et dit son état.

## LS-123, deux pages sur trois

Le pied de page renvoyait vers neuf liens depuis LS-122, dont **six rendaient
404**. Ils sont trois désormais, tous vers `/notre-univers`.

`/informations-legales` porte les quatre ancres attendues. `/aide` porte la
livraison, les retours et une foire aux questions annoncée. `/notre-univers`
reste à faire : elle porte l'histoire de la marque et les matières, que seule
l'exploitante détient, LS-25.

**Aucun délai d'expédition n'est annoncé**, les questions 38 à 42 de la fiche
étant sans réponse, et un test le vérifie plutôt que de s'en remettre à la
relecture : annoncer « expédition sous 24 heures » sans pouvoir le tenir serait
une pratique commerciale trompeuse.

## La revue frontend, sept corrections dont deux graves

**L'état dégradé n'attrapait qu'une des deux classes d'erreur.**
`lireIdentiteLegale` appelle `lireEmetteur`, qui lève `EmetteurNonConfigureError`,
classe distincte de la sienne : une seule variable `FACTURE_*` manquante faisait
rendre **500 à toute la page**, y compris la section rétractation qui n'en dépend
pas. C'est exactement ce que le commentaire de la page disait vouloir éviter, et
le motif « configuration corrigée à moitié » s'y applique à la lettre.

**Les deux pages étaient les seules du groupe boutique sans `id="contenu"`.** Le
lien d'évitement de l'en-tête ne trouvait donc pas sa cible sur la page la plus
longue du site, celle où il sert le plus. Les vingt autres pages le portent.
`axe-core` ne le voit pas, une ancre non résolue n'étant pas une violation
automatisable.

**« Aucune commande n'est possible sur ce site » était faux**, le tunnel étant
livré et testé. Un texte de page légale qui se trompe sur les conditions de la
vente relève de l'information incorrecte que ce ticket cherche à éviter.

**Le délai de renvoi de quatorze jours manquait**, article L221-23. La page
détaillait le délai pour se rétracter sans dire qu'un second court ensuite, alors
qu'il conditionne le remboursement.

Trois corrections plus légères : la mention de TVA vient de la constante que la
facture imprime au lieu d'une variante qui disait « Non applicable » deux fois,
l'accusé de réception est dit **envoyé** et non reçu, `securite.md`, et le lien
« Mentions légales » du pied porte son ancre pour porter le focus comme les trois
autres.

**Une correction a échoué en silence**, rattrapée par le lint : Prettier avait
reflowé le texte de la mention TVA, la substitution n'a rien trouvé, et l'import
est resté inutilisé. Deuxième occurrence du même piège dans la journée.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `type-check`, `lint`, `format:check` | verts |
| Tests de bout en bout | 41 sur 41, trois largeurs |
| `verifier-contraste.sh` | 123 paires au seuil |
| `axe-core` | aucune violation, deux pages |

Un échec de préparation apparaît en lançant trois fichiers ensemble, « Too many
requests » : c'est **LS-168**, le plafond d'authentification qui rend la suite
instable selon l'ordre, sans rapport avec ce travail.

## Prochaine étape

`/notre-univers` reste la dernière page à liens morts, et elle attend LS-25.
Les deux blocages restants sont les mêmes qu'au matin : les **photographies** et
la **composition des métaux**, qui commandent tout le catalogue.

Côté code sans dépendance externe : **LS-137**, le référencement technique, et
**LS-147**, l'identité du site au partage.

## Un compte faux, corrigé en fin de session

Le tableau du `README.md` annonçait **104 terminés sur 165**. Les deux nombres
étaient faux : le relevé de la session I datait d'avant la création de LS-173 et
LS-174, et j'ai ajouté 2 au dénominateur en oubliant que LS-135 était passée à
Terminé entre-temps. Un compte dérivé d'un autre compte n'est pas une mesure.

Relevé dans Jira en fin de session : **105 terminés sur 164**. Le journal de la
session I garde son chiffre, exact à sa date.

## État des tickets

**Aucun des trois n'est clos**, et chacun pour une raison différente : LS-19
attend le choix de l'exploitante, LS-28 attend le médiateur qui en découle,
LS-123 attend les contenus de LS-25. Les trois sont en cours avec leur part
livrée, vérifié dans Jira.

**LS-135 est close**, LS-173 et LS-174 ouvertes et rattachées à LS-6.
