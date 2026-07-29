# 29 juillet 2026, consolidation de la conception avant LS-2

Troisième session de la journée. Les deux précédentes corrigeaient des écarts
trouvés par des rapports externes. Celle-ci part d'une demande de Christophe :
consolider la conception avant d'ouvrir la phase 1, sans écrire une ligne de code
applicatif ni lancer de migration.

## Ce qui a été fait

### La livraison à domicile entre au Go-Live

Décision nouvelle, et la plus structurante de la session. Mondial Relay reste le
transporteur unique, offre Start, mais trois modes au lieu de deux : Point
Relais, Locker et domicile. Tarifs 4,10 € pour les deux premiers, 4,99 € pour le
troisième, offerts dès 39 € pour les trois.

**ADR-025 est le premier ADR de livraison du projet.** La décision du 28 juillet
ne vivait que dans LS-27 et LS-33, sans ADR. Il ne remplace donc aucun ADR, il
comble cette lacune, et c'est écrit tel quel dans le document plutôt que de
prétendre remplacer une décision inexistante.

### Le schéma ne portait aucun mode de livraison

Le manque le plus grave trouvé cette session. `Expedition` avait un
`pointRelaisId` nullable, dont la seule présence ou absence aurait servi à
deviner le mode. Un identifiant nul signifie aussi bien « domicile » que « relais
non encore choisi » ou « donnée perdue ».

Ajouté : enum `ModeLivraison`, `Commande.modeLivraison`, `Commande.pointRelaisId`
et `pointRelaisAdresse`, `Expedition.mode`, plus deux contraintes `CHECK` liant le
mode au point de retrait.

**Le mode est porté par les deux entités, et ce n'est pas une redondance.** La
commande fige ce que le client a choisi et payé. L'expédition porte ce que le
transporteur a exécuté. Un échec de livraison à domicile rebasculé vers un Point
Relais change la seconde et jamais la première.

### Cinq colonnes produit manquaient

LS-24 exigeait matières, dimensions et conseils d'entretien comme livrable, et
LS-15 prévoyait un filaire d'administration pour les saisir. Aucune colonne ne
pouvait les recevoir : l'exploitante n'aurait eu nulle part où écrire.

Ajouté sur `Produit` : `descriptionCourte`, `matieres`, `entretien`,
`fabrication`. Sur `Variante` : `dimensions`.

Arbitrage de Christophe sur le placement. Les dimensions vont à la variante, un
collier en 40 et 45 cm ne pouvant pas porter une dimension unique. Les matières
restent au produit, le catalogue réel ne montrant pas de variante changeant de
métal. Aucun moteur d'attributs générique : pour 10 à 40 références, un EAV
serait une complexité sans usage.

### Le contrôle de cardinalité des enums aurait échoué à tort

Trouvé en ajoutant `ModeLivraison` à `verifier-schema.sh`. Le contrôle comparait
le nombre d'enums en base au nombre de **lignes** de sa table de correspondance.
`ModeLivraison` étant porté par deux entités, il occupe deux lignes pour un seul
type : 14 en base contre 15 lignes, faux échec.

Le danger n'est pas le faux échec, c'est la correction évidente qu'il aurait
inspirée. Retirer une des deux lignes rend le script vert et cesse de contrôler
l'un des deux champs.

Corrigé en comptant les types distincts. Vérifié : 14 types pour 15 lignes, et 14
enums déclarés au schéma.

### La mutation a révélé une limite du contrôle corrigé

En vérifiant ma correction par mutation, un trou est apparu : retirer la ligne
`EXPEDITION|mode|ModeLivraison` passe désormais le contrôle de cardinalité, le
type restant couvert par la ligne `COMMANDE`.

Le contrôle prouve que chaque **type** est couvert, pas que chaque **champ**
l'est. Tant qu'un enum n'était porté que par une entité, les deux revenaient au
même ; ce n'est plus vrai.

Ajouté un contrôle de couverture par colonne, qui part de la base et exige que
toute colonne de type enum apparaisse dans la table de correspondance. La limite
du premier contrôle est écrite en commentaire plutôt que masquée.

