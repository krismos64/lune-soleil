/**
 * Formatage des montants pour l'affichage, LS-158.
 *
 * SEUL ENDROIT DU DEPOT OU DES CENTIMES DEVIENNENT DES EUROS. Invariant 1 : la
 * division par cent est un affichage et rien d'autre, aucun calcul ne repart
 * d'une sortie de ce module, et tout montant qui s'additionne, se compare ou
 * s'ecrit reste en centimes entiers.
 *
 * Ce module a remplace huit copies identiques dispersees dans les ecrans, sous
 * trois noms differents : une divergence future entre copies aurait touche du
 * code monetaire, la ou elle coute le plus cher. Aucun import, pour rester
 * servable au navigateur comme au rendu PDF.
 */

/**
 * Montant en euros a partir de centimes entiers, pour l'affichage.
 *
 * Promue de l'ecran des commandes, qui portait le commentaire de reference :
 * la division ne quitte jamais cette fonction.
 */
export function formaterMontant(centimes: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(centimes / 100);
}

/**
 * Centimes vers euros pour la VALEUR d'un champ de saisie, virgule francaise.
 *
 * Distincte de `formaterMontant` : un champ de saisie ne porte ni symbole ni
 * espace insecable, et la virgule est celle que `variante-validation.ts`
 * accepte au retour. Deux ecrans d'administration en portaient chacun une
 * copie.
 */
export function centimesVersSaisie(centimes: number): string {
  return (centimes / 100).toFixed(2).replace(".", ",");
}
