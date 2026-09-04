/**
 * Catalogue, categories et creation de produit, sur base reelle. LS-99.
 *
 * CES TESTS SONT ECRITS AVANT LE SERVICE, et ils portent sur les deux endroits
 * ou la base peut dire non a du code qui a l'air juste :
 *
 *   C24  l'ordre d'affichage est unique, sous contrainte DIFFERABLE. Le
 *        reordonnancement echange des rangs, ce qu'une contrainte ordinaire
 *        rejetterait des la premiere mise a jour. Un code qui « marche » en
 *        deplacant une seule categorie casse des qu'on en permute deux.
 *   C26  une categorie portant un produit ne se supprime pas, RESTRICT. Le
 *        service doit rendre un refus explicite, jamais laisser remonter une
 *        violation de cle etrangere jusqu'a l'ecran.
 *
 * LES TESTS APPELLENT LE VRAI SERVICE, jamais une reproduction de sa mecanique
 * en SQL : lecon de LS-50, ou reproduire la mecanique avait laisse passer deux
 * defauts. Le SQL n'apparait ici que pour preparer un etat ou constater un
 * resultat.
 *
 * AUCUNE DONNEE DU PROTOTYPE. Les noms employes sont neutres et inventes pour
 * ces tests : ni Boucles, ni Colliers, ni Eclipse.
 */
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
  await client.query("TRUNCATE produit, categorie CASCADE");
});

/** Rangs actuels, du premier au dernier, sous forme lisible. */
async function ordreActuel(): Promise<string[]> {
  const { rows } = await client.query(
    "SELECT nom FROM categorie ORDER BY ordre ASC",
  );
  return rows.map((r) => r.nom as string);
}

async function rangDe(nom: string): Promise<number> {
  const { rows } = await client.query(
    "SELECT ordre FROM categorie WHERE nom = $1",
    [nom],
  );
  return rows[0].ordre as number;
}

describe("creation de categorie", () => {
  it("cree une categorie avec son slug derive et le rang suivant", async () => {
    const premiere = await catalogue.creerCategorie({ nom: "Pierres claires" });
    const seconde = await catalogue.creerCategorie({ nom: "Métal brossé" });

    expect(premiere).toMatchObject({ slug: "pierres-claires", ordre: 1 });
    // LE RANG SUIVANT, ET NON 1 A NOUVEAU. Un rang recalcule a 1 heurterait
    // C24 des la deuxieme creation.
    expect(seconde).toMatchObject({ slug: "metal-brosse", ordre: 2 });
  });

  /**
   * LE PREMIER RANG EST 1 ET NON 0, C24. Un `count()` employe comme rang
   * donnerait 0 sur une base vide et heurterait `chk_categorie_ordre_positif`,
   * defaut qui ne se voit QUE sur la toute premiere creation.
   */
  it("attribue le rang 1 a la premiere categorie d'une base vide", async () => {
    const seule = await catalogue.creerCategorie({ nom: "Première" });
    expect(seule.ordre).toBe(1);
  });

  /**
   * LE RANG SUIVANT SE CALCULE SUR LE MAXIMUM, PAS SUR LE NOMBRE. Apres une
   * suppression au milieu, les deux divergent : trois categories aux rangs
   * 1, 2, 3, la deuxieme supprimee, un `count() + 1` rendrait 3, deja pris.
   */
  it("calcule le rang suivant sur le maximum et non sur le nombre", async () => {
    await catalogue.creerCategorie({ nom: "Une" });
    const deux = await catalogue.creerCategorie({ nom: "Deux" });
    await catalogue.creerCategorie({ nom: "Trois" });

    await catalogue.supprimerCategorie(deux.id);

    const quatre = await catalogue.creerCategorie({ nom: "Quatre" });
    expect(quatre.ordre).toBe(4);
  });

  it("refuse un slug deja pris, C3, sans laisser remonter l'erreur Prisma", async () => {
    await catalogue.creerCategorie({ nom: "Pierres claires" });

    // Meme slug engendre, nom different : c'est le cas realiste, pas le doublon
    // exact que l'interface previendrait deja.
    await expect(
      catalogue.creerCategorie({ nom: "PIERRES CLAIRES" }),
    ).rejects.toThrow(catalogue.SlugDejaPrisError);
  });

  it("refuse un nom vide avant d'atteindre la base", async () => {
    await expect(catalogue.creerCategorie({ nom: "   " })).rejects.toThrow();
    expect(await ordreActuel()).toEqual([]);
  });
});

