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
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let racineMedias: string;
let catalogue: typeof import("@/services/catalogue");
let variantes: typeof import("@/services/variante");
let medias: typeof import("@/services/media");

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
});

afterAll(async () => {
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
