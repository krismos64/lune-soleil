/**
 * Variantes d'un produit, sur base reelle. LS-101.
 *
 * CES TESTS SONT ECRITS AVANT LE SERVICE, et portent sur les trois endroits ou
 * la base ou l'invariant 3 disent non a du code d'apparence juste :
 *
 *   C2   `reference` est unique. Le service doit rendre un refus explicite qui
 *        NOMME LE PRODUIT porteur, cas d'erreur du parcours 3, et non laisser
 *        remonter une violation d'unicite jusqu'a l'ecran.
 *   C13  une variante ne se supprime JAMAIS, elle s'archive. Une suppression
 *        libererait sa reference, et les avis comme les statistiques de
 *        l'ancienne remonteraient sur la nouvelle piece qui la reprendrait.
 *   C14  la reference d'une variante archivee n'est JAMAIS reattribuee. C'est
 *        une consequence de C13, et l'unicite en base la porte : la ligne
 *        archivee occupe toujours la reference.
 *
 * L'INVARIANT 3 EST LE PLUS DIFFICILE A TESTER, et le plus important : modifier
 * le prix ou archiver une variante ne doit toucher AUCUNE ligne de commande.
 * Le test ecrit donc une vraie commande, releve ses lignes, agit sur le
 * catalogue, et relit. Un service qui « mettrait a jour » les lignes pour
 * rester coherent passerait tout autre test.
 *
 * AUCUNE DONNEE DU PROTOTYPE : ni Eclipse, ni Alba, ni BO-LUNE-42.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let catalogue: typeof import("@/services/catalogue");
let variantes: typeof import("@/services/variante");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  catalogue = await import("@/services/catalogue");
  variantes = await import("@/services/variante");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE produit, categorie, commande, ligne_commande CASCADE",
  );
});

/** Cree une categorie et un produit, et rend l'identifiant du produit. */
async function produitDeTest(nom = "Pièce d'essai"): Promise<string> {
  const categorie = await catalogue.creerCategorie({
    nom: `Rangement ${randomUUID().slice(0, 8)}`,
  });
  const produit = await catalogue.creerProduit({
    nom: `${nom} ${randomUUID().slice(0, 8)}`,
    categorieId: categorie.id,
  });
  return produit.id;
}

/** Entree de creation valide, personnalisable champ par champ. */
function entree(produitId: string, ajustements: Record<string, unknown> = {}) {
  return {
    produitId,
    reference: `REF-${randomUUID().slice(0, 8).toUpperCase()}`,
    libelle: "Modèle court",
    dimensions: "42 cm",
    prixEuros: "19,99",
    quantitePhysique: 3,
    ...ajustements,
  };
}

/**
 * Ecrit une commande portant une ligne sur la variante donnee.
 *
 * LES COPIES FIGEES SONT ECRITES ICI, comme le ferait le tunnel : c'est
 * precisement ce que le catalogue ne doit plus jamais toucher, invariant 3.
 *
 * `CONFIRMEE` ET NON `PAYEE`, qui n'existe pas : le statut de la COMMANDE est un
 * axe distinct de celui du PAIEMENT, regle V5. Une commande confirmee a bien un
 * paiement reussi, porte par `Paiement.statut`.
 */
async function commandeAvecLigne(
  varianteId: string,
  reference: string,
  prixCentimes: number,
): Promise<string> {
  const commandeId = randomUUID();
  const ligneId = randomUUID();

  await client.query(
    `INSERT INTO commande (id, numero, statut, email_normalise, nom_client,
       adresse_livraison, adresse_facturation, sous_total_centimes,
       mode_livraison, frais_port_centimes, total_centimes,
       cgv_acceptees_a, cgv_version, cree_a)
     VALUES ($1, $2, 'CONFIRMEE', 'client@example.test', 'Client de test',
       '{}'::jsonb, '{}'::jsonb, $3, 'DOMICILE', 0, $3, now(), 'v1', now())`,
    [commandeId, `C-TEST-${randomUUID().slice(0, 8)}`, prixCentimes],
  );

  await client.query(
    `INSERT INTO ligne_commande (id, commande_id, variante_id, reference_figee,
       libelle_produit_fige, libelle_variante_fige, prix_fige_centimes,
       quantite, cree_a)
     VALUES ($1, $2, $3, $4, 'Produit figé', 'Déclinaison figée', $5, 1, now())`,
    [ligneId, commandeId, varianteId, reference, prixCentimes],
  );

  return ligneId;
}

