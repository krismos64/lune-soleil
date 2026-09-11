# ADR-043 : les paramètres commerciaux passent en base, et les tarifs avec eux

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 11 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-98 |

## Ce que cet ADR remplace

Il **remplace l'arbitrage du 31 août 2026**, écrit dans `src/services/facture.ts`
et jamais porté par un ADR :

> ARBITRAGE DU 31 AOUT 2026, l'environnement plutôt qu'une table. Ces quatre
> valeurs changent au rythme d'un déménagement, pas d'une vente : une table de
> paramétrage aurait demandé une migration, un écran d'administration et un ADR
> pour une donnée quasi immobile.

**Ce raisonnement reste juste pour l'identité légale**, et cet ADR ne la déplace
pas. Il vaut moins pour les tarifs de livraison et les seuils, qui relèvent d'une
décision commerciale et non d'un fait administratif.

Il **précise** ADR-025 et ADR-035 sans changer aucune de leurs valeurs : le
Point Relais reste à 4,10 €, le domicile à 7,49 €, la franchise à 39 € réservée
aux modes en relais. Ce qui change est **où ces valeurs vivent**, et qui peut
les modifier.

## Contexte

### Ce qui existait, et qui était déjà bon

`src/lib/livraison.ts` est la source unique des tarifs depuis LS-115. Aucun
composant n'écrit un montant en dur, `frontend-design.md` l'interdit, et six
appelants reçoivent la configuration par injection. Un tarif manquant **lève**
au lieu de se replier sur une constante.

**Le défaut n'est donc pas dans le code, il est dans qui décide.** Changer le
seuil de franchise demande aujourd'hui de modifier `.env` sur le serveur et de
redéployer : l'exploitante ne peut pas le faire, et une décision commerciale
ordinaire devient une intervention technique.

### Ce qui a déclenché l'arbitrage

La description de LS-98 pose la question depuis le 13 août 2026, et son critère 7
exige précisément cet ADR : « si un tarif d'ADR-025 devient modifiable en base,
un ADR le tranche avant l'implémentation ».

**L'écran en lecture seule a été envisagé et écarté.** Il ferme la dernière
rubrique « Bientôt disponible » de la barre à moindre coût, et laisse entier le
problème réel : une boutique qui ne peut pas changer ses frais de port sans son
développeur.

## Décision 1 : une table de paramètres, et une seule ligne

`ParametreBoutique`, à ligne unique, garantie par un `CHECK` sur une colonne
d'identité constante. Le motif est celui de `CompteurNumero` : une table de
configuration à plusieurs lignes finit par en porter deux qui se contredisent,
et rien ne dit laquelle fait foi.

**Ce qui entre en base :**

| Paramètre | Pourquoi il bouge |
|---|---|
| tarif Point Relais et Locker | grille transporteur, révisée annuellement |
| tarif domicile | même grille |
| seuil de franchise, `null` pour désactiver | **levier commercial**, celui qui bouge le plus |
| seuil d'alerte de stock faible | dépend du rythme de production |
| email de réception des alertes | change avec l'organisation |
| cinq interrupteurs d'alerte | voir décision 4 |

**Ce qui reste hors de la base, et la raison de chacun :**

| Reste figé | Raison |
|---|---|
| identité légale, SIRET, adresse, forme juridique | l'arbitrage du 31 août tient : un fait administratif, pas une décision |
| nom commercial, `NOM_BOUTIQUE` | c'est la **marque**. Le rendre modifiable inviterait à la changer sans arbitrage, motif écrit dans `src/lib/seo.ts` |
| les **trois modes** de livraison | ADR-025. Ajouter ou retirer un mode touche le schéma, les contraintes et le tunnel : ce n'est pas un réglage |
| la **réserve de franchise** sur le domicile | ADR-035, et voir décision 3 |

## Décision 2 : le tarif n'est jamais lu pour une commande passée

**L'invariant 3 est déjà tenu, et cette décision ne fait que l'écrire.**
`Commande.fraisPortCentimes` est persisté à l'écriture, calculé par
`calculerFraisPort` dans la transaction qui crée la commande. Une modification de
tarif ne réécrit donc aucune commande, aucune ligne, aucune facture.

**Aucun historique de paramètres n'est conservé**, et c'est un choix. La
tentation serait de dater chaque changement pour pouvoir rejouer un calcul
ancien : c'est inutile, puisque le montant appliqué est déjà figé sur la
commande. Un historique serait une seconde source de vérité pour une question à
laquelle la commande répond déjà.

**Ce que cela laisse ouvert, et qui est accepté** : une commande en cours de
tunnel au moment d'un changement de tarif. Le récapitulatif affiche l'ancien
montant, la commande écrite porte le nouveau. La fenêtre est de quelques minutes,
l'écart de quelques euros, et l'exploitante est la seule personne à pouvoir
déclencher ce cas. Le récapitulatif étant recalculé côté serveur à la validation,
le client voit le montant réel avant de payer.

## Décision 3 : la réserve de franchise ne devient pas un paramètre

`calculerFraisPort` réserve la franchise aux modes en relais, `exigePointRetrait`,
et **cette règle reste dans le code**.

