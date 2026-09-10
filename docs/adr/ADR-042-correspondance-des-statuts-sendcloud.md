# ADR-042 : correspondance des statuts Sendcloud, deux statuts livrent et les échecs alertent

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 10 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-131 |

## Ce que cet ADR précise

Il ne remplace aucun ADR. Il **précise** ADR-025 et la section « D'où vient la
date de réception » de `.claude/rules/legal.md`, dont la table des quatre
événements a été écrite le 28 juillet 2026 sur le vocabulaire **Mondial Relay**,
avant qu'ADR-035 ne fasse passer l'intégration par Sendcloud.

**La règle métier ne change pas** : seule la prise de possession physique par le
client renseigne `Expedition.livreA`. Ce qui change est la liste des statuts qui
la constatent, et le traitement des cas que la table de quatre ne prévoyait pas.

## Contexte

Les statuts ont été relevés le 10 septembre 2026 sur l'API réelle,
`GET /api/v2/parcels/statuses`, avec les clés de l'intégration de développement
créée en LS-200. **Trente-cinq statuts**, là où LS-131 en prévoyait quatre.

Sendcloud normalise les messages de chaque transporteur dans un `parent_status`,
ce qui rend la correspondance stable si un second transporteur s'ajoutait.

## Décision 1 : deux statuts renseignent `livreA`, et non un seul

| Identifiant | Statut Sendcloud | Mode concerné |
|---|---|---|
| **11** | `Delivered` | domicile |
| **93** | `Shipment collected by customer` | Point Relais, Locker |

**C'était le point non tranché de LS-200**, signalé et laissé ouvert plutôt que
supposé. La documentation le règle : `Delivered` vise la remise au client final à
son adresse, `Shipment collected by customer` le retrait par le client dans un
point de service. Les deux sont une prise de possession physique.

**Écrire la règle sur le seul `Shipment collected by customer` aurait laissé
toute livraison à domicile sans `livreA`**, donc sans délai de rétractation
ouvert et sans invitation à déposer un avis. Le défaut n'aurait été visible
qu'après la première vente livrée à domicile.

## Décision 2 : la liste des statuts qui NE livrent PAS est explicite

Les faux amis, qui signifient précisément que le client n'a **pas** le colis :

| Identifiant | Statut | Pourquoi il ne livre pas |
|---|---|---|
| 12 | `Awaiting customer pickup` | le colis attend au point de service |
| 8 | `Delivery attempt failed` | personne n'était là, rien n'est remis |
| 91 | `Parcel en route` | en cours d'acheminement |
| 92 | `Driver en route` | en tournée, pas encore remis |

Un colis peut rester une semaine en relais avant retrait. Prendre `Awaiting
customer pickup` pour une livraison éteindrait le droit de rétractation avant
terme, et l'article L221-20 sanctionne l'information incorrecte sur ce droit par
un délai porté à **douze mois**.

**Le code raisonne sur une liste blanche de deux valeurs**, jamais sur une liste
noire. Un statut inconnu ne livre pas, ce qui est le sens sûr : les 35 statuts
d'aujourd'hui peuvent devenir 40 demain, et un statut neuf mal classé qui
livrerait par défaut serait invisible.

## Décision 3 : les échecs définitifs alertent, sans statut de commande dédié

**Arbitrage de Christophe du 10 septembre 2026.** Quatre statuts constatent qu'un
colis n'arrivera pas :

| Identifiant | Statut |
|---|---|
| 80 | `Unable to deliver` |
| 62991 | `Refused by recipient` |
| 62992 | `Returned to sender` |
| 62997 | `Address invalid` |

Ils lèvent une `AlerteCritique` de type `LIVRAISON_EN_ECHEC`, gravité
`AVERTISSEMENT`, ciblant l'expédition. L'exploitante traite le cas à la main.

**Aucun statut de commande n'est créé, et aucun mouvement de stock n'est écrit.**

Trois motifs. Le volume attendu ne justifie pas d'ouvrir le graphe des
transitions de commande, que LS-121 a fermé avec soin. Le traitement dépend de
faits que le site ignore : l'exploitante doit décider entre rembourser,
réexpédier ou remettre en vente selon l'état réel de la pièce. Et ADR-030 pose
déjà qu'une alerte de ce genre n'écrit aucun mouvement de stock, même motif que
`RETOUR_JAMAIS_RECU` en LS-135.

