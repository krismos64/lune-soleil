/**
 * Accès aux promotions et à l'historique des prix, ADR-051, LS-319.
 *
 * L'ÉLIGIBILITÉ D'UNE VARIANTE S'ÉCRIT UNE SEULE FOIS, `CONDITION_ELIGIBLE`,
 * et sert à l'affichage comme à la commande : deux formulations finiraient
 * par diverger, et le client paierait un autre prix que celui affiché.
 *
 * Elle se juge à l'activation de la promotion, `p.active_depuis` : le prix
 * de la variante n'a pas changé pendant les trente jours qui précèdent.
 * L'horloge est celle de PostgreSQL, jamais celle de Node, `database.md`.
 *
 * L'ÂGE DE LA VARIANTE NE COMPTE PLUS, LS-321, arbitrage de Christophe du
 * 13 novembre 2026 : une pièce en vente depuis moins de trente jours est
 * réduite, son prix barré étant le prix pratiqué depuis sa mise en vente.
 * Risque juridique accepté, amendement d'ADR-051.
 */
import { Prisma } from "@/generated/prisma/client";
import { CLE_VERROU_PROMOTION, JOURS_PRIX_ANTERIEUR } from "@/lib/promotion";
import type { ClientBase as Client } from "@/repositories/stock";

/** `v` est la variante, `p` la promotion active. */
const CONDITION_ELIGIBLE = Prisma.sql`
  v.prix_centimes > 0
  AND NOT EXISTS (
    SELECT 1 FROM historique_prix_variante h
     WHERE h.variante_id = v.id
       AND h.modifie_a > p.active_depuis - make_interval(days => ${JOURS_PRIX_ANTERIEUR})
  )`;

/**
 * LE TAUX D'UNE DÉCLINAISON, LS-324, ADR-051 amendé : celui de son article
 * dans `promotion_produit` s'il y figure, le taux général de la promotion
 * sinon. Sous la portée `SELECTION`, le taux général est nul : un article non
 * choisi n'a donc aucun taux, et n'est pas réduit. UNE SEULE EXPRESSION, que
 * l'affichage et la commande emploient toutes deux, avec les alias `p`, `v`
 * et `pp` : deux écritures finiraient par ne plus désigner le même taux.
 */
const TAUX_VISE = Prisma.sql`coalesce(pp.taux_pourcentage, p.taux_pourcentage)`;

/** La jointure qui amène `pp`, le taux propre à l'article de `v`. */
const JOINTURE_ARTICLE = Prisma.sql`
  LEFT JOIN promotion_produit pp
    ON pp.promotion_id = p.id AND pp.produit_id = v.produit_id`;

export type PromotionActive = {
  id: string;
  code: string;
  portee: string;
  /** Le taux général, nul sous la portée `SELECTION`. */
  taux: number | null;
  activeDepuis: Date;
};

