# 31 juillet 2026, le générateur Prisma bascule

| Champ | Valeur |
|---|---|
| Ticket | LS-78, créée et livrée le même jour, **terminé** |
| Commits | `b9aa7f0`, PR #55 **fusionnée en rebase**, branche supprimée |
| Contrôles | 92 réussites 0 échec, types, lint, build, règles, config, audit à zéro |
| Mutations | 2 mutations, 2 détectées |

Deuxième page du 31 juillet. Le projet quitte `prisma-client-js`, que Prisma
annonce comme supprimé dans une prochaine version.

## Pourquoi maintenant plutôt que plus tard

Le journal de LS-67 posait la question sans la trancher. La réponse tient à une
mesure : **aucun fichier du projet n'importait `@prisma/client`**. Le coût était
donc de trois lignes, contre un remaniement de chaque import une fois le code de
données écrit en LS-68 et suivantes.

Attendre n'apportait rien et coûtait davantage. C'est le seul argument qui a
décidé.

## Ce que la bascule a révélé, et qui n'était pas prévu

Le nouveau générateur n'embarque plus de moteur Rust. La connexion passe donc par
un vrai pilote PostgreSQL, ce que le diagnostic initial avait manqué :

```
PrismaClientInitializationError: PrismaClient was instantiated without any
options. A driver adapter is required to connect to your database.
```

D'où `@prisma/adapter-pg`, une dépendance supplémentaire. Elle a été soumise à
Christophe plutôt qu'ajoutée en silence : annoncer « trois lignes » puis installer
un paquet sans le dire aurait faussé la décision qu'il venait de prendre.

Deux autres conséquences : `output` devient obligatoire dans le bloc `generator`,
et l'import s'écrit `@/generated/prisma/client`.

## Le point d'entrée unique

`src/lib/prisma.ts` porte l'adaptateur et un cache d'instance sur `globalThis`.
Ce cache n'est pas décoratif : le rechargement à chaud de Next.js réévalue le
module à chaque modification, et sans lui chaque rechargement ouvrirait un pool
de connexions, jusqu'au refus de la base.

Le client engendré vit dans `src/generated/prisma`, **hors de git**. Le versionner
noierait le diff utile de chaque PR touchant au schéma sous des milliers de lignes
fabriquées. Conséquence à connaître : un dépôt fraîchement cloné n'a pas de client
tant que `prisma generate` n'a pas tourné.

## Les preuves

Le client interroge réellement la base, en requête typée comme en `$queryRaw`, la
forme qu'exigera la réservation de stock :

```
client operationnel : produit=0 variante=0
base : PostgreSQL 18.4 (Debian 18.4-1.pgdg13+1) on aarch64-unknown-linux-gnu
```

| Mutation | Résultat |
|---|---|
| Appel à `findManyy` | `error TS2551`, en nommant `ProduitDelegate` et en suggérant `findMany` |
| `DATABASE_URL` vide | rejet au démarrage, message nommant la cause |

**La première comptait plus qu'elle n'en a l'air.** Un `tsc --noEmit` muet sur du
code engendré pouvait signifier « tout va bien » ou « TypeScript ne regarde même
pas ce dossier ». La mutation tranche : les types Prisma sont bien branchés sur le
nouveau chemin.

## Un garde-fou qui s'exerce pour la première fois

`npm install` a d'abord échoué :

```
npm error notsup Required: {"node":">=22.12.0 <23 || >=24 <25"}
npm error notsup Actual:   {"npm":"10.9.2","node":"v23.9.0"}
```

Le shell tournait sous Node 23, une version impaire que Prisma 7 refuse.
`engine-strict=true`, posé en LS-65, a bloqué avant d'installer. Jusqu'ici ce
garde-fou n'avait été prouvé que par mutation ; c'est sa première mise à l'épreuve
sur un cas réel, et il a arrêté une installation qui aurait produit un état
incohérent.

## Ce qui reste ouvert

**Rien n'empêche mécaniquement d'instancier `PrismaClient` ailleurs.**
`src/lib/README.md` l'interdit par écrit, aucun contrôle ne le vérifie. Une règle
`no-restricted-imports` dans ESLint le rendrait déterministe, à considérer en
LS-68 ou LS-69.

L'intégration continue de LS-69 devra lancer `prisma generate` avant de compiler,
le client n'étant plus versionné.

## Prochaine étape

**LS-68**, les tests. `npm run test` n'existe toujours pas, et le test de
concurrence sur le stock à un exemplaire doit entrer en intégration continue.

## État des tickets

| Ticket | État |
|---|---|
| LS-78 | **Terminé**, cinq critères vérifiés, PR #55 fusionnée sur `main` |
| LS-67 | **Terminé**, page précédente |
| LS-68 | À faire, **prochaine action** |
| LS-69, LS-70 | À faire |
| LS-9, LS-10 | En cours, hors chaîne de phase 1 |
