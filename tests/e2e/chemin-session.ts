/**
 * Ou vit l'etat de la session cliente partagee. LS-81, LS-89.
 *
 * UN MODULE A PART ET NON UNE CONSTANTE DANS LE FICHIER DE PREPARATION :
 * Playwright refuse qu'un fichier de test en importe un autre, « should not
 * import test file ». Les deux fichiers concernes etant des tests, le chemin
 * partage doit vivre dans un module qui n'en est pas un.
 *
 * IGNORE PAR GIT : cet etat porte un cookie de session valide, il est recree a
 * chaque execution et n'a aucune raison d'entrer dans un depot public,
 * invariant 9.
 */
export const FICHIER_SESSION = "tests/e2e/.session-cliente.json";
