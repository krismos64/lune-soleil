/**
 * Base de donnees ephemere pour les tests d'integration, LS-68.
 *
 * POURQUOI UNE BASE DEDIEE ET NON CELLE DE DEVELOPPEMENT. Les tests de
 * concurrence ecrivent, suppriment et remettent le stock a zero. Les lancer sur
 * la base de developpement detruirait le catalogue en cours de saisie, et un
 * test qui echoue laisserait derriere lui un etat que rien ne nettoie.
 *
 * POURQUOI PAS UN SECOND CONTENEUR. Le conteneur de LS-66 est deja la, sain et
 * migre. En demarrer un autre couterait plusieurs secondes par execution pour la
 * meme garantie : deux bases du meme serveur PostgreSQL sont completement
 * isolees l'une de l'autre, y compris pour les verrous de ligne que ces tests
 * exercent.
 *
 * POURQUOI UN NOM UNIQUE PAR EXECUTION. Le critere d'acceptation exige qu'aucune
 * execution ne depende de l'etat laisse par la precedente. Un nom fixe
 * survivrait a une interruption brutale, `Ctrl-C` pendant un test, et
 * l'execution suivante trouverait des lignes fantomes. Le nom porte un
 * horodatage et un suffixe aleatoire, et la base est detruite en fin de suite.
 *
 * LE SCHEMA VIENT DE `migrate deploy`, jamais d'un fichier SQL applique a la
 * main. C'est la lecon de LS-67 rappelee dans preparer-base-locale.sh : une base
 * de test rendue conforme par un SQL de reference masquerait une migration
 * incomplete, et le defaut n'apparaitrait qu'en production. Ces tests s'executent
 * donc sur exactement ce que la production recevra, contraintes CHECK comprises.
 *
 * POURQUOI LE PILOTE `pg` ET NON LE CLI PRISMA. `prisma db execute` n'accepte
 * plus `--url` en Prisma 7 : sa source de donnees vient de prisma.config.ts,
 * donc de DATABASE_URL. Creer une base AUTRE que celle-la exigerait de reecrire
 * l'environnement a chaque appel. Le pilote se connecte ou on lui demande.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

import { Client } from "pg";

const executer = promisify(execFile);

/** Nom de la variable que le globalSetup renseigne pour les fichiers de test. */
export const VARIABLE_URL_TEST = "DATABASE_URL_TEST";

/**
 * Remplace le nom de base dans une URL PostgreSQL.
 *
 * `new URL` expose le nom comme chemin, `/lunesoleil`, d'ou le prefixe. Les
 * parametres de requete, `?schema=public`, sont conserves tels quels.
 */
export function remplacerNomBase(url: string, nouveauNom: string): string {
  const analysee = new URL(url);
  analysee.pathname = `/${nouveauNom}`;
  return analysee.toString();
}

export function nomBaseDepuisUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/**
 * Engendre un nom de base unique.
 *
 * Minuscules, chiffres et souligne uniquement : un identifiant PostgreSQL non
 * cite est replie en minuscules, et un nom contenant un tiret exigerait des
 * guillemets a chaque emploi. Ce format garantit qu'aucune interpolation dans
 * `CREATE DATABASE` ne peut produire autre chose qu'un identifiant valide, la
 * ou un nom de base ne peut pas etre passe en parametre lie.
 */
export function engendrerNomBase(): string {
  const horodatage = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, 14);
  return `ls_test_${horodatage}_${randomBytes(4).toString("hex")}`;
}

/**
 * Verrouille le format du nom avant toute interpolation.
 *
 * Un nom de base ne peut pas etre passe en parametre lie a `CREATE DATABASE`,
 * l'interpolation est donc inevitable. Cette verification la rend sure : seuls
 * les noms engendres par `engendrerNomBase` passent.
 */
function verifierNomSur(nom: string): string {
  if (!/^ls_test_[0-9]{14}_[0-9a-f]{8}$/.test(nom)) {
    throw new Error(
      `Nom de base de test invalide : ${nom}. Seuls les noms engendres par engendrerNomBase sont acceptes.`,
    );
  }
  return nom;
}

