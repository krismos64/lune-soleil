# 4 septembre 2026, session B : alléger la chaîne, LS-176

Quatre changements livrés, PR #221. Le gain n'était pas là où le ticket le
cherchait, et mon propre contrôle s'est fait prendre par le défaut qu'il dénonce.

## Ce qui est livré

**Le déclencheur `push: [main]` est retiré.** La chaîne tournait deux fois par
livraison, et le second passage revalidait un état déjà vert : `strict` vaut true
sur la protection, donc GitHub exige une branche à jour avant fusion et l'arbre
fusionné est celui que la pull request a testé.

**La preuve est faite** : la fusion de la PR #221 n'a déclenché aucun second run,
vérifié dans la liste des exécutions. `publier-image.yml` reste sur `main`, donc
l'état fusionné garde une couverture.

**`npm audit` distingue la panne de la vulnérabilité.** Le relâchement reste
étroit, `--audit-level=low` inchangé : seule l'indisponibilité du registre cesse
d'être traitée comme une faille.

**Le navigateur de test est mis en cache**, clé portant la version de Playwright
lue dans le verrou et jamais écrite en dur.

**Deux contrôles neufs**, `verifier-protection-branche.sh` et
`verifier-verdict-audit.sh`, tous deux prouvés par mutation.

## Deux pistes écartées après vérification, Context7

**Le cache de `node_modules`** était écrit dans le ticket. La documentation de
`actions/cache` le déconseille explicitement : conflits avec `npm ci` et entre
versions de Node. La piste était mauvaise, elle est corrigée plutôt qu'appliquée.

**Le découpage en deux jobs n'est pas fait, et le motif est neuf.** Chez GitHub,
**un job sauté rend « Success » et n'empêche pas la fusion**, même déclaré requis.
Conditionner un job de tests longs rendrait donc la pull request verte **sans que
les tests aient tourné**, ce qui est pire que le blocage que le commentaire du
workflow craignait. La parade existe, un job final d'agrégation toujours exécuté,
mais elle ajoute de la complexité pour un gain devenu marginal : le premier
facteur de lenteur était le réseau. Arbitrage à rouvrir si le nouveau régime gêne
encore.

## Mon contrôle s'est fait prendre par son propre principe

`verifier-protection-branche.sh` a fait échouer la chaîne en annonçant que
`strict` valait « absent », alors qu'il vaut `true`.

**En intégration continue, l'API ne rend pas une réponse vide, elle rend un objet
amputé.** Le `github.token` n'a pas `administration: read` : `required_status_checks`
disparaît, les autres clés restent. Le garde-fou testait `[ -z "$protection" ]`,
qui ne couvre que la réponse vide.

Le script a donc conclu à partir de ce qu'il n'avait pas pu mesurer, exactement
ce que ses propres commentaires interdisent. **Invisible en local**, où le jeton
personnel rend l'objet complet, et **non attrapé par les deux mutations pourtant
détectées** : une mutation prouve qu'un contrôle détecte, pas qu'il mesure ce
qu'il croit mesurer.

Corrigé par `jq -e 'has(...)'` avant toute lecture de valeur, et le motif est en
mémoire : une réponse amputée n'est pas un refus.

**Le contrôle est retiré de `controles.yml` et branché dans
`derive-documentation.yml`.** Lui donner `administration: read` dans la chaîne de
fusion le donnerait à chaque exécution, pull request venue d'un fork comprise,
pour un contrôle de cohérence : le risque créé dépasse le risque couvert. Le
workflow hebdomadaire ne se déclenche que sur planification, et une dérive y
ouvre une issue sous une semaine.

## Mesures

| Run | Durée | Cause |
|---|---|---|
| PR documentaire, panne du registre | 17 min 50, **rouge** | `npm audit` 6 min puis échec 400 |
| Même commit après rétablissement | 5 min 20, vert | registre rétabli |
| PR #221, suite complète | 24 min 09, vert | code touché, tout s'exécute |

Le détail du run de 24 minutes : intégration 7 min 07, bout en bout 5 min 32,
`npm audit` **4 min 37**, image Docker 3 min 25, `npm ci` **19 s**.

**`npm audit` reste lent même quand il réussit**, et il n'est plus bloquant. Le
registre npm est le premier facteur de variance de cette chaîne, devant tout ce
que le ticket visait au départ.

## Ce que Christophe paiera désormais

| Situation | Avant | Après |
|---|---|---|
| Pull request documentaire | 17 min, **puis 17 min** | environ 4 min, **rien** ensuite |
| Pull request de code | 18 à 24 min, **puis autant** | 18 à 24 min, **rien** ensuite |
| Mauvais jour du registre | rouge faux possible | signalé, non bloquant |

## Deux comptes du README étaient faux avant cette story

Relevés plutôt que recopiés : **38 scripts** et non 27, **19 branchés en CI** quand
le texte annonçait « trois scripts seulement » tout en s'avertissant lui-même de
ne pas recopier ces nombres. L'avertissement ne suffit pas s'il n'est pas suivi.

## État des tickets

**LS-176 est livrée sur ses quatre changements**, commits `4fc1219` et `b349d36`
sur `main`, PR #221 fusionnée en rebase.

Le critère du découpage en deux jobs **n'est pas rempli**, et c'est assumé : la
vérification a montré qu'il ouvrirait un trou de sécurité pour un gain marginal.
Le ticket reste ouvert avec ce seul point, arbitrage à prendre.

## Prochaine étape

Mesurer le nouveau régime sur quelques livraisons avant de rouvrir le sujet du
découpage. Côté code sans dépendance externe : **LS-137**, le référencement
technique, et **LS-147**, l'identité du site au partage.
