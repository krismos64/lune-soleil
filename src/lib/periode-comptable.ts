/**
 * Traduction d'une periode lisible en deux instants, LS-184.
 *
 * POURQUOI CE MODULE EXISTE PLUTOT QU'UN CALCUL DANS LA PAGE. Le filtre est
 * serialise dans l'URL, donc sa valeur est une chaine venue de l'exterieur : la
 * traduire en dates est exactement le genre de code qui merite un test, et il
 * ne doit dependre ni de Prisma ni du rendu. Motif appris en LS-180, ou deux
 * fonctions pures prisonnieres d'un service reclamaient une `DATABASE_URL` pour
 * verifier un decoupage de chaine.
 *
 * LES BORNES SONT CALCULEES EN HEURE DE PARIS PUIS RENDUES EN UTC, invariant 8.
 * « Le mois de juillet » ne veut rien dire sans fuseau : un serveur en UTC
 * ferait commencer juillet a 2 h du matin le 1er juillet heure francaise, et la
 * facture emise a 00 h 30 ce jour-la tomberait dans le mois de juin.
 *
 * AUCUNE ARITHMETIQUE EN MILLISECONDES, meme regle que `lib/retractation.ts` :
 * ajouter « trente jours » en millisecondes derive d'une heure au passage a
 * l'heure d'hiver. Les bornes se posent par composants de date.
 */

/** Le fuseau de l'exploitante, et le seul qui ait un sens ici. */
const FUSEAU = "Europe/Paris";

/**
 * Les periodes proposees a l'ecran.
 *
 * ELLES SONT RELATIVES ET NON ABSOLUES, « ce mois-ci » plutot que « juillet
 * 2026 » : une liste d'annees et de mois grandirait sans fin et vieillirait
 * mal. Une periode absolue relevera d'un champ de saisie si le besoin apparait,
 * avec son propre arbitrage.
 */
export const PERIODES = [
  { valeur: "tout", libelle: "Tout" },
  { valeur: "mois", libelle: "Ce mois-ci" },
  { valeur: "mois-precedent", libelle: "Mois précédent" },
  { valeur: "annee", libelle: "Cette année" },
] as const;

export type ValeurPeriode = (typeof PERIODES)[number]["valeur"];

/**
 * La periode par defaut, NOMMEE plutot que `PERIODES[0]`.
 *
 * `noUncheckedIndexedAccess` rend `PERIODES[0]` potentiellement `undefined` aux
 * yeux du compilateur, et le contourner par un `!` cacherait la question.
 * Convention posee par LS-183.
 */
export const PERIODE_PAR_DEFAUT: ValeurPeriode = "tout";

/**
 * Reconnait la valeur venue de l'URL, ou rend celle par defaut.
 *
 * LA CHAINE DE L'URL N'ATTEINT JAMAIS LA REQUETE, invariant 7 : elle sert
 * uniquement a retrouver une entree de la table ci-dessus. Une valeur inconnue
 * ne produit ni erreur ni page vide, elle retombe sur « Tout » : un lien
 * partage avec un parametre perime doit montrer quelque chose.
 */
export function reconnaitrePeriode(valeur: string | undefined): ValeurPeriode {
  const trouvee = PERIODES.find((periode) => periode.valeur === valeur);

  return trouvee ? trouvee.valeur : PERIODE_PAR_DEFAUT;
}

/**
 * Les composants de date d'un instant, lus en heure de Paris.
 *
 * `Intl.DateTimeFormat` EST LE SEUL MOYEN FIABLE. `Date.getMonth()` lit le
 * fuseau du serveur, qui est UTC en production : en janvier a 00 h 30 heure
 * francaise, il rendrait encore decembre.
 */
function composantsAParis(instant: Date): {
  annee: number;
  mois: number;
  jour: number;
} {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const lire = (type: string): number =>
    Number(parties.find((partie) => partie.type === type)?.value ?? "0");

  return { annee: lire("year"), mois: lire("month"), jour: lire("day") };
}