Ce contrôle exige Docker et **n'a pas été exécuté** cette session.

> Suite du 29 juillet 2026, session suivante. Exécuté depuis, il a trouvé un
> défaut réel dès sa première exécution : `OrigineEcriture` est porté par trois
> colonnes et la table n'en couvrait qu'une. Voir
> `2026-07-29-execution-verifier-schema.md`.

### Réassurance, catalogue et fiche produit

Trois sections ajoutées à `frontend-design.md`, aucune n'existait.

Le dimensionnement du catalogue, 10 à 20 références à l'ouverture et jusqu'à 30 à
40 sans changement d'architecture, avec la liste de ce qui est écarté :
recherche externe, mégamenu, EAV, architecture pour milliers de références. Aucune
limite technique ne plafonnait le catalogue, il n'y avait donc rien à retirer.

La fiche produit, quatorze blocs ordonnés pour un écran de 320 px, et trois états
de disponibilité. La quantité exacte n'est pas publiée, sauf « dernière pièce »
qui est une information vraie et utile.

La réassurance commerciale, six éléments issus d'une configuration centralisée.
Aucun tarif recopié dans un composant : un seuil annoncé à 39 € sur la fiche et
appliqué à 45 € au panier est une information précontractuelle fausse.

### Benchmark Les Paulinas

Ajouté à LS-10. C'est le concurrent le plus proche, bijoux artisanaux ancrés à
Pau, donc le même bassin. Huit enseignements retenus, onze éléments explicitement
écartés dont les cartes cadeaux et la personnalisation, Won't et Hors V1.

LS-10 **n'est pas clos** : son critère de suffisance demande trois boutiques et
une page de conclusions couvrant le panier et la navigation à une main, non
examinés.

### LS-36 décomposée

L'epic bloque l'ouverture et n'avait aucune story enfant. Neuf créées, LS-54 à
LS-62, toutes Must et Go-Live.

Neuf et non treize. L'achat sans compte et le rattachement forment une seule
story, ce sont les deux faces du même sujet. L'invitation, le dépôt et la
modération des avis aussi, le jeton et l'avis étant écrits dans une même
transaction : les séparer produirait une story sans rien de testable.

Chaque story porte au moins un test négatif de sécurité, et les deux pièges déjà
documentés qui restent invisibles à la relecture sont en critère d'acceptation
explicite : le contrôle de `dissocieA` au rattachement, et l'ordre des écritures
sur l'adresse par défaut.

### Points juridiques vérifiés aux sources

Quatre vérifications, toutes aux sources officielles.

**L221-24 alinéa 4**, découvert cette session. Avec deux tarifs de livraison, il
devient possible de ne pas rembourser le surcoût d'un mode plus coûteux que le
mode standard. Christophe a tranché : la faculté n'est pas retenue, remboursement
au tarif réellement payé. L'écart est de 0,89 €, et l'exercer imposerait de
désigner un mode standard en CGV et au tunnel, sous peine du délai de douze mois
de L221-20.

**L221-24 alinéa 2** confirmé mot pour mot, « la date retenue étant celle du
premier de ces faits ». Le modèle le portait déjà correctement.

**L217-3**, garantie légale de conformité, deux ans à compter de la délivrance,
d'ordre public, mention obligatoire en CGV. **Absente de LS-28**, ajoutée au
livrable avec la distinction entre rétractation, garantie et retour commercial,
que les CGV doivent séparer explicitement.

**Durées de conservation CNIL** : facturation dix ans au titre du Code de
commerce, données client et prospection trois ans. Le droit à l'effacement ne
prime pas sur l'obligation comptable, ce qui fonde la dissociation plutôt que la
suppression, LS-62.

**Franchise en base** revérifiée : 85 000 € pour la vente de biens, majoré à
93 500 €. Le seuil unique à 25 000 € a été abandonné par la loi du 3 novembre
2025.

### La Corse n'a pas déclenché d'arbitrage

Christophe avait posé un point d'arrêt : si Mondial Relay classe la Corse en zone
insulaire ou surtaxée, s'arrêter et demander un choix entre trois options.

