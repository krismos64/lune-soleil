/**
 * Stock multicanal, LS-106. Parcours 2, « stock en situation de marche ».
 *
 * CE QUE CE SERVICE PORTE : les regles S4, S5, S6, S9, S14 et S15, la validation
 * Zod des entrees (invariants 1 et 7) et les frontieres de transaction. Il ne
 * lit ni cookie ni `FormData`, qui restent dans l'adaptateur d'entree, et ne
 * verifie aucune autorisation : elle est faite par la Server Action ET par la
 * page, a partir de la session, invariant 2.
 *
 * L'INVARIANT 6 COMMANDE TOUT CE FICHIER. Disponibilite web et quantite physique
 * sont deux notions distinctes : suspendre la vente web ne cree AUCUN mouvement
 * de stock, seule une vente reelle decremente le physique. Les confondre
 * produirait des mouvements fantomes qui fausseraient l'inventaire sans que
 * personne ne comprenne d'ou ils viennent.
 *
 * UN REFUS METIER N'EST PAS UNE ERREUR. Ces fonctions rendent un `refus` nomme
 * plutot que de lever : « une reservation est active » se presente a
 * l'exploitante avec une action, pas comme une panne. Seules les erreurs
 * techniques remontent en exception.
 *
 * Codes Prisma verifies via Context7 sur la documentation Prisma 7 : `P2002`
 * unicite, `P2025` enregistrement introuvable.
 */
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import * as depot from "@/repositories/mouvement-stock";
import * as depotVariante from "@/repositories/variante";
import {
  schemaAjustementInventaire,
  schemaBasculeVenteWeb,
  schemaCorrectionMouvement,
  schemaVenteExterne,
} from "@/services/stock-multicanal-validation";

export type EtatStockVariante = depot.EtatStockVariante;
export type Mouvement = depot.Mouvement;

/** Les refus metier de ce service, chacun avec son message a l'ecran. */
export type RefusStock =
  | "RESERVATION_ACTIVE"
  | "STOCK_INSUFFISANT"
  | "VARIANTE_INTROUVABLE"
  | "MOUVEMENT_INTROUVABLE"
  | "DEJA_COMPENSE"
  | "NON_COMPENSABLE";

/** L'etat de stock de toutes les variantes vivantes, critere 1. */
export async function lireEtatStock(): Promise<EtatStockVariante[]> {
  return depot.listerEtatStock(prisma);
}

/** Le journal des mouvements, du plus recent au plus ancien. */
export async function lireJournal(
  filtre: { varianteId?: string; limite?: number } = {},
): Promise<Mouvement[]> {
  return depot.listerMouvements(prisma, filtre);
}

/**
 * Bascule la vente web d'une variante, invariant 6.
 *
 * AUCUN MOUVEMENT DE STOCK N'EST CREE ICI, et c'est le critere 2 de la story.
 * Ce n'est pas un oubli a corriger plus tard : c'est la regle. Une suspension
 * retire la piece de la vente en ligne le temps d'un marche, elle ne fait pas
 * sortir de bijou de l'atelier.
 *
 * AUCUNE TRANSACTION NON PLUS. Une seule ecriture, sur une seule ligne : la
 * transaction n'ajouterait aucune garantie et ferait croire a un ensemble
 * atomique qui n'existe pas.
 *
 * `acteurId` EST EXIGE SANS ETRE ECRIT ICI. La trace de cette bascule
 * appartient au journal d'audit du parcours 2, hors de cette story : le
 * parametre le rend visible plutot que de laisser croire que la question ne se
 * pose pas.
 */