describe("renommage de categorie", () => {
  it("change le nom et NE TOUCHE PAS au slug", async () => {
    const creee = await catalogue.creerCategorie({ nom: "Pierres claires" });

    await catalogue.renommerCategorie({ id: creee.id, nom: "Pierres pâles" });

    const { rows } = await client.query(
      "SELECT nom, slug FROM categorie WHERE id = $1",
      [creee.id],
    );
    expect(rows[0].nom).toBe("Pierres pâles");
    // LE SLUG SURVIT AU RENOMMAGE. Le recalculer casserait tous les liens
    // entrants de la categorie, sans redirection pour les rattraper.
    expect(rows[0].slug).toBe("pierres-claires");
  });

  it("refuse un identifiant inconnu sans rien modifier", async () => {
    await catalogue.creerCategorie({ nom: "Une" });

    await expect(
      catalogue.renommerCategorie({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        nom: "Autre",
      }),
    ).rejects.toThrow(catalogue.CategorieIntrouvableError);

    expect(await ordreActuel()).toEqual(["Une"]);
  });
});

describe("reordonnancement, C24 et contrainte differable", () => {
  /**
   * LE TEST CENTRAL DE LA STORY. Permuter deux rangs viole l'unicite entre les
   * deux ecritures : sans transaction ET sans contrainte differable, la
   * premiere mise a jour est rejetee.
   *
   * Rendre la contrainte non differable fait rougir ce test, ce qui a ete
   * verifie par mutation sur verifier-schema.sh.
   */
  it("permute deux categories voisines", async () => {
    const une = await catalogue.creerCategorie({ nom: "Une" });
    const deux = await catalogue.creerCategorie({ nom: "Deux" });

    await catalogue.reordonnerCategories([deux.id, une.id]);

    expect(await ordreActuel()).toEqual(["Deux", "Une"]);
    expect(await rangDe("Deux")).toBe(1);
    expect(await rangDe("Une")).toBe(2);
  });

  /**
   * L'INVERSION COMPLETE est le cas ou chaque rang entre en conflit avec un
   * autre pendant l'ecriture. Une implementation qui echapperait au probleme
   * par chance sur deux elements ne passe pas celui-ci.
   */
  it("inverse entierement une liste de quatre categories", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const b = await catalogue.creerCategorie({ nom: "B" });
    const c = await catalogue.creerCategorie({ nom: "C" });
    const d = await catalogue.creerCategorie({ nom: "D" });

    await catalogue.reordonnerCategories([d.id, c.id, b.id, a.id]);

    expect(await ordreActuel()).toEqual(["D", "C", "B", "A"]);
    expect(await rangDe("D")).toBe(1);
    expect(await rangDe("A")).toBe(4);
  });

  /**
   * UNE LISTE INCOMPLETE EST REFUSEE. L'accepter reecrirait les rangs 1..n sur
   * un sous-ensemble, en collision avec les rangs des categories omises : la
   * contrainte leverait au COMMIT avec un message illisible. Le refus explicite
   * arrive avant, et il est verifiable.
   */
  it("refuse une liste qui n'est pas exhaustive", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerCategorie({ nom: "B" });

    await expect(catalogue.reordonnerCategories([a.id])).rejects.toThrow(
      catalogue.OrdreIncompletError,
    );

    // L'ETAT N'A PAS BOUGE, et c'est la moitie du critere : un refus qui
    // laisserait des rangs a demi ecrits serait pire que pas de refus du tout.
    expect(await ordreActuel()).toEqual(["A", "B"]);
    expect(await rangDe("A")).toBe(1);
    expect(await rangDe("B")).toBe(2);
  });

  it("refuse un identifiant inconnu et laisse l'ordre intact", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const b = await catalogue.creerCategorie({ nom: "B" });

    await expect(
      catalogue.reordonnerCategories([
        a.id,
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      ]),
    ).rejects.toThrow();

    expect(await rangDe("A")).toBe(1);
    expect(await rangDe("B")).toBe(2);
    expect(b.ordre).toBe(2);
  });
});

