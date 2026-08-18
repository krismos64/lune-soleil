/**
 * Acces aux donnees des mouvements de stock, LS-106.
 *
 * Ce fichier n'ouvre aucune transaction et ne decide rien : le service appelant
 * lui passe le client, transactionnel quand l'operation l'exige, ce qui est le
 * cas de toute ecriture ici.
 *
 * LE JOURNAL EST UN HISTORIQUE, PAS UN ETAT. Aucune fonction de mise a jour ni
 * de suppression n'existe dans ce fichier, et c'est deliberé : regle S4, une
 * vente externe saisie a tort se corrige par un mouvement COMPENSATEUR qui
 * s'ajoute, jamais en modifiant la ligne d'origine. Ajouter un `update` ici
 * ouvrirait la porte a une correction silencieuse de l'inventaire.
 */
import { Prisma } from "@/generated/prisma/client";
import type {
  OrigineEcriture,
  TypeMouvementStock,
} from "@/generated/prisma/enums";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

/** Une ligne du journal des mouvements, prete a afficher. */
export type Mouvement = {
  id: string;
  varianteId: string;
  varianteLibelle: string;
  varianteReference: string;
  produitNom: string;
  type: TypeMouvementStock;
  quantite: number;
  canal: string | null;
  prixUnitaireFigeCentimes: number | null;
  motif: string | null;
  origine: OrigineEcriture;
  creeA: Date;
};

/**
 * Decremente le stock physique d'une variante, sous conditions, LS-106.
 *
 * L'UPDATE EST CONDITIONNEL, meme strategie que `SQL_RESERVER` d'ADR-006 : la
 * garantie vit dans la clause `WHERE`, pas dans une lecture prealable suivie
 * d'une ecriture. Entre un `SELECT` de controle et un `UPDATE`, une reservation
 * concurrente peut naitre ; ici la base tranche en une instruction.
 *
 * QUATRE CONDITIONS, ET CHACUNE PORTE UN REFUS METIER DISTINCT :
 *
 * - `archivee_a IS NULL` : une variante archivee ne se vend plus, C13
 * - `quantite_physique >= $2` : le stock ne peut pas devenir negatif. Le CHECK
 *   de la base le rattraperait, mais en levant une erreur technique quand ce
 *   refus doit se presenter sans jargon
 * - `quantite_physique - quantite_reservee >= $2` : LE COEUR DE LA GARDE. Une
 *   piece reservee par un client en cours de paiement n'est PAS vendable sur un
 *   marche. C'est la faille que le cahier des charges identifie nommement, et
 *   le parcours 2 la traite en refus explicite plutot qu'en ecrasement
 *
 * `quantite_reservee` N'EST PAS TOUCHEE. Une vente externe consomme du stock
 * PHYSIQUE ; les reservations appartiennent au web et se resolvent seules, par
 * expiration ou par conversion. Les melanger ferait disparaitre la reservation
 * d'un client sans qu'il en soit informe.
 *
 * REND LE NOMBRE DE LIGNES TOUCHEES. Zero signifie un refus metier, jamais une
 * erreur : le service le traduit en message. Toute autre erreur remonte telle
 * quelle.
 */
export async function decrementerStockPhysique(
  client: ClientBase,
  parametres: { varianteId: string; quantite: number },
): Promise<number> {
  return client.$executeRaw`
    UPDATE variante
       SET quantite_physique = quantite_physique - ${parametres.quantite}
     WHERE id = ${parametres.varianteId}
       AND archivee_a IS NULL
       AND quantite_physique >= ${parametres.quantite}
       AND quantite_physique - quantite_reservee >= ${parametres.quantite}
  `;
}

/**
 * Incremente le stock physique, LS-106.
 *
 * SERT AUX ENTREES ET AUX CORRECTIONS. Un mouvement compensateur qui annule une
 * vente externe saisie a tort remet la piece en stock, regle S4 : la ligne
 * d'origine reste, une seconde ligne la corrige.
 *
 * AUCUNE CONDITION DE STOCK ICI, et l'asymetrie avec la decrementation est
 * voulue : ajouter du stock ne peut violer aucun invariant, quand en retirer
 * peut le rendre negatif ou spolier une reservation.
 */
