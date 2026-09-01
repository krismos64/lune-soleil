/**
 * Ecritures et lectures de l'avoir, LS-128, etapes 4 a 6 du parcours 4.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client transactionnel, et c'est lui qui juge si un avoir doit
 * naitre.
 *
 * IL N'Y A AUCUNE SUPPRESSION NI AUCUNE MODIFICATION D'AVOIR DANS CE FICHIER.
 * L'invariant 4 vaut pour lui comme pour la facture : un avoir est un document
 * legal, jamais modifie ni supprime. Une erreur sur un avoir ne se corrige pas
 * en le reecrivant.
 *
 * LA SEULE ECRITURE SUR `Facture` EST `montantAvoirCentimes`, regle F9, et elle
 * ne contredit pas l'immuabilite : ce champ ne fait PAS partie de l'instantane
 * legal, il porte le cumul rembourse. `chk_facture_avoir_borne` le borne au
 * total, et ce `CHECK` est la derniere ligne de defense si le service se
 * trompe.
 */
import type { Prisma } from "@/generated/prisma/client";
import { schemaInstantaneLegal, type InstantaneLegal } from "@/lib/validation";
import type { ClientBase } from "@/repositories/stock";

/** Ce qu'un avoir expose une fois ecrit, sans son instantane. */
export type AvoirEmis = {
  id: string;
  numero: string;
  montantCentimes: number;
};

/** Ce qu'il faut savoir de la facture pour decider d'un avoir. */
export type FacturePourAvoir = {
  id: string;
  numero: string;
  montantTotalCentimes: number;
  montantAvoirCentimes: number;
  instantaneLegal: InstantaneLegal;
};

/**
 * Relit la facture d'une commande pour y adosser un avoir.
 *
 * ELLE REND L'INSTANTANE, et c'est ce qui rend l'avoir possible sans toucher au
 * catalogue, invariant 3. L'avoir porte SON PROPRE instantane, derive de celui
 * de la facture : recomposer depuis les produits actuels ferait dependre un
 * document emis d'un prix qui a change depuis.
 *
 * ELLE REND AUSSI `montantAvoirCentimes`, le cumul deja rembourse. Le service
 * en a besoin pour borner le montant demande : sans lui, la seule garde serait
 * le `CHECK`, dont le refus est une exception a traduire plutot qu'une
 * decision.
 */
export async function lireFacturePourAvoir(
  client: ClientBase,
  commandeId: string,
): Promise<FacturePourAvoir | null> {
  const facture = await client.facture.findUnique({
    where: { commandeId },
    select: {
      id: true,
      numero: true,
      montantTotalCentimes: true,
      montantAvoirCentimes: true,
      instantaneLegal: true,
    },
  });

  if (facture === null) {
    return null;
  }

  return {
    id: facture.id,
    numero: facture.numero,
    montantTotalCentimes: facture.montantTotalCentimes,
    montantAvoirCentimes: facture.montantAvoirCentimes,
    /*
     * L'INSTANTANE EST REVALIDE A LA RELECTURE, meme motif que
     * `lireFactureARendre` : la colonne est un `Json` libre, et une version
     * plus ancienne y mettrait une forme que l'avoir ne saurait pas deriver.
     * Echouer ici est plus clair qu'ecrire un avoir a moitie forme.
     */
    instantaneLegal: schemaInstantaneLegal.parse(facture.instantaneLegal),
  };
}

/**
 * Ecrit l'avoir et met a jour le cumul de la facture, LS-128.
 *
 * LES DEUX ECRITURES SONT INDISSOCIABLES et vivent donc dans la meme fonction :
 * un avoir sans cumul mis a jour laisserait rembourser deux fois le total, un
 * cumul sans avoir ferait disparaitre le document. C'est l'appelant qui fournit
 * la transaction, mais aucun chemin ne doit pouvoir n'appeler que la moitie.
 *
 * L'INCREMENT EST RELATIF, `increment`, et non une valeur calculee en memoire.
 * Lire le cumul puis ecrire `lu + montant` perdrait un remboursement concurrent
 * ecrit entre les deux : `increment` laisse PostgreSQL faire l'addition sur la
 * ligne verrouillee.
 *
 * LE `CHECK` RESTE LA SECONDE LIGNE DE DEFENSE. Le service borne le montant
 * avant d'arriver ici, mais deux remboursements concurrents peuvent franchir
 * cette garde applicative : `chk_facture_avoir_borne` fait alors echouer la
 * transaction, ce qui est le bon comportement, l'argent n'ayant pas encore ete
 * rendu deux fois.
 */
