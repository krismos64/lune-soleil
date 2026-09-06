/**
 * Les declinaisons produites pour une photographie, ADR-007.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE MODULE EST SEPARE DE `traitement.ts`, LS-187.
 *
 * Ces constantes decrivent CE QUI EXISTE sur le disque : quatre largeurs, leurs
 * formats, et les onze noms de fichiers qui en decoulent. Elles sont pures, sans
 * aucune dependance.
 *
 * `traitement.ts` importe `sharp`, qui est un binaire natif : tout module qui le
 * touche devient serveur seulement. `lignes-panier.tsx` est un composant CLIENT
 * et construit des URL de vignette, donc il a besoin de ces constantes sans
 * pouvoir toucher sharp.
 *
 * MESURE DU 6 SEPTEMBRE 2026 : lire ces constantes depuis `traitement.ts` dans
 * un module employe cote client fait echouer la construction, Turbopack ne
 * resolvant pas `child_process` pour le navigateur.
 *
 *   Module not found: Can't resolve 'child_process'
 *     ./node_modules/detect-libc/lib/detect-libc.js [Client Component Browser]
 *     ./node_modules/sharp/dist/index.mjs [Client Component Browser]
 *
 * LE DEFAUT EST FRANC, ET C'EST UNE CHANCE : la construction echoue plutot que
 * d'embarquer un binaire natif dans le bundle du navigateur.
 * ------------------------------------------------------------------
 */

/**
 * Largeurs servies, ADR-007. L'ordre croissant est significatif.
 *
 * ELLES NE SE RATTRAPENT PAS. L'original etant supprime apres traitement,
 * ajouter une largeur plus tard obligerait a redemander les photographies a
 * l'exploitante. C'est la contrepartie assumee de la suppression de l'original,
 * et la raison pour laquelle 1920 px entre des maintenant : une fiche produit
 * affiche l'image sur 600 a 700 px CSS, soit environ 1400 px physiques sur un
 * ecran a densite double.
 */
export const LARGEURS_SERVIES = [320, 640, 1280, 1920] as const;

export type Format = "avif" | "webp" | "jpeg";

/**
 * Formats produits par largeur, ADR-007.
 *
 * LE JPEG S'ARRETE A 1280 px. Il n'est qu'un filet de securite, et son poids
 * croit vite : un navigateur qui ignore AVIF et WebP ignore aussi les ecrans a
 * haute densite, donc n'a que faire d'une image de 1920 px.
 */
export const FORMATS_PAR_LARGEUR: Record<number, readonly Format[]> = {
  320: ["avif", "webp", "jpeg"],
  640: ["avif", "webp", "jpeg"],
  1280: ["avif", "webp", "jpeg"],
  1920: ["avif", "webp"],
};

/** Les onze noms de fichiers attendus, pour les tests et les contrôles. */
export function declinaisonsAttendues(): string[] {
  return LARGEURS_SERVIES.flatMap((largeur) =>
    (FORMATS_PAR_LARGEUR[largeur] ?? []).map(
      (format) => `${largeur}.${format}`,
    ),
  );
}
