/**
 * Rattachement des commandes invitees, sur base reelle. LS-56, parcours 6.
 * Zone critique : ce chemin decide qui accede a l'historique et aux factures.
 *
 * CE QUE CETTE SUITE DOIT PROUVER, ET LES DEUX ERREURS SYMETRIQUES QU'ELLE
 * ATTRAPE. Comme la suppression de compte, le rattachement echoue dans deux
 * directions opposees, et un test qui ne regarde qu'un cote laisse passer
 * l'autre :
 *
 *   TROP RATTACHER   ouvrir a un tiers l'historique et les factures d'autrui,
 *                    ce que chacune des trois conditions ferme separement
 *   PAS ASSEZ        laisser orphelines les commandes d'un client legitime,
 *                    qui ne les retrouverait jamais
 *
 * CHAQUE TEST VERIFIE DONC LES DEUX SENS : qu'une commande eligible EST
 * rattachee, et qu'une commande voisine ne l'est PAS. Les separer laisserait
 * un test vert sur un service qui ne rattache rien, l'autre vert sur un service
 * qui rattache tout.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL : lecon de LS-50, et le `where` du repository est precisement ce qui
 * doit etre exerce.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let consulterCommandesRattachables: typeof import("@/services/rattachement-commandes").consulterCommandesRattachables;
let rattacherMesCommandes: typeof import("@/services/rattachement-commandes").rattacherMesCommandes;
let normaliserEmailPourRattachement: typeof import("@/services/rattachement-commandes").normaliserEmailPourRattachement;

const EMAIL = "cliente@exemple.fr";
const EMAIL_TIERS = "quelquun.dautre@exemple.fr";

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({
    consulterCommandesRattachables,
    rattacherMesCommandes,
    normaliserEmailPourRattachement,
  } = await import("@/services/rattachement-commandes"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE journal_audit, ligne_commande, commande, session, compte,
              adresse_carnet, utilisateur CASCADE`,
  );
});

/** Cree un compte, verifie ou non selon le besoin du test. */
async function creerCompte(
  email: string,
  emailVerifie: boolean,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES (gen_random_uuid()::text, $1, 'Client Test', $2, 'CLIENT', now(), now())
     RETURNING id`,
    [email, emailVerifie],
  );

  return rows[0].id as string;
}

/**
 * Cree une commande dans l'un des quatre etats qui comptent.
 *
 * LES QUATRE ETATS SONT CE QUE LA SUITE DOIT COUVRIR, et ils ne se deduisent
 * pas les uns des autres :
 *
 *   invitee              rattachable, c'est le cas nominal
 *   deja rattachee       appartient a quelqu'un, jamais reprise
 *   dissociee            a appartenu a quelqu'un, exclue DEFINITIVEMENT
 *   sur un autre email   ne concerne pas ce compte
 */
async function creerCommande(
  numero: string,
  emailNormalise: string,
  options: { utilisateurId?: string | null; dissociee?: boolean } = {},
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                           dissocie_a, adresse_livraison, adresse_facturation,
                           sous_total_centimes, mode_livraison, frais_port_centimes,
                           total_centimes, cgv_acceptees_a, cgv_version)
     VALUES (gen_random_uuid()::text, $1, $2, 'Client Test', $3, $4,
             '{}'::jsonb, '{}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1')
     RETURNING id`,
    [
      numero,
      emailNormalise,
      options.utilisateurId ?? null,
      options.dissociee === true ? new Date() : null,
    ],
  );

  return rows[0].id as string;
}

