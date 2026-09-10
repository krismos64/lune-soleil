# ADR-040 : aucune mesure d'audience à l'ouverture

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 10 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-141 |

## Décision

**Aucune mesure d'audience n'est mise en place pour l'ouverture.** Ni Umami, ni
aucun autre outil.

La décision est **réversible** et le restera : l'analyse ci-dessous établit
qu'Umami auto-hébergé serait conforme, et elle reste valable le jour où le besoin
apparaîtra.

**Aucun consentement n'est donc dû à ce titre**, ce qui débloque LS-148.

## Le motif, et il est de coût et non de conformité

Le rapport entre le travail et l'utilité ne le justifie pas aujourd'hui :

**Ce que ça coûte.** Un conteneur de plus à exploiter, sauvegarder et mettre à
jour sur une machine **partagée avec un produit payant**, ADR-036. Une base
supplémentaire, ou une cohabitation dans celle d'un autre projet. Une entrée au
registre des traitements. Un poste de plus dans la surveillance du disque, que
LS-139 vient d'outiller précisément parce que la place n'est pas infinie.

**Ce que ça apporte à l'ouverture.** Une boutique de bijoux artisanaux dont le
catalogue n'existe pas encore, sans campagne d'acquisition, dont les ventes
passent aussi par les marchés et Vinted. Le chiffre qui compte au démarrage est
la **commande**, que la base porte déjà, et non la page vue.

**Arbitrage de Christophe du 10 septembre 2026** : « pas très utile et pas mal de
travail, si besoin je l'implémenterai plus tard ».

## L'analyse de conformité, faite et conservée

Elle est conservée **parce que la décision est réversible** : le jour où la
mesure devient utile, ce travail n'est pas à refaire.

### Ce que la CNIL exige pour l'exemption de consentement

✅ Source officielle, [CNIL, solutions pour les outils de mesure
d'audience](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience).

Toutes ces conditions doivent être réunies :

* finalité **strictement limitée** à la mesure d'audience, pour le seul compte
  de l'éditeur
* données produites **anonymes**
* **aucun recoupement** avec d'autres traitements
* **aucune transmission** de données non anonymisées à un tiers
* **aucun suivi de navigation** entre plusieurs sites par un identifiant unifié

Et, en recommandation : cookie de treize mois au plus sans renouvellement
automatique, conservation des données de vingt-cinq mois au plus, information du
visiteur dans la politique de confidentialité.

### Ce qu'Umami fait, mesuré et non supposé

Mesuré le 10 septembre 2026 sur l'instance d'Umami qui tourne déjà sur la
machine, celle de **SmartPlanning** :

```
GET https://analytics.smartplanning.fr/script.js
  200, 2 688 octets, aucun en-tête Set-Cookie

grep localStorage|sessionStorage|document.cookie
  1 occurrence, une seule clé : umami.disabled
```

**Le stockage local ne sert qu'à un opt-out volontaire**, jamais à identifier le
visiteur. C'était le point décisif, et il ne se lit pas dans une documentation.

✅ Sources officielles Umami, [définition des
métriques](https://docs.umami.is/docs/metric-definitions) et
[FAQ](https://docs.umami.is/docs/faq) :

* **aucun cookie** dans le code de suivi
* une **session** est un hash de l'identifiant de site, du nom d'hôte et de
  l'agent utilisateur, avec un **sel rotatif mensuel**
* une **visite** est un hash de la session avec un **sel rotatif horaire**
* l'**adresse IP** sert à la géolocalisation puis n'est **jamais stockée**

### Verdict de l'analyse

**Umami auto-hébergé serait exempté de consentement.** Le hash lié à
l'identifiant de site interdit le suivi inter-sites, rien ne quitte le VPS, et
l'absence de cookie rend sans objet la recommandation des treize mois.

Cette conclusion n'est pas la raison de la décision : le choix est de **ne pas
mesurer**, pas de mesurer autrement.

## Les options écartées

**Umami auto-hébergé, instance dédiée.** Conforme, et c'était la voie
recommandée si une mesure avait été retenue : elle garde les deux projets
étanches, principe déjà posé par ADR-036. Écartée pour son coût d'exploitation
face à une utilité faible avant l'ouverture.

**Umami partagé avec l'instance de SmartPlanning.** Écartée pour deux raisons.
Sa base vit dans `smartplanning-postgres` : les données d'audience de la boutique
atterriraient dans la base d'un autre produit, ce qui mélange deux
responsabilités et complique une séparation ultérieure. Et le recoupement entre
deux sites dans une même instance demanderait d'être vérifié au regard du critère
CNIL sur l'identifiant unifié.

**Un service tiers.** Jamais envisagé, la contrainte du projet l'écarte et Sentry
l'a déjà été pour le transfert de données.

## Conséquences

**LS-148 est débloquée**, et son issue attendue devient certaine : les quatre
cookies du site sont strictement nécessaires au service demandé, donc exemptés
par l'article 82 de la loi Informatique et Libertés. **Aucune bannière n'est
due**, ce qui reste à écrire et à publier par cette story.

**Le registre des traitements ne change pas**, aucun traitement n'étant ajouté.

**Aucun effet sur les Core Web Vitals**, ce qui était un argument de LS-141 :
sans script de suivi, rien ne s'ajoute au chargement. La mesure de LS-140 reste
valable telle quelle.

**Deux fichiers annonçaient Umami sans décision.** `README.md` le portait dans sa
table de stack, et l'agent `ls-conteneurisation` a été corrigé le 8 septembre
2026 pour dire l'inverse. Le README est corrigé par cet ADR.

**Le jour où la mesure devient utile** : rouvrir LS-141, relire cette analyse,
vérifier que la position de la CNIL et le fonctionnement d'Umami n'ont pas changé
depuis, et monter une instance dédiée.

## Traçabilité

LS-141 pour la décision, LS-148 qu'elle débloque. ADR-036 pour la machine
partagée et le principe d'étanchéité. ADR-007 pour le précédent du stockage local
plutôt que d'un service tiers. `REGISTRE-DES-TRAITEMENTS.md` et son avertissement
sur l'angle mort du contrôle, un cookie n'étant pas une table.
