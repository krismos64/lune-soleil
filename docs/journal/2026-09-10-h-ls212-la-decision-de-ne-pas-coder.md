# 10 septembre 2026, h : LS-212, la décision de ne pas coder

Le ticket demandait un ADR avant tout code. L'ADR a été écrit, et il tranche
contre l'implémentation.

## Ce qui était prévu

ADR-021 exigeait des codes de récupération, « seul recours » quand l'email est
inaccessible et les appareils perdus, avec cette phrase forte : « leur existence
doit être vérifiée avant l'ouverture, pas supposée ».

Le premier critère de LS-212 demandait donc un ADR pour trancher entre le plugin
`twoFactor` de Better Auth et une table dédiée.

## L'analyse, faite avant l'arbitrage

**Le plugin `twoFactor` était à écarter**, vérifié via Context7 : sa table impose
un champ `secret` en `required: true`, un secret TOTP, alors qu'ADR-021 écarte
explicitement le TOTP « sur refus de l'exploitante ». L'adopter aurait installé
une mécanique de double facteur jamais décidée plus un secret inutilisé mais bien
réel à protéger.

**`JetonAcces` n'était pas réutilisable** : il porte pourtant le bon motif,
empreinte jamais en clair et consommation distincte de la révocation, mais il est
ancré sur une commande par une clé étrangère en `Restrict`. La rendre nullable
aurait affaibli une contrainte qui protège les jetons de facture et d'avis.

**Une table dédiée était donc la voie**, avec `scrypt` natif à Node, mesuré à
19 ms, et une consommation en un `UPDATE` conditionnel unique, même motif que la
réservation de stock.

Un premier ADR a été écrit dans ce sens, avec les quinze questions de zone
critique répondues.

## La question de Christophe a changé la décision

Il a demandé un résumé en mots simples, puis : « si elle est sur un autre poste
sans se souvenir de son mot de passe, comment fera-t-elle ? »

Cette question a fait apparaître un trou dans ma propre conception. J'avais écrit
qu'un code **ouvre une session** sans changer le mot de passe. Sur un poste
emprunté, cela ne suffit pas : elle entre, mais repart sans accès durable, une
passkey enregistrée là étant liée à une machine qu'elle va quitter.

Trois options lui ont été soumises. **Sa réponse a été d'abandonner** : « si elle
est sur un autre poste elle fera mot de passe oublié, et si elle n'a pas accès à
sa boîte mail elle me fera appel et je ferai le nécessaire depuis ma machine ».

## Pourquoi cet arbitrage tient

Le cas résiduel exige de perdre ses **deux** appareils **et** l'accès à sa boîte
email en même temps. Chacun est déjà rare, leur conjonction davantage.

Le recours existe et fonctionne : `amorcer-compte-administration.sh` est livré et
éprouvé sur la production réelle par LS-175, le jour même.

Ce que les codes auraient coûté, pour ce seul cas : une table, une migration, un
écran d'engendrement et d'impression, un test de concurrence, une entrée au
registre des traitements, et **une feuille papier dont la perte ou le vol devient
un nouveau risque à porter**.

## Ce qui a été fait plutôt que du code

**ADR-041 acte la décision et AMENDE ADR-021.** C'est le point qui comptait : un
arbitrage qui contredit un ADR accepté doit se tracer, sans quoi quelqu'un
rouvrira le sujet dans trois mois en lisant l'ancien.

Quatre renvois vers ADR-041 sont posés dans ADR-021 : sa table de recours, sa
section sur les mesures compensatoires, et deux risques dont la formulation était
devenue fausse.

**La procédure d'amorçage perd son étape 5** et la condition d'entrée fautive de
son dernier ressort, qui disait « après perte de tous les appareils **et des
codes de récupération** ». Cette condition n'avait plus de sens : ce chemin EST
le recours, pas le dernier après un autre.

**Le conducteur de séance porte une table des recours**, de la passkey à l'appel
au développeur, pour que ce qui doit être dit à l'exploitante soit écrit.

**`REFERENCES.md`** porte l'ADR-041 dans sa table d'aiguillage, et la description
de la procédure ne cite plus les codes.

## Le risque, nommé et accepté

Si le développeur devenait durablement injoignable au moment précis où
l'exploitante perd tout, l'accès serait bloqué le temps de le retrouver.

**L'ADR le nomme** plutôt que de le passer sous silence, et la décision est
réversible : l'analyse technique de la voie écartée est conservée dans l'ADR, y
compris le choix de `scrypt` et la forme de la consommation atomique. Le jour où
ce risque devient inacceptable, la conception est déjà faite.

## Vérifications

```
50 controles                        0 en echec
verifier-config-claude.sh --strict  configuration coherente
npm run format:check                vert
```

Le contrôle de configuration vérifie qu'un ADR neuf figure dans la table
d'aiguillage : il aurait rougi si `REFERENCES.md` avait été oublié.

## État des tickets

**LS-212 se ferme sur sa décision**, et non sur une implémentation. Son premier
critère exigeait un ADR accepté avant tout code : il l'est, et il dit de ne pas
coder. Les sept autres critères tombent avec lui.

## Prochaine étape

**LS-23, les photographies**, reste le goulot du périmètre d'ouverture. Elle
appartient à l'exploitante, qui dispose désormais de son accès à
l'administration : côté développement, seules LS-20 et LS-170 sont jouables.
