/**
 * Contrôle des comptes avant ouverture, LS-175 critère 10.
 *
 * MODULE SEPARE DU SHELL, meme motif que l'amorcage : le SQL et le shell ont des
 * regles de citation incompatibles, et les imbriquer produit un script casse.
 */
import { Client } from "pg";
import "dotenv/config";

const emailAttendu = process.env.EMAIL_ATTENDU || "";

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const anomalies = [];

try {
  /*
   * SENS 1 : EXACTEMENT UNE ADMINISTRATRICE.
   *
   * L'index partiel `utilisateur_administratrice_unique` rend « deux »
   * impossible, regle E1. Le controle le MESURE quand meme plutot que de le
   * supposer : un index peut etre absent d'une base restauree autrement que par
   * les migrations, et c'est precisement le genre d'ecart qu'une ouverture doit
   * voir.
   */
  const { rows: administratrices } = await client.query(
    "SELECT email FROM utilisateur WHERE role = 'ADMINISTRATRICE' ORDER BY email",
  );

  if (administratrices.length === 0) {
    anomalies.push(
      "aucun compte ne porte le rôle d'administration : l'administration serait inaccessible",
    );
  } else if (administratrices.length > 1) {
    anomalies.push(
      `${administratrices.length} comptes portent le rôle d'administration : ` +
        administratrices.map((l) => l.email).join(", "),
    );
  } else if (emailAttendu && administratrices[0].email !== emailAttendu) {
    anomalies.push(
      `l'administratrice est « ${administratrices[0].email} » et non « ${emailAttendu} »`,
    );
  }

  /*
   * SENS 2 : AUCUN COMPTE DE TEST.
   *
   * Les deux motifs correspondent aux fixtures de la suite de bout en bout,
   * `e2e-...@exemple.test`. Sur une base de production, chacun est un moyen
   * d'acces dont personne ne surveille le mot de passe.
   *
   * LE MOTIF PORTE SUR L'ADRESSE ENTIERE et non sur le seul prefixe : une
   * fixture future pourrait employer `@exemple.test` sans prefixe `e2e-`.
   */
  const { rows: comptesTest } = await client.query(
    `SELECT email FROM utilisateur
      WHERE email LIKE 'e2e-%' OR email LIKE '%@exemple.test'
      ORDER BY email`,
  );

  if (comptesTest.length > 0) {
    anomalies.push(
      `${comptesTest.length} compte(s) de test subsistent : ` +
        comptesTest.map((l) => l.email).join(", "),
    );
  }

  if (anomalies.length === 0) {
    const nom = administratrices[0]?.email ?? "(aucune)";
    console.log(
      `OK une seule administratrice, ${nom}, et aucun compte de test`,
    );
  } else {
    console.log(`ECHEC ${anomalies.length} anomalie(s) :`);
    for (const anomalie of anomalies) {
      console.log(`  - ${anomalie}`);
    }
  }
} finally {
  await client.end();
}
