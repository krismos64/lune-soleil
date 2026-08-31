# 31 août 2026, l'émission de la facture, LS-126

La chaîne des documents comptables s'ouvre. Une commande payée produit désormais
une facture, ce qui n'était le cas d'aucune vente jusqu'à ce jour.

## Ce que la story fermait vraiment

`facture (commande_id)` est la troisième des quatre clés d'idempotence par effet.
Elle était en base depuis la migration initiale du 30 juillet, et **aucun code ne
l'avait jamais atteinte** : LS-119 avait livré avec deux clés sur quatre
prouvées, faute d'un chemin qui écrive une facture.

Une contrainte qu'aucun test n'exerce est une intention, pas une garantie. Le
trou avait été trouvé en vérifiant le critère 5 de LS-119, et c'est ce qui a
justifié la création de LS-126 plutôt que de la laisser implicite.

**Aucune migration n'a été nécessaire.** La table, l'unicité et les deux `CHECK`
existaient déjà, ce qui a réduit la story à son objet réel : le chemin qui les
atteint.

## Deux décisions prises avec Christophe avant de coder

Le contrôle avant zone critique a buté sur une question que le ticket ne
tranchait pas : d'où vient l'identité légale de l'émetteur, raison sociale, SIRET
et adresse. Rien n'existait, ni variable, ni table, ni valeur en dur.

**L'environnement plutôt qu'une table de paramétrage.** Ces quatre valeurs
changent au rythme d'un déménagement, pas d'une vente. Une table aurait demandé
une migration, un écran d'administration et un ADR pour une donnée quasi immobile.
Les vraies valeurs restent hors du dépôt, qui est public, et l'adresse peut être
un domicile.

**Un schéma Zod versionné pour l'instantané légal.** La colonne est un `Json` qui
accepte n'importe quelle forme. Sans contrat, rien ne garantit qu'une facture
émise dans six mois porte les mêmes clés, et une relecture à dix ans n'aurait
aucun moyen de savoir ce qu'elle relit. Le champ `version` est ce qui rend la
suite possible : le jour où la structure change, les documents déjà émis gardent
la leur, l'invariant 4 interdisant de les réécrire.

## L'ordre des opérations porte deux garanties distinctes

```
Transaction de confirmation
  ├─ encaissement                    clé 1, paiement (commande_id)
  ├─ mouvement de stock              clé 2, mouvement (commande, variante)
  ├─ suppression des réservations
  ├─ statut CONFIRMEE + historique
  └─ émission de la facture          clé 3, facture (commande_id)
       ├─ lecture de l'existante  ──── sortie anticipée si elle existe
       ├─ lecture de l'émetteur   ──── refus AVANT toute écriture
       └─ réservation du numéro   ──── seulement ici
```

**La garde d'existence précède la réservation du numéro**, et l'inverse serait un
défaut silencieux. Réserver avant de vérifier consommerait un rang à chaque
rejeu : la séquence porterait des trous, qu'un contrôle fiscal lit comme des
factures disparues. Rien dans l'état final ne le montrerait, toutes les
assertions d'unicité restant vertes. C'est le cas 131 de la mutation.

**La lecture précède l'écriture**, motif déjà écrit pour le mouvement de stock :
une violation d'unicité avorte la transaction entière en `25P02`, donc rattraper
`P2002` puis continuer ne marche pas. La contrainte reste la seconde ligne de
défense pour la concurrence réelle.

## Ne pas émettre vaut mieux qu'émettre faux

Le cas de la configuration absente est réel au premier déploiement. Trois issues
possibles, et le choix se justifie par ce qui se rattrape :

- **émettre sans raison sociale ni SIRET** produirait un document non conforme et
  **immuable**, que seul un avoir pourrait corriger
- **faire échouer la transaction** laisserait de l'argent encaissé sans commande
  confirmée, et le prestataire rejouerait indéfiniment un événement qui ne peut
  pas aboutir tant que personne n'a renseigné les variables
- **confirmer, ne pas émettre, alerter** laisse un défaut rattrapable par une
  émission différée une fois la configuration posée

Le troisième est retenu, même arbitrage que le stock épuisé du 27 août. Seule
`EmetteurNonConfigureError` est rattrapée : toute autre erreur remonte et fait
échouer la transaction, une contrainte violée ou une panne de base étant des
défauts à rejouer, pas des états à acter.

## Un défaut trouvé par le test, pas à la relecture

`schemaAdressePostale` a refusé l'adresse figée de la commande, sur une clé `nom`
inconnue de lui. Son propre commentaire l'annonçait pourtant : « ce schéma valide
une saisie, il ne décrit pas l'adresse figée d'une commande ».

