# 2 septembre 2026, session C : LS-154

La purge de l'outbox d'emails, dette ouverte par LS-82 le 27 août 2026. La table
`envoi_en_attente` n'était branchée sur aucune purge et grossissait
indéfiniment, alors qu'elle porte l'adresse du destinataire et les variables du
message.

`Message`, livrée le matin même par LS-97, était dans le même état : sa durée de
trois ans était annoncée au registre et appliquée par personne.

Aucune migration. Deux fonctions et deux lignes dans la table `PURGES`
existante, sans créer de sixième tâche planifiée.

## Pourquoi ce n'était pas un `deleteMany` de plus

C'est la raison pour laquelle la dette existait plutôt que d'avoir été soldée
dans LS-82. **Les quatre statuts n'ont pas la même valeur.**

`ENVOYE` et `ECHOUE` sont **terminées** : l'information de fond survit dans
`JournalEmail`, qui est la trace opposable. Elles peuvent partir.

`ENVOI_EN_COURS` est **bloquée et ambiguë** : personne ne sait si le message est
parti, ADR-033 refuse de trancher automatiquement, et une alerte appelle
l'exploitante à décider. **La purger effacerait précisément ce qu'il faut
traiter**, et le ferait en silence : l'incident disparaîtrait sans avoir été
résolu.

`EN_ATTENTE` n'est pas encore partie : la purger priverait un client de sa
confirmation.

Une purge par âge seul aurait passé tous les tests naïfs et aurait été fausse.

## Le filtre est une liste positive, jamais une négation

`not: { in: [...] }` aurait le même effet aujourd'hui et le perdrait au premier
statut **ajouté** à l'enum : un `ARCHIVE` inconnu serait purgé par défaut.

La liste positive garde le défaut **fermé**, même motif que les prédicats
d'index partiel de ce projet, où un enum élargi a déjà ouvert un trou en
silence.

## Les deux durées, justifiées et non inventées

**Trente jours pour les lignes terminées.** Aucun texte ne vise cette table, et
c'est assumé plutôt que masqué par un faux alignement, l'erreur que LS-94 avait
corrigée sur `RateLimit`.

Le raisonnement tient en deux temps. L'information de fond ne vit pas ici, elle
est dans `JournalEmail`. Mais la ligne d'outbox porte les **variables** du
message, que le journal ne conserve pas : une réclamation « je n'ai jamais reçu
ma confirmation » arrive quelques jours plus tard. Trente jours couvrent ce
délai sans garder une adresse un an.

**Trois ans pour les messages de contact**, référentiel CNIL n° 2021-131, durée
que LS-97 avait déjà portée au registre le matin même.

**La date de référence est `creeA` et non `luA`.** Le référentiel compte à
partir du dernier contact émanant du prospect, donc de l'envoi, jamais du moment
où l'exploitante ouvre le message. Ancrer sur la lecture ferait dépendre une
durée légale d'un geste interne, et `luA` étant nullable, un message jamais lu ne
serait **jamais** purgé.

## Le 29 février détruisait une donnée trop tôt

Trouvé par moi-même avant la revue, en vérifiant un cas de bord plutôt qu'en le
supposant sain.

`setUTCFullYear` seul déborde sur une année bissextile : le 29 février 2024
moins trois ans donne le **1er mars 2021**, et non le 28 février. La limite part
alors vers l'avant.

**Le sens de l'erreur est le mauvais**, et c'est ce qui la rend grave : un
message du 28 février 2021 était supprimé le 29 février 2024 alors qu'il n'avait
que deux ans et 366 jours. Une donnée personnelle détruite **avant** le terme
annoncé au registre, ce qu'aucun rejeu ne rattrape.

C'est le jumeau exact du débordement de `setUTCMonth` corrigé en relecture de
LS-80, où le 31 août moins six mois donnait le 3 mars. Le mécanisme de
`limiteDeConservation` est repris tel quel.

## Ce que la revue critique a trouvé, et que j'avais introduit

**`purgerEnvoisTermines` portait `lte` quand les trois autres purges portent
`lt`**, et le commentaire de `purgerJournalAudit` énonce la position quatre
lignes plus haut : « à la frontière, garder une ligne de trop vaut mieux qu'en
supprimer une qui pouvait servir ».

Le code contredisait son propre commentaire, et l'écart était passé dans un
commit de correction sans être mentionné.

**Aucun test ne le voyait**, mesuré : la mutation `lte` vers `lt` laissait les
quinze tests verts. C'est exactement la leçon que le test jumeau de
`journal_audit` documente **dans ce même fichier**, et que je n'avais pas
appliquée à la purge ajoutée.

La limite est désormais exposée par `limiteEnvoiTermine`, et le test s'y ancre
plutôt que de recopier le calcul. Même motif : la première version du test de
`journal_audit` recopiait un calcul « équivalent » qui plaçait la ligne trois
jours plus loin, là où elle survit que la comparaison soit stricte ou non.

## Ce que la revue a vérifié et déclaré sain

Elle a mesuré sur la base réelle plutôt que de raisonner :

- **aucune clé étrangère ne pointe vers `envoi_en_attente` ni `message`**, une
  seule sortante vers `commande` en `SET NULL`. Une purge ne peut rien
  orpheliner, et `JournalEmail` est une entité indépendante
- **le filtre de statut est éprouvé** : son retrait fait rougir quatre tests
- **l'ordre des purges est sans importance**, aucune ne dépend d'une autre
- **le calcul des trente jours est sain**, `creeA` étant en `timestamptz(3)`
  donc en UTC, sans changement d'heure applicable

## Vérifications

```
npm run type-check                        OK
npm run lint                              OK
npm run format:check                      All matched files use Prettier code style!
npm run test:unitaire                     388 tests verts
npm run test:integration                  533 verts, 37 fichiers
./scripts/verifier-registre-traitements.sh  36 tables rangées, 10 traitements
./scripts/verifier-regles.sh                règles conformes au schéma
```

**Quatre mutations ciblées, quatre détections précises.** Retirer le filtre de
statut fait rougir quatre tests ; faire entrer `ENVOI_EN_COURS` dans le filtre en
fait rougir trois ; le calcul de date fautif en fait rougir un seul, le
bissextile ; le `lte` remis en fait rougir un seul, la frontière.

**Les deux tests d'ensemble énumèrent les cinq tables en dur**, et c'est
délibéré : une sixième purge les fera rougir, donc personne ne l'ajoutera sans se
demander si elle doit figurer au registre.

## Ce qui reste

**Aucune dette ouverte par cette story.** Le paragraphe « la purge de cette table
n'est pas encore branchée » a disparu du registre, remplacé par la règle.

`JournalEmail` reste non purgé, et ce n'est pas un oubli : sa durée suit la
commande qu'il sert, jusqu'à dix ans au titre de l'article L123-22 du code de
commerce quand la commande a produit une facture.

## Prochaine étape

Les trois stories demandées sont livrées. La phase 4 ne garde que des sujets qui
demandent un arbitrage ou un accès externe : **LS-33**, comment le site apprend
qu'un colis est livré, qui commande toute la phase 5 ; **LS-131**, le suivi
Mondial Relay, en attente du compte ; **LS-98**, les paramètres commerciaux.

## État des tickets

LS-154 livrée. LS-130 et LS-97 closes le même jour. **LS-162 et LS-163 créées**,
la navigation de l'administration et le plafond des listes, toutes deux
rattachées à LS-3.
