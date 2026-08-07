# 7 août 2026, LS-71, le socle Zod et la fuite qui n'était pas où je la cherchais

Deuxième session de la journée, après LS-52. Premier code applicatif depuis
LS-70 : le socle de validation serveur, la dette de LS-50 soldée, et un adaptateur
réel qui prouve que la convention tient à la frontière.

**La chaîne de phase 1 avance. LS-2 passe à En cours**, huit stories filles sur
dix-sept étant terminées et l'epic restant affiché « À faire ».

## Ce que la story a produit

| Fichier | Rôle |
|---|---|
| `src/lib/validation.ts` | six schémas de domaine, `valider`, `EntreeInvalideError` |
| `src/app/panier/actions.ts` | Server Action, premier usage réel du socle |
| `docs/architecture/VALIDATION.md` | la convention, dernier critère d'acceptation |
| `tests/unitaire/validation.test.ts` | 37 tests, chacun portant son refus |

Les tests ont été écrits **avant** l'implémentation, exigence du plan directeur
sur les zones à risque, et vérifiés rouges avant d'écrire le socle.

## Le point de conception que LS-50 laissait ouvert

Le commentaire de LS-50 posait la question sans la trancher : la validation
reste-t-elle dans le service, ou remonte-t-elle dans l'adaptateur ?

**Les deux, et ce n'est pas une redondance.** Un service s'appelle depuis un
adaptateur, mais aussi depuis un autre service, une tâche planifiée ou un test :
par ces chemins, aucun adaptateur n'a rien validé. Le point d'entrée du cas
d'usage est le seul endroit que tous les appelants traversent.

Aucun ADR n'a été nécessaire : le README de garde de `services/` portait déjà
« la validation Zod des entrées non fiables », et celui de `app/` portait « les
Server Actions, qui valident avec Zod puis délèguent à `services/` ». La décision
était écrite, elle n'était pas appliquée.

## La fuite n'était pas où je la cherchais

L'invariant 9 interdit de journaliser un secret. J'ai écrit deux mutations pour
prouver que le message d'erreur ne recopie pas l'entrée refusée. **Les deux sont
restées vertes, et elles avaient raison.**

Elles ajoutaient `probleme.input` au message, en supposant que Zod y met la
valeur refusée. Mesure faite sur Zod 4 dans ce dépôt : les `issues` sérialisées
**ne portent pas** `input`. La mutation n'ajoutait que « (recu : undefined) », et
ne faisait donc rien fuiter.

C'est en cherchant pourquoi ces mutations ne prouvaient rien que le vrai vecteur
est apparu : le problème **`unrecognized_keys` porte les noms des clés
rejetées**, recopiés dans son message. Ces noms viennent de l'entrée, et un corps
hostile les choisit. `{ "cle_api_sk_live_xxx": 1 }` s'écrit dans le journal par le
seul message d'erreur.

`formaterProblemes` remplace donc le message de Zod pour ce seul code de problème
et rend le **nombre** de champs non reconnus. Le diagnostic reste possible, la
donnée ne sort pas.

**Le commentaire que j'avais écrit dans le code était faux** : il affirmait que
`parse` sérialise `input`. Corrigé avant commit.

## Ce que le socle a trouvé en se branchant

**Deux classes `EntreeInvalideError` coexistaient**, celle de LS-70 dans
`services/utilisateur.ts` et celle du socle. `instanceof` est **faux** entre deux
classes homonymes de modules différents : un adaptateur capturant l'une aurait
laissé passer l'autre sans qu'aucun type ne proteste. Le service réexporte
désormais celle du socle, ce qui préserve les imports existants.

**La garde de LS-50 laissait deux trous** que le socle ferme : un `varianteId`
arbitraire partait jusqu'à l'`UPDATE` et ressortait en « pièce indisponible »
pour une pièce inexistante, et un panier vide rendait `SERVI` sans rien réserver.

## Les tests d'intégration, ce qui a changé

Les trois valeurs de la dette, `0`, `-1` et `1.5`, sont **préservées telles
quelles**. Seul le type d'erreur attendu change, `TypeError` devenant
`EntreeInvalideError` : le commentaire de LS-71 autorisait explicitement cette
substitution. L'assertion sur `quantite_reservee` à zéro, qui prouve que rien n'a
atteint la base, est intacte.

Trois tests ajoutés : identifiant mal formé, panier vide, et non-recopie de
l'entrée sur le chemin réel du service.

Les identifiants des tests unitaires passent en UUID. Ces tests portent sur
l'ordre des appels et le rejeu, pas sur les identifiants : des constantes nommées
`VARIANTE_A` à `VARIANTE_C`, d'ordre lexicographique délibéré, gardent
l'assertion de tri lisible.

## Le contrôle préalable du script de mutation était incomplet

Les nouveaux cas mutent contre `test:unitaire`, quand le script n'établissait la
verdeur que de `test:integration`. Un cas unitaire aurait alors conclu sur une
suite déjà rouge, et « RATE, le test est aveugle » n'aurait pas distingué un test
défaillant d'un test absent. C'est le mode fail-open que ce contrôle préalable
existe précisément pour éviter, déjà rencontré sur le script de migration en
LS-42.

Les deux projets sont désormais vérifiés avant toute mutation.

## Contrôles

```
type-check                        vert
lint                              vert
format:check                      All matched files use Prettier code style
npm run test                      7 fichiers, 120 tests (60 avant cette story)
npm run test:e2e                  24 tests
npm run build                     vert
npm audit --audit-level=low       0 vulnerabilite
verifier-regles.sh                regles conformes au schema
verifier-config-claude.sh --strict  coherente
verifier-tests-mutation.sh        15 mutations, 15 detectees (12 avant)
```

## Ce qui n'a pas été fait

**Aucune modification de schéma, aucune migration.** La story ne touche pas la
base : les `CHECK` restent la ligne de défense, le socle améliore la qualité du
refus.

**`services/utilisateur.ts` emploie encore `.strict()`**, forme dépréciée en
Zod 4 au profit de `z.strictObject()`. Le comportement est identique et la
réécriture n'appartenait pas à LS-71. Tracé dans `VALIDATION.md`.

**Le contrôle de comparaison modèle contre Prisma n'a pas été ajouté**, comme
demandé : il reste la proposition ouverte de LS-52.

## État des tickets

| Ticket | État |
|---|---|
| LS-71 | **Terminé**, fusionné en PR #71, commits `20251d8`, `248c24b`, `bce78c4` et `1e57a15` |
| LS-2 | passée En cours, 9 stories filles restantes sur 17 |
| LS-50 | sa dette est soldée, le ticket reste Terminé |
| LS-72 | prochaine action possible, l'ordre des stories restantes est libre |
