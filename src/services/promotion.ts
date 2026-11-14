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
  schemaDemandePromotion,
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

export class ArticlePromotionInconnuError extends Error {
  constructor() {
    super("Un article choisi n'existe pas.");
    this.name = "ArticlePromotionInconnuError";
  }
}

export class PromotionDejaActiveError extends Error {
  constructor() {
    super("Une promotion est déjà active.");
    this.name = "PromotionDejaActiveError";
  }
}

export type PromotionEnVigueur = {
  id: string;
  code: CodePromotion;
  libelle: string;
  /** « du lundi 23 au dimanche 29 novembre », `null` sans période réglée. */
  periodeAnnoncee: string | null;
  activeDepuis: Date;
  /**
   * Le taux APPLIQUÉ à chaque déclinaison réduite, LS-324 : celui de son
   * article, ou le taux général. Une déclinaison absente n'est pas réduite.
   */
  tauxParVariante: Map<string, number>;
  /** Le taux d'un produit dont TOUTES les déclinaisons en vente sont réduites. */
  tauxParProduit: Map<string, number>;
  /** Le plus haut taux réellement appliqué à une pièce en vente. */
  tauxMaximum: number;
  /** Toutes les pièces réduites le sont au même taux : « −20 % » et non « jusqu'à ». */
  tauxUnique: boolean;
  /** Chaque déclinaison en vente est réduite : l'annonce peut dire « toute la boutique ». */
  toutLeCatalogue: boolean;
};

/**
 * La promotion active et le taux de chaque déclinaison en vente, `null` sans
 * promotion. Une lecture par page : le catalogue compte quelques dizaines de
 * déclinaisons, `frontend-design.md`.
 *
 * UNE PROMOTION QUI NE RÉDUIT AUCUNE PIÈCE EN VENTE N'EST PAS EN VIGUEUR,
 * LS-324 : ses articles peuvent tous être archivés ou exclus par la règle des
 * trente jours. Rien ne s'annonce alors, plutôt qu'une réduction sans objet.
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
  const tauxParVariante = new Map<string, number>();
  const produitsIncomplets = new Set<string>();
  const tauxDesProduits = new Map<string, number>();
  for (const ligne of lignes) {
    if (ligne.taux === null) {
      produitsIncomplets.add(ligne.produitId);
    } else {
      tauxParVariante.set(ligne.varianteId, ligne.taux);
      tauxDesProduits.set(ligne.produitId, ligne.taux);
    }
  }
  if (tauxParVariante.size === 0) return null;

  const tauxParProduit = new Map(
    [...tauxDesProduits].filter(([id]) => !produitsIncomplets.has(id)),
  );
  const appliques = new Set(tauxParVariante.values());
  return {
    id: active.id,
    code: code.data,
    libelle: PROMOTIONS[code.data].libelle,
    periodeAnnoncee: await lirePeriodeAnnoncee(client),
    activeDepuis: active.activeDepuis,
    tauxParVariante,
    tauxParProduit,
    tauxMaximum: Math.max(...appliques),
    tauxUnique: appliques.size === 1,
    toutLeCatalogue: produitsIncomplets.size === 0,
  };
}

/**
 * Le prix affiché d'une variante sous la promotion en vigueur, son prix de
 * référence barré et le taux qui les sépare, ou le prix catalogue seul.
 * Chaque écran appelle cette fonction, aucun ne calcule un prix.
 */
export function prixAffiche(
  promotion: PromotionEnVigueur | null,
  varianteId: string,
  prixCentimes: number,
): {
  prixCentimes: number;
  prixReferenceCentimes: number | null;
  tauxReduction: number | null;
} {
  const taux = promotion?.tauxParVariante.get(varianteId);
  return prixReduit(prixCentimes, taux);
}

/**
 * Le prix d'une pièce à un taux donné, `undefined` valant « pas de
 * réduction ». Une réduction qui n'abaisse pas le prix, un centime à 5 %,
 * n'en est pas une : ni prix barré ni taux.
 */
export function prixReduit(
  prixCentimes: number,
  taux: number | undefined,
): {
  prixCentimes: number;
  prixReferenceCentimes: number | null;
  tauxReduction: number | null;
} {
  if (taux === undefined) {
    return { prixCentimes, prixReferenceCentimes: null, tauxReduction: null };
  }
  const reduit = prixDeVente(prixCentimes, taux);
  return reduit < prixCentimes
    ? {
        prixCentimes: reduit,
        prixReferenceCentimes: prixCentimes,
        tauxReduction: taux,
      }
    : { prixCentimes, prixReferenceCentimes: null, tauxReduction: null };
}