/**
 * Le decalage du fuseau de Paris a un instant donne, en minutes.
 *
 * IL VAUT 60 OU 120 SELON LA SAISON, et le calculer plutot que de l'ecrire en
 * dur est ce qui rend juste une periode a cheval sur un changement d'heure.
 * La methode : formater l'instant en heure de Paris, le relire comme s'il etait
 * en UTC, et mesurer l'ecart.
 */
function decalageParis(instant: Date): number {
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const lire = (type: string): number =>
    Number(parties.find((partie) => partie.type === type)?.value ?? "0");

  const commeUtc = Date.UTC(
    lire("year"),
    lire("month") - 1,
    lire("day"),
    /*
     * `hour12: false` REND 24 A MINUIT sur certaines versions d'ICU, jamais 0.
     * Passer 24 a `Date.UTC` deborde silencieusement sur le jour suivant, ce
     * qui decalerait le calcul d'un jour entier une fois sur vingt-quatre.
     */
    lire("hour") % 24,
    lire("minute"),
    lire("second"),
  );

  return (commeUtc - instant.getTime()) / 60_000;
}

/**
 * Minuit heure de Paris pour une date civile donnee, rendu en UTC.
 *
 * LE DECALAGE EST MESURE DEUX FOIS, et ce n'est pas une precaution inutile. Le
 * premier calcul suppose un decalage, ce qui peut designer le mauvais cote d'un
 * changement d'heure ; le second le corrige avec le decalage reellement en
 * vigueur a l'instant obtenu. Sans cette reprise, le 27 octobre a 2 h du matin
 * tomberait une heure a cote.
 */
function minuitAParis(annee: number, mois: number, jour: number): Date {
  const naif = Date.UTC(annee, mois - 1, jour, 0, 0, 0);
  const premier = new Date(naif - decalageParis(new Date(naif)) * 60_000);

  return new Date(naif - decalageParis(premier) * 60_000);
}

/**
 * Les deux instants qui bornent une periode, ou rien pour « Tout ».
 *
 * LA BORNE HAUTE EST EXCLUSIVE DANS LE CALCUL et rendue INCLUSIVE d'une
 * milliseconde : le repository filtre en `lte`, et prendre minuit du jour
 * suivant en `lte` inclurait une facture emise exactement a minuit dans les
 * deux periodes voisines. Retirer une milliseconde ferme ce recouvrement.
 *
 * `maintenant` EST UN PARAMETRE, jamais `new Date()` lu au fond de la fonction :
 * c'est ce qui rend « ce mois-ci » testable sans attendre le mois prochain.
 */
export function bornesDePeriode(
  valeur: ValeurPeriode,
  maintenant: Date = new Date(),
): { depuis?: Date; jusqua?: Date } {
  if (valeur === "tout") {
    return {};
  }

  const { annee, mois } = composantsAParis(maintenant);

  if (valeur === "annee") {
    return {
      depuis: minuitAParis(annee, 1, 1),
      jusqua: new Date(minuitAParis(annee + 1, 1, 1).getTime() - 1),
    };
  }

  if (valeur === "mois") {
    return {
      depuis: minuitAParis(annee, mois, 1),
      jusqua: new Date(minuitAParis(annee, mois + 1, 1).getTime() - 1),
    };
  }

  /*
   * LE MOIS PRECEDENT, ET `Date.UTC` GERE LE PASSAGE D'ANNEE. Janvier moins un
   * donne le mois zero, que `Date.UTC` interprete comme decembre de l'annee
   * precedente : ecrire la condition a la main ici serait une occasion de
   * l'oublier.
   */
  return {
    depuis: minuitAParis(annee, mois - 1, 1),
    jusqua: new Date(minuitAParis(annee, mois, 1).getTime() - 1),
  };
}