async function basculerVenteWeb(
  entree: unknown,
  activee: boolean,
): Promise<{ refus?: RefusStock }> {
  /*
   * `acteurId` EST EXTRAIT AVANT LA VALIDATION, comme partout dans ce service.
   * Il vient de la SESSION et jamais d'un formulaire, invariant 2 : le laisser
   * entrer dans le schema le ferait refuser par `strictObject`, et surtout
   * laisserait croire qu'une entree non fiable peut le porter.
   */
  const { acteurId, ...reste } = entree as { acteurId: string };
  const { varianteId } = valider(schemaBasculeVenteWeb, reste);

  /*
   * TRANSACTION POUR DEUX ECRITURES QUI VONT ENSEMBLE : la bascule et sa trace
   * d'audit. Une bascule sans trace laisserait l'exploitante sans moyen de
   * savoir qui a retire une piece de la vente, ce que le parcours 2 exige a son
   * etape 1.
   */
  return prisma.$transaction(async (tx) => {
    const touchees = await tx.$executeRaw`
      UPDATE variante
         SET vente_web_activee = ${activee}
       WHERE id = ${varianteId}
         AND archivee_a IS NULL
    `;

    /*
     * ZERO LIGNE TOUCHEE SIGNIFIE VARIANTE INTROUVABLE OU ARCHIVEE. Les deux se
     * confondent volontairement : une variante archivee n'a pas a etre remise
     * en vente, et distinguer les deux cas n'apporterait rien a l'ecran.
     *
     * LE REFUS SORT AVANT TOUTE AUTRE ECRITURE. Dans `$transaction`, seul un
     * jet annule : un `return` valide ce qui precede. Ici rien n'a ete ecrit,
     * l'`UPDATE` n'ayant touche aucune ligne, donc sortir est sans effet.
     */
    if (touchees === 0) {
      return { refus: "VARIANTE_INTROUVABLE" as const };
    }

    await depot.ecrireAudit(tx, {
      acteurId,
      action: activee ? "REACTIVATION_VENTE_WEB" : "SUSPENSION_VENTE_WEB",
      typeCible: "Variante",
      idCible: varianteId,
      // L'etat obtenu, sans quoi deux entrees consecutives seraient
      // indiscernables l'une de l'autre.
      detail: { venteWebActivee: activee },
    });

    return {};
  });
}

/** Suspend la vente web, avant un marche. Aucun mouvement de stock. */
export async function suspendreVenteWeb(
  entree: unknown,
): Promise<{ refus?: RefusStock }> {
  return basculerVenteWeb(entree, false);
}

/** Remet la piece en vente en ligne, au retour du marche. Aucun mouvement. */
export async function reactiverVenteWeb(
  entree: unknown,
): Promise<{ refus?: RefusStock }> {
  return basculerVenteWeb(entree, true);
}

/**
 * Enregistre une vente externe, etape 3 du parcours 2.
 *
 * TRANSACTION OBLIGATOIRE, point 5 de `database.md`. La decrementation du stock
 * et l'ecriture du mouvement forment un tout : l'une sans l'autre laisse soit
 * une piece vendue sans trace, soit une trace sans piece.
 *
 * LE CONTROLE DE RESERVATION EST DANS L'`UPDATE`, PAS AVANT. C'est la lecon
 * d'ADR-006 appliquee ici : entre un `SELECT` de controle et l'ecriture, une
 * reservation peut naitre, et la piece serait vendue deux fois. La condition
 * `quantite_physique - quantite_reservee >= quantite` tranche en une
 * instruction, sous verrou de ligne implicite.
 *
 * LE REFUS EST DISTINGUE, et l'ecran en depend. Zero ligne touchee peut venir
 * d'une reservation active ou d'un stock nul : le parcours 2 exige un message
 * qui dit lequel, avec une proposition d'annuler la reservation dans le premier
 * cas. La distinction se fait APRES le refus, par une lecture, ce qui est sans
 * risque : l'ecriture a deja ete refusee, aucune course ne peut plus fausser le
 * diagnostic.
 *
 * `return` DANS UNE TRANSACTION VALIDE, il n'annule pas. Le refus sort donc
 * AVANT toute ecriture, jamais apres : la fonction ne fait rien tant qu'elle
 * n'est pas sure d'aller au bout. Piege documente de ce projet, un `return`
 * apres une ecriture partielle la laisserait committer.
 */