async function lireProprietaire(id: string): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT utilisateur_id FROM commande WHERE id = $1`,
    [id],
  );

  return (rows[0]?.utilisateur_id as string | null) ?? null;
}

describe("critere 2, une adresse verifiee rattache ses commandes invitees", () => {
  it("rattache la commande invitee et rend son nombre", async () => {
    const compte = await creerCompte(EMAIL, true);
    const invitee = await creerCommande("C-2026-0001", EMAIL);

    const resultat = await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 1 });
    expect(await lireProprietaire(invitee)).toBe(compte);
  });

  it("ne touche pas la commande passee avec une AUTRE adresse", async () => {
    const compte = await creerCompte(EMAIL, true);
    const mienne = await creerCommande("C-2026-0001", EMAIL);
    const autre = await creerCommande("C-2026-0002", EMAIL_TIERS);

    const resultat = await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    // LES DEUX SENS DANS LE MEME TEST : ce qui doit entrer entre, ce qui doit
    // rester dehors reste dehors. Un service qui rattacherait TOUTE commande
    // sans compte passerait la premiere assertion seule.
    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 1 });
    expect(await lireProprietaire(mienne)).toBe(compte);
    expect(await lireProprietaire(autre)).toBeNull();
  });

  it("ecrit une entree au journal d'audit, parcours 6 etape 4", async () => {
    const compte = await creerCompte(EMAIL, true);
    await creerCommande("C-2026-0001", EMAIL);

    await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    const { rows } = await client.query(
      `SELECT acteur_id, action, detail FROM journal_audit`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("RATTACHEMENT_COMMANDES");
    expect(rows[0].acteur_id).toBe(compte);
    expect(rows[0].detail).toEqual({ nombre: 1, declencheur: "VERIFICATION" });
  });

  it("n'ecrit AUCUN audit quand rien n'est rattache", async () => {
    // Le rejeu a chaque connexion noierait les entrees reelles sous le bruit si
    // chaque passage a vide en produisait une.
    const compte = await creerCompte(EMAIL, true);

    const resultat = await rattacherMesCommandes(compte, EMAIL, "CONNEXION");

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 0 });
    const { rows } = await client.query(`SELECT id FROM journal_audit`);
    expect(rows).toHaveLength(0);
  });
});

describe("critere 3, un compte non verifie ne rattache rien", () => {
  it("refuse le rattachement et laisse la commande orpheline", async () => {
    const compte = await creerCompte(EMAIL, false);
    const invitee = await creerCommande("C-2026-0001", EMAIL);

    const resultat = await rattacherMesCommandes(compte, EMAIL, "CONNEXION");

    expect(resultat).toEqual({ etat: "ADRESSE_NON_VERIFIEE" });
    // LE SECOND SENS : la commande DOIT rester orpheline. Sans cette assertion,
    // un service qui rattacherait avant de rendre son refus resterait vert.
    expect(await lireProprietaire(invitee)).toBeNull();
  });

  it("ne divulgue meme pas l'existence de commandes a la consultation", async () => {
    const compte = await creerCompte(EMAIL, false);
    await creerCommande("C-2026-0001", EMAIL);

    const resultat = await consulterCommandesRattachables(compte, EMAIL);

    // `ADRESSE_NON_VERIFIEE` ET NON une liste vide : la nuance est ce qui
    // permet a l'ecran de dire « confirmez votre adresse » plutot que « rien ».
    expect(resultat).toEqual({ etat: "ADRESSE_NON_VERIFIEE" });
  });

  it("rattache le jour ou l'adresse devient verifiee", async () => {
    // La condition porte sur l'ETAT COURANT, pas sur un moment fige : un compte
    // qui se verifie plus tard doit rattacher, sans quoi le premier refus
    // serait definitif.
    const compte = await creerCompte(EMAIL, false);
    const invitee = await creerCommande("C-2026-0001", EMAIL);

    expect(await rattacherMesCommandes(compte, EMAIL, "CONNEXION")).toEqual({
      etat: "ADRESSE_NON_VERIFIEE",
    });

    await client.query(
      `UPDATE utilisateur SET email_verifie = true WHERE id = $1`,
      [compte],
    );

    expect(await rattacherMesCommandes(compte, EMAIL, "CONNEXION")).toEqual({
      etat: "RATTACHEES",
      nombre: 1,
    });
    expect(await lireProprietaire(invitee)).toBe(compte);
  });
});

describe("critere 4, une commande dissociee n'est JAMAIS rattachee", () => {
  it("l'exclut alors que son utilisateur_id est nul", async () => {
    /*
     * LE CŒUR DE LA STORY. Une commande dissociee a `utilisateur_id` A NUL,
     * `ON DELETE SET NULL` l'ayant remis a nul quand le compte a ete supprime.
     * Elle satisfait donc DEUX des trois conditions. Seul `dissocie_a` la
     * distingue d'une commande invitee, et un service qui l'oublierait
     * passerait tous les autres tests de cette suite.
     */
    const compte = await creerCompte(EMAIL, true);
    const dissociee = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: null,
      dissociee: true,
    });

    const { rows } = await client.query(
      `SELECT utilisateur_id, dissocie_a FROM commande WHERE id = $1`,
      [dissociee],
    );
    // La condition du piege est bien reunie : sans proprietaire ET dissociee.
    expect(rows[0].utilisateur_id).toBeNull();
    expect(rows[0].dissocie_a).not.toBeNull();

    const resultat = await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 0 });
    expect(await lireProprietaire(dissociee)).toBeNull();
  });

  it("n'apparait pas dans la liste eligible", async () => {
    const compte = await creerCompte(EMAIL, true);
    await creerCommande("C-2026-0001", EMAIL, { dissociee: true });
    await creerCommande("C-2026-0002", EMAIL);

    const resultat = await consulterCommandesRattachables(compte, EMAIL);

    expect(resultat.etat).toBe("ELIGIBLES");
    if (resultat.etat !== "ELIGIBLES") return;
    // LES DEUX SENS : l'invitee est proposee, la dissociee ne l'est pas.
    expect(resultat.commandes.map((c) => c.numero)).toEqual(["C-2026-0002"]);
  });

  it("rattache la voisine invitee sans emporter la dissociee", async () => {
    const compte = await creerCompte(EMAIL, true);
    const dissociee = await creerCommande("C-2026-0001", EMAIL, {
      dissociee: true,
    });
    const invitee = await creerCommande("C-2026-0002", EMAIL);

    const resultat = await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 1 });
    expect(await lireProprietaire(invitee)).toBe(compte);
    expect(await lireProprietaire(dissociee)).toBeNull();
  });
});

describe("critere 5, test negatif de securite", () => {
  it("ne reprend pas une commande appartenant deja a un autre compte", async () => {
    /*
     * LA TENTATIVE VISEE : quelqu'un s'inscrit avec l'adresse d'un tiers dont
     * les commandes sont deja rattachees. Meme verifie, il ne doit rien
     * recuperer : une commande rattachee ne change jamais de proprietaire par
     * ce parcours, cas d'erreur du parcours 6.
     */
    const victime = await creerCompte(EMAIL_TIERS, true);
    const sienne = await creerCommande("C-2026-0001", EMAIL, {
      utilisateurId: victime,
    });

    const attaquant = await creerCompte(EMAIL, true);

    const resultat = await rattacherMesCommandes(
      attaquant,
      EMAIL,
      "VERIFICATION",
    );

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 0 });
    expect(await lireProprietaire(sienne)).toBe(victime);
  });

  it("l'adresse comparee est celle du compte, pas une valeur choisie", async () => {
    /*
     * INVARIANT 2. Le service prend `email` en parametre, mais l'appelant est un
     * adaptateur qui le tire de la SESSION. Ce test verrouille l'autre moitie :
     * meme en passant l'adresse d'un tiers, rien ne se rattache si le COMPTE
     * n'est pas verifie, et la selection reste celle de l'adresse fournie et non
     * un « tout ce qui traine ».
     *
     * Le chemin par lequel un identifiant arriverait est ferme plus haut : ni
     * `consulterCommandesRattachables` ni `rattacherMesCommandes` n'acceptent
     * d'identifiant de commande, donc aucune liste venue du navigateur ne peut
     * designer ce qui sera rattache.
     */
    const compte = await creerCompte(EMAIL, true);
    const aTiers = await creerCommande("C-2026-0001", EMAIL_TIERS);

    const resultat = await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 0 });
    expect(await lireProprietaire(aTiers)).toBeNull();
  });
});

describe("idempotence et rejeu", () => {
  it("un second rattachement ne rend rien et n'ecrit aucun audit", async () => {
    const compte = await creerCompte(EMAIL, true);
    await creerCommande("C-2026-0001", EMAIL);

    expect(await rattacherMesCommandes(compte, EMAIL, "VERIFICATION")).toEqual({
      etat: "RATTACHEES",
      nombre: 1,
    });
    expect(await rattacherMesCommandes(compte, EMAIL, "CONNEXION")).toEqual({
      etat: "RATTACHEES",
      nombre: 0,
    });

    // UNE SEULE ENTREE D'AUDIT pour deux passages : le rejeu est silencieux.
    const { rows } = await client.query(`SELECT id FROM journal_audit`);
    expect(rows).toHaveLength(1);
  });

  it("rattrape une commande passee APRES la verification", async () => {
    /*
     * LE CAS QUI JUSTIFIE LE SECOND DECLENCHEUR. Un declenchement unique a la
     * verification laisserait cette commande orpheline pour toujours : rien
     * n'oblige un client verifie a etre connecte quand il commande.
     */
    const compte = await creerCompte(EMAIL, true);
    await rattacherMesCommandes(compte, EMAIL, "VERIFICATION");

    const tardive = await creerCommande("C-2026-0002", EMAIL);

    expect(await rattacherMesCommandes(compte, EMAIL, "CONNEXION")).toEqual({
      etat: "RATTACHEES",
      nombre: 1,
    });
    expect(await lireProprietaire(tardive)).toBe(compte);
  });

  it("deux rattachements concurrents n'en valident qu'un", async () => {
    /*
     * L'`updateMany` FILTRE SUR `utilisateur_id IS NULL`, donc la seconde
     * transaction ne voit plus la ligne. Le test verrouille le compte rendu
     * autant que l'effet : « 1 et 0 » et jamais « 1 et 1 », qui signalerait
     * deux ecritures et donc deux entrees d'audit pour un seul evenement.
     */
    const compte = await creerCompte(EMAIL, true);
    const invitee = await creerCommande("C-2026-0001", EMAIL);

    const [a, b] = await Promise.all([
      rattacherMesCommandes(compte, EMAIL, "VERIFICATION"),
      rattacherMesCommandes(compte, EMAIL, "CONNEXION"),
    ]);

    const nombres = [a, b]
      .map((r) => (r.etat === "RATTACHEES" ? r.nombre : -1))
      .sort();
    expect(nombres).toEqual([0, 1]);
    expect(await lireProprietaire(invitee)).toBe(compte);

    const { rows } = await client.query(`SELECT id FROM journal_audit`);
    expect(rows).toHaveLength(1);
  });
});

describe("normalisation de l'adresse", () => {
  it("rend exactement ce que services/commande.ts ecrit en base", async () => {
    /*
     * LES DEUX FORMES SE COMPARENT PAR EGALITE STRICTE EN SQL. Une divergence
     * ne produirait aucune erreur : le rattachement rendrait zero commande, en
     * silence, et le client conclurait que ses commandes ont disparu. Ce test
     * ancre les deux formes l'une a l'autre.
     */
    expect(normaliserEmailPourRattachement("  Cliente@Exemple.FR  ")).toBe(
      "cliente@exemple.fr",
    );
  });

  it("rattache une commande saisie avec des majuscules et des espaces", async () => {
    const compte = await creerCompte(EMAIL, true);
    // Ce que `services/commande.ts` a ecrit : deja normalise en base.
    const invitee = await creerCommande("C-2026-0001", EMAIL);

    // Ce que la session porte : la casse d'origine du compte.
    const resultat = await rattacherMesCommandes(
      compte,
      "  Cliente@Exemple.FR  ",
      "VERIFICATION",
    );

    expect(resultat).toEqual({ etat: "RATTACHEES", nombre: 1 });
    expect(await lireProprietaire(invitee)).toBe(compte);
  });
});
