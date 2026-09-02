/**
 * Carnet d'adresses, sur base reelle. LS-59, parcours 8.
 * Zone critique : autorisation et donnees personnelles.
 *
 * CE QUE CETTE SUITE DOIT PROUVER, ET LES DEUX ERREURS SYMETRIQUES :
 *
 *   TROP OUVRIR   modifier ou lire l'adresse d'un tiers, ce que le couple
 *                 (id, utilisateurId) ferme dans chaque `where`
 *   PAS ASSEZ     empecher un client de gerer SON carnet, ou pire, le laisser
 *                 sans adresse par defaut apres une bascule refusee
 *
 * LE CRITERE 3 EXIGE LA BASCULE DANS LES DEUX SENS, et c'est la que le piege
 * vit : `adresse_defaut_unique` est un INDEX PARTIEL, donc non differable, donc
 * verifie LIGNE A LIGNE. L'ordre inverse leve dans un sens et passe dans
 * l'autre, ce qui produit un defaut qui marche en developpement et casse en
 * production selon l'ordre physique des lignes.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction en SQL : c'est
 * l'ordre des ecritures qui doit etre exerce.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let listerMesAdresses: typeof import("@/services/carnet-adresses").listerMesAdresses;
let ajouterAdresse: typeof import("@/services/carnet-adresses").ajouterAdresse;
let modifierAdresse: typeof import("@/services/carnet-adresses").modifierAdresse;
let retirerAdresse: typeof import("@/services/carnet-adresses").retirerAdresse;
let choisirAdresseParDefaut: typeof import("@/services/carnet-adresses").choisirAdresseParDefaut;
let EntreeInvalideError: typeof import("@/lib/validation").EntreeInvalideError;

const EMAIL = "proprietaire@exemple.fr";
const EMAIL_TIERS = "voisin@exemple.fr";

/** Une saisie valide, dont chaque test derive ses variantes. */
const SAISIE = {
  libelle: "Domicile",
  nomComplet: "Client Test",
  ligne1: "1 rue du Test",
  codePostal: "64000",
  ville: "Pau",
  pays: "FR",
} as const;

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  ({
    listerMesAdresses,
    ajouterAdresse,
    modifierAdresse,
    retirerAdresse,
    choisirAdresseParDefaut,
  } = await import("@/services/carnet-adresses"));

  ({ EntreeInvalideError } = await import("@/lib/validation"));
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    `TRUNCATE ligne_commande, commande, adresse_carnet, utilisateur CASCADE`,
  );
});

async function creerCompte(email: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO utilisateur (id, email, nom, email_verifie, role, cree_a, mis_a_jour_a)
     VALUES (gen_random_uuid()::text, $1, 'Client Test', true, 'CLIENT', now(), now())
     RETURNING id`,
    [email],
  );

  return rows[0].id as string;
}

/** Insere une adresse directement, pour poser un etat de depart. */
async function creerAdresseEnBase(
  utilisateurId: string,
  libelle: string,
  estParDefaut = false,
): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO adresse_carnet (id, utilisateur_id, libelle, nom_complet,
                                 ligne1, code_postal, ville, pays, est_par_defaut)
     VALUES (gen_random_uuid()::text, $1, $2, 'Client Test', '1 rue du Test',
             '64000', 'Pau', 'FR', $3)
     RETURNING id`,
    [utilisateurId, libelle, estParDefaut],
  );

  return rows[0].id as string;
}

async function lireDefaut(utilisateurId: string): Promise<string | null> {
  const { rows } = await client.query(
    `SELECT id FROM adresse_carnet WHERE utilisateur_id = $1 AND est_par_defaut`,
    [utilisateurId],
  );

  return (rows[0]?.id as string | undefined) ?? null;
}

