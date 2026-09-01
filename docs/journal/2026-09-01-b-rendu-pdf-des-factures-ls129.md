# 1er septembre 2026, session B : le rendu PDF des factures, LS-129

Le dernier maillon entre l'encaissement et la remise du document. La facture
`F-2026-0001`, émise le 31 août, portait un instantané légal exact et **aucun
fichier** : le client n'avait rien à télécharger ni à recevoir.

## ADR-034, tranché sur des mesures et non sur des estimations

Le ticket exigeait un ADR avant la première ligne de code, arbitrage du 27 août.

| | Chromium | `@react-pdf/renderer` | `pdf-lib` |
| --- | --- | --- | --- |
| Poids ajouté | ~300 Mo plus les libs système | **65 Mo** | 29 Mo |
| Navigateur dans l'image | oui | non | non |
| Mise en page | HTML et CSS | flexbox | coordonnées absolues |

Le rendu HTML est écarté par le poids, l'image partant de `node:slim` qui n'a
même pas `curl`. `pdf-lib` est écarté par le coût du gabarit, où chaque
alignement de total et chaque saut de page se calcule à la main.

Vérifié en conditions réelles sur React 19.2.4 : rendu en 36 ms, en-tête
`%PDF-1.3`. ✅ Via Context7 pour les deux bibliothèques et pour
`toMatchAriaSnapshot`.

## Les deux bibliothèques échouent sur l'Unicode, de manière opposée

Le point qui a le plus changé la conception, mesuré sur `Straẞe Łódź Tōkyō` :

```
pdf-lib, police standard        : REFUSE -> WinAnsi cannot encode "ẞ"
@react-pdf/renderer, par défaut : Straže Aódz TMkyM     <- substitué en silence
@react-pdf/renderer, DejaVu     : Straẞe Łódź Tōkyō     <- fidèle
```

Le comportement de la bibliothèque retenue est **le plus dangereux des deux**.
`pdf-lib` échoue bruyamment, ce qui déclenche l'alerte prévue ; celle-ci produit
un document d'apparence correcte portant un nom de client déformé, que rien ne
signale.

Le français courant passe partout, accents, œ lié et signe euro compris. Le
risque vient du **nom et de l'adresse**, saisies libres où un nom polonais ou
allemand est plausible.

DejaVu Sans, sous-ensemble `latin`, couvre le latin étendu, `ẞ` compris là où
Arial échouait. Le nom du sous-ensemble ne dit rien de sa couverture réelle : il
fallait mesurer.

## Trois défauts trouvés par la mesure

**La garde de traversée de répertoire ne gardait rien.** Elle comparait
`path.resolve` à `path.join`, or les deux normalisent le `..` de la même façon :
tous deux rendent `/…/secrets.pdf` pour `../secrets.pdf`. La garde était donc
satisfaite par l'évasion qu'elle prétendait refuser. C'est le test qui l'a
attrapée.

**`next build` traçait tout le projet.** Ne sachant pas résoudre une racine
venant d'une variable d'environnement, il abandonnait : « Encountered unexpected
file in NFT list », et la sortie standalone passait de 44 à 67 Mo. Zéro
avertissement sur `main`, un avec ce travail. Corrigé par `turbopackIgnore`,
légitime ici puisque ce volume ne doit jamais entrer dans l'image.

**Quatre tests de webhook comptaient toutes les alertes sans filtrer par type.**
Mon `PDF_FACTURE_EN_ECHEC` s'y ajoutait. Le fichier avait déjà rencontré ce piège
avec LS-126, et son commentaire l'explique.

## Trois défauts trouvés par `ls-critical-reviewer`

Le plus grave d'abord, et il ne se serait vu qu'en production.

**Une erreur avant le `try` faisait échouer le webhook sans lever d'alerte.**
Trois appels précédaient la protection, dont `schemaInstantaneLegal.parse`. Un
instantané d'une version plus ancienne, ou une base injoignable, faisait remonter
l'exception : la route rendait **500**, le prestataire rejouait, l'unicité
d'événement sortait en `DEJA_TRAITE`, la garde `TRAITE` devenait fausse et **le
rendu n'était jamais retenté**. La facture restait sans document **et sans
alerte**, le mécanisme de détection de LS-49 court-circuité.

La lecture entre désormais dans le `try`, et le webhook porte son propre filet :
la garantie devient structurelle plutôt que documentaire.

**Le fichier temporaire était nommé par une empreinte du numéro**, donc partagé
entre deux rendus du même document. Le premier à finir le renommait, le second
recevait `ENOENT`, reproduit six fois sur six. La conséquence n'était pas un
rendu perdu : c'était une **seconde `AlerteCritique` levée sur un document
pourtant écrit correctement**, appelant l'exploitante sur un non-problème.
Rendu unique par tentative.

**L'alerte elle-même pouvait échouer** sur base injoignable, ce qui rouvrait le
premier trou. Elle est maintenant protégée, avec repli sur le journal technique.