La différence est structurelle. Une adresse de livraison figée doit dire **à qui**
le colis part, et le nom vient du client au moment de l'achat. Dans la saisie du
tunnel, le nom est un champ voisin de l'adresse et non l'un des siens.

`schemaAdresseFigee` porte donc cette forme. Le défaut s'est vu à l'écriture des
tests, pas à la relecture d'un document vieux de dix ans, ce qui est exactement
ce pour quoi le schéma existe.

## Quatre tests du webhook ont rougi, et c'était juste

Ils comptaient les alertes critiques, et mon alerte `FACTURE_NON_EMISE` s'y
ajoutait : ce fichier ne configurait pas l'émetteur, la facture n'existant pas
quand il a été écrit.

La correction est de configurer l'émetteur dans ce fichier, pas d'assouplir les
comptes. Depuis LS-126, une confirmation complète écrit un document comptable :
une confirmation qui n'en écrit pas n'est plus le cas nominal.

Le `TRUNCATE` des deux fichiers a été étendu à `facture` et `avoir`.

## La mutation, et le piège que le critère 7 nommait

Cinq cas neufs, cinq détectés par le test attendu.

Le cas 130 porte le critère 7, et le ticket avait raison de le formuler ainsi :
« le test doit atteindre l'écriture, non s'arrêter à une garde antérieure ».
Retirer la garde d'existence ne fait rougir **que** le test qui part d'une
facture existante sans paiement encaissé. Les deux autres tests d'idempotence
restent verts, arrêtés plus tôt par la clé du paiement : le service sort en
`DEJA_TRAITE` avant d'atteindre la facture.

C'est le même motif que LS-119 avait mesuré sur le mouvement de stock. Le savoir
d'avance a évité d'écrire une suite qui aurait paru complète en ne prouvant rien.

Le cas 131 est le plus discret : le numéro réservé avant la garde laisse toutes
les assertions d'unicité vertes, seul le compteur avance. Sans une assertion
portant explicitement sur `compteur_numero`, il serait passé.

## La revue critique a trouvé deux vrais défauts

`ls-critical-reviewer` a mesuré sur un PostgreSQL 18.4 jetable, et son apport
dépasse ce que j'attendais. **Mon inquiétude de départ était un faux positif** :
l'ordre des verrous est sain, `COMMANDE` et `FACTURE` étant deux lignes
distinctes du compteur. Mon propre test de concurrence l'avait déjà constaté, et
la revue l'a confirmé indépendamment en provoquant le cycle qui n'existe pas.

Les deux défauts qu'elle a trouvés sont ailleurs, et le premier était grave.

### Un paiement perdu sans aucune trace

Une `ZodError` levée par la construction de l'instantané remontait et annulait la
transaction entière. Conséquence mesurée : `evenement_fournisseur` n'était **même
pas écrit**, donc le prestataire rejouait pendant trois jours en échouant à
l'identique.

L'état final était le pire possible. Argent encaissé chez Stripe, commande
`EN_ATTENTE_PAIEMENT`, aucun paiement, aucun mouvement de stock, et **aucune
alerte**. Rien nulle part ne disait qu'une vente avait eu lieu.

Le cas n'est pas atteignable par le tunnel aujourd'hui, `passerCommande` écrivant
toujours une adresse conforme. Il le devient dès qu'un autre chemin écrit une
adresse, ce que fera le carnet d'adresses de LS-59, et la colonne est un `Json`
sans contrainte en base.

**Rejouer n'y changerait rien**, et c'est ce qui classe le cas : une adresse
figée malformée le restera au passage suivant. C'est une donnée à corriger, pas
un aléa. Traité comme le stock épuisé, confirmer et alerter. Toute autre erreur
remonte toujours, une contrainte violée ou une panne de base étant des défauts à
rejouer, que le prestataire rejouera avec succès.

### Une facture émise sur une commande annulée

L'appel à l'émission était inconditionnel, alors que la mise à jour du statut est
gardée par `if (commande.statut === "EN_ATTENTE_PAIEMENT")`.

Scénario mesuré, et il est daté : commande passée à 10h00 sans webhook, la
réconciliation lit la session à 11h05, la trouve expirée et annule ; le webhook
retardé arrive à 11h20. Résultat, `F-2026-0001` émise pour une commande
`ANNULEE`.

Le stock sortait déjà dans ce cas depuis LS-119, ce n'est pas neuf. Ce qui est
neuf, c'est qu'un **document légal opposable** est produit, et qu'un document ne
se rattrape pas comme un mouvement de stock : seul un avoir le corrige.

**Arbitrage de Christophe** : ne pas facturer, alerter. `ANNULEE` est terminal,
`administration-commandes.ts` ne lui laissant aucune transition sortante, donc la
commande n'est pas ramenée à `CONFIRMEE`. L'alerte
`PAIEMENT_SUR_COMMANDE_ANNULEE` est le seul moyen de savoir qu'il y a de l'argent
à rendre, et le remboursement reste manuel, même interdiction qu'ADR-032.

