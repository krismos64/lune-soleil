/**
 * Medias d'un produit, sur base reelle ET disque reel. LS-102, ADR-007.
 *
 * CE FICHIER TESTE CE QU'AUCUN AUTRE NE PEUT TESTER. Les tests unitaires de
 * `traitement.ts` et de `stockage.ts` couvrent chacun leur moitie ; le service,
 * lui, orchestre TROIS effets qui doivent rester coherents entre eux :
 *
 *   la base     `Media.statutTraitement` et `Media.chemin`
 *   le disque   le fichier est-il en quarantaine, sous public, ou nulle part
 *   le retour   ce que l'ecran affichera
 *
 * LE DEFAUT QUE CELA ATTRAPE EST TOUJOURS UN DESACCORD ENTRE LES TROIS. Un
 * statut `TRAITE` sur un media dont les fichiers ne sont pas ecrits, un media
 * publie dont la base dit `ECHOUE`, une ligne supprimee dont les fichiers
 * restent. Aucun test unitaire ne voit ces cas, chacun ne connaissant qu'un
 * cote.
 *
 * LE DISQUE EST REEL, dans un dossier temporaire jetable pointe par
 * `MEDIA_RACINE`. Le simuler verifierait la simulation : la propriete centrale
 * d'ADR-007 est qu'un media non traite n'est PAS a un endroit servable, ce qui
 * ne se prouve qu'en regardant le systeme de fichiers.
 *
 * AUCUNE DONNEE DU PROTOTYPE : ni Eclipse, ni Alba.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
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
let medias: typeof import("@/services/media");

beforeAll(async () => {
  const url = inject(VARIABLE_URL_TEST);
  process.env.DATABASE_URL = url;

  // LA RACINE EST POSEE AVANT L'IMPORT DU SERVICE. Celui-ci lit
  // `MEDIA_RACINE` a chaque appel et non au chargement, mais poser la variable
  // ici garde le test lisible et protege d'un futur cache.
  racineMedias = await mkdtemp(join(tmpdir(), "ls-integration-medias-"));
  process.env.MEDIA_RACINE = racineMedias;

  client = new Client({ connectionString: url });
  await client.connect();

  catalogue = await import("@/services/catalogue");
  medias = await import("@/services/media");
});

afterAll(async () => {
  await client.end();
  await rm(racineMedias, { recursive: true, force: true });
});

afterEach(async () => {
  await client.query("TRUNCATE produit, categorie CASCADE");
  // Le disque est remis a zero entre deux tests, sans quoi un compte de
  // fichiers porterait sur l'accumulation des tests precedents.
  await rm(join(racineMedias, "public"), { recursive: true, force: true });
  await rm(join(racineMedias, "quarantaine"), { recursive: true, force: true });
});

/** Cree une categorie et un produit, et rend l'identifiant du produit. */
async function produitDeTest(): Promise<string> {
  const categorie = await catalogue.creerCategorie({
    nom: `Rangement ${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
  });
  const produit = await catalogue.creerProduit({
    nom: `Pièce ${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    categorieId: categorie.id,
  });
  return produit.id;
}

/** Une photographie de test portant un EXIF complet, GPS compris. */
async function photographie(largeur = 900, hauteur = 700): Promise<Buffer> {
  return sharp({
    create: {
      width: largeur,
      height: hauteur,
      channels: 3,
      background: "#c8a165",
    },
  })
    .withExif({
      IFD0: { Software: "Application de retouche", Artist: "exploitante" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "48/1 51/1 24/1" },
    })
    .jpeg()
    .toBuffer();
}

/** Contenu du dossier publie d'un media, ou liste vide. */
async function fichiersPublies(chemin: string): Promise<string[]> {
  try {
    return await readdir(join(racineMedias, "public", chemin));
  } catch {
    return [];
  }
}

/** Contenu de la quarantaine, ou liste vide. */
async function fichiersEnQuarantaine(): Promise<string[]> {
  try {
    return await readdir(join(racineMedias, "quarantaine"));
  } catch {
    return [];
  }
}

/** Le statut et le chemin tels que la BASE les porte, pas le retour. */
async function ligneEnBase(id: string) {
  const { rows } = await client.query(
    "SELECT statut_traitement, chemin, ordre, texte_alternatif FROM media WHERE id = $1",
    [id],
  );
  return rows[0];
}

describe("televersement reussi", () => {
  /**
   * LES TROIS EFFETS SONT VERIFIES ENSEMBLE, et c'est la raison d'etre de ce
   * fichier : base, disque et valeur rendue doivent dire la meme chose.
   */
  it("publie les onze declinaisons, passe a TRAITE et vide la quarantaine", async () => {
    const produitId = await produitDeTest();

    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    expect(media.statutTraitement).toBe("TRAITE");

    const ligne = await ligneEnBase(media.id);
    expect(ligne.statut_traitement).toBe("TRAITE");
    expect(ligne.chemin).toBe(media.chemin);

    expect(await fichiersPublies(media.chemin)).toHaveLength(11);

    // L'ORIGINAL A DISPARU : c'est le seul fichier qui porte la position GPS,
    // et le conserver le ferait survivre dans les sauvegardes, ADR-007.
    expect(await fichiersEnQuarantaine()).toHaveLength(0);
  });

  /**
   * AUCUNE DECLINAISON PUBLIEE NE PORTE D'EXIF.
   *
   * CE TEST EST DISTINCT DE CELUI DU MODULE DE TRAITEMENT, et il ne fait pas
   * double emploi : celui-la verifiait les octets rendus en memoire, celui-ci
   * verifie les octets REELLEMENT ECRITS sur le disque, apres etre passes par
   * la publication. Une etape de copie qui reintroduirait des metadonnees se
   * verrait ici et nulle part ailleurs.
   */
  it("n'ecrit aucun EXIF dans les fichiers publies", async () => {
    const produitId = await produitDeTest();
    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    const noms = await fichiersPublies(media.chemin);
    for (const nom of noms) {
      const metadonnees = await sharp(
        join(racineMedias, "public", media.chemin, nom),
      ).metadata();
      expect(metadonnees.exif, `EXIF present dans ${nom}`).toBeUndefined();
    }
  });

  /** Le premier media prend le rang 1, les suivants s'empilent, C9. */
  it("attribue les rangs dans l'ordre de televersement", async () => {
    const produitId = await produitDeTest();

    const premier = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    const second = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    expect((await ligneEnBase(premier.id)).ordre).toBe(1);
    expect((await ligneEnBase(second.id)).ordre).toBe(2);
  });

  /**
   * DEUX MEDIAS COHABITENT SANS HEURTER C9. L'index partiel est filtre sur
   * `ordre = 1` : sans ce filtre, un produit ne pourrait porter qu'un seul
   * media. Ce test le verifie plutot que de le supposer.
   */
  it("accepte plusieurs medias sur un meme produit", async () => {
    const produitId = await produitDeTest();

    await medias.televerserPhotographie(produitId, await photographie());
    await medias.televerserPhotographie(produitId, await photographie());
    await medias.televerserPhotographie(produitId, await photographie());

    expect(await medias.listerMedias(produitId)).toHaveLength(3);
  });

  it("refuse un produit inexistant sans rien publier", async () => {
    await expect(
      medias.televerserPhotographie(
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        await photographie(),
      ),
    ).rejects.toThrow(medias.ProduitIntrouvableError);

    // Le fichier depose reste en quarantaine, orphelin : la purge s'en charge.
    // Rien n'est publie, ce qui est la seule propriete qui compte ici.
    const { rows } = await client.query("SELECT count(*)::int AS n FROM media");
    expect(rows[0].n).toBe(0);
  });
});

describe("echec de traitement, C8", () => {
  /**
   * LE TEST CENTRAL DE LA STORY AVEC CELUI DE L'EXIF.
   *
   * `PARCOURS.md` : « Aucune image n'est jamais servie publiquement sans
   * traitement. C'est un blocage, pas un avertissement. » Un fichier illisible
   * doit donc laisser la base en `ECHOUE` ET le dossier publie VIDE.
   *
   * LES DEUX MOITIES COMPTENT AUTANT. Un statut `ECHOUE` sur un media dont les
   * fichiers seraient malgre tout publies serait le pire des cas : l'ecran
   * dirait « en echec », et Nginx servirait l'image avec sa position GPS.
   */
  it("laisse ECHOUE en base et ne publie aucun fichier", async () => {
    const produitId = await produitDeTest();

    await expect(
      medias.televerserPhotographie(
        produitId,
        Buffer.from("ceci n'est pas une photographie"),
      ),
    ).rejects.toThrow(medias.FichierNonImageError);

    const liste = await medias.listerMedias(produitId);
    expect(liste).toHaveLength(1);
    expect(liste[0]?.statutTraitement).toBe("ECHOUE");

    // AUCUN DOSSIER PUBLIE, verifie sur le disque et non par un filtre.
    const publies = join(racineMedias, "public");
    const contenu = existsSync(publies) ? await readdir(publies) : [];
    expect(contenu).toHaveLength(0);
  });

  /**
   * LE MEDIA EN ECHEC RESTE VISIBLE dans l'administration. Le supprimer
   * automatiquement priverait l'exploitante de l'explication : elle verrait sa
   * photographie disparaitre sans message.
   */
  it("garde le media en echec dans la liste", async () => {
    const produitId = await produitDeTest();

    await medias
      .televerserPhotographie(produitId, Buffer.from("illisible"))
      .catch(() => undefined);

    const liste = await medias.listerMedias(produitId);
    expect(liste).toHaveLength(1);
  });

  /**
   * UN SVG EST REFUSE ET LAISSE LA MEME TRACE. Le refus vient de la signature
   * du fichier, avant tout decodage : c'est une erreur de saisie que l'ecran
   * doit nommer, donc elle remonte plutot que d'etre avalee.
   */
  it("refuse un SVG en laissant le media en echec", async () => {
    const produitId = await produitDeTest();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
    );

    await expect(medias.televerserPhotographie(produitId, svg)).rejects.toThrow(
      medias.FormatRefuseError,
    );

    const liste = await medias.listerMedias(produitId);
    expect(liste[0]?.statutTraitement).toBe("ECHOUE");
  });

  /**
   * LE CHEMIN D'UN MEDIA EN ECHEC NE DESIGNE AUCUN FICHIER SERVABLE. Il porte
   * encore l'identifiant de quarantaine : meme si une requete oubliait de
   * filtrer sur le statut, LS-104 ne trouverait rien a servir. C'est la
   * propriete physique qu'ADR-007 a preferee au filtre applicatif.
   */
  it("laisse un chemin qui ne pointe vers rien de publie", async () => {
    const produitId = await produitDeTest();

    await medias
      .televerserPhotographie(produitId, Buffer.from("illisible"))
      .catch(() => undefined);

    const liste = await medias.listerMedias(produitId);
    const chemin = liste[0]!.chemin;
    expect(existsSync(join(racineMedias, "public", chemin))).toBe(false);
  });
});

