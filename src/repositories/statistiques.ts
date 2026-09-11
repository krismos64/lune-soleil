/**
 * Agrégats de l'activité, ventes web et marchés confondus. LS-64.
 *
 * `docs/architecture/STATISTIQUES.md` EST LA SOURCE DE VÉRITÉ de ce fichier, et
 * les règles qui suivent y sont détaillées. Elles ne sont pas recopiées ici,
 * seules leurs conséquences sur le SQL le sont.
 *
 * TROIS PROPRIÉTÉS TIENNENT ENSEMBLE, ET AUCUNE NE SE RELÂCHE.
 *
 * LE FUSEAU EST DANS LA REQUÊTE, JAMAIS UN DÉCALAGE FIXE. Les horodatages sont
 * persistés en UTC, invariant 8. En heure d'été, minuit à Paris vaut 22 h UTC
 * la veille : une vente conclue le 3 juillet à 00 h 30 heure française est
 * stockée au 2 juillet 22 h 30 UTC, et un regroupement fait en UTC la rangerait
 * au 2 juillet. Un décalage de une ou deux heures écrit en dur deviendrait faux
 * la moitié de l'année.
 *
 * AUCUN CALCUL NE LIT `Variante.prixCentimes`, règle S13. C'est le prix ACTUEL
 * du catalogue : l'employer pour reconstituer une vente passée produirait un
 * chiffre d'affaires qui change quand l'exploitante révise ses prix. Tout part
 * des copies figées, `LigneCommande.prixFigeCentimes` côté web et
 * `MouvementStock.prixUnitaireFigeCentimes` côté marché, invariant 3.
 *
 * AUCUN FLOTTANT, invariant 1. Les sommes restent en centimes entiers, et le
 * seul quotient de ce fichier, le panier moyen, se fait en division ENTIÈRE :
 * l'arrondi appartient à l'affichage, jamais au calcul.
 *
 * `bigint` PARTOUT EN SORTIE DE `count` ET `sum`, converti explicitement. Le
 * pilote PostgreSQL rend un `BigInt` pour ces agrégats, et le passer tel quel à
 * du code qui attend un nombre produit une exception à la première opération
 * arithmétique.
 */
import type { ModeLivraison } from "@/generated/prisma/client";
import type { ClientBase } from "@/repositories/stock";

/**
 * Bornes d'une période, déjà résolues en instants UTC par l'appelant.
 *
 * ELLES SONT INCLUSIVE À GAUCHE, EXCLUSIVE À DROITE. Une vente conclue
 * exactement à minuit appartient au jour qui commence, et aucune vente n'est
 * comptée deux fois sur deux périodes contiguës.
 */
export type Periode = {
  debut: Date;
  fin: Date;
};

/** Les montants d'une période, en centimes entiers. */
export type MontantsPeriode = {
  /** Paiements encaissés dont la confirmation tombe dans la période. */
  brutWebCentimes: number;
  /** Ventes de marché saisies dans la période, et leurs compensations. */
  brutExterneCentimes: number;
  /** Avoirs ÉMIS dans la période, quelle que soit la date de la vente. */
  remboursementsCentimes: number;
  /** Commandes dont le paiement a été confirmé dans la période. */
  commandesPayees: number;
  /** Frais de port des commandes payées, comptés DANS le brut. */
  fraisPortCentimes: number;
  /** Bijoux vendus, web et marchés confondus. */
  bijouxVendus: number;
};

