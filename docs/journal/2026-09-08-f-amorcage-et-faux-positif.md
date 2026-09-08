# 8 septembre 2026, f : LS-204 et LS-175, la part faisable sans production

Deux tickets sur consigne de corriger toute anomalie immédiatement plutôt que de
la ticketer. Ce que la session a coûté à apprendre : **une cause qu'on ne
reproduit pas ne se corrige pas en la devinant**, et il vaut mieux corriger ce
qui est établi en disant ce qui reste ouvert.

## LS-204, la cause n'est pas trouvée et le rapport est réparé

Le contrôle `9a bis` avait bloqué une pull request documentaire, en affichant
« configuration Claude Code cohérente » **sous** le mot ÉCHEC.

**Quatre mesures, toutes vertes** : 25 exécutions consécutives du contrôle, 6
exécutions du script complet dans un clone superficiel imitant le `fetch-depth: 1`
de la CI, le contrôle lancé pendant que le témoin du cas 4 existe, et le contrôle
seul dans ce même clone.

**La cause exacte reste hors de portée locale.** Ce qui est corrigé est le seul
défaut établi : `attendre_vert` lançait le contrôle **deux fois**, une pour le
code et une pour l'affichage, donc le rapport pouvait décrire une exécution en
concluant sur une autre. `attendre_rouge` portait le défaut symétrique.

L'en-tête du script dit ce qui reste ouvert, plutôt que de laisser croire à une
correction complète. Si le cas rougit à nouveau, sa sortie sera cette fois celle
de l'exécution qui a réellement échoué.

## LS-175, ce qui est livrable et ce qui attend l'exploitante

Le ticket porte dix critères, dont plusieurs exigent la présence de l'exploitante
et le domaine de production. La part faisable a été livrée, le reste est écrit.

**Le script d'amorçage** rétrograde et promeut dans **une seule transaction** :
l'index partiel E1 n'admet qu'une administratrice, et deux instructions séparées
laisseraient une fenêtre où l'administration devient inaccessible si la seconde
échoue.

Il **refuse une adresse inexistante** plutôt que de rendre un succès silencieux,
un `UPDATE` sur une adresse absente touchant zéro ligne sans lever. Et il
**vérifie par relecture**, jamais par `rowCount` : celui-ci prouve qu'une
instruction a porté, pas que l'état final est celui attendu.

Six cas éprouvés sur la base e2e, jetable : adresse difforme, compte inexistant,
vérification avant promotion, promotion nominale avec rétrogradation, second
passage idempotent, vérification après.

## Le SQL et le shell ne s'imbriquent pas

**Ma première écriture du script était syntaxiquement cassée.** J'avais mis le
JavaScript et son SQL en ligne dans un heredoc shell, et les apostrophes du SQL
se sont télescopées avec celles du shell : `unexpected EOF while looking for
matching`.

Le module Node vit désormais dans `scripts/lib/`, et les deux scripts de cette
story suivent ce découpage. Ce n'est pas une élégance, c'est ce qui rend le SQL
lisible.

## Un critère annoncé sans porteur, et qui en avait un

Le commentaire du ticket signalait trois exigences d'ADR-021 « restées sans
porteur », dont le **test négatif d'accès croisé**. Il existe depuis LS-70,
`authentification.sequential.test.ts:224`, et ses deux cas passent : la
contrainte `passkey_credential_id_unique` empêche la même credential sur deux
comptes, et la cascade supprime les passkeys avec leur compte.

**Vérifier avant de conclure a évité d'écrire un test qui existait déjà.** Le
commentaire était vrai en septembre, une story ultérieure l'avait fermé.

## Preuves

Les trois sens de `verifier-comptes-production.sh` éprouvés sur une base
PostgreSQL jetable : OK sur base propre, échec sur onze comptes de test, échec
sur une administratrice qui n'est pas celle attendue.

Types, lint, format et cinq contrôles de cohérence au vert.

## Ce qui reste ouvert, et qui ne dépend pas de moi

Quatre des dix critères de LS-175 exigent **la présence de l'exploitante** et le
**domaine de production** : l'inscription, l'enregistrement de la passkey, la
seconde connexion qui le prouve, et les codes de récupération dont ADR-021 exige
que « l'existence soit vérifiée avant l'ouverture, pas supposée ».

Le `rpID` étant le domaine, une passkey enregistrée ailleurs ne vaut rien en
production : ces étapes ne s'anticipent pas. La procédure les écrit, c'est tout
ce qui peut être fait avant l'achat du VPS.

## Prochaine étape

LS-175 reste **En cours**, sa part production n'étant pas jouable. Le backlog
réalisable sans VPS s'épuise : ce qui reste attend le VPS, l'exploitante, ou un
compte tiers.
