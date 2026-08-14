/**
 * Sections editoriales de la fiche produit, sur base reelle. LS-100, LS-87.
 *
 * CES TESTS SONT ECRITS AVANT LE SERVICE. Ils portent sur les trois endroits ou
 * du code d'apparence juste produit un etat faux :
 *
 *   C22  l'ordre est unique par produit, sous contrainte DIFFERABLE. Echanger
 *        deux rangs viole l'unicite ENTRE les deux ecritures. Une contrainte
 *        ordinaire rejetterait la premiere mise a jour, mesure sur PostgreSQL
 *        18.4 et consigne dans ADR-026, decision 5 bis.
 *   ADR-026 decision 5, une section supprimee NE REAPPARAIT JAMAIS. Une
 *        initialisation ecrite naivement, du type « garantir que les quatre
 *        sections existent » rejouee a chaque enregistrement, la ferait revenir
 *        vide. Le test qui l'attrape enregistre le produit APRES la suppression.
 *   LS-87, QUATRE sections proposees et non cinq. Le prototype en propose une
 *        cinquieme, `dimensions`, qu'ADR-026 ecarte : la dimension appartient a
 *        `Variante.dimensions` et varie d'une declinaison a l'autre.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL : lecon de LS-50. Le SQL ne sert qu'a preparer un etat ou constater un
 * resultat, jamais a rejouer ce que le service est cense faire.
 *
 * AUCUNE DONNEE DU PROTOTYPE : ni Eclipse, ni Alba, ni Boucles.
 */
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inject } from "vitest";

import type { Section } from "@/services/sections-produit";

import { VARIABLE_URL_TEST } from "../aide/base-ephemere";

let client: Client;
let catalogue: typeof import("@/services/catalogue");
let sections: typeof import("@/services/sections-produit");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  client = new Client({ connectionString: url });
  await client.connect();

  catalogue = await import("@/services/catalogue");
  sections = await import("@/services/sections-produit");
});

afterAll(async () => {
  await client.end();
});

afterEach(async () => {
  await client.query("TRUNCATE produit, categorie CASCADE");
});

/** Cree une categorie et un produit, et rend l'identifiant du produit. */
async function produitDeTest(nom = "Pièce d'essai"): Promise<string> {
  const categorie = await catalogue.creerCategorie({ nom: "Rangement" });
  const produit = await catalogue.creerProduit({
    nom,
    categorieId: categorie.id,
  });
  return produit.id;
}

/**
 * Section a la position donnee, ou echec explicite.
 *
 * `noUncheckedIndexedAccess` rend tout acces indexe potentiellement indefini.
 * Un `!` le ferait taire et produirait un « cannot read property of undefined »
 * au milieu du test, sans dire QUELLE attente a ete decue : ce repli nomme la
 * position manquante.
 */
function a(liste: Section[], position: number): Section {
  const section = liste[position];
  if (!section) {
    throw new Error(`Aucune section en position ${position}.`);
  }
  return section;
}

/** Section portant cette cle, ou echec explicite. */
function parCle(liste: Section[], cle: string): Section {
  const section = liste.find((s) => s.cle === cle);
  if (!section) {
    throw new Error(`Aucune section de cle ${cle}.`);
  }
  return section;
}

/** Les cles des sections d'un produit, dans l'ordre d'affichage. */
async function clesDansLOrdre(produitId: string): Promise<string[]> {
  const { rows } = await client.query(
    "SELECT cle FROM section_produit WHERE produit_id = $1 ORDER BY ordre ASC",
    [produitId],
  );
  return rows.map((r) => r.cle as string);
}