/**
 * Les montants d'une période, en une seule requête.
 *
 * UNE REQUÊTE ET NON SIX, et ce n'est pas une optimisation prématurée : six
 * requêtes séparées liraient la base à six instants différents, et une vente
 * confirmée entre la première et la dernière apparaîtrait dans un agrégat sans
 * l'autre. Le brut ne correspondrait plus au nombre de commandes.
 *
 * `confirmeA` EST LE FAIT GÉNÉRATEUR, jamais `Commande.creeA`, arbitrage de
 * LS-76. Les deux diffèrent de quelques minutes sur le chemin nominal et de
 * plus d'une heure quand la réconciliation régularise une commande : l'écart
 * peut franchir un minuit, donc changer le jour d'imputation.
 *
 * LES TROIS ÉTATS D'ENCAISSEMENT COMPTENT, `REUSSI`, `PARTIELLEMENT_REMBOURSE`
 * et `REMBOURSE`. Un remboursement COMPENSE l'encaissement, il ne l'efface pas :
 * exclure les paiements remboursés ferait disparaître une vente du mois où elle
 * a eu lieu, et le brut cesserait de répondre à « combien ai-je encaissé ».
 *
 * LE BRUT N'EST JAMAIS DIMINUÉ DES REMBOURSEMENTS. Ils sont rendus à part, et
 * l'appelant calcule le net. Les fondre rendrait impossible la question à
 * laquelle l'e-reporting de LS-35 devra répondre.
 *
 * LA VENTE EXTERNE EST DATÉE PAR `MouvementStock.creeA`, la saisie se faisant
 * sur le stand ou le soir même.
 *
 * `abs(quantite)` PARCE QUE LE SIGNE PORTE LE SENS DU MOUVEMENT. Une vente
 * externe sort du stock, donc sa quantité est négative : la sommer telle quelle
 * rendrait un chiffre d'affaires négatif.
 */
export async function lireMontants(
  client: ClientBase,
  periode: Periode,
): Promise<MontantsPeriode> {
  const [ligne] = await client.$queryRaw<
    {
      brutWebCentimes: bigint | null;
      brutExterneCentimes: bigint | null;
      remboursementsCentimes: bigint | null;
      commandesPayees: bigint;
      fraisPortCentimes: bigint | null;
      bijouxVendusWeb: bigint | null;
      bijouxVendusExterne: bigint | null;
    }[]
  >`
    SELECT
      (SELECT coalesce(sum(montant_centimes), 0)
         FROM paiement
        WHERE statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
          AND confirme_a >= ${periode.debut}
          AND confirme_a <  ${periode.fin})        AS "brutWebCentimes",

      -- LA VENTE EXTERNE ET SA COMPENSATION SE SOMMENT ENSEMBLE, S14 et
      -- ADR-030. Une correction saisie diminue le brut de la période OÙ ELLE
      -- EST SAISIE, jamais celle de la vente : une période close ne se rouvre
      -- pas. Le signe de « quantite » porte déjà ce sens, d'où le produit signé
      -- ici et le signe oppose plus bas pour le COMPTE de bijoux.
      (SELECT coalesce(sum(-quantite * prix_unitaire_fige_centimes), 0)
         FROM mouvement_stock
        WHERE type = 'VENTE_EXTERNE'
          AND prix_unitaire_fige_centimes IS NOT NULL
          AND cree_a >= ${periode.debut}
          AND cree_a <  ${periode.fin})            AS "brutExterneCentimes",

      -- L'AVOIR EST IMPUTÉ À SA DATE D'ÉMISSION, jamais à celle de la vente.
      -- Une vente du 28 juin remboursée le 4 juillet compte en juillet : imputer
      -- à la vente changerait rétroactivement un montant déjà consulté, et dès
      -- septembre 2027 déjà transmis à l'administration.
      (SELECT coalesce(sum(montant_centimes), 0)
         FROM avoir
        WHERE emis_a >= ${periode.debut}
          AND emis_a <  ${periode.fin})            AS "remboursementsCentimes",

      (SELECT count(DISTINCT commande_id)
         FROM paiement
        WHERE statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
          AND confirme_a >= ${periode.debut}
          AND confirme_a <  ${periode.fin})        AS "commandesPayees",

      (SELECT coalesce(sum(c.frais_port_centimes), 0)
         FROM commande c
        WHERE EXISTS (
                SELECT 1 FROM paiement p
                 WHERE p.commande_id = c.id
                   AND p.statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
                   AND p.confirme_a >= ${periode.debut}
                   AND p.confirme_a <  ${periode.fin}))
                                                   AS "fraisPortCentimes",

      (SELECT coalesce(sum(l.quantite), 0)
         FROM ligne_commande l
        WHERE EXISTS (
                SELECT 1 FROM paiement p
                 WHERE p.commande_id = l.commande_id
                   AND p.statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
                   AND p.confirme_a >= ${periode.debut}
                   AND p.confirme_a <  ${periode.fin}))
                                                   AS "bijouxVendusWeb",

      (SELECT coalesce(sum(-quantite), 0)
         FROM mouvement_stock
        WHERE type = 'VENTE_EXTERNE'
          AND cree_a >= ${periode.debut}
          AND cree_a <  ${periode.fin})            AS "bijouxVendusExterne"
  `;

  /*
   * UNE REQUÊTE D'AGRÉGATS SANS `FROM` REND TOUJOURS UNE LIGNE, et pourtant ce
   * cas se traite. TypeScript a raison de le signaler : l'index d'un tableau
   * n'est pas garanti par son type. Lever plutôt que rendre des zéros, car des
   * zéros seraient indiscernables d'une période sans activité et l'écran
   * annoncerait « aucune vente » sur une base injoignable.
   */
  if (!ligne) {
    throw new Error("Statistiques : la requête n'a rendu aucune ligne");
  }

  return {
    brutWebCentimes: Number(ligne.brutWebCentimes ?? 0),
    brutExterneCentimes: Number(ligne.brutExterneCentimes ?? 0),
    remboursementsCentimes: Number(ligne.remboursementsCentimes ?? 0),
    commandesPayees: Number(ligne.commandesPayees),
    fraisPortCentimes: Number(ligne.fraisPortCentimes ?? 0),
    bijouxVendus:
      Number(ligne.bijouxVendusWeb ?? 0) +
      Number(ligne.bijouxVendusExterne ?? 0),
  };
}

