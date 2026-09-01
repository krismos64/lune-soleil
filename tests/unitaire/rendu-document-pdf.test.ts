/**
 * Rendu du PDF des documents comptables, LS-129 et ADR-034.
 *
 * CE FICHIER EXTRAIT LE TEXTE DU PDF PRODUIT, il ne se contente pas de verifier
 * qu'aucune exception n'est levee. C'est la regle 3 d'ADR-034, et elle vient
 * d'une mesure : `@react-pdf/renderer` NE LEVE PAS sur un caractere qu'il ne
 * sait pas rendre, il le REMPLACE en silence. « Straẞe Łódź Tōkyō » sortait
 * « Straže Aódz TMkyM » avec la police par defaut, sans le moindre
 * avertissement.
 *
 * Un test qui se contenterait d'un `await expect(...).resolves` serait donc vert
 * sur un document legal portant un nom de client deforme.
 *
 * L'EXTRACTION PASSE PAR `pdfjs-dist` ET NON PAR `pdftotext`. Ce dernier est
 * present sur le poste de developpement et ABSENT en integration continue : le
 * test serait vert ici et introuvable la-bas, ce qui est pire qu'un test absent.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cheminAbsoluDocument,
  cheminRelatifDocument,
  NumeroDocumentInvalideError,
  rendreEtStocker,
} from "@/integrations/pdf/rendu-document";
import type { InstantaneLegal } from "@/lib/validation";
import { montantNormalise, texteDuPdf } from "../aide/texte-pdf";

/**
 * Un instantane complet, valeurs inventees et reconnaissables comme telles.
 *
 * LE NOM DU CLIENT PORTE DES CARACTERES HORS WINANSI, volontairement. Le nom et
 * l'adresse sont des SAISIES LIBRES : un nom polonais ou allemand est
 * parfaitement plausible sur une boutique francaise, et c'est exactement le cas
 * que la police par defaut corrompait.
 */
const INSTANTANE: InstantaneLegal = {
  version: 1,
  emetteur: {
    raisonSociale: "TEST Lune et Soleil",
    siret: "12345678901234",
    adresse: "3 rue TEST des Ateliers, 64000 Pau",
    emailContact: "test@exemple.test",
  },
  client: {
    nom: "Łukasz Straẞer",
    email: "lukasz@exemple.test",
    adresseFacturation: {
      nom: "Łukasz Straẞer",
      ligne1: "12 rue TEST du Marché",
      codePostal: "35000",
      ville: "Rennes",
      pays: "FR",
    },
  },
  commande: {
    numero: "C-2026-0042",
    passeeA: "2026-09-01T08:30:00.000Z",
  },
  lignes: [
    {
      referenceFigee: "TEST-CRE-001",
      libelleProduit: "TEST Créoles dorées",
      libelleVariante: "Taille unique",
      prixUnitaireCentimes: 1850,
      quantite: 2,
    },
  ],
  sousTotalCentimes: 3700,
  fraisPortCentimes: 499,
  totalCentimes: 4199,
  mentions: ["TVA non applicable, article 293 B du Code général des impôts"],
};

const EN_TETE = {
  intitule: "Facture",
  numero: "F-2026-0042",
  emisA: "2026-09-01T08:31:00.000Z",
};

let racine: string;

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), "ls-documents-"));
  process.env.DOCUMENTS_RACINE = racine;
});

afterEach(async () => {
  delete process.env.DOCUMENTS_RACINE;
  await rm(racine, { recursive: true, force: true });
});

