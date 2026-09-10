# 10 septembre 2026, k : LS-131, le suivi automatique

La story attendait depuis le 27 août. Elle décrivait quatre événements, l'API
réelle en compte trente-cinq, et **deux** renseignent `livreA` là où elle n'en
voyait qu'un.

## Le défaut que la mesure a évité

La description dit « remis au destinataire, les trois modes », formulation qui
suggère un statut unique. Les statuts relevés sur l'API réelle disent autre
chose :

```
11    Delivered                        domicile
93    Shipment collected by customer   Point Relais, Locker
```

**Écrire la règle sur le seul retrait en relais aurait laissé toute livraison à
domicile sans `livreA`.** Pas de délai de rétractation ouvert, pas d'invitation à
déposer un avis, et le défaut invisible jusqu'à la première vente livrée à
domicile. Le genre d'erreur qui se paie en litige, des mois plus tard.

Ce point était **signalé comme ouvert** à la clôture de LS-200, plutôt que
supposé. C'est ce qui a fait le chercher.

## Le code raisonne sur une liste blanche

Trente-cinq statuts aujourd'hui, peut-être quarante demain. Un statut inconnu
**ne livre pas**, ce qui est le sens sûr : ne rien conclure allonge le délai du
client, l'inverse l'éteint trop tôt.

Les faux amis sont nommés dans `legal.md` avec leur identifiant : `Awaiting
customer pickup` (12), `Delivery attempt failed` (8), `Parcel en route` (91),
`Driver en route` (92).

## Le périmètre s'est élargi en cours de route

**Arbitrage de Christophe** : corriger plutôt que différer, quitte à élargir la
story. Le ticket LS-217, créé puis clos comme repris, portait le constat.

`envoi-email.ts` affirmait en commentaire que les alertes étaient dédupliquées
par type et cible. Mesure sur la base réelle :

```
docker exec lune-soleil-db psql -U lunesoleil -d lunesoleil -c "\d alerte_critique"

Indexes:
    "alerte_critique_pkey" PRIMARY KEY, btree (id)
```

**Un seul index.** `leverAlerteCritique` faisait un `create` nu, et le
`try/catch` attrapait une erreur que rien ne levait. La tâche d'envoi tournant
chaque minute, un envoi bloqué produisait **1440 alertes par jour**.

Trois signaux concordants pour une protection absente : un commentaire qui
l'affirme, un `try/catch` qui en a la forme, et un nom de fonction qui la
suggère.

## `NULLS NOT DISTINCT`, vérifié plutôt que supposé

L'index partiel sur `(type, id_cible)` ne garantissait rien sur une cible nulle,
`id_cible` étant nullable. Testé sur la base avant d'écrire la ligne :

```
INSERT ('X', NULL) ;  INSERT ('X', NULL)  ->  2 lignes, l'index ne voit rien
avec NULLS NOT DISTINCT  ->  ERROR: duplicate key value
```

Motif déjà en mémoire, « prédicat d'index sans garantie ». Disponible depuis
PostgreSQL 15, la base tourne en 18.

## Le SQL de référence ne portait pas l'index

Troisième fichier à synchroniser à la main, et `db:verifier` ne l'aurait pas vu :
il compte les **tables**, pas les index. Son « SQL de référence complet, 36
tables » restait vert avec l'index manquant.

## Trois contrôles du projet ont attrapé mes défauts

**`verifier-regles.sh`** a vu que le service appelait Prisma directement.
`listerASuivre` et `enregistrerSuivi` sont partis dans `repositories/`, où la
frontière du projet les attend. Corrigé plutôt que contourné par une dérogation.

**`verifier-taches-planifiees.sh`** a vu que la tâche était déclarée sans être
déclenchée : elle n'aurait **jamais tourné**, et l'application aurait démarré,
`/api/sante` aurait rendu 200, et le travail n'aurait simplement pas été fait.
Exactement le défaut que LS-206 avait fermé pour `envoi-emails`.

