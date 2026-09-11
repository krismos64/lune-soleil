/**
 * Traduction des refus de validation en messages affichables, LS-98.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN MODULE A PART ET NON LA SERVER ACTION.
 *
 * Un fichier `"use server"` ne peut exporter QUE des fonctions asynchrones :
 * Next.js refuse la construction avec « Server Actions must be async
 * functions ». Une fonction pure exportee depuis `actions.ts` casse donc le
 * build, mesure faite le 11 septembre 2026 plutot que supposee.
 *
 * LA RENDRE `async` POUR CONTENTER LA REGLE AURAIT ETE PIRE : elle serait
 * devenue une Server Action, donc un point d'entree HTTP appelable de
 * l'exterieur, pour une fonction qui n'a aucune garde et n'en a pas besoin.
 * ------------------------------------------------------------------
 *
 * ELLE EXISTE PARCE QUE LES MESSAGES DU SOCLE NE SONT PAS AFFICHABLES.
 * `formaterProblemes` prefixe par le chemin du champ, et les messages de
 * `validation.ts` sont ecrits sans accents :
 *
 *   emailAlertes : Une adresse email valide est attendue.
 *   seuilStockFaible : Une quantite doit etre strictement positive.
 *
 * L'exploitante lisait donc un nom de cle technique, « quantite » et « etre »
 * sans accents, et le mot « quantite » ne decrit meme pas un seuil d'alerte.
 * Releve par `ls-frontend-revue` le 11 septembre 2026.
 */

/** Les champs que l'ecran sait mettre en evidence. */
export type ChampParametres =
  | "tarifRelais"
  | "tarifDomicile"
  | "seuilFranchise"
  | "seuilStockFaible"
  | "emailAlertes";

/** Un refus de saisie, avec le message affichable et le champ concerne. */
export type RefusParametres = {
  message: string;
  /** `null` quand le refus porte sur la coherence de l'ensemble. */
  champ: ChampParametres | null;
};

/** Ce que chaque cle du schema Zod designe a l'ecran, avec son message. */
const CHAMPS_ZOD = [
  {
    cle: "emailAlertes",
    nom: "emailAlertes" as const,
    message: "Cette adresse email n'est pas valide.",
  },
  {
    cle: "seuilStockFaible",
    nom: "seuilStockFaible" as const,
    message:
      "Le seuil d'alerte doit être un nombre entier d'exemplaires, au moins 1.",
  },
  {
    cle: "tarifRelaisCentimes",
    nom: "tarifRelais" as const,
    message: "Ce tarif n'est pas acceptable.",
  },
  {
    cle: "tarifDomicileCentimes",
    nom: "tarifDomicile" as const,
    message: "Ce tarif n'est pas acceptable.",
  },
  {
    cle: "seuilFranchiseCentimes",
    nom: "seuilFranchise" as const,
    message: "Ce seuil n'est pas acceptable.",
  },
] as const;

/**
 * Traduit un message de Zod en refus affichable.
 *
 * FONCTION PURE, sans lecture ni ecriture : c'est ce qui la rend testable sans
 * requete, la Server Action qui l'appelle lisant `headers()`.
 */
export function refusLisible(messageBrut: string): RefusParametres {
  /*
   * LE SEPARATEUR EST « ` : ` », mesure sur `formaterProblemes` et non suppose :
   * une premiere version cherchait un simple espace et ne trouvait jamais le
   * champ, donc rendait le message generique sur tous les refus.
   *
   * `includes` ET NON `startsWith` : le message est prefixe par « Entree
   * invalide : », et plusieurs problemes se joignent par des virgules.
   */
  const champ = CHAMPS_ZOD.find((candidat) =>
    messageBrut.includes(`${candidat.cle} : `),
  );

  return {
    message:
      champ === undefined
        ? "Une valeur saisie n'est pas acceptée. Vérifiez les montants, le seuil d'alerte et l'adresse email."
        : champ.message,
    champ: champ?.nom ?? null,
  };
}
