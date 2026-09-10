# ADR-041 : aucun code de récupération, le dernier recours passe par le développeur

| Champ | Valeur |
|---|---|
| Statut | Accepté |
| Date | 10 septembre 2026 |
| Décideur | Christophe Mostefaoui |
| Ticket | LS-212 |

## Décision

**Aucun code de récupération n'est mis en place**, ni par le plugin `twoFactor`
de Better Auth, ni par une table dédiée.

**Cet ADR amende ADR-021**, qui les exigeait et demandait que « leur existence
soit vérifiée avant l'ouverture, pas supposée ». Cette exigence est **levée**.

Le recours ultime reste la **procédure de dernier ressort**, déjà écrite dans
`docs/PROCEDURE-AMORCAGE-ADMINISTRATION.md` et réservée au développeur.

## Ce que couvrent les chemins existants

| Situation de l'exploitante | Comment elle se connecte |
|---|---|
| Cas normal, son iPhone ou son Mac | passkey, Touch ID ou Face ID |
| Un appareil en panne | passkey synchronisée sur l'autre, trousseau Apple |
| Poste emprunté, iPhone en main | QR code affiché à la connexion |
| Poste emprunté, sans son iPhone | email et mot de passe |
| Mot de passe oublié | « mot de passe oublié », lien envoyé sur sa boîte |
| **Boîte email inaccessible en plus** | **elle appelle le développeur** |

La dernière ligne est le seul cas que les codes auraient couvert autrement.

## Le motif, et il est de proportion

**Le cas résiduel est étroit** : il faut perdre ses deux appareils **et** l'accès
à sa boîte email en même temps. Chacun des deux est déjà rare, leur conjonction
davantage.

**Le recours existe déjà et fonctionne.** La procédure de dernier ressort tient en
trois gestes : l'exploitante s'inscrit ou réutilise son compte, le développeur
rejoue `amorcer-compte-administration.sh`, elle enregistre une passkey neuve. Le
script est livré, éprouvé sur la production réelle par LS-175.

**Ce que les codes auraient ajouté** : l'autonomie de l'exploitante dans ce seul
cas, sans dépendre de la disponibilité du développeur.

**Ce qu'ils auraient coûté** : une table de plus, une migration, un écran
d'engendrement et d'impression, un test de concurrence sur la consommation
atomique, une entrée au registre des traitements, et une feuille papier dont la
perte ou le vol devient un nouveau risque à porter.

**Arbitrage de Christophe du 10 septembre 2026** : sur une boutique à un seul
compte administrateur, dont le développeur est joignable et connaît la machine, la
disponibilité humaine est un recours suffisant. Écrire du code pour un scénario
que trois gestes couvrent déjà revient à porter une mécanique de plus sans
réduire le risque réel.

## Ce que cette décision ne prétend pas

**Elle ne dit pas que le risque est nul.** Si le développeur devenait durablement
injoignable au moment précis où l'exploitante perd tout, l'accès serait bloqué le
temps de le retrouver. C'est un risque **accepté**, pas un risque ignoré.

**Elle est réversible.** L'analyse technique de la voie écartée reste valable et
figure ci-dessous : le jour où ce risque devient inacceptable, la conception est
déjà faite.

## La voie écartée, conservée pour le jour où elle servira

Deux options avaient été étudiées.

**Le plugin `twoFactor` de Better Auth** fournit des codes de récupération, mais
**uniquement** dans un ensemble à double facteur. Vérifié via Context7 le
10 septembre 2026 : sa table impose un champ `secret` en `required: true`, qui est
un secret TOTP, et ajoute `twoFactorEnabled` sur `utilisateur`.

Or ADR-021 écarte explicitement le TOTP, « sur refus de l'exploitante ». Adopter
le plugin ferait entrer une mécanique jamais décidée plus un secret inutilisé mais
bien réel à protéger.

**Une table dédiée `code_recuperation`** aurait porté dix codes hachés par
`scrypt`, consommables une fois, sans expiration, révoqués en bloc par un nouveau
jeu. La consommation aurait tenu en un `UPDATE` conditionnel unique, même motif
que la réservation de stock d'ADR-006, le verrou de ligne implicite garantissant
qu'un usage simultané n'en valide qu'un.

**`JetonAcces` n'était pas réutilisable** : il porte le bon motif, empreinte jamais
en clair et consommation distincte de la révocation, mais il est ancré sur une
commande par une clé étrangère en `Restrict`. La rendre nullable aurait affaibli
une contrainte qui protège aujourd'hui les jetons de facture et d'avis.

## Conséquences

**ADR-021 est amendé.** Son tableau de recours voit sa dernière ligne changer :
« codes de récupération imprimés » devient « intervention du développeur ». Ses
trois mentions des codes portent un renvoi vers le présent ADR.

**La procédure de dernier ressort perd sa condition d'entrée fautive.** Elle
disait « après perte de tous les appareils **et des codes de récupération** », ce
qui n'a plus de sens : elle s'applique après perte des appareils et de l'accès à
la boîte email.

**Rien n'est à vérifier avant l'ouverture** à ce titre, l'exigence d'ADR-021
tombant avec la décision.

**L'exploitante doit savoir qu'elle n'a pas de codes**, et à qui s'adresser. Le
conducteur de séance le dit déjà, et le disait pendant la séance du 10 septembre
2026 : ADR-021 demandait que l'existence des codes soit vérifiée et non supposée,
ce qui vaut aussi pour leur absence.