**`livreA` reste nul dans ces quatre cas**, ce qui est exact : le client n'a rien
reçu. Le délai de rétractation ne court donc pas, et aucune invitation à déposer
un avis ne part.

## Décision 4 : l'alerte n'est levée qu'une fois, par un index partiel

L'idempotence est ancrée sur **l'effet** et non sur l'événement, invariant 5 : la
tâche tourne toutes les heures et reverrait le même statut à chaque passage.

**La déduplication n'existait pas**, constaté en écrivant cette story et mesuré
sur la base réelle : `alerte_critique` ne portait qu'un seul index, sa clé
primaire. `envoi-email.ts` affirmait pourtant en commentaire que
`leverAlerteCritique` refusait les doublons, et son `try/catch` attrapait une
erreur que rien ne levait. La tâche d'envoi tournant toutes les minutes, un envoi
bloqué produisait 1440 alertes par jour.

**Arbitrage de Christophe du 10 septembre 2026 : corriger ici**, plutôt que de
bâtir une déduplication applicative faible sur un défaut connu. Le ticket LS-217,
créé puis clos comme repris, porte le constat d'origine.

**Un index partiel unique** sur `(type, id_cible)` filtré sur
`acquittee_a IS NULL` : le doublon est refusé tant que l'alerte est ouverte, et
une alerte neuve redevient possible après acquittement, ce qui est le
comportement voulu quand le problème resurgit.

**La contrainte vit en base et non dans le code**, question 5 des quinze : deux
cycles concurrents ne peuvent pas passer ensemble, là où une recherche
applicative laisserait une fenêtre. `leverAlerteCritique` devient l'unique voie
d'écriture, et son conflit se rattrape par `P2002`.

## Décision 5 : `statutTransporteur` stocke le libellé, jamais l'identifiant

La colonne existante est un `String?`. Elle reçoit le **message** Sendcloud,
`Delivered` ou `Awaiting customer pickup`, et non son identifiant numérique.

**Un identifiant nu est illisible sur un écran d'administration**, et l'écran de
LS-216 affichera cette colonne à l'exploitante. Le code compare en revanche sur
les **identifiants numériques**, stables là où un libellé peut être reformulé par
le fournisseur.

## Conséquences

**La table de `legal.md` est réécrite** avec le vocabulaire Sendcloud, en gardant
la table Mondial Relay en regard : elle documente le raisonnement d'origine et
reste vraie du transporteur.

**Un type d'alerte nouveau**, `LIVRAISON_EN_ECHEC` : `AlerteCritique.type` est un
`String` libre, donc aucune valeur d'enum à ajouter.

**Une migration**, pour l'index partiel unique de la décision 4. `Expedition`
porte en revanche déjà `statutTransporteur`, `livreA` et `synchroniseA` depuis
LS-13, aucune colonne n'est ajoutée.

**LS-216 affichera ces statuts**, et son critère « aucun des trois événements
intermédiaires n'est présenté comme une livraison » se lit désormais sur la liste
de quatre faux amis ci-dessus.

## Ce qui reste ouvert

**Le rebasculement domicile vers Point Relais**, prévu par ADR-025 et LS-131,
n'a **aucun statut dédié** dans la liste des 35. Le candidat le plus proche est
`Delivery method changed`, identifiant 62993, dont la documentation ne précise
pas s'il couvre ce cas. Il n'est donc **pas** câblé sur `Expedition.mode` : le
faire sur une supposition écrirait un mode faux. À rouvrir sur une expédition
réelle qui aura subi le cas, ou sur une réponse du support Sendcloud.

## Sources

* `GET https://panel.sendcloud.sc/api/v2/parcels/statuses`, relevé le
  10 septembre 2026, 35 statuts
* Documentation Sendcloud, « Retrieve tracking info », définitions des statuts,
  consultée via Context7
* Article L221-18 du Code de la consommation, délai à compter de la réception
* Article L221-20, délai porté à douze mois si l'information est mal fournie
* ADR-025 pour les trois modes, ADR-035 pour le passage à Sendcloud, ADR-030 pour
  l'absence de mouvement de stock automatique
