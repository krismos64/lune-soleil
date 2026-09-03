# 3 septembre 2026, session I : le traitement d'une rétractation, LS-135

Christophe a demandé où en était le projet et quelles étaient les prochaines
étapes réalisables sans l'exploitante ni le VPS. Le classement produit a désigné
LS-33, et ce classement était faux.

## Le ticket qui trompe par son titre

**LS-33 s'intitule « Décider comment le site apprend qu'un colis est livré ».**
La décision est prise depuis le 28 juillet 2026 : suivi automatique Mondial
Relay, seul l'événement « remis au destinataire » renseigne `livreA`. Son
dernier commentaire, du 27 août, dit que le ticket ne porte plus que la
souscription commerciale et que l'implémentation est passée à LS-131.

Le classement s'était fait sur le titre, sans lire les commentaires. Le ticket
présenté comme le plus rentable du backlog n'était pas réalisable du tout,
dépendant précisément de l'exploitante.

**Trois tickets annoncés comme bloqués par LS-33 ne portaient aucun lien vers
lui.** Vérifié dans Jira : LS-135 est bloquée par LS-134 et LS-128, toutes deux
terminées ; LS-61 par LS-54, terminée ; LS-77 par rien. Une dépendance affirmée
en prose se périme sans bruit, et c'est ce qui a fait retenir LS-135.

## Ce qui est livré

Les étapes 6 à 8 du parcours 5, face administration. **Une demande déposée
n'était visible par personne** : LS-134 avait livré la déclaration et l'accusé
de réception sans qu'aucun écran ne permette de la traiter, et les demandes
s'accumulaient pendant que le délai de l'article L221-24 courait.

`services/traitement-retractation.ts` porte les six opérations, le repository
leurs écritures, et `app/administration/retractations/` l'écran avec ses cinq
Server Actions.

**Le piège central tient en une phrase** : les étapes 7a et 7b ne sont pas une
séquence. Le remboursement est dû au premier des deux faits, preuve d'expédition
**ou** réception. `STATUTS_REMBOURSABLES` porte donc `RETOUR_ATTENDU` et
`EXPEDITION_PROUVEE`, et en retirer le premier bloquerait indéfiniment le retour
déposé en point relais sans numéro de suivi, cas courant.

## Trois défauts réels, trouvés par les contrôles du projet

**La garde de rôle arrivait après la lecture du statut.** Les refus de ce
service nomment l'état réel de la demande, délibérément, l'appelante étant
l'exploitante. Lire avant de garder en faisait un oracle : un appelant sans
session distinguait une demande `DEPOSEE` d'une `REMBOURSEE`, et un identifiant
inexistant d'un identifiant valide. Trouvé par le test négatif de sécurité, qui
recevait `STATUT_INCOMPATIBLE` là où `SESSION_ABSENTE` était attendu.

**La fonction citait `@sensible REMBOURSEMENT` sans la porter.**
`verifier-actions-sensibles.sh` l'a signalé, et il avait raison sur le fond
plutôt que par accident de formulation : cette fonction décide qu'un
remboursement doit partir, donc elle porte ses deux gardes elle-même. Les
déléguer à `demanderRemboursement` laissait un futur appelant franchir une seule
des deux.

**Les sélecteurs de bout en bout visaient toutes les demandes.** La suite de
LS-134 dépose les siennes, une par projet Playwright : un sélecteur global en
trouvait quatre, donc le test passait ou non selon l'ordre d'exécution. Ciblés
désormais par numéro de commande.

## La preuve par mutation, et la cible perdue par Prettier

Cinq mutations ajoutées, **toutes détectées par le test attendu**. La plus
instructive est celle des frais de port : plafonner au tarif relais ne change
rien sur une commande en point relais, les deux valeurs coïncidant. Seul le test
à domicile la voit, ce qui prouve que les deux tarifs devaient être exercés
séparément, sur des commandes **sous le seuil de franchise** où les frais ne
sont pas offerts.

**Le reformatage a cassé une cible.** Prettier a mis
`STATUTS_REMBOURSABLES` sur une seule ligne, et la substitution du cas 144 ne
trouvait plus rien. Vérifié avant commit plutôt qu'après, le script accusant
sinon les tests à la place de lui-même.

## L'étape 9 n'a aucun chemin, LS-173

`PARCOURS.md` annonçait « mouvement `RETOUR` créé » à la réception. **C'est
faux, et l'était avant cette story.** `recueA` dit que le colis est arrivé,
jamais dans quel état : un bijou revenu cassé ne retourne pas au catalogue, et
S8 lie la réintégration à l'état réel de la pièce.

L'écran des stocks refuse par ailleurs de compenser une vente web, à juste
titre. **Une pièce revenue reste donc sortie du stock**, sans aucun geste pour
la remettre en vente. LS-173 créée, rattachée à LS-6, bloquée par LS-135.

`PARCOURS.md` corrigé : l'étape 9 dit désormais ce qui existe.

## Une dette laissée volontairement

Les champs de saisie emploient `--ls-border`, jeton décrit « décoratif » dans
`tokens.css` et sous le seuil AA pour la bordure d'un contrôle. **Les huit
écrans existants font pareil**, et c'est LS-108. Introduire ici un neuvième cas
particulier aurait compliqué sa correction globale. Écrit dans la feuille de
style plutôt que laissé implicite.

## Vérifications

| Contrôle | Résultat |
|---|---|
| `type-check`, `lint`, `format:check` | verts |
| Tests d'intégration | 23 sur 23 |
| Tests de bout en bout | 203 sur 203, trois largeurs |
| `verifier-contraste.sh` | 121 paires au seuil |
| `verifier-gardes-administration.sh` | 37 actions, toutes gardées |
| `verifier-actions-sensibles.sh` | vert après correction |
| `verifier-navigation-administration.sh` | 13 routes, 8 rubriques |
| `verifier-regles.sh` | conforme |
| Mutations | 5 sur 5 détectées par le test attendu |

## Prochaine étape

Le bloc juridique reste le plus rentable sans l'exploitante : **LS-19**, le
comparatif des dispositifs de médiation agréés qu'elle a demandé, puis **LS-28**
pour les mentions légales, et **LS-123** pour les gabarits qui les porteront.

## État des tickets

**LS-135 close.** LS-173 créée et ouverte. Comptes relevés dans Jira :
**104 terminés sur 163**, soit 64 %.
