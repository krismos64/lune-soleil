/**
 * Stockage des medias sur volume, LS-102. ADR-007.
 *
 * CES TESTS ECRIVENT SUR UN VRAI DISQUE, dans un dossier temporaire jetable.
 * Le stockage manipule des chemins et deplace des fichiers : le simuler
 * verifierait la simulation, pas la propriete qui compte, celle qu'un media non
 * traite n'est PAS a un endroit servable.
 *
 * LA PROPRIETE CENTRALE EST PHYSIQUE ET NON APPLICATIVE. ADR-007 a ecarte le
 * dossier unique avec filtre applicatif : la regle reposerait alors sur le fait
 * qu'aucune requete n'oublie `statutTraitement = 'TRAITE'`, et ce projet a deja
 * rencontre trois fois le motif du champ d'etat oublie dans une condition
 * d'acces. Deux dossiers rendent la regle vraie independamment du code.
 */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CheminInvalideError,
  StockageMedias,
} from "@/integrations/medias/stockage";

let racine: string;
let stockage: StockageMedias;

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), "ls-medias-"));
  stockage = new StockageMedias(racine);
  await stockage.preparer();
});

afterEach(async () => {
  await rm(racine, { recursive: true, force: true });
});

describe("preparation du volume", () => {
  it("cree les deux dossiers, quarantaine et public", async () => {
    expect(existsSync(join(racine, "quarantaine"))).toBe(true);
    expect(existsSync(join(racine, "public"))).toBe(true);
  });

  /** Rejouer la preparation ne doit rien casser, le conteneur redemarrant. */
  it("est idempotente", async () => {
    await stockage.preparer();
    await stockage.preparer();
    expect(existsSync(join(racine, "public"))).toBe(true);
  });
});

describe("depot en quarantaine", () => {
  /**
   * LE TELEVERSEMENT BRUT VA EN QUARANTAINE, ET NULLE PART AILLEURS. C'est
   * l'invariant physique d'ADR-007 : tant que le traitement n'a pas reussi, le
   * fichier n'est pas a un endroit que Nginx sert.
   */
  it("ecrit le fichier brut sous quarantaine et jamais sous public", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(
      Buffer.from("octets bruts"),
    );

    expect(existsSync(join(racine, "quarantaine", identifiant))).toBe(true);
    expect(await readdir(join(racine, "public"))).toEqual([]);
  });

  it("rend un identifiant different a chaque depot", async () => {
    const un = await stockage.deposerEnQuarantaine(Buffer.from("a"));
    const deux = await stockage.deposerEnQuarantaine(Buffer.from("b"));
    expect(un).not.toBe(deux);
  });

  /**
   * L'IDENTIFIANT NE PORTE AUCUN NOM DE FICHIER FOURNI PAR L'APPELANT. Un nom
   * televerse est une donnee non fiable : il peut contenir des separateurs, des
   * caracteres de traversee, ou simplement reveler ce que la photographie
   * montre. Un identifiant engendre ferme la question a la source.
   */
  it("engendre un identifiant sans separateur de chemin", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(Buffer.from("a"));
    expect(identifiant).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("publication, le seul geste qui rend un media accessible", () => {
  it("ecrit les declinaisons sous public et retire l'original", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(
      Buffer.from("original brut"),
    );

    const chemin = await stockage.publier(identifiant, [
      { nom: "320.avif", contenu: Buffer.from("petit") },
      { nom: "1280.webp", contenu: Buffer.from("grand") },
    ]);

    expect(existsSync(join(racine, "public", chemin, "320.avif"))).toBe(true);
    expect(existsSync(join(racine, "public", chemin, "1280.webp"))).toBe(true);

    // L'ORIGINAL EST SUPPRIME, ADR-007. C'est le seul fichier qui porte la
    // position GPS : le conserver le ferait survivre dans les sauvegardes.
    expect(existsSync(join(racine, "quarantaine", identifiant))).toBe(false);
  });

  /**
   * LE CHEMIN RENDU EST RELATIF AU DOSSIER `public/`, jamais absolu ni URL.
   * `Media.chemin` porte cette valeur : le prefixe de service appartient a la
   * configuration de Nginx, pas aux donnees. Un chemin absolu en base casserait
   * au premier changement de point de montage.
   */
  it("rend un chemin relatif, sans racine ni prefixe d'URL", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(Buffer.from("a"));
    const chemin = await stockage.publier(identifiant, [
      { nom: "320.avif", contenu: Buffer.from("x") },
    ]);

    expect(chemin.startsWith("/")).toBe(false);
    expect(chemin).not.toContain(racine);
    expect(chemin).not.toContain("http");
  });

  it("refuse de publier un identifiant absent de la quarantaine", async () => {
    await expect(
      stockage.publier("inexistant", [
        { nom: "320.avif", contenu: Buffer.from("x") },
      ]),
    ).rejects.toThrow();
  });
});

