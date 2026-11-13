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
  PROMOTIONS,
  formaterPeriode,
  prixDeVente,
  schemaCodePromotion,
  schemaPeriodePromotion,
  type CodePromotion,
} from "@/lib/promotion";
import { prisma } from "@/lib/prisma";
import {
  AutorisationRefuseeError,
  exigerAdministratrice,
} from "@/services/autorisation";
import {
  ReauthentificationRequiseError,
  exigerReauthentificationRecente,
} from "@/services/reauthentification";
import { valider } from "@/lib/validation";
import * as depot from "@/repositories/promotion";
import * as depotParametres from "@/repositories/parametres";

export class PromotionDejaActiveError extends Error {
  constructor() {
    super("Une promotion est déjà active.");
    this.name = "PromotionDejaActiveError";
  }
}

export type PromotionEnVigueur = {
  id: string;
  code: CodePromotion;
  taux: number;
  libelle: string;
  /** « du lundi 23 au dimanche 29 novembre », `null` sans période réglée. */
  periodeAnnoncee: string | null;
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
    periodeAnnoncee: await lirePeriodeAnnoncee(client),
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
 * Active une promotion écrite dans le code. Refuse seulement une seconde
 * active : aucune carence entre deux activations, amendement d'ADR-051 du
 * 13 novembre 2026.
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
    // Sérialisée avec tout changement de prix, revue critique de LS-319.
    await depot.verrouillerPromotion(tx);
    if ((await depot.lirePromotionActive(tx)) !== null) {
      throw new PromotionDejaActiveError();
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
  // Le verrou d'abord : une activation concurrente attend la fin de ce
  // changement de prix, ou ce changement voit la promotion qu'elle a posée.
  await depot.verrouillerPromotion(client);
  if ((await depot.lirePromotionActive(client)) !== null) {
    throw new PrixGelesSousPromotionError();
  }
}

export type IssueBasculePromotion =
  | { statut: "ACTIVEE"; libelle: string }
  | { statut: "DESACTIVEE" }
  | { statut: "AUCUNE_ACTIVE" }
  | { statut: "DEJA_ACTIVE" }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "REAUTHENTIFICATION_REQUISE" };

/**
 * Le point d'entrée de l'administration, ADR-051. Une promotion change le
 * prix ENCAISSÉ : elle relève de la famille des paramètres de la boutique,
 * comme les tarifs, et exige le rôle ET une preuve d'identité récente,
 * ADR-027. L'acteur vient de la session, jamais du formulaire, invariant 2.
 *
 * LES REFUS SONT DES VALEURS : l'écran les présente, aucune page d'erreur.
 *
 * @sensible PARAMETRES_BOUTIQUE
 */
export async function basculerPromotion(
  enTetes: Headers,
  demande: { action: "ACTIVER"; code: unknown } | { action: "DESACTIVER" },
): Promise<IssueBasculePromotion> {
  let acteurId: string;
  try {
    acteurId = (await exigerAdministratrice(enTetes)).utilisateurId;
    await exigerReauthentificationRecente(enTetes, "PARAMETRES_BOUTIQUE");
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    if (erreur instanceof ReauthentificationRequiseError) {
      return { statut: "REAUTHENTIFICATION_REQUISE" };
    }
    throw erreur;
  }

  if (demande.action === "DESACTIVER") {
    return (await desactiverPromotion({ acteurId }))
      ? { statut: "DESACTIVEE" }
      : { statut: "AUCUNE_ACTIVE" };
  }
  try {
    const active = await activerPromotion({ code: demande.code, acteurId });
    const code = schemaCodePromotion.parse(active.code);
    return { statut: "ACTIVEE", libelle: PROMOTIONS[code].libelle };
  } catch (erreur) {
    if (erreur instanceof PromotionDejaActiveError) {
      return { statut: "DEJA_ACTIVE" };
    }
    throw erreur;
  }
}

/** Ce que l'écran des paramètres montre de la promotion, ADR-051. */
export async function lireEtatPromotion(): Promise<{
  active: {
    libelle: string;
    taux: number;
    activeDepuis: Date;
    exclues: number;
  } | null;
}> {
  const enVigueur = await lirePromotionEnVigueur();
  if (enVigueur === null) return { active: null };
  const lignes = await depot.lireEligibiliteCatalogue(prisma, enVigueur.id);
  return {
    active: {
      libelle: enVigueur.libelle,
      taux: enVigueur.taux,
      activeDepuis: enVigueur.activeDepuis,
      exclues: lignes.filter((l) => !l.eligible).length,
    },
  };
}

/**
 * La période annoncée, écrite pour le bandeau, `null` sans période réglée.
 * Une lecture en échec ne fait tomber aucune page : le bandeau perd ses
 * dates, il ne ment pas.
 */
async function lirePeriodeAnnoncee(client = prisma): Promise<string | null> {
  try {
    const periode = await depotParametres.lirePeriodePromotion(client);
    return periode === null
      ? null
      : formaterPeriode(periode.debut, periode.fin);
  } catch {
    return null;
  }
}

/** La période réglée, au format des champs de date, pour l'écran. */
export async function lirePeriodeReglee(): Promise<{
  debut: string;
  fin: string;
} | null> {
  const periode = await depotParametres.lirePeriodePromotion(prisma);
  if (periode === null) return null;
  return {
    debut: periode.debut.toISOString().slice(0, 10),
    fin: periode.fin.toISOString().slice(0, 10),
  };
}

export type IssuePeriodePromotion =
  | { statut: "ENREGISTREE"; periode: string | null }
  | { statut: "SESSION_ABSENTE" }
  | { statut: "PARAMETRES_ABSENTS" };

/**
 * Règle la période annoncée par le bandeau, amendement d'ADR-051 : deux
 * dates, ou aucune. Le rôle est exigé, pas la réauthentification : les dates
 * ne changent aucun prix encaissé, même motif que le thème.
 * `EntreeInvalideError` remonte à l'action, qui en lit le message.
 */
export async function enregistrerPeriodePromotion(
  enTetes: Headers,
  entree: unknown,
): Promise<IssuePeriodePromotion> {
  try {
    await exigerAdministratrice(enTetes);
  } catch (erreur) {
    if (erreur instanceof AutorisationRefuseeError) {
      return { statut: "SESSION_ABSENTE" };
    }
    throw erreur;
  }
  const periode = valider(schemaPeriodePromotion, entree);
  const enDates =
    periode === null
      ? null
      : {
          debut: new Date(`${periode.debut}T00:00:00Z`),
          fin: new Date(`${periode.fin}T00:00:00Z`),
        };
  if ((await depotParametres.ecrirePeriodePromotion(prisma, enDates)) === 0) {
    return { statut: "PARAMETRES_ABSENTS" };
  }
  return {
    statut: "ENREGISTREE",
    periode:
      enDates === null ? null : formaterPeriode(enDates.debut, enDates.fin),
  };
}
