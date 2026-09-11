# 11 septembre 2026, j : l'audit de fin de session

Sept stories livrées, les contrôles mécaniques au vert. La passe de vérification
que le projet impose, sur ce qu'aucun contrôle ne lit : le sens des phrases et la
fraîcheur des comptes.

## Le compte, relevé et non dérivé

**175 sur 208 hors epics**, deux requêtes JQL appariées sur `issuetype != Epic`,
le 11 septembre 2026.

**Le dénominateur n'a pas bougé de la session**, et c'est notable : aucun ticket
n'a été ouvert, les anomalies trouvées ayant été corrigées directement, sur
consigne de Christophe.

**Le numérateur est passé de 173 à 175**, avec la clôture de LS-77, LS-190,
LS-165 et LS-125. Sept stories ont été livrées : un compte de tickets mesure ce
qui est **clos**, jamais ce qui est livré.

## Une date oubliée sous un chiffre à jour

Le README annonçait « 175 tickets » sous une date du **10 septembre**. J'avais
mis à jour le nombre et laissé la date : un lecteur aurait relu un compte pour un
autre.

Motif « un compte recopié n'est pas une mesure », qui vaut pour la **date** autant
que pour le nombre. La phrase le dit désormais.

## Ce qui reste ouvert, et pourquoi

**LS-61** est fusionnée et reste ouverte : son critère 3, « un renvoi révoque
l'ancien jeton », est tenu par le code mais **non exerçable**, aucun écran de
renvoi d'invitation n'existant.

**LS-85 a finalement été close** en fin de session, avec sa réserve écrite dans
le ticket : son critère 5 demande une écoute humaine au lecteur d'écran, qu'aucun
outil ne simule. Ce qui a été mesuré est l'**arbre d'accessibilité**, ce qui n'est
pas la même chose : il dit ce que le lecteur d'écran a à disposition, jamais ce
qu'il prononce. Clore en écrivant la réserve vaut mieux que laisser un ticket
ouvert sur un geste que le code ne peut pas produire.

La fermer sans cette réserve aurait déclaré vérifié ce qui ne l'a pas été.

## Le motif de la journée, quatre fois

Une **règle juste dont rien ne mesure l'application**. Quatre occurrences, dans
quatre domaines sans rapport :

| Règle | Ce qui avait dérivé |
|---|---|
| nommage des régions live | 59 anonymes contre 21 nommées |
| ordre des routes d'échec | le contrôle gardait une route sur deux |
| atteignabilité des écrans publics | six liens vers une page absente, contre trois annoncés |
| rédaction française | un cadratin dans chaque facture, aucun contrôle sur le genre |

**Un test écrit avec une story verrouille ce qui existe ce jour-là.** Il rougit
si on retire ce qu'il connaît, il ne dit rien de ce qu'une story future ajoutera
sans la règle.

## Le motif inverse, trois fois

**Un contrôle qui accuse du code sain.** L'atteignabilité a accusé deux écrans
parfaitement reliés, la rédaction une phrase parfaitement juste, et un jeu de
mutations un contrôle parfaitement voyant.

C'est **pire qu'une absence de contrôle** : la correction évidente devant un
rouge est de changer le code, donc de dégrader ce qui marchait.

Les deux fiches mémoire sont écrites.

## Ce que les garde-fous ont attrapé, dont moi

Quatre fois, une contrainte ou un garde-fou m'a repris :

- la règle **R20** a refusé mon jeton partagé entre trois invitations
- le CHECK **C43** a refusé ma clôture en deux instructions
- `media_principal_unique` a refusé mon second média au rang 1
- le garde-fou d'ancrage de **mon propre contrôle** a détecté qu'une apostrophe
  cassait mon script, là où il aurait conclu « tout conforme » sur zéro examen

## Vérifications

```
verifier-config-claude.sh             configuration cohérente
verifier-regles.sh                    règles conformes au schéma
verifier-redaction-francaise.sh       151 fichiers, aucune anomalie
verifier-atteignabilite-boutique.sh   25 routes, conforme
verifier-regions-live-parcours.sh     9 régions, 9 correctes
verifier-route-echec.sh               2 routes gardées
compte Jira                           175 sur 208, deux requêtes appariées
```

## État des tickets

**Closes ce jour** : LS-77, LS-190, LS-165, LS-125, LS-109, LS-85, LS-64, LS-32.
**Fusionnée, ouverte sur un critère** : LS-61 seule.
**En CI à la clôture** : LS-83, le ralentissement par compte visé.

**Ce bloc s'était périmé dans la nuit**, et c'est le motif qu'il décrit lui-même :
il annonçait LS-85 ouverte et trois stories « en CI » alors qu'elles étaient
fusionnées depuis. Un journal périmé est pire qu'absent.

**180 tickets terminés sur 208 hors epics**, relevés dans Jira en fin de session.
Onze des vingt-huit ouverts attendent l'exploitante.

## Prochaine étape

**LS-83 a été livrée après cet audit**, et son journal propre est en
`2026-09-11-k-ls83-ralentissement-par-compte.md` : la revue critique y a trouvé un
défaut grave, `rate_limit` étant vidée sans filtre de clé par Better Auth.

Ensuite, **LS-123** les pages de contenu, ou **LS-98** l'écran de paramètres
commerciaux, qui demande un ADR préalable sur ce qui devient configurable.
