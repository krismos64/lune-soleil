# lib/

Infrastructure technique transverse, sans logique metier.

## Ce qui entre ici

- la connexion a la base, `prisma.ts`, point d'entree unique du client
- les utilitaires purs sans dependance de domaine : formatage de montants en
  centimes, conversion d'horodatage UTC vers Europe/Paris a l'affichage
- le socle de validation, `validation.ts` : schemas Zod partages, `valider` et
  `EntreeInvalideError`. La convention est dans
  `docs/architecture/VALIDATION.md`, a lire avant d'ecrire un adaptateur

## Ce qui n'entre pas

- une requete, qui appartient a `repositories/`
- une regle metier, qui appartient a `services/`
- un appel a un fournisseur externe, Stripe, email ou medias, qui appartient a
  `integrations/`

## Points de vigilance

**Pourquoi le socle de validation est ici et non dans `services/`.** Un schema
Zod decrit une FORME, il ne porte aucune regle de gestion : il ne connait ni le
stock disponible, ni le prix courant, ni aucun statut metier. Le placer dans
`services/` le rendrait inaccessible aux adaptateurs de `app/`, qui doivent
valider AVANT de deleguer, et creerait une dependance de `app/` vers la couche
metier pour une simple comparaison en memoire.

Les bornes qu'il porte, entier positif, UUID, code postal metropolitain, sont
des invariants de projet et non des decisions de cas d'usage. La limite a tenir :
si un schema doit interroger la base pour trancher, il n'a rien a faire ici.

**Ne jamais instancier `PrismaClient` ailleurs.** Le client exige un adaptateur
de pilote depuis Prisma 7, et l'instance est mise en cache pour survivre au
rechargement a chaud de Next.js. Une seconde instanciation ouvrirait un pool de
connexions concurrent, que la base finirait par refuser.

```ts
import { prisma } from "@/lib/prisma";
```