describe("sections par defaut a la creation, ADR-026 et LS-87", () => {
  /**
   * QUATRE SECTIONS, ET LE COMPTE EST L'ASSERTION QUI PORTE LS-87. Le prototype
   * en propose cinq, avec `dimensions` en troisieme position. Un compte non
   * verifie laisserait la cinquieme revenir sans que rien ne rougisse.
   */
  it("cree exactement quatre sections, dans l'ordre d'ADR-026", async () => {
    const produitId = await produitDeTest();

    expect(await clesDansLOrdre(produitId)).toEqual([
      "description",
      "matieres",
      "fabrication",
      "entretien",
    ]);
  });

  /**
   * AUCUNE SECTION `dimensions`, LS-87. L'assertion est ecrite separement du
   * compte : une cinquieme section portant un autre nom serait vue par le test
   * precedent, celle-ci nomme le cas precis que le prototype presente.
   */
  it("ne propose aucune section de dimensions, elles sont portees par la variante", async () => {
    const produitId = await produitDeTest();

    expect(await clesDansLOrdre(produitId)).not.toContain("dimensions");
  });

  /** Les rangs partent de 1, `chk_section_ordre_positif`. */
  it("numerote les rangs de 1 a 4 sans trou", async () => {
    const produitId = await produitDeTest();

    const { rows } = await client.query(
      "SELECT ordre FROM section_produit WHERE produit_id = $1 ORDER BY ordre ASC",
      [produitId],
    );
    expect(rows.map((r) => r.ordre)).toEqual([1, 2, 3, 4]);
  });

  /**
   * LE CONTENU EST VIDE ET LE TITRE NE L'EST PAS. C'est l'etat normal d'une
   * section proposee mais pas encore redigee, et `chk_section_titre_non_vide`
   * rejetterait un titre vide.
   */
  it("propose des sections visibles, titrees et vides de contenu", async () => {
    const produitId = await produitDeTest();

    const { rows } = await client.query(
      "SELECT titre, contenu, visible FROM section_produit WHERE produit_id = $1 ORDER BY ordre ASC",
      [produitId],
    );

    expect(rows.map((r) => r.titre)).toEqual([
      "Description détaillée",
      "Matières et composants",
      "Fabrication",
      "Conseils d'entretien",
    ]);
    expect(rows.every((r) => r.contenu === "")).toBe(true);
    expect(rows.every((r) => r.visible === true)).toBe(true);
  });

  /**
   * LA CREATION EST ATOMIQUE. Si les sections echouaient apres l'ecriture du
   * produit, la boutique porterait un produit sans aucune section et l'ecran
   * n'aurait aucun moyen de distinguer ce cas d'une suppression volontaire des
   * quatre : ADR-026 interdisant de les recreer, elles seraient perdues.
   */
  it("n'ecrit aucun produit si les sections ne peuvent pas s'ecrire", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Rangement" });

    // La contrainte differable leve au COMMIT, ce qui annule TOUTE la
    // transaction, produit compris. Une section preexistante au rang 1 est
    // impossible avant creation : le defaut se simule en interdisant l'ecriture
    // par un declencheur, plus fidele qu'un mock du depot.
    await client.query(`
      CREATE FUNCTION refuser_section() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'section refusee'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER t_refuser_section BEFORE INSERT ON section_produit
      FOR EACH ROW EXECUTE FUNCTION refuser_section();
    `);

    try {
      await expect(
        catalogue.creerProduit({
          nom: "Pièce jamais née",
          categorieId: categorie.id,
        }),
      ).rejects.toThrow();

      const { rows } = await client.query(
        "SELECT count(*)::int AS n FROM produit",
      );
      expect(rows[0].n).toBe(0);
    } finally {
      await client.query(`
        DROP TRIGGER t_refuser_section ON section_produit;
        DROP FUNCTION refuser_section();
      `);
    }
  });
});

