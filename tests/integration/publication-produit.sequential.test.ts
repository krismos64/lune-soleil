/**
 * Publication et archivage d'un produit, sur base reelle. LS-103.
 *
 * CES TESTS SONT ECRITS AVANT LE SERVICE. La story porte quatre refus de
 * publication et une regle d'archivage, et chacun protege une propriete que le
 * catalogue public tiendra pour acquise des LS-104 :
 *
 *   C1   un produit publie a au moins une variante non archivee. Sans elle, la
 *        fiche s'affiche sans prix ni stock, et le bouton d'achat ne porte sur
 *        rien.
 *   C7   un produit ne passe a `ACTIF` qu'avec un media traite ET un texte
 *        alternatif. Le second est une exigence WCAG 2.2 AA, pas un confort.
 *   C8   un media non traite n'est jamais servi publiquement. Un traitement en
 *        echec bloque donc la publication du produit entier : `PARCOURS.md` dit
 *        « c'est un blocage, pas un avertissement ».
 *   C11  archiver un produit ne modifie AUCUNE ligne de commande existante.
 *   C19  archiver la derniere variante vivante archive le produit.
 *
 * LE TEST QUI COMPTE LE PLUS EST CELUI DE C11, et c'est aussi le plus facile a
 * ecrire de travers : il ecrit une VRAIE commande avec ses copies figees,
 * archive le produit, et relit la ligne. Un service qui « mettrait a jour » les
 * lignes pour rester coherent avec le catalogue passerait tous les autres.
 *
 * C19 EST LE PENDANT DE C1, et le trou qu'il ferme n'etait garde par rien
 * depuis LS-101 : C1 ne surveille que le chemin de la publication, donc archiver
 * une a une les variantes d'un produit deja publie le laissait `ACTIF` sans rien
 * de vendable.
 *
 * AUCUNE DONNEE DU PROTOTYPE : ni Eclipse, ni Alba, ni BO-LUNE-42.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import sharp from "sharp";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let racineMedias: string;
let catalogue: typeof import("@/services/catalogue");
let variantes: typeof import("@/services/variante");
let medias: typeof import("@/services/media");
/*
 * L'AUTEUR DES ARCHIVAGES, LS-278 : `journal_audit.acteur_id` reference un
 * utilisateur reel. Role CLIENT et non ADMINISTRATRICE : l'index de E1
 * n'admet qu'une administratrice, et la base est partagee entre fichiers.
 */
const ACTEUR = randomUUID();

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  // LE DISQUE EST REEL, comme dans les tests de LS-102 : la publication depend
  // du statut de traitement des medias, et simuler ce statut testerait la
  // simulation plutot que la chaine reelle.
  racineMedias = await mkdtemp(join(tmpdir(), "ls-integration-publication-"));
  process.env.MEDIA_RACINE = racineMedias;

  client = new Client({ connectionString: url });
  await client.connect();

  catalogue = await import("@/services/catalogue");
  variantes = await import("@/services/variante");
  medias = await import("@/services/media");

  await client.query(
    `INSERT INTO utilisateur (id, email, email_verifie, nom, role, cree_a, mis_a_jour_a)
     VALUES ($1, $2, true, 'TEST Archivage', 'CLIENT', now(), now())`,
    [ACTEUR, `archivage-${ACTEUR}@example.invalid`],
  );
});

afterAll(async () => {
  await client.query("DELETE FROM journal_audit WHERE acteur_id = $1", [
    ACTEUR,
  ]);
  await client.query("DELETE FROM utilisateur WHERE id = $1", [ACTEUR]);
  await client.end();
  await rm(racineMedias, { recursive: true, force: true });
});

afterEach(async () => {
  await client.query(
    "TRUNCATE produit, categorie, commande, ligne_commande CASCADE",
  );
  await rm(join(racineMedias, "public"), { recursive: true, force: true });
  await rm(join(racineMedias, "quarantaine"), { recursive: true, force: true });
});

/** Cree une categorie et un produit, et rend l'identifiant du produit. */
async function produitDeTest(): Promise<string> {
  const categorie = await catalogue.creerCategorie({
    nom: `Rangement ${randomUUID().slice(0, 8)}`,
  });
  const produit = await catalogue.creerProduit({
    nom: `Pièce ${randomUUID().slice(0, 8)}`,
    categorieId: categorie.id,
  });
  return produit.id;
}

