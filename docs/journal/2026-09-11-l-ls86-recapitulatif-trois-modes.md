# 11 septembre 2026, LS-86 : le récapitulatif sur les trois modes

Critère 5, le dernier des cinq. Zone touchée : information précontractuelle.

## Ce que ce ticket avait déjà établi

La vérification aux sources date du 25 août 2026 et elle avait corrigé
l'hypothèse de départ : **l'article qui gouverne le récapitulatif est L221-14
alinéa 1, et non L221-5**, que la description et `PROTOTYPE.md` désignaient tous
deux. L221-14 énumère **limitativement quatre** informations, dont les
caractéristiques essentielles et le prix.

**L'adresse rappelée n'est imposée par aucun texte**, ni L221-14, ni L221-5, ni
L111-1. Elle est affichée par arbitrage d'ergonomie, et `legal.md` porte la
distinction : une obligation légale ne se retire pas sans nouvelle vérification,
une décision d'ergonomie se rediscute librement.

## Le blocage invoqué n'existait plus

Le dernier commentaire du ticket, du 25 août, disait que le test des deux modes
en relais « exige l'API Mondial Relay, dont le compte n'est pas ouvert ».

Trois choses ont changé depuis : **ADR-035 a fait passer le contrat par
Sendcloud**, `fournisseurPointsRetrait` existe et le tunnel le consomme, et les
deux clés API sont posées dans l'environnement de développement.

## Mais le test de bout en bout reste impossible, pour une autre raison

Et celle-là est **délibérée**. L'en-tête de `tunnel-commande.spec.ts` l'écrit :
les clés Sendcloud ne sont **pas** posées en bout en bout, ce qui place le tunnel
dans le cas de panne du parcours 1, critère 6 de LS-115.

Les poser ferait appeler le vrai transporteur à chaque exécution de la CI, et
ferait disparaître la couverture du cas de panne. Le choix d'un point de retrait
y est donc inatteignable par construction.

## Ce qui n'était réellement couvert par rien

`rappelerAdresse`, dans `services/tunnel.ts`, **la décision même que LS-86 avait
tranchée**. Aucun test du dépôt ne la touchait, ni unitaire ni d'intégration :
`grep -rln "rappelerAdresse\|adresseRappelee" tests/` ne rendait rien.

Le mode Point Relais avait été vérifié **à la main** en août, par un cookie signé
portant un point de démonstration. L'affichage était prouvé, le comportement du
service non.

C'est donc là qu'était le trou, et pas où le critère 5 le désignait.

## Le test, et pourquoi il est d'intégration

`construireRecapitulatif` revalide le panier **en base**, règle S13 : le prix
vient de la base et jamais du cookie. Le reproduire en mémoire testerait une
reproduction du service plutôt que le service.

Sept cas, sur les trois modes :

| Ce qui est vérifié | Pourquoi |
|---|---|
| domicile, adresse du client, aucun nom de point | le colis part chez la personne |
| Point Relais, adresse du point **et non celle du client** | l'adresse personnelle n'a aucun usage, en afficher une induit en erreur |
| Locker, même règle | **valeur d'enum distincte**, une condition sur le seul `POINT_RELAIS` passerait le test précédent |
| le nom du client sur les trois modes | c'est l'identité à présenter au retrait |
| caractéristiques et prix, L221-14 al. 1 | les deux informations du texte qui concernent ce site |
| total = articles + port, en entiers | invariant 1 |
| le domicile coûte plus cher que le relais | un service qui calculerait juste et rappellerait toujours le tarif du domicile afficherait un prix faux |

**L'assertion du Point Relais vérifie aussi l'ABSENCE de l'adresse du client.**
Contrôler la seule présence du point laisserait passer un écran qui afficherait
les deux adresses.

## Preuve par mutation

| Mutation | Effet |
|---|---|
| ne traiter que `POINT_RELAIS`, oublier le Locker | **le test du Locker rougit**, exactement le cas qu'un test sur le seul relais aurait laissé passer |
| rappeler l'adresse du client quel que soit le mode | **les deux tests en relais rougissent** |

Restauration vérifiée, 7 sur 7 après.

## Ce que ce ticket n'a pas fait

**Aucune ligne de code source n'a été modifiée.** Le comportement était correct,
il n'était pas prouvé. `git status` ne porte qu'un fichier ajouté.

## Preuves

```
npm run type-check   vert
npm run lint         vert
npm run test         96 fichiers, 1530 tests, tous verts
```

## Traçabilité

**Dépôt** : ce test. **Journal** : ce document. **Jira** : LS-86 commenté, les
cinq critères à jour. **Mémoire** : rien de non dérivable du code.

## Prochaine étape

LS-61 critère 3, le renvoi d'invitation d'avis : aujourd'hui un client qui perd
son email ne peut plus jamais déposer son avis. Le schéma porte déjà les trois
champs, `revoquerJeton` existe, et la transaction est spécifiée dans
`database.md` point 8.
