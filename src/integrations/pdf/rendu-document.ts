/**
 * Rendu et stockage des documents comptables. LS-129, ADR-034 et ADR-007.
 *
 * CE MODULE NE DECIDE RIEN. Il rend un document et l'ecrit sur le volume local.
 * Ce qui doit etre rendu, quand, et ce qu'un echec provoque appartient a
 * `services/document-comptable.ts`.
 *
 * LE FICHIER VA SUR LE VOLUME LOCAL, jamais chez un service tiers, ADR-007. Une
 * facture est une donnee comptable a conserver dix ans : la confier a un
 * hebergeur tiers ajouterait un transfert de donnees personnelles et une
 * dependance de disponibilite a un document qui doit rester lisible sans lui.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { InstantaneLegal } from "@/lib/validation";
import { GabaritDocument, type EnTeteDocument } from "./gabarit-document";

/**
 * Racine du volume des documents comptables, ADR-007.
 *
 * LUE A L'APPEL ET NON AU CHARGEMENT DU MODULE, meme raison que pour les
 * medias : les tests d'integration pointent sur un dossier temporaire, et une
 * constante figee a l'import les ferait tous ecrire au meme endroit.
 *
 * DISTINCTE DE `MEDIA_RACINE`, et ce n'est pas un detail d'organisation. Les
 * medias sont servis publiquement par Nginx ; un document comptable ne doit
 * JAMAIS l'etre, son acces passant par un controle de propriete, LS-57 et
 * LS-132. Les ranger sous la meme racine exposerait les factures a une URL
 * devinable le jour ou la configuration du serveur changerait.
 */
function racineDocuments(): string {
  return process.env.DOCUMENTS_RACINE ?? "/var/lib/lune-soleil/documents";
}

/*
 * POURQUOI `turbopackIgnore` SUR LES CHEMINS CONSTRUITS PLUS BAS.
 *
 * `next build` analyse les operations de chemin pour deduire les fichiers a
 * copier dans la sortie standalone. Ne sachant pas resoudre une racine qui vient
 * d'une variable d'environnement, il abandonne et TRACE TOUT LE PROJET :
 * « Encountered unexpected file in NFT list », mesure du 1er septembre 2026, et
 * la sortie passait de 44 a 67 Mo.
 *
 * L'ANNOTATION EST JUSTE ICI, elle ne masque pas un defaut. `DOCUMENTS_RACINE`
 * designe un VOLUME EXTERNE monte a l'execution, ADR-007 : ces fichiers ne
 * doivent jamais entrer dans l'image, une facture n'etant pas un actif de
 * construction. Les seuls fichiers du depot que ce module a besoin de voir sont
 * les polices, tracees depuis `gabarit-document.tsx` et declarees dans
 * `next.config.ts`.
 */

/**
 * Chemin relatif d'un document, tel qu'il est ecrit dans `cheminPdf`.
 *
 * RELATIF ET NON ABSOLU : la racine change entre le poste de developpement, la
 * CI et la production, et un chemin absolu en base deviendrait faux au premier
 * deploiement. La colonne porte donc `2026/F-2026-0001.pdf`, jamais
 * `/var/lib/...`.
 *
 * RANGE PAR ANNEE parce qu'un dossier plat de dix ans de factures devient
 * penible a inspecter, et que l'annee est deja dans le numero, ADR-031.
 *
 * LE NUMERO EST FILTRE AVANT D'ENTRER DANS UN CHEMIN. Il vient de la base et
 * non d'une saisie, mais un chemin construit par concatenation est exactement
 * l'endroit ou une valeur inattendue devient une traversee de repertoire : la
 * garde coute une ligne et ne depend pas de ce que fait l'appelant.
 */
export function cheminRelatifDocument(numero: string): string {
  if (!/^[A-Z]-\d{4}-\d{4,}$/.test(numero)) {
    throw new NumeroDocumentInvalideError(numero);
  }

  const annee = numero.slice(2, 6);

  return path.posix.join(annee, `${numero}.pdf`);
}

/** Un numero qui ne suit pas la forme attendue, ADR-031. */
export class NumeroDocumentInvalideError extends Error {
  constructor(numero: string) {
    super(`Numero de document invalide : ${numero}`);
    this.name = "NumeroDocumentInvalideError";
  }
}

export type DocumentARendre = {
  enTete: EnTeteDocument;
  instantane: InstantaneLegal;
};

export type DocumentRendu = {
  /** Chemin relatif a poser dans `cheminPdf`. */
  cheminRelatif: string;
  /** Taille du fichier ecrit, pour la trace. */
  octets: number;
};