/** Ajoute une variante vivante au produit, et rend son identifiant. */
async function varianteSur(produitId: string): Promise<string> {
  const variante = await variantes.creerVariante({
    produitId,
    reference: `REF-${randomUUID().slice(0, 8).toUpperCase()}`,
    libelle: "Modèle court",
    dimensions: "42 cm",
    prixEuros: "19,99",
    quantitePhysique: 3,
  });
  return variante.id;
}

/** Une photographie de test, sans metadonnee particuliere. */
async function photographie(): Promise<Buffer> {
  return sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: "#c8a165",
    },
  })
    .jpeg()
    .toBuffer();
}

/**
 * Ajoute une photo traitee et decrite au produit, et rend son identifiant.
 *
 * PASSE PAR LE VRAI SERVICE plutot que par un `INSERT` : le statut `TRAITE` et
 * le rang 1 sont poses par la chaine reelle, donc le test ne peut pas fabriquer
 * un etat que le service ne produirait jamais.
 */
async function photoPubliableSur(produitId: string): Promise<string> {
  const media = await medias.televerserPhotographie(
    produitId,
    await photographie(),
  );
  await medias.ecrireTexteAlternatif({
    id: media.id,
    texteAlternatif: "Collier en argent sur fond clair",
  });
  return media.id;
}

/** Le produit tel que la base le porte. */
async function produitEnBase(id: string) {
  const { rows } = await client.query(
    "SELECT statut, publie_a, archive_a FROM produit WHERE id = $1",
    [id],
  );
  return rows[0] as {
    statut: string;
    publie_a: Date | null;
    archive_a: Date | null;
  };
}

/**
 * Ecrit une commande portant une ligne sur la variante donnee.
 *
 * LES COPIES FIGEES SONT ECRITES ICI, comme le ferait le tunnel : c'est
 * precisement ce que l'archivage ne doit jamais toucher, invariant 3.
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

describe("conditions de publication, C1, C7 et C8", () => {
  it("refuse un produit sans variante, et le nomme", async () => {
    const produitId = await produitDeTest();
    await photoPubliableSur(produitId);

    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      name: "ProduitNonPubliableError",
      motifs: ["AUCUNE_VARIANTE"],
    });

    // LE PRODUIT RESTE `BROUILLON`, cas d'erreur du parcours 3 : un refus qui
    // laisserait le statut a moitie ecrit serait pire qu'un refus silencieux.
    expect((await produitEnBase(produitId)).statut).toBe("BROUILLON");
  });

  it("refuse un produit sans aucune photo", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);

    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      motifs: ["AUCUN_MEDIA_PRINCIPAL"],
    });
    expect((await produitEnBase(produitId)).statut).toBe("BROUILLON");
  });

  it("refuse un produit dont une photo n'a pas de texte alternatif, C7", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);
    // Televersee mais NON decrite : le texte alternatif reste facultatif au
    // televersement, LS-102, et c'est la publication qui l'exige.
    await medias.televerserPhotographie(produitId, await photographie());

    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      motifs: ["TEXTE_ALTERNATIF_MANQUANT"],
    });
    expect((await produitEnBase(produitId)).statut).toBe("BROUILLON");
  });

  /**
   * C8, ET C'EST UN BLOCAGE ET NON UN AVERTISSEMENT.
   *
   * Le media en echec est produit par la chaine reelle : un fichier qui n'est
   * pas une image traverse le service, qui pose `ECHOUE` sans rien publier. Le
   * produit porte donc une photo decrite ET une photo en echec, ce qui est
   * exactement le cas ou une condition trop laxiste passerait.
   */
  it("refuse un produit dont une photo est en echec de traitement", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);
    await photoPubliableSur(produitId);

    await expect(
      medias.televerserPhotographie(
        produitId,
        Buffer.from("ceci n'est pas une image"),
      ),
    ).rejects.toThrow();

    const motifs = await catalogue.motifsNonPubliable(
      await import("@/lib/prisma").then((m) => m.prisma),
      produitId,
    );
    expect(motifs).toContain("MEDIA_NON_TRAITE");

    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      name: "ProduitNonPubliableError",
    });
    expect((await produitEnBase(produitId)).statut).toBe("BROUILLON");
  });

  /**
   * LES MOTIFS SONT CUMULES, jamais rendus un a un.
   *
   * Un service qui s'arreterait au premier obligerait l'exploitante a corriger,
   * republier, decouvrir le suivant, et recommencer. Le parcours 3 vise trois
   * minutes au smartphone.
   */
  it("cumule les motifs d'un produit entierement vide", async () => {
    const produitId = await produitDeTest();

    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      motifs: ["AUCUNE_VARIANTE", "AUCUN_MEDIA_PRINCIPAL"],
    });
  });

  it("publie un produit complet, et renseigne publieA", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);
    await photoPubliableSur(produitId);

    await catalogue.publierProduit(produitId);

    const produit = await produitEnBase(produitId);
    expect(produit.statut).toBe("ACTIF");
    expect(produit.publie_a).not.toBeNull();
    expect(produit.archive_a).toBeNull();
  });

  it("refuse de publier un produit deja actif", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);

    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      name: "TransitionProduitInvalideError",
    });
  });
});