describe("une section supprimee ne reapparait jamais, ADR-026 decision 5", () => {
  /**
   * LE TEST CENTRAL DE LA STORY AVEC CELUI DU REORDONNANCEMENT.
   *
   * Il enregistre le produit APRES la suppression, ce qui est exactement le
   * geste qu'une initialisation defensive rattraperait en silence. Un test qui
   * se contenterait de supprimer puis de relire ne verrait rien : le defaut
   * n'apparait qu'au reenregistrement suivant.
   */
  it("ne recree pas une section supprimee lors d'un enregistrement ulterieur", async () => {
    const produitId = await produitDeTest();

    const avant = await sections.listerSections(produitId);
    const entretien = parCle(avant, "entretien");
    await sections.supprimerSection({ id: entretien.id });

    // LE REENREGISTREMENT, c'est-a-dire le geste ordinaire de l'administratrice
    // qui corrige le nom du produit et enregistre.
    await catalogue.enregistrerInformationsProduit({
      id: produitId,
      nom: "Pièce d'essai revue",
      descriptionCourte: "Une ligne de présentation.",
    });

    expect(await clesDansLOrdre(produitId)).toEqual([
      "description",
      "matieres",
      "fabrication",
    ]);
  });

  /** La suppression efface la ligne, contenu compris, ADR-026 decision 5. */
  it("efface la ligne et son contenu", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);
    const cible = a(liste, 0);

    await sections.modifierSection({
      id: cible.id,
      titre: cible.titre,
      contenu: "Un texte que la suppression doit emporter.",
    });
    await sections.supprimerSection({ id: cible.id });

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM section_produit WHERE id = $1",
      [cible.id],
    );
    expect(rows[0].n).toBe(0);
  });

  /**
   * UNE SECTION SUPPRIMEE PUIS RECREEE A LA MAIN NE RETROUVE PAS SA CLE
   * D'ORIGINE, et c'est correct : la cle est derivee du TITRE saisi, C20, pas
   * cherchee dans une table des quatre cles par defaut. Retaper « Matières et
   * composants » donne `matieres-et-composants` et non `matieres`.
   *
   * LE POINT QUI COMPTE EST QUE LE GESTE REUSSISSE. La cle n'est jamais
   * affichee, et rien dans le projet ne rattache aujourd'hui un comportement a
   * la valeur `matieres` : ADR-026 lui donne un role de tracabilite vers la
   * colonne d'origine, role qui n'a plus d'objet pour une ligne recreee apres
   * suppression volontaire.
   *
   * Ce test existe pour figer ce comportement plutot que de le laisser
   * decouvrir : quelqu'un qui voudrait « rattraper » la cle d'origine ajouterait
   * une correspondance titre vers cle, c'est-a-dire exactement le lien entre
   * libelle modifiable et identifiant stable qu'ADR-026 a coupe.
   */
  it("laisse recreer a la main une section dont la cle a ete liberee", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);
    const matieres = parCle(liste, "matieres");

    await sections.supprimerSection({ id: matieres.id });
    const recreee = await sections.ajouterSection({
      produitId,
      titre: "Matières et composants",
    });

    // LE RANG 5 ET NON 4 : `matieres` occupait le rang 2, le maximum reste
    // donc 4 et la section recreee prend le suivant. Un rang calcule sur le
    // NOMBRE de sections rendrait 4, deja pris par « Conseils d'entretien »,
    // et la contrainte C22 leverait au COMMIT.
    expect(recreee.ordre).toBe(5);
    expect(recreee.cle).toBe("matieres-et-composants");
    expect(await clesDansLOrdre(produitId)).toHaveLength(4);
  });
});

