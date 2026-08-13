# 13 août 2026, les sept critères en dette de LS-81 et LS-89

Deuxième session du 13 août, après celle qui a constaté la porte de sortie de la
phase 1. LS-95 ayant fait naître la première action sensible réelle du dépôt, les
sept critères que les deux stories gardaient en dette redevenaient traitables.

Contrainte de session posée par Christophe : une seule branche, plusieurs
commits, **une seule pull request en fin de session**, pour économiser les
minutes d'intégration continue.

## Le trou central, mesuré avant d'être comblé

Les critères 3 de LS-81 et 2 de LS-89 exigent une vérification « action par
action et non par la présence d'un appel ». La nuance paraissait rhétorique, elle
ne l'était pas.

`supprimerMonCompte` portait sa marque `@sensible IDENTIFIANTS` et appelait bien
`exigerReauthentificationRecente`. `verifier-actions-sensibles.sh` était vert.
**La garde retirée du corps de la fonction, les neuf tests de suppression
restaient verts eux aussi.** La seule action sensible du dépôt pouvait donc
perdre sa protection sans qu'aucun test ne rougisse.

Le contrôle textuel prouve que l'appel **figure** dans le corps de la fonction
marquée. C'est une propriété du fichier, et elle ne dit rien de l'exécution. Les
deux contrôles ne se remplacent pas.

`tests/integration/action-sensible-gardee.sequential.test.ts` exerce le point
d'entrée gardé avec une session réelle, cinq cas : refus sans preuve, succès
après preuve fraîche, refus hors fenêtre, refus d'emprunt de la preuve d'une
autre session du même compte, distinction de la session absente.

**Chaque cas regarde l'état de la base**, jamais seulement l'exception levée. Un
refus et une panne laissent le même état final, « rien ne s'est passé » : une
garde qui lèverait après avoir supprimé produirait la même exception, le même
message à l'écran, et seul le compte encore présent distingue les deux mondes.

## Deux cas de mutation, dont un que le contrôle textuel ne peut pas voir

Cas 57, la garde retirée. Cas 58, **la garde déplacée après l'effet** : l'appel
est toujours là, dans le corps de la fonction marquée, le contrôle textuel reste
vert mot pour mot, et le compte est déjà parti quand la garde lève. Le scénario
est banal, quelqu'un déplace la garde en pensant « vérifier au plus près de
l'effet ».

58 mutations, 58 détectées. Les deux nouveaux cas rougissent le test qui les vise.

## La question que LS-81 laissait à LS-89, tranchée

`.claude/rules/securite.md` portait depuis LS-81 : « les deux gardes vont
ensemble, et rien ne le vérifie [...] LS-89 doit trancher s'il faut
l'automatiser ».

C'est tranché, et **la portée a demandé plus d'attention que le principe**.
Exiger le couple partout aurait été faux : `supprimerMonCompte` est une action de
l'**espace client** et doit précisément ne pas exiger le rôle administratrice,
une personne supprimant son propre compte, article 17. Un contrôle plus large
aurait poussé à lui ajouter une garde de rôle interdisant l'effacement à tous les
clients, c'est-à-dire à créer un vrai défaut pour satisfaire une règle mal cadrée.

Le sens 4 s'applique donc sous `src/app/administration/` uniquement. Quatre
mutations, quatre détectées.

**Une de ces mutations a révélé un défaut de mon propre garde-fou.** Le sens 4
était conditionné à `[ -d "$ADMINISTRATION" ]` : le dossier renommé, la condition
devenait fausse, la boucle était sautée, et le script concluait « OK » sans avoir
rien examiné. Motif du garde-fou jamais exercé, déjà rencontré ici. L'absence du
dossier échoue désormais.

## Sens 5, la liste courte devient mesurable

Le critère 6 de LS-81 demande qu'aucune action fréquente n'exige de
réauthentification. C'était vrai et **invisible** : une seule fonction marquée sur
trente-six exportées, et le panier, action la plus fréquente du site, n'exige
rien. Rien ne le mesurait.

Deux erreurs de ma part, gardées en commentaire dans le script.

La première comptait les **fichiers** portant `"use server"` au dénominateur,
quand les marques vivent dans `services/`. Le fichier témoin du cas 9 de
`verifier-actions-sensibles-mutation.sh`, qui exige un **succès** sur une action
correctement gardée, faisait alors échouer le contrôle : sa marque au numérateur,
son fichier jamais au dénominateur. 8/9 au lieu de 9/9. Un contrôle dont les deux
termes ne comptent pas la même population finit par accuser du code juste.

La seconde était dans la mutation et non dans le contrôle : marquer des fonctions
sans les garder faisait échouer le **sens 1**, et j'aurais conclu que le sens 5
était prouvé. La mutation juste ajoute des fonctions marquées **et** gardées, non
exportées pour laisser le dénominateur fixe.

