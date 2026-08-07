# 7 août 2026, LS-52, le nettoyage documentaire et le défaut qu'il ne listait pas

Session de nettoyage, sans code applicatif. LS-52 traînait depuis le 29 juillet,
priorité Low, jamais commentée. Elle regroupait le reliquat des rapports externes
après LS-45 à LS-49.

**La chaîne de phase 1 n'a pas bougé. La prochaine action reste LS-71.**

## Ce que le ticket listait, et ce qui restait vrai

Neuf jours séparaient l'écriture du ticket de son traitement, et plusieurs stories
étaient passées entre-temps. Vérifier avant de corriger a évité trois corrections
inutiles.

| Constat de LS-52 | État réel le 7 août |
|---|---|
| LS-33 présentée comme ouverte dans `MODELE-CONCEPTUEL.md` | confirmé, deux emplacements |
| LS-33 présentée comme ouverte dans `PARCOURS.md` | confirmé, deux emplacements |
| repli fautif sur la date d'expédition | confirmé dans le modèle, **déjà correct** dans `PARCOURS.md` |
| `referenceSessionFournisseur` contre `identifiantFournisseur` | confirmé |
| `recuA` contre `creeA`, et `charge` non modélisé | confirmé |
| `motifCliente` et `creeeA` | confirmé, deux emplacements chacun |
| `Media.chemin` absent du modèle | confirmé |
| trois champs d'`Expedition` absents du modèle | **périmé**, ADR-025 les avait versés |
| `Facture.montantTaxeCentimes` à arbitrer | confirmé, tranché par renoncement |
| description de LS-1 inexacte | confirmé, et **plus faux** que le ticket ne disait |
| description de LS-49 sans amendement en tête | partiellement périmé, le fond était déjà traité en commentaire |
| LS-2 à réestimer | confirmé |

## Le défaut que le ticket ne listait pas

Le modèle conceptuel sert de source champ par champ. Plutôt que de relire les six
écarts un par un, j'ai comparé mécaniquement les deux listes de noms, celle des
blocs `erDiagram` et celle des champs scalaires de `schema.prisma`.

Quatre noms restaient dans le modèle sans exister en base : `description`,
`matieres`, `entretien` et `fabrication`. Ce sont les quatre colonnes éditoriales
que LS-76 a remplacées par l'entité `SectionProduit`, ADR-026. Le diagramme du
domaine 1 les portait encore, et **ignorait l'entité `SectionProduit` elle-même**,
alors que les règles C20 à C23 la décrivent quelques lignes plus bas dans le même
document. Le document se contredisait.

C'est un écart plus lourd que les six listés : un nom qui diverge fait perdre
quelques minutes, une entité manquante fait concevoir contre un modèle faux.

**Aucune relecture ne l'avait vu**, ni celle qui a produit LS-52, ni les rapports
externes du 29 juillet. La comparaison des deux listes prend quelques secondes.

## L'arbitrage sur `Facture.montantTaxeCentimes`

Fermé par **renoncement**, pas par ajout au schéma. Le motif était déjà écrit dans
`.claude/rules/database.md` : la fiscalité tient dans un seul champ,
`Commande.montantTaxeCentimes`, qui vaut zéro en franchise en base, article 293 B
du CGI, et il ne faut pas en ajouter.

La mention légale obligatoire est textuelle et vit dans `instantaneLegal`, ce qui
la rend indépendante d'un franchissement futur du seuil. Un montant recopié aurait
dû être figé avec la même rigueur, pour la même valeur zéro.

Aucune décision nouvelle n'a donc été prise ici, seulement la propagation d'une
décision existante vers le document qui la contredisait par omission.

## Le sens du repli de rétractation, encore

`MODELE-CONCEPTUEL.md` écrivait « à défaut de date de livraison, partir de la date
d'expédition ». C'est exactement la faute que LS-48 avait corrigée ailleurs, et
elle avait survécu dans ce document.

Expédié le 1er, reçu le 4 : un délai parti du 1er expire le 15, quand le minimum
légal court jusqu'au 18. Le droit s'éteint trois jours trop tôt. La formulation
porte désormais la marge d'acheminement, et `PARCOURS.md` la portait déjà.

Le motif se répète, déjà noté en mémoire : les erreurs de ce projet portent sur le
**fait déclencheur**, jamais sur la durée.

## Ce qui a été corrigé côté Jira

**LS-1** portait trois affirmations fausses et non une seule. Elle annonçait « LS-2
porte deux stories filles, LS-3 aucune, LS-36 aucune ». Comptes mesurés : LS-2 en
porte 17, LS-3 en porte 4, LS-36 en porte 10. Sa table des stories filles en
listait treize alors que LS-1 en porte vingt-cinq, complétée.

**LS-49** a reçu son amendement en tête de description, sous forme de citation, les
affirmations fausses restant lisibles et marquées en ligne. Le fond était déjà
traité par son second commentaire, seule la position manquait.

**LS-2 réestimée de 20 h à 34 h.** L'estimation datait d'avant le découpage. Trois
causes au dépassement, aucune n'étant une dérive de périmètre : six stories créées
après l'estimation, l'authentification plus coûteuse que sa ligne d'origine, et
l'exigence de preuve par mutation absente de l'estimation initiale.

**La réestimation est une décomposition, pas une mesure.** Le projet ne suit pas le
temps passé et aucun champ d'estimation Jira n'est renseigné : les huit stories
faites n'ont donc fourni aucune charge réelle sur laquelle s'appuyer. C'est dit
explicitement dans le ticket, pour que personne ne prenne ces heures pour du
constaté.

## Contrôles

```
verifier-regles.sh                40 identifiants, 6 index partiels, vert
verifier-regles-mutation.sh       8 mutations, 8 detectees
db:verifier:conception            93 reussites, 0 echecs
db:verifier (base migree)         93 reussites, 0 echecs
verifier-config-claude.sh --strict  configuration coherente
type-check, lint, format:check    vert
npm run test                      6 fichiers, 60 tests
```

Les huit mutations de `verifier-regles-mutation.sh` visent trois lignes de
`MODELE-CONCEPTUEL.md` dont j'ai déplacé le contenu. Elles restent détectées, ce
qui prouve que le contrôle mord toujours après mes modifications.

## Ce qui n'a pas été fait, et pourquoi

**Aucun contrôle automatique n'a été ajouté** pour la comparaison des noms entre
modèle et schéma, alors que c'est elle qui a trouvé le défaut le plus lourd. LS-52
ne le demandait pas, et son critère 7 exige seulement que les contrôles existants
restent verts. Ajouter un script aurait élargi le périmètre du ticket.

C'est une proposition à trancher, pas une dette silencieuse : la comparaison tient
en quelques lignes de shell et attraperait mécaniquement le prochain écart.

## État des tickets

| Ticket | État |
|---|---|
| LS-52 | Terminé |
| LS-1 | description corrigée, epic toujours en cours |
| LS-2 | réestimée à 34 h, epic toujours en cours |
| LS-49 | amendement en tête, reste Terminé |
| LS-71 | **prochaine action**, inchangée |