describe("critere 1, ajout, modification et suppression", () => {
  it("ajoute une adresse au carnet du compte", async () => {
    const moi = await creerCompte(EMAIL);

    expect(await ajouterAdresse(moi, SAISIE)).toEqual({ etat: "FAIT" });

    const carnet = await listerMesAdresses(moi);
    expect(carnet).toHaveLength(1);
    expect(carnet[0]?.libelle).toBe("Domicile");
    /*
     * UNE ADRESSE CREEE N'EST JAMAIS PAR DEFAUT, regle A7 : « un carnet sans
     * adresse par defaut est un etat legitime », et aucune promotion
     * automatique n'a lieu, meme sur la premiere.
     */
    expect(carnet[0]?.estParDefaut).toBe(false);
  });

  it("modifie une adresse et efface un libelle vide", async () => {
    const moi = await creerCompte(EMAIL);
    const adresse = await creerAdresseEnBase(moi, "Domicile");

    const resultat = await modifierAdresse(adresse, moi, {
      ...SAISIE,
      libelle: undefined,
      ville: "Bayonne",
    });

    expect(resultat).toEqual({ etat: "FAIT" });

    const carnet = await listerMesAdresses(moi);
    expect(carnet[0]?.ville).toBe("Bayonne");
    /*
     * LE LIBELLE EST EFFACE, pas conserve. `undefined` signifierait « ne pas
     * toucher » dans un `update` : le service le traduit en `null`, sans quoi un
     * libelle retire par le client resterait en base.
     */
    expect(carnet[0]?.libelle).toBeNull();
  });

  it("supprime une adresse", async () => {
    const moi = await creerCompte(EMAIL);
    const adresse = await creerAdresseEnBase(moi, "Domicile");

    expect(await retirerAdresse(adresse, moi)).toEqual({ etat: "FAIT" });
    expect(await listerMesAdresses(moi)).toEqual([]);
  });

  it("refuse un code postal d'outre-mer sans rien ecrire", async () => {
    /*
     * `97xxx` ET NON `99999`, qui EST accepte a juste titre : la regle exclut
     * l'outre-mer, elle ne valide pas l'existence du code. Ma premiere version
     * employait `99999` et le test rougissait sur un comportement CORRECT.
     *
     * L'exclusion est une decision de perimetre : accepter un code d'outre-mer
     * promettrait une livraison que le tarif Mondial Relay d'ADR-025 ne couvre
     * pas. La Corse, `20xxx`, reste metropolitaine.
     */
    const moi = await creerCompte(EMAIL);

    await expect(
      ajouterAdresse(moi, { ...SAISIE, codePostal: "97400" }),
    ).rejects.toBeInstanceOf(EntreeInvalideError);

    expect(await listerMesAdresses(moi)).toEqual([]);
  });

  it("accepte un code postal corse, qui reste metropolitain", async () => {
    // LE SENS INVERSE : sans lui, un schema qui refuserait TOUT code postal
    // passerait le test precedent.
    const moi = await creerCompte(EMAIL);

    expect(
      await ajouterAdresse(moi, {
        ...SAISIE,
        codePostal: "20000",
        ville: "Ajaccio",
      }),
    ).toEqual({ etat: "FAIT" });
  });

  it("refuse une tentative de poser estParDefaut par la saisie", async () => {
    /*
     * `z.strictObject` FAIT ECHOUER BRUYAMMENT plutot qu'ignorer en silence.
     * Poser ce drapeau par la saisie contournerait l'ordre impose de la
     * bascule, et deux adresses par defaut violeraient l'index partiel.
     */
    const moi = await creerCompte(EMAIL);

    await expect(
      ajouterAdresse(moi, { ...SAISIE, estParDefaut: true }),
    ).rejects.toBeInstanceOf(EntreeInvalideError);

    expect(await listerMesAdresses(moi)).toEqual([]);
  });
});

describe("critere 2, au plus une adresse par defaut, zero autorise", () => {
  it("accepte un carnet sans aucune adresse par defaut", async () => {
    // REGLE A7 : zero est un etat legitime, pas une anomalie a corriger.
    const moi = await creerCompte(EMAIL);
    await creerAdresseEnBase(moi, "Domicile");
    await creerAdresseEnBase(moi, "Bureau");

    expect(await lireDefaut(moi)).toBeNull();
    expect(await listerMesAdresses(moi)).toHaveLength(2);
  });

  it("ne promeut personne quand l'adresse par defaut est supprimee", async () => {
    const moi = await creerCompte(EMAIL);
    const defaut = await creerAdresseEnBase(moi, "Domicile", true);
    await creerAdresseEnBase(moi, "Bureau");

    await retirerAdresse(defaut, moi);

    // AUCUNE PROMOTION AUTOMATIQUE, regle A7 : promouvoir la suivante
    // choisirait a la place du client.
    expect(await lireDefaut(moi)).toBeNull();
    expect(await listerMesAdresses(moi)).toHaveLength(1);
  });

  it("n'en laisse jamais deux, la base refusant la seconde", async () => {
    const moi = await creerCompte(EMAIL);
    await creerAdresseEnBase(moi, "Domicile", true);

    // L'INDEX PARTIEL EST LA SECONDE LIGNE DE DEFENSE : meme en contournant le
    // service, la base refuse.
    await expect(creerAdresseEnBase(moi, "Bureau", true)).rejects.toThrow(
      /adresse_defaut_unique/,
    );
  });

  it("deux comptes ont chacun leur adresse par defaut", async () => {
    // L'INDEX EST FILTRE SUR `utilisateurId` : un UNIQUE global aurait interdit
    // au second compte d'en avoir une.
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);

    const mienne = await creerAdresseEnBase(moi, "Domicile", true);
    const sienne = await creerAdresseEnBase(voisin, "Domicile", true);

    expect(await lireDefaut(moi)).toBe(mienne);
    expect(await lireDefaut(voisin)).toBe(sienne);
  });
});

