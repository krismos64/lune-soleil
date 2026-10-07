/**
 * Chargeurs de libvips bloqués pour tout le processus, LS-276.
 *
 * LE SVG ET LE PDF N'ONT RIEN À FAIRE DANS LE DÉCODEUR D'IMAGES. Une
 * photographie de bijou est un JPEG, un PNG, un WebP ou un HEIC ; un SVG est
 * un document analysé par `librsvg`, chemin de GHSA-wq5f-xc86-pv6w (LS-274).
 * La détection par signature de `traitement.ts` reste la première ligne, mais
 * elle ne lit que les 1024 premiers octets : un SVG précédé d'un long
 * commentaire la franchissait, mesuré le 7 octobre 2026 sur `sharp` 0.35.5,
 * et `librsvg` le décodait avant que le contrôle d'après coup ne le refuse.
 *
 * LE BLOCAGE VAUT POUR TOUT LE PROCESSUS, car il porte sur l'état de libvips
 * et non sur une instance de `sharp` : il couvre le téléversement ET
 * l'optimiseur de `next/image`, qui partage la même bibliothèque native. Il est
 * posé au démarrage du serveur par `instrumentation.ts`, avant toute requête,
 * et de nouveau au chargement de `traitement.ts` pour les scripts et les tests
 * qui n'y passent pas.
 *
 * LES NOMS SONT CEUX DES CLASSES PARENTES de libvips : bloquer
 * `VipsForeignLoadSvg` bloque ses variantes fichier, mémoire et flux. Le
 * chargeur PDF n'est pas compilé dans la libvips livrée avec `sharp` ; le
 * bloquer ne coûte rien et tient si une libvips système le portait un jour.
 * Un nom inconnu ne lève pas d'erreur, vérifié sur 0.35.5.
 */
import sharp from "sharp";

export const CHARGEURS_BLOQUES = [
  "VipsForeignLoadSvg",
  "VipsForeignLoadPdf",
] as const;

let bloques = false;

/** Bloque les chargeurs SVG et PDF de libvips. Sans effet au second appel. */
export function bloquerChargeursRisques(): void {
  if (bloques) return;
  sharp.block({ operation: [...CHARGEURS_BLOQUES] });
  bloques = true;
}
