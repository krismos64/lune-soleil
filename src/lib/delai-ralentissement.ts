/**
 * La règle de délai du ralentissement par compte visé. LS-83, ADR-021 mesure 2.
 *
 * CE MODULE N'IMPORTE RIEN DU PROJET, ET NE DOIT JAMAIS LE FAIRE. Même motif
 * que `issue-connexion.ts` et `mot-de-passe.ts` : la fonction est pure, et la
 * séparer de `services/ralentissement-compte.ts` permet de la tester sans base
 * de données.
 *
 * LE SERVICE, LUI, TIRE PRISMA, DONC `DATABASE_URL`. Un test unitaire qui
 * l'importerait exigerait une base pour vérifier une progression arithmétique,
 * et la suite unitaire du projet doit rester lançable sur une machine sans
 * Docker. Le défaut a été mesuré à l'écriture de LS-83 : le test échouait sur
 * « DATABASE_URL absente » avant d'avoir exécuté une seule assertion.
 *
 * CE QU'IL NE DÉCIDE PAS : quand ralentir, et qui. Il rend une durée pour un
 * nombre d'échecs, rien d'autre. Le compteur, la clé et la conduite à tenir
 * vivent dans le service.
 */

/**
 * Nombre d'échecs tolérés sans aucun délai.
 *
 * CINQ, ET C'EST GÉNÉREUX DÉLIBÉRÉMENT. Une personne qui se trompe de mot de
 * passe trois fois de suite est un cas ordinaire, pas une attaque : commencer à
 * ralentir dès la deuxième tentative punirait surtout le vrai propriétaire.
 */
const ECHECS_SANS_DELAI = 5;

/**
 * Délai maximum, en millisecondes.
 *
 * HUIT SECONDES, ET CE PLAFOND EST LA PROPRIÉTÉ QUI COMPTE. Un délai qui
 * doublerait sans fin deviendrait un blocage de fait, ce qu'ADR-027 écarte
 * nommément : au bout de vingt échecs, le vrai propriétaire attendrait des
 * heures, et « échouer volontairement sur l'adresse de quelqu'un verrouillerait
 * son compte ».
 *
 * HUIT SECONDES SUFFISENT À CASSER L'AUTOMATISATION. Une campagne qui espérait
 * mille essais par minute en obtient sept, et le coût devient prohibitif bien
 * avant d'épuiser un dictionnaire ; une personne qui vient de se tromper cinq
 * fois attend huit secondes, ce qui est désagréable et jamais bloquant.
 */
const DELAI_MAXIMUM_MS = 8_000;

/** Délai de base, doublé à chaque échec au-delà du seuil. */
const DELAI_BASE_MS = 500;

/**
 * Le délai à appliquer pour un nombre d'échecs donné, en millisecondes.
 *
 * CROISSANCE EXPONENTIELLE PUIS PLAFOND. Les cinq premiers échecs ne coûtent
 * rien, le sixième coûte une demi-seconde, et chaque suivant double jusqu'au
 * plafond de huit secondes, atteint au dixième.
 *
 * LE RETOUR ANTICIPÉ N'EST PAS UNE OPTIMISATION. Sans lui, un compte de 1
 * calculerait `2 ** -5`, soit un délai fractionnaire : la comparaison de seuil
 * est ce qui garde l'exposant positif.
 */
export function delaiPourEchecs(echecs: number): number {
  if (echecs <= ECHECS_SANS_DELAI) {
    return 0;
  }

  const exposant = echecs - ECHECS_SANS_DELAI - 1;
  const delai = DELAI_BASE_MS * 2 ** exposant;

  return Math.min(delai, DELAI_MAXIMUM_MS);
}