### Ce que les deux corrections ont en commun

Les messages d'alerte **nomment les champs fautifs, jamais les valeurs**,
invariant 9 : une adresse est une donnée personnelle, et ces messages finissent
dans une table lue par l'administration puis dans un journal.

Chaque correction est prouvée par mutation, et chaque mutation ne fait rougir
**que son propre test**, un sur douze. Une mutation qui ferait tout rougir ne
prouverait rien, piège déjà relevé sur ce projet.

## La configuration de l'émetteur est faite

Christophe a renseigné les quatre variables le 31 août 2026, vérifiées par
`./scripts/verifier-emetteur-facture.sh` : quatre champs conformes, SIRET à
quatorze chiffres.

Ce script rend un **verdict par champ et n'imprime jamais une valeur**. Le dépôt
est public et l'adresse d'une entreprise peut être un domicile : une valeur
affichée entrerait dans une sortie de terminal, un journal d'intégration continue
ou un historique de session.

Il redéclare le schéma, Node ne résolvant pas l'alias `@/` sans outillage, et
`tsx` n'étant pas une dépendance du projet : l'installer à la volée rendrait le
contrôle dépendant du réseau. **Une règle recopiée diverge**, donc un test
confronte les deux déclarations champ par champ, en lisant les champs attendus
sur le schéma du service et non sur une troisième copie. Retirer un champ du
script le fait rougir, vérifié.

Un fait relevé au passage sans être un défaut : ni la raison sociale ni l'adresse
ne porte d'accent. C'est plausible pour une adresse, et c'est signalé à
Christophe plutôt que corrigé, la valeur ne m'étant pas lisible.

## Preuves

```
npm run type-check                          aucune sortie
npm run lint                                aucune sortie
npx prettier --check .                      All matched files use Prettier code style!
npm run test                                791 tests, 50 fichiers, 0 échec
./scripts/verifier-regles.sh                règles conformes au schéma
./scripts/verifier-propagation-docs.sh      18 schémas exportés, tous documentés
./scripts/verifier-registre-traitements.sh  34 tables rangées
./scripts/verifier-tests-non-ignores.sh     toute la suite s'exécute
mutation, sept cas neufs                    7 mutations, 7 detectees
./scripts/verifier-emetteur-facture.sh      emetteur conforme, quatre champs
```

## État des tickets

| Ticket | État |
|---|---|
| LS-126 | **Terminé**, fusionné par la PR #166, clôture documentaire par la #167 |
| LS-128, LS-129, LS-132 | débloquées, elles attendaient l'existence d'une facture |
| LS-82 | toujours **En cours**, son critère 1 attend le classement des messages renvoyés |
| LS-155 | inchangée, elle attend que Christophe relève `Authentication-Results` |

**Avancement mesuré dans Jira après la fusion** : 73 terminés sur 155, et treize
stories ouvertes en phase 4. Les deux comptes du `README.md` étaient devenus
faux et sont corrigés, celui de la phase 4 et « la facture n'étant écrite nulle
part, la dernière clé attend LS-126 ».

## Ce qui n'a pas été fait, et pourquoi

**Aucun PDF n'est produit**, règle F8. Le document existe en base d'abord, et
`cheminPdf` nul est l'état « rendu à produire », pas un document invalide. Lier
les deux ferait dépendre l'existence d'une facture de la réussite d'un rendu,
alors qu'un rendu se rejoue et qu'une facture ne se recrée pas. C'est LS-129.

**Aucun email ne porte la facture.** L'outbox de LS-82 existe et la facture aussi,
mais les rattacher demande le rendu, donc LS-129 d'abord.

**Les quatre variables `FACTURE_*` ne sont pas renseignées**, et elles sont
bloquantes pour la vente réelle. Elles sont documentées dans `.env.example`, avec
l'avertissement qu'une erreur ne se rattrape que par un avoir. Christophe est le
seul à pouvoir les poser, je n'ai pas accès aux valeurs et le dépôt est public.

## Prochaine étape

**LS-129**, le rendu PDF des factures et avoirs, suite directe de celle-ci : elle
referme `cheminPdf` et débloque l'envoi du document au client.

**LS-128** sinon, l'avoir et le remboursement, qui exerce la quatrième et
dernière écriture comptable et le `CHECK` bornant la somme des avoirs.

Reste ouvert par ailleurs : **LS-155**, le diagnostic de délivrabilité, qui
attend que Christophe relève l'en-tête `Authentication-Results` des deux messages
corrigés renvoyés le 27 août.
