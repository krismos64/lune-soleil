/**
 * Fiche produit publique, sur base reelle. LS-105.
 *
 * CE QUE CES TESTS PROUVENT ET QU'AUCUN RENDU NE MONTRERAIT :
 *
 *   - un BROUILLON atteint par son slug, c'est-a-dire du travail en cours et
 *     des prix non arretes servis a qui devine l'adresse
 *   - la disponibilite calculee PAR VARIANTE et non cumulee, la fiche devant
 *     dire l'etat de la declinaison choisie
 *   - les sections masquees ou vides qui laisseraient un titre suivi d'un trou
 *   - les medias non traites, dont les URL repondraient 404 sur une page
 *     publique
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL, lecon de LS-50. Le SQL prepare l'etat et constate, rien de plus.
 *
 * AUCUNE DONNEE DU PROTOTYPE, interdit du projet : ni Alba, ni Eclipse, ni les
 * prix de la demonstration. Les noms sont neutres et inventes ici.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let catalogue: typeof import("@/services/catalogue");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  catalogue = await import("@/services/catalogue");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query(
    "TRUNCATE produit, categorie, media, section_produit CASCADE",
  );
});

/** Cree une categorie et rend son identifiant. */
async function creerCategorie(nom: string): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO categorie (id, nom, slug, ordre, cree_a)
     VALUES ($1, $2, $3, (SELECT coalesce(max(ordre), 0) + 1 FROM categorie), now())`,
    [
      id,
      nom,
      `${nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${id.slice(0, 8)}`,
    ],
  );
  return id;
}

type OptionsProduit = {
  statut?: "BROUILLON" | "ACTIF" | "ARCHIVE";
  descriptionCourte?: string | null;
};

/**
 * Cree un produit SANS variante, et rend son identifiant et son slug.
 *
 * SANS VARIANTE DELIBEREMENT : chaque test ajoute les siennes avec les valeurs
 * qu'il exerce. La fiche affichant une disponibilite PAR variante, un helper
 * qui en poserait une par defaut masquerait le cas a plusieurs declinaisons,
 * qui est le coeur de cette story.
 */
async function creerProduit(
  nom: string,
  options: OptionsProduit = {},
): Promise<{ id: string; slug: string }> {
  const { statut = "ACTIF", descriptionCourte = "Une piece faite main." } =
    options;

  const categorieId = await creerCategorie(`Cat ${nom}`);
  const id = randomUUID();
  const slug = `produit-${id.slice(0, 8)}`;

  await client.query(
    `INSERT INTO produit (
       id, categorie_id, nom, slug, description_courte, statut,
       publie_a, cree_a, modifie_a
     )
     VALUES ($1, $2, $3, $4, $5, $6, now(), now(), now())`,
    [id, categorieId, nom, slug, descriptionCourte, statut],
  );

  return { id, slug };
}

type OptionsVariante = {
  libelle?: string;
  dimensions?: string | null;
  prixCentimes?: number;
  quantitePhysique?: number;
  quantiteReservee?: number;
  venteWebActivee?: boolean;
  archivee?: boolean;
};

/** Ajoute une variante a un produit. Les defauts decrivent le cas vendable. */
async function creerVariante(
  produitId: string,
  options: OptionsVariante = {},
): Promise<string> {
  const {
    libelle = "Déclinaison",
    dimensions = null,
    prixCentimes = 4900,
    quantitePhysique = 3,
    quantiteReservee = 0,
    venteWebActivee = true,
    archivee = false,
  } = options;

  const id = randomUUID();
  await client.query(
    `INSERT INTO variante (
       id, produit_id, reference, libelle, dimensions, prix_centimes,
       quantite_physique, quantite_reservee, vente_web_activee, archivee_a, cree_a
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
    [
      id,
      produitId,
      `REF-${id.slice(0, 8).toUpperCase()}`,
      libelle,
      dimensions,
      prixCentimes,
      quantitePhysique,
      quantiteReservee,
      venteWebActivee,
      archivee ? new Date() : null,
    ],
  );
  return id;
}