/**
 * Rend le document et l'ecrit sur le volume.
 *
 * L'ECRITURE EST ATOMIQUE, fichier temporaire puis `rename`. Sans cela, une
 * coupure en cours d'ecriture laisserait un PDF TRONQUE a l'emplacement final,
 * et `cheminPdf` serait pose sur un fichier illisible : le mecanisme de
 * detection de LS-49 ne verrait rien, la colonne n'etant pas nulle. Un
 * `rename` sur le meme systeme de fichiers est atomique, le fichier existe
 * entier ou pas du tout.
 *
 * LE TEMPORAIRE EST UNIQUE PAR TENTATIVE, ET NON DERIVE DU NUMERO.
 *
 * La premiere version l'engendrait par une empreinte du numero, en supposant que
 * deux rendus simultanes ecriraient « le meme temporaire puis le meme final,
 * avec le meme contenu ». `ls-critical-reviewer` a mesure que les DEUX moities
 * etaient fausses, le 1er septembre 2026.
 *
 * Le second `rename` n'a pas lieu, il ECHOUE : le premier a deja consomme le
 * temporaire partage, et le second recoit `ENOENT`. Reproduit six fois sur six
 * avec deux appels concurrents. La consequence etait une SECONDE
 * `AlerteCritique` levee sur un document qui venait pourtant d'etre ecrit
 * correctement, et un `ECHEC` rendu a l'appelant alors que le fichier existait.
 *
 * Et le contenu n'est pas identique : `@react-pdf/renderer` reengendre
 * `/CreationDate` et `/ID` a chaque rendu, soit 63 octets qui different. Seul le
 * contenu UTILE est stable.
 *
 * Le prix est un temporaire orphelin possible apres une coupure, 23 Ko dans un
 * dossier annuel : sans commune mesure avec une fausse alerte critique qui
 * appelle l'exploitante sur un non-probleme.
 *
 * IL NE RATTRAPE AUCUNE ERREUR. Un disque plein, un dossier non inscriptible ou
 * un gabarit qui leve remontent tels quels : c'est l'appelant qui decide qu'un
 * echec de rendu vaut une alerte plutot qu'une transaction annulee.
 */
export async function rendreEtStocker(
  document: DocumentARendre,
): Promise<DocumentRendu> {
  const cheminRelatif = cheminRelatifDocument(document.enTete.numero);
  const cheminAbsolu = path.join(
    /* turbopackIgnore: true */ racineDocuments(),
    cheminRelatif,
  );

  const octets = await renderToBuffer(
    GabaritDocument({
      enTete: document.enTete,
      instantane: document.instantane,
    }),
  );

  await fs.mkdir(path.dirname(cheminAbsolu), { recursive: true });

  const temporaire = `${cheminAbsolu}.${randomUUID()}.partiel`;

  try {
    await fs.writeFile(temporaire, octets);
    await fs.rename(temporaire, cheminAbsolu);
  } catch (erreur) {
    /*
     * LE TEMPORAIRE EST RETIRE, SANS MASQUER L'ERREUR D'ORIGINE. Un `unlink`
     * qui leve a son tour, dossier disparu par exemple, remplacerait la vraie
     * cause par une secondaire, et le diagnostic accuserait le nettoyage.
     */
    await fs.rm(temporaire, { force: true }).catch(() => undefined);
    throw erreur;
  }

  return { cheminRelatif, octets: octets.length };
}

/**
 * Chemin absolu d'un document deja rendu, pour le servir.
 *
 * LE CHEMIN RELATIF VIENT DE LA BASE, et il est revalide ici plutot que
 * concatene de confiance : `cheminPdf` est une colonne texte libre, et rien au
 * niveau du schema n'empeche d'y ecrire `../../etc/passwd`. La garde vaut pour
 * le jour ou un autre chemin d'ecriture apparaitra.
 */
export function cheminAbsoluDocument(cheminRelatif: string): string {
  const racine = path.resolve(/* turbopackIgnore: true */ racineDocuments());
  const absolu = path.resolve(racine, cheminRelatif);

  /*
   * LA COMPARAISON PORTE SUR L'APPARTENANCE A LA RACINE, et une premiere
   * version de cette garde ne gardait RIEN : elle confrontait
   * `path.resolve(racine, rel)` a `path.join(racine, rel)`, or les deux
   * normalisent le `..` de la meme facon. Mesure du 1er septembre 2026, les
   * deux rendent `/var/lib/ls/secrets.pdf` pour `../secrets.pdf` : la garde
   * etait donc toujours satisfaite, y compris sur l'evasion qu'elle pretendait
   * refuser.
   *
   * LE SEPARATEUR EST OBLIGATOIRE dans le prefixe teste : sans lui, une racine
   * voisine nommee `documents-prives` passerait pour un descendant de
   * `documents`.
   */
  if (
    cheminRelatif === "" ||
    path.isAbsolute(cheminRelatif) ||
    !absolu.startsWith(racine + path.sep)
  ) {
    throw new NumeroDocumentInvalideError(cheminRelatif);
  }

  return absolu;
}