export async function lirePromotionActive(
  client: Client,
): Promise<PromotionActive | null> {
  const lignes = await client.$queryRaw<PromotionActive[]>`
    SELECT id, code, portee, taux_pourcentage AS taux,
           active_depuis AS "activeDepuis"
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
/**
 * Chaque déclinaison en vente, avec le taux que la promotion lui VISE et
 * celui qu'elle lui APPLIQUE. `tauxVise` est nul pour un article hors de la
 * promotion ; `taux` est nul de plus quand la pièce est visée mais exclue,
 * son prix ayant changé dans les trente jours.
 */
export async function lireEligibiliteCatalogue(
  client: Client,
  promotionId: string,
): Promise<
  {
    varianteId: string;
    produitId: string;
    tauxVise: number | null;
    taux: number | null;
  }[]
> {
  return client.$queryRaw`
    SELECT v.id AS "varianteId", v.produit_id AS "produitId",
           ${TAUX_VISE} AS "tauxVise",
           CASE WHEN ${CONDITION_ELIGIBLE} THEN ${TAUX_VISE} END AS taux
      FROM variante v
      JOIN produit pr ON pr.id = v.produit_id
      JOIN promotion p ON p.id = ${promotionId}
      ${JOINTURE_ARTICLE}
     WHERE v.archivee_a IS NULL
       AND pr.statut = 'ACTIF'`;
}

/**
 * La promotion active et le taux de chaque déclinaison demandée, lus en UNE
 * instruction dans la transaction de la commande, ADR-051 point 7 : la
 * commande n'a qu'une vérité de prix. Une déclinaison absente de `taux` se
 * vend au prix catalogue.
 */
export async function lirePromotionPourCommande(
  client: Client,
  varianteIds: readonly string[],
): Promise<{
  id: string;
  taux: { varianteId: string; taux: number }[];
} | null> {
  if (varianteIds.length === 0) return null;
  const lignes = await client.$queryRaw<
    { id: string; varianteId: string | null; taux: number | null }[]
  >`
    SELECT p.id, v.id AS "varianteId",
           CASE WHEN ${CONDITION_ELIGIBLE} THEN ${TAUX_VISE} END AS taux
      FROM promotion p
      LEFT JOIN variante v ON v.id IN (${Prisma.join([...varianteIds])})
      ${JOINTURE_ARTICLE}
     WHERE p.active`;
  const premiere = lignes[0];
  if (premiere === undefined) return null;
  return {
    id: premiere.id,
    taux: lignes.flatMap((ligne) =>
      ligne.varianteId !== null && ligne.taux !== null
        ? [{ varianteId: ligne.varianteId, taux: ligne.taux }]
        : [],
    ),
  };
}

/** Les articles d'une promotion et leur taux propre, pour l'administration. */
export async function lireArticlesPromotion(
  client: Client,
  promotionId: string,
): Promise<{ produitId: string; nom: string; taux: number }[]> {
  return client.$queryRaw`
    SELECT pp.produit_id AS "produitId", pr.nom, pp.taux_pourcentage AS taux
      FROM promotion_produit pp
      JOIN produit pr ON pr.id = pp.produit_id
     WHERE pp.promotion_id = ${promotionId}
     ORDER BY pr.nom`;
}

/**
 * Les articles que l'exploitante peut cocher : les produits en vente, par
 * catégorie puis par nom, avec leur prix le plus bas pour qu'elle juge le
 * taux sur un montant.
 */
export async function listerArticlesReductibles(client: Client): Promise<
  {
    produitId: string;
    nom: string;
    categorieId: string;
    categorieNom: string;
    prixMinimumCentimes: number;
  }[]
> {
  return client.$queryRaw`
    SELECT pr.id AS "produitId", pr.nom,
           c.id AS "categorieId", c.nom AS "categorieNom",
           min(v.prix_centimes)::int AS "prixMinimumCentimes"
      FROM produit pr
      JOIN categorie c ON c.id = pr.categorie_id
      JOIN variante v ON v.produit_id = pr.id AND v.archivee_a IS NULL
     WHERE pr.statut = 'ACTIF'
     GROUP BY pr.id, pr.nom, c.id, c.nom
     ORDER BY c.nom, pr.nom`;
}

/**
 * Écrit la promotion et le taux de chaque article choisi, dans la transaction
 * de l'appelant. Un article inconnu fait échouer la clé étrangère, donc la
 * transaction entière : aucune promotion à moitié écrite.
 */
export async function insererPromotion(
  client: Client,
  {
    code,
    portee,
    taux,
    articles,
    acteurId,
  }: {
    code: string;
    portee: "TOUT" | "SELECTION";
    taux: number | null;
    articles: readonly { produitId: string; taux: number }[];
    acteurId: string | null;
  },
): Promise<PromotionActive> {
  const lignes = await client.$queryRaw<PromotionActive[]>`
    INSERT INTO promotion (id, code, portee, taux_pourcentage, active, active_depuis, activee_par_id)
    VALUES (gen_random_uuid(), ${code}, ${portee}, ${taux}, true, now(), ${acteurId})
    RETURNING id, code, portee, taux_pourcentage AS taux,
              active_depuis AS "activeDepuis"`;
  const promotion = lignes[0]!;
  for (const article of articles) {
    await client.$executeRaw`
      INSERT INTO promotion_produit (promotion_id, produit_id, taux_pourcentage)
      VALUES (${promotion.id}, ${article.produitId}, ${article.taux})`;
  }
  return promotion;
}

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