/** Un point de la courbe d'évolution, une journée locale. */
export type PointEvolution = {
  /** Jour local en `AAAA-MM-JJ`, déjà converti en `Europe/Paris`. */
  jour: string;
  brutCentimes: number;
  remboursementsCentimes: number;
};

/**
 * L'évolution jour par jour, en heure de Paris.
 *
 * `AT TIME ZONE 'Europe/Paris'` FAIT TOUT LE TRAVAIL, et c'est la seule façon
 * juste. Un `date_trunc('day', confirme_a)` regrouperait en UTC : une vente du
 * 3 juillet à 00 h 30 heure française tomberait au 2 juillet, et le total du
 * jour serait faux pour l'exploitante comme pour l'e-reporting de LS-35.
 *
 * ELLE REND DES JOURS SANS VENTE, `generate_series` produisant la grille. Sans
 * elle, une courbe sauterait les jours vides et un creux de trois jours se
 * lirait comme une continuité.
 *
 * LES DEUX MONTANTS SONT RENDUS SÉPARÉMENT, jamais un net déjà calculé. Le net
 * peut être NÉGATIF sur un mois à faible activité, et c'est la réalité
 * comptable : l'appelant le calcule et l'affiche tel quel, sans le borner.
 */
export async function lireEvolutionQuotidienne(
  client: ClientBase,
  periode: Periode,
): Promise<PointEvolution[]> {
  const lignes = await client.$queryRaw<
    {
      jour: string;
      brutCentimes: bigint | null;
      remboursementsCentimes: bigint | null;
    }[]
  >`
    WITH jours AS (
      SELECT generate_series(
               (${periode.debut} AT TIME ZONE 'Europe/Paris')::date,
               (${periode.fin} AT TIME ZONE 'Europe/Paris')::date - 1,
               interval '1 day'
             )::date AS jour
    )
    SELECT
      to_char(j.jour, 'YYYY-MM-DD') AS jour,
      (SELECT coalesce(sum(p.montant_centimes), 0)
         FROM paiement p
        WHERE p.statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
          AND (p.confirme_a AT TIME ZONE 'Europe/Paris')::date = j.jour)
        + (SELECT coalesce(sum(-m.quantite * m.prix_unitaire_fige_centimes), 0)
             FROM mouvement_stock m
            WHERE m.type = 'VENTE_EXTERNE'
              AND m.prix_unitaire_fige_centimes IS NOT NULL
              AND (m.cree_a AT TIME ZONE 'Europe/Paris')::date = j.jour)
                                    AS "brutCentimes",
      (SELECT coalesce(sum(a.montant_centimes), 0)
         FROM avoir a
        WHERE (a.emis_a AT TIME ZONE 'Europe/Paris')::date = j.jour)
                                    AS "remboursementsCentimes"
    FROM jours j
    ORDER BY j.jour
  `;

  return lignes.map((ligne) => ({
    jour: ligne.jour,
    brutCentimes: Number(ligne.brutCentimes ?? 0),
    remboursementsCentimes: Number(ligne.remboursementsCentimes ?? 0),
  }));
}

