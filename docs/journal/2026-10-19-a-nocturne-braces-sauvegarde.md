# 19 octobre 2026 : nocturne rouge, exemption braces renouvelée et preuve de sauvegarde fiabilisée

Issue #579, ouverte le 14 octobre par le veilleur du nocturne. Trois nuits
rouges sur six, pour deux causes sans rapport : aucune ne venait d'un défaut
entré sur `main`.

## Fait

**18 et 19 octobre, runs 39105613691 et 39214510265 : exemption échue.**
L'étape « Verdict de l'audit des dependances » rendait
`ECHUE GHSA-vfj7-8cjw-p6xm (braces), exemption terminée le 2026-10-17, LS-258`,
le rouge que le critère 7 de LS-258 annonçait. Relu ce jour :

| Mesure | Valeur |
| --- | --- |
| version corrigée de `braces` | aucune, l'avis vise `<= 3.0.3`, `first_patched_version` nul |
| dernière version publiée | 3.0.3, du 21 mai 2024 |
| `@next/eslint-plugin-next@16.4.2`, la `latest` | fixe toujours `fast-glob` 3.3.1 |

Monter Next ne ferme donc rien. **Arbitrage de Christophe : renouveler pour
quatorze jours.** `scripts/audit-exemptions.json` porte `ajoute_le` 2026-10-19
et `jusqu_au` 2026-11-02, le filtre bornant la durée à 31 jours depuis
`ajoute_le`. Sur l'audit réel :

```
Paquets signalés : 5, couverts par une exemption : 5      code 0
AUJOURDHUI=2026-11-03 : ECHUE GHSA-vfj7-8cjw-p6xm ...      code 1
```

**14 octobre, run 38525580689 : la preuve de sauvegarde jouée sur un décor
vide.** `verifier-sauvegarde-mutation.sh` a fini avec 7 échecs sur 13 cas,
`pg_dump` sans socket et une archive témoin de 889 octets. Les nuits du 15 au
17 étaient vertes. Cause mesurée sur un conteneur `postgres:18.4` neuf, cinq
essais : au premier `pg_isready` réussi par le socket, le log ne compte
**qu'un serveur démarré**, le provisoire d'`initdb`, et `pg_isready -h
127.0.0.1` n'est pas prêt, **5 fois sur 5**. Ce serveur provisoire n'écoute que
le socket puis s'arrête ; la création des 12 tables, muette, pouvait tomber
dans cette fenêtre sans rien dire.

Corrigé :

- attente par TCP, `-h 127.0.0.1`, aux deux endroits du script et dans le
  mode conception de `prisma/sql-manuel/verifier-schema.sh`, même motif ;
- décor créé avec `ON_ERROR_STOP`, sortie conservée et affichée à l'échec ;
- décor **compté** après création, arrêt sous 12 tables.

## Preuves

```
./scripts/verifier-sauvegarde-mutation.sh       13 cas joués, 0 échec
npm run db:verifier:conception                  135 réussites, 0 échecs
```

Mutations posées à la main puis restaurées :

| Mutation | Résultat |
| --- | --- |
| une instruction du décor échoue | `Arrêt : le décor de la base n'a pas pu être créé.`, code 1 |
| la même sans `ON_ERROR_STOP` | `Arrêt : décor incomplet, 11 table(s) au lieu de 12.`, code 1 |
| retour à l'attente par socket, 5 passes | 5 vertes : la course ne se reproduit pas sur le Mac |

La dernière ligne ne prouve donc rien sur la course. La preuve du défaut est
la mesure de l'attente, et le compte des tables arrête désormais la preuve au
lieu de la laisser jouer sur un décor vide.

## État des tickets

LS-258 reste en cours, critère 7 reconduit au **2 novembre 2026**. Issue #579
**fermée** le même soir : nocturne relancé sur `098686f`, run 39311983905, vert
(`2607 passed`, sept preuves lourdes complètes, sauvegarde `13 cas joues, 0
echec`).

## Prochaine étape

Fait le même soir : nocturne vert, #579 fermée. Puis ce que nomme `2026-10-08-f` :
relecture de `/aide#faq` par l'exploitante, clore LS-26, puis LS-19. Au
2 novembre, relire `braces` à nouveau.
