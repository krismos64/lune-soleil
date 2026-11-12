/**
 * Accès aux promotions et à l'historique des prix, ADR-051, LS-319.
 *
 * L'ÉLIGIBILITÉ D'UNE VARIANTE S'ÉCRIT UNE SEULE FOIS, `CONDITION_ELIGIBLE`,
 * et sert à l'affichage comme à la commande : deux formulations finiraient
 * par diverger, et le client paierait un autre prix que celui affiché.
 *
 * Elle se juge à l'activation de la promotion, `p.active_depuis` : la
 * variante existe depuis trente jours au moins, et son prix n'a pas changé
 * pendant ces trente jours. L'horloge est celle de PostgreSQL, jamais celle
 * de Node, `database.md`.
 */
import { Prisma } from "@/generated/prisma/client";
import { CLE_VERROU_PROMOTION, JOURS_PRIX_ANTERIEUR } from "@/lib/promotion";
import type { ClientBase as Client } from "@/repositories/stock";

/** `v` est la variante, `p` la promotion active. */
const CONDITION_ELIGIBLE = Prisma.sql`
  v.prix_centimes > 0
  AND v.cree_a <= p.active_depuis - make_interval(days => ${JOURS_PRIX_ANTERIEUR})
  AND NOT EXISTS (
    SELECT 1 FROM historique_prix_variante h
     WHERE h.variante_id = v.id
       AND h.modifie_a > p.active_depuis - make_interval(days => ${JOURS_PRIX_ANTERIEUR})
  )`;

export type PromotionActive = {
  id: string;
  code: string;
  taux: number;
  activeDepuis: Date;
};

export async function lirePromotionActive(
  client: Client,
): Promise<PromotionActive | null> {
  const lignes = await client.$queryRaw<PromotionActive[]>`
    SELECT id, code, taux_pourcentage AS taux, active_depuis AS "activeDepuis"
      FROM promotion WHERE active`;
  return lignes[0] ?? null;
}

/**
 * Prend le verrou consultatif de la promotion, jusqu'à la fin de la
 * transaction. L'activation et tout changement de prix le prennent EN
 * PREMIER, avant tout verrou de variante : un seul ordre, aucun cycle.
 * `passerCommande` ne le prend pas, il ne change ni prix ni promotion.
 */
export async function verrouillerPromotion(client: Client): Promise<void> {
  await client.$executeRaw`SELECT pg_advisory_xact_lock(${CLE_VERROU_PROMOTION}::bigint)`;
}

/**
 * Chaque variante du catalogue, avec son produit et son éligibilité à la
 * promotion active : non archivée, produit actif.
 *
 * LA VENTE WEB SUSPENDUE N'EST PAS FILTRÉE, revue critique de LS-319 : le
 * prix de la carte est le minimum de ces mêmes variantes, suspendues
 * comprises. Une variante suspendue et inéligible qui manquait ici laissait
 * la carte barrer un prix qu'aucune pièce ne portait. Mêmes variantes des
 * deux côtés, et une exclue retire le produit des produits éligibles.
 */
export async function lireEligibiliteCatalogue(
  client: Client,
  promotionId: string,
): Promise<{ varianteId: string; produitId: string; eligible: boolean }[]> {
  return client.$queryRaw`
    SELECT v.id AS "varianteId", v.produit_id AS "produitId",
           (${CONDITION_ELIGIBLE}) AS eligible
      FROM variante v
      JOIN produit pr ON pr.id = v.produit_id
      JOIN promotion p ON p.id = ${promotionId}
     WHERE v.archivee_a IS NULL
       AND pr.statut = 'ACTIF'`;
}

/**
 * La promotion active et les variantes éligibles parmi celles d'une
 * commande, LUES EN UNE SEULE INSTRUCTION : la commande n'a qu'une vérité de
 * prix, même si une désactivation est validée pendant sa transaction.
 */
export async function lirePromotionPourCommande(
  client: Client,
  varianteIds: readonly string[],
): Promise<{ id: string; taux: number; eligibles: string[] } | null> {
  if (varianteIds.length === 0) return null;
  const lignes = await client.$queryRaw<
    { id: string; taux: number; eligibles: string[] }[]
  >`
    SELECT p.id, p.taux_pourcentage AS taux,
           coalesce(array_agg(v.id) FILTER (WHERE v.id IS NOT NULL), '{}') AS eligibles
      FROM promotion p
      LEFT JOIN variante v
        ON v.id IN (${Prisma.join([...varianteIds])}) AND ${CONDITION_ELIGIBLE}
     WHERE p.active
     GROUP BY p.id, p.taux_pourcentage`;
  return lignes[0] ?? null;
}

/**
 * Insère la promotion active. L'index `promotion_active_unique` refuse une
 * seconde active : l'appelant traduit ce refus.
 */
export async function insererPromotion(
  client: Client,
  {
    code,
    taux,
    acteurId,
  }: { code: string; taux: number; acteurId: string | null },
): Promise<PromotionActive> {
  const lignes = await client.$queryRaw<PromotionActive[]>`
    INSERT INTO promotion (id, code, taux_pourcentage, active, active_depuis, activee_par_id)
    VALUES (gen_random_uuid(), ${code}, ${taux}, true, now(), ${acteurId})
    RETURNING id, code, taux_pourcentage AS taux, active_depuis AS "activeDepuis"`;
  return lignes[0]!;
}

/** Désactive la promotion active. Rend le nombre de lignes touchées. */
export async function desactiverPromotionActive(
  client: Client,
  acteurId: string | null,
): Promise<number> {
  return client.$executeRaw`
    UPDATE promotion
       SET active = false, desactivee_a = now(), desactivee_par_id = ${acteurId}
     WHERE active`;
}

/**
 * La dernière désactivation, et si elle tombe dans la fenêtre de
 * réactivation ou dans la carence, jugées par l'horloge de la base.
 */
export async function lireDerniereDesactivation(
  client: Client,
  {
    heuresReactivation,
    joursCarence,
  }: { heuresReactivation: number; joursCarence: number },
): Promise<{
  code: string;
  desactiveeA: Date;
  dansReactivation: boolean;
  finCarence: Date;
  dansCarence: boolean;
} | null> {
  const lignes = await client.$queryRaw<
    {
      code: string;
      desactiveeA: Date;
      dansReactivation: boolean;
      finCarence: Date;
      dansCarence: boolean;
    }[]
  >`
    SELECT code, desactivee_a AS "desactiveeA",
           desactivee_a > now() - make_interval(hours => ${heuresReactivation}) AS "dansReactivation",
           desactivee_a + make_interval(days => ${joursCarence}) AS "finCarence",
           desactivee_a > now() - make_interval(days => ${joursCarence}) AS "dansCarence"
      FROM promotion
     WHERE desactivee_a IS NOT NULL
     ORDER BY desactivee_a DESC
     LIMIT 1`;
  return lignes[0] ?? null;
}

/**
 * Écrit l'historique d'un changement de prix, dans la transaction qui le
 * fait. Rien si le prix ne change pas : `chk_historique_prix_variante`
 * refuserait la ligne.
 */
export async function ecrireHistoriquePrix(
  client: Client,
  lignes: readonly { varianteId: string; ancien: number; nouveau: number }[],
): Promise<void> {
  for (const { varianteId, ancien, nouveau } of lignes) {
    if (ancien === nouveau) continue;
    await client.$executeRaw`
      INSERT INTO historique_prix_variante
        (id, variante_id, ancien_prix_centimes, nouveau_prix_centimes, modifie_a)
      VALUES (gen_random_uuid(), ${varianteId}, ${ancien}, ${nouveau}, now())`;
  }
}
