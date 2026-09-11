# ADR-044 : aucun assistant IA en V1, et le sujet se ferme

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 11 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-149 |

## Ce que cet ADR tranche

**L'assistant IA sort du périmètre.** Aucun modèle de langage n'entre dans ce
projet, ni chez un fournisseur externe, ni auto-hébergé sur le VPS.

Il ne reporte pas la décision à plus tard : il la prend, avec ses raisons, pour
qu'elle ne se rejoue pas à chaque session qui relit `CLAUDE.md`.

## Ce qu'il remplace

`CLAUDE.md`, section « Priorisation », plaçait l'assistant IA en **V1 cible**
depuis le cadrage. `src/integrations/README.md` lui réservait une place :
« `integrations/` isole Stripe, email, médias **et IA** ».

Les deux mentions sont corrigées par cet ADR. Elles annonçaient une fonction que
rien ne définissait, ne construisait ni ne chiffrait.

## Contexte

### Le constat qui a ouvert LS-149

Vérification de couverture du backlog, 27 août 2026 : un pan entier du périmètre
sans aucun porteur. `src/integrations/` contenait `email`, `medias`,
`mondial-relay` et `stripe`, et **aucune IA**. Aucun ticket ne portait le sujet.

**Le mot « assistant » ne dit rien**, et c'est le cœur du problème. LS-149
énumérait trois produits que ce seul mot recouvre :

| Produit | Où | Risque principal |
|---|---|---|
| aide à la rédaction de fiche produit | administration | allégation inventée sur une matière ou une origine |
| réponse aux questions fréquentes | public | réponse fausse sur un délai légal ou un tarif |
| aide à la recherche de bijou | public | apport faible, le catalogue se parcourt à l'œil |

Trois produits, trois surfaces d'attaque, trois budgets. Aucun n'était décidé.

### Ce que le cahier des charges dit, et ne dit pas

Le cahier des charges V1.0 vit **hors dépôt**, données personnelles. Il place
l'assistant en V1 cible sans en définir l'objet : le périmètre l'annonce,
l'architecture lui réserve une place, rien ne le spécifie.

**Arbitrer sur cette base aurait été inventer une fonction**, ce que l'interdit
« modifier le périmètre du cahier des charges » écarte. La question a donc été
posée à Christophe, critère 4 de LS-149, et sa réponse est cet ADR.

## Décision 1 : aucun modèle de langage, quelle que soit sa place

**Ni fournisseur externe, ni modèle auto-hébergé.** Les deux voies ont été
examinées et écartées pour des raisons différentes.

### Le fournisseur externe bute sur la contrainte du projet

**La fiche « pas de service tiers » écarte Sentry depuis le 10 août 2026, et sa
raison n'est pas le coût.** Sentry a une offre gratuite : ce qui l'écarte est
qu'une trace d'exception porte des adresses de livraison et des emails, dont
l'envoi à un sous-traitant demanderait un ADR et une inscription au registre des
traitements.

**Un modèle de langage est un service tiers par nature**, et son appétit en
données dépasse celui d'un collecteur d'exceptions : une aide à la rédaction
reçoit le texte que l'exploitante écrit, une réponse aux questions fréquentes
reçoit la question du visiteur, qui peut contenir n'importe quoi, y compris un
numéro de commande ou une adresse.

**Borner ce qui sort est possible et ne suffit pas.** Il faudrait le porter au
registre, nommer le sous-traitant, déclarer les transferts hors Union
européenne, et relire cette liste à chaque évolution du produit. C'est une
charge permanente pour une fonction dont l'apport n'est pas établi.

### Le modèle auto-hébergé bute sur la machine

Le VPS sert déjà la boutique, PostgreSQL, Nginx et les tâches planifiées. Un
modèle local y prendrait de la mémoire et du processeur **au détriment du
tunnel de commande**, c'est-à-dire de la seule chose qui fait entrer de l'argent.

La qualité d'un petit modèle local est par ailleurs nettement inférieure, ce qui
ramène au problème de la décision 2 : une réponse approximative sur un délai
légal coûte plus cher que l'absence de réponse.

## Décision 2 : ce que l'absence d'assistant fait perdre, et ce qu'elle évite

**Écrire ce que la décision coûte est ce qui la rend relisible.** Un ADR qui
n'énonce que les raisons du refus se relit comme une justification.

