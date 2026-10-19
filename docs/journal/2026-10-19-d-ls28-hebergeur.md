# 19 octobre 2026 : hébergeur OVH SAS écrit dans le code, LS-28

Christophe signale que l'hébergeur des mentions légales est OVH. Relevé en
production avant d'agir : la rubrique « Hébergement du site » affichait
**« A renseigner avant ouverture »** pour le nom et l'adresse, et
**« 00 00 00 00 00 »** pour le téléphone. Une fausse valeur sur une page légale.

## Fait

**Arbitrage de Christophe : écrire l'hébergeur en dur.** Accepté pour lui seul.
C'est un fait de l'architecture, pas une donnée de l'exploitante, et il ne
figure sur aucune facture. L'identité de l'éditeur reste dans l'environnement,
car elle partage sa source avec les factures, `lireEmetteur`.

- `HEBERGEUR` dans `src/lib/identite-legale.ts`, sources citées en commentaire ;
- les trois `LEGAL_HEBERGEUR_*` sortent du schéma et de `.env.example` ; les
  lignes restées dans `production.env` sont ignorées ;
- le bloc sort de la condition sur l'identité : il s'affiche, et se teste, même
  sans éditeur configuré, ce qui est le cas de la base de bout en bout.

| Champ | Valeur | Source |
| --- | --- | --- |
| nom | OVH SAS | mentions légales d'OVHcloud, `ovhcloud.com/fr/terms-and-conditions/` |
| adresse | 2 rue Kellermann, 59100 Roubaix, France | même page |
| téléphone | +33 9 72 10 10 07 | aucune page publique ; confirmé par Christophe depuis l'espace client |

Le `1007` seul aurait de toute façon échoué : le schéma exigeait six
caractères, et la section entière basculait sur « pas encore publiées ».

## Preuves

```
npx playwright test tests/e2e/informations-legales.spec.ts   88 passed
type-check, lint, verifier-redaction-francaise, -regles, -propagation-docs   code 0
```

Mutations, chacune rouge sur le test de l'hébergeur : téléphone remis à
`00 00 00 00 00`, adresse remise à « A renseigner avant ouverture », titre du
bloc renommé.

## Cause, à retenir

Le schéma Zod acceptait une valeur de remplissage comme une valeur valide, et
aucun test ne voyait le bloc : il vivait sous la condition sur l'identité, que
la base de test ne configure pas. Le commentaire Jira du 7 octobre confiait la
relecture des valeurs à l'œil, sans contrôle derrière.

## État des tickets

LS-28 reste en cours : médiateur (LS-19), politique de confidentialité
complète, validation par un professionnel.

## Prochaine étape

Fait le même soir : déployé (`6f2d61f`, run 39318793806), rubrique constatée en
production, aucune valeur de remplissage ; nocturne vert, #579 fermée. Les
lignes `LEGAL_HEBERGEUR_*` de `production.env` peuvent être effacées par
Christophe.
