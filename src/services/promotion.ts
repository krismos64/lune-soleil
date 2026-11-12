/**
 * Promotions de catalogue, ADR-051, LS-319.
 *
 * L'AUTORISATION N'EST PAS FAITE ICI, invariant 2 : l'action
 * d'administration appelle `exigerRole` avant `activerPromotion` et
 * `desactiverPromotion`, qui reçoivent l'identité de la session.
 *
 * LE PRIX RÉDUIT N'EST JAMAIS CALCULÉ AILLEURS que par `prixDeVente`, lu ici
 * pour l'affichage et dans `passerCommande` pour la commande.
 */
import {
  JOURS_CARENCE,
  HEURES_REACTIVATION,
  PROMOTIONS,
  prixDeVente,
  schemaCodePromotion,
  type CodePromotion,
} from "@/lib/promotion";
import { prisma } from "@/lib/prisma";
import { valider } from "@/lib/validation";
import * as depot from "@/repositories/promotion";

export class PromotionDejaActiveError extends Error {
  constructor() {
    super("Une promotion est déjà active.");
    this.name = "PromotionDejaActiveError";
  }
}

/**
 * Une promotion désactivée depuis plus de 24 heures interdit toute
 * activation pendant trente jours, arbitrage 2 d'ADR-051 : le prix réduit
 * est devenu le prix le plus bas pratiqué.
 */
export class PromotionEnCarenceError extends Error {
  readonly finCarence: Date;
  constructor(finCarence: Date) {
    super("Une promotion récente interdit d'en activer une nouvelle.");
    this.name = "PromotionEnCarenceError";
    this.finCarence = finCarence;
  }
}

export type PromotionEnVigueur = {
  id: string;
  code: CodePromotion;
  taux: number;
  libelle: string;
  periodeAnnoncee: string;
  activeDepuis: Date;
  variantesEligibles: Set<string>;
  /** Produits dont TOUTES les variantes en vente sont éligibles. */
  produitsEligibles: Set<string>;
  /** Chaque variante en vente est éligible : l'annonce peut dire « toute la boutique ». */
  toutLeCatalogue: boolean;
};

/**
 * La promotion active et l'éligibilité de chaque variante en vente, `null`
 * sans promotion. Une lecture par page : le catalogue compte quelques
 * dizaines de variantes, `frontend-design.md`.
 */
export async function lirePromotionEnVigueur(
  client = prisma,
): Promise<PromotionEnVigueur | null> {
  const active = await depot.lirePromotionActive(client);
  if (active === null) return null;
  const code = schemaCodePromotion.safeParse(active.code);
  // Un code inconnu ne peut exister, `chk_promotion_code_connu` : défaut
  // fermé quand même, aucune réduction plutôt qu'une réduction inventée.
  if (!code.success) return null;

  const lignes = await depot.lireEligibiliteCatalogue(client, active.id);
  const variantesEligibles = new Set<string>();
  const produitsExclus = new Set<string>();
  const produits = new Set<string>();
  for (const ligne of lignes) {
    produits.add(ligne.produitId);
    if (ligne.eligible) variantesEligibles.add(ligne.varianteId);
    else produitsExclus.add(ligne.produitId);
  }
  const produitsEligibles = new Set(
    [...produits].filter((id) => !produitsExclus.has(id)),
  );
  const definition = PROMOTIONS[code.data];
  return {
    id: active.id,
    code: code.data,
    taux: active.taux,
    libelle: definition.libelle,
    periodeAnnoncee: definition.periodeAnnoncee,
    activeDepuis: active.activeDepuis,
    variantesEligibles,
    produitsEligibles,
    toutLeCatalogue: produitsExclus.size === 0 && lignes.length > 0,
  };
}

/**
 * Le prix à afficher d'une variante : réduit et barré si elle est éligible,
 * le prix catalogue seul sinon. Le même calcul que la commande.
 */
export function prixAffiche(
  promotion: PromotionEnVigueur | null,
  varianteId: string,
  prixCentimes: number,
): { prixCentimes: number; prixReferenceCentimes: number | null } {
  if (promotion === null || !promotion.variantesEligibles.has(varianteId)) {
    return { prixCentimes, prixReferenceCentimes: null };
  }
  const reduit = prixDeVente(prixCentimes, promotion.taux);
  return reduit < prixCentimes
    ? { prixCentimes: reduit, prixReferenceCentimes: prixCentimes }
    : { prixCentimes, prixReferenceCentimes: null };
}

/**
 * Active une promotion écrite dans le code. Refuse une seconde active, et
 * une activation en carence. Une réactivation dans les 24 heures de la même
 * promotion est permise, arbitrage 2.
 */
export async function activerPromotion({
  code: entree,
  acteurId,
}: {
  code: unknown;
  acteurId: string | null;
}): Promise<depot.PromotionActive> {
  const code = valider(schemaCodePromotion, entree);
  return prisma.$transaction(async (tx) => {
    if ((await depot.lirePromotionActive(tx)) !== null) {
      throw new PromotionDejaActiveError();
    }
    const derniere = await depot.lireDerniereDesactivation(tx, {
      heuresReactivation: HEURES_REACTIVATION,
      joursCarence: JOURS_CARENCE,
    });
    if (
      derniere !== null &&
      derniere.dansCarence &&
      !(derniere.dansReactivation && derniere.code === code)
    ) {
      throw new PromotionEnCarenceError(derniere.finCarence);
    }
    try {
      return await depot.insererPromotion(tx, {
        code,
        taux: PROMOTIONS[code].taux,
        acteurId,
      });
    } catch (erreur) {
      // Deux activations simultanées : l'index en refuse une.
      const message = erreur instanceof Error ? erreur.message : "";
      if (message.includes("promotion_active_unique")) {
        throw new PromotionDejaActiveError();
      }
      throw erreur;
    }
  });
}

/** Désactive la promotion active. Rend `false` s'il n'y en avait aucune. */
export async function desactiverPromotion({
  acteurId,
}: {
  acteurId: string | null;
}): Promise<boolean> {
  return (await depot.desactiverPromotionActive(prisma, acteurId)) > 0;
}

/**
 * Le gel des prix, ADR-051 point 6 : un prix ne change pas sous promotion
 * active. Appelé dans la transaction qui écrirait le prix.
 */
export class PrixGelesSousPromotionError extends Error {
  constructor() {
    super("Les prix sont gelés tant qu'une promotion est active.");
    this.name = "PrixGelesSousPromotionError";
  }
}

export async function exigerPrixModifiables(
  client: Parameters<typeof depot.lirePromotionActive>[0],
): Promise<void> {
  if ((await depot.lirePromotionActive(client)) !== null) {
    throw new PrixGelesSousPromotionError();
  }
}