export async function enregistrerVenteExterne(
  entree: unknown,
): Promise<{ refus?: RefusStock; mouvementId?: string }> {
  /*
   * `acteurId` EST EXTRAIT AVANT LA VALIDATION, et volontairement hors du
   * schema Zod. Il ne vient JAMAIS du formulaire : il est lu de la session par
   * la Server Action, invariant 2. Le placer dans le schema laisserait croire
   * qu'une entree non fiable peut le porter, et un jour quelqu'un le passerait
   * depuis un `FormData`.
   */
  const { acteurId, ...reste } = entree as { acteurId: string };
  const donnees = valider(schemaVenteExterne, reste);

  return prisma.$transaction(async (tx) => {
    const touchees = await depot.decrementerStockPhysique(tx, {
      varianteId: donnees.varianteId,
      quantite: donnees.quantite,
    });

    if (touchees === 0) {
      /*
       * LA DISTINCTION DES DEUX REFUS SE FAIT ICI, apres l'echec. Une
       * reservation active est le cas que le cahier des charges nomme
       * explicitement, et l'ecran doit proposer de la controler plutot que
       * d'afficher un echec sec.
       */
      const reservations = await depotVariante.compterReservationsActives(
        tx,
        donnees.varianteId,
      );

      return {
        refus:
          reservations > 0
            ? ("RESERVATION_ACTIVE" as const)
            : ("STOCK_INSUFFISANT" as const),
      };
    }

    /*
     * LA QUANTITE EST NEGATIVE AU JOURNAL. Le signe porte le sens du mouvement,
     * et c'est ce qui permet de sommer le journal pour retrouver le stock : une
     * vente retire, une entree ajoute. Ecrire une quantite positive sur une
     * sortie obligerait chaque calcul a connaitre le sens de chaque type.
     */
    const mouvementId = await depot.creerMouvement(tx, {
      varianteId: donnees.varianteId,
      type: "VENTE_EXTERNE",
      quantite: -donnees.quantite,
      canal: donnees.canal,
      prixUnitaireFigeCentimes: donnees.prixUnitaireFigeCentimes,
      acteurId,
    });

    return { mouvementId };
  });
}

/**
 * Corrige un mouvement par compensation, S14 et ADR-030.
 *
 * LE MOUVEMENT D'ORIGINE N'EST JAMAIS TOUCHE, regle S4. Une seconde ligne
 * l'annule, et les deux racontent ce qui s'est passe : corriger en place
 * effacerait la trace de l'erreur, et le stock reconstruit depuis le journal ne
 * correspondrait plus au stock reel.
 *
 * LE REFUS DE DOUBLE COMPENSATION VIENT DE LA BASE, pas d'une lecture prealable.
 * L'index `mouvement_compense_unique` leve `P2002` sur la seconde tentative :
 * deux corrections lancees simultanement ne peuvent pas passer toutes les deux,
 * la ou un controle applicatif les laisserait passer entre son `SELECT` et son
 * `INSERT`. Meme strategie que l'UPDATE conditionnel de reservation.
 *
 * LE COMPENSATEUR PORTE LE MEME PRIX FIGE, S14. Sans lui, le chiffre d'affaires
 * des marches compterait la vente annulee : la somme du journal doit retomber a
 * zero sur une vente corrigee.
 *
 * SEULE UNE SORTIE SE COMPENSE ICI. Compenser un compensateur serait une
 * correction de correction, que rien dans le parcours 2 ne demande, et que ce
 * service refuse plutot que de laisser l'index l'autoriser.
 */
