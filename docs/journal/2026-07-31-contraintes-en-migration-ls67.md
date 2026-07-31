# 31 juillet 2026, les contraintes entrent dans la migration versionnée

| Champ | Valeur |
|---|---|
| Ticket | LS-67, story 3 sur 11 de LS-2, **terminé** |
| Commits | `56eb9e4` la story, PR #53 **fusionnée en rebase**, branche supprimée |
| Contrôles | 92 réussites 0 échec dans les deux modes, types, lint, build, règles, config, audit à zéro |
| Mutations | 6 mutations, 6 détectées |

Les 26 contraintes que Prisma ne sait pas générer, 25 `CHECK` et l'unicité
différable, vivaient dans des fichiers appliqués à la main. Elles sont désormais
posées par une migration versionnée, donc par le même mécanisme qui livrera la
production.

## Le défaut, mesuré avant d'être corrigé

Sur une base issue de la seule migration initiale, avant cette story :

```
contraintes CHECK  : 0
unicite differable : 0
```

Voilà ce qu'une mise en production aurait reçu : 26 tables sans le filet contre
la survente. Après la migration, 25 sur 25 et `condeferrable / condeferred` à
`t / t`.

## Ce qui a été fait

La migration `20260731050325_contraintes_check_et_unicite_differable` recopie les
26 contraintes. La recopie n'a pas été relue à l'œil : un contrôle compare les
noms puis les prédicats normalisés, commentaires et guillemets neutralisés, et
conclut à l'identité au caractère près.

`preparer-base-locale.sh` n'applique plus le SQL manuel. Cette étape est devenue
dangereuse plutôt qu'inutile : elle rendrait la base locale conforme même si la
migration était incomplète, et le défaut n'apparaîtrait qu'en production. À la
place, le script **compare** le compte obtenu aux fichiers de référence et échoue
en cas d'écart, plutôt que d'afficher un nombre sans le confronter à rien.

Les deux prototypes engendrent leur mot de passe par `openssl rand`, ce qui lève
le motif que l'analyse de secrets prenait pour une valeur. Trois accords au
féminin y ont été corrigés au passage, « deux clientes simultanées » devenant
« deux acheteurs simultanés ».

## Les preuves par mutation

| Mutation | Résultat |
|---|---|
| Implication changée en équivalence sur `chk_mouvement_vente_externe_prix` | détectée, ligne exacte pointée |
| `chk_variante_pas_de_survente` retirée | 24 CHECK, 1 échec : « la survente est rejetée par le CHECK, C6 » |
| `DEFERRABLE INITIALLY DEFERRED` retiré | `false/false`, 4 échecs dont l'échange de positions |
| `chk_avis_note_bornee` retirée | `db:preparer` échoue, code 1, « 24 sur 25 » |
| Prédicat faussé **à compte constant** | `db:preparer` vert, `verifier-schema.sh` 2 échecs |
| Restauration | retour au vert dans chaque cas |

La dernière est la plus instructive. Le garde-fou de comptage passe au vert
pendant que le contrôle de comportement rougit sur « chiffre d'affaires marché :
attendu [0], obtenu [1100] », les 1100 centimes de LS-63 à l'identique. Les deux
contrôles ne se recouvrent pas : le comptage prouve la complétude, le comportement
prouve la justesse. Supprimer l'un parce que l'autre existe ouvrirait un trou.

Chaque mutation portait une assertion vérifiant que sa cible existait, sans quoi
un `sed` sans effet aurait produit un vert rassurant et faux.

## Deux erreurs de méthode de la session

**Un `$?` derrière un pipe mesure le mauvais processus.** Le garde-fou de
complétude semblait sortir à 0 malgré son message d'échec : `npm run ... | tail`
rendait le code de `tail`. Mesuré sans pipe, le script sort bien à 1. Même piège
que `pipefail-et-grep-q`, sur un autre visage.

**Deux comparaisons de listes fausses avant la bonne.** Un `sed` qui ne retirait
pas le préfixe, puis un `grep` multi-fichiers qui préfixe chaque ligne du nom du
fichier : les deux ont déclaré les 26 contraintes absentes alors qu'elles étaient
toutes là. Un contrôle qui annonce un écart total sur un travail qu'on vient de
faire accuse d'abord le contrôle.

## Ce qui a été trouvé sans être corrigé

**Prisma veut recréer deux index partiels à chaque `migrate dev`.** Il propose de
supprimer puis recréer à l'identique `paiement_reussi_unique` et
`journal_email_systeme_unique`. Cause : PostgreSQL normalise `IN (...)` en
`= ANY (ARRAY[...])` avec les types explicites, et Prisma compare les chaînes
brutes. Les deux index concernés sont exactement ceux qui emploient `IN`, les
quatre autres ne bougent pas.

Sans effet sur la correction, les index existant et fonctionnant. Le risque est
l'accoutumance : une fausse alerte permanente finit par faire ignorer la vraie.
Ticket à créer.

**Le transport MCP Atlassian est périmé.** L'API répond que `mcp.atlassian.com/v1/sse`
n'est plus supporté depuis le 30 juin 2026, au profit de `/v1/mcp`. La
configuration du dépôt pointe encore sur l'ancien.

**La détection d'états transitoires ne couvre pas « vingt-cinq ».**
`verifier-config-claude.sh` cherche « vingt-et-une contraintes » et quelques
autres, sans le compte devenu exact. Sans effet ici, aucune rédaction de cette
session n'écrivant un compte en toutes lettres.

## Prochaine étape

**LS-68**, les tests. `npm run test` n'existe toujours pas, et le test de
concurrence sur le stock à un exemplaire doit entrer en intégration continue,
c'est le jalon qui compte.

Le générateur reste `prisma-client-js`. La bascule vers `prisma-client` coûte
trois lignes aujourd'hui, aucun fichier n'important encore `@prisma/client`, et
coûtera un remaniement complet une fois le code de données écrit. À arbitrer
avant LS-68.

## État des tickets

| Ticket | État |
|---|---|
| LS-67 | **Terminé**, six critères vérifiés, PR #53 fusionnée sur `main` |
| LS-68 | À faire, **prochaine action** |
| LS-69, LS-70 | À faire |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