/** Une variante et ce qu'elle a vendu sur la période. */
export type VenteParVariante = {
  varianteId: string;
  libelleProduit: string;
  libelleVariante: string;
  quantite: number;
};

/**
 * Les variantes les plus vendues, web et marchés confondus.
 *
 * LE REGROUPEMENT SE FAIT PAR `varianteId` ET JAMAIS PAR `referenceFigee`,
 * décision G : une référence peut théoriquement changer, et deux ventes de la
 * même pièce se retrouveraient sur deux lignes.
 *
 * LES LIBELLÉS VIENNENT DU CATALOGUE ACTUEL, ET C'EST VOULU ICI. Cette liste
 * sert à DÉCIDER quoi refabriquer : l'exploitante doit y lire le nom qu'elle
 * emploie aujourd'hui. Les MONTANTS, eux, restent figés, règle S13 : c'est la
 * distinction entre identifier une pièce et reconstituer une vente.
 *
 * UNE VARIANTE SUPPRIMÉE N'EXISTE PAS, une variante ARCHIVÉE reste jointe : la
 * jointure interne ne perd donc aucune vente, et le libellé survit à
 * l'archivage.
 */
export async function lireMeilleuresVentes(
  client: ClientBase,
  periode: Periode,
  limite: number,
): Promise<VenteParVariante[]> {
  const lignes = await client.$queryRaw<
    {
      varianteId: string;
      libelleProduit: string;
      libelleVariante: string;
      quantite: bigint;
    }[]
  >`
    WITH ventes AS (
      SELECT l.variante_id, sum(l.quantite) AS quantite
        FROM ligne_commande l
       WHERE l.variante_id IS NOT NULL
         AND EXISTS (
               SELECT 1 FROM paiement p
                WHERE p.commande_id = l.commande_id
                  AND p.statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
                  AND p.confirme_a >= ${periode.debut}
                  AND p.confirme_a <  ${periode.fin})
       GROUP BY l.variante_id

      UNION ALL

      SELECT m.variante_id, sum(-m.quantite) AS quantite
        FROM mouvement_stock m
       WHERE m.type = 'VENTE_EXTERNE'
         AND m.cree_a >= ${periode.debut}
         AND m.cree_a <  ${periode.fin}
       GROUP BY m.variante_id
    )
    SELECT
      v.variante_id                       AS "varianteId",
      pr.nom                              AS "libelleProduit",
      va.libelle                          AS "libelleVariante",
      sum(v.quantite)::bigint             AS quantite
      FROM ventes v
      JOIN variante va ON va.id = v.variante_id
      JOIN produit  pr ON pr.id = va.produit_id
     GROUP BY v.variante_id, pr.nom, va.libelle
     HAVING sum(v.quantite) > 0
     ORDER BY sum(v.quantite) DESC, pr.nom ASC
     LIMIT ${limite}
  `;

  return lignes.map((ligne) => ({
    varianteId: ligne.varianteId,
    libelleProduit: ligne.libelleProduit,
    libelleVariante: ligne.libelleVariante,
    quantite: Number(ligne.quantite),
  }));
}