describe("suppression de categorie, C26 et RESTRICT", () => {
  it("supprime une categorie vide", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerCategorie({ nom: "B" });

    await catalogue.supprimerCategorie(a.id);

    expect(await ordreActuel()).toEqual(["B"]);
  });

  /**
   * C26, LE REFUS QUI DOIT ETRE EXPLICITE. La cle etrangere en RESTRICT bloque
   * de toute facon : ce que ce test exige, c'est que le service TRADUISE ce
   * refus en une erreur nommee, avec le nombre de produits concernes, pour que
   * l'ecran l'explique au lieu d'afficher une violation de contrainte.
   */
  it("refuse de supprimer une categorie portant un produit, et dit combien", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerProduit({ nom: "Pièce une", categorieId: a.id });
    await catalogue.creerProduit({ nom: "Pièce deux", categorieId: a.id });

    await expect(catalogue.supprimerCategorie(a.id)).rejects.toMatchObject({
      name: "CategorieNonVideError",
      nombreProduits: 2,
    });

    // LA CATEGORIE EST TOUJOURS LA. Un refus qui aurait quand meme supprime,
    // ou supprime les produits en cascade, serait le defaut que C26 existe pour
    // interdire.
    expect(await ordreActuel()).toEqual(["A"]);
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM produit",
    );
    expect(rows[0].n).toBe(2);
  });

  /**
   * UN PRODUIT ARCHIVE COMPTE TOUJOURS. Un filtre `archiveA IS NULL` glisse
   * dans le comptage ferait annoncer « categorie vide » avant que la cle
   * etrangere ne rejette la suppression : le service promettrait un succes que
   * la base refuse.
   */
  it("compte aussi les produits archives", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const p = await catalogue.creerProduit({
      nom: "Pièce une",
      categorieId: a.id,
    });
    await client.query(
      "UPDATE produit SET statut = 'ARCHIVE', archive_a = now() WHERE id = $1",
      [p.id],
    );

    await expect(catalogue.supprimerCategorie(a.id)).rejects.toMatchObject({
      name: "CategorieNonVideError",
      nombreProduits: 1,
    });
  });

  it("refuse une categorie inconnue", async () => {
    await expect(
      catalogue.supprimerCategorie("3f2504e0-4f89-41d3-9a0c-0305e82c3301"),
    ).rejects.toThrow(catalogue.CategorieIntrouvableError);
  });
});