describe("archivage et republication", () => {
  /**
   * LE TEST QUI PORTE C11 ET L'INVARIANT 3.
   *
   * Il ecrit une vraie commande avec ses copies figees, releve la ligne,
   * archive le produit, et relit. Un service qui mettrait les lignes a jour
   * pour rester coherent avec le catalogue passerait tous les autres tests de
   * ce fichier, et rendrait les factures inopposables.
   */
  it("archiver un produit ne modifie aucune ligne de commande", async () => {
    const produitId = await produitDeTest();
    const varianteId = await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);

    const ligneId = await commandeAvecLigne(varianteId, "REF-FIGEE", 1999);
    const { rows: avant } = await client.query(
      "SELECT * FROM ligne_commande WHERE id = $1",
      [ligneId],
    );

    await catalogue.archiverProduit(produitId);

    const { rows: apres } = await client.query(
      "SELECT * FROM ligne_commande WHERE id = $1",
      [ligneId],
    );
    expect(apres[0]).toEqual(avant[0]);
    expect((await produitEnBase(produitId)).statut).toBe("ARCHIVE");
  });

  /**
   * `publieA` SURVIT A LA REPUBLICATION, le schema l'exige explicitement.
   *
   * Il porte la date de PREMIERE publication, qui sert l'anteriorite affichee et
   * le tri des nouveautes. La reecrire ferait remonter en tete du catalogue un
   * produit ancien qu'on vient de reactiver, ce qu'aucun test de statut ne
   * verrait.
   */
  it("republier garde la date de premiere publication", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);
    await photoPubliableSur(produitId);

    await catalogue.publierProduit(produitId);
    const premiere = (await produitEnBase(produitId)).publie_a;

    await catalogue.archiverProduit(produitId);
    await catalogue.publierProduit(produitId);

    const apres = await produitEnBase(produitId);
    expect(apres.statut).toBe("ACTIF");
    expect(apres.publie_a).toEqual(premiere);
    // REPUBLIER EFFACE LA DATE D'ARCHIVAGE : un produit `ACTIF` portant un
    // `archiveA` renseigne affirmerait deux choses contradictoires.
    expect(apres.archive_a).toBeNull();
  });

  it("refuse d'archiver un produit deja archive", async () => {
    const produitId = await produitDeTest();
    await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);
    await catalogue.archiverProduit(produitId);

    await expect(catalogue.archiverProduit(produitId)).rejects.toMatchObject({
      name: "TransitionProduitInvalideError",
    });
  });
});

describe("C19, archiver la derniere variante archive le produit", () => {
  it("archive le produit quand sa derniere variante vivante part", async () => {
    const produitId = await produitDeTest();
    const varianteId = await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);

    await variantes.archiverVariante({ id: varianteId });

    // SANS C19, LE PRODUIT RESTERAIT `ACTIF` : la fiche s'afficherait dans le
    // catalogue sans prix ni stock, et le bouton d'achat porterait sur une
    // variante archivee.
    expect((await produitEnBase(produitId)).statut).toBe("ARCHIVE");
  });

  /**
   * LE TEST MIROIR, ET IL COMPTE AUTANT.
   *
   * Une regle ecrite trop large archiverait le produit des la premiere variante
   * archivee, retirant du catalogue une piece encore vendable dans une autre
   * declinaison. Seul ce test separe les deux versions du code.
   */
  it("laisse le produit actif s'il reste une variante vivante", async () => {
    const produitId = await produitDeTest();
    const premiere = await varianteSur(produitId);
    await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);

    await variantes.archiverVariante({ id: premiere });

    expect((await produitEnBase(produitId)).statut).toBe("ACTIF");
  });

  /**
   * UN BROUILLON RESTE UN BROUILLON.
   *
   * Il n'est pas dans le catalogue, donc il n'y a rien a en retirer, et le
   * passer en `ARCHIVE` forcerait l'exploitante a le desarchiver pour reprendre
   * un travail en cours.
   */
  it("laisse un brouillon en brouillon", async () => {
    const produitId = await produitDeTest();
    const varianteId = await varianteSur(produitId);

    await variantes.archiverVariante({ id: varianteId });

    expect((await produitEnBase(produitId)).statut).toBe("BROUILLON");
  });

  /**
   * C17 TIENT MALGRE C19 : archiver ne cree AUCUN mouvement de stock, ni pour
   * la variante ni pour le produit. La piece existe toujours et reste vendable
   * en main propre, invariant 6.
   */
  it("ne cree aucun mouvement de stock", async () => {
    const produitId = await produitDeTest();
    const varianteId = await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);

    await variantes.archiverVariante({ id: varianteId });

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM mouvement_stock WHERE variante_id = $1",
      [varianteId],
    );
    expect(rows[0].n).toBe(0);
  });
});

