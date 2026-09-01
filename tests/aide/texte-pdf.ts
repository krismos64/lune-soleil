/**
 * Extraction du texte d'un PDF, pour les tests de LS-129.
 *
 * POURQUOI CETTE AIDE EXISTE. `@react-pdf/renderer` NE LEVE PAS sur un
 * caractere qu'il ne sait pas rendre, il le REMPLACE en silence : mesure du
 * 1er septembre 2026, « Straẞe Łódź Tōkyō » sortait « Straže Aódz TMkyM » avec
 * la police par defaut. Un test qui se contenterait de verifier qu'aucune
 * exception n'est levee serait donc vert sur un document legal portant un nom
 * de client deforme, regle 3 d'ADR-034.
 *
 * `pdfjs-dist` ET NON `pdftotext`. Ce dernier est present sur le poste de
 * developpement et ABSENT en integration continue : le test serait vert ici et
 * introuvable la-bas, ce qui est pire qu'un test absent.
 */
import { readFile } from "node:fs/promises";

/**
 * Rend le texte d'un PDF, toutes pages confondues et espaces normalises.
 *
 * LES ELEMENTS SONT JOINTS PAR UNE ESPACE et le resultat normalise : la mise en
 * page decoupe une phrase en fragments dont les frontieres dependent des
 * colonnes, et un test qui en dependrait casserait au premier ajustement de
 * gabarit. Ce qui se verifie est la PRESENCE des chaines, pas leur decoupage.
 *
 * CONSEQUENCE A CONNAITRE POUR ECRIRE UNE ASSERTION : la normalisation remplace
 * l'espace INSECABLE que produit `Intl` avant le signe euro. Comparer a une
 * chaine formatee sans lui appliquer la meme normalisation ne trouve jamais
 * rien, piege rencontre en ecrivant ces tests. `montantNormalise` ci-dessous
 * existe pour cela.
 */
export async function texteDuPdf(chemin: string): Promise<string> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const tache = getDocument({ data: new Uint8Array(await readFile(chemin)) });
  const document = await tache.promise;
  const morceaux: string[] = [];

  for (let page = 1; page <= document.numPages; page += 1) {
    const contenu = await (await document.getPage(page)).getTextContent();

    morceaux.push(
      contenu.items
        .map((element) => ("str" in element ? element.str : ""))
        .join(" "),
    );
  }

  /*
   * `destroy` EST SUR LA TACHE DE CHARGEMENT, pas sur le document : l'appeler
   * sur ce dernier leve « destroy is not a function ». Sans ce nettoyage, le
   * processus de test garde des ressources ouvertes.
   */
  await tache.destroy();

  return morceaux.join(" ").replace(/\s+/g, " ");
}

/**
 * Un montant tel qu'il apparaitra dans le texte extrait.
 *
 * IL PASSE PAR LE MEME FORMATEUR QUE LE GABARIT, puis par la meme
 * normalisation : recopier « 37,00 € » a la main figerait a la fois la locale
 * et le type d'espace, deux choses qui ne se voient pas a la relecture.
 */
export function montantNormalise(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  })
    .format(centimes / 100)
    .replace(/\s+/g, " ");
}