Vérification faite, la Corse est incluse au tarif France, sans supplément, pour
les trois modes. L'arbitrage n'a donc pas lieu d'être, et aucune des trois
options n'a été appliquée. Le point est marqué à revérifier à l'ouverture réelle
du compte : une grille professionnelle peut différer de la grille publique.

## Dérives et ce qui a résisté

**Le site Mondial Relay bloque l'accès automatisé**, 403 sur les deux pages de
FAQ tarifaire. L'information a été obtenue par recherche, deux résultats
concordants. C'est moins solide qu'une lecture directe de la source, et c'est la
raison de la réserve écrite dans ADR-025.

**Deux arbitrages ont été demandés à Christophe** plutôt que tranchés seul : le
placement des colonnes produit et le remboursement des frais de livraison. Le
second est un choix de politique commerciale avec une conséquence juridique, il
ne m'appartenait pas.

**Le bloc `EXPEDITION` du modèle conceptuel était incomplet** avant cette
session, il ignorait `pointRelaisId`, `statutTransporteur` et `synchroniseA`, tous
présents au schéma depuis LS-13. Complété au passage. `VARIANTE` marquait aussi
`libelle` nullable alors que LS-49 l'avait rendu obligatoire.

## État des contrôles

| Contrôle | Résultat |
|---|---|
| `verifier-regles.sh` | vert, 32 identifiants contre 29 avant |
| `verifier-regles-mutation.sh` | 8 mutations, 8 détectées |
| Cadratins dans le diff | aucun |
| `verifier-schema.sh` | **non exécuté**, exige Docker (exécuté à la session suivante, il échouait) |
| `type-check`, `lint`, `test` | sans objet, aucun `package.json` |

Le contrôle de couverture par colonne ajouté cette session n'a donc pas tourné.
Sa logique de conversion camelCase vers snake_case a été vérifiée hors base : les
quinze noms produits correspondent aux `@map` du schéma.

## État des tickets

| Ticket | État |
|---|---|
| LS-27 | commenté, trois modes et deux tarifs, non clos |
| LS-33 | commenté, événements de suivi du domicile, non clos |
| LS-10 | commenté, Les Paulinas ajouté, **non clos**, deux boutiques restent |
| LS-24 | commenté, modèle produit consolidé |
| LS-15 | commenté, cinq champs de plus au filaire |
| LS-28 | commenté, neuf manques dont la garantie légale |
| LS-26 | commenté, cohérence de la FAQ |
| LS-36 | décomposée, neuf stories créées |
| LS-54 à LS-62 | créées, Must et Go-Live |

## Prochaine étape

**Découper LS-2.** Rien ne le bloque plus. Le schéma est définitif pour la
migration initiale depuis LS-53, et cette session a fermé les manques de
conception qui auraient imposé une migration corrective après la première.

Les onze stories esquissées la veille restent non validées, et les deux questions
posées à Christophe restent ouvertes : granularité, onze stories ou regroupement,
et ordre d'attaque.

Trois dettes de LS-13 attendent toujours la phase 1 : fixer Node 22 LTS partout,
créer `prisma.config.ts`, recopier **toutes** les contraintes `CHECK` dans la
migration Prisma. Elles sont maintenant dix-neuf, mais ne pas écrire ce nombre
ailleurs qu'ici, la commande fait foi :

```bash
grep -c "ADD CONSTRAINT" prisma/migrations/manual/001_contraintes_check.sql
```

## Ce qui reste à trancher par Christophe et l'exploitante

**La formulation « faits main en Béarn »** doit être confirmée sur le lieu réel
de fabrication avant publication. Une allégation d'origine géographique fausse
est une pratique commerciale trompeuse. La réserve est écrite dans
`frontend-design.md`.

**Le compte Mondial Relay et le compte Stripe** restent bloqués par l'ouverture
du compte bancaire professionnel. Le domicile est conçu, il sera vérifié
réellement quand le compte existera. Aucune réponse d'API inventée, aucun secret
factice.
