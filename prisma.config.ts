// Configuration du CLI Prisma, LS-66.
//
// Prisma 7 a retire `url` du bloc `datasource` de schema.prisma : la chaine de
// connexion se declare ici. Sans ce fichier, `prisma migrate dev` ne demarre
// pas. Verifie sur la documentation Prisma 7.9.1 via Context7.
//
// L'import de dotenv n'est pas decoratif. Le CLI Prisma 7 ne lit plus .env
// automatiquement : sans cette ligne, DATABASE_URL est indefinie et toute
// commande de migration echoue sur une erreur de connexion trompeuse.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    // Les migrations generees vivent a cote du dossier `manual/`, qui porte les
    // contraintes CHECK et l'unicite differable que Prisma ne sait pas
    // exprimer. Ce dossier `manual/` n'est pas une migration : Prisma l'ignore,
    // il ne contient aucun sous-dossier horodate avec un migration.sql.
    path: "prisma/migrations",
  },

  datasource: {
    // `env()` echoue explicitement si la variable manque, la ou
    // `process.env.DATABASE_URL` passerait une valeur indefinie plus loin.
    url: env<Env>("DATABASE_URL"),
  },
});