Le commentaire affirmant que deux rendus produisent « le même contenu » était
faux : `/CreationDate` et `/ID` sont réengendrés à chaque rendu, 63 octets qui
diffèrent. Le test compare désormais le **texte** et non les octets, une
comparaison de tailles restant verte sur deux documents différents.

## Le test qui manquait

Le test « deux rendus du même document » était **séquentiel** : il attendait le
premier avant de lancer le second, donc ne croisait jamais rien et restait vert
sur le défaut. Un `Promise.all` le remplace, et la mutation qui rétablit le
temporaire partagé le fait rougir seul.

## Preuves par mutation, toutes ciblées

| Mutation | Effet |
| --- | --- |
| `Font.register` retiré du gabarit | 1 échec sur 12 |
| Rendu déplacé **dans** la transaction | 3 échecs sur 6 |
| Repository lisant le catalogue | 1 échec sur 6 |
| Temporaire redevenu partagé | 1 échec sur 12 |

## Vérifications

```
type-check, lint, format:check         OK
npm run test                           809 tests, 52 fichiers
playwright administration              90 tests, trois largeurs
./scripts/verifier-regles.sh           41 dossiers couverts
npm audit                              0 vulnerabilite
npm run build                          aucun avertissement, polices copiées
```

## Ce qui reste

`payments.md` porte désormais une section sur le rendu, et son `paths` couvre
`src/integrations/pdf/**` : le contrôle de couverture avait raison de refuser un
dossier orphelin.

**Le téléchargement du document n'existe pas encore.** LS-131 porte le contrôle
de propriété pour un client connecté, LS-132 le lien signé expirant pour un
achat sans compte. L'administration affiche l'état du document et permet de
relancer sa génération, ce que le critère 4 demandait, mais personne ne peut
encore le lire.

L'avoir, LS-128, réutilisera le même gabarit : `EnTeteDocument.intitule` existe
pour cela.

## Prochaine étape

**LS-131**, l'accès aux factures depuis l'espace client, qui rend enfin le
document atteignable. **LS-128** ensuite pour l'avoir.

Restent ouverts hors code, inchangés depuis ce matin : **LS-34**, la plateforme
de facturation électronique, dont l'échéance de réception tombait **aujourd'hui**
sans que la démarche soit faite ; **LS-19**, la médiation de la consommation,
sans aucun commentaire depuis le 27 juillet ; **LS-27**, le compte Mondial Relay.

**LS-85** reste ouverte sur son seul critère 5, l'écoute humaine au lecteur
d'écran, traitée en session A.

## Audit de fin de session

Passe de vérification demandée avant de quitter la session, sur Jira, `CLAUDE.md`,
le `README.md`, les agents, skills et hooks, `docs/`, le journal et la mémoire.

**Quatre affirmations périmées corrigées**, toutes des comptes ou des états que
seul un relevé dans Jira pouvait démentir.

Le tableau des phases du `README.md` annonçait l'état du 27 août : la phase 4
passe de treize à **douze** stories ouvertes, LS-129 étant close, et la phase 6
de onze à **douze**, LS-156 ayant été créée le 31 août. Les deux écarts ont été
mesurés par requête, jamais recomptés de mémoire.

La fiche mémoire d'entrée annonçait « 73 terminés sur 155 », relevé le 31 août.
Le compte réel est **75 sur 156, soit 48 %**. Elle présentait aussi Stripe comme
« à souscrire » alors que le compte encaisse depuis le 31 août, et LS-18 comme
ouverte alors qu'elle est close.

Deux fiches portaient un **état transitoire** plutôt qu'une règle, motif déjà
consigné : « tant que LS-18 attend » est devenu faux sans que la règle qu'elles
énoncent le devienne. Reformulées au présent intemporel.

**Trois ajouts de propagation.** La table d'aiguillage de `docs/REFERENCES.md` ne
citait aucun des trois modules de LS-129 : elle recense les fichiers dont le
comportement porte un piège non évident, et ces trois-là en portent un chacun.
Le `README.md` ne mentionnait pas le rendu PDF dans sa table de stack, et
affirmait encore « le rendu PDF manque encore, LS-129 ».

**Ce qui était déjà juste**, vérifié et non supposé : `CLAUDE.md` tient à
200 lignes, exactement au seuil, et ses deux affirmations datées restent vraies.
Les trois agents et les deux skills ne citent aucun chemin mort. Les huit hooks
déclarés existent tous et sont exécutables, aucun script n'est orphelin. Les
17 ADR du disque sont les 17 de la table. L'index mémoire compte 215 lignes pour
215 fiches, sans un seul lien mort.

**Un manque écarté après vérification** : `DOCUMENTS_RACINE` est absente de
`docker-compose.yml`, comme `MEDIA_RACINE`. Ce fichier ne déclare que la base et
porte l'avertissement « ne rien ajouter ici en pensant à la production » : la
variable entrera avec la composition de production, LS-152.