/**
 * Pose une reservation sur une variante, active ou expiree selon le delai.
 *
 * ECRITE EN SQL ET NON PAR LE SERVICE DE RESERVATION : celui-ci exige un panier
 * complet et une commande, ce qui ferait dependre ce test d'ADR-024 alors qu'il
 * ne porte que sur l'archivage. Le SQL prepare ici un ETAT, il ne rejoue aucune
 * mecanique que le service devrait executer.
 */
async function reservationSur(
  varianteId: string,
  minutesAvantExpiration: number,
): Promise<void> {
  const commandeId = randomUUID();
  await client.query(
    `INSERT INTO commande (id, numero, statut, email_normalise, nom_client,
       adresse_livraison, adresse_facturation, sous_total_centimes,
       mode_livraison, frais_port_centimes, total_centimes,
       cgv_acceptees_a, cgv_version, cree_a)
     VALUES ($1, $2, 'EN_ATTENTE_PAIEMENT', 'client@example.test', 'Client de test',
       '{}'::jsonb, '{}'::jsonb, 1999, 'DOMICILE', 0, 1999, now(), 'v1', now())`,
    [commandeId, `C-RES-${randomUUID().slice(0, 8)}`],
  );

  await client.query(
    `INSERT INTO reservation (id, variante_id, commande_id, quantite, expire_a, cree_a)
     VALUES ($1, $2, $3, 1, now() + make_interval(mins => $4), now())`,
    [randomUUID(), varianteId, commandeId, minutesAvantExpiration],
  );

  // La quantite reservee suit, comme le ferait l'UPDATE conditionnel d'ADR-006.
  await client.query(
    "UPDATE variante SET quantite_reservee = quantite_reservee + 1 WHERE id = $1",
    [varianteId],
  );
}

/** L'etat figé d'une ligne de commande, tel que la base le porte. */
async function ligneFigee(ligneId: string) {
  const { rows } = await client.query(
    `SELECT variante_id, reference_figee, prix_fige_centimes,
            libelle_variante_fige
       FROM ligne_commande WHERE id = $1`,
    [ligneId],
  );
  return rows[0];
}

describe("creation d'une variante", () => {
  it("cree une variante avec son prix en centimes entiers", async () => {
    const produitId = await produitDeTest();

    const creee = await variantes.creerVariante(
      entree(produitId, { reference: "REF-CREATION-01", prixEuros: "19,99" }),
    );

    expect(creee.prixCentimes).toBe(1999);
    expect(creee.reference).toBe("REF-CREATION-01");
    expect(creee.quantitePhysique).toBe(3);
  });

  /**
   * `quantiteReservee` VAUT ZERO A LA CREATION, parcours 3 etape 3. Elle
   * n'appartient pas a cette story : seule la reservation l'incremente, sous
   * ADR-006. Le verifier ici fige la frontiere entre les deux.
   */
  it("laisse la quantite reservee a zero et la vente web activee", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(entree(produitId));

    const { rows } = await client.query(
      "SELECT quantite_reservee, vente_web_activee, archivee_a FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].quantite_reservee).toBe(0);
    expect(rows[0].vente_web_activee).toBe(true);
    expect(rows[0].archivee_a).toBeNull();
  });

  /**
   * LE PRIX PASSE PAR LA BASE SANS PERDRE DE CENTIME. Le test relit la colonne
   * plutot que la valeur rendue : un `Float` glisse dans le schema Prisma se
   * verrait ici et nulle part ailleurs.
   */
  it("stocke un entier en base, relu a l'identique", async () => {
    const produitId = await produitDeTest();
    // `4,35` EST UN MONTANT QUE LE FLOTTANT REND INEXACT, `4.35 * 100` valant
    // 434.99999999999994. Le relire depuis la colonne prouve qu'aucun flottant
    // n'est entre entre la saisie et la base.
    const creee = await variantes.creerVariante(
      entree(produitId, { prixEuros: "4,35" }),
    );

    const { rows } = await client.query(
      "SELECT prix_centimes FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].prix_centimes).toBe(435);
    expect(Number.isInteger(rows[0].prix_centimes)).toBe(true);
  });

  it("accepte une quantite nulle, une piece pas encore fabriquee", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { quantitePhysique: 0 }),
    );
    expect(creee.quantitePhysique).toBe(0);
  });

  it("refuse un rattachement a un produit inexistant", async () => {
    await expect(
      variantes.creerVariante(entree("3f2504e0-4f89-41d3-9a0c-0305e82c3301")),
    ).rejects.toThrow(variantes.ProduitIntrouvableError);
  });
});