export async function incrementerStockPhysique(
  client: ClientBase,
  parametres: { varianteId: string; quantite: number },
): Promise<number> {
  return client.$executeRaw`
    UPDATE variante
       SET quantite_physique = quantite_physique + ${parametres.quantite}
     WHERE id = ${parametres.varianteId}
       AND archivee_a IS NULL
  `;
}

/**
 * Ecrit une ligne au journal des mouvements, LS-106.
 *
 * `commandeId` N'EST PAS UN PARAMETRE, et c'est deliberé. Cette fonction sert
 * les mouvements d'ADMINISTRATION : vente externe, entree, ajustement, retour
 * saisi a la main. Aucun d'eux ne porte de commande, et la clé d'idempotence
 * `mouvement_vente_web_unique` ne s'applique donc jamais ici. Les mouvements de
 * type `VENTE_WEB` naissent du webhook de paiement, ailleurs, avec leur propre
 * garantie d'unicite.
 *
 * `origine` EST `ADMIN` ET `acteurId` OBLIGATOIRE, regle S9 : une ecriture faite
 * par une personne se distingue d'une ecriture systeme, et l'auteur d'un
 * mouvement de stock doit rester identifiable. Un webhook n'est pas une
 * personne, et ne passe pas par ici.
 */
export async function creerMouvement(
  client: ClientBase,
  parametres: {
    varianteId: string;
    type: TypeMouvementStock;
    quantite: number;
    canal?: string | null;
    prixUnitaireFigeCentimes?: number | null;
    motif?: string | null;
    acteurId: string;
    /**
     * Le mouvement que celui-ci compense, S15 et ADR-030.
     *
     * L'unicite partielle `mouvement_compense_unique` en fait une garantie :
     * une seconde compensation du meme mouvement leve `P2002`, que le service
     * traduit en refus metier. La garde vit dans la base, pas ici.
     */
    compenseId?: string | null;
  },
): Promise<string> {
  const ligne = await client.mouvementStock.create({
    data: {
      varianteId: parametres.varianteId,
      type: parametres.type,
      quantite: parametres.quantite,
      canal: parametres.canal ?? null,
      prixUnitaireFigeCentimes: parametres.prixUnitaireFigeCentimes ?? null,
      motif: parametres.motif ?? null,
      acteurId: parametres.acteurId,
      compenseId: parametres.compenseId ?? null,
      origine: "ADMIN",
    },
    select: { id: true },
  });

  return ligne.id;
}

/**
 * Le journal des mouvements, du plus recent au plus ancien, LS-106.
 *
 * `creeA` PUIS `id` EN SECOND CRITERE. Deux mouvements peuvent partager la
 * milliseconde, un ajustement en lot par exemple : sans second critere leur
 * ordre relatif change d'une lecture a l'autre, et une pagination future
 * sauterait ou repeterait des lignes.
 *
 * LE FILTRE PAR VARIANTE EST OPTIONNEL : le journal complet sert l'ecran
 * general, le journal filtre sert l'historique d'une piece.
 */
export async function listerMouvements(
  client: ClientBase,
  filtre: { varianteId?: string; limite?: number } = {},
): Promise<Mouvement[]> {
  const lignes = await client.mouvementStock.findMany({
    where: filtre.varianteId ? { varianteId: filtre.varianteId } : {},
    orderBy: [{ creeA: "desc" }, { id: "desc" }],
    take: filtre.limite ?? 100,
    select: {
      id: true,
      varianteId: true,
      type: true,
      quantite: true,
      canal: true,
      prixUnitaireFigeCentimes: true,
      motif: true,
      origine: true,
      creeA: true,
      variante: {
        select: {
          libelle: true,
          reference: true,
          produit: { select: { nom: true } },
        },
      },
    },
  });

  return lignes.map((ligne) => ({
    id: ligne.id,
    varianteId: ligne.varianteId,
    varianteLibelle: ligne.variante.libelle,
    varianteReference: ligne.variante.reference,
    produitNom: ligne.variante.produit.nom,
    type: ligne.type,
    quantite: ligne.quantite,
    canal: ligne.canal,
    prixUnitaireFigeCentimes: ligne.prixUnitaireFigeCentimes,
    motif: ligne.motif,
    origine: ligne.origine,
    creeA: ligne.creeA,
  }));
}