describe("texte alternatif, C7", () => {
  it("ecrit puis relit le texte alternatif", async () => {
    const produitId = await produitDeTest();
    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.ecrireTexteAlternatif({
      id: media.id,
      texteAlternatif: "Collier en argent sur fond clair",
    });

    expect((await ligneEnBase(media.id)).texte_alternatif).toBe(
      "Collier en argent sur fond clair",
    );
  });

  /**
   * LE TEXTE ALTERNATIF EST FACULTATIF A L'ECRITURE, obligatoire a la
   * PUBLICATION, C7 et LS-103. Effacer doit donc etre possible : le contraire
   * enfermerait l'exploitante dans une premiere saisie maladroite.
   */
  it("accepte un texte vide, ramene a nul", async () => {
    const produitId = await produitDeTest();
    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.ecrireTexteAlternatif({
      id: media.id,
      texteAlternatif: "Un texte",
    });
    await medias.ecrireTexteAlternatif({ id: media.id, texteAlternatif: "" });

    expect((await ligneEnBase(media.id)).texte_alternatif).toBeNull();
  });

  it("refuse un media inconnu", async () => {
    await expect(
      medias.ecrireTexteAlternatif({
        id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        texteAlternatif: "Ailleurs",
      }),
    ).rejects.toThrow(medias.MediaIntrouvableError);
  });
});