describe("unicite de la reference, C2 et cas d'erreur du parcours 3", () => {
  /**
   * LE REFUS NOMME LE PRODUIT PORTEUR. Le parcours 3 l'exige : « message
   * indiquant que la reference existe deja, avec le produit concerne ». Un
   * refus generique laisserait l'exploitante chercher a la main dans tout le
   * catalogue quelle piece porte la reference.
   */
  it("refuse une reference deja prise et nomme le produit qui la porte", async () => {
    const premier = await produitDeTest("Première pièce");
    const second = await produitDeTest("Seconde pièce");

    await variantes.creerVariante(
      entree(premier, { reference: "REF-DOUBLON-01" }),
    );

    const refus = await variantes
      .creerVariante(entree(second, { reference: "REF-DOUBLON-01" }))
      .catch((erreur: unknown) => erreur);

    expect(refus).toBeInstanceOf(variantes.ReferenceDejaPriseError);
    expect(
      (refus as InstanceType<typeof variantes.ReferenceDejaPriseError>)
        .nomProduit,
    ).toContain("Première pièce");
  });

  /**
   * LA CASSE NE CREE PAS DEUX REFERENCES. La normalisation en majuscules a lieu
   * a la validation : sans elle, `ref-doublon-02` passerait l'unicite et
   * l'etiquette imprimee serait indistinguable de l'autre.
   */
  it("refuse la meme reference saisie en minuscules", async () => {
    const produitId = await produitDeTest();
    await variantes.creerVariante(
      entree(produitId, { reference: "REF-DOUBLON-02" }),
    );

    await expect(
      variantes.creerVariante(
        entree(produitId, { reference: "ref-doublon-02" }),
      ),
    ).rejects.toThrow(variantes.ReferenceDejaPriseError);
  });

  /**
   * C14, LA REFERENCE D'UNE VARIANTE ARCHIVEE N'EST JAMAIS REATTRIBUEE. C'est
   * la ligne archivee elle-meme qui occupe la reference : le test archive, puis
   * tente de recreer avec la meme, et exige le meme refus.
   */
  it("ne reattribue pas la reference d'une variante archivee", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { reference: "REF-ARCHIVEE-01" }),
    );

    await variantes.archiverVariante({ id: creee.id });

    await expect(
      variantes.creerVariante(
        entree(produitId, { reference: "REF-ARCHIVEE-01" }),
      ),
    ).rejects.toThrow(variantes.ReferenceDejaPriseError);
  });
});