/**
 * Active une promotion, LS-324 : le nom choisi dans la liste fermée, la
 * portée, et les taux saisis, bornés par `schemaDemandePromotion`.
 *
 * Une seule à la fois : une promotion active fait lever
 * `PromotionDejaActiveError`, et l'index `promotion_active_unique` ferme la
 * course entre deux activations. Aucun autre refus ni avertissement,
 * amendement d'ADR-051 du 13 novembre 2026 : l'exploitante active librement.
 *
 * LA PROMOTION ET SES ARTICLES S'ÉCRIVENT DANS UNE TRANSACTION : un article
 * inconnu, refusé par la clé étrangère, n'en laisse rien.
 */
export async function activerPromotion({
  demande: entree,
  acteurId,
}: {
  demande: unknown;
  acteurId: string | null;
}): Promise<depot.PromotionActive> {
  const demande = valider(schemaDemandePromotion, entree);
  return prisma.$transaction(async (tx) => {
    // Sérialisée avec tout changement de prix, revue critique de LS-319.
    await depot.verrouillerPromotion(tx);
    if ((await depot.lirePromotionActive(tx)) !== null) {
      throw new PromotionDejaActiveError();
    }
    try {
      return await depot.insererPromotion(tx, {
        code: demande.code,
        portee: demande.portee,
        taux: demande.portee === "TOUT" ? demande.taux : null,
        articles: demande.articles,
        acteurId,
      });
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : "";
      // Deux activations simultanées : l'index en refuse une.
      if (message.includes("promotion_active_unique")) {
        throw new PromotionDejaActiveError();
      }
      // Un article qui n'existe pas : la clé étrangère le refuse.
      if (message.includes("promotion_produit_produit_id_fkey")) {
        throw new ArticlePromotionInconnuError();
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
  | { statut: "ARTICLE_INCONNU" }
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
  demande: { action: "ACTIVER"; demande: unknown } | { action: "DESACTIVER" },
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
    const active = await activerPromotion({
      demande: demande.demande,
      acteurId,
    });
    const code = schemaCodePromotion.parse(active.code);
    return { statut: "ACTIVEE", libelle: PROMOTIONS[code].libelle };
  } catch (erreur) {
    if (erreur instanceof PromotionDejaActiveError) {
      return { statut: "DEJA_ACTIVE" };
    }
    if (erreur instanceof ArticlePromotionInconnuError) {
      return { statut: "ARTICLE_INCONNU" };
    }
    throw erreur;
  }
}

/**
 * Ce que l'écran d'administration montre de la promotion ACTIVE, LS-324 : son
 * nom, sa portée, ses taux, et ce qu'elle réduit réellement.
 *
 * LUE SUR LA PROMOTION ACTIVE ET NON SUR CELLE « EN VIGUEUR » : une promotion
 * qui ne réduit aucune pièce n'annonce rien au public, mais l'exploitante
 * doit la voir pour la désactiver.
 */
export type EtatPromotion = {
  active: {
    libelle: string;
    portee: "TOUT" | "SELECTION";
    /** Le taux général, `null` sous la portée `SELECTION`. */
    tauxGeneral: number | null;
    /** Les articles au taux propre, par nom. */
    articles: { nom: string; taux: number }[];
    activeDepuis: Date;
    /** Déclinaisons en vente réellement réduites. */
    reduites: number;
    /** Déclinaisons visées mais exclues, prix changé dans les trente jours. */
    exclues: number;
  } | null;
};

export async function lireEtatPromotion(): Promise<EtatPromotion> {
  const active = await depot.lirePromotionActive(prisma);
  if (active === null) return { active: null };
  const code = schemaCodePromotion.safeParse(active.code);
  const [lignes, articles] = await Promise.all([
    depot.lireEligibiliteCatalogue(prisma, active.id),
    depot.lireArticlesPromotion(prisma, active.id),
  ]);
  return {
    active: {
      libelle: code.success ? PROMOTIONS[code.data].libelle : active.code,
      portee: active.portee === "SELECTION" ? "SELECTION" : "TOUT",
      tauxGeneral: active.taux,
      articles: articles.map(({ nom, taux }) => ({ nom, taux })),
      activeDepuis: active.activeDepuis,
      reduites: lignes.filter((ligne) => ligne.taux !== null).length,
      exclues: lignes.filter(
        (ligne) => ligne.tauxVise !== null && ligne.taux === null,
      ).length,
    },
  };
}

/** Les articles en vente que l'exploitante peut cocher, LS-324. */
export async function lireArticlesReductibles(): Promise<
  Awaited<ReturnType<typeof depot.listerArticlesReductibles>>
> {
  return depot.listerArticlesReductibles(prisma);
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
