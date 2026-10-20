# 20 octobre 2026 : médiateur CM2C désigné et publié, LS-19

Christophe, en séance avec l'exploitante, a mené l'adhésion au médiateur de la
consommation, guidé pas à pas. LS-19 attendait depuis le comparatif du
3 septembre.

## Fait

**Adhésion, côté exploitante.**

- Référencement vérifié le jour même sur la liste de la CECMC mise à jour le
  5 octobre 2026 : le CM2C figure sous A04 (marchés), A08 (bijouterie) et B01
  (vente en ligne).
- Inscription sur cm2c.net : raison sociale reprise du registre, tranche
  « jusqu'à 10 salariés », secteur A08. Tarif confirmé à 48 € pour trois ans,
  36 € par médiation à distance.
- Paiement accepté le 20 octobre à 21 h 22, carte personnelle de
  l'exploitante, ce qui est sans effet pour une micro-entreprise.
- Convention signée électroniquement, compte actif jusqu'au 20 octobre 2029,
  reconduction tacite sauf dénonciation trois mois avant l'échéance.

**Publication, côté code, arbitrage de Christophe (option A) : le médiateur est
écrit dans le code**, constante `MEDIATEUR` de `src/lib/identite-legale.ts`, sur
le modèle de `HEBERGEUR` du 19 octobre.

| Champ | Valeur | Source |
| --- | --- | --- |
| nom | Centre de la Médiation de la Consommation de Conciliateurs de Justice (CM2C) | convention ; la CECMC écrit « des Conciliateurs » |
| adresse | 49 rue de Ponthieu, 75008 Paris | convention et espace professionnel |
| téléphone | 01 89 47 00 14 | mention à reproduire, espace professionnel |
| email | litiges@cm2c.net | même source |
| saisine | https://www.cm2c.net/declarer-un-litige.php | même source |

Le téléphone et l'email s'ajoutent aux trois champs prévus jusque-là : la
convention, article 3-2, demande d'informer le consommateur « (téléphone, site,
adresse courriel) », articles L616-1 et R616-1.

`lireMediateur` et les trois `LEGAL_MEDIATEUR_*` sont retirés. Le contrôle de
groupe de `verifier-environnement.sh` n'avait pas d'autre usage et part avec
eux, ainsi que le cas 5 de sa preuve par mutation.

## Preuves

```
npx playwright test tests/e2e/informations-legales.spec.ts   88 passed
./scripts/verifier-environnement-mutation.sh                 OK 7 mutations sur 7
type-check, lint, verifier-redaction-francaise, -regles, -propagation-docs   code 0
```

Mutations sur `MEDIATEUR`, chacune rouge sur le nouveau test, témoin vert :
téléphone remplacé, lien de saisine vers l'accueil du CM2C, email changé, nom
tronqué.

## Dérives

**Un verdict de mutation mal lu.** La première boucle gardait `tail -1` des
lignes « passed|failed » et affichait « 8 passed » pour chaque mutation : les
huit tests de préparation passaient, la ligne « 1 failed » était au-dessus.
Relancé avec `--list`, puis avec le verdict complet et le nom du test en échec.
Même forme que « une liste vide n'est pas un verdict ».

**Une capture d'écran de la page de paiement montrait le numéro de carte
complet**, envoyée en séance. Il n'est recopié nulle part. Ce n'était pas la
carte débitée, et le conseil donné est de supprimer la capture et de surveiller
les relevés de cette carte.

**Erreur serveur sur `/catalogue` pendant la suite de bout en bout**,
`erreur serveur non rattrapee` sur une requête `?_rsc=`, six occurrences sur
`main` sans ce changement. Préexistante, non examinée ici.

## État des tickets

- **LS-19** : ses trois critères sont remplis, **close** le 20 octobre après
  déploiement constaté.
- **LS-1**, epic de la phase 0 : **close**, LS-19 était sa dernière story
  ouverte. Comptes relevés dans Jira : 272 terminés sur 281 hors epics,
  9 ouverts (4 En cours, 5 À faire), README mis à jour.
- **LS-28** : critère « le médiateur est désigné » rempli ; restent la
  politique de confidentialité complète, la publication des CGV et la
  validation par un professionnel compétent.

## Prochaine étape

Fait le même soir : PR #586 fusionnée, déployé (`a385f38`, run 39487738474),
rubrique constatée en production : HTTP 200, cinq coordonnées affichées, liens
`mailto:` et de saisine corrects, plus aucune « adhésion en cours ». LS-19
close, LS-28 commentée. Les lignes `LEGAL_MEDIATEUR_*` éventuellement présentes
dans `production.env` sont ignorées.

Ensuite : la rédaction des CGV, dernier gros morceau de LS-28, que le médiateur
ne bloque plus.