/** L'etat de stock d'une variante, tel que l'ecran l'affiche. */
export type EtatStockVariante = {
  varianteId: string;
  reference: string;
  libelle: string;
  produitId: string;
  produitNom: string;
  quantitePhysique: number;
  quantiteReservee: number;
  quantiteDisponible: number;
  venteWebActivee: boolean;
  archivee: boolean;
};

/**
 * L'etat de stock de toutes les variantes vivantes, LS-106.
 *
 * TROIS QUANTITES DISTINCTES, ET C'EST LE CRITERE 1 DE LA STORY. Physique,
 * reserve et disponible ne se deduisent pas l'une de l'autre a l'affichage :
 * les confondre est l'erreur que l'invariant 6 previent. Le disponible est
 * calcule ICI, cote base, et non dans un composant.
 *
 * `greatest(..., 0)` PROTEGE L'AFFICHAGE d'un negatif transitoire. La base
 * interdit deja `quantite_reservee > quantite_physique` par CHECK, mais un
 * ecran qui afficherait « -1 disponible » sur une incoherence serait plus
 * trompeur qu'un zero.
 *
 * LES VARIANTES ARCHIVEES SONT EXCLUES : elles ne se vendent plus, ni en ligne
 * ni sur un marche, et les afficher encombrerait l'ecran d'inventaire de pieces
 * qui n'existent plus commercialement.
 */
export async function listerEtatStock(
  client: ClientBase,
): Promise<EtatStockVariante[]> {
  const lignes = await client.$queryRaw<
    {
      varianteId: string;
      reference: string;
      libelle: string;
      produitId: string;
      produitNom: string;
      quantitePhysique: number;
      quantiteReservee: number;
      quantiteDisponible: bigint | number;
      venteWebActivee: boolean;
      archivee: boolean;
    }[]
  >`
    SELECT
      v.id                 AS "varianteId",
      v.reference,
      v.libelle,
      p.id                 AS "produitId",
      p.nom                AS "produitNom",
      v.quantite_physique  AS "quantitePhysique",
      v.quantite_reservee  AS "quantiteReservee",
      greatest(v.quantite_physique - v.quantite_reservee, 0) AS "quantiteDisponible",
      v.vente_web_activee  AS "venteWebActivee",
      (v.archivee_a IS NOT NULL) AS "archivee"
    FROM variante v
    JOIN produit p ON p.id = v.produit_id
    WHERE v.archivee_a IS NULL
    ORDER BY p.nom ASC, v.libelle ASC
  `;

  /*
   * `greatest` REND DU `bigint`, que le pilote transmet en `BigInt`. Le laisser
   * passer ferait echouer la serialisation vers un composant client, defaut
   * deja rencontre en LS-104 et LS-105.
   */
  return lignes.map((ligne) => ({
    ...ligne,
    quantiteDisponible: Number(ligne.quantiteDisponible),
  }));
}

/**
 * Ecrit une entree au journal d'audit, LS-106.
 *
 * PREMIERE ECRITURE D'AUDIT DU PROJET. Le modele `JournalAudit` existe depuis
 * LS-13, aucune story ne l'avait encore alimente : le parcours 2 l'exige a
 * l'etape 1, « suspension de la vente web, entree au journal d'audit ».
 *
 * POURQUOI L'AUDIT ET NON UN MOUVEMENT DE STOCK. Suspendre la vente web ne fait
 * sortir aucun bijou de l'atelier, invariant 6 : ecrire un mouvement creerait un
 * fantome qui fausserait l'inventaire. La trace appartient donc au journal des
 * ACTIONS, pas a celui des quantites.
 *
 * `detail` EST DU JSON LIBRE, et il porte ici l'etat obtenu. Sans lui, deux
 * entrees « bascule de vente web » consecutives seraient indiscernables, et le
 * journal ne dirait pas si la piece est partie au marche ou en est revenue.
 */
export async function ecrireAudit(
  client: ClientBase,
  parametres: {
    acteurId: string;
    action: string;
    typeCible: string;
    idCible: string;
    detail: Prisma.InputJsonValue;
  },
): Promise<void> {
  await client.journalAudit.create({
    data: {
      acteurId: parametres.acteurId,
      action: parametres.action,
      typeCible: parametres.typeCible,
      idCible: parametres.idCible,
      detail: parametres.detail,
    },
  });
}