export async function ecrireAvoir(
  client: ClientBase,
  parametres: {
    factureId: string;
    numero: string;
    montantCentimes: number;
    motif: string;
    instantaneLegal: InstantaneLegal;
  },
): Promise<AvoirEmis> {
  const avoir = await client.avoir.create({
    data: {
      factureId: parametres.factureId,
      numero: parametres.numero,
      montantCentimes: parametres.montantCentimes,
      motif: parametres.motif,
      /*
       * LE CAST EST CELUI DE PRISMA POUR UNE COLONNE `Json`, et il ne masque
       * aucune incertitude : la valeur a ete validee par le service AVANT
       * d'arriver ici.
       */
      instantaneLegal:
        parametres.instantaneLegal as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, numero: true, montantCentimes: true },
  });

  await client.facture.update({
    where: { id: parametres.factureId },
    data: {
      montantAvoirCentimes: { increment: parametres.montantCentimes },
    },
    select: { montantAvoirCentimes: true },
  });

  return avoir;
}

/** Ce qu'il faut pour rendre le PDF d'un avoir, et rien de plus. */
export type AvoirARendre = {
  id: string;
  numero: string;
  emisA: Date;
  instantaneLegal: InstantaneLegal;
  /** Nul tant qu'aucun rendu n'a abouti, regle F8, comme la facture. */
  cheminPdf: string | null;
};

/**
 * Relit un avoir pour son rendu, meme contrat que `lireFactureARendre`.
 *
 * ELLE REND L'INSTANTANE ET NON LA FACTURE, invariant 3 : le gabarit ne doit
 * avoir aucun moyen de remonter au catalogue ni meme au document d'origine.
 */
export async function lireAvoirARendre(
  client: ClientBase,
  avoirId: string,
): Promise<AvoirARendre | null> {
  const avoir = await client.avoir.findUnique({
    where: { id: avoirId },
    select: {
      id: true,
      numero: true,
      emisA: true,
      instantaneLegal: true,
      cheminPdf: true,
    },
  });

  if (avoir === null) {
    return null;
  }

  return {
    id: avoir.id,
    numero: avoir.numero,
    emisA: avoir.emisA,
    cheminPdf: avoir.cheminPdf,
    instantaneLegal: schemaInstantaneLegal.parse(avoir.instantaneLegal),
  };
}

/**
 * Pose le chemin du PDF rendu, meme motif que `poserCheminPdfFacture`.
 *
 * `cheminPdf` NE FAIT PAS PARTIE DE L'INSTANTANE LEGAL : le document reste
 * immuable, seule sa representation sur disque est renseignee. La clause
 * `select` ne porte que ce champ, aucun autre n'etant modifiable ici.
 */
export async function poserCheminPdfAvoir(
  client: ClientBase,
  avoirId: string,
  cheminRelatif: string,
): Promise<void> {
  await client.avoir.update({
    where: { id: avoirId },
    data: { cheminPdf: cheminRelatif },
    select: { cheminPdf: true },
  });
}

/** Les avoirs d'une facture, du plus ancien au plus recent. */
export async function listerAvoirsDeFacture(
  client: ClientBase,
  factureId: string,
): Promise<AvoirEmis[]> {
  return client.avoir.findMany({
    where: { factureId },
    orderBy: { emisA: "asc" },
    select: { id: true, numero: true, montantCentimes: true },
  });
}