| Ce qui est perdu | Ce qui l'évite |
|---|---|
| une aide à la rédaction des fiches produit | LS-24 les fait rédiger par l'exploitante, qui seule connaît ses matières |
| une réponse immédiate aux questions fréquentes | `/aide#faq` porte la même information, LS-26, sans risque de réponse inventée |
| une recherche en langage naturel | de 10 à 40 références se parcourent à l'œil, `frontend-design.md` écarte déjà le moteur de recherche externe pour la même raison |

**Le risque évité est la réponse fausse sur un fait opposable.** Le projet porte
des délais légaux, un droit de rétractation de quatorze jours, des tarifs
affichés qui engagent : une réponse approximative sur l'un d'eux est une
information précontractuelle fausse, et l'article L221-20 porte le délai de
rétractation à douze mois quand l'information est incorrecte.

**Une allégation inventée sur une matière est pire encore.** LS-44 le rappelle :
l'exploitante est la personne qui met le produit fini sur le marché français,
et une allégation d'origine ou de composition fausse relève de la pratique
commerciale trompeuse, articles L121-2 et suivants.

## Décision 3 : les garde-fous restent écrits, même sans assistant

Ils sont les règles du projet et ne dépendent pas de cet ADR. Les rappeler ici a
un objet précis : **le jour où ce sujet se rouvre**, ils sont le point de départ
et non une découverte.

| Invariant | Ce qu'il interdit |
|---|---|
| **Invariant 2** | un identifiant venant d'un modèle de langage n'autorise **jamais** l'accès. Le texte le nomme explicitement |
| **Invariant 1** | aucun montant ne vient d'un modèle : un prix se calcule côté serveur, en centimes entiers |
| **Invariant 9** | aucune donnée personnelle ni secret ne part chez un fournisseur sans que le registre des traitements le porte |
| **Invariant 7** | toute entrée non fiable est validée côté serveur avec Zod, et une sortie de modèle est une entrée non fiable |

**Aucun contenu engendré n'est publié tel quel.** Une description de produit
relève de la responsabilité de l'exploitante, et ce point ne se délègue pas.

## Conséquences

| Élément | Ce qui change |
|---|---|
| `CLAUDE.md` | l'assistant IA quitte la liste des fonctions de V1 cible |
| `src/integrations/README.md` | la mention « et IA » est retirée de la règle de garde |
| `docs/REFERENCES.md` | cet ADR entre dans la table d'aiguillage |
| LS-149 | se clôt sur cet ADR, aucune story d'implémentation n'en découle |
| `src/integrations/` | **rien à faire** : aucun dossier IA n'existe, et il n'en sera pas créé |

**Aucune ligne de code ne change.** C'est la propriété d'une décision prise avant
l'implémentation plutôt qu'après.

## Ce qui ferait revenir sur cet ADR

Trois événements, et aucun n'est une évolution technique :

1. **Un besoin mesuré et exprimé par l'exploitante**, sur un usage précis, après
   plusieurs mois d'exploitation réelle. Un besoin observé vaut mieux qu'un
   besoin anticipé, et le catalogue aura alors sa taille réelle.
2. **Un catalogue qui dépasse largement les quarante références**, seuil au-delà
   duquel la recherche cesse d'être un confort. `frontend-design.md` porte déjà
   une recherche interne simple en **Could, jalon V1.x**, et elle serait le
   premier recours, sans modèle.
3. **Un modèle exécutable localement sans coût significatif**, qui lèverait à la
   fois la contrainte de confidentialité et celle de la machine. Cette voie est
   la seule qui ne rouvre pas la question du sous-traitant.

**Rouvrir le sujet demande un ADR qui remplace celui-ci**, jamais une story qui
l'ignore. C'est ce que la hiérarchie des sources impose, et c'est ce qui évite
que la décision se perde.

## Alternatives écartées

**Reporter la décision à la V1.x.** C'est ce que faisait l'état précédent : une
mention en V1 cible sans définition, qui obligeait chaque session à se demander
si le sujet la concerne. Un report est une décision non prise, et il coûte à
chaque relecture.

**Livrer la plus petite version, la réponse aux questions fréquentes.** Elle
paraît la moins risquée et elle est la plus exposée : publique, donc atteignable
par n'importe qui, et portant sur les délais légaux et les tarifs, c'est-à-dire
exactement les faits qu'une réponse fausse rend opposables.

**Garder la mention en périmètre en la marquant « non tranchée ».** Le dépôt a
déjà payé ce motif : un état écrit au présent dans un fichier que rien n'oblige à
relire se périme sans bruit. Une mention sans décision est une dette qui ne porte
pas son nom.
