# 10 août 2026, LS-73, la journalisation et le contrôle de santé

Story 9 sur 11 de la phase 1. Premier code applicatif depuis LS-71.

## Ce qui est fait

**LS-73 est terminée.** Trois modules neufs, `src/lib/journal.ts`,
`src/services/sante.ts` et `src/app/api/sante/route.ts`. La convention vit dans
**`docs/architecture/JOURNALISATION.md`**, à lire avant d'ajouter une ligne de
journal.

Les cinq critères sont remplis et prouvés :

| Critère | Preuve |
|---|---|
| journaux structurés, corrélation par requête | JSON une ligne, `correlationId`, mesuré sur serveur réel |
| santé distinguant démarrée de base injoignable | base arrêtée : HTTP 503, corps explicite |
| aucun secret ni donnée personnelle, chemin d'erreur compris | 39 tests, 4 mutations |
| niveau réglable sans modification de code | `LOG_LEVEL`, relu à chaque appel |
| santé utilisable par Docker et par un script de fumée | `scripts/controle-fumee.sh` |

La suite passe de **120 à 159 tests**, et `verifier-tests-mutation.sh` de **15 à
19 cas**, tous détectés.

## Trois décisions prises dans la session

**Aucun service de supervision tiers**, arbitrage de Christophe. `README.md`
annonçait Sentry et `.env.example` portait `SENTRY_DSN` : rien ne les lisait,
aucun ADR ne les décidait. Une trace d'exception partant chez un sous-traitant
hors UE ferait sortir des données personnelles du périmètre. Les deux variables
sont retirées, `LOG_LEVEL` les remplace.

La question se rouvrira en phase 6 si le besoin apparaît. Elle ne tient **pas au
coût** : Sentry a une offre gratuite, c'est le transfert de données qui l'écarte.
Ne pas retenir « on ne prend pas Sentry parce que c'est payant », ce serait faux
et la décision se rejouerait mal.

**Aucune dépendance externe pour le journal.** Pino ferait le travail, le besoin
tient dans un formateur JSON. Sept overrides sont déjà en place, dont deux posés
dans les trois jours précédents : chaque bibliothèque ajoutée est une surface
d'avis de sécurité de plus.

**Le VPS n'est pas nécessaire maintenant**, question de Christophe en début de
session. LS-73 et LS-74 le disent elles-mêmes, l'hébergement appartient à la
phase 6. Rien en phase 1 n'a besoin d'une machine distante : la CI fournit déjà
l'exécution distante, et LS-74 publie sur GHCR. Acheter tôt paierait des mois
inutilisés. La dépendance réellement bloquante reste le compte bancaire
professionnel, qui tient Stripe et Mondial Relay.

## Une fuite existante fermée au passage

`integrations/email/index.ts` écrivait l'adresse du destinataire **en clair** par
`console.info`, avec un commentaire assumant le choix : « la règle interdit les
SECRETS, pas les adresses », et « en production, ce journal ne doit pas
subsister ».

LS-73 tranche l'inverse : une adresse email est une donnée personnelle, le
critère 3 l'exclut au même titre qu'un secret. L'envoi passe par le journal, qui
la masque. Le commentaire disait déjà que ça ne devait pas survivre en
production, personne n'avait daté ce moment.

## Ce qui a dérapé, et ce que ça apprend

**Le premier test d'intégration passait pour la mauvaise raison.** Avec une URL
pointant sur un port fermé, la santé répondait `disponible`. Cause :
`lib/prisma.ts` met son client en cache sur `globalThis` hors production, et
`vi.resetModules()` vide le registre des modules **sans toucher `globalThis`**.
Le module réimporté retrouvait le client connecté à la base saine.

Un test qui échoue franchement est un cadeau. Celui-là aurait pu passer au vert
en validant un contrôle de santé incapable de voir une base morte.

**Le cas de mutation 18 a échoué pour une raison étrangère au code.** La
substitution Perl employait `${erreur.name}` dans sa chaîne de remplacement : Perl
y voit **ses propres variables**, vides ici, et le code muté devenait
`return ": ";`. La mutation vidait le nom au lieu d'ajouter le message, donc
testait autre chose que ce qu'elle annonçait, et le test attendu restait vert à
juste titre.

C'est une sixième cause à ajouter à l'aiguillage de
[[lune-soleil-mutation-verte-par-ou-commencer]] : **la substitution elle-même
peut être mal formée sans que rien ne le signale**. Le garde-fou existant vérifie
qu'un fichier a changé, pas que le changement est celui qu'on croit.

**Le contrôle de secrets a bloqué deux commits**, sur des valeurs fictives de
test ayant la forme d'une chaîne de connexion et d'une clé Stripe. Il a raison :
sur un dépôt public il ne peut pas distinguer un jeu de test d'une vraie clé. Les
valeurs sont composées morceau par morceau, ce que le code testé ne voit pas.
Troisième occurrence du motif « le garde-fou bloque ce qui l'explique ».

**Un compte faux dans `README.md` a été trouvé**, sans rapport avec la story :
« sept mutations » y était écrit alors que le script en portait quinze avant même
LS-73. Corrigé à 19, avec la commande qui le mesure plutôt qu'un nombre à
recopier.

## Traçabilité

**PR #75**, deux commits :

| SHA | Objet |
|---|---|
| `71db314` | les trois modules, les tests, la fuite d'email fermée |
| `e0089b6` | la convention, le contrôle de fumée, les quatre mutations, Sentry retiré |

## Prochaine étape

**LS-74**, image Docker multi-étapes. Elle était bloquée par LS-73, qui lui
fournit le contrôle de santé, et c'est la dernière brique de la porte de sortie
de la phase 1 avec LS-75.

Deux points à connaître avant de l'attaquer, écrits dans sa description :
l'agent global `docker-devops` ne doit pas être invoqué, il traite Redis comme
requis quand le projet l'écarte ; et **LS-31** crée l'agent projet calibré sur la
topologie réelle, à traiter avant ou avec elle.

Restent ensuite LS-75, puis LS-79 à LS-81 hors chaîne.