/*
 * LS-242, DEMANDE DE L'EXPLOITANTE EN RECETTE : publier ou archiver plusieurs
 * produits d'un geste. Le risque est une action groupee qui contournerait les
 * gardes du geste unitaire ; ces cas en exercent une, C1.
 */
describe("publierOuArchiverProduits, LS-242", () => {
  it("publie les produits conformes et nomme celui qui ne l'est pas", async () => {
    const conforme = await produitDeTest();
    await varianteSur(conforme);
    await photoPubliableSur(conforme);
    const sansVariante = await produitDeTest();
    await photoPubliableSur(sansVariante);

    const bilan = await catalogue.publierOuArchiverProduits({
      produitIds: [conforme, sansVariante],
      operation: "publier",
      acteurId: ACTEUR,
    });

    expect(bilan.reussis).toBe(1);
    expect(bilan.refus).toHaveLength(1);
    expect(bilan.refus[0]).toMatchObject({
      id: sansVariante,
      raison: "NON_PUBLIABLE",
      motifs: ["AUCUNE_VARIANTE"],
    });
    expect(bilan.refus[0]?.nom).toMatch(/^Pièce /);

    // La garde a tenu : le produit sans variante est reste en brouillon.
    expect((await produitEnBase(conforme)).statut).toBe("ACTIF");
    expect((await produitEnBase(sansVariante)).statut).toBe("BROUILLON");
  });

  it("archive une selection, et dit ce qui l'etait deja", async () => {
    const premier = await produitDeTest();
    const second = await produitDeTest();
    await catalogue.archiverProduit(second);

    const bilan = await catalogue.publierOuArchiverProduits({
      produitIds: [premier, second, premier],
      operation: "archiver",
      acteurId: ACTEUR,
    });

    // Le doublon est retire : `premier` n'est archive qu'une fois.
    expect(bilan.reussis).toBe(1);
    expect(bilan.refus.map((refus) => refus.raison)).toEqual([
      "DEJA_DANS_CET_ETAT",
    ]);
    expect((await produitEnBase(premier)).statut).toBe("ARCHIVE");
  });

  it("refuse une selection vide ou difforme sans rien ecrire", async () => {
    const intact = await produitDeTest();

    for (const produitIds of [[], ["pas-un-uuid"], "texte"]) {
      await expect(
        catalogue.publierOuArchiverProduits({
          produitIds,
          operation: "archiver",
          acteurId: ACTEUR,
        }),
      ).rejects.toThrow();
    }

    expect((await produitEnBase(intact)).statut).toBe("BROUILLON");
  });
});