describe("critere 3, la bascule reussit DANS LES DEUX SENS", () => {
  /*
   * LE TEST QUE LE CRITERE EXIGE EXPLICITEMENT, et le piege qu'il ferme :
   * `adresse_defaut_unique` est un index PARTIEL, non differable, verifie
   * ligne a ligne. Une implementation qui poserait le nouveau drapeau avant de
   * retirer l'ancien passe dans un sens et leve dans l'autre, selon l'ordre
   * physique des lignes.
   *
   * TESTER UN SEUL SENS NE PROUVE DONC RIEN : c'est exactement ce que le
   * ticket veut eviter en demandant « les deux sens de bascule, test
   * explicite ».
   */
  it("bascule de la premiere vers la seconde", async () => {
    const moi = await creerCompte(EMAIL);
    const premiere = await creerAdresseEnBase(moi, "Domicile", true);
    const seconde = await creerAdresseEnBase(moi, "Bureau");

    expect(await choisirAdresseParDefaut(seconde, moi)).toEqual({
      etat: "FAIT",
    });

    expect(await lireDefaut(moi)).toBe(seconde);
    void premiere;
  });

  it("bascule de la seconde vers la premiere, le sens inverse", async () => {
    const moi = await creerCompte(EMAIL);
    const premiere = await creerAdresseEnBase(moi, "Domicile");
    const seconde = await creerAdresseEnBase(moi, "Bureau", true);

    expect(await choisirAdresseParDefaut(premiere, moi)).toEqual({
      etat: "FAIT",
    });

    expect(await lireDefaut(moi)).toBe(premiere);
    void seconde;
  });

  it("bascule dix fois d'affilee sans jamais lever", async () => {
    /*
     * L'ALTERNANCE REPETEE exerce les deux ordres physiques : selon la ligne
     * que PostgreSQL parcourt en premier, une implementation fautive echouerait
     * a l'un des passages. Deux tests separes pourraient tomber du bon cote par
     * chance, dix alternances beaucoup moins.
     */
    const moi = await creerCompte(EMAIL);
    const a = await creerAdresseEnBase(moi, "A", true);
    const b = await creerAdresseEnBase(moi, "B");

    for (let tour = 0; tour < 10; tour += 1) {
      const cible = tour % 2 === 0 ? b : a;
      expect(await choisirAdresseParDefaut(cible, moi)).toEqual({
        etat: "FAIT",
      });
      expect(await lireDefaut(moi)).toBe(cible);
    }
  });

  it("pose le defaut sur un carnet qui n'en avait aucun", async () => {
    const moi = await creerCompte(EMAIL);
    const adresse = await creerAdresseEnBase(moi, "Domicile");

    expect(await choisirAdresseParDefaut(adresse, moi)).toEqual({
      etat: "FAIT",
    });
    expect(await lireDefaut(moi)).toBe(adresse);
  });
});