**Quatre documents annonçaient « cinq tâches »** : `database.md`, `README.md`
deux fois, `EXPLOITATION.md` et `REFERENCES.md`. Le README portait même sa
commande de mesure juste à côté de son chiffre faux.

Le compte n'est plus inscrit nulle part. Le contrôle le mesure dans les deux
sens, ce qui est la seule forme qui ne se périme pas.

## Vérifications

```
npm run type-check                        vert
npm run lint                              vert
npm run format:check                      vert
verifier-regles.sh                        règles conformes au schéma
verifier-taches-planifiees.sh             déclarée et déclenchée, dans les deux sens
verifier-taches-planifiees-mutation.sh    9 cas, tous conformes
verifier-registre-traitements.sh          36 tables rangées
db:verifier                               117 réussites, 0 échecs
mutations LS-131                          9 jouées, 9 rouges
```

Les neuf mutations : `Awaiting customer pickup` qui livre, `Delivered` retiré,
le retrait en relais retiré, la liste blanche rendue permissive, `livreA`
réécrit à chaque cycle, `synchroniseA` renseigné malgré l'échec, une panne qui
arrête le cycle, l'échec définitif rendu silencieux, et **l'index d'unicité
retiré**. Cette dernière prouve que la déduplication vient de la base et non
d'un hasard de test.

## Le critère 3, d'abord laissé ouvert puis tranché

Il l'est resté deux heures. La recherche documentaire l'a fermé, et le détour
mérite d'être raconté parce que ma première conclusion était fausse.

**Premier constat** : aucun des 35 statuts ne décrit le rebasculement. Le
critère est laissé non coché plutôt que fermé à tort, et le ticket reste ouvert.

**Deuxième constat, après lecture de la documentation officielle** : le
rebasculement n'a pas besoin d'un statut dédié. `Awaiting customer pickup` (12)
sur une expédition `DOMICILE` ne peut venir que de là, la définition officielle
décrivant où **est** le colis, « delivered to a service point », et non où il
devait aller. J'ai annoncé « trente minutes de travail ».

**Troisième constat, en codant** : la contrainte de base est une **équivalence**.

```
CHECK ((mode IN ('POINT_RELAIS','LOCKER')) = (point_relais_id IS NOT NULL))
```

Passer le mode à `POINT_RELAIS` **exige** l'identifiant du point. Sendcloud ne
le fournit pas : `to_service_point` porte le point **choisi à la création**,
`details.is_to_service_point` n'est qu'un booléen, et `events[]` ne porte aucun
champ structuré. Vérifié sur la documentation officielle et confirmé par
Christophe sur les API v2 et v3.

**La déduction suffisait pour DÉTECTER, pas pour ÉCRIRE.** Il manquait une
donnée, pas seulement une interprétation, et cette nuance m'avait échappé.

`estDeposeEnPointRetrait` est donc livré pour l'affichage, LS-216 pourra dire
« déposée en point de retrait » sans que la base affirme ce qu'elle ne peut pas
garantir. **Le délai de rétractation reste exact** dans ce scénario, le retrait
effectif renseignant `livreA` par le statut 93 : ce qui manque est un détail
d'écran, pas un point de droit.

ADR-042 décision 6 trace le raisonnement et les trois champs écartés.

**Deux issues ont été refusées** : écrire un identifiant inventé mettrait une
fausse adresse sur une expédition réelle, et relâcher la contrainte
affaiblirait ADR-025 pour un besoin d'affichage.

## État des tickets

**LS-131 est close**, les sept critères traités, le troisième avec sa limite
documentée dans ADR-042 décision 6.

**LS-217** close comme reprise dans LS-131, son constat conservé.

**LS-216**, le suivi côté administration, devient jouable : les champs qu'elle
affiche sont désormais alimentés.

**LS-58 et LS-61** deviennent jouables aussi, `livreA` étant renseigné.

## Prochaine étape

**LS-58**, le suivi dans l'espace client, ou **LS-216**, le même côté
administration. Les deux ne dépendent plus que d'elles-mêmes.

**LS-61**, les avis, reste le morceau le plus gros : l'invitation part après
livraison, et cette livraison est maintenant constatée.