describe("retrait de l'espace d'administration, LS-266 et C45", () => {
  /** Un produit publié puis archivé, à une variante épuisée : il pèse dans
   *  tous les compteurs de stock, ce qui rend son retrait mesurable. */
  async function archiveEpuise(): Promise<{
    produitId: string;
    varianteId: string;
  }> {
    const produitId = await produitDeTest();
    const varianteId = await varianteSur(produitId);
    await photoPubliableSur(produitId);
    await catalogue.publierProduit(produitId);
    await catalogue.archiverProduit(produitId);
    await client.query(
      "UPDATE variante SET quantite_physique = 0 WHERE id = $1",
      [varianteId],
    );
    return { produitId, varianteId };
  }

  it("retire un archivé sans rien supprimer ni toucher aux commandes", async () => {
    const { produitId, varianteId } = await archiveEpuise();
    const ligneId = await commandeAvecLigne(varianteId, "REF-RETRAIT", 1999);
    const { rows: avant } = await client.query(
      "SELECT * FROM ligne_commande WHERE id = $1",
      [ligneId],
    );

    await catalogue.retirerProduitDeLEspace(produitId);

    const { rows } = await client.query(
      "SELECT statut, retire_a FROM produit WHERE id = $1",
      [produitId],
    );
    expect(rows[0].statut).toBe("ARCHIVE");
    expect(rows[0].retire_a).toBeInstanceOf(Date);
    const { rowCount } = await client.query(
      "SELECT 1 FROM variante WHERE id = $1",
      [varianteId],
    );
    expect(rowCount).toBe(1);
    const { rows: apres } = await client.query(
      "SELECT * FROM ligne_commande WHERE id = $1",
      [ligneId],
    );
    expect(apres[0]).toEqual(avant[0]);
  });

  it("refuse de retirer un produit publié ou en brouillon", async () => {
    const brouillon = await produitDeTest();
    await expect(
      catalogue.retirerProduitDeLEspace(brouillon),
    ).rejects.toMatchObject({ name: "TransitionProduitInvalideError" });

    const publie = await produitDeTest();
    await varianteSur(publie);
    await photoPubliableSur(publie);
    await catalogue.publierProduit(publie);
    await expect(
      catalogue.retirerProduitDeLEspace(publie),
    ).rejects.toMatchObject({ name: "TransitionProduitInvalideError" });

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM produit WHERE retire_a IS NOT NULL",
    );
    expect(rows[0].n).toBe(0);
  });

  it("créer un produit au nom d'un retiré le dit, plutôt qu'un conflit muet", async () => {
    const { produitId } = await archiveEpuise();
    await catalogue.retirerProduitDeLEspace(produitId);
    const { rows } = await client.query(
      "SELECT nom, categorie_id FROM produit WHERE id = $1",
      [produitId],
    );

    await expect(
      catalogue.creerProduit({
        nom: rows[0].nom,
        categorieId: rows[0].categorie_id,
      }),
    ).rejects.toMatchObject({ name: "SlugDejaPrisError", parUnRetire: true });
  });

  it("un produit retiré est introuvable, et ne se republie pas", async () => {
    const { produitId } = await archiveEpuise();
    await catalogue.retirerProduitDeLEspace(produitId);

    expect(await catalogue.lireProduit(produitId)).toBeNull();
    await expect(
      catalogue.retirerProduitDeLEspace(produitId),
    ).rejects.toMatchObject({ name: "ProduitIntrouvableError" });
    await expect(catalogue.publierProduit(produitId)).rejects.toMatchObject({
      name: "ProduitIntrouvableError",
    });

    // C45 tient même si le service se trompe.
    await expect(
      client.query("UPDATE produit SET statut = 'ACTIF' WHERE id = $1", [
        produitId,
      ]),
    ).rejects.toThrow(/chk_produit_retrait_archive/);
  });

  it("disparaît des listes et des compteurs de l'administration", async () => {
    const { tableauBord, stock, statistiques, prix } = {
      tableauBord: await import("@/services/tableau-bord"),
      stock: await import("@/services/stock-multicanal"),
      statistiques: await import("@/services/statistiques"),
      prix: variantes,
    };
    const { produitId, varianteId } = await archiveEpuise();
    const { rows } = await client.query(
      "SELECT categorie_id FROM produit WHERE id = $1",
      [produitId],
    );
    const categorieId = rows[0].categorie_id as string;

    async function releve() {
      const comptages = await tableauBord.lireComptages();
      return {
        archives: (await catalogue.listerProduitsAdministration(["ARCHIVE"]))
          .map((p) => p.id)
          .includes(produitId),
        nombreArchives: await catalogue.compterProduitsArchives(),
        stock: (await stock.lireEtatStock())
          .map((v) => v.varianteId)
          .includes(varianteId),
        indisponibles: comptages.variantesIndisponibles,
        stockFaible: comptages.variantesStockFaible,
        invendues: (
          await statistiques.lireStatistiques("mois")
        ).variantesInvendues
          .map((v) => v.varianteId)
          .includes(varianteId),
        categorie: (await catalogue.listerCategories()).find(
          (c) => c.id === categorieId,
        )?.nombreProduits,
        categorieRetires: (await catalogue.listerCategories()).find(
          (c) => c.id === categorieId,
        )?.nombreRetires,
        prix: (
          await prix.previsualiserPrixProduits({
            produitIds: [produitId],
            prixEuros: "10",
          })
        ).lignes.length,
      };
    }

    const avant = await releve();
    expect(avant).toMatchObject({
      archives: true,
      stock: true,
      invendues: true,
      categorie: 1,
      categorieRetires: 0,
      prix: 1,
    });

    await catalogue.retirerProduitDeLEspace(produitId);
    const apres = await releve();

    expect(apres).toMatchObject({
      archives: false,
      stock: false,
      invendues: false,
      categorie: 0,
      categorieRetires: 1,
      prix: 0,
    });
    expect(apres.nombreArchives).toBe(avant.nombreArchives - 1);
    expect(apres.indisponibles).toBe(avant.indisponibles - 1);
    expect(apres.stockFaible).toBe(avant.stockFaible - 1);

    // La catégorie reste occupée, C26, et le refus le dit.
    await expect(
      catalogue.supprimerCategorie(categorieId),
    ).rejects.toMatchObject({
      name: "CategorieNonVideError",
      nombreProduits: 1,
      nombreRetires: 1,
    });
  });

  /**
   * LA COURSE QUE C45 FERME : une republication qui croise le retrait. Sans la
   * contrainte, la publication relit « ARCHIVE », le retrait pose sa date, et
   * la publication écrit « ACTIF » : un produit en vente qu'aucun écran de
   * l'administration ne montre plus.
   */
  it("une republication qui croise le retrait ne laisse jamais un produit actif retiré", async () => {
    for (let essai = 0; essai < 8; essai += 1) {
      const { produitId, varianteId } = await archiveEpuise();
      await client.query(
        "UPDATE variante SET quantite_physique = 2 WHERE id = $1",
        [varianteId],
      );

      const issues = await Promise.allSettled([
        catalogue.publierProduit(produitId),
        catalogue.retirerProduitDeLEspace(produitId),
      ]);

      // LE PERDANT EST UN REFUS NOMMÉ, jamais une violation de C45 rendue en
      // panne : relevé par `ls-critical-reviewer`.
      for (const issue of issues) {
        if (issue.status === "rejected") {
          expect([
            "ProduitIntrouvableError",
            "TransitionProduitInvalideError",
          ]).toContain((issue.reason as Error).name);
        }
      }

      const { rows } = await client.query(
        "SELECT statut, retire_a FROM produit WHERE id = $1",
        [produitId],
      );
      const etat = rows[0] as { statut: string; retire_a: Date | null };
      expect(etat.retire_a === null || etat.statut === "ARCHIVE").toBe(true);
    }
  });
});