describe("critere 5, test negatif de securite", () => {
  it("refuse de lire, modifier ou supprimer l'adresse d'un tiers", async () => {
    /*
     * LA TENTATIVE VISEE : un client connecte poste l'identifiant d'une adresse
     * qui n'est pas la sienne. L'identifiant est VRAI, l'adresse existe, seule
     * l'appartenance manque. Invariant 2 et regle A1.
     */
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    const sienne = await creerAdresseEnBase(voisin, "Domicile");

    expect(await modifierAdresse(sienne, moi, SAISIE)).toEqual({
      etat: "INTROUVABLE",
    });
    expect(await retirerAdresse(sienne, moi)).toEqual({ etat: "INTROUVABLE" });
    expect(await choisirAdresseParDefaut(sienne, moi)).toEqual({
      etat: "INTROUVABLE",
    });

    // LE SECOND SENS : le voisin, lui, peut agir. Sans cette assertion, un
    // service qui refuserait TOUT passerait le test.
    expect(await modifierAdresse(sienne, voisin, SAISIE)).toEqual({
      etat: "FAIT",
    });
  });

  it("l'adresse du tiers n'est pas modifiee par la tentative", async () => {
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    const sienne = await creerAdresseEnBase(voisin, "Domicile");

    await modifierAdresse(sienne, moi, { ...SAISIE, ville: "Intrusion" });

    const { rows } = await client.query(
      `SELECT ville FROM adresse_carnet WHERE id = $1`,
      [sienne],
    );
    expect(rows[0].ville).toBe("Pau");
  });

  it("une bascule refusee ne retire pas le defaut du carnet", async () => {
    /*
     * LE CAS LE PLUS SUBTIL DE LA STORY. La bascule retire le drapeau AVANT de
     * le poser : si le refus survenait apres le retrait sans annuler la
     * transaction, le client perdrait son reglage en tentant de voler celui
     * d'un autre. C'est le motif du `return` qui valide une transaction,
     * `database.md` : seule une EXCEPTION annule.
     */
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    const mienne = await creerAdresseEnBase(moi, "Domicile", true);
    const sienne = await creerAdresseEnBase(voisin, "Domicile");

    expect(await choisirAdresseParDefaut(sienne, moi)).toEqual({
      etat: "INTROUVABLE",
    });

    // MON DEFAUT EST INTACT.
    expect(await lireDefaut(moi)).toBe(mienne);
    // ET CELUI DU VOISIN N'A PAS ETE POSE.
    expect(await lireDefaut(voisin)).toBeNull();
  });

  it("le carnet d'un tiers n'apparait jamais dans le mien", async () => {
    const moi = await creerCompte(EMAIL);
    const voisin = await creerCompte(EMAIL_TIERS);
    await creerAdresseEnBase(moi, "Mienne");
    await creerAdresseEnBase(voisin, "Sienne");

    expect((await listerMesAdresses(moi)).map((a) => a.libelle)).toEqual([
      "Mienne",
    ]);
  });
});

describe("critere 4, le carnet ne touche aucune commande", () => {
  it("modifier une adresse ne change aucune commande passee", async () => {
    /*
     * INVARIANT 3 ET REGLE A3 : la commande porte une COPIE figee, jamais une
     * reference au carnet. Le parcours 8 decrit le cas jumeau, plus insidieux
     * que la suppression : la modification est silencieuse, et aller relire le
     * carnet au moment de figer enverrait le colis a une adresse qui n'est
     * jamais apparue sur le recapitulatif.
     */
    const moi = await creerCompte(EMAIL);
    const adresse = await creerAdresseEnBase(moi, "Domicile");

    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version)
       VALUES ('cmd-carnet', 'C-2026-0001', $1, 'Client Test', $2,
               '{"ville": "Pau", "ligne1": "1 rue du Test"}'::jsonb,
               '{"ville": "Pau"}'::jsonb, 4500, 'DOMICILE', 499, 4999, now(), 'v1')`,
      [EMAIL, moi],
    );

    await modifierAdresse(adresse, moi, { ...SAISIE, ville: "Bayonne" });

    const { rows } = await client.query(
      `SELECT adresse_livraison FROM commande WHERE id = 'cmd-carnet'`,
    );
    expect(rows[0].adresse_livraison.ville).toBe("Pau");
  });

  it("supprimer une adresse ne change aucune commande passee", async () => {
    const moi = await creerCompte(EMAIL);
    const adresse = await creerAdresseEnBase(moi, "Domicile");

    await client.query(
      `INSERT INTO commande (id, numero, email_normalise, nom_client, utilisateur_id,
                             adresse_livraison, adresse_facturation,
                             sous_total_centimes, mode_livraison, frais_port_centimes,
                             total_centimes, cgv_acceptees_a, cgv_version)
       VALUES ('cmd-carnet-2', 'C-2026-0002', $1, 'Client Test', $2,
               '{"ville": "Pau"}'::jsonb, '{"ville": "Pau"}'::jsonb,
               4500, 'DOMICILE', 499, 4999, now(), 'v1')`,
      [EMAIL, moi],
    );

    await retirerAdresse(adresse, moi);

    const { rows } = await client.query(
      `SELECT adresse_livraison FROM commande WHERE id = 'cmd-carnet-2'`,
    );
    expect(rows[0].adresse_livraison.ville).toBe("Pau");
  });
});