/**
 * Reserve une intention de remboursement, LS-128, AVANT tout appel au
 * prestataire.
 *
 * ELLE REND `false` SI L'INTENTION EXISTE DEJA, et c'est tout le mecanisme.
 * L'unicite `(facture_id, cle_idempotence)` fait que deux demandes identiques
 * concurrentes ne peuvent pas reserver toutes les deux : la seconde apprend
 * qu'un appel est deja parti pour cette intention, et n'appelle jamais le
 * prestataire.
 *
 * SANS ELLE, LES DEUX PARTAIENT. La cle etant derivee d'un cumul LU hors
 * transaction, deux executions concurrentes lisaient la meme valeur et
 * derivaient la meme cle. L'idempotence de Stripe n'est pas un verrou : deux
 * requetes portant la meme cle qui arrivent EN PARALLELE ne rendent pas la meme
 * reponse, la seconde recoit `idempotency_key_in_use`. Classee en refus, elle
 * poussait a relancer, et la relance partait avec un cumul different donc une
 * cle differente : un second remboursement REEL. Mesure par la revue critique
 * le 1er septembre 2026, 4000 centimes rendus pour 2000 voulus.
 *
 * ELLE OUVRE SA PROPRE TRANSACTION, COURTE, et le commit precede l'appel
 * reseau. Tenir la transaction pendant l'appel garderait un verrou de ligne sur
 * toute la duree de l'aller-retour, ce que `database.md` interdit.
 *
 * `P2002` EST UN CAS METIER ICI, PAS UNE PANNE : il signifie « quelqu'un a deja
 * lance exactement ce remboursement ». Il est rattrape et traduit en valeur,
 * jamais propage.
 */
export async function reserverIntentionRemboursement(
  client: ClientBase,
  parametres: {
    factureId: string;
    cleIdempotence: string;
    montantCentimes: number;
  },
): Promise<{ reservee: boolean; intentionId: string | null }> {
  try {
    const intention = await client.intentionRemboursement.create({
      data: {
        factureId: parametres.factureId,
        cleIdempotence: parametres.cleIdempotence,
        montantCentimes: parametres.montantCentimes,
      },
      select: { id: true },
    });

    return { reservee: true, intentionId: intention.id };
  } catch (erreur) {
    /*
     * LE CODE EST TESTE SUR LA FORME PRISMA, `P2002`. Le nom de la contrainte
     * n'est pas confronte : une seule unicite existe sur cette table, et
     * exiger le nom rendrait le rattrapage muet si la contrainte etait
     * renommee, ce qui rouvrirait le double remboursement en silence.
     */
    if (
      typeof erreur === "object" &&
      erreur !== null &&
      "code" in erreur &&
      (erreur as { code: unknown }).code === "P2002"
    ) {
      return { reservee: false, intentionId: null };
    }

    throw erreur;
  }
}

/**
 * Marque une intention aboutie, le prestataire ayant rendu l'argent.
 *
 * ELLE N'EST PAS DANS LA MEME TRANSACTION QUE L'APPEL, qui n'en a pas. Une
 * intention qui reste sans `aboutieA` est un appel dont personne ne sait s'il
 * est parti : cet etat sort par une alerte et jamais par un rejeu muet, meme
 * regle que `ENVOI_EN_COURS` de l'outbox.
 */
export async function marquerIntentionAboutie(
  client: ClientBase,
  intentionId: string,
  maintenant: Date = new Date(),
): Promise<void> {
  await client.intentionRemboursement.update({
    where: { id: intentionId },
    data: { aboutieA: maintenant },
    select: { id: true },
  });
}

/**
 * Libere une intention dont l'appel n'a PAS abouti, LS-128.
 *
 * ELLE N'EXISTE QUE POUR LE REFUS ET L'INDISPONIBILITE, deux cas ou le
 * prestataire a repondu sans rien rendre, ou n'a pas repondu du tout. Sans
 * elle, l'intention resterait reservee et toute nouvelle tentative sortirait en
 * « deja demande » : une panne reseau rendrait le remboursement DEFINITIVEMENT
 * impossible, ce qu'un test de reessai a montre.
 *
 * ELLE EXIGE `aboutieA: null`, ET C'EST LA GARDE QUI COMPTE. Une intention
 * aboutie ne se libere JAMAIS : l'argent est parti, et rouvrir la cle
 * autoriserait un second appel identique, c'est-a-dire le double remboursement
 * que cette table existe pour fermer. `deleteMany` rend alors zero ligne
 * touchee plutot que de lever, et l'appelant n'a rien a rattraper.
 *
 * LA SUPPRESSION EST LEGITIME ICI, contrairement aux documents comptables : une
 * intention non aboutie ne prouve rien et n'est opposable a personne. Ce qui
 * doit survivre est l'argent sorti, porte par l'avoir et par `aboutieA`.
 */
export async function libererIntentionNonAboutie(
  client: ClientBase,
  intentionId: string,
): Promise<void> {
  await client.intentionRemboursement.deleteMany({
    where: { id: intentionId, aboutieA: null },
  });
}