/**
 * Retrait groupé depuis la liste des archivés, LS-279. Chaque produit passe
 * par le geste unitaire de LS-266 : un groupe ne contourne pas C45.
 */
describe("retirerProduitsDeLEspace, LS-279", () => {
  it("retire les archivés, nomme celui qui ne l'est pas, sans rien supprimer", async () => {
    const premier = await produitDeTest();
    await catalogue.archiverProduit(premier);
    const second = await produitDeTest();
    await catalogue.archiverProduit(second);
    const brouillon = await produitDeTest();

    const bilan = await catalogue.retirerProduitsDeLEspace({
      produitIds: [premier, brouillon, second, premier],
    });

    // Le doublon est retiré de la sélection : `premier` compte une fois.
    expect(bilan.reussis).toBe(2);
    expect(bilan.refus).toHaveLength(1);
    expect(bilan.refus[0]).toMatchObject({
      id: brouillon,
      raison: "NON_ARCHIVE",
    });
    expect(bilan.refus[0]?.nom).toMatch(/^Pièce /);

    const { rows } = await client.query(
      "SELECT id, statut, retire_a FROM produit WHERE id = ANY($1::text[])",
      [[premier, second, brouillon]],
    );
    expect(rows).toHaveLength(3);
    const parId = new Map(rows.map((ligne) => [ligne.id, ligne]));
    expect(parId.get(premier)?.retire_a).toBeInstanceOf(Date);
    expect(parId.get(second)?.retire_a).toBeInstanceOf(Date);
    expect(parId.get(brouillon)?.retire_a).toBeNull();
    expect(parId.get(brouillon)?.statut).toBe("BROUILLON");
  });

  it("distingue un produit déjà retiré d'un produit inconnu", async () => {
    const retire = await produitDeTest();
    await catalogue.archiverProduit(retire);
    await catalogue.retirerProduitDeLEspace(retire);
    const inconnu = randomUUID();

    const bilan = await catalogue.retirerProduitsDeLEspace({
      produitIds: [retire, inconnu],
    });

    expect(bilan.reussis).toBe(0);
    // Déjà retiré, deux onglets ouverts : jamais « n'existe plus », la
    // confirmation ayant promis que rien n'est effacé.
    expect(bilan.refus.map((refus) => refus.raison)).toEqual([
      "DEJA_RETIRE",
      "INTROUVABLE",
    ]);
  });

  it("refuse une sélection vide ou difforme sans rien écrire", async () => {
    const intact = await produitDeTest();
    await catalogue.archiverProduit(intact);

    for (const produitIds of [[], ["pas-un-uuid"], "texte"]) {
      await expect(
        catalogue.retirerProduitsDeLEspace({ produitIds }),
      ).rejects.toThrow();
    }

    const { rows } = await client.query(
      "SELECT retire_a FROM produit WHERE id = $1",
      [intact],
    );
    expect(rows[0].retire_a).toBeNull();
  });
});

