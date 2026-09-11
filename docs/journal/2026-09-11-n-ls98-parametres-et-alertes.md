# 11 septembre 2026, LS-98 : les paramètres en base, et deux écrans qui manquaient

Session longue, quatre stories touchées. Zone critique : migration de schéma,
chemin du paiement, autorisation.

## Ce qui est livré

| Story | État |
|---|---|
| LS-140, couverture du parcours 7 | **fusionnée**, PR #400 |
| LS-123, section accessibilité | **fusionnée**, PR #400 |
| LS-98, paramètres commerciaux | PR #401, neuf commits |
| LS-149, cadrage de l'assistant IA | ADR-044, dans la même PR |

## Le travail qui n'était pas prévu

Trois chantiers sont nés de ce que la session a trouvé, pas de ce qu'elle avait
planifié. C'est la part la plus utile.

**Le parcours 7 n'avait aucune mesure de bout en bout.** Le commentaire de
LS-140 du 10 septembre l'expliquait : « les avis ne sont pas implémentés, LS-61
étant ouverte ». LS-61 et LS-77 ont livré depuis, et la raison de l'absence
était tombée sans que personne ne le voie. C'était le seul des dix parcours sans
aucune spec.

**Sept services levaient des alertes qu'aucun code ne lisait.**
`DOUBLE_ENCAISSEMENT`, `MONTANT_DIVERGENT`, `FACTURE_NON_EMISE`. Tout le
mécanisme existait, gravité, index d'unicité, colonnes d'acquittement : il
manquait l'écran, ce qui rendait le reste inerte. Un incident financier se
signalait dans une table que personne ne consultait.

**Cinq rubriques sur quatorze n'étaient cliquées par aucun test.** Avis,
Factures et avoirs, Clients, Statistiques et Vos passkeys. Le tableau du test
est une seconde liste manuscrite que rien ne confrontait au composant, et les
deux comptes étaient justes pris séparément : 14 déclarées, 9 exercées.

## ADR-043, les paramètres passent en base

Il remplace l'arbitrage du 31 août 2026 **pour ces valeurs seulement**.
L'identité légale reste en environnement : un SIRET est un fait administratif,
un seuil de franchise un levier commercial, et les deux n'ont ni le même rythme
ni le même décideur.

**Ce qui ne devient pas un paramètre porte sa raison** : le nom commercial est
la marque, les trois modes relèvent d'ADR-025, et la réserve de franchise sur le
domicile d'ADR-035. Un paramètre qui permet de violer un ADR est un
contournement, pas un réglage.

**Le calcul n'a pas bougé d'une ligne.** `calculerFraisPort` reste synchrone et
pur : seule la résolution a changé de place, ce qui laisse intacte la partie
dont la correction est prouvée par les tests de concurrence d'ADR-024.

## Le défaut le plus sérieux, et c'était une régression de ma story

`ls-critical-reviewer` l'a trouvé : **le port affiché pouvait diverger du port
facturé**.

Avant, les tarifs vivaient dans l'environnement et ne pouvaient pas bouger sans
redéploiement, ce qui coupait de toute façon la session. ADR-043 les rend
modifiables à chaud, c'est son objet même, et ouvre la fenêtre :

```
le client lit « Livraison 7,49 € » au récapitulatif
l'exploitante enregistre 8,99 € pendant qu'il vérifie son adresse
le clic suivant facture 8,99 €, et Stripe est appelé sur ce montant
```

**La détection existante ne le voyait pas** : `revalider` compare le total des
articles, qui exclut le port par construction.

`FraisPortChangesError` **lève** au lieu de rendre une valeur : la levée annule
la transaction, donc aucune pièce n'est gelée pour un achat refusé. Un `return`
validerait la transaction, piège déjà en fiche.

## Ce que les contrôles du dépôt ont trouvé dans mon code

Huit défauts réels, et aucun n'a été trouvé par relecture :