describe("archivage, C13 et invariant 3", () => {
  /**
   * LE TEST CENTRAL DE LA STORY. Il ecrit une VRAIE commande, releve l'etat
   * figé de sa ligne, archive la variante, et relit.
   *
   * UN SERVICE QUI « METTRAIT A JOUR » LES LIGNES pour rester coherent avec le
   * catalogue passerait tous les autres tests de ce fichier. Seul celui-ci le
   * voit, et c'est l'invariant 3 : une commande ne depend jamais du prix ou du
   * nom actuel du catalogue.
   */
  it("n'ecrit rien sur les lignes de commande existantes", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { reference: "REF-VENDUE-01", prixEuros: "31,50" }),
    );
    const ligneId = await commandeAvecLigne(creee.id, "REF-VENDUE-01", 3150);

    const avant = await ligneFigee(ligneId);
    await variantes.archiverVariante({ id: creee.id });
    const apres = await ligneFigee(ligneId);

    expect(apres).toEqual(avant);
    expect(apres.prix_fige_centimes).toBe(3150);
    expect(apres.reference_figee).toBe("REF-VENDUE-01");
    // LA LIGNE POINTE TOUJOURS LA VARIANTE, elle n'est pas supprimee : c'est ce
    // qui rend `varianteId` resolvable pour les avis et les statistiques, C13.
    expect(apres.variante_id).toBe(creee.id);
  });

  /**
   * ARCHIVER NE CREE AUCUN MOUVEMENT DE STOCK, invariant 6, et laisse la
   * quantite physique intacte : la piece existe toujours et reste vendable en
   * main propre. Arbitrage de Christophe du 14 aout 2026.
   */
  it("laisse le stock physique intact et ne cree aucun mouvement", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { quantitePhysique: 3 }),
    );

    await variantes.archiverVariante({ id: creee.id });

    const { rows } = await client.query(
      "SELECT quantite_physique, archivee_a FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].quantite_physique).toBe(3);
    expect(rows[0].archivee_a).not.toBeNull();

    const mouvements = await client.query(
      "SELECT count(*)::int AS n FROM mouvement_stock WHERE variante_id = $1",
      [creee.id],
    );
    expect(mouvements.rows[0].n).toBe(0);
  });

  /** La ligne survit, C13 : archiver n'est pas supprimer. */
  it("conserve la ligne de variante en base", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(entree(produitId));

    await variantes.archiverVariante({ id: creee.id });

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].n).toBe(1);
  });

  /**
   * ARCHIVER DEUX FOIS NE DEPLACE PAS LA DATE. Le second appel est refuse : un
   * ecrasement silencieux ferait perdre la date reelle de sortie du catalogue,
   * qui est la seule trace du moment ou la piece a cesse d'etre vendable.
   */
  it("refuse d'archiver une variante deja archivee", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(entree(produitId));

    await variantes.archiverVariante({ id: creee.id });
    const { rows: avant } = await client.query(
      "SELECT archivee_a FROM variante WHERE id = $1",
      [creee.id],
    );

    await expect(variantes.archiverVariante({ id: creee.id })).rejects.toThrow(
      variantes.VarianteDejaArchiveeError,
    );

    const { rows: apres } = await client.query(
      "SELECT archivee_a FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(apres[0].archivee_a).toEqual(avant[0].archivee_a);
  });

  /**
   * L'ARCHIVAGE EST REFUSE TANT QU'UNE RESERVATION ACTIVE EXISTE,
   * `database.md` l'exige, meme regle que pour la vente externe.
   *
   * LE SCENARIO QUE CELA FERME : un client est en train de payer, sa
   * reservation tient la piece, et l'exploitante archive la variante. La
   * commande se confirme sur une piece sortie du catalogue, et la conversion de
   * la reservation en vente porte sur une variante que plus rien ne vend.
   *
   * LE REFUS N'EST PAS DEFINITIF, il impose un controle humain : l'exploitante
   * peut attendre l'expiration, ou annuler explicitement la reservation.
   */
  it("refuse d'archiver tant qu'une reservation active existe", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(entree(produitId));
    await reservationSur(creee.id, 15);

    const refus = await variantes
      .archiverVariante({ id: creee.id })
      .catch((erreur: unknown) => erreur);

    expect(refus).toBeInstanceOf(variantes.ReservationActiveError);

    // LA VARIANTE N'EST PAS ARCHIVEE, et c'est la moitie du critere : un refus
    // qui laisserait `archiveeA` renseignee serait pire qu'aucun refus.
    const { rows } = await client.query(
      "SELECT archivee_a FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].archivee_a).toBeNull();
  });

  /**
   * UNE RESERVATION EXPIREE N'EMPECHE RIEN. Elle ne tient plus la piece : la
   * tache de liberation la retirera, et bloquer l'archivage dessus rendrait une
   * variante inarchivable pendant les cinq minutes qui separent l'expiration du
   * passage de la tache.
   *
   * CE TEST EST CE QUI DISTINGUE UNE GARDE JUSTE D'UNE GARDE TROP LARGE. Compter
   * les reservations sans regarder `expireA` le laisserait vert, et l'ecran
   * refuserait un archivage parfaitement legitime.
   */
  it("archive malgre une reservation expiree", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(entree(produitId));
    await reservationSur(creee.id, -30);

    await variantes.archiverVariante({ id: creee.id });

    const { rows } = await client.query(
      "SELECT archivee_a FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].archivee_a).not.toBeNull();
  });

  it("refuse d'archiver une variante inconnue", async () => {
    await expect(
      variantes.archiverVariante({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }),
    ).rejects.toThrow(variantes.VarianteIntrouvableError);
  });
});