describe("suppression d'un media", () => {
  /** La ligne ET les fichiers partent : un media supprime ne laisse rien. */
  it("retire la ligne et les fichiers publies", async () => {
    const produitId = await produitDeTest();
    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    expect(await fichiersPublies(media.chemin)).toHaveLength(11);

    await medias.supprimerMedia({ id: media.id });

    expect(await medias.listerMedias(produitId)).toHaveLength(0);
    expect(existsSync(join(racineMedias, "public", media.chemin))).toBe(false);
  });

  /**
   * SUPPRIMER UN MEDIA EN ECHEC NE LEVE PAS. Ses fichiers n'ont jamais ete
   * publies : une suppression qui exigerait leur presence rendrait un media en
   * echec impossible a retirer, donc bloquerait la publication du produit pour
   * toujours.
   */
  it("supprime un media en echec, dont rien n'a ete publie", async () => {
    const produitId = await produitDeTest();
    await medias
      .televerserPhotographie(produitId, Buffer.from("illisible"))
      .catch(() => undefined);

    const liste = await medias.listerMedias(produitId);
    await medias.supprimerMedia({ id: liste[0]!.id });

    expect(await medias.listerMedias(produitId)).toHaveLength(0);
  });

  it("refuse un media inconnu", async () => {
    await expect(
      medias.supprimerMedia({ id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" }),
    ).rejects.toThrow(medias.MediaIntrouvableError);
  });
});

describe("reordonnancement, C9 et index partiel non differable", () => {
  /**
   * LE TEST QUE LA MESURE DU 14 AOUT 2026 A RENDU NECESSAIRE.
   *
   * `media_principal_unique` est un INDEX partiel filtre sur `ordre = 1`, pas
   * une contrainte : il n'est donc PAS differable, et il est verifie LIGNE A
   * LIGNE. Mesure sur PostgreSQL 18.4, le meme echange reussit dans un sens et
   * echoue dans l'autre :
   *
   *   VERT   liberer le rang 1 puis le prendre
   *   ROUGE  prendre le rang 1 avant de l'avoir libere
   *          duplicate key value violates unique constraint
   *
   * LA TRANSACTION NE SAUVE PAS. Un reordonnancement ecrit naivement marche
   * selon l'ordre de parcours des lignes : il peut passer en developpement et
   * casser en production, ce qui est pire qu'un echec systematique.
   *
   * CE TEST ECHANGE LE PREMIER ET LE SECOND, c'est-a-dire exactement le cas ou
   * un media PREND le rang 1 qu'un autre occupe encore.
   */
  it("echange le media principal avec le second", async () => {
    const produitId = await produitDeTest();
    const premier = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    const second = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.reordonnerMedias({
      produitId,
      ids: [second.id, premier.id],
    });

    expect((await ligneEnBase(second.id)).ordre).toBe(1);
    expect((await ligneEnBase(premier.id)).ordre).toBe(2);
  });

  /** L'echange doit reussir DANS LES DEUX SENS, critere d'acceptation. */
  it("revient a l'ordre initial par un second echange", async () => {
    const produitId = await produitDeTest();
    const premier = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    const second = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.reordonnerMedias({ produitId, ids: [second.id, premier.id] });
    await medias.reordonnerMedias({ produitId, ids: [premier.id, second.id] });

    expect((await ligneEnBase(premier.id)).ordre).toBe(1);
    expect((await ligneEnBase(second.id)).ordre).toBe(2);
  });

  /**
   * L'INVERSION COMPLETE DE TROIS MEDIAS met le rang 1 en jeu au milieu d'une
   * cascade. Une implementation qui passerait par chance sur deux elements
   * echoue ici.
   */
  it("inverse entierement trois medias", async () => {
    const produitId = await produitDeTest();
    const un = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    const deux = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    const trois = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.reordonnerMedias({
      produitId,
      ids: [trois.id, deux.id, un.id],
    });

    expect((await ligneEnBase(trois.id)).ordre).toBe(1);
    expect((await ligneEnBase(deux.id)).ordre).toBe(2);
    expect((await ligneEnBase(un.id)).ordre).toBe(3);
  });

  /**
   * APRES CHAQUE REORDONNANCEMENT, EXACTEMENT UN MEDIA PORTE LE RANG 1. C'est
   * la regle C9 elle-meme, et la verifier apres coup attrape un etat que les
   * assertions par identifiant pourraient manquer : deux medias au rang 1 sont
   * impossibles sous l'index, mais ZERO media au rang 1 ne l'est pas.
   */
  it("laisse exactement un media au rang 1", async () => {
    const produitId = await produitDeTest();
    const un = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    const deux = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.reordonnerMedias({ produitId, ids: [deux.id, un.id] });

    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM media WHERE produit_id = $1 AND ordre = 1",
      [produitId],
    );
    expect(rows[0].n).toBe(1);
  });

  /**
   * UNE LISTE INCOMPLETE EST REFUSEE, et l'etat ne bouge pas. L'accepter
   * reecrirait les rangs 1..n sur un sous-ensemble, en collision avec les rangs
   * des medias omis.
   */
  it("refuse une liste qui n'est pas exhaustive et laisse l'ordre intact", async () => {
    const produitId = await produitDeTest();
    const un = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );
    await medias.televerserPhotographie(produitId, await photographie());

    await expect(
      medias.reordonnerMedias({ produitId, ids: [un.id] }),
    ).rejects.toThrow(medias.OrdreMediasIncompletError);

    expect((await ligneEnBase(un.id)).ordre).toBe(1);
  });

  /**
   * UN MEDIA D'UN AUTRE PRODUIT NE SE GLISSE PAS DANS L'ORDRE, invariant 2
   * applique a un identifiant de ressource : il DESIGNE, il n'autorise pas.
   * Sans ce controle, une liste de la bonne longueur deplacerait le media du
   * produit voisin.
   */
  it("refuse un media appartenant a un autre produit", async () => {
    const premierProduit = await produitDeTest();
    const secondProduit = await produitDeTest();

    const aPremier = await medias.televerserPhotographie(
      premierProduit,
      await photographie(),
    );
    await medias.televerserPhotographie(premierProduit, await photographie());
    const aSecond = await medias.televerserPhotographie(
      secondProduit,
      await photographie(),
    );

    await expect(
      medias.reordonnerMedias({
        produitId: premierProduit,
        ids: [aSecond.id, aPremier.id],
      }),
    ).rejects.toThrow(medias.MediaIntrouvableError);

    // NI L'UN NI L'AUTRE PRODUIT N'A BOUGE, y compris celui dont le media a ete
    // cite : un refus qui laisserait le voisin reordonne serait pire qu'aucun
    // refus.
    expect((await ligneEnBase(aPremier.id)).ordre).toBe(1);
    expect((await ligneEnBase(aSecond.id)).ordre).toBe(1);
  });
});