| Défaut | Trouvé par |
|---|---|
| `ParametreBoutique` absente du registre des traitements | **la CI**, pas moi |
| deux liens préchargeant des routes dynamiques, C40 | contrôle local |
| deux écrans sans état de chargement, C32 | contrôle local |
| comptage non déclaré dans la table de C37 | contrôle local |
| deux rubriques cliquées par aucun test | le sens 5 ajouté le matin même |
| `refus.ts` pris pour un fichier d'actions | contrôle des gardes |
| un backtick dans un commentaire SQL | TypeScript |
| une fonction pure exportée d'un fichier de Server Actions | `npm run build` |

**Ma liste locale de contrôles était trop courte.** J'en lançais huit, le dépôt
en compte une cinquantaine. Le registre des traitements n'y figurait pas, et
c'est la CI qui l'a dit.

## Deux fois le même motif, pris à l'envers

« Contrôle satisfait par un commentaire » est en fiche depuis longtemps. Il
s'est présenté **deux fois dans l'autre sens** aujourd'hui : un commentaire qui
DÉCLENCHE un contrôle.

- un commentaire citant le nom de la colonne de preuve d'identité a fait rougir
  le test d'architecture qui interdit son écriture directe
- un commentaire citant le marqueur de Server Action a fait prendre `refus.ts`
  pour un fichier d'actions vide

Dans les deux cas le contrôle a raison de ne pas savoir distinguer, et c'est le
commentaire qui se reformule.

## Le fichier des familles sans action est vide

`enregistrerParametres` est la **quatrième** action sensible du dépôt, et le
fichier l'annonçait depuis le 13 août 2026, mot pour mot : « LS-98 porte le
seuil de franco de port et les frais de livraison. Ceux-là sont bien des
paramètres de boutique au sens de la famille, et la ligne devra partir à ce
moment. »

**Deux cas de mutation se sont désarmés**, et le script l'avait écrit lui-même :
« la cible doit rester une famille SANS action, sans quoi ce cas se redésarmera
silencieusement à la prochaine story qui en couvre une ». Troisième fois que le
piège se pose, et la première où plus aucune famille n'est libre.

Les cas 4 et 5 posent désormais leur **propre famille témoin**. Un cas de
mutation qui dépend d'une dette s'éteint le jour où la dette est payée.

## Quatre suppositions corrigées par la mesure

Chacune aurait produit un code faux si je m'en étais tenu à ce que je croyais :

| Supposé | Mesuré |
|---|---|
| séparateur des messages Zod : un espace | `" : "`, avec le préfixe « Entrée invalide » |
| un message d'erreur français porte un accent | « Cette adresse email n'est pas valide » n'en a aucun |
| la pastille s'annonce « Alertes 1 » | « Alertes (1 en attente) » |
| `creerVarianteEnStock` accepte un prix | il est figé à 4900, au-dessus du seuil |

## ADR-044, l'assistant IA est écarté

Arbitrage de Christophe. Le cahier des charges est hors dépôt et place
l'assistant en V1 cible **sans en définir l'objet** : trancher sur cette base
aurait été inventer une fonction.

**L'ADR ferme le sujet plutôt que de le reporter.** Un report est une décision
non prise, et c'est exactement ce que faisait la mention « V1 cible » sans
définition : chaque session devait se demander si le sujet la concernait.

Les deux voies sont écartées pour des raisons différentes. Un fournisseur
externe est un service tiers, et la fiche qui a écarté Sentry le fait pour le
transfert de données, jamais pour le coût. Un modèle auto-hébergé prendrait de
la machine **au détriment du tunnel de commande**.

## Preuves

```
npm run type-check                      vert
npm run lint                            vert
npm run format:check                    vert
npm run build                           compile
npm run test                            97 fichiers, 1569 tests
npm run db:verifier                     125 réussites, 0 échec, DEUX modes
playwright parametres + alertes         80 tests, quatre largeurs
playwright navigation-administration    128 tests
verifier-actions-sensibles-mutation.sh  10 mutations, 10 détectées
verifier-navigation-administration.sh   21 routes, 16 rubriques
verifier-registre-traitements.sh        39 tables rangées
verifier-contraste.sh                   213 paires
verifier-ponctuation-chargement.sh      21 annonces, C35
```

