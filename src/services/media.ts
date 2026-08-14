/**
 * Medias d'un produit, LS-102. ADR-007.
 *
 * CE SERVICE PORTE UNE EXIGENCE DE SECURITE, pas une fonction de confort. Une
 * photographie non traitee porte la position GPS du domicile de l'exploitante :
 * `PARCOURS.md` interdit qu'une image soit servie sans traitement, et c'est un
 * blocage, pas un avertissement.
 *
 * LA REGLE C8 EST TENUE PHYSIQUEMENT, pas par un filtre. Un media non traite
 * n'a aucun fichier sous `public/`, donc Nginx ne peut pas le servir quelle que
 * soit la requete que fait l'application. ADR-007 a ecarte le filtre applicatif
 * parce que ce projet a deja oublie trois fois un champ d'etat dans une
 * condition d'acces.
 *
 * LE TRAITEMENT EST HORS TRANSACTION, et il le faut : l'encodage d'une
 * photographie lourde prend environ deux secondes, mesure a ADR-007. Le tenir
 * dans une transaction garderait un verrou pendant tout ce temps.
 */
import { Prisma } from "@/generated/prisma/client";
import { StatutTraitementMedia } from "@/generated/prisma/enums";
import { journaliser } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import {
  FichierNonImageError,
  FormatRefuseError,
  traiterPhotographie,
} from "@/integrations/medias/traitement";
import { StockageMedias } from "@/integrations/medias/stockage";
import * as depot from "@/repositories/media";
import {
  TAILLE_MAX_OCTETS,
  schemaReordonnancementMedias,
  schemaSuppressionMedia,
  schemaTexteAlternatifMedia,
} from "@/services/media-validation";

export type Media = depot.Media;
export { FichierNonImageError, FormatRefuseError };

/** Le media designe n'existe pas, ou n'appartient pas au produit vise. */
export class MediaIntrouvableError extends Error {
  constructor() {
    super("Media introuvable.");
    this.name = "MediaIntrouvableError";
  }
}

/** Le produit designe n'existe pas, ou n'existe plus. */
export class ProduitIntrouvableError extends Error {
  constructor() {
    super("Produit introuvable.");
    this.name = "ProduitIntrouvableError";
  }
}

/** Le fichier depasse la taille acceptee. */
export class FichierTropVolumineuxError extends Error {
  constructor(readonly tailleOctets: number) {
    super(`Le fichier depasse ${TAILLE_MAX_OCTETS} octets.`);
    this.name = "FichierTropVolumineuxError";
  }
}

/** L'ordre transmis ne couvre pas exactement les medias du produit. */
export class OrdreMediasIncompletError extends Error {
  constructor(
    readonly attendus: number,
    readonly recus: number,
  ) {
    super(`Ordre incomplet : ${recus} medias transmis sur ${attendus}.`);
    this.name = "OrdreMediasIncompletError";
  }
}

/** Vrai si l'erreur est une violation de contrainte Prisma du code donne. */
function estErreurPrisma(erreur: unknown, code: string): boolean {
  return (
    erreur instanceof Prisma.PrismaClientKnownRequestError &&
    erreur.code === code
  );
}

/**
 * Racine du volume des medias, ADR-007.
 *
 * LUE A L'APPEL ET NON AU CHARGEMENT DU MODULE : les tests d'integration
 * pointent sur un dossier temporaire, et une constante figee a l'import les
 * ferait tous ecrire au meme endroit.
 */
function stockage(): StockageMedias {
  return new StockageMedias(
    process.env.MEDIA_RACINE ?? "/var/lib/lune-soleil/medias",
  );
}

/** Medias d'un produit, dans l'ordre, ceux en echec compris. */
export async function listerMedias(produitId: string): Promise<Media[]> {
  return depot.listerMedias(prisma, produitId);
}

