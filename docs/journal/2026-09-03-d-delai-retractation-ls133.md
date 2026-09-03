# 3 septembre 2026, session D : LS-133, le calcul du délai de rétractation

Christophe s'absentait et a laissé la story en autonomie, avec deux arbitrages
tranchés avant son départ : livrer le calcul pur seul, et calculer les jours
fériés en interne plutôt que d'ajouter une dépendance.

## Le blocage annoncé n'en était pas un

Le journal de la session C écrivait que **LS-151 ne dépend de personne**. C'est
faux, et la lecture du ticket l'a montré : sa première ligne parle du « passage
d'un VPS commandé et vierge », et ses huit critères se prouvent sur la machine.
Sans VPS acheté, LS-151 est bloquée comme les sept autres stories de LS-7.

Corrigé dans ce journal plutôt que laissé à contredire plus tard.

**LS-133 porte un lien `is blocked by` vers LS-131**, que j'avais annoncée
faisable sans l'avoir lu. Le lien est réel mais trop large : il vaut pour le
branchement sur `Expedition.livreA`, pas pour le calcul, qui prend une date en
entrée et se prouve entièrement avec des dates de test. Arbitrage de Christophe :
livrer le calcul seul, et le dire dans le ticket plutôt que de retirer le lien.

## Ce que la vérification aux sources a corrigé

Le ticket et `legal.md` écrivaient « samedi, dimanche ou jour **férié** ». Le
texte de l'article L221-19, relevé sur Légifrance, dit « jour **férié ou
chômé** ».

L'écart ne change aucun calcul ici, un jour chômé relevant d'un accord collectif
d'entreprise que l'exploitante n'a pas. Il est reporté dans `legal.md` parce
qu'un jour chômé ne pourrait qu'**allonger** le délai, jamais l'avancer, et que
la nuance se perdrait sinon.

La liste des onze fériés vient de service-public.gouv.fr, et les fériés
d'Alsace-Moselle en sont exclus, Vendredi saint et 26 décembre.

## Les dates de test sont vérifiées hors du code testé

Un test qui appellerait `paques()` pour construire son attendu validerait
l'implémentation par elle-même. Les dates ont donc été calculées par un script
séparé, hors du module, avant d'être écrites en clair :

```
2026-12-25 vendredi   Noel 2026
2026-12-26 samedi
2026-12-27 dimanche
2026-12-28 lundi      -> echeance prorogee
2027-01-01 vendredi   1er janvier 2027
2027-01-04 lundi      -> echeance prorogee
```

Les deux cas les plus exigeants sont donc réels et non inventés pour la
démonstration.

## Trois pièges que les critères ne demandaient pas

**L'instant UTC du soir.** Le 15 mai à 22h30 UTC est le 16 mai à 00h30 à Paris.
Le critère 6 ne demandait que le sens facile, 23h30 à Paris valant 21h30 UTC le
même jour. Le sens inverse est celui qui casse une implémentation menée en UTC,
et il rendrait une échéance **trop précoce d'un jour**, ce que L221-20 sanctionne
par douze mois.

**La table des fériés de la mauvaise année.** Une échéance au 1er janvier
appartient à l'année suivante. Une implémentation qui ne consulte que l'année de
réception la laisse passer pour ouvrable. La mutation 4 l'a prouvé : **un seul
test rougit**, celui du 1er janvier, ajouté hors critères. Sans lui le défaut
passait.

**Le changement d'heure.** Ajouter quatorze fois 86 400 000 millisecondes dérive
d'une heure au passage à l'heure d'hiver et peut changer de jour civil. Le calcul
se fait donc sur des dates civiles, où un jour vaut un jour, et `Date.UTC` n'y
sert que de calendrier.

## La preuve par mutation

Huit mutations, huit détectées. Les deux premières sont celles qu'exige le
critère 8, les six autres visent les points fragiles.

| # | Mutation | Tests rouges |
|---|---|---|
| 1 | prorogation retirée | 6 |
| 2 | jour de réception compté | 10 |
| 3 | prorogation unique au lieu d'itérative | 5 |
| 4 | table de fériés de l'année de réception | **1** |
| 5 | calcul en UTC au lieu d'`Europe/Paris` | 3 |
| 6 | Ascension à J+38 au lieu de J+39 | **1** |
| 7 | dernier bien devenu le premier, L221-18 | **1** |
| 8 | `finInclusive` au début du jour limite | **1** |

Les quatre mutations à **un seul test** sont les plus utiles : elles prouvent que
le test visé attrape son défaut seul, sans être sauvé par ses voisins. La
mutation 2 en fait rougir dix, ce qui est trop large pour prouver grand-chose,
motif de `lune-soleil-mutation-trop-brutale`.

## La restauration a échoué en silence

`git checkout -- src/lib/retractation.ts` après la mutation 1 a rendu
`error: pathspec ... did not match any file(s) known to git` : **le fichier était
neuf, donc inconnu de git**. Mon contrôle affichait pourtant « restauré », en
comptant les lignes de `git status --porcelain`, qui en rend bien une pour un
fichier non suivi.