Quatre mutations posées et détectées en plus : garde de port, interrupteur
d'alerte, condition d'acquittement, ordre de tri des alertes.

**Trois contrôles échouent aussi sur `main`** et ne concernent pas ce travail :
comptes de production, durcissement SSH qui exige root, hook de secrets hors de
son contexte. Vérifié en basculant de branche plutôt que supposé.

## Ce qui n'est pas fait, et se signale

**Quatre interrupteurs d'alerte sur cinq ne sont lus par aucun code.** Seul
`alerteMessageRecu` commande réellement quelque chose. ADR-043 décision 4 les
pose délibérément avant leur usage, mais l'écran laisse croire à l'exploitante
que les décocher change quelque chose. À câbler avec les envois.

**Le durcissement de la clé Backblaze est reporté**, arbitrage de Christophe :
elle porte `deleteFiles`, donc un serveur compromis peut détruire l'historique
distant. Le commentaire de LS-107 le pose comme « non urgent, à arbitrer ».

**`verifier-actions-sensibles-mutation.sh` ne tourne nulle part
automatiquement.** Il était cassé depuis le renommage de la rubrique Stocks, et
personne ne l'a vu : ni la CI ni les contrôles de CONTRIBUTING ne l'appellent.
Le même risque pèse sur les autres scripts de mutation.

## Audit de véracité demandé en fin de session

Christophe a demandé de vérifier que toute la documentation dise vrai avant de
quitter la session. Deux passes, README et `docs/`, puis `CLAUDE.md` et
`.claude/`. **Onze affirmations périmées**, PR #402.

**Aucune n'a été trouvée par les contrôles automatiques**, et c'est structurel :
ils vérifient ce qui est mécanique, longueur d'un fichier, ADR absent d'une
table, renvoi mort. Ils ne lisent pas une affirmation au présent.

### Les trois plus graves

| Fichier | Écrit | Réalité |
|---|---|---|
| `securite.md` | « `PARAMETRES_BOUTIQUE` reste la seule famille sans action » | les quatre sont couvertes |
| `securite.md` | table de **quatre** actions sensibles | il y en a **cinq** |
| `PROTOTYPE.md` | « Paramètres \| LS-98 \| à faire » | l'écran est livré |

Le premier est le plus sérieux : c'est le fichier qui gouverne les gardes, et la
règle qui **prescrit de relire** `familles-sans-action.txt` est celle qui ne
l'avait pas été.

### Trois comptes périmés le jour même où ils étaient écrits

`MODELE-LOGIQUE.md` disait « 38 tables et 40 clés au 11 septembre » pour 39 et
41, **dans le paragraphe qui existe pour dénoncer les comptes périmés**.
`frontend-design.md` disait « quatorze rubriques » avec la mention « compte à
relever plutôt qu'à recopier » juste à côté. Le README annonçait 388 et 482
tests pour 634 et 918.

**Les trois sont retirés plutôt que corrigés** : un compte cité en exemple
vieillit exactement comme celui qu'il corrige.

### Ce qui manquait

`ParametreBoutique` absente de `database.md` et `MODELE-LOGIQUE.md`, les deux
services neufs sans point d'entrée documentaire, ADR-035 non passé en
« partiellement remplacé », et les variables `AI_*` encore dans `.env.example`
alors qu'ADR-044 annule la fonction.

## Prochaine étape

**Trois tickets sont faisables** sans dépendre de l'exploitante, classés par
valeur :

| Ticket | Ce qu'il porte |
|---|---|
| **LS-145** | mesurer F-ADM-07 au chronomètre, cible jamais mesurée depuis LS-15 |
| **LS-150** | arbitrer la visibilité dans les moteurs de réponse, produirait un ADR |
| **LS-35** | e-reporting, dont la date d'imputation reste un point ouvert |

**LS-33 et LS-218 sont à écarter malgré les apparences** : le premier ne garde
que la souscription commerciale Mondial Relay, le second attend un envoi réel
dont le tarif facturé soit relevé.

Restent bloquées sur les photographies de LS-23 : LS-107 critères 4 et 6,
LS-140 critère 1, LS-123 pour `/notre-univers`.