describe("creation de produit", () => {
  it("cree un produit en BROUILLON, rattache a sa categorie", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });

    const produit = await catalogue.creerProduit({
      nom: "Collier de l'aube",
      categorieId: a.id,
    });

    expect(produit).toMatchObject({
      slug: "collier-de-l-aube",
      categorieId: a.id,
    });

    const { rows } = await client.query(
      "SELECT statut, publie_a, archive_a FROM produit WHERE id = $1",
      [produit.id],
    );
    // BROUILLON, ET LES DEUX DATES NULLES. Un produit cree publie serait
    // visible sans variante ni media, ce que C1 et C7 interdisent.
    expect(rows[0].statut).toBe("BROUILLON");
    expect(rows[0].publie_a).toBeNull();
    expect(rows[0].archive_a).toBeNull();
  });

  /**
   * UNE CATEGORIE INEXISTANTE EST UN REFUS METIER, pas une panne. La cle
   * etrangere la rejette : le service doit la traduire, sinon l'ecran affiche
   * une erreur Prisma a l'administratrice.
   */
  it("refuse un rattachement a une categorie inexistante", async () => {
    await expect(
      catalogue.creerProduit({
        nom: "Collier",
        categorieId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
      }),
    ).rejects.toThrow(catalogue.CategorieIntrouvableError);

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM produit",
    );
    expect(rows[0].n).toBe(0);
  });

  it("refuse un slug de produit deja pris, C3", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    await catalogue.creerProduit({
      nom: "Collier de l'aube",
      categorieId: a.id,
    });

    await expect(
      catalogue.creerProduit({ nom: "COLLIER DE L'AUBE", categorieId: a.id }),
    ).rejects.toThrow(catalogue.SlugDejaPrisError);
  });
});

describe("lecture des categories", () => {
  it("rend les categories dans l'ordre de la boutique, avec leur compte de produits", async () => {
    const a = await catalogue.creerCategorie({ nom: "A" });
    const b = await catalogue.creerCategorie({ nom: "B" });
    await catalogue.creerProduit({ nom: "Pièce une", categorieId: b.id });

    await catalogue.reordonnerCategories([b.id, a.id]);

    const liste = await catalogue.listerCategories();

    // L'ORDRE VIENT DE `ordre`, jamais du nom ni de la date de creation.
    expect(liste.map((c) => c.nom)).toEqual(["B", "A"]);
    // LE COMPTE SERT L'ECRAN, qui doit expliquer pourquoi une suppression est
    // refusee AVANT que l'administratrice ne la tente.
    expect(liste).toHaveLength(2);
    expect(liste[0]?.nombreProduits).toBe(1);
    expect(liste[1]?.nombreProduits).toBe(0);
  });

  it("rend une liste vide sur une base sans categorie", async () => {
    expect(await catalogue.listerCategories()).toEqual([]);
  });
});

/* ==========================================================================
 * LS-183, la liste du catalogue pour l'administration.
 * ========================================================================== */

