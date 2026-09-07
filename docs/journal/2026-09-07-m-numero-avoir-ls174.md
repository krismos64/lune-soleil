# 7 septembre 2026, m : LS-174, une règle écrite depuis LS-49 et jamais appliquée

Le numéro de l'avoir est désormais lisible après rechargement. Le plus
instructif n'est pas le code, c'est que la règle existait déjà.

## La règle était écrite, personne ne l'appliquait

`Avoir.demandeRetractationId` figure au schéma depuis LS-49, et le modèle
conceptuel porte la règle **F10** : « un avoir issu d'une rétractation référence
sa demande ». La colonne n'a jamais été écrite.

LS-128 émettait l'avoir sans connaître la demande, LS-135 a livré l'écran sans
avoir à afficher le numéro. Chacune était cohérente avec elle-même.

**F10 n'était citée nulle part hors du modèle conceptuel** : aucune règle de
`.claude/rules/`, aucun contrôle, aucun test. C'est exactement le motif que ce
dépôt connaît, une règle qu'aucun contrôle n'exerce ne tient pas. Elle entre
donc dans `payments.md` avec son motif et ce qui la garde désormais.

## Ce que cela coûtait

Après un remboursement, l'écran annonçait « Remboursement de 24,99 € effectué,
avoir A-2026-0001 » dans sa région live. **Ce message disparaissait au premier
rechargement.** Devant une réclamation, l'exploitante lisait « Remboursé :
24,99 € » sans savoir quel document l'atteste, et devait passer par le détail de
la commande pour retrouver le numéro.

## Une contrainte découverte en écrivant la fixture

`DemandeRetractation.commandeId` est **UNIQUE** : une commande porte au plus une
demande. Je l'ai appris en voyant ma fixture échouer sur une violation
d'unicité.

**Deux commentaires que je venais d'écrire affirmaient le contraire**, et s'en
servaient pour justifier le choix de conception : « une commande peut porter
plusieurs demandes, donc dériver la demande de cette commande rattacherait
l'avoir à la mauvaise ». La conclusion reste juste, l'argument était faux. La
vraie raison est la multiplicité des **avoirs** sur une facture, un remboursement
commercial puis une rétractation.

Les deux commentaires sont corrigés. Un raisonnement juste appuyé sur un fait
faux se propage sans bruit, la conclusion tenant lieu de preuve.

## La revue a trouvé un commentaire faux, et il était grave

`ls-frontend-revue` a démenti un second commentaire, celui-là plus coûteux.

J'avais justifié l'absence d'affichage par le cas `AVOIR_NON_EMIS` : « un
remboursement dont l'avoir a échoué laisse une alerte, l'argent étant parti sans
document ». **Le code ne produit jamais cet état sur cet écran** : `avoir.ts`
termine cette branche par `throw`, donc `appliquerTransition` n'est jamais
atteint et `montantRembourseCentimes` reste nul. C'est le bloc entier qui
disparaît, pas seulement le numéro.

Le commentaire de l'écran **et** celui du test affirmaient tous deux que ce cas
était couvert. Une relecture ultérieure aurait conclu que l'état est traité.

**Le défaut réel qu'il masquait est signalé sans être corrigé** : quand
l'émission de l'avoir échoue, la carte n'affiche ni montant ni avoir, et les
boutons de remboursement restent offerts alors que l'argent est parti.
L'exploitante voit une demande qui semble non traitée. Hors périmètre de LS-174,
l'écran se comportait déjà ainsi.

## Deux autres points de la revue, tous deux justes

**Le nom accessible nommait un objet, pas une destination.** « Avoir
A-2026-0001 » ne dit pas que le lien télécharge un PDF, WCAG 2.4.4. L'écran des
factures avait tranché l'inverse sur le même geste, avec sa raison écrite : j'en
avais recopié les couleurs sans reprendre le nom.

**Le texte du PDF absent ne disait pas quoi faire.** « PDF indisponible » seul
laisse croire à une perte définitive, et c'est mot pour mot la formulation que
l'écran des factures a **écartée**, motif écrit juste au-dessus.

La phrase complète de cet écran-là ne rentrait pas : mesurée, elle fait passer le
bloc de 70 à **128 px** à 320 px sur une carte déjà dense. Le numéro de commande
étant ici dans le titre de la carte, « PDF à regénérer depuis la commande »
suffit, et le bloc retombe à 77 px.

## Preuves

Deux tests d'intégration, dont un **négatif** : une demande non remboursée ne se
voit rattacher aucun avoir. Quatre tests de bout en bout aux quatre largeurs,
couvrant les deux branches de PDF et l'absence d'avoir.

**Deux mutations sur deux lignes de défense distinctes.** Ne plus écrire le lien
fait rougir le test d'intégration ; ne plus le lire fait rougir deux tests de
bout en bout. Deux assertions ont été ajoutées avec les corrections de revue,
sans quoi revenir au nom amputé ou au texte court ne ferait rougir personne.

Contrastes mesurés sur `--ls-surface` : 8,93:1 pour le texte du lien, 12,91:1
pour son contour de focus. Cible tactile de 44 px, mesurée par test et non
supposée.

## Un piège de fixture

Mon `beforeAll` fait passer la demande partagée en `REMBOURSEE` pour lui attacher
un avoir. Placé au niveau du **fichier**, il retirait les gestes que les cinq
tests voisins mesurent : cinq échecs sur cinq, dont trois au délai de test faute
de trouver un élément disparu. Les tests de LS-174 vivent donc dans leur propre
`describe`, dont Playwright borne le `beforeAll`.

## Une fixture partagée que la quatrième largeur a fait craquer

En vérifiant la suite complète, un test voisin s'est mis à échouer : le client au
nom sans coupure naturelle de `clients-administration`. Son `beforeAll` le crée
et son `afterAll` le supprime, **une fois par projet** : la première largeur à
finir supprimait le compte que les autres cherchaient encore.

Le `ON CONFLICT DO NOTHING` rendait la création idempotente, c'est la
**suppression** qui ne l'était pas. LS-166 n'a rien cassé, elle a ajouté une
chance de plus que la course se produise.

**Le nom reste commun aux quatre largeurs**, contrairement à ce que le motif du
dépôt suggère, et pour une raison mesurée : il est calibré pour être le plus long
possible sans coupure naturelle, ce que ce test mesure à 320 px. Lui ajouter
« tablette-768 » le fait déborder de **77 px**, donc le test aurait rougi sur un
défaut fabriqué par sa propre fixture. L'unicité passe par l'identifiant et
l'adresse.

Le pouvoir du test a été vérifié après coup : retirer `overflow-wrap: anywhere`
de `.nom` le fait déborder de **125 px**, exactement la valeur que le commentaire
du CSS annonce.

## État des tickets

**LS-174 livrée**, commits `f9945b1`, `1a544e6` et `bc9c04e`. Reste à fusionner
sur `main`.

**LS-166 close** dans la session précédente, PR #296 fusionnée : le compte passe
à **140 tickets terminés sur 192**.

## Ce qui reste ouvert

Les **quatre tests d'intégration** sur `chemin_pdf` échouent toujours, défaut
préexistant identifié en LS-166 : leurs assertions attendent la colonne nulle,
état d'avant LS-129.

Le défaut `AVOIR_NON_EMIS` décrit plus haut n'a pas de ticket, sur consigne de ne
pas en ouvrir pendant cette session.

## Prochaine étape

**LS-163**, les listes d'administration qui plafonnent à 100 sans le dire, puis
**LS-193**, la graphie du nom de marque.
