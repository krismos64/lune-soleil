/**
 * Lecture des variantes d'un panier, LS-114.
 *
 * CE DEPOT NE FAIT QUE LIRE. Le panier n'ecrit rien en base : il vit dans un
 * cookie signe, aucune entite `Panier` n'existe au modele conceptuel, et c'est
 * un choix tenu et non un oubli. La reservation, seule ecriture du parcours,
 * appartient a LS-117 et LS-118.
 *
 * IL REND LE PRIX ET LA DISPONIBILITE ACTUELS, jamais ceux du cookie. C'est le
 * coeur de l'etape 3 du parcours 1 : « le navigateur n'est jamais source de
 * verite ».
 */
import { Prisma } from "@/generated/prisma/client";

import type { ClientBase } from "./catalogue";

/** Une variante telle que la revalidation du panier a besoin de la voir. */
export type VariantePanier = {
  varianteId: string;
  libelle: string;
  prixCentimes: number;
  quantiteDisponible: number;
  produitNom: string;
  produitSlug: string;
  mediaChemin: string | null;
  mediaTexteAlternatif: string | null;
  /** `false` si le produit n'est plus `ACTIF` ou la variante archivee. */
  vendable: boolean;
};

/**
 * Lit les variantes citees par un panier.
 *
 * REND AUSSI LES VARIANTES NON VENDABLES, avec `vendable: false`, plutot que de
 * les omettre. Une ligne omise disparaitrait du panier sans explication : le
 * critere 7 exige au contraire de la SIGNALER sur sa ligne, sans faire echouer
 * tout le panier. C'est l'ecran qui decide quoi en dire, pas cette requete.
 *
 * LA VARIANTE ARCHIVEE EST LUE ELLE AUSSI. Une variante disparait rarement, elle
 * s'archive : l'exclure ici rendrait le panier silencieusement plus court apres
 * un archivage, exactement le defaut que le critere 7 previent.
 */
export async function lireVariantesDuPanier(
  client: ClientBase,
  varianteIds: string[],
): Promise<VariantePanier[]> {
  if (varianteIds.length === 0) {
    /*
     * `IN ()` EST UNE ERREUR DE SYNTAXE EN SQL, et `Prisma.join` sur un tableau
     * vide leve. Le cas arrive a chaque visiteur dont le panier est vide : il
     * se traite ici plutot que chez chaque appelant.
     */
    return [];
  }

  const lignes = await client.$queryRaw<
    {
      varianteId: string;
      libelle: string;
      prixCentimes: number;
      quantiteDisponible: bigint | number;
      produitNom: string;
      produitSlug: string;
      mediaChemin: string | null;
      mediaTexteAlternatif: string | null;
      vendable: boolean;
    }[]
  >`
    SELECT
      v.id                 AS "varianteId",
      v.libelle,
      v.prix_centimes      AS "prixCentimes",
      CASE WHEN v.vente_web_activee AND v.archivee_a IS NULL
           THEN greatest(v.quantite_physique - v.quantite_reservee, 0)
           ELSE 0
      END                  AS "quantiteDisponible",
      p.nom                AS "produitNom",
      p.slug               AS "produitSlug",
      m.chemin             AS "mediaChemin",
      m.texte_alternatif   AS "mediaTexteAlternatif",
      (p.statut = 'ACTIF' AND v.archivee_a IS NULL) AS "vendable"
    FROM variante v
    JOIN produit p ON p.id = v.produit_id
    LEFT JOIN media m ON m.produit_id = p.id AND m.ordre = 1
    WHERE v.id IN (${Prisma.join(varianteIds)})
  `;

  /*
   * `greatest` DE POSTGRESQL REND DU `bigint`, que le pilote transmet en
   * `BigInt` JavaScript. Le laisser passer casserait la serialisation vers un
   * composant client et fausserait les comparaisons numeriques.
   */
  return lignes.map((ligne) => ({
    ...ligne,
    quantiteDisponible: Number(ligne.quantiteDisponible),
  }));
}