## Le rendu, et un défaut de contraste réel

`compte-suppression.spec.ts` disait lui-même que le parcours avec session n'était
pas couvert. Douze tests couvrent désormais l'écran connecté aux trois largeurs.

L'état d'erreur est atteint par le **parcours réel** : la session est valide, la
preuve manque, c'est la garde de LS-81 qui produit le message. C'est aussi l'état
nominal de l'écran, personne n'ayant de preuve fraîche en arrivant sur `/compte`.

**`--ls-text-muted` sur le fond sable de `.sectionDanger` donne 4,35:1**, sous le
seuil AA de 4,5:1. Mesuré par axe-core, confirmé par le calcul. Le jeton est
documenté à 4,86:1, ce qui est vrai **sur crème**. Le texte concerné dit « Cette
action est définitive », dernier avertissement avant un effacement irréversible.

Même motif que la règle incomplète de LS-88 : une valeur juste pour un contexte,
employée dans un autre, et le commentaire ne dit pas lequel.

## Une instabilité préexistante, trouvée puis corrigée

`connexion-administration` échouait sur deux exécutions rapprochées, « Expected
401, Received 429 ». Trois projets de largeur consomment le plafond de cinq
connexions par minute et par IP.

**Mesure faite en retirant mes fichiers : l'instabilité leur est antérieure.**
Ils l'ont rendue visible en changeant le tempo de la suite. Un test dont le
résultat dépend de ce qui a tourné avant lui ne prouve rien, et sa première
rougeur injustifiée apprend à ignorer la suivante.

Les deux points de reprise attendent la fenêtre plutôt que d'accepter le 429, ce
qui aurait retiré l'assertion distinguant un refus d'identifiants d'un refus
d'origine. **Le plafond n'est jamais désactivé pour les tests** : une protection
retirée de la mesure ne protège plus rien.

La session de test vient d'un projet Playwright `preparation`, une seule
inscription pour toute la suite. Vérifié via Context7 : le `webServer` démarre
avant, et le motif officiel est bien `dependencies` plus `storageState`.

## Un contrôle qui réclamait une contrevérité

`verifier-config-claude.sh` comparait le nombre de **projets** Playwright au
nombre de largeurs annoncé par le README, et réclamait « quatre largeurs » depuis
l'ajout de `preparation`, qui ne rend aucune page. Il compte désormais les projets
portant un `viewport`.

## Preuves

```
npm run type-check                                vert
npm run lint                                      vert
npm run format:check                              vert
npm run test                                      276 tests, 19 fichiers (271 avant)
npx playwright test                               55 e2e (42 avant), verts deux fois de suite
npm run db:verifier                               95 réussites, 0 échec, 32 tables
npm run build                                     réussi
npm audit                                         0 vulnérabilité
./scripts/verifier-actions-sensibles.sh           vert, 3 familles en attente
./scripts/verifier-actions-sensibles-mutation.sh  9 / 9 détectées
./scripts/verifier-tests-mutation.sh              58 / 58 détectées
./scripts/verifier-regles-mutation.sh             12 / 12 détectées
./scripts/verifier-config-claude-mutation.sh      14 / 14 détectées
./scripts/verifier-config-claude.sh --strict      vert
```

## État des tickets

**LS-81** : les huit critères sont remplis. Critères 3, 4, 6 et 7 fermés par cette
session, les quatre autres l'étaient depuis le 11 août.

**LS-89** : les sept critères sont remplis. Critères 2, 3, 4 et 6 fermés ici, le 3
l'était déjà par LS-95 qui a retiré `IDENTIFIANTS` du fichier de dette.

Le critère 4 de LS-81, « la réauthentification accepte la passkey », reste couvert
par la conception de LS-89 : la négociation WebAuthn ne s'exerce pas sous Vitest
ni Playwright, faute d'authentificateur pilotable. Ce qui dépend du serveur est
testé, l'enregistrement de la preuve et sa fenêtre.

## Ce qui reste, et une observation à ticketer

**LS-93**, dernière dette du registre : la durée de conservation des avis, posée à
trois ans sans texte qui l'impose, un ADR doit trancher.

**Observation non traitée, hors périmètre de ces deux stories.** `/compte`
redirige vers `/administration/connexion` quand la session manque, à deux
endroits, `page.tsx` et `formulaire-suppression.tsx`. Un client de la boutique
est donc envoyé sur l'écran de connexion de l'administration. Aucune page de
connexion client n'existe encore, elle appartient à **LS-54**. À signaler dans ce
ticket plutôt qu'à corriger ici : inventer une route modifierait le périmètre.

## Prochaine étape

Fusionner la pull request unique de cette branche, puis reprendre **LS-93**.