/**
 * Televerse une photographie, la traite et la publie.
 *
 * L'ORDRE DES ETAPES PORTE TOUTE LA SECURITE DE CETTE STORY :
 *
 * 1. depot en QUARANTAINE, jamais sous `public/`
 * 2. ligne en base au statut `EN_ATTENTE`, ce qui rend le media visible dans
 *    l'administration meme si la suite echoue
 * 3. traitement, hors transaction
 * 4. publication, c'est-a-dire ecriture des declinaisons sous `public/` et
 *    suppression de l'original
 * 5. statut `TRAITE` seulement une fois les fichiers en place
 *
 * SI UNE ETAPE ECHOUE, LE STATUT PASSE A `ECHOUE` ET RIEN N'EST PUBLIE. Le
 * media reste visible pour que l'exploitante comprenne, et la publication du
 * produit sera refusee par LS-103.
 *
 * L'ECHEC N'EST PAS SILENCIEUX MAIS IL N'EST PAS FATAL NON PLUS : la fonction
 * rend le media en echec plutot que de lever, l'ecran ayant besoin de l'afficher
 * pour proposer une reprise.
 */
export async function televerserPhotographie(
  produitId: string,
  octets: Buffer,
): Promise<Media> {
  if (octets.length > TAILLE_MAX_OCTETS) {
    throw new FichierTropVolumineuxError(octets.length);
  }

  const magasin = stockage();
  await magasin.preparer();

  const identifiant = await magasin.deposerEnQuarantaine(octets);

  let media: Media;
  try {
    media = await depot.creerMedia(prisma, {
      produitId,
      // LE CHEMIN PORTE L'IDENTIFIANT DE QUARANTAINE tant que rien n'est publie.
      // Il ne designe donc AUCUN fichier servable, ce qui est exactement l'etat
      // que `EN_ATTENTE` decrit.
      chemin: identifiant,
      ordre: (await depot.rangMaximal(prisma, produitId)) + 1,
      statutTraitement: StatutTraitementMedia.EN_ATTENTE,
    });
  } catch (erreur) {
    // L'EXISTENCE DU PRODUIT VIENT DE LA CLE ETRANGERE. La ligne n'ayant pas
    // ete creee, le fichier de quarantaine devient orphelin : la purge s'en
    // charge, et le laisser est moins grave que de supprimer un fichier qu'une
    // autre ligne pourrait referencer.
    if (estErreurPrisma(erreur, "P2003")) {
      throw new ProduitIntrouvableError();
    }
    throw erreur;
  }

  try {
    const resultat = await traiterPhotographie(octets);
    const chemin = await magasin.publier(
      identifiant,
      resultat.declinaisons.map((declinaison) => ({
        nom: declinaison.nom,
        contenu: declinaison.contenu,
      })),
    );

    await depot.ecrireStatut(
      prisma,
      media.id,
      StatutTraitementMedia.TRAITE,
      chemin,
    );

    return { ...media, chemin, statutTraitement: StatutTraitementMedia.TRAITE };
  } catch (erreur) {
    // AUCUNE DONNEE DU FICHIER DANS LE JOURNAL, invariant 9 : ce depot est
    // public. Le type de l'erreur et l'identifiant du media suffisent.
    journaliser("error", "Traitement de photographie en echec", {
      mediaId: media.id,
      erreur: erreur instanceof Error ? erreur.name : typeof erreur,
    });

    await depot.ecrireStatut(prisma, media.id, StatutTraitementMedia.ECHOUE);

    // LE REFUS DE FORMAT REMONTE, lui : c'est une erreur de saisie que l'ecran
    // doit nommer, pas une panne. Le media en echec reste en base pour que
    // l'exploitante le voie et le supprime.
    if (
      erreur instanceof FormatRefuseError ||
      erreur instanceof FichierNonImageError
    ) {
      throw erreur;
    }

    return { ...media, statutTraitement: StatutTraitementMedia.ECHOUE };
  }
}