describe("traversee de chemin, entrees non fiables", () => {
  /**
   * AUCUN IDENTIFIANT PORTANT UN SEPARATEUR N'EST ACCEPTE.
   *
   * LE SCENARIO FERME : un identifiant tel que `../../etc/passwd` ferait
   * ecrire ou lire hors du volume. Les identifiants sont engendres par ce
   * module, donc le cas ne devrait pas se produire ; le controle existe parce
   * qu'une valeur venue de la base ou d'un parametre finit toujours par
   * atteindre ce chemin, et que le cout de la garde est nul.
   */
  it("refuse un identifiant qui remonte hors du volume", async () => {
    for (const mauvais of [
      "../secret",
      "../../etc/passwd",
      "sous/dossier",
      "a\\b",
      "",
      ".",
      "..",
    ]) {
      await expect(
        stockage.publier(mauvais, [
          { nom: "320.avif", contenu: Buffer.from("x") },
        ]),
      ).rejects.toThrow(CheminInvalideError);
    }
  });

  /** Meme garde sur le NOM de declinaison, qui compose lui aussi un chemin. */
  it("refuse un nom de declinaison qui remonte hors du volume", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(Buffer.from("a"));

    await expect(
      stockage.publier(identifiant, [
        { nom: "../evasion.avif", contenu: Buffer.from("x") },
      ]),
    ).rejects.toThrow(CheminInvalideError);
  });

  it("refuse la suppression d'un chemin hors du volume", async () => {
    await expect(stockage.supprimerPublies("../..")).rejects.toThrow(
      CheminInvalideError,
    );
  });
});

describe("purge des orphelins, televersement interrompu", () => {
  /**
   * UN TELEVERSEMENT INTERROMPU LAISSE UN FICHIER EN QUARANTAINE que rien ne
   * reference, parcours 3. Sans purge, la quarantaine croit sans limite.
   *
   * LA PURGE PORTE UN AGE MINIMAL, et c'est ce qui la rend sure : purger tout
   * ce qui traine emporterait un fichier en cours de traitement, l'encodage
   * d'une photographie lourde prenant environ deux secondes.
   */
  it("purge un fichier plus vieux que le delai, garde les recents", async () => {
    const recent = await stockage.deposerEnQuarantaine(Buffer.from("recent"));

    // Un fichier date de la veille, ecrit a la main pour ne pas dependre de
    // l'horloge du test.
    const vieux = "orphelin-du-passe";
    const cheminVieux = join(racine, "quarantaine", vieux);
    await writeFile(cheminVieux, "vieux");
    const veille = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { utimes } = await import("node:fs/promises");
    await utimes(cheminVieux, veille, veille);

    const purges = await stockage.purgerQuarantaine(60 * 60 * 1000);

    expect(purges).toBe(1);
    expect(existsSync(cheminVieux)).toBe(false);
    expect(existsSync(join(racine, "quarantaine", recent))).toBe(true);
  });

  it("ne touche jamais au dossier public", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(Buffer.from("a"));
    const chemin = await stockage.publier(identifiant, [
      { nom: "320.avif", contenu: Buffer.from("x") },
    ]);

    await stockage.purgerQuarantaine(0);

    expect(existsSync(join(racine, "public", chemin, "320.avif"))).toBe(true);
  });

  it("rend zero sur une quarantaine vide", async () => {
    expect(await stockage.purgerQuarantaine(0)).toBe(0);
  });
});

describe("suppression des declinaisons publiees", () => {
  it("retire le dossier entier du media", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(Buffer.from("a"));
    const chemin = await stockage.publier(identifiant, [
      { nom: "320.avif", contenu: Buffer.from("x") },
      { nom: "640.webp", contenu: Buffer.from("y") },
    ]);

    await stockage.supprimerPublies(chemin);

    expect(existsSync(join(racine, "public", chemin))).toBe(false);
  });

  /** Supprimer deux fois ne leve pas : la tache de nettoyage peut rejouer. */
  it("ne leve pas sur un chemin deja supprime", async () => {
    await expect(stockage.supprimerPublies("jamais-ecrit")).resolves.toBeUndefined();
  });
});

describe("contenu ecrit", () => {
  it("ecrit les octets exacts de chaque declinaison", async () => {
    const identifiant = await stockage.deposerEnQuarantaine(Buffer.from("a"));
    const attendu = Buffer.from([1, 2, 3, 250, 251, 252]);

    const chemin = await stockage.publier(identifiant, [
      { nom: "320.avif", contenu: attendu },
    ]);

    const relu = await readFile(join(racine, "public", chemin, "320.avif"));
    expect(relu.equals(attendu)).toBe(true);
  });
});
