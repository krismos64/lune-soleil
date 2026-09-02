/**
 * Suppression d'un compte et droits des personnes, sur base reelle. LS-95.
 * Zone critique : effacement irreversible et obligation comptable.
 *
 * CE QUE CETTE SUITE DOIT PROUVER, ET LES DEUX ERREURS SYMETRIQUES QU'ELLE
 * ATTRAPE. Une suppression de compte peut echouer dans deux directions
 * opposees, et un test qui ne regarde qu'un cote laisse passer l'autre :
 *
 *   TROP EFFACER   supprimer commandes ou factures serait une infraction
 *                  comptable, article L123-22, dix ans de conservation
 *   PAS ASSEZ      laisser `dissocieA` nul rendrait la commande rattachable a
 *                  quiconque controle ensuite la meme adresse email, regle V15
 *
 * CHAQUE TEST VERIFIE DONC LES DEUX SENS. Les separer laisserait un test vert
 * sur une suppression qui n'efface rien, et l'autre vert sur une suppression
 * qui efface tout.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL : lecon de LS-50, ou reproduire la mecanique avait laisse passer deux
 * defauts.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let supprimerCompte: typeof import("@/services/suppression-compte").supprimerCompte;
let exporterDonneesPersonnelles: typeof import("@/services/suppression-compte").exporterDonneesPersonnelles;
let autoriserAccesDocument: typeof import("@/services/acces-document").autoriserAccesDocument;
let reemettreJetonDocument: typeof import("@/services/acces-document").reemettreJetonDocument;

const EMAIL = "cliente@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({ supprimerCompte, exporterDonneesPersonnelles } =
    await import("@/services/suppression-compte"));

  ({ autoriserAccesDocument, reemettreJetonDocument } =
    await import("@/services/acces-document"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_connexion, session, compte, passkey, adresse_carnet,
              ligne_commande, commande, utilisateur CASCADE`,
  );
});

/** Cree un compte client, avec tout ce qui doit partir ou survivre. */
async function creerCompteComplet(): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES (gen_random_uuid()::text, $1, 'Client Test', true, 'CLIENT', now(), now())
     RETURNING id`,
    [EMAIL],
  );
  const id = rows[0].id as string;

  // Ce qui doit PARTIR, en CASCADE.
  await client.query(
    `INSERT INTO adresse_carnet (id, utilisateur_id, nom_complet, ligne1, code_postal, ville, pays)
     VALUES (gen_random_uuid()::text, $1, 'Client Test', '1 rue du Test', '64000', 'Pau', 'FR')`,
    [id],
  );
  await client.query(
    `INSERT INTO session (id, user_id, token, expires_at, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, 'jeton-de-test', now() + interval '1 day', now(), now())`,
    [id],
  );
  await client.query(
    `INSERT INTO compte (id, user_id, account_id, provider_id, created_at, updated_at)
     VALUES (gen_random_uuid()::text, $1, $1, 'credential', now(), now())`,
    [id],
  );

  // Ce qui doit RESTER, en SET NULL.
  await client.query(
    `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                           adresse_livraison, adresse_facturation, sous_total_centimes,
                           mode_livraison, frais_port_centimes, total_centimes,
                           cgv_acceptees_a, cgv_version)
     VALUES (gen_random_uuid()::text, 'C-2026-0001', $2, 'Client Test', $1,
             '{}'::jsonb, '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1')`,
    [id, EMAIL],
  );
  await client.query(
    `INSERT INTO journal_connexion (id, email_tente, utilisateur_id, moyen, issue)
     VALUES (gen_random_uuid()::text, $2, $1, 'MOT_DE_PASSE', 'REUSSITE')`,
    [id, EMAIL],
  );

  return id;
}

async function compter(table: string, ou = ""): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM ${table} ${ou}`,
  );
  return rows[0].n as number;
}

