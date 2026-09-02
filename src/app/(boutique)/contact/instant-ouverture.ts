/**
 * Instant d'affichage du formulaire de contact, LS-97.
 *
 * CE MODULE EXISTE POUR UNE RAISON PRECISE, et non par gout de la separation.
 * `react-hooks/purity` de React 19 interdit tout appel impur dans un composant,
 * `Date.now()` compris : un composant reevalue rendrait une valeur differente a
 * chaque passe, ce qui est exactement ce que la regle empeche.
 *
 * LA REGLE EST JUSTE, DONC ELLE N'EST PAS DESACTIVEE. Un commentaire
 * `eslint-disable` aurait fait taire un controle sain sans rien changer au
 * fond ; deplacer la lecture dans un module ordinaire, ou lire l'horloge est le
 * travail attendu, traite la cause.
 *
 * CE QUE CET INSTANT SERT : la deuxieme couche anti-robot. L'ecart entre lui et
 * la reception de la soumission donne le temps passe devant le formulaire, et
 * une soumission instantanee trahit un script qui poste sans afficher la page.
 *
 * IL N'AUTORISE RIEN, invariant 2, et il n'est pas fiable : il transite par le
 * formulaire, donc un appelant peut l'anti-dater. C'est la limite acceptee de
 * cette couche, et la raison pour laquelle elle n'est pas seule.
 */

/** L'instant courant, en millisecondes depuis l'epoque. */
export function instantOuverture(): number {
  return Date.now();
}