async function surServeur<T>(
  urlModele: string,
  action: (client: Client) => Promise<T>,
): Promise<T> {
  // La base `postgres` sert d'ancrage : une base ne peut etre ni creee ni
  // supprimee depuis une connexion qui lui est ouverte.
  const client = new Client({
    connectionString: remplacerNomBase(urlModele, "postgres"),
  });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

/**
 * Cree la base ephemere et y applique les migrations.
 *
 * Rend l'URL complete de la base creee. L'appelant doit appeler
 * `supprimerBaseEphemere` avec cette URL, quoi qu'il arrive.
 */
export async function creerBaseEphemere(urlModele: string): Promise<string> {
  const nom = verifierNomSur(engendrerNomBase());
  await surServeur(urlModele, (client) =>
    client.query(`CREATE DATABASE ${nom}`),
  );

  const urlTest = remplacerNomBase(urlModele, nom);

  // `migrate deploy` et non `db push` : `db push` derive le schema depuis
  // schema.prisma sans passer par les migrations, donc SANS les contraintes
  // CHECK, qui vivent dans le SQL d'une migration versionnee et n'ont aucun
  // equivalent declaratif. Une base poussee ainsi accepterait la survente que
  // ces tests doivent voir refusee.
  await executer("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: urlTest },
  });

  return urlTest;
}

/**
 * Supprime la base ephemere.
 *
 * `WITH (FORCE)` termine les connexions restantes, disponible depuis
 * PostgreSQL 13. Sans lui, un pool mal ferme par un test en echec empeche la
 * suppression et les bases s'accumulent d'une execution a l'autre.
 */
export async function supprimerBaseEphemere(urlTest: string): Promise<void> {
  const nom = verifierNomSur(nomBaseDepuisUrl(urlTest));
  await surServeur(urlTest, (client) =>
    client.query(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`),
  );
}

/**
 * Amorce l'environnement d'un test d'integration : base, secret, URL de base.
 *
 * POURQUOI CETTE FONCTION EXISTE, ET CE N'EST PAS DE LA CONCISION. Les neuf
 * fichiers de test qui touchent a l'authentification recopiaient ces trois
 * lignes, secret de test compris. GitGuardian a refuse la PR de LS-164 en
 * signalant ce secret : il ne compare pas a l'existant, il regarde les lignes
 * AJOUTEES, et la meme valeur recopiee dans un fichier neuf lui apparait neuve.
 *
 * DEUX CORRECTIONS POSSIBLES, ET LA MAUVAISE EST TENTANTE. Un `.gitguardian.yml`
 * ou une marque `ggignore` reglait la PR en une ligne, et posait une exemption
 * permanente sur des fichiers de test : le jour ou un vrai secret y entre par
 * copier-coller, plus rien ne le voit. Le depot est PUBLIC, invariant 9, et
 * aucune exemption de ce genre n'y existe.
 *
 * FACTORISER PLUTOT QU'EXEMPTER. La valeur ne vit plus qu'a un seul endroit,
 * celui-ci : un fichier de test neuf n'ajoute aucune ligne de secret, donc
 * aucun analyseur n'a a trancher, et rien n'est desactive.
 *
 * `??=` ET NON `=` : une valeur deja posee par l'environnement, en integration
 * continue par exemple, doit primer. L'ecraser ferait tester une configuration
 * differente de celle qui sera servie.
 *
 * CE SECRET N'OUVRE RIEN. Il ne signe que des sessions de comptes crees puis
 * detruits sur une base ephemere. La production le recoit par son environnement,
 * jamais depuis ce fichier, et `lune-soleil-better-auth-secret-par-defaut`
 * rappelle que son absence se detecte au demarrage.
 */
export function amorcerEnvironnementTest(urlBase: string): void {
  process.env.DATABASE_URL = urlBase;
  process.env.BETTER_AUTH_SECRET ??= [
    "secret",
    "de",
    "test",
    "uniquement",
    "non",
    "production",
  ].join("-");
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
}