describe("purge de la quarantaine", () => {
  /**
   * LA PURGE NE TOUCHE PAS AUX MEDIAS PUBLIES. Elle porte sur les fichiers
   * orphelins d'un televersement interrompu ; emporter un fichier publie
   * casserait la fiche produit correspondante.
   */
  it("laisse intacts les fichiers publies", async () => {
    const produitId = await produitDeTest();
    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    await medias.purgerQuarantaine(0);

    expect(await fichiersPublies(media.chemin)).toHaveLength(11);
  });

  it("rend zero quand la quarantaine est vide", async () => {
    const produitId = await produitDeTest();
    await medias.televerserPhotographie(produitId, await photographie());

    expect(await medias.purgerQuarantaine(0)).toBe(0);
  });
});

/**
 * Le BRANCHEMENT de la purge sur la tache planifiee, LS-102 et LS-72.
 *
 * CE QUE CES TESTS PROUVENT ET QUE LES PRECEDENTS NE PROUVENT PAS. Les tests
 * ci-dessus exercent `purgerQuarantaine` prise isolement : ils diraient la meme
 * chose si AUCUNE tache ne l'appelait jamais, et c'etait exactement l'etat du
 * depot avant cette session. Le trou etait nomme dans le ticket, point 3 du
 * reste a faire.
 *
 * NI `verifier-actions-sensibles.sh` NI AUCUN GREP NE REMPLACE CECI. Trouver
 * `purgerQuarantaine(` dans le fichier de la route prouve que le texte y
 * figure, pas qu'il s'execute : un appel place dans une branche jamais atteinte,
 * ou apres un `return`, satisferait le motif en laissant le trou entier. C'est
 * le piege deja rencontre sur la marque `@sensible`.
 *
 * L'ASSERTION PORTE DONC SUR LE DISQUE, jamais sur le code de reponse. Un 200
 * accompagne d'un fichier toujours present serait le defaut precis que ce test
 * existe pour attraper.
 */