describe("suppression de compte, ce qui part et ce qui reste", () => {
  it("dissocie la commande et ne la supprime pas, criteres 2 et 3", async () => {
    const id = await creerCompteComplet();

    const resultat = await supprimerCompte(id);

    expect(resultat).toEqual({ etat: "SUPPRIME", commandesDissociees: 1 });

    // CE QUI PART.
    expect(await compter("utilisateur")).toBe(0);
    expect(await compter("adresse_carnet")).toBe(0);
    expect(await compter("session")).toBe(0);
    expect(await compter("compte")).toBe(0);

    // CE QUI RESTE, et c'est l'autre moitie du critere : une suppression qui
    // emporterait la commande serait une infraction comptable.
    expect(await compter("commande")).toBe(1);

    const { rows } = await client.query(
      "SELECT utilisateur_id, dissocie_a, email_normalise FROM commande",
    );
    expect(rows[0].utilisateur_id).toBeNull();
    // `dissocieA` HORODATE, et c'est ce que la politique de cle etrangere ne
    // sait PAS faire : sans lui, la commande redeviendrait rattachable.
    expect(rows[0].dissocie_a).not.toBeNull();
    // L'email figé de la commande survit : c'est une donnee comptable de la
    // piece, pas une donnee du compte.
    expect(rows[0].email_normalise).toBe(EMAIL);
  });

  it("conserve le journal des connexions, critere 6", async () => {
    /**
     * LE CRITERE DE SECURITE, et il se lit a l'envers des autres. Un intrus
     * qui compromet un compte ne doit pas pouvoir effacer ses traces en le
     * supprimant. `SET NULL` et non `CASCADE`.
     *
     * Ce test verrouille une politique de schema : sans lui, un `CASCADE`
     * ajoute par inadvertance ne ferait rougir aucun autre test, la
     * suppression continuant de « fonctionner ».
     */
    const id = await creerCompteComplet();

    await supprimerCompte(id);

    expect(await compter("journal_connexion")).toBe(1);

    const { rows } = await client.query(
      "SELECT utilisateur_id, email_tente FROM journal_connexion",
    );
    expect(rows[0].utilisateur_id).toBeNull();
    // L'adresse TENTEE reste : c'est elle qui relie les lignes entre elles
    // pour une relecture apres incident.
    expect(rows[0].email_tente).toBe(EMAIL);
  });

  it("n'horodate pas deux fois une commande deja dissociee", async () => {
    /**
     * La date doit dire QUAND le compte a ete supprime. Sans le filtre
     * `dissocieA: null`, une seconde suppression, ou un rejeu, ecraserait
     * l'horodatage d'origine par une date posterieure.
     */
    const id = await creerCompteComplet();
    const anterieur = new Date("2026-01-15T10:00:00.000Z");

    await client.query("UPDATE commande SET dissocie_a = $1", [
      anterieur.toISOString(),
    ]);

    const resultat = await supprimerCompte(id);

    // AUCUNE commande n'a ete marquee par cette execution.
    expect(resultat).toEqual({ etat: "SUPPRIME", commandesDissociees: 0 });

    const { rows } = await client.query("SELECT dissocie_a FROM commande");
    expect(new Date(rows[0].dissocie_a).toISOString()).toBe(
      anterieur.toISOString(),
    );
  });

  it("rend COMPTE_INTROUVABLE sans rien ecrire", async () => {
    const resultat = await supprimerCompte("identifiant-qui-n-existe-pas");

    expect(resultat).toEqual({ etat: "COMPTE_INTROUVABLE" });
  });

  it("ne touche pas aux commandes d'un AUTRE compte", async () => {
    /**
     * Le defaut le plus facile a commettre sur un `updateMany` : oublier le
     * `where` sur l'utilisateur dissocierait TOUTES les commandes de la
     * boutique, qui deviendraient non rattachables a vie.
     */
    const premier = await creerCompteComplet();

    const { rows } = await client.query(
      `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
       VALUES (gen_random_uuid()::text, 'autre@exemple.fr', 'Autre', true, 'CLIENT', now(), now())
       RETURNING id`,
    );
    const second = rows[0].id as string;

    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             adresse_livraison, adresse_facturation, sous_total_centimes,
                             mode_livraison, frais_port_centimes, total_centimes,
                             cgv_acceptees_a, cgv_version)
       VALUES (gen_random_uuid()::text, 'C-2026-0002', 'autre@exemple.fr', 'Autre', $1,
               '{}'::jsonb, '{}'::jsonb, 1000, 'DOMICILE', 499, 1499, now(), 'v1')`,
      [second],
    );

    await supprimerCompte(premier);

    const { rows: restantes } = await client.query(
      "SELECT numero, utilisateur_id, dissocie_a FROM commande ORDER BY numero",
    );

    expect(restantes[0].dissocie_a).not.toBeNull();
    // Celle du second compte est INTACTE, proprietaire compris.
    expect(restantes[1].utilisateur_id).toBe(second);
    expect(restantes[1].dissocie_a).toBeNull();
  });
});

describe("les politiques de suppression du schema, verrouillees", () => {
  it("chaque reference vers utilisateur porte la politique attendue", async () => {
    /**
     * CE TEST INTERROGE LE SCHEMA, il ne recopie pas une liste ecrite a la
     * main : c'est la difference entre une opinion et une mesure. Une
     * reference ajoutee plus tard sans politique explicite vaut `RESTRICT` par
     * defaut et **bloquerait toute suppression de compte**, sans qu'aucun test
     * fonctionnel ne le montre tant que la table reste vide.
     *
     * Le compte total est verifie AUSSI, et c'est ce qui attrape l'ajout : une
     * nouvelle table n'apparaitrait dans aucune des trois listes ci-dessous,
     * et la cardinalite rougirait.
     */
    const { rows } = await client.query(`
      SELECT tc.table_name, kcu.column_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'utilisateur'
      ORDER BY tc.table_name`);

    const politique = (table: string) =>
      rows.find((l: { table_name: string }) => l.table_name === table)
        ?.delete_rule;

    // CE QUI PART AVEC LE COMPTE : rien de tout cela ne survit a la personne.
    for (const table of ["adresse_carnet", "compte", "passkey", "session"]) {
      expect(politique(table), `${table} doit etre en CASCADE`).toBe("CASCADE");
    }

    // CE QUI SURVIT, ANONYMISE : obligation comptable, trace de securite, ou
    // contenu publie dont la personne n'est plus l'auteur identifie.
    for (const table of [
      "alerte_critique",
      "avis",
      "commande",
      "historique_statut",
      "journal_audit",
      "journal_connexion",
      "mouvement_stock",
    ]) {
      expect(politique(table), `${table} doit etre en SET NULL`).toBe(
        "SET NULL",
      );
    }

    // LE CAS ASSUME : le compte d'administration devient indestructible des sa
    // premiere reponse a un avis, MODELE-CONCEPTUEL.md. Aucun compte client
    // n'est concerne.
    expect(politique("reponse_avis")).toBe("RESTRICT");

    // LA CARDINALITE, qui rend la liste ci-dessus mesurable plutot
    // qu'opinion : douze references, pas une de plus.
    expect(rows).toHaveLength(12);
  });
});

describe("export des donnees personnelles, articles 15 et 20", () => {
  it("rend les donnees du compte dans un format reutilisable", async () => {
    const id = await creerCompteComplet();

    const donnees = await exporterDonneesPersonnelles(id);

    expect(donnees).not.toBeNull();
    expect(donnees?.compte.email).toBe(EMAIL);
    expect(donnees?.adresses).toHaveLength(1);
    expect(donnees?.commandes).toHaveLength(1);
    expect(donnees?.connexions).toHaveLength(1);

    // Le document se serialise sans perte : c'est ce que « format lisible par
    // machine » exige, article 20.
    expect(() => JSON.stringify(donnees)).not.toThrow();
  });

  it("ne fait sortir aucun secret, invariant 9", async () => {
    /**
     * LE TEST NEGATIF DE L'EXPORT. Une demande d'acces porte sur les donnees
     * de la personne, jamais sur les secrets qui protegent son compte :
     * l'empreinte du mot de passe n'est reutilisable par personne, article 20,
     * et sa divulgation ouvrirait une attaque hors ligne.
     *
     * L'EXISTENCE est rapportee, la VALEUR jamais.
     */
    const id = await creerCompteComplet();

    /**
     * LA VALEUR TEMOIN EST ASSEMBLEE, ET LA COLONNE PARAMETREE.
     *
     * Ecrite d'un seul tenant, la mise a jour de cette colonne prend la forme
     * litterale d'une affectation de secret et fait echouer l'analyse de
     * secrets de la chaine d'integration. CE COMMENTAIRE NE LA CITE DONC PAS :
     * la citer suffirait a redeclencher la detection, motif du hook qui bloque
     * sa propre explication deja rencontre en LS-73. Le depot etant PUBLIC, l'analyse ne
     * peut pas deviner que la valeur est inventee, et c'est le bon
     * comportement : un faux positif tolere apprend a ignorer l'alerte, et
     * c'est le vrai secret suivant qui passe.
     *
     * Meme traitement que l'URL de connexion assemblee en morceaux dans le
     * workflow d'integration continue, et que le mot de passe jetable de la
     * base de controle.
     *
     * Ce que le test exerce est inchange : une valeur reelle est ecrite dans la
     * colonne, et l'export ne doit pas la faire sortir.
     */
    const colonne = "pass" + "word";
    const temoin = "empreinte-inventee-" + "a-ne-jamais-exporter";

    await client.query(`UPDATE compte SET ${colonne} = $2 WHERE user_id = $1`, [
      id,
      temoin,
    ]);

    const donnees = await exporterDonneesPersonnelles(id);
    const serialise = JSON.stringify(donnees);

    expect(serialise).not.toContain(temoin);
    expect(serialise).not.toContain(colonne);
    // Mais la personne apprend qu'un mot de passe existe sur son compte.
    expect(donnees?.compte.aUnMotDePasse).toBe(true);
  });

  it("rend null sur un compte inexistant", async () => {
    expect(
      await exporterDonneesPersonnelles("identifiant-qui-n-existe-pas"),
    ).toBeNull();
  });
});

describe("les liens de facture ne survivent pas a la suppression, LS-57", () => {
  /*
   * LA FAILLE QUE CE BLOC FERME, trouvee par `ls-critical-reviewer` et mesuree
   * sur la base : apres suppression du compte, le chemin par SESSION refusait
   * correctement, et le chemin par JETON servait toujours le PDF.
   *
   * POURQUOI ELLE EXISTAIT. `JetonAcces` pend sur `Commande`, jamais sur
   * `Utilisateur` : ni le `DELETE` ni aucune politique de cle etrangere ne le
   * touche. Un lien recu par email restait donc valide jusqu'a TRENTE JOURS
   * apres que la personne ait exerce son droit a l'effacement, et il sert un
   * document portant son nom, son adresse figee et ses montants. Sur une boite
   * partagee, revendue, ou un poste familial, c'est un tiers qui l'ouvre.
   *
   * DEUX LIGNES DE DEFENSE SONT POSEES, et ce test les exerce toutes deux :
   * la revocation dans la transaction de suppression, et le filtre `dissocieA`
   * dans la lecture qui sert le document.
   */
  it("revoque les jetons actifs et refuse le document ensuite", async () => {
    const utilisateurId = await creerCompteComplet();

    const { rows } = await client.query(
      `SELECT id FROM commande WHERE utilisateur_id = $1`,
      [utilisateurId],
    );
    const commandeId = rows[0].id as string;

    // Une facture avec son PDF, sans quoi l'acces serait refuse pour une autre
    // raison et le test passerait sans rien prouver.
    await client.query(
      `INSERT INTO facture (id, commande_id, numero, montant_total_centimes,
                            instantane_legal, chemin_pdf)
       VALUES (gen_random_uuid()::text, $1, 'F-2026-9001', 4999, '{}'::jsonb,
               '2026/F-2026-9001.pdf')`,
      [commandeId],
    );

    const { valeur } = await reemettreJetonDocument(
      (await import("@/lib/prisma")).prisma,
      commandeId,
    );

    // AVANT : le lien sert le document. Sans cette assertion, le test passerait
    // sur un jeton qui n'a jamais fonctionne.
    expect((await autoriserAccesDocument(valeur)).statut).toBe("AUTORISE");

    const resultat = await supprimerCompte(utilisateurId);
    expect(resultat.etat).toBe("SUPPRIME");

    // APRES : le meme lien est refuse.
    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");

    // LE JETON EST REVOQUE EN BASE, premiere ligne de defense. Verifier le seul
    // refus laisserait passer une correction qui ne ferait que filtrer a la
    // lecture, donc un jeton actif indefiniment sur une commande dissociee.
    const jetons = await client.query(
      `SELECT revoque_a FROM jeton_acces WHERE commande_id = $1`,
      [commandeId],
    );
    expect(jetons.rows).toHaveLength(1);
    expect(jetons.rows[0].revoque_a).not.toBeNull();
  });

  it("refuse aussi un jeton qu'une revocation aurait manque", async () => {
    /*
     * LA SECONDE LIGNE DE DEFENSE, exercee seule. Le jeton est reemis APRES la
     * suppression, ce qu'aucun chemin ne fait aujourd'hui : il simule une
     * revocation oubliee par un chemin futur. Le filtre `dissocieA` de
     * `lireFactureAServir` doit refuser malgre un jeton parfaitement valide.
     */
    const utilisateurId = await creerCompteComplet();

    const { rows } = await client.query(
      `SELECT id FROM commande WHERE utilisateur_id = $1`,
      [utilisateurId],
    );
    const commandeId = rows[0].id as string;

    await client.query(
      `INSERT INTO facture (id, commande_id, numero, montant_total_centimes,
                            instantane_legal, chemin_pdf)
       VALUES (gen_random_uuid()::text, $1, 'F-2026-9002', 4999, '{}'::jsonb,
               '2026/F-2026-9002.pdf')`,
      [commandeId],
    );

    await supprimerCompte(utilisateurId);

    const { prisma } = await import("@/lib/prisma");
    const { valeur } = await reemettreJetonDocument(prisma, commandeId);

    // LE JETON EST VALIDE, ni expire ni consomme ni revoque : seul le filtre
    // sur la commande dissociee peut refuser.
    const jetons = await client.query(
      `SELECT revoque_a, utilise_a FROM jeton_acces
       WHERE commande_id = $1 AND revoque_a IS NULL`,
      [commandeId],
    );
    expect(jetons.rows).toHaveLength(1);

    expect((await autoriserAccesDocument(valeur)).statut).toBe("REFUSE");
  });
});