La rendre configurable permettrait d'offrir le domicile au seuil, ce qu'ADR-035 a
explicitement écarté : le domicile coûte 7,49 € qu'une commande de 40 € ne
finance pas. Un interrupteur d'écran permettrait de contredire un ADR accepté
d'un clic, sans trace ni arbitrage.

**Un paramètre qui permet de violer une décision structurante n'est pas un
paramètre, c'est un contournement.**

## Décision 4 : les alertes sont des interrupteurs, jamais des destinataires libres

Cinq alertes, correspondant à celles du prototype : commande payée, paiement
annulé, stock faible, message reçu, avis à modérer.

**Chacune est un booléen**, et toutes partagent **un seul destinataire**, celui
de la boutique. Permettre un destinataire par alerte ouvrirait un envoi d'email
vers une adresse arbitraire depuis un écran d'administration, ce qui est un
vecteur d'exfiltration et non un réglage de confort.

**L'email de réception est validé par Zod** et ne peut pas être vide : une
adresse absente désactiverait toutes les alertes en silence, alors que les
interrupteurs sont là pour cela.

## Décision 5 : la lecture devient asynchrone, le calcul ne change pas

`lireConfigurationLivraison` lit la base et devient `async`. `calculerFraisPort`
reste **synchrone et pur** : il reçoit la configuration en argument, comme
aujourd'hui.

C'est ce qui rend la migration chirurgicale. Les six appelants prennent déjà la
configuration par injection avec une valeur par défaut : seul le mot-clé `await`
s'ajoute, et les tests unitaires du calcul ne bougent pas d'une ligne.

**La configuration est lue une fois par requête, jamais mise en cache en
module.** Une constante figée au démarrage du processus rendrait un changement
invisible jusqu'au redéploiement, ce qui annulerait l'objet de cet ADR. Le motif
est le même que celui de `cleDeSignature` dans `src/lib/jeton-acces.ts`.

## Décision 6 : la base ne se substitue pas à l'amorçage

Une boutique dont la table est vide ne doit pas facturer zéro euro de port.

**La lecture lève** quand la ligne est absente, exactement comme aujourd'hui
quand une variable manque, et `ConfigurationLivraisonInvalideError` est
conservée. Les pages publiques qui la rattrapent déjà continuent de masquer le
bloc de tarifs plutôt que d'annoncer un montant inventé.

**La migration amorce la ligne avec les valeurs d'ADR-035**, 410, 749 et 3900.
Elle ne lit pas l'environnement : une migration qui dépend de l'environnement du
serveur qui l'exécute produit des bases différentes selon l'endroit où elle
tourne.

**Les variables `SHIPPING_*` disparaissent** de `.env.example` et de la CI. Les
laisser en place créerait deux sources de vérité, et la question « laquelle fait
foi » se poserait au pire moment.

## Conséquences

| Élément | Ce qui change |
|---|---|
| `prisma/schema.prisma` | `ParametreBoutique`, ligne unique |
| `prisma/sql-manuel/` | `CHECK` d'unicité de ligne, et de positivité des montants |
| `src/lib/livraison.ts` | `lireConfigurationLivraison` devient `async` et lit la base |
| `src/repositories/` | `parametres.ts`, accès à la ligne |
| `src/services/` | `parametres.ts`, cas d'usage de lecture et d'écriture |
| `src/app/administration/parametres/` | l'écran, sa Server Action et sa garde |
| `src/services/tableau-bord.ts` | `SEUIL_STOCK_FAIBLE` vient de la base |
| `.env.example`, `controles.yml`, `nocturne.yml` | les trois `SHIPPING_*` partent |
| `.claude/rules/frontend-design.md` | « valeur issue de la configuration » devient vrai |
| `navigation-administration.tsx` | « Paramètres » quitte `RUBRIQUES_A_VENIR` |
| `.claude/familles-sans-action.txt` | `PARAMETRES_BOUTIQUE` obtient son action |

## Ce qui ferait revenir sur cet ADR

**Un second point de vente qui aurait ses propres tarifs.** La table à ligne
unique deviendrait fausse, et l'ADR devrait être remplacé plutôt qu'étendu : une
colonne « boutique » ajoutée après coup laisserait toutes les lectures existantes
sans filtre. Le projet est mono-tenant par décision, ce cas n'est pas prévu.

**Une obligation de traçabilité sur les changements de tarif.** Le décision 2
écarte l'historique parce que la commande porte son montant figé. Si un texte
imposait un jour de prouver le tarif affiché à une date donnée, indépendamment de
toute commande, l'historique deviendrait nécessaire.

## Alternatives écartées

**Garder l'environnement et ne faire qu'un écran de lecture.** Ferme la rubrique
à moindre coût et laisse le problème entier : l'exploitante ne peut toujours pas
changer son seuil de franchise.

**Réécrire le fichier `.env` depuis l'écran.** Impossible en pratique : le
conteneur est en `standalone`, `next build` fige les valeurs `NEXT_PUBLIC_`, et
un fichier écrit dans le conteneur ne survit pas au redéploiement. Une correction
qui paraît fonctionner en développement et échoue en production silencieusement.

**Une table à plusieurs lignes, une par paramètre, en clé-valeur.** Souple, et
elle perd le typage : un seuil et un booléen deviennent deux chaînes, la
validation quitte le schéma pour se disperser dans le code, et une clé mal
orthographiée devient un paramètre fantôme que rien ne signale.