describe("purge branchee sur la tache planifiee", () => {
  const SECRET = "secret-de-test-uniquement-jamais-en-production";
  const TACHE = "purge-quarantaine-medias";

  let POST: (
    requete: Request,
    contexte: { params: Promise<{ nom: string }> },
  ) => Promise<Response>;

  beforeAll(async () => {
    process.env.CRON_SHARED_SECRET = SECRET;
    ({ POST } = await import("@/app/api/interne/taches/[nom]/route"));
  });

  afterEach(async () => {
    await client.query("TRUNCATE verrou_tache");
  });

  function appeler(nom: string, secret?: string) {
    const enTetes = new Headers();
    if (secret !== undefined) {
      enTetes.set("x-cron-secret", secret);
    }

    return POST(
      new Request(`http://localhost:3000/api/interne/taches/${nom}`, {
        method: "POST",
        headers: enTetes,
      }),
      { params: Promise.resolve({ nom }) },
    );
  }

  /**
   * Depose un orphelin en quarantaine, comme le ferait un televersement
   * interrompu AVANT le traitement, premier cas d'erreur du parcours 3.
   *
   * LE DEPOT PASSE PAR LE VRAI STOCKAGE et non par un `writeFile` a la main :
   * ecrire le fichier soi-meme figerait dans le test la convention de nommage
   * de la quarantaine, et le test resterait vert si le service en changeait.
   */
  async function orphelinEnQuarantaine(): Promise<void> {
    const { StockageMedias } = await import("@/integrations/medias/stockage");
    const magasin = new StockageMedias(racineMedias);
    await magasin.preparer();
    const identifiant = await magasin.deposerEnQuarantaine(
      await photographie(),
    );

    /*
     * LE FICHIER EST VIEILLI DE DEUX HEURES, et ce detail porte une propriete.
     *
     * La tache purge a partir d'UNE HEURE, valeur par defaut du service : un
     * orphelin fraichement depose doit donc SURVIVRE, parce qu'un televersement
     * peut etre en cours de traitement. Sans ce vieillissement, ce test rougit,
     * ce qui a ete constate avant de l'ecrire.
     *
     * VIEILLIR PLUTOT QUE BAISSER LE SEUIL : la route n'expose aucun parametre
     * d'age, et lui en ajouter un pour les besoins du test ferait tester une
     * configuration que la production n'emploie jamais. Ici c'est le vrai seuil
     * d'une heure qui est exerce.
     */
    const ancien = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(
      join(racineMedias, "quarantaine", identifiant),
      ancien,
      ancien,
    );
  }

  /**
   * UN ORPHELIN RECENT SURVIT A LA TACHE. Le pendant du test precedent, et il
   * compte autant : une purge sans seuil d'age supprimerait le fichier d'un
   * televersement en cours de traitement, faisant echouer une operation
   * legitime a chaque passage du cron.
   */
  it("la tache epargne un orphelin trop recent", async () => {
    const { StockageMedias } = await import("@/integrations/medias/stockage");
    const magasin = new StockageMedias(racineMedias);
    await magasin.preparer();
    await magasin.deposerEnQuarantaine(await photographie());

    const reponse = await appeler(TACHE, SECRET);

    expect(reponse.status).toBe(200);
    expect(await fichiersEnQuarantaine()).toHaveLength(1);
  });

  it("la tache supprime reellement un orphelin de quarantaine", async () => {
    await orphelinEnQuarantaine();
    expect(await fichiersEnQuarantaine()).toHaveLength(1);

    const reponse = await appeler(TACHE, SECRET);

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      tache: TACHE,
      etat: "EXECUTEE",
    });

    // LE DISQUE EST L'ASSERTION QUI COMPTE. Une route qui repondrait
    // « EXECUTEE » sans avoir appele la purge passerait les deux lignes
    // precedentes et echouerait ici.
    expect(await fichiersEnQuarantaine()).toHaveLength(0);
  });

  /**
   * LA PURGE N'EMPORTE PAS LES FICHIERS PUBLIES, verifie A TRAVERS LA ROUTE.
   *
   * Le test equivalent existe plus haut sur la fonction seule. Le rejouer ici
   * couvre un defaut que l'autre ne voit pas : une route qui appellerait la
   * purge sur la MAUVAISE racine, celle du dossier publie, detruirait les onze
   * declinaisons de chaque fiche a chaque passage du cron.
   */
  it("la tache laisse intacts les fichiers publies", async () => {
    const produitId = await produitDeTest();
    const media = await medias.televerserPhotographie(
      produitId,
      await photographie(),
    );

    const reponse = await appeler(TACHE, SECRET);
    expect(reponse.status).toBe(200);

    expect(await fichiersPublies(media.chemin)).toHaveLength(11);
  });

  /**
   * TEST NEGATIF DE SECURITE. Sans le secret, aucun fichier ne bouge.
   *
   * La route rend deja 404 sans secret, teste en LS-72. Ce qui est verifie ici
   * est l'EFFET : le refus intervient avant la purge, et non apres.
   */
  it("un appel sans secret ne supprime rien", async () => {
    await orphelinEnQuarantaine();

    const reponse = await appeler(TACHE);

    expect(reponse.status).toBe(404);
    expect(await fichiersEnQuarantaine()).toHaveLength(1);
  });
});
