# 10 septembre 2026, l : l'audit de véracité

Christophe voulait quitter la session en confiance. Les sept contrôles
mécaniques passaient. Quatorze affirmations fausses vivaient quand même dans la
documentation, et l'une d'elles aurait coûté cher.

## Le défaut qui compte, mesuré sur la machine

`EXPLOITATION.md` annonçait « dix-huit variables » en production et surtout que
les clés Stripe étaient **« le seul manque entre l'état actuel et une boutique
techniquement ouvrable »**.

```
sudo grep -cE '^[A-Z_]+=' /etc/lune-soleil/production.env   ->  19
sudo grep -c  '^SENDCLOUD_' /etc/lune-soleil/production.env ->   0
```

**Aucune clé Sendcloud en production.** Or LS-131 a livré `suivi-livraison`, qui
tourne toutes les heures et lève `ConfigurationSendcloudIncompleteError` sans
ces deux variables.

**Au prochain déploiement, la tâche échouerait chaque heure en silence.**
L'application démarre, `/api/sante` rend 200, et rien ne signale que `livreA`
n'est jamais renseigné : donc aucun délai de rétractation ne démarre, aucune
invitation à déposer un avis ne part. Le symptôme ne se lirait que dans
`docker logs`, à condition d'y regarder.

Le paragraphe fautif donnait pourtant la bonne parade, la commande de mesure,
et recopiait quand même un chiffre à côté. **Le compte n'y est plus inscrit** :
il s'était périmé deux fois en une journée.

## Le motif transversal, et il est instructif

Les quatre documents corrigés pendant LS-131, `README`, `REFERENCES`,
`legal.md` et `database.md`, ont tous adopté la même parade : ne pas inscrire le
compte, renvoyer au contrôle qui le mesure.

**Les quatorze défauts restants sont exactement dans les fichiers que cette
passe n'a pas ouverts.** Ce n'est pas un hasard : on corrige ce qu'on lit, et on
ne lit que ce qu'on modifie.

## La route des tâches portait trois comptes figés

`src/app/api/interne/taches/[nom]/route.ts` disait « les deux taches » ligne 10,
« LES QUATRE TACHES SONT DESORMAIS REMPLIES » ligne 18, et « LES QUATRE TACHES
PORTENT UN TRAVAIL » ligne 93. Il y en a **six**.

C'est le fichier qui aiguille toutes les tâches, `suivi-livraison` comprise.
Le crontab voisin avait su éviter le piège, en écrivant « le compte n'est pas
inscrit : il disait CINQ ».

## Les documents d'architecture n'avaient jamais été rejoués

`MODELE-CONCEPTUEL.md` et `PARCOURS.md` datent du 28 juillet 2026. Ils
annonçaient encore le suivi « Mondial Relay, offre Start, par API », alors
qu'ADR-035 a fait passer l'intégration par Sendcloud le 6 septembre.

Plus grave, ils écrivaient **« seul l'événement remis au destinataire renseigne
`livreA` »**, à quatre endroits. C'est la formulation exacte qu'ADR-042 identifie
comme laissant toute livraison à domicile sans date de réception : deux statuts
constatent la remise, pas un.

Les deux documents renvoyaient bien vers `legal.md` « qui fait autorité », mais
ils affirmaient avant de renvoyer, et c'est l'affirmation qu'un lecteur retient.

## ADR-025 est annoté, jamais réécrit

Sa section « Risques » disait « le compte Mondial Relay n'est pas ouvert, bloqué
par le compte bancaire professionnel ». Levé depuis le 6 septembre.

**Un ADR accepté ne se réécrit pas.** Une note datée du 10 septembre a été
ajoutée sous le risque, disant qu'il est levé, que le compte n'est pas un compte
Mondial Relay direct, et qu'ADR-042 corrige le singulier de sa section
« Décision ». La décision d'origine reste intacte.

## Le test qui prétendait observer le monde

`tests/e2e/tunnel-commande.spec.ts` affirmait que la panne du transporteur
« n'est pas une simulation artificielle » et « se trouve être **l'état réel du
système aujourd'hui** ».

Faux depuis quatre jours. La panne vient désormais de l'absence de
`SENDCLOUD_*` dans l'environnement de bout en bout, ce qui est une
**configuration délibérée**.

La nuance n'est pas rhétorique : un test qui prétend observer le monde alors
qu'il observe une variable absente ment sur ce qu'il prouve. Le commentaire dit
maintenant pourquoi ces clés ne doivent **pas** être posées en bout en bout :
le cas nominal appellerait le vrai transporteur à chaque exécution de la CI, et
le cas de panne, critère 6 de LS-115, cesserait d'être couvert.

## Ce qui a été relu et laissé intact

`README.md` s'est révélé exemplaire, y compris sur les comptes : il refuse
d'écrire le nombre de tâches et donne la commande. Sa table des index partiels
dit « huit » quand il y en a dix, mais elle est datée « constatée le 13 août
2026 » et présentée comme une mesure historique, ce qui la rend juste.

`REFERENCES.md`, `legal.md`, `database.md`, `payments.md`, les trois agents, le
skill `story`, `settings.json` et le crontab : aucun défaut.

## Vérifications

```
npm run type-check                 vert
npm run lint                       vert
npm run format:check               vert
npm run test                       88 fichiers, 1378 tests, tous verts
verifier-config-claude.sh --strict configuration cohérente
verifier-regles.sh                 règles conformes au schéma
CLAUDE.md                          200 lignes, le seuil exact tenu
production                         200 sur l'accueil et le catalogue
```

## Ce que la production ne porte pas encore

**Le travail du jour n'est pas déployé.** Le dernier déploiement date de 12h57
UTC, LS-200 a été fusionnée à 17h et LS-131 à 18h30.

Le prochain déploiement portera **une migration**, l'index
`alerte_ouverte_unique`, donc il passe par `./scripts/migrate-production.sh`.

**Poser les clés Sendcloud de production AVANT ce déploiement**, sans quoi la
tâche horaire échouera dès sa première exécution.

## État des tickets

Aucun ticket ouvert pour cet audit, même arbitrage que celui du 10 septembre au
matin : correction directe.

## Prochaine étape

**LS-216**, le suivi côté administration, ou **LS-61**, les avis vérifiés. Les
deux ne dépendent que du code.