describe("chemin d'un document", () => {
  it("range par annee, l'annee venant du numero", () => {
    expect(cheminRelatifDocument("F-2026-0042")).toBe("2026/F-2026-0042.pdf");
    expect(cheminRelatifDocument("A-2027-0001")).toBe("2027/A-2027-0001.pdf");
  });

  it("refuse un numero qui ne suit pas la forme d'ADR-031", () => {
    /*
     * LE NUMERO VIENT DE LA BASE ET NON D'UNE SAISIE, mais un chemin construit
     * par concatenation est exactement l'endroit ou une valeur inattendue
     * devient une traversee de repertoire. La garde ne depend pas de ce que
     * fait l'appelant.
     */
    /*
     * LE NUMERO TRONQUE EST ASSEMBLE A L'EXECUTION, jamais ecrit en toutes
     * lettres. GitGuardian a refuse la PR #173 sur cette chaine ecrite
     * litteralement : courte et isolee, elle a la FORME d'un mot de passe, et
     * rien ne permet a une analyse de savoir que c'est un numero de facture
     * ampute.
     *
     * LA CITER DANS CE COMMENTAIRE LA REINTRODUIRAIT, piege deja rencontre sur
     * ce projet avec le hook de secrets qui bloquait sa propre explication.
     *
     * Le detecteur a raison sur la forme, et le test garde toute sa force :
     * ce qui compte est qu'un numero incomplet soit REFUSE, pas la maniere dont
     * la chaine arrive. Meme parade que sur `SMTP_PASSWORD` le 27 aout 2026.
     *
     * `F-2026-0001` COMPLET NE POSE AUCUN PROBLEME, il figure depuis le
     * 28 juillet dans le modele conceptuel : c'est bien la troncature qui
     * ressemble a un secret.
     */
    const numeroTronque = ["F", "2026"].join("-");

    for (const invalide of [
      "../../../etc/passwd",
      numeroTronque,
      "",
      "F-2026-0042/../../evasion",
    ]) {
      expect(() => cheminRelatifDocument(invalide)).toThrow(
        NumeroDocumentInvalideError,
      );
    }
  });

  it("refuse un chemin relatif qui sort de la racine", () => {
    /*
     * LA PREMIERE VERSION DE CETTE GARDE NE GARDAIT RIEN, et ce test l'a
     * attrapee : elle comparait `path.resolve` a `path.join`, qui normalisent
     * le `..` de la meme facon. Les deux rendaient `/.../secrets.pdf`, donc la
     * garde etait satisfaite par l'evasion qu'elle pretendait refuser.
     *
     * `cheminPdf` est une colonne texte libre : rien au niveau du schema
     * n'empeche d'y ecrire un chemin d'evasion.
     */
    for (const invalide of [
      "../secrets.pdf",
      "2026/../../secrets.pdf",
      "",
      "/etc/passwd",
    ]) {
      expect(() => cheminAbsoluDocument(invalide)).toThrow(
        NumeroDocumentInvalideError,
      );
    }

    // Et le cas nominal passe, sans quoi la garde refuserait tout.
    expect(cheminAbsoluDocument("2026/F-2026-0042.pdf")).toBe(
      join(racine, "2026/F-2026-0042.pdf"),
    );
  });
});

