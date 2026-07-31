# lib/

Infrastructure technique transverse, sans logique metier.

## Ce qui entre ici

- la connexion a la base, `prisma.ts`, point d'entree unique du client
- les utilitaires purs sans dependance de domaine : formatage de montants en
  centimes, conversion d'horodatage UTC vers Europe/Paris a l'affichage

## Ce qui n'entre pas

- une requete, qui appartient a `repositories/`
- une regle metier, qui appartient a `services/`
- un appel a un fournisseur externe, Stripe, email ou medias, qui appartient a
  `integrations/`

## Point de vigilance

**Ne jamais instancier `PrismaClient` ailleurs.** Le client exige un adaptateur
de pilote depuis Prisma 7, et l'instance est mise en cache pour survivre au
rechargement a chaud de Next.js. Une seconde instanciation ouvrirait un pool de
connexions concurrent, que la base finirait par refuser.

```ts
import { prisma } from "@/lib/prisma";
```