export async function corrigerMouvement(
  entree: unknown,
): Promise<{ refus?: RefusStock; mouvementId?: string }> {
  const { acteurId, ...reste } = entree as { acteurId: string };
  const donnees = valider(schemaCorrectionMouvement, reste);

  try {
    return await prisma.$transaction(async (tx) => {
      const origine = await tx.mouvementStock.findUnique({
        where: { id: donnees.mouvementId },
        select: {
          id: true,
          varianteId: true,
          type: true,
          quantite: true,
          prixUnitaireFigeCentimes: true,
          compenseId: true,
        },
      });

      if (origine === null) {
        return { refus: "MOUVEMENT_INTROUVABLE" as const };
      }

      // Un compensateur ne se compense pas : la chaine s'arrete a un maillon.
      if (origine.compenseId !== null) {
        return { refus: "NON_COMPENSABLE" as const };
      }

      /*
       * LE SIGNE DE LA COMPENSATION EST L'INVERSE DE L'ORIGINE, quel que soit
       * le type : une sortie se compense par une entree, et reciproquement.
       * Deduire le signe du TYPE obligerait a maintenir une table des sens,
       * qu'un type ajoute a l'enum perimerait en silence.
       */
      const quantiteCompensatrice = -origine.quantite;

      await depot.incrementerStockPhysique(tx, {
        varianteId: origine.varianteId,
        quantite: quantiteCompensatrice,
      });

      const mouvementId = await depot.creerMouvement(tx, {
        varianteId: origine.varianteId,
        type: "RETOUR",
        quantite: quantiteCompensatrice,
        prixUnitaireFigeCentimes: origine.prixUnitaireFigeCentimes,
        motif: donnees.motif,
        acteurId,
        compenseId: origine.id,
      });

      return { mouvementId };
    });
  } catch (erreur) {
    /*
     * `P2002` SUR `mouvement_compense_unique` EST UN REFUS METIER, pas une
     * panne : une seconde correction a ete tentee sur un mouvement deja
     * compense. Toute autre erreur remonte telle quelle.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      return { refus: "DEJA_COMPENSE" };
    }
    throw erreur;
  }
}

/**
 * Ajuste le stock physique sur un comptage reel.
 *
 * L'EXPLOITANTE SAISIT CE QU'ELLE COMPTE, pas l'ecart. Lui demander la
 * difference deplacerait sur elle une soustraction que le service fait sans se
 * tromper, et un signe inverse ferait disparaitre du stock au lieu d'en
 * ajouter.
 *
 * UN COMPTAGE CONFORME N'ECRIT RIEN. C'est le cas le PLUS FREQUENT d'un
 * inventaire : ecrire un mouvement a zero noierait les vrais ecarts dans du
 * bruit, et le journal doit rester lisible. Le retour le dit explicitement
 * plutot que de laisser croire a un echec.
 *
 * AUCUN CONTROLE DE RESERVATION ICI, contrairement a la vente externe, et
 * l'asymetrie est voulue. Un inventaire CONSTATE la realite physique : refuser
 * de l'enregistrer parce qu'un client paie en ligne obligerait a mentir sur le
 * stock reel. Le `CHECK` de la base rattrape le seul cas dangereux, un physique
 * qui passerait sous les reservations.
 */
export async function ajusterInventaire(
  entree: unknown,
): Promise<{ refus?: RefusStock; sansEcart?: boolean; mouvementId?: string }> {
  const { acteurId, ...reste } = entree as { acteurId: string };
  const donnees = valider(schemaAjustementInventaire, reste);

  return prisma.$transaction(async (tx) => {
    const variante = await tx.variante.findFirst({
      where: { id: donnees.varianteId, archiveeA: null },
      select: { quantitePhysique: true },
    });

    if (variante === null) {
      return { refus: "VARIANTE_INTROUVABLE" as const };
    }

    const ecart = donnees.quantiteConstatee - variante.quantitePhysique;

    if (ecart === 0) {
      return { sansEcart: true };
    }

    /*
     * L'ECRITURE EST UNE AFFECTATION, PAS UN INCREMENT. La quantite constatee
     * est la verite : un increment relatif se decalerait si une vente survenait
     * entre le comptage et la saisie, et l'inventaire raterait sa cible.
     */
    await tx.$executeRaw`
      UPDATE variante
         SET quantite_physique = ${donnees.quantiteConstatee}
       WHERE id = ${donnees.varianteId}
         AND archivee_a IS NULL
    `;

    const mouvementId = await depot.creerMouvement(tx, {
      varianteId: donnees.varianteId,
      type: "AJUSTEMENT",
      quantite: ecart,
      motif: donnees.motif,
      acteurId,
    });

    return { mouvementId };
  });
}