La mutation est restée en place, et seul un `grep` direct l'a montré. Le code a
donc été commité **avant** les mutations suivantes, ce qui rend `git checkout`
opérant. Motif connu, `lune-soleil-travail-non-commite-perdu`, rencontré ici sous
une forme nouvelle : le fichier neuf.

## Ce que la revue critique a trouvé

`ls-critical-reviewer` a vérifié le module **par exécution** et non par lecture :
balayage de 2026 à 2035 par pas de trois heures, 29 200 cas, quatre invariants
contrôlés à chaque itération. **Aucune échéance trop précoce**, le seul sens qui
portait un risque juridique. La sonde de `debutDuJourSuivantEnUtc` trouve minuit
entre l'itération 60 et 120 sur une borne de 300, y compris aux deux changements
d'heure et de 1890 à 2060. La borne de huit prorogations n'est jamais approchée,
le maximum réel étant **quatre**, jeudi 7 mai 2043 suivi du 8 mai férié et d'un
week-end.

Elle a trouvé **un vrai défaut dans mon test**, pas dans le module.

**`expect(feries.size).toBe(11)` était faux en général.** Deux fériés coïncident
certaines années et le `Set` les dédoublonne : en 2059 l'Ascension tombe le
8 mai, jour de la Victoire 1945. Mesuré à **dix** dates distinctes en 2008, 2059,
2070, 2081 et 2092.

```
2008:10   2026:11   2059:10   2070:10   2081:10   2092:10
```

L'assertion n'était sauvée que par l'année choisie. Remplacée par le contenu
attendu, les onze dates de 2026 en clair, ce qui teste davantage et reste vrai
les années de collision. Le module, lui, est indifférent : un jour compté une
fois ou deux proroge identiquement.

**Le refus d'un jour mal formé n'était exercé par aucun test**, alors que ce
garde-fou remplace l'assertion de type retirée au commit `b163ae7`. Un test
l'exerce désormais sur trois formes, dont `2026-5-1`, d'apparence valide mais non
remplie à deux chiffres.

Les deux corrections sont prouvées par mutation, 9 et 10 : neutraliser le refus
fait rougir un test, décaler l'Ascension d'un jour en fait rougir trois.

## Le piège documenté le matin, refait l'après-midi

En restaurant la mutation 10 par `git checkout`, **la correction du commentaire
sur la collision a disparu** : elle n'était pas commitée, et le fichier est
revenu au dernier commit. C'est la fiche
[[lune-soleil-git-checkout-fichier-neuf]] écrite quelques heures plus tôt,
appliquée à un fichier désormais suivi.

La règle vaut donc plus largement que ce que la fiche disait : **commiter avant
chaque mutation**, pas seulement avant la première.

## Un défaut trouvé par la propagation

`legal.md` liste ses chemins de déclenchement un par un, et
`src/lib/retractation.ts` n'y était pas. La règle qui gouverne le calcul ne se
serait pas chargée en éditant le module. Ajouté au `paths`.

C'est le motif de `lune-soleil-couverture-des-regles` : une règle juste ne
protège rien si son `paths` ne l'atteint pas. Aucun contrôle ne l'a signalé,
`verifier-regles.sh` vérifiant que chaque motif matche un fichier suivi, pas
qu'un fichier neuf est couvert.

## Vérifications

```
npm run type-check                    aucune erreur
npm run lint                          aucun signalement
npx prettier --check                  All matched files use Prettier code style
npx vitest run --project unitaire     23 fichiers, 409 tests, tous verts
./scripts/verifier-regles.sh          code 0, 98 identifiants, 61 dossiers couverts
./scripts/verifier-config-claude.sh   code 0, aucun signalement
mutations                             8 jouées, 8 détectées
```

TypeScript strict a refusé la déstructuration d'un `split`, dont chaque élément
peut manquer. La forme du jour civil est donc vérifiée par une expression
régulière plutôt que forcée par une assertion, qui aurait laissé passer `NaN`
jusqu'au calcul.

## Prochaine étape

Le calcul existe, rien ne l'appelle encore. **LS-134**, la fonctionnalité de
rétractation en ligne, est la suite directe et reste bloquée par LS-133 seule,
donc débloquée par cette livraison. Elle est faisable sans l'exploitante et sans
le VPS.

Les autres directions ouvertes sans elle sont inchangées : LS-137 le référencement
technique, LS-156 le contrôle de l'environnement local, LS-141 puis LS-148 sur la
mesure d'audience et les cookies, et LS-168 sur l'instabilité de la suite de bout
en bout.

L'achat du VPS débloquerait huit stories d'un coup, et la fiche de questions
attend toujours l'exploitante.

## État des tickets

LS-133 **terminée**, épic LS-6, phase 5. Son lien `Blocks` vers LS-134 est
maintenant sans objet côté calcul.

L'épic LS-6 garde quatre stories : LS-134, LS-135, LS-136 et LS-148. LS-135
dépend de LS-33, non tranchée.

**59 stories ouvertes** une fois LS-133 close. Compte relevé dans Jira avant
clôture, 60, moins celle-ci.