/** Ecrit le texte alternatif d'un media, C7. */
export async function ecrireTexteAlternatif(entree: unknown): Promise<void> {
  const { id, texteAlternatif } = valider(schemaTexteAlternatifMedia, entree);

  try {
    await depot.ecrireTexteAlternatif(prisma, id, texteAlternatif);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new MediaIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Supprime un media, ses fichiers compris.
 *
 * LES FICHIERS PARTENT APRES LA LIGNE, et cet ordre est delibere : une ligne
 * supprimee dont les fichiers restent laisse des orphelins que la purge
 * ramassera, alors que des fichiers supprimes sous une ligne encore vivante
 * donneraient une fiche produit dont l'image est cassee.
 */
export async function supprimerMedia(entree: unknown): Promise<void> {
  const { id } = valider(schemaSuppressionMedia, entree);

  const media = await depot.lireMedia(prisma, id);
  if (!media) {
    throw new MediaIntrouvableError();
  }

  await depot.supprimerMedia(prisma, id);

  const magasin = stockage();
  if (media.statutTraitement === StatutTraitementMedia.TRAITE) {
    await magasin.supprimerPublies(media.chemin);
  }
}

/**
 * Reecrit l'ordre complet des medias d'un produit. C9.
 *
 * LE PIEGE EST ICI, ET IL DIFFERE DE CELUI DES SECTIONS.
 * `media_principal_unique` est un INDEX partiel filtre sur `ordre = 1`, pas une
 * contrainte : il n'est donc PAS differable, et il est verifie LIGNE A LIGNE.
 *
 * Mesure sur PostgreSQL 18.4, le meme echange reussit dans un sens et echoue
 * dans l'autre :
 *
 *   VERT   liberer le rang 1 puis le prendre
 *   ROUGE  prendre le rang 1 avant de l'avoir libere
 *          duplicate key value violates unique constraint
 *          "media_principal_unique"
 *
 * LA TRANSACTION NE SAUVE PAS. C'est plus dangereux qu'un echec systematique :
 * un reordonnancement ecrit sans y penser marche selon l'ordre de parcours des
 * lignes, donc peut passer en developpement et casser en production.
 *
 * LA PARADE EST D'ECRIRE LE RANG 1 EN DERNIER. La boucle ci-dessous trie donc
 * ses ecritures pour que la ligne qui QUITTE le rang 1 soit mise a jour avant
 * celle qui le PREND. Ne pas la « simplifier » en un parcours naif de la liste.
 */
export async function reordonnerMedias(entree: unknown): Promise<void> {
  const { produitId, ids } = valider(schemaReordonnancementMedias, entree);

  await prisma.$transaction(async (tx) => {
    const existants = await depot.listerMedias(tx, produitId);

    if (existants.length !== ids.length) {
      // UN `throw` ET NON UN `return`. Dans `$transaction`, seule une exception
      // annule : un refus par retour validerait les ecritures deja faites.
      throw new OrdreMediasIncompletError(existants.length, ids.length);
    }

    const connus = new Set(existants.map((m) => m.id));
    for (const id of ids) {
      if (!connus.has(id)) {
        throw new MediaIntrouvableError();
      }
    }

    // Le media qui occupe le rang 1 AUJOURD'HUI doit le quitter avant que le
    // nouveau ne le prenne. On le traite donc en premier, et le nouveau rang 1
    // en dernier.
    const ecritures = ids.map((id, index) => ({ id, ordre: index + 1 }));
    const ancienPremier = existants.find((m) => m.ordre === 1)?.id;

    const ordonnees = [
      ...ecritures.filter((e) => e.id === ancienPremier && e.ordre !== 1),
      ...ecritures.filter((e) => e.id !== ancienPremier && e.ordre !== 1),
      ...ecritures.filter((e) => e.ordre === 1),
    ];

    for (const ecriture of ordonnees) {
      await depot.ecrireRang(tx, ecriture.id, ecriture.ordre);
    }
  });
}

/**
 * Purge les fichiers de quarantaine orphelins, parcours 3.
 *
 * APPELEE PAR AUCUNE TACHE AUJOURD'HUI. Le branchement sur la tache planifiee
 * relevera de LS-72, comme la purge des journaux : cette fonction existe pour
 * que le nettoyage soit possible, pas pour qu'il soit automatique.
 */
export async function purgerQuarantaine(
  ageMinimalMs = 60 * 60 * 1000,
): Promise<number> {
  return stockage().purgerQuarantaine(ageMinimalMs);
}
