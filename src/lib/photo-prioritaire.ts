/**
 * Rang de la carte dont la photo se charge en priorité, LS-285.
 *
 * LA PREMIÈRE CARTE QUI A UNE PHOTO, et non la première carte : une pièce
 * publiée sans photo n'a rien à charger, et donner la priorité à son rang la
 * retirerait à la photographie réellement visible dans le premier écran, qui
 * porte le LCP du catalogue. `-1` quand aucune carte n'a de photo.
 */
export function rangPhotoPrioritaire(
  produits: readonly { mediaChemin: string | null }[],
): number {
  return produits.findIndex((produit) => produit.mediaChemin !== null);
}