/*
 * LS-278 : LE 4 OCTOBRE 2026, LES 51 PRODUITS ONT ETE ARCHIVES D'UN SEUL
 * GESTE, sans confirmation, sans trace d'auteur et sans alerte. Ces cas
 * exercent la confirmation renforcee, le journal d'audit et l'alerte de
 * catalogue vide.
 *
 * L'ETAT GLOBAL DU CATALOGUE COMPTE ICI, et la base est partagee entre
 * fichiers : chaque cas part d'un catalogue que ce fichier a vide lui-meme.
 */
describe("archivage massif, LS-278", () => {
  beforeEach(async () => {
    await client.query("TRUNCATE produit, categorie CASCADE");
    await client.query(
      "DELETE FROM alerte_critique WHERE type = 'CATALOGUE_VIDE'",
    );
  });

  afterEach(async () => {
    await client.query(
      "DELETE FROM alerte_critique WHERE type = 'CATALOGUE_VIDE'",
    );
  });

  async function produitPublie(): Promise<string> {
    const id = await produitDeTest();
    await varianteSur(id);
    await photoPubliableSur(id);
    await catalogue.publierProduit(id);
    return id;
  }

  async function alertesCatalogueVide(): Promise<number> {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM alerte_critique WHERE type = 'CATALOGUE_VIDE' AND acquittee_a IS NULL",
    );
    return rows[0].n;
  }

  async function tracesArchivage() {
    const { rows } = await client.query(
      "SELECT acteur_id, id_cible, detail FROM journal_audit WHERE action = 'ARCHIVAGE_PRODUITS' AND acteur_id = $1 ORDER BY cree_a",
      [ACTEUR],
    );
    return rows;
  }

  beforeEach(async () => {
    await client.query("DELETE FROM journal_audit WHERE acteur_id = $1", [
      ACTEUR,
    ]);
  });

  it("refuse d'archiver toutes les pieces publiees sans le nombre tape, et n'archive rien", async () => {
    const a = await produitPublie();
    const b = await produitPublie();
    const brouillon = await produitDeTest();

    for (const confirmationNombre of [undefined, "", "3", "deux", "2,0"]) {
      const refus = await catalogue
        .publierOuArchiverProduits({
          produitIds: [a, b, brouillon],
          operation: "archiver",
          confirmationNombre,
          acteurId: ACTEUR,
        })
        .catch((erreur: unknown) => erreur);

      expect(refus).toBeInstanceOf(catalogue.ConfirmationRenforceeRequiseError);
      // Le nombre demande est celui des pieces PUBLIEES, pas de la selection.
      expect((refus as { nombre: number }).nombre).toBe(2);
    }

    expect((await produitEnBase(a)).statut).toBe("ACTIF");
    expect((await produitEnBase(b)).statut).toBe("ACTIF");
    expect((await produitEnBase(brouillon)).statut).toBe("BROUILLON");
    expect(await tracesArchivage()).toHaveLength(0);
    expect(await alertesCatalogueVide()).toBe(0);
  });

  it("archive tout avec le bon nombre, trace l'auteur et leve l'alerte de catalogue vide", async () => {
    const a = await produitPublie();
    const b = await produitPublie();

    const bilan = await catalogue.publierOuArchiverProduits({
      produitIds: [a, b],
      operation: "archiver",
      confirmationNombre: " 2 ",
      acteurId: ACTEUR,
    });

    expect(bilan.reussis).toBe(2);
    expect((await produitEnBase(a)).statut).toBe("ARCHIVE");

    const traces = await tracesArchivage();
    expect(traces).toHaveLength(1);
    expect(traces[0].id_cible).toBe("selection");
    expect(traces[0].detail.nombre).toBe(2);
    expect([...traces[0].detail.produitIds].sort()).toEqual([a, b].sort());

    expect(await alertesCatalogueVide()).toBe(1);
  });

  it("n'exige rien quand une piece publiee reste en vente, et ne leve aucune alerte", async () => {
    const archivee = await produitPublie();
    const restante = await produitPublie();

    const bilan = await catalogue.publierOuArchiverProduits({
      produitIds: [archivee],
      operation: "archiver",
      acteurId: ACTEUR,
    });

    expect(bilan.reussis).toBe(1);
    expect((await produitEnBase(restante)).statut).toBe("ACTIF");
    expect(await tracesArchivage()).toHaveLength(1);
    expect(await alertesCatalogueVide()).toBe(0);
  });

  it("archiver la derniere piece depuis sa fiche trace l'auteur et alerte, une seule fois", async () => {
    const derniere = await produitPublie();

    await catalogue.archiverProduitPar(derniere, ACTEUR);

    const traces = await tracesArchivage();
    expect(traces).toHaveLength(1);
    expect(traces[0].id_cible).toBe(derniere);
    expect(traces[0].detail.nombre).toBe(1);
    expect(await alertesCatalogueVide()).toBe(1);

    // Un second signal sur une boutique deja vide se tait : une alerte ouverte.
    expect(await catalogue.signalerSiCatalogueVide()).toBe(true);
    expect(await alertesCatalogueVide()).toBe(1);
  });

  it("un catalogue qui garde une piece ne signale rien", async () => {
    await produitPublie();
    expect(await catalogue.signalerSiCatalogueVide()).toBe(false);
    expect(await alertesCatalogueVide()).toBe(0);
  });
});

