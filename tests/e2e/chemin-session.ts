/**
 * Ou vivent les etats de session partages. LS-81, LS-89, LS-111.
 *
 * UN MODULE A PART ET NON UNE CONSTANTE DANS LE FICHIER DE PREPARATION :
 * Playwright refuse qu'un fichier de test en importe un autre, « should not
 * import test file ». Les deux fichiers concernes etant des tests, le chemin
 * partage doit vivre dans un module qui n'en est pas un.
 *
 * IGNORES PAR GIT : ces etats portent un cookie de session valide, ils sont
 * recrees a chaque execution et n'ont aucune raison d'entrer dans un depot
 * public, invariant 9.
 */
export const FICHIER_SESSION = "tests/e2e/.session-cliente.json";

/**
 * Session d'ADMINISTRATION, LS-111. Distincte de la precedente, et elles ne
 * peuvent pas fusionner : les fichiers qui verifient le refus d'un visiteur
 * ordinaire sur un ecran protege ont besoin d'une session SANS le role, et
 * promouvoir la session cliente les ferait passer pour la mauvaise raison.
 */
export const FICHIER_SESSION_ADMINISTRATION =
  "tests/e2e/.session-administration.json";

/**
 * Identifiants du produit de test rendu dans l'editeur, LS-111.
 *
 * FIGES ET NON ENGENDRES A CHAQUE EXECUTION. Le fichier de test doit construire
 * l'URL `/administration/produits/<id>` sans lire un artefact produit par la
 * preparation : un identifiant transmis par fichier ajouterait un second canal
 * a maintenir pour ne rien prouver de plus. La preparation reprend donc ces
 * valeurs a chaque execution, `ON CONFLICT` en tete.
 *
 * DE VRAIS UUID, piege connu du projet : `schemaIdentifiant` refuse une chaine
 * comme `e2e-produit-1`, et le refus « Un identifiant valide est attendu » se
 * prend d'abord pour un defaut du code.
 */
export const PRODUIT_TEST = {
  categorieId: "b7f1c4d2-3a56-4e88-9c01-7d2e5f8a1b30",
  produitId: "c8e2d5a3-4b67-4f99-8d12-6e3f4a9b2c41",
  varianteId: "d9f3e6b4-5c78-4a11-9e23-5f4a3b8c1d52",
  slug: "e2e-ls111-produit-de-controle",
  nom: "TEST Produit de contrôle LS-111",
} as const;
