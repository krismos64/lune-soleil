/**
 * Variantes d'un produit, LS-101. ADR-029.
 *
 * CE QUE CE SERVICE PORTE : les regles C2, C4, C5, C13 et C14, la validation Zod
 * des entrees (invariants 1 et 7) et la traduction des refus. Il ne lit ni
 * cookie ni `FormData`, qui restent dans l'adaptateur d'entree, et ne verifie
 * aucune autorisation : elle est faite par la Server Action ET par la page, a
 * partir de la session, invariant 2.
 *
 * AUCUNE FONCTION DE SUPPRESSION, C13. Une variante s'archive, elle ne se
 * supprime jamais : la supprimer libererait sa reference, et les avis comme les
 * statistiques de l'ancienne piece remonteraient sur celle qui la reprendrait.
 *
 * CE SERVICE NE TOUCHE JAMAIS UNE LIGNE DE COMMANDE, invariant 3. Ni l'archivage
 * ni un changement de prix ne « mettent a jour » les commandes passees pour
 * rester coherents avec le catalogue : elles portent leurs propres copies
 * figees, et c'est ce qui rend une facture opposable.
 *
 * Codes Prisma verifies via Context7 sur la documentation Prisma 7 : `P2002`
 * unicite, `P2003` cle etrangere, `P2025` enregistrement introuvable.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import * as depotCatalogue from "@/repositories/catalogue";
import * as depot from "@/repositories/variante";
import {
  schemaArchivageVariante,
  schemaCreationVariante,
  schemaModificationVariante,
} from "@/services/variante-validation";

export type Variante = depot.Variante;

/**
 * C2, la reference est deja portee par une variante.
 *
 * PORTE LE NOM DU PRODUIT, et c'est ce qui la distingue d'un refus generique :
 * le parcours 3 exige « un message indiquant que la reference existe deja, avec
 * le produit concerne ». Sans lui, l'exploitante chercherait a la main dans tout
 * le catalogue quelle piece la porte, y compris parmi les variantes archivees
 * qui l'occupent toujours, C14.
 */
export class ReferenceDejaPriseError extends Error {
  constructor(
    readonly reference: string,
    readonly nomProduit: string,
  ) {
    super(`La reference ${reference} est deja portee par ${nomProduit}.`);
    this.name = "ReferenceDejaPriseError";
  }
}

/** Le produit designe n'existe pas, ou n'existe plus. */
export class ProduitIntrouvableError extends Error {
  constructor() {
    super("Produit introuvable.");
    this.name = "ProduitIntrouvableError";
  }
}

/** La variante designee n'existe pas, ou n'existe plus. */
export class VarianteIntrouvableError extends Error {
  constructor() {
    super("Variante introuvable.");
    this.name = "VarianteIntrouvableError";
  }
}

/**
 * La variante est deja archivee, C13.
 *
 * LE REFUS PROTEGE LA DATE. Un second archivage qui ecraserait `archiveeA`
 * ferait perdre le moment reel de sortie du catalogue, seule trace de l'instant
 * ou la piece a cesse d'etre vendable en ligne. Il sert aussi a refuser une
 * modification : editer le prix d'une piece sortie du catalogue n'aurait aucun
 * effet visible et laisserait croire a une remise en vente.
 */
export class VarianteDejaArchiveeError extends Error {
  constructor() {
    super("Cette variante est deja archivee.");
    this.name = "VarianteDejaArchiveeError";
  }
}

/**
 * Une reservation active tient la piece, l'archivage est refuse.
 *
 * `database.md` l'exige, meme regle que pour la vente externe. LE SCENARIO QUE
 * CELA FERME : un client paie, sa reservation tient la piece, et l'exploitante
 * archive la variante. La commande se confirme alors sur une piece sortie du
 * catalogue, et la conversion de la reservation en vente porte sur une variante
 * que plus rien ne vend.
 *
 * LE REFUS N'EST PAS DEFINITIF : il impose un controle humain. L'exploitante
 * attend l'expiration, ou annule explicitement la reservation.
 *
 * PORTE LE NOMBRE, pour que l'ecran dise ce qui bloque plutot que « archivage
 * impossible ».
 */
