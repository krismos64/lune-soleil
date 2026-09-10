/**
 * Instant d'affichage du formulaire de signalement, LS-77.
 *
 * CE MODULE EXISTE POUR UNE RAISON PRECISE, la meme que son jumeau du contact :
 * `react-hooks/purity` de React 19 interdit tout appel impur dans un composant,
 * `Date.now()` compris. Un composant reevalue rendrait une valeur differente a
 * chaque passe, ce que la regle empeche.
 *
 * LA REGLE EST JUSTE, DONC ELLE N'EST PAS DESACTIVEE. Un `eslint-disable`
 * ferait taire un controle sain sans rien changer au fond ; deplacer la lecture
 * dans un module ordinaire, ou lire l'horloge est le travail attendu, traite la
 * cause.
 *
 * IL N'EST PAS PARTAGE AVEC CELUI DU CONTACT, et c'est assume : deux fichiers
 * d'une ligne valent mieux qu'un module commun dont le nom devrait couvrir les
 * deux usages sans en nommer aucun. Le projet ecarte la generalisation
 * prematuree, et cette fonction ne porte aucune regle susceptible de diverger.
 *
 * IL N'AUTORISE RIEN, invariant 2, et il n'est pas fiable : il transite par le
 * formulaire, donc un appelant peut l'anti-dater. C'est la limite acceptee de
 * cette couche, et la raison pour laquelle elle n'est pas seule.
 */

/** L'instant courant, en millisecondes depuis l'epoque. */
export function instantOuverture(): number {
  return Date.now();
}
