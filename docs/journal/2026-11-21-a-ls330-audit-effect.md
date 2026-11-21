# 21 novembre 2026 : LS-330, nocturne rouge sur un avis d'effect

## Demande

Christophe : « où en est-on ? ». Issue #695 ouverte par le veilleur, nocturne
rouge le 20 et le 21 novembre (run 44887865614 pour le second). Accord pour le
corriger. Ticket neuf **LS-330**, Bug sous l'epic LS-7.

## Constat

- Une seule étape rouge, « Verdict de l'audit des dépendances ». Les lignes
  `ECHEC` et les erreurs PostgreSQL du journal du run viennent des preuves par
  mutation, qui doivent échouer : `17 mutations, 17 detectees`.
- **GHSA-7589-6fvf-x4pw**, publié le 19 novembre 2026 à 20:51 UTC : ReDoS dans
  la regex compilée de `Schema.TemplateLiteral` d'`effect`, plage `<= 3.22.0`,
  corrigé en **3.22.1**. Trois paquets en « high » : `effect`,
  `@prisma/config`, `prisma`.
- Chaîne : `prisma@7.9.1 > @prisma/config@7.9.1 > effect@3.20.0`, épinglé.
  `@prisma/config@7.10.1` épingle encore 3.20.0 : monter Prisma ne corrige rien.
  `npm audit fix --force` proposait Prisma 6.12, écarté.
- Le filtre marquait **INUTILE** l'exemption de picomatch (GHSA-fc5q-39xc-vjpf,
  LS-329) : l'avis ne sort plus de l'audit.

## Fait

- Override `"effect": "^3.22.1"` dans `package.json`, résolu en **3.22.5**,
  même branche majeure. Justification ajoutée à `//.overrides`, sur le modèle
  de `deepmerge-ts`, qui passe par la même chaîne `@prisma/config`.
- `scripts/audit-exemptions.json` vidé, `[]` : plus aucune exemption.

## Preuves

- `npm audit` : `found 0 vulnerabilities`. Filtre rejoué sur le rapport :
  `Paquets signalés : 0, couverts par une exemption : 0`, code 0.
- `npm ls effect` : `effect@3.22.5 overridden`.
- CLI Prisma exercé après l'override : `prisma --version` charge
  `prisma.config.ts`, `prisma validate` et `prisma generate` passent,
  `db:preparer` puis `prisma migrate status` (« up to date »),
  `db:verifier` : `172 réussites, 0 échecs`.
- Types et lint au vert ; `npm run test` : 130 fichiers, 2 110 tests ;
  `npm run build` au vert ; `verifier-regles.sh` conforme.
- **`effect` absent de `.next/standalone`**, compte mesuré à 0 : la boutique
  servie n'a jamais chargé le code vulnérable. Il ne servait qu'à l'outillage,
  CLI et `prisma generate` au build de l'image.

## Prochaine étape

Fusion, déploiement pour garder la production égale à `main`, nocturne relancé
à la main, fermeture de #695 et de LS-330 sur un nocturne vert.

## État des tickets

- LS-330 : en cours jusqu'au nocturne vert.
- LS-291, LS-320, LS-35 : inchangés, relevés dans Jira ce jour.