export class ReservationActiveError extends Error {
  constructor(readonly nombreReservations: number) {
    super(
      `Cette variante porte ${nombreReservations} reservation(s) active(s).`,
    );
    this.name = "ReservationActiveError";
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
 * Construit le refus d'unicite en nommant le produit porteur.
 *
 * LA LECTURE A LIEU APRES L'ECHEC, jamais avant. Verifier l'existence de la
 * reference puis ecrire laisserait une fenetre entre les deux : c'est la
 * contrainte qui decide, et cette lecture ne sert qu'a rediger le message.
 */
async function refusDeReference(
  reference: string,
): Promise<ReferenceDejaPriseError> {
  const nomProduit = await depot.produitPortantLaReference(prisma, reference);
  // LE REPLI COUVRE LA COURSE INVERSE : entre l'echec et cette lecture, la
  // variante porteuse a pu etre lue par un autre chemin. Le message reste utile
  // plutot que de laisser une exception secondaire masquer le vrai refus.
  return new ReferenceDejaPriseError(
    reference,
    nomProduit ?? "une autre pièce",
  );
}

/** Variantes d'un produit, archivees comprises, dans l'ordre de creation. */
export async function listerVariantes(produitId: string): Promise<Variante[]> {
  return depot.listerVariantes(prisma, produitId);
}

/** Nombre de lignes de commande citant cette variante, ADR-029. */
export async function compterLignesDeCommande(
  varianteId: string,
): Promise<number> {
  return depot.compterLignesDeCommande(prisma, varianteId);
}

/**
 * Cree une variante, avec son prix converti en centimes entiers.
 *
 * L'EXISTENCE DU PRODUIT VIENT DE LA CLE ETRANGERE, pas d'une lecture prealable.
 * Entre une verification et l'ecriture, le produit peut disparaitre : la
 * contrainte est le seul point ou la question a une reponse certaine.
 *
 * AUCUNE TRANSACTION. Cette operation ecrit une seule ligne, et rien ne doit
 * etre coherent avec elle au meme instant : `quantiteReservee` part a zero par
 * defaut, et aucun rang n'est a permuter comme pour les sections de LS-100.
 */
export async function creerVariante(entree: unknown): Promise<Variante> {
  const donnees = valider(schemaCreationVariante, entree);

  try {
    return await depot.creerVariante(prisma, donnees);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2002")) {
      throw await refusDeReference(donnees.reference);
    }
    if (estErreurPrisma(erreur, "P2003")) {
      throw new ProduitIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Modifie une variante active.
 *
 * LA REFERENCE EST MODIFIABLE, ADR-029, 14 aout 2026. La copie figee de
 * `LigneCommande.referenceFigee` NE SUIT PAS, invariant 3 : c'est la
 * consequence que l'ecran avertit, en disant combien de commandes portent la
 * reference actuelle. Le service n'empeche rien, il rend le compte.
 *
 * UNE VARIANTE ARCHIVEE NE SE MODIFIE PAS. La lecture prealable sert a ce refus
 * et non a verifier l'unicite, qui reste l'affaire de la contrainte.
 */
export async function modifierVariante(entree: unknown): Promise<Variante> {
  const { id, ...donnees } = valider(schemaModificationVariante, entree);

  const existante = await depot.lireVariante(prisma, id);
  if (!existante) {
    throw new VarianteIntrouvableError();
  }
  if (existante.archiveeA !== null) {
    throw new VarianteDejaArchiveeError();
  }

  try {
    return await depot.ecrireVariante(prisma, id, donnees);
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2002")) {
      throw await refusDeReference(donnees.reference);
    }
    if (estErreurPrisma(erreur, "P2025")) {
      throw new VarianteIntrouvableError();
    }
    throw erreur;
  }
}

/**
 * Archive une variante, C13. ELLE N'EST JAMAIS SUPPRIMEE.
 *
 * TROIS PROPRIETES QUE CETTE FONCTION GARANTIT, et qu'un test verifie chacune :
 *
 * 1. la ligne survit, ce qui garde `varianteId` resolvable pour les avis et les
 *    statistiques, et occupe definitivement la reference, C14
 * 2. `quantitePhysique` est INCHANGEE. La piece existe toujours et reste
 *    vendable en main propre : la remettre a zero serait un mouvement de stock
 *    deguise, contre l'invariant 6
 * 3. AUCUN `MouvementStock` n'est ecrit. Archiver n'est pas une vente
 *
 * La suspension de la vente web, `venteWebActivee`, est un geste DISTINCT et
 * reversible, sujet de LS-106. Archivee l'emporte toujours : une variante
 * archivee n'est ni reservable ni achetable en ligne, quelle que soit la valeur
 * de ce drapeau.
 */
export async function archiverVariante(entree: unknown): Promise<void> {
  const { id } = valider(schemaArchivageVariante, entree);

  const existante = await depot.lireVariante(prisma, id);
  if (!existante) {
    throw new VarianteIntrouvableError();
  }
  if (existante.archiveeA !== null) {
    throw new VarianteDejaArchiveeError();
  }

  /*
   * L'ARCHIVAGE EST REFUSE TANT QU'UNE RESERVATION ACTIVE EXISTE,
   * `database.md`, meme regle que pour la vente externe.
   *
   * CETTE LECTURE N'EST PAS UNE GARANTIE ATOMIQUE, et il ne faut pas la lire
   * comme telle : une reservation peut naitre entre le comptage et l'ecriture.
   * La fenetre est etroite et la consequence benigne, l'archivage ne detruisant
   * rien et se corrigeant par la creation d'une nouvelle variante. Aucune
   * contrainte de base ne peut l'exprimer, `archivee_a` et `reservation` vivant
   * dans deux tables.
   */
  const reservations = await depot.compterReservationsActives(prisma, id);
  if (reservations > 0) {
    throw new ReservationActiveError(reservations);
  }

  /*
   * C19, ARCHIVER LA DERNIERE VARIANTE VIVANTE ARCHIVE LE PRODUIT.
   *
   * POURQUOI CETTE REGLE EXISTE. C1 exige qu'un produit publie ait au moins une
   * variante non archivee, et c'est un controle APPLICATIF : aucune contrainte
   * de base ne peut le porter, il compte des lignes d'une autre table. C1 seule
   * ne garde donc que le chemin de la PUBLICATION. Sans C19, archiver une a une
   * les variantes d'un produit deja publie laisse ce produit `ACTIF` avec rien
   * de vendable : le catalogue affiche une fiche sans prix ni stock, et le
   * bouton d'achat porte sur une variante qui n'existe plus.
   *
   * `MODELE-CONCEPTUEL.md` le dit ainsi : C1 et C19 « ferment ensemble » ce cas.
   * Le trou etait ouvert depuis LS-101, qui a livre l'archivage de variante sans
   * son pendant. Arbitrage de Christophe du 15 aout 2026 pour le traiter ici.
   *
   * LA TRANSACTION EST NON NEGOCIABLE. Les deux ecritures decrivent un seul
   * fait metier : sans elle, une panne entre les deux laisse exactement l'etat
   * que la regle interdit, et rien ne le rattrape ensuite.
   *
   * SEUL UN PRODUIT `ACTIF` EST ARCHIVE. Un brouillon dont on archive la
   * derniere variante reste un brouillon : il n'est pas dans le catalogue, donc
   * il n'y a rien a en retirer, et le passer en `ARCHIVE` forcerait l'exploitante
   * a le desarchiver pour reprendre un travail en cours.
   */
  try {
    await prisma.$transaction(async (tx) => {
      await depot.archiverVariante(tx, id, new Date());

      const restantes = await depotCatalogue.compterVariantesVivantes(
        tx,
        existante.produitId,
      );
      if (restantes > 0) {
        return;
      }

      const produit = await depotCatalogue.lireEtatPublication(
        tx,
        existante.produitId,
      );
      if (produit?.statut !== "ACTIF") {
        return;
      }

      await depotCatalogue.ecrireStatutProduit(tx, existante.produitId, {
        statut: "ARCHIVE",
        archiveA: new Date(),
      });
    });
  } catch (erreur) {
    if (estErreurPrisma(erreur, "P2025")) {
      throw new VarianteIntrouvableError();
    }
    throw erreur;
  }
}