describe("reordonnancement des sections, C22 et contrainte differable", () => {
  /**
   * LE TEST QUE LA MUTATION DOIT FAIRE ROUGIR. Rendre
   * `section_produit_ordre_unique` non differable rejette la premiere mise a
   * jour de l'echange, avant que la seconde ne retablisse la coherence.
   */
  it("echange deux sections voisines", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);
    const ordreInverse = [
      a(liste, 1).id,
      a(liste, 0).id,
      a(liste, 2).id,
      a(liste, 3).id,
    ];

    await sections.reordonnerSections({ produitId, ids: ordreInverse });

    expect(await clesDansLOrdre(produitId)).toEqual([
      "matieres",
      "description",
      "fabrication",
      "entretien",
    ]);
  });

  /**
   * L'INVERSION COMPLETE met chaque rang en conflit avec un autre pendant
   * l'ecriture. Une implementation qui passerait par chance sur deux elements
   * echoue ici.
   */
  it("inverse entierement les quatre sections", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);

    await sections.reordonnerSections({
      produitId,
      ids: [...liste].reverse().map((s) => s.id),
    });

    expect(await clesDansLOrdre(produitId)).toEqual([
      "entretien",
      "fabrication",
      "matieres",
      "description",
    ]);
  });

  /** L'echange doit reussir DANS LES DEUX SENS, critere d'acceptation. */
  it("revient a l'ordre initial par un second echange", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);
    const inverse = [...liste].reverse().map((s) => s.id);

    await sections.reordonnerSections({ produitId, ids: inverse });
    await sections.reordonnerSections({
      produitId,
      ids: liste.map((s) => s.id),
    });

    expect(await clesDansLOrdre(produitId)).toEqual([
      "description",
      "matieres",
      "fabrication",
      "entretien",
    ]);
  });

  /**
   * UNE LISTE INCOMPLETE EST REFUSEE, et l'etat ne bouge pas. L'accepter
   * reecrirait les rangs 1..n sur un sous-ensemble, en collision avec les rangs
   * des sections omises, et la contrainte leverait au COMMIT avec un message
   * illisible pour l'administratrice.
   */
  it("refuse une liste qui n'est pas exhaustive et laisse l'ordre intact", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);

    await expect(
      sections.reordonnerSections({
        produitId,
        ids: [a(liste, 1).id, a(liste, 0).id],
      }),
    ).rejects.toThrow(sections.OrdreSectionsIncompletError);

    expect(await clesDansLOrdre(produitId)).toEqual([
      "description",
      "matieres",
      "fabrication",
      "entretien",
    ]);
  });

  /**
   * UNE SECTION D'UN AUTRE PRODUIT NE SE GLISSE PAS DANS L'ORDRE. Sans ce
   * controle, une liste de la bonne longueur portant l'identifiant d'une
   * section etrangere deplacerait cette derniere chez le produit voisin.
   *
   * C'est l'application de l'invariant 2 a un identifiant de ressource : il
   * DESIGNE, il n'autorise pas, et le service verifie l'appartenance.
   */
  it("refuse une section appartenant a un autre produit", async () => {
    const premier = await produitDeTest("Pièce une");
    const categories = await catalogue.listerCategories();
    const categorie = categories[0];
    if (!categorie) {
      throw new Error("La categorie de test n'a pas ete creee.");
    }
    const second = await catalogue.creerProduit({
      nom: "Pièce deux",
      categorieId: categorie.id,
    });

    const sectionsPremier = await sections.listerSections(premier);
    const sectionsSecond = await sections.listerSections(second.id);

    await expect(
      sections.reordonnerSections({
        produitId: premier,
        ids: [
          a(sectionsSecond, 0).id,
          a(sectionsPremier, 1).id,
          a(sectionsPremier, 2).id,
          a(sectionsPremier, 3).id,
        ],
      }),
    ).rejects.toThrow(sections.SectionIntrouvableError);

    // AUCUNE DES DEUX FICHES N'A BOUGE, y compris celle dont la section a ete
    // citee : un refus qui laisserait le produit voisin reordonne serait pire
    // qu'une absence de refus.
    expect(await clesDansLOrdre(premier)).toEqual([
      "description",
      "matieres",
      "fabrication",
      "entretien",
    ]);
    expect(await clesDansLOrdre(second.id)).toEqual([
      "description",
      "matieres",
      "fabrication",
      "entretien",
    ]);
  });
});