/** Une variante non archivée qu'aucune vente n'a jamais touchée. */
export type VarianteInvendue = {
  varianteId: string;
  libelleProduit: string;
  libelleVariante: string;
};

/**
 * Les variantes jamais vendues, toutes périodes confondues.
 *
 * ELLE NE PREND AUCUNE PÉRIODE, ET CE N'EST PAS UN OUBLI. « Jamais vendue »
 * est une propriété absolue : la borner à un mois ferait apparaître comme
 * invendue une pièce vendue le mois précédent, ce qui inviterait à agir sur une
 * pièce qui se vend.
 *
 * SEULES LES VARIANTES NON ARCHIVÉES COMPTENT. Une variante archivée est sortie
 * du catalogue : la faire figurer dans une liste d'invendus proposerait d'agir
 * sur une pièce qui n'existe plus à la vente.
 *
 * L'ANTI-JOINTURE PORTE SUR LES DEUX CANAUX. Ne regarder que les lignes de
 * commande présenterait comme invendue une pièce écoulée sur un marché, ce qui
 * est le cas le plus courant au démarrage de cette boutique.
 */
export async function lireVariantesInvendues(
  client: ClientBase,
  limite: number,
): Promise<VarianteInvendue[]> {
  const lignes = await client.$queryRaw<
    {
      varianteId: string;
      libelleProduit: string;
      libelleVariante: string;
    }[]
  >`
    SELECT
      va.id      AS "varianteId",
      pr.nom     AS "libelleProduit",
      va.libelle AS "libelleVariante"
      FROM variante va
      JOIN produit pr ON pr.id = va.produit_id
     WHERE va.archivee_a IS NULL
       AND NOT EXISTS (
             SELECT 1
               FROM ligne_commande l
               JOIN paiement p ON p.commande_id = l.commande_id
              WHERE l.variante_id = va.id
                AND p.statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE'))
       AND NOT EXISTS (
             SELECT 1
               FROM mouvement_stock m
              WHERE m.variante_id = va.id
                AND m.type = 'VENTE_EXTERNE')
     ORDER BY pr.nom ASC, va.libelle ASC
     LIMIT ${limite}
  `;

  return lignes;
}

/** La part d'un mode de livraison sur la période. */
export type PartModeLivraison = {
  mode: ModeLivraison;
  commandes: number;
};

/**
 * La répartition des modes de livraison des commandes payées.
 *
 * ELLE LIT `Commande.modeLivraison`, CE QUI A ÉTÉ PAYÉ, et non
 * `Expedition.mode`, ce qui a été exécuté. Les deux diffèrent quand un domicile
 * est rebasculé vers un point relais, ADR-025 : la statistique commerciale porte
 * sur le choix du client, pas sur l'aléa du transporteur.
 */
export async function lireRepartitionLivraison(
  client: ClientBase,
  periode: Periode,
): Promise<PartModeLivraison[]> {
  const lignes = await client.$queryRaw<
    { mode: ModeLivraison; commandes: bigint }[]
  >`
    SELECT c.mode_livraison AS mode, count(*)::bigint AS commandes
      FROM commande c
     WHERE EXISTS (
             SELECT 1 FROM paiement p
              WHERE p.commande_id = c.id
                AND p.statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE', 'REMBOURSE')
                AND p.confirme_a >= ${periode.debut}
                AND p.confirme_a <  ${periode.fin})
     GROUP BY c.mode_livraison
     ORDER BY count(*) DESC
  `;

  return lignes.map((ligne) => ({
    mode: ligne.mode,
    commandes: Number(ligne.commandes),
  }));
}