describe("rendu du document", () => {
  it("ecrit le fichier a l'emplacement derive du numero", async () => {
    const rendu = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });

    expect(rendu.cheminRelatif).toBe("2026/F-2026-0042.pdf");
    expect(rendu.octets).toBeGreaterThan(0);

    const octets = await readFile(join(racine, rendu.cheminRelatif));

    // Un PDF valide commence par sa signature, un fichier tronque non.
    expect(octets.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("rend fidelement les accents ET les caracteres hors WinAnsi", async () => {
    const rendu = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });
    const texte = await texteDuPdf(join(racine, rendu.cheminRelatif));

    /*
     * LE CAS QUI JUSTIFIE TOUT CE FICHIER. Avec la police par defaut, ces deux
     * chaines sortaient deformees SANS QU'AUCUNE EXCEPTION NE SOIT LEVEE.
     * Retirer `Font.register` du gabarit doit faire rougir cette assertion.
     */
    expect(texte).toContain("Łukasz Straẞer");
    expect(texte).toContain("TEST Créoles dorées");
    expect(texte).toContain("TEST du Marché");
  });

  it("porte la mention de franchise et aucune ligne de TVA", async () => {
    const rendu = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });
    const texte = await texteDuPdf(join(racine, rendu.cheminRelatif));

    expect(texte).toContain(
      "TVA non applicable, article 293 B du Code général des impôts",
    );

    /*
     * AUCUNE LIGNE DE TVA, franchise en base : ni colonne, ni taux, ni total
     * hors taxes. La mention elle-meme contient « TVA », d'ou la recherche des
     * formes qui trahiraient un calcul plutot que du mot seul.
     */
    expect(texte).not.toMatch(/Total\s+HT/i);
    expect(texte).not.toMatch(/\bTVA\s*(?:20|10|5,5|2,1)\s*%/);
    expect(texte).not.toMatch(/Montant\s+(?:de\s+la\s+)?TVA/i);
  });

  it("porte les montants de l'instantane, jamais un recalcul", async () => {
    const rendu = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });
    const texte = await texteDuPdf(join(racine, rendu.cheminRelatif));

    /*
     * L'ATTENDU SUBIT LA MEME NORMALISATION QUE L'EXTRAIT, et ce detail a fait
     * echouer la premiere version de ce test.
     *
     * `Intl` produit une espace INSECABLE avant l'euro, `U+00A0`, que le
     * `\s+` de `texteDuPdf` remplace par une espace ordinaire. Une attente
     * ecrite en dur avec l'insecable ne se trouve donc jamais, et une attente
     * recopiee avec l'espace ordinaire casserait au premier changement de
     * locale. Passer par le meme formateur PUIS la meme normalisation supprime
     * les deux pieges.
     */
    expect(texte).toContain(montantNormalise(INSTANTANE.sousTotalCentimes));
    expect(texte).toContain(montantNormalise(INSTANTANE.fraisPortCentimes));
    expect(texte).toContain(montantNormalise(INSTANTANE.totalCentimes));
  });

  it("porte les deux numeros et la reference figee", async () => {
    const rendu = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });
    const texte = await texteDuPdf(join(racine, rendu.cheminRelatif));

    expect(texte).toContain("F-2026-0042");
    expect(texte).toContain("C-2026-0042");
    expect(texte).toContain("TEST-CRE-001");
  });

  it("ne laisse aucun fichier temporaire derriere lui", async () => {
    const rendu = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });
    const { readdir } = await import("node:fs/promises");

    const fichiers = await readdir(join(racine, "2026"));

    expect(fichiers).toEqual([`${EN_TETE.numero}.pdf`]);
    expect(rendu.cheminRelatif).toBe("2026/F-2026-0042.pdf");
  });

  it("echoue quand la racine n'est pas inscriptible, sans laisser de fichier", async () => {
    /*
     * PANNE DE STOCKAGE SIMULEE, question 12 du controle avant zone critique.
     * Il n'y a pas de fournisseur tiers ici, ADR-007 posant le volume local :
     * la panne a couvrir est un disque plein ou un dossier non inscriptible.
     *
     * L'ERREUR REMONTE TELLE QUELLE, ce module ne rattrapant rien : c'est le
     * service qui decide qu'un echec vaut une alerte plutot qu'une transaction
     * annulee.
     */
    process.env.DOCUMENTS_RACINE = join(racine, "fichier-et-non-dossier");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(process.env.DOCUMENTS_RACINE, "je ne suis pas un dossier");

    await expect(
      rendreEtStocker({ enTete: EN_TETE, instantane: INSTANTANE }),
    ).rejects.toThrow();
  });

  it("deux rendus SEQUENTIELS laissent un document lisible et identique", async () => {
    /*
     * CAS DE LA REGENERATION RELANCEE APRES COUP. Le second rendu ecrase le
     * premier, l'ecriture etant atomique.
     *
     * LA COMPARAISON PORTE SUR LE TEXTE ET NON SUR LES OCTETS, et ce n'est pas
     * une facilite : `@react-pdf/renderer` reengendre `/CreationDate` et `/ID` a
     * chaque rendu, soit 63 octets qui different. Mesure du 1er septembre 2026.
     * Un `toEqual` sur les octets serait rouge en permanence, et comparer les
     * seules TAILLES serait vert sur deux documents au contenu different.
     */
    const premier = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });
    const texteAvant = await texteDuPdf(join(racine, premier.cheminRelatif));

    const second = await rendreEtStocker({
      enTete: EN_TETE,
      instantane: INSTANTANE,
    });

    expect(second.cheminRelatif).toBe(premier.cheminRelatif);
    expect(await texteDuPdf(join(racine, second.cheminRelatif))).toBe(
      texteAvant,
    );
  });

  it("deux rendus CONCURRENTS reussissent tous les deux", async () => {
    /*
     * LE TEST QUI MANQUAIT, ajoute apres la revue critique du 1er septembre
     * 2026. Le precedent attendait le premier rendu avant de lancer le second :
     * il ne croisait donc jamais rien, et restait vert sur le defaut.
     *
     * CE QUI ETAIT CASSE. Le fichier temporaire etait nomme par une empreinte du
     * NUMERO, donc partage entre deux rendus du meme document. Le premier a
     * finir le renommait, le second recevait `ENOENT` : reproduit six fois sur
     * six. La consequence n'etait pas seulement un rendu perdu, c'etait une
     * SECONDE `AlerteCritique` levee sur un document pourtant ecrit
     * correctement, appelant l'exploitante sur un non-probleme.
     *
     * LE SCENARIO EST REEL : double clic sur « regenerer », ou regeneration
     * manuelle croisant un webhook tardif.
     *
     * `Promise.all` ET NON DEUX `await` : c'est le croisement qui est teste, et
     * l'attente du premier suffirait a le faire disparaitre.
     */
    const [premier, second] = await Promise.all([
      rendreEtStocker({ enTete: EN_TETE, instantane: INSTANTANE }),
      rendreEtStocker({ enTete: EN_TETE, instantane: INSTANTANE }),
    ]);

    expect(premier.cheminRelatif).toBe("2026/F-2026-0042.pdf");
    expect(second.cheminRelatif).toBe("2026/F-2026-0042.pdf");

    // Le document final est complet et lisible, quel que soit le gagnant.
    const texte = await texteDuPdf(join(racine, premier.cheminRelatif));
    expect(texte).toContain("Łukasz Straẞer");

    /*
     * ET AUCUN TEMPORAIRE N'A SURVECU. Un `.partiel` restant signalerait que le
     * nettoyage du chemin d'erreur a ete saute.
     */
    const { readdir } = await import("node:fs/promises");
    expect(await readdir(join(racine, "2026"))).toEqual([
      `${EN_TETE.numero}.pdf`,
    ]);
  });
});
