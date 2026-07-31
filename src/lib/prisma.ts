/**
 * Point d'entree unique vers la base. Tout acces aux donnees passe par ce
 * client, jamais par une instanciation locale de `PrismaClient`.
 *
 * POURQUOI UN ADAPTATEUR. Le generateur `prisma-client` de Prisma 7 n'embarque
 * plus de moteur Rust : la connexion est deleguee a un vrai pilote PostgreSQL,
 * `@prisma/adapter-pg`. Sans lui, l'instanciation echoue immediatement sur
 * « A driver adapter is required to connect to your database ».
 *
 * POURQUOI UNE INSTANCE UNIQUE. En developpement, le rechargement a chaud de
 * Next.js reevalue ce module a chaque modification. Sans le cache porte par
 * `globalThis`, chaque rechargement ouvrirait un nouveau pool de connexions et
 * la base finirait par les refuser, `too many clients already`. Le cache ne sert
 * qu'au developpement : en production le module n'est evalue qu'une fois.
 *
 * L'import vient de `@/generated/prisma/client` et non de `@prisma/client` : le
 * client est desormais engendre dans le depot, `prisma/schema.prisma` portant
 * le chemin de sortie.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const urlBase = process.env.DATABASE_URL;

// Echec au demarrage plutot qu'a la premiere requete. Une URL absente decouverte
// au moment d'une commande client produirait une erreur inexploitable, loin de
// sa cause.
if (!urlBase) {
  throw new Error(
    "DATABASE_URL absente. La renseigner dans .env, voir .env.example.",
  );
}

const creerClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlBase }),
  });

// `globalThis` n'est pas type pour cette propriete, d'ou l'elargissement local.
const cacheGlobal = globalThis as typeof globalThis & {
  prisma?: ReturnType<typeof creerClient>;
};

export const prisma = cacheGlobal.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") {
  cacheGlobal.prisma = prisma;
}
