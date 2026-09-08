/**
 * Promotion du compte d'administration de l'exploitante, LS-175.
 *
 * FICHIER SEPARE DU SCRIPT SHELL, et ce n'est pas un decoupage de confort : le
 * SQL et le shell ont des regles de citation incompatibles, et imbriquer l'un
 * dans l'autre a produit un script syntaxiquement casse a la premiere ecriture.
 *
 * IL NE PREND AUCUNE URL EN ARGUMENT. Une chaine de connexion en argument porte
 * le mot de passe, lisible par tout `ps` sur la machine : le processus lit
 * `.env` lui-meme, et le hook de secrets de ce depot refuse l'autre forme.
 *
 * SA SORTIE EST UNE LIGNE A CHAMPS, lue par le shell appelant. Un format stable
 * vaut mieux qu'une prose que l'appelant devrait analyser.
 */
import { Client } from "pg";
import "dotenv/config";

const email = process.env.EMAIL_CIBLE;
const verifierSeulement = process.env.MODE_VERIFICATION === "1";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  /*
   * LE COMPTE DOIT EXISTER, ET LE REFUS EST EXPLICITE, critere 2 du ticket :
   * « refuse d'agir si l'adresse visee n'existe pas plutot que de rendre un
   * succes silencieux ».
   *
   * UN `UPDATE` SUR UNE ADRESSE ABSENTE TOUCHE ZERO LIGNE ET NE LEVE PAS : sans
   * cette lecture prealable, le script annoncerait une promotion qui n'a jamais
   * eu lieu, et l'ouverture partirait sur une administration inaccessible.
   */
  const { rows: cibles } = await client.query(
    "SELECT id, role, email_verifie FROM utilisateur WHERE email = $1",
    [email],
  );

  if (cibles.length === 0) {
    console.log("ABSENT");
  } else if (verifierSeulement) {
    const cible = cibles[0];
    console.log(
      [
        "ETAT",
        cible.role,
        cible.email_verifie ? "verifie" : "non-verifie",
      ].join("|"),
    );
  } else {
    /*
     * RETROGRADER D'ABORD, PROMOUVOIR ENSUITE, DANS UNE SEULE TRANSACTION.
     *
     * `utilisateur_administratrice_unique` est un index partiel, regle E1 : il
     * n'admet QU'UNE ligne dont le role vaut ADMINISTRATRICE. Promouvoir sans
     * liberer la place leve donc sur toute base en portant deja une.
     *
     * LA TRANSACTION EST INDISPENSABLE. Deux instructions separees laisseraient
     * une fenetre SANS AUCUNE administratrice : si la seconde echoue,
     * l'administration devient inaccessible et plus rien ne permet de la rouvrir
     * par ce chemin. C'est le motif « index partiel et ordre des ecritures »,
     * deja rencontre sur ce depot.
     */
    await client.query("BEGIN");

    /*
     * LA CLAUSE NOMME SA CIBLE, critere 3 : elle retrograde tout compte QUI
     * N'EST PAS celui vise. Un `UPDATE` sans filtre retirerait son role au
     * compte reel, en silence, alors que ce script existe pour le poser.
     */
    const { rowCount: retrogrades } = await client.query(
      `UPDATE utilisateur SET role = 'CLIENT'
        WHERE role = 'ADMINISTRATRICE' AND email <> $1`,
      [email],
    );

    const { rowCount: promus } = await client.query(
      `UPDATE utilisateur SET role = 'ADMINISTRATRICE', email_verifie = true
        WHERE email = $1`,
      [email],
    );

    await client.query("COMMIT");

    /*
     * LA PROMOTION EST VERIFIEE PAR UNE LECTURE, critere 4, et non deduite du
     * compte de lignes : une relecture APRES validation prouve l'etat reel, la
     * ou `rowCount` prouve seulement qu'une instruction a porte.
     */
    const { rows: apres } = await client.query(
      "SELECT role, email_verifie FROM utilisateur WHERE email = $1",
      [email],
    );

    console.log(
      ["FAIT", retrogrades, promus, apres[0].role, apres[0].email_verifie].join(
        "|",
      ),
    );
  }
} catch (erreur) {
  await client.query("ROLLBACK").catch(() => {});
  console.log("ERREUR|" + erreur.message);
} finally {
  await client.end();
}