/*
 * LS-260, refonte de l'accueil du 8 octobre 2026 : chaque catégorie porte la
 * VRAIE photo de sa pièce la plus récemment publiée, et le nombre de pièces
 * en vente. Les assertions portent sur la catégorie que le cas a créée, la
 * base étant partagée entre fichiers.
 */
describe("couvertures des catégories de l'accueil, LS-260", () => {
  async function publieeDans(categorieId: string, publieA: string) {
    const produit = await catalogue.creerProduit({
      nom: `Pièce ${randomUUID().slice(0, 8)}`,
      categorieId,
    });
    await varianteSur(produit.id);
    const media = await photoPubliableSur(produit.id);
    await catalogue.publierProduit(produit.id);
    await client.query("UPDATE produit SET publie_a = $2 WHERE id = $1", [
      produit.id,
      publieA,
    ]);
    const { rows } = await client.query(
      "SELECT chemin FROM media WHERE id = $1",
      [media],
    );
    return { produitId: produit.id, chemin: rows[0].chemin as string };
  }

  async function couvertureDe(categorieId: string) {
    return (await catalogue.lireCouverturesCategories()).find(
      (couverture) => couverture.categorieId === categorieId,
    );
  }

  it("prend la photo de la pièce la plus récemment publiée, et compte les pièces en vente", async () => {
    const categorie = await catalogue.creerCategorie({
      nom: `Rangement ${randomUUID().slice(0, 8)}`,
    });
    await publieeDans(categorie.id, "2026-09-01T10:00:00Z");
    const recente = await publieeDans(categorie.id, "2026-10-01T10:00:00Z");
    const brouillon = await catalogue.creerProduit({
      nom: `Pièce ${randomUUID().slice(0, 8)}`,
      categorieId: categorie.id,
    });
    await varianteSur(brouillon.id);

    const couverture = await couvertureDe(categorie.id);

    expect(couverture?.nombre).toBe(2);
    expect(couverture?.chemin).toBe(recente.chemin);
  });

  it("une pièce archivée sort du compte et de la couverture", async () => {
    const categorie = await catalogue.creerCategorie({
      nom: `Rangement ${randomUUID().slice(0, 8)}`,
    });
    const ancienne = await publieeDans(categorie.id, "2026-09-01T10:00:00Z");
    const recente = await publieeDans(categorie.id, "2026-10-01T10:00:00Z");
    await catalogue.archiverProduit(recente.produitId);

    const couverture = await couvertureDe(categorie.id);

    expect(couverture?.nombre).toBe(1);
    expect(couverture?.chemin).toBe(ancienne.chemin);
  });

  it("une catégorie sans pièce en vente n'a aucune couverture", async () => {
    const categorie = await catalogue.creerCategorie({
      nom: `Rangement ${randomUUID().slice(0, 8)}`,
    });
    const seule = await publieeDans(categorie.id, "2026-10-01T10:00:00Z");
    await catalogue.archiverProduit(seule.produitId);

    expect(await couvertureDe(categorie.id)).toBeUndefined();
  });
});