describe("modification d'une variante", () => {
  /**
   * CHANGER LE PRIX NE TOUCHE AUCUNE COMMANDE, invariant 3. Meme mecanique que
   * le test d'archivage, et meme raison d'etre : c'est le geste le plus courant
   * de l'exploitante, et celui dont les degats seraient les plus silencieux.
   */
  it("change le prix sans modifier une ligne de commande existante", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { reference: "REF-PRIX-01", prixEuros: "31,50" }),
    );
    const ligneId = await commandeAvecLigne(creee.id, "REF-PRIX-01", 3150);

    await variantes.modifierVariante({
      id: creee.id,
      reference: "REF-PRIX-01",
      libelle: "Modèle court",
      dimensions: "42 cm",
      prixEuros: "45,00",
      quantitePhysique: 3,
    });

    const { rows } = await client.query(
      "SELECT prix_centimes FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].prix_centimes).toBe(4500);

    const ligne = await ligneFigee(ligneId);
    expect(ligne.prix_fige_centimes).toBe(3150);
  });

  /**
   * LA REFERENCE EST MODIFIABLE, ADR-029, ET LA COPIE FIGEE NE SUIT PAS. Le
   * test fige ce comportement plutot que de le laisser decouvrir : la ligne de
   * commande garde l'ancienne chaine, c'est la consequence que l'ecran
   * avertit.
   */
  it("change la reference sans toucher la copie figee de la commande", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { reference: "REF-AVANT-01" }),
    );
    const ligneId = await commandeAvecLigne(creee.id, "REF-AVANT-01", 1999);

    await variantes.modifierVariante({
      id: creee.id,
      reference: "REF-APRES-01",
      libelle: "Modèle court",
      dimensions: "42 cm",
      prixEuros: "19,99",
      quantitePhysique: 3,
    });

    const { rows } = await client.query(
      "SELECT reference FROM variante WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].reference).toBe("REF-APRES-01");

    const ligne = await ligneFigee(ligneId);
    expect(ligne.reference_figee).toBe("REF-AVANT-01");
  });

  /**
   * LE COMPTE DE COMMANDES SERT L'AVERTISSEMENT D'ADR-029. L'ecran ne peut le
   * dire que si le service le rend : « cette reference apparait dans 2
   * commandes ».
   */
  it("compte les commandes qui portent la variante", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(
      entree(produitId, { reference: "REF-COMPTE-01" }),
    );

    expect(await variantes.compterLignesDeCommande(creee.id)).toBe(0);

    await commandeAvecLigne(creee.id, "REF-COMPTE-01", 1999);
    await commandeAvecLigne(creee.id, "REF-COMPTE-01", 1999);

    expect(await variantes.compterLignesDeCommande(creee.id)).toBe(2);
  });

  it("refuse une reference deja portee par une autre variante", async () => {
    const produitId = await produitDeTest();
    await variantes.creerVariante(
      entree(produitId, { reference: "REF-PRISE-01" }),
    );
    const seconde = await variantes.creerVariante(
      entree(produitId, { reference: "REF-PRISE-02" }),
    );

    await expect(
      variantes.modifierVariante({
        id: seconde.id,
        reference: "REF-PRISE-01",
        libelle: "Modèle court",
        dimensions: null,
        prixEuros: "19,99",
        quantitePhysique: 3,
      }),
    ).rejects.toThrow(variantes.ReferenceDejaPriseError);
  });

  /**
   * MODIFIER UNE VARIANTE ARCHIVEE EST REFUSE. Elle est sortie du catalogue :
   * en changer le prix n'aurait aucun effet visible, et laisserait croire a une
   * remise en vente.
   */
  it("refuse de modifier une variante archivee", async () => {
    const produitId = await produitDeTest();
    const creee = await variantes.creerVariante(entree(produitId));
    await variantes.archiverVariante({ id: creee.id });

    await expect(
      variantes.modifierVariante({
        id: creee.id,
        reference: "REF-MORTE-01",
        libelle: "Modèle court",
        dimensions: null,
        prixEuros: "19,99",
        quantitePhysique: 3,
      }),
    ).rejects.toThrow(variantes.VarianteDejaArchiveeError);
  });
});

describe("lecture des variantes d'un produit", () => {
  /**
   * LES ARCHIVEES SONT RENDUES, ET MARQUEES. L'ecran d'administration doit les
   * montrer : elles occupent toujours leur reference, C14, et l'exploitante
   * doit comprendre pourquoi elle ne peut pas la reutiliser.
   */
  it("rend les variantes archivees avec les autres, dans l'ordre de creation", async () => {
    const produitId = await produitDeTest();
    const une = await variantes.creerVariante(
      entree(produitId, { reference: "REF-LISTE-01", libelle: "Une" }),
    );
    const deux = await variantes.creerVariante(
      entree(produitId, { reference: "REF-LISTE-02", libelle: "Deux" }),
    );
    await variantes.archiverVariante({ id: une.id });

    const liste = await variantes.listerVariantes(produitId);

    expect(liste.map((v) => v.id)).toEqual([une.id, deux.id]);
    expect(liste[0]?.archiveeA).not.toBeNull();
    expect(liste[1]?.archiveeA).toBeNull();
  });

  it("rend une liste vide sur un produit sans variante", async () => {
    const produitId = await produitDeTest();
    expect(await variantes.listerVariantes(produitId)).toEqual([]);
  });
});