type OptionsSection = {
  visible?: boolean;
  contenu?: string;
  ordre?: number;
};

/** Ajoute une section editoriale a un produit. */
async function creerSection(
  produitId: string,
  titre: string,
  options: OptionsSection = {},
): Promise<string> {
  const {
    visible = true,
    contenu = "Du texte de section.",
    ordre = 1,
  } = options;

  const id = randomUUID();
  await client.query(
    /*
     * `modifie_a` EST ECRITE A LA MAIN ICI. Elle porte `@updatedAt` dans le
     * schema, que PRISMA renseigne : ce SQL brut passe a cote, et la colonne
     * etant non nulle, l'insertion echoue sans elle.
     */
    `INSERT INTO section_produit (id, produit_id, cle, titre, contenu, ordre, visible, cree_a, modifie_a)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [id, produitId, `cle-${id.slice(0, 8)}`, titre, contenu, ordre, visible],
  );
  return id;
}

/** Ajoute une photographie a un produit. */
async function creerMedia(
  produitId: string,
  ordre: number,
  statut: "EN_ATTENTE" | "TRAITE" | "ECHOUE" = "TRAITE",
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO media (id, produit_id, chemin, texte_alternatif, ordre, statut_traitement, cree_a)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [
      id,
      produitId,
      `produits/${produitId}/${id.slice(0, 8)}/`,
      `Vue numéro ${ordre}`,
      ordre,
      statut,
    ],
  );
  return id;
}

describe("ce qui est servi, et ce qui ne l'est pas", () => {
  it("rend un produit actif avec sa categorie et sa presentation courte", async () => {
    const { id, slug } = await creerProduit("Bague fine", {
      descriptionCourte: "Anneau martelé à la main.",
    });
    await creerVariante(id, { prixCentimes: 3200 });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche).toMatchObject({
      nom: "Bague fine",
      descriptionCourte: "Anneau martelé à la main.",
      categorieNom: "Cat Bague fine",
    });
    expect(fiche?.variantes).toHaveLength(1);
    expect(fiche?.variantes[0]).toMatchObject({
      prixCentimes: 3200,
      disponibilite: "EN_STOCK",
    });
  });

  /*
   * LE TEST QUI COMPTE LE PLUS DE CE FICHIER, et le seul qui porte sur une
   * fuite. Un brouillon porte du travail en cours et des prix non arretes : le
   * servir a qui devine son slug publierait ce que l'exploitante n'a pas decide
   * de publier.
   *
   * LE SLUG EST CONNU DU TEST, ce qui est precisement le scenario redoute : la
   * garde ne doit pas reposer sur l'ignorance de l'adresse.
   */
  it("ne sert jamais un produit en brouillon, meme par son slug exact", async () => {
    const { id, slug } = await creerProduit("Brouillon secret", {
      statut: "BROUILLON",
    });
    await creerVariante(id);

    expect(await catalogue.lireFichePublique(slug)).toBeNull();
  });

  it("ne sert jamais un produit archive", async () => {
    const { id, slug } = await creerProduit("Piece retiree", {
      statut: "ARCHIVE",
    });
    await creerVariante(id);

    expect(await catalogue.lireFichePublique(slug)).toBeNull();
  });

  /*
   * UN SLUG INCONNU ET UN BROUILLON RENDENT LA MEME REPONSE. Distinguer les
   * deux dirait a un visiteur quels slugs existent en brouillon, donc quels
   * produits sont en preparation. C'est le meme raisonnement que la redirection
   * de l'editeur d'administration, LS-100.
   */
  it("rend la meme reponse pour un slug inconnu que pour un brouillon", async () => {
    const { id, slug } = await creerProduit("En preparation", {
      statut: "BROUILLON",
    });
    await creerVariante(id);

    const surBrouillon = await catalogue.lireFichePublique(slug);
    const surInconnu = await catalogue.lireFichePublique("nexiste-pas-du-tout");

    expect(surBrouillon).toBeNull();
    expect(surInconnu).toBeNull();
  });
});

describe("la disponibilite est calculee par variante", () => {
  /*
   * LE DEFAUT QUE CE TEST ATTRAPE : cumuler les quantites comme le fait le
   * CATALOGUE. Sur une fiche, le cumul dirait « en stock » alors que la
   * declinaison affichee est epuisee, et le client choisirait une taille qu'il
   * ne peut pas acheter.
   */
  it("rend un etat different par declinaison, sans cumuler", async () => {
    const { id, slug } = await creerProduit("Collier deux tailles");
    await creerVariante(id, { libelle: "40 cm", quantitePhysique: 5 });
    await creerVariante(id, { libelle: "45 cm", quantitePhysique: 0 });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.variantes).toHaveLength(2);
    expect(fiche?.variantes.map((v) => [v.libelle, v.disponibilite])).toEqual([
      ["40 cm", "EN_STOCK"],
      ["45 cm", "EPUISE"],
    ]);
  });

  it("annonce la derniere piece a exactement un exemplaire", async () => {
    const { id, slug } = await creerProduit("Piece unique");
    await creerVariante(id, { quantitePhysique: 1 });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.variantes[0]?.disponibilite).toBe("DERNIERE_PIECE");
  });

  /*
   * LA RESERVATION D'UN AUTRE CLIENT REND LA PIECE INDISPONIBLE. Afficher la
   * seule quantite physique promettrait un bijou deja engage dans une commande
   * en cours de paiement. C'est la meme formule que la reservation atomique de
   * `stock.ts`.
   */
  it("retranche les reservations actives de la disponibilite", async () => {
    const { id, slug } = await creerProduit("Piece reservee");
    await creerVariante(id, { quantitePhysique: 1, quantiteReservee: 1 });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.variantes[0]?.disponibilite).toBe("EPUISE");
  });

  /*
   * LA VENTE WEB COUPEE DONNE « EPUISE », ELLE NE FAIT PAS DISPARAITRE. C'est
   * l'invariant 6 et l'arbitrage de LS-104 : une piece partie sur un marche
   * garde son adresse publique et son referencement.
   */
  it("garde la variante hors vente web, en la donnant epuisee", async () => {
    const { id, slug } = await creerProduit("Piece au marche");
    await creerVariante(id, { quantitePhysique: 4, venteWebActivee: false });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.variantes).toHaveLength(1);
    expect(fiche?.variantes[0]?.disponibilite).toBe("EPUISE");
  });

  /*
   * L'ARCHIVAGE, LUI, RETIRE. C13 : une variante archivee n'est jamais
   * supprimee mais ne se vend plus, et la proposer au choix promettrait une
   * declinaison retiree du catalogue.
   */
  it("exclut une variante archivee du choix", async () => {
    const { id, slug } = await creerProduit("Ancienne taille");
    await creerVariante(id, { libelle: "Actuelle" });
    await creerVariante(id, { libelle: "Retiree", archivee: true });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.variantes.map((v) => v.libelle)).toEqual(["Actuelle"]);
  });

  /*
   * AUCUNE QUANTITE N'EST EXPOSEE. Le type ne porte pas le champ, ce que
   * TypeScript verifie deja ; ce test verifie l'OBJET REEL, car une propriete
   * surnumeraire passerait le typage et partirait quand meme au navigateur.
   */
  /*
   * LA QUANTITE CHERCHEE EST UNE VALEUR IMPROBABLE, et c'est ce qui rend ce
   * test utilisable. Une premiere version posait 7 en stock et cherchait « 7 »
   * dans la fiche serialisee : elle rougissait sur les UUID et sur le prix,
   * donc elle aurait rougi quel que soit le code, sans rien prouver.
   *
   * LES VALEURS SONT PARCOURUES, PAS LA CHAINE. Chercher dans le JSON entier
   * ferait dependre le test des identifiants engendres ; comparer les valeurs
   * NUMERIQUES une a une ne voit que ce que la fiche expose vraiment.
   */
  it("n'expose aucune quantite exacte", async () => {
    const quantiteImprobable = 8123;
    const { id, slug } = await creerProduit("Stock abondant");
    await creerVariante(id, { quantitePhysique: quantiteImprobable });

    const fiche = await catalogue.lireFichePublique(slug);

    const cles = Object.keys(fiche?.variantes[0] ?? {});
    expect(cles).not.toContain("quantitePhysique");
    expect(cles).not.toContain("quantiteReservee");
    expect(cles).not.toContain("quantiteDisponible");

    const valeurs = Object.values(fiche?.variantes[0] ?? {});
    expect(valeurs).not.toContain(quantiteImprobable);

    // L'etat reste juste : masquer la quantite ne doit pas masquer le stock.
    expect(fiche?.variantes[0]?.disponibilite).toBe("EN_STOCK");
  });
});

describe("les sections editoriales, C22 et C23", () => {
  it("rend les sections visibles dans l'ordre choisi par l'administratrice", async () => {
    const { id, slug } = await creerProduit("Piece a sections");
    await creerSection(id, "Fabrication", { ordre: 2 });
    await creerSection(id, "Matières et composants", { ordre: 1 });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.sections.map((s) => s.titre)).toEqual([
      "Matières et composants",
      "Fabrication",
    ]);
  });

  /* C22 : une section masquee ne s'affiche pas, titre compris. */
  it("omet une section masquee", async () => {
    const { id, slug } = await creerProduit("Section masquee");
    await creerSection(id, "Visible", { ordre: 1 });
    await creerSection(id, "Masquee", { ordre: 2, visible: false });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.sections.map((s) => s.titre)).toEqual(["Visible"]);
  });

  /* C23 : une section sans contenu ne laisse aucun trou, ni titre orphelin. */
  it("omet une section au contenu vide", async () => {
    const { id, slug } = await creerProduit("Section vide");
    await creerSection(id, "Remplie", { ordre: 1 });
    await creerSection(id, "Vide", { ordre: 2, contenu: "" });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.sections.map((s) => s.titre)).toEqual(["Remplie"]);
  });

  /*
   * LE CAS QUE `!== ""` LAISSERAIT PASSER. Une section dont le contenu ne porte
   * que des espaces et des retours a la ligne est vide au sens de la regle :
   * son titre s'afficherait au-dessus d'un blanc.
   */
  it("omet une section dont le contenu n'est qu'espaces et retours a la ligne", async () => {
    const { id, slug } = await creerProduit("Section blanche");
    await creerSection(id, "Remplie", { ordre: 1 });
    await creerSection(id, "Blanche", { ordre: 2, contenu: "  \n\n \t " });

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.sections.map((s) => s.titre)).toEqual(["Remplie"]);
  });
});

describe("la galerie de photographies", () => {
  it("rend les photographies traitees dans leur ordre", async () => {
    const { id, slug } = await creerProduit("Piece photographiee");
    await creerMedia(id, 2);
    await creerMedia(id, 1);

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.photos).toHaveLength(2);
    expect(fiche?.photos.map((p) => p.texteAlternatif)).toEqual([
      "Vue numéro 1",
      "Vue numéro 2",
    ]);
  });

  /*
   * UN MEDIA NON TRAITE N'A AUCUN FICHIER SOUS `public/`. Le rendre poserait
   * des balises `source` vers des URL qui repondent 404, donc un cadre casse
   * sur une page publique.
   */
  it("omet les medias en attente et en echec", async () => {
    const { id, slug } = await creerProduit("Traitement partiel");
    await creerMedia(id, 1, "TRAITE");
    await creerMedia(id, 2, "EN_ATTENTE");
    await creerMedia(id, 3, "ECHOUE");

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche?.photos.map((p) => p.texteAlternatif)).toEqual([
      "Vue numéro 1",
    ]);
  });

  /* Une fiche sans photo reste servie, avec une galerie vide. */
  it("sert une fiche sans photographie", async () => {
    const { id, slug } = await creerProduit("Sans photo");
    await creerVariante(id);

    const fiche = await catalogue.lireFichePublique(slug);

    expect(fiche).not.toBeNull();
    expect(fiche?.photos).toEqual([]);
  });
});