describe("masquage et modification d'une section, C22 et C23", () => {
  /**
   * MASQUER CONSERVE LE CONTENU, c'est ce qui distingue le geste de la
   * suppression. Le test relit le texte APRES le masquage : un masquage qui
   * viderait le champ passerait un test qui ne verifierait que `visible`.
   */
  it("masque sans perdre le contenu, et reaffiche a l'identique", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);
    const cible = a(liste, 0);
    const texte = "Un pendentif travaillé à la main, finition mate.";

    await sections.modifierSection({
      id: cible.id,
      titre: cible.titre,
      contenu: texte,
    });
    await sections.basculerVisibilite({ id: cible.id, visible: false });

    const masquee = a(await sections.listerSections(produitId), 0);
    expect(masquee.visible).toBe(false);
    expect(masquee.contenu).toBe(texte);

    await sections.basculerVisibilite({ id: cible.id, visible: true });

    const reaffichee = a(await sections.listerSections(produitId), 0);
    expect(reaffichee.visible).toBe(true);
    expect(reaffichee.contenu).toBe(texte);
  });

  /**
   * RENOMMER CHANGE `titre` ET LAISSE `cle`, C20. C'est ce qui rend le
   * renommage sans consequence sur l'origine de la section.
   */
  it("renomme le titre sans toucher a la cle technique", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);
    const matieres = parCle(liste, "matieres");

    await sections.modifierSection({
      id: matieres.id,
      titre: "Composants",
      contenu: "Argent 925.",
    });

    const { rows } = await client.query(
      "SELECT cle, titre FROM section_produit WHERE id = $1",
      [matieres.id],
    );
    expect(rows[0].cle).toBe("matieres");
    expect(rows[0].titre).toBe("Composants");
  });

  /** `chk_section_titre_non_vide` est devance par la validation Zod. */
  it("refuse un titre vide avant d'atteindre la base", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);

    await expect(
      sections.modifierSection({
        id: a(liste, 0).id,
        titre: "   ",
        contenu: "",
      }),
    ).rejects.toThrow();
  });

  /**
   * LE CONTENU PEUT ETRE VIDE, c'est l'etat d'une section pas encore redigee,
   * et la regle d'affichage veut qu'elle ne s'affiche pas du tout, titre
   * compris. Le refuser empecherait d'effacer un texte.
   */
  it("accepte un contenu vide", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);

    await sections.modifierSection({
      id: a(liste, 0).id,
      titre: "Description détaillée",
      contenu: "Un texte.",
    });
    await sections.modifierSection({
      id: a(liste, 0).id,
      titre: "Description détaillée",
      contenu: "",
    });

    expect(a(await sections.listerSections(produitId), 0).contenu).toBe("");
  });

  it("refuse une section inconnue sans rien modifier", async () => {
    const produitId = await produitDeTest();

    await expect(
      sections.modifierSection({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        titre: "Ailleurs",
        contenu: "",
      }),
    ).rejects.toThrow(sections.SectionIntrouvableError);

    expect(await clesDansLOrdre(produitId)).toHaveLength(4);
  });
});

describe("ajout d'une section par l'administratrice", () => {
  /**
   * LA SECTION AJOUTEE PREND LE RANG SUIVANT, calcule sur le MAXIMUM et non sur
   * le nombre. Les deux divergent des qu'une section du milieu est supprimee :
   * quatre sections, la deuxieme supprimee, un comptage rendrait 4 et le rang
   * calcule vaudrait 4, deja pris par « Conseils d'entretien ».
   */
  it("ajoute au rang suivant, calcule sur le maximum", async () => {
    const produitId = await produitDeTest();
    const liste = await sections.listerSections(produitId);

    await sections.supprimerSection({ id: a(liste, 1).id });
    const ajoutee = await sections.ajouterSection({
      produitId,
      titre: "Guide des tailles",
    });

    expect(ajoutee.ordre).toBe(5);
  });

  /**
   * LA CLE EST DERIVEE DU TITRE ET RESTE EN ASCII, C20. Elle n'est jamais
   * affichee : un accent y serait sans effet visible et casserait la convention
   * des identifiants techniques.
   */
  it("derive une cle ASCII du titre", async () => {
    const produitId = await produitDeTest();

    const ajoutee = await sections.ajouterSection({
      produitId,
      titre: "Précautions d'usage",
    });

    expect(ajoutee.cle).toMatch(/^[a-z0-9-]+$/);
  });

  /**
   * DEUX SECTIONS DE MEME TITRE NE HEURTENT PAS L'UNICITE. La cle derivee
   * serait identique : le service doit la rendre unique plutot que de laisser
   * remonter une violation de `section_produit_cle_unique` a l'ecran.
   */
  it("rend la cle unique quand deux titres se ressemblent", async () => {
    const produitId = await produitDeTest();

    const une = await sections.ajouterSection({
      produitId,
      titre: "Guide des tailles",
    });
    const deux = await sections.ajouterSection({
      produitId,
      titre: "Guide des tailles",
    });

    expect(deux.cle).not.toBe(une.cle);
    expect(await clesDansLOrdre(produitId)).toHaveLength(6);
  });

  it("refuse un ajout sur un produit inconnu", async () => {
    await expect(
      sections.ajouterSection({
        produitId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        titre: "Ailleurs",
      }),
    ).rejects.toThrow(sections.ProduitIntrouvableError);
  });
});