describe("listerProduitsAdministration", () => {
  /**
   * LE TEST QUI JUSTIFIE LA STORY, et le piege qu'elle evite.
   *
   * `creerProduit` NE CREE AUCUNE VARIANTE : il ecrit le produit et ses
   * sections, rien de plus. Tout produit vient donc de naitre sans variante, et
   * ce n'est PAS un cas limite mais le cas nominal juste apres la creation.
   *
   * LA LECTURE PUBLIQUE EMPLOIE UN `JOIN` sur les variantes vivantes, ce qui
   * fait disparaitre ces produits. Repris tel quel ici, l'ecran cense retrouver
   * un produit aurait masque celui qu'on vient de creer, c'est-a-dire le seul
   * qu'on cherche a ce moment-la.
   *
   * LE CAS N'EXISTE DANS AUCUNE DONNEE DE DEVELOPPEMENT, mesure le 4 septembre
   * 2026 : huit produits, zero sans variante. Un test ecrit sur ces donnees
   * serait passe au vert sans rien prouver, motif « cible de test inexistante ».
   */
  it("montre un produit qui n'a encore aucune variante", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Sans variante" });
    const produit = await catalogue.creerProduit({
      nom: "Pièce toute neuve",
      categorieId: categorie.id,
    });

    const liste = await catalogue.listerProduitsAdministration();
    const trouve = liste.find((ligne) => ligne.id === produit.id);

    expect(trouve).toBeDefined();
    expect(trouve?.variantesVivantes).toBe(0);

    /*
     * LE PRIX EST NUL, JAMAIS ZERO. « 0,00 € » se lirait comme un prix decide,
     * quand la verite est qu'aucun prix n'existe encore.
     */
    expect(trouve?.prixMinimumCentimes).toBeNull();
  });

  /**
   * LES BROUILLONS SORTENT ICI, CONTRAIREMENT A LA LECTURE PUBLIQUE.
   *
   * C'est toute la raison d'avoir deux lectures : la publique filtre sur
   * `ACTIF` au plus pres de la donnee pour ne jamais exposer du travail en
   * cours, celle-ci montre ce que l'exploitante doit pouvoir reprendre.
   */
  it("montre les brouillons, que la lecture publique cache", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Mixte" });
    const brouillon = await catalogue.creerProduit({
      nom: "En cours de rédaction",
      categorieId: categorie.id,
    });

    const liste = await catalogue.listerProduitsAdministration();

    expect(liste.map((ligne) => ligne.id)).toContain(brouillon.id);
    expect(liste.find((ligne) => ligne.id === brouillon.id)?.statut).toBe(
      "BROUILLON",
    );
  });

  /**
   * LES ARCHIVES SONT DEHORS PAR DEFAUT, ET RETROUVABLES SUR DEMANDE.
   *
   * Arbitrage de Christophe du 4 septembre 2026. Les deux moities comptent :
   * absents de la vue courante pour qu'elle ne grossisse pas sans fin, mais
   * atteignables, sans quoi un produit archive par erreur devient introuvable et
   * se recree en double avec une reference neuve, C14 interdisant de reattribuer
   * la premiere.
   */
  it("écarte les archivés par défaut et les rend sur demande", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Archivage" });
    const produit = await catalogue.creerProduit({
      nom: "Pièce retirée",
      categorieId: categorie.id,
    });

    await client.query(
      "UPDATE produit SET statut = 'ARCHIVE', archive_a = now() WHERE id = $1",
      [produit.id],
    );

    const parDefaut = await catalogue.listerProduitsAdministration();
    expect(parDefaut.map((ligne) => ligne.id)).not.toContain(produit.id);

    const surDemande = await catalogue.listerProduitsAdministration([
      "ARCHIVE",
    ]);
    expect(surDemande.map((ligne) => ligne.id)).toContain(produit.id);
  });

  /**
   * LE PRIX EST LE PLUS BAS DES VARIANTES VIVANTES, l'archivee etant ignoree.
   *
   * DEUX ARCHIVAGES DISTINCTS SE CROISENT ICI, et les confondre est le piege :
   * `variante.archivee_a` retire une declinaison, `produit.statut = ARCHIVE`
   * retire la fiche entiere. Une variante archivee ne doit ni compter, ni
   * porter le prix affiche, alors que son produit reste listable. C13.
   */
  it("ignore une variante archivée dans le prix et le compte", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Deux tailles" });
    const produit = await catalogue.creerProduit({
      nom: "Pièce à deux tailles",
      categorieId: categorie.id,
    });

    await client.query(
      `INSERT INTO variante (id, produit_id, reference, libelle, prix_centimes,
                             quantite_physique, cree_a)
       VALUES (gen_random_uuid(), $1, 'TEST-VIVANTE', '45 cm', 4900, 1, now())`,
      [produit.id],
    );
    await client.query(
      `INSERT INTO variante (id, produit_id, reference, libelle, prix_centimes,
                             quantite_physique, archivee_a, cree_a)
       VALUES (gen_random_uuid(), $1, 'TEST-ARCHIVEE', '40 cm', 1900, 1,
               now(), now())`,
      [produit.id],
    );

    const liste = await catalogue.listerProduitsAdministration();
    const trouve = liste.find((ligne) => ligne.id === produit.id);

    /*
     * 4900 ET NON 1900 : la variante archivee est la MOINS chere, donc un
     * oubli du filtre se verrait ici et nulle part ailleurs.
     */
    expect(trouve?.prixMinimumCentimes).toBe(4900);
    expect(trouve?.variantesVivantes).toBe(1);
  });

  /**
   * UN MEDIA NON TRAITE NE DONNE AUCUNE VIGNETTE, trouve par la revue.
   *
   * LE DEFAUT QU'IL FERME. Un media `EN_ATTENTE` ou `ECHOUE` n'a AUCUN fichier
   * sous le volume, C8 : remonter son chemin ferait construire une URL, et
   * l'ecran afficherait l'icone d'image cassee du navigateur la ou il doit
   * montrer un emplacement vide.
   *
   * LE CAS EST LE CHEMIN NOMINAL DE LA CREATION, pas un cas limite : un media
   * televerse vaut `EN_ATTENTE` par defaut, et la publication exige
   * `mediasNonTraites === 0`. Un media non traite ne peut donc exister QUE sur
   * un brouillon ou un archive, c'est-a-dire exactement ce que cet ecran est le
   * seul a lister.
   *
   * AUCUNE DONNEE DE DEVELOPPEMENT NE LE PORTE, mesure : les deux medias en
   * base sont `TRAITE`. Meme motif que le produit sans variante plus haut,
   * « cible de test inexistante », et il s'est reproduit dans la meme story.
   */
  it("ne remonte pas la vignette d'un média non traité", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Photos" });
    const produit = await catalogue.creerProduit({
      nom: "Pièce en cours de photo",
      categorieId: categorie.id,
    });

    await client.query(
      `INSERT INTO media (id, produit_id, chemin, texte_alternatif, ordre,
                          statut_traitement, cree_a)
       VALUES (gen_random_uuid(), $1, 'produits/test-en-attente/', 'Test', 1,
               'EN_ATTENTE', now())`,
      [produit.id],
    );

    const enAttente = await catalogue.listerProduitsAdministration();
    expect(
      enAttente.find((ligne) => ligne.id === produit.id)?.mediaChemin,
    ).toBeNull();

    /*
     * ET LA VIGNETTE APPARAIT DES QUE LE TRAITEMENT ABOUTIT. Sans cette
     * seconde moitie, une jointure qui ne remonterait JAMAIS de media
     * passerait le test : le filtre serait alors trop large sans que rien ne
     * le dise.
     */
    await client.query(
      "UPDATE media SET statut_traitement = 'TRAITE' WHERE produit_id = $1",
      [produit.id],
    );

    const traite = await catalogue.listerProduitsAdministration();
    expect(traite.find((ligne) => ligne.id === produit.id)?.mediaChemin).toBe(
      "produits/test-en-attente/",
    );
  });

  /**
   * L'ORDRE SUIT LA DERNIERE MODIFICATION, le plus recent d'abord.
   *
   * C'est l'ordre du travail : ce qu'on vient de toucher est ce qu'on rouvre.
   * Un tri alphabetique obligerait a chercher dans la liste le produit qu'on
   * vient de quitter.
   */
  it("range du plus récemment modifié au plus ancien", async () => {
    const categorie = await catalogue.creerCategorie({ nom: "Ordre" });

    const ancien = await catalogue.creerProduit({
      nom: "Créé en premier",
      categorieId: categorie.id,
    });
    const recent = await catalogue.creerProduit({
      nom: "Créé ensuite",
      categorieId: categorie.id,
    });

    /*
     * L'ANCIEN EST TOUCHE APRES LE RECENT, ce qui le fait remonter en tete.
     * Sans cette modification, le test confondrait un tri par date de creation
     * avec un tri par date de modification : les deux donneraient le meme ordre.
     */
    await client.query(
      "UPDATE produit SET modifie_a = now() + interval '1 second' WHERE id = $1",
      [ancien.id],
    );

    const liste = await catalogue.listerProduitsAdministration();
    const rangAncien = liste.findIndex((ligne) => ligne.id === ancien.id);
    const rangRecent = liste.findIndex((ligne) => ligne.id === recent.id);

    expect(rangAncien).toBeLessThan(rangRecent);
  });
});
