# 27 août 2026, l'administration des commandes ferme la phase 3

**LS-121**, troisième story de la journée et dernière de la chaîne LS-118 à
LS-121. L'exploitante voit enfin ce que les huit stories précédentes produisent,
et la porte de sortie de la phase 3 est franchie.

## Deux décisions qui ne se voient pas dans l'écran

**Les transitions sont une table, pas une suite de conditions.** La même source
décide de ce que l'écran affiche et de ce que le service accepte : les deux ne
peuvent donc pas diverger. Un bouton affiché sans être accepté donnerait un refus
incompréhensible, et l'inverse cacherait une action permise.

**`LIVREE` n'est atteignable par aucun chemin**, et c'est une règle plutôt qu'un
oubli. La date de livraison fait courir le délai de rétractation : l'inventer
d'un clic le ferait partir d'une date fausse. Comment le site l'apprend est la
décision de LS-33, non prise. `EN_ATTENTE_PAIEMENT` n'a de même aucune transition
manuelle : confirmer à la main une commande non payée ferait expédier une pièce
sans encaissement, et l'annuler doublonnerait la réconciliation qui le fait déjà.

## Un contrôle neuf, et pourquoi il ne fait pas doublon

La garde de rôle d'une Server Action ne se prouve **ni** en intégration **ni** en
e2e, et les deux raisons sont distinctes.

En intégration, la garde appelle `headers()` de Next.js, qui exige un contexte de
requête : hors du serveur, elle lève avant d'atteindre la moindre vérification.
Un test mesurerait cette limite de l'outil, pas la garde.

En e2e, le test d'appel direct envoie un POST sans en-tête `Next-Action`, que
Next.js traite comme une navigation : l'action n'est jamais exécutée. **Mesuré :
la mutation qui retire la garde laissait les 54 tests verts.** Le test protège la
page, pas l'action.

`verifier-gardes-administration.sh` comble ce trou, **par fonction et non par
fichier** : une action non gardée voisine de trois actions gardées serait sinon
invisible, piège déjà rencontré ici. Il ne fait pas doublon avec
`verifier-actions-sensibles.sh`, qui ne regarde que les fichiers touchant à la
réauthentification et passe explicitement sur tous les autres, vérifié.

**Sa limite est écrite dans son en-tête** plutôt que supposée : il prouve une
propriété du fichier, pas du comportement. Un appel placé après l'effet le
satisferait en laissant le trou entier.

Deux faux positifs ont été corrigés avant de le retenir, tous deux du pire sens,
accuser un code correct : la signature qui s'étend sur plusieurs lignes, et la
ligne `}): Promise<...> {` dont l'accolade en colonne 1 arrêtait l'extraction
avant le corps. Le comptage d'accolades traverse les deux sans les connaître.

## La revue frontend a trouvé deux défauts bloquants

`ls-frontend-revue` a relu l'interface. Deux défauts étaient des règles écrites
franchies, pas des préférences.

**Un contraste à 4,04:1.** `--ls-warning` sur le blanc d'une section, en 14 px
normal, sous le seuil AA de 4,5. Le jeton tient sur le crème de la page, pas sur
le blanc des cartes : c'est la fiche « le contraste dépend du fond ». Mesuré
avant et après, `4,04:1` puis `6,56:1` avec `--ls-error`.

`axe-core` ne l'a pas vu, et pour une raison qui vaut d'être notée : ce texte
n'existe qu'avec un remboursement, et la commande de test n'en porte aucun. Le
chemin n'était jamais rendu.

**L'historique affichait les valeurs brutes de l'enum**, `EN_PREPARATION` sans
accent au milieu d'un écran entièrement accentué. `affichage.ts` énonçait pourtant
la règle « jamais la valeur brute », et le détail la franchissait à ce seul
endroit. Le repli sur la valeur brute est conservé, délibérément : ces colonnes
sont typées `string` et non `StatutCommande`, un statut disparu doit s'afficher
plutôt que la ligne devienne muette.

Quatre points d'ergonomie corrigés au passage : l'historique vide qui rendait un
titre suivi de rien, le message d'erreur non rattaché aux boutons par
`aria-describedby`, le débordement d'un nom sans espace, et la zone tactile du
lien de retour à 24 px quand les autres respectaient 44.

## La bascule 768 px n'était mesurée par personne

`CLAUDE.md` énonce quatre largeurs, Playwright en couvre trois depuis LS-68, et
768 px restait « un contrôle à l'œil ». Or `commandes.module.css` porte son unique
point de bascule exactement là.

Plutôt qu'un quatrième projet qui allongerait d'un tiers toute la suite pour deux
écrans, un test redimensionne à 768 px sur ces seuls écrans. L'écart général
reste, et n'est pas de cette story.

## La porte de sortie est prouvée, pas constatée

Chaque maillon du parcours 1 était testé chez lui, aucun ne traversait la
**chaîne**. C'est pourtant ce que la porte de sortie exige.

`parcours-complet.sequential.test.ts` traverse panier, commande, réservation,
paiement, événement signé, confirmation, tâche de libération et administration,
sur une pièce unique, puis rejoue le chemin d'abandon où la pièce revient au
catalogue intacte.

**Une chaîne peut casser quand chaque maillon tient**, et les défauts de la
journée le montrent : les metadonnées posées sur la session mais absentes de la
charge, l'ordre des verrous opposé entre deux services corrects isolément. Rien
dans un test de maillon ne les voyait.

## Preuves

```
type-check       au vert
lint             au vert
format:check     au vert
build            au vert, les deux routes en dynamique
test             46 fichiers, 739 tests
test:e2e         383 passés
verifier-regles.sh                     règles conformes au schéma
verifier-propagation-docs.sh           socle Zod et son document accordés
verifier-registre-traitements.sh       33 tables rangées
verifier-tests-non-ignores.sh          toute la suite s'exécute
verifier-actions-sensibles.sh          au vert
verifier-gardes-administration.sh      19 actions, toutes gardées
```

**Trois mutations, trois détectées par le test attendu**, cas 120 à 122. Le
contrôle neuf est lui-même prouvé par deux mutations, dont celle qui retire la
garde d'une seule action parmi plusieurs gardées dans le même fichier.

| Mutation | Test qui rougit |
|---|---|
| historisation de transition supprimée | avance la commande et historise avec l'acteur |
| `LIVREE` rendue atteignable d'un clic | n'atteint jamais `LIVREE` |
| table des transitions ignorée | refuse une transition non permise |

## Ce qui reste ouvert

Trois points relevés par la revue **ne sont pas traités ici**, et le sont
délibérément :

- `loading.tsx` et `error.tsx` manquent sur les trois écrans d'administration,
  pas seulement celui-ci. Traiter uniformément relève d'un ticket
- le `default` de `formaterOrigine` absorbe une origine ajoutée sans que rien ne
  rougisse, jumeau du piège d'enum déjà connu
- l'ordre par défaut des filtres hors écran à 320 px, découvrabilité à vérifier
  à l'œil

## État des tickets

| Ticket | État |
|---|---|
| LS-121 | **terminée**, revue frontend passée, deux défauts bloquants corrigés |
| LS-33 | reste ouverte, elle décidera comment le site apprend qu'un colis est livré |
| LS-18 | bloqueur inchangé |

## Prochaine étape

La **phase 3 est close**. Restent en phase 3 LS-86 et LS-125, deux stories
d'interface qui ne bloquent rien. La phase 2 garde sept stories ouvertes,
essentiellement accessibilité et états non nominaux, et la phase 4 en compte huit
depuis la création de LS-126.
