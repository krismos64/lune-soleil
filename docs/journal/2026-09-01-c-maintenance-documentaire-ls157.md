# 1er septembre 2026, session C : maintenance documentaire, LS-157

Deux audits croisés du projet ont eu lieu ce jour, l'un dans cette session,
l'autre mené en parallèle par un outil externe. Leurs constats convergents ont
été vérifiés un par un sur le dépôt, puis corrigés dans cette story. Rien de ce
qui suit n'était visible d'un contrôle existant, et c'est le point commun des
six défauts : chacun était une affirmation écrite à la main que seule une
confrontation à la source pouvait démentir.

## La référence fautive, propagée en huit endroits en une session

La clôture de LS-129 a écrit « LS-131, l'accès aux factures depuis l'espace
client » dans le journal, la fiche mémoire d'entrée, ADR-034, le `README.md`,
deux commentaires de code et le commentaire Jira de clôture. Or LS-131 porte le
suivi Mondial Relay ; l'accès du client connecté est **LS-57**, ce que la
description de LS-132 énonce elle-même.

L'erreur rendait la prochaine étape déclarée doublement fausse : mauvais
numéro, et le vrai ticket LS-57 est bloqué par LS-54. Les chemins réellement
ouverts vers un document lisible sont **LS-132**, le lien signé, et **LS-128**,
l'avoir. Les sept emplacements du dépôt sont corrigés, le commentaire Jira est
rectifié par un commentaire postérieur, le plus récent l'emportant.

## Cinq lignes de REFERENCES.md décrivaient un état disparu

La table du code applicatif disait encore : purge des journaux appelée par
personne (elle tourne chaque nuit depuis LS-94), aucune action sensible gardée
(la suppression de compte l'est depuis LS-95), `trustedProxies` non configuré
(LS-91 a livré `proxies-de-confiance.ts`), purge de quarantaine sans tâche
(LS-102), et vérification d'email suspendue à ADR-008 (implémenté, le blocage
réel est LS-54). Deux de ces lignes contredisaient la ligne « les cinq tâches
travaillent » du même document. Même motif dans `database.md`, qui annonçait
« deux tâches tourneront ».

## La séquence de contrôle échouait sur un clone neuf

`CLAUDE.md` et `CONTRIBUTING.md` enchaînaient `npm ci && npm run type-check`
sans `npx prisma generate`, alors que `src/generated/` n'est pas versionné et
qu'aucun postinstall ne le produit. La CI elle-même génère le client avant le
type-check, `controles.yml` lignes 221 et 388. Les deux séquences portent
désormais l'étape.

## Deux règles sur cinq ne se chargeaient pas là où elles protègent

`payments.md` déclarait `src/services/checkout/**`, `orders/**`, `invoices/**`
et `shipping/**`, quatre dossiers anglais écrits avant que la phase 3 ne
matérialise une arborescence française à plat. La règle ne se chargeait donc
pas sur `src/services/webhook-paiement.ts`, le cœur de l'invariant 5, ni sur la
facture. `legal.md` était pire, cinq motifs morts sur six. `frontend-design.md`
portait un `src/features/**` orphelin.

Le contrôle de couverture de `verifier-regles.sh` restait vert à bon droit :
il vérifie que chaque dossier est couvert par au moins une règle, et
`database.md` couvre `src/services/**`. **Couvert par une règle n'est pas
couvert par la bonne**, et rien ne vérifiait l'autre sens.

Les trois frontmatters sont réalignés sur les fichiers réels, et
`verifier-config-claude.sh` porte un contrôle 15 : chaque motif `paths` doit
matcher au moins un fichier suivi, l'anticipation restant possible par un
commentaire YAML `# anticipation` explicite. Le contrôle 14 du même script
documentait l'exclusion volontaire de `src/`, tolérance qui a vieilli en
défaut : l'anticipation silencieuse de juillet est devenue le trou de
septembre.

Prouvé avant d'être cru : sonde manuelle sur un chemin mort réintroduit
(signalé), 40 motifs extraits par l'analyseur (le silence ne venait pas d'un
analyseur vide), marqueur d'anticipation exempté, puis cas 14 du script de
mutation, qui insère un motif mort et exige le signalement. Le `README.md`
passe de quatorze à quinze mutations, compte que le contrôle 9 confronte au
script.

## CLAUDE.md retrouve une marge

Il était à exactement 200 lignes pour une limite dure de 200 : la prochaine
ligne légitime faisait tomber la CI hebdomadaire. Dégraissé de ce qui faisait
doublon avec `docs/REFERENCES.md`, sans perdre d'invariant.

## Ce que cette session n'a pas fait, et propose

Les deux audits ont aussi relevé une dette de cohérence du code, hors de cette
story : le formatage monétaire dupliqué sept fois sous trois noms,
`exigerRole` dupliquée sept fois avec trois signatures de retour, et six
services qui appellent Prisma hors transaction sans repository. Un ticket
dédié reste à arbitrer. La clé Stripe de test exposée en argument le 31 août
reste non révoquée, arbitrage de Christophe du même jour, que l'audit externe
recommande de réviser : la décision lui appartient.

## Prochaine étape

**LS-34 d'abord et hors code** : l'échéance de réception des factures
électroniques tombait ce jour, la démarche n'est pas faite. **LS-19**, la
médiation, à relancer, et l'epic contenus LS-22 est devenu le chemin critique
réel du Go-Live.

Côté code, **LS-132**, le lien signé expirant qui rend la facture atteignable
pour un achat sans compte, puis **LS-128**, l'avoir. L'accès depuis l'espace
client relève de LS-57, bloquée par LS-54.

## État des tickets

LS-157 créée, livrée et close par cette session. LS-84, LS-85, LS-82, LS-86 et
LS-9 restent en cours, inchangées. **LS-158**, la dette de cohérence du code, a
été créée ensuite sur arbitrage, rattachée à LS-7 : la phase 6 passe à treize
stories ouvertes, compte relevé dans Jira et porté au tableau du `README.md`.
