/**
 * Calcul du delai de retractation, LS-133. Socle du parcours 5.
 *
 * SOURCE UNIQUE DU CALCUL. Le delai sert a trois endroits qui doivent toujours
 * concorder : l'echeance affichee au client, l'acceptation d'une demande et le
 * refus d'une demande hors delai. Trois implementations produiraient un ecran
 * qui annonce une date et un service qui en applique une autre, et c'est
 * l'ecran qui engage : l'article L221-20 sanctionne l'information incorrecte
 * sur le droit de retractation par un delai porte a DOUZE MOIS.
 *
 * LE CALCUL N'EST PAS UN AJOUT DE QUATORZE JOURS, article L221-19, verifie sur
 * Legifrance le 3 septembre 2026, trois regles cumulatives :
 *
 *   1. le jour de reception du bien n'est pas compte
 *   2. le delai court de la premiere heure du premier jour a la derniere heure
 *      du dernier jour
 *   3. une echeance tombant un samedi, un dimanche ou un jour ferie ou chome
 *      est prorogee jusqu'au premier jour ouvrable suivant
 *
 * LA PROROGATION EST ITERATIVE et non un decalage d'un jour : un 25 decembre
 * vendredi est suivi d'un samedi et d'un dimanche, et l'echeance saute au lundi.
 *
 * AUCUNE ARITHMETIQUE EN MILLISECONDES. Ajouter quatorze fois 86 400 000 derive
 * d'une heure au passage a l'heure d'hiver et peut changer de jour civil. Les
 * jours s'ajoutent sur une date civile, ou un jour est un jour par definition.
 *
 * LE POINT DE DEPART EST LA RECEPTION, jamais l'expedition, article L221-18 :
 * l'expedition precede la reception, et un delai parti de l'expedition eteint
 * le droit du client trop tot. Ce module ne lit aucune base : il recoit la ou
 * les dates de reception, leur origine appartient a LS-131.
 */

/** Duree legale, article L221-18. */
export const DUREE_RETRACTATION_JOURS = 14;

/**
 * Fuseau metier, comme `STATISTIQUES.md` le pose pour les periodes.
 *
 * EXPLICITE ET NON DEDUIT DU SERVEUR : un conteneur en UTC daterait sinon une
 * reception de 00h30 heure francaise au jour precedent, et rendrait une
 * echeance trop precoce d'un jour.
 */
const FUSEAU_METIER = "Europe/Paris";

/** Date civile au format `AAAA-MM-JJ`, sans heure ni fuseau. */
export type JourCivil = string;

/** Ce que le calcul rend, un jour lisible et un instant comparable. */
export type EcheanceRetractation = {
  /** Jour civil parisien du dernier jour utile, `AAAA-MM-JJ`. */
  jourLimite: JourCivil;
  /**
   * Premier instant HORS delai, en UTC.
   *
   * BORNE EXCLUSIVE, comme les periodes de `STATISTIQUES.md` : une demande est
   * dans les temps tant que `maintenant < finInclusive`. Nommer la borne par ce
   * qu'elle inclut evite le hors-par-un de `<=` sur une milliseconde.
   */
  finInclusive: Date;
  /** Jour civil de reception retenu, utile pour tracer un refus. */
  jourReception: JourCivil;
};

/**
 * Date de reception invalide ou absente.
 *
 * UNE CLASSE DEDIEE ET NON UNE `Error` NUE, comme `livraison.ts` : sans date de
 * reception il n'y a pas d'echeance, et l'appelant doit pouvoir distinguer ce
 * cas d'une panne. Il ne se corrige pas par un rejeu.
 */
export class DateReceptionInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateReceptionInvalideError";
  }
}

/**
 * Formateur du jour civil parisien.
 *
 * `en-CA` REND NATIVEMENT `AAAA-MM-JJ`, ce qui evite de reassembler les parties
 * a la main. Le formateur est construit une fois, sa creation etant couteuse.
 */
const FORMATEUR_JOUR_PARIS = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSEAU_METIER,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Le jour civil parisien auquel un instant appartient. */
function jourCivilParisien(instant: Date): JourCivil {
  return FORMATEUR_JOUR_PARIS.format(instant);
}

/** Decompose un jour civil, sans passer par `Date` ni son fuseau. */
function partiesDuJour(jour: JourCivil): {
  annee: number;
  mois: number;
  quantieme: number;
} {
  const [annee, mois, quantieme] = jour.split("-").map(Number);
  return { annee, mois, quantieme };
}

/** Recompose un jour civil depuis ses parties. */
function versJourCivil(annee: number, mois: number, quantieme: number): JourCivil {
  const mm = String(mois).padStart(2, "0");
  const jj = String(quantieme).padStart(2, "0");
  return `${annee}-${mm}-${jj}`;
}

/**
 * Ajoute des jours a une date civile, sans fuseau.
 *
 * `Date.UTC` EST ICI UN SIMPLE CALENDRIER, pas un instant : on n'y lit que la
 * date, jamais l'heure. C'est ce qui rend l'operation insensible aux passages a
 * l'heure d'ete comme d'hiver, un jour valant toujours un jour.
 */
function ajouterJours(jour: JourCivil, nombre: number): JourCivil {
  const { annee, mois, quantieme } = partiesDuJour(jour);
  const calendrier = new Date(Date.UTC(annee, mois - 1, quantieme + nombre));
  return versJourCivil(
    calendrier.getUTCFullYear(),
    calendrier.getUTCMonth() + 1,
    calendrier.getUTCDate(),
  );
}

/** Jour de la semaine d'une date civile, 0 pour dimanche et 6 pour samedi. */
function jourDeLaSemaine(jour: JourCivil): number {
  const { annee, mois, quantieme } = partiesDuJour(jour);
  return new Date(Date.UTC(annee, mois - 1, quantieme)).getUTCDay();
}

/**
 * Dimanche de Paques gregorien, algorithme de Butcher.
 *
 * CALCULE ET NON TABULE : une table finit par expirer, et personne ne s'en
 * apercoit avant qu'une echeance soit fausse. L'algorithme est valable de 1583
 * a 2499, ce qui depasse tout horizon utile ici.
 *
 * AUCUNE DEPENDANCE AJOUTEE, ni appel reseau : une echeance legale ne peut pas
 * dependre de la disponibilite d'un service tiers, et `npm audit` reste a zero.
 */
function dimancheDePaques(annee: number): JourCivil {
  const n = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * n + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((n + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const quantieme = ((h + l - 7 * m + 114) % 31) + 1;
  return versJourCivil(annee, mois, quantieme);
}

/** Lundi de Paques, le lendemain du dimanche de Paques. */
export function lundiDePaques(annee: number): JourCivil {
  return ajouterJours(dimancheDePaques(annee), 1);
}

/**
 * Les onze jours feries legaux d'une annee, France metropolitaine.
 *
 * LA LISTE EST CELLE DE L'ARTICLE L3133-1 DU CODE DU TRAVAIL, verifiee sur
 * service-public.gouv.fr le 3 septembre 2026. Les feries d'Alsace-Moselle,
 * Vendredi saint et 26 decembre, n'y sont PAS : le site vend en metropole sans
 * distinction de departement.
 *
 * L'ARTICLE L221-19 DIT « ferie OU CHOME », plus large que « ferie ». Aucun jour
 * chome supplementaire ne s'applique ici, un jour chome relevant d'un accord
 * collectif propre a une entreprise, et l'exploitante n'en a aucun. Si un jour
 * chome devait s'ajouter, il ne pourrait qu'ALLONGER le delai, jamais l'avancer.
 */
export function joursFeriesFrance(annee: number): ReadonlySet<JourCivil> {
  const paques = dimancheDePaques(annee);

  return new Set([
    versJourCivil(annee, 1, 1), // Jour de l'An
    ajouterJours(paques, 1), // lundi de Paques
    versJourCivil(annee, 5, 1), // Fete du Travail
    versJourCivil(annee, 5, 8), // Victoire 1945
    ajouterJours(paques, 39), // Ascension
    ajouterJours(paques, 50), // lundi de Pentecote
    versJourCivil(annee, 7, 14), // Fete nationale
    versJourCivil(annee, 8, 15), // Assomption
    versJourCivil(annee, 11, 1), // Toussaint
    versJourCivil(annee, 11, 11), // Armistice 1918
    versJourCivil(annee, 12, 25), // Noel
  ]);
}

/**
 * Un jour civil est-il ferie en France metropolitaine ?
 *
 * LA TABLE EST CELLE DE L'ANNEE DU JOUR TESTE, et non celle de la reception :
 * une echeance au 1er janvier appartient a l'annee suivante, et consulter la
 * mauvaise table la laisserait passer pour ouvrable.
 */
export function estJourFerie(jour: JourCivil): boolean {
  const { annee } = partiesDuJour(jour);
  return joursFeriesFrance(annee).has(jour);
}

/** Un jour ouvrable n'est ni samedi, ni dimanche, ni ferie. */
function estJourOuvrable(jour: JourCivil): boolean {
  const jourSemaine = jourDeLaSemaine(jour);
  if (jourSemaine === 0 || jourSemaine === 6) {
    return false;
  }
  return !estJourFerie(jour);
}

/**
 * Premier instant du jour civil parisien suivant, en UTC.
 *
 * OBTENU PAR SONDAGE plutot que par un decalage fixe : le decalage de Paris
 * vaut UTC+1 ou UTC+2 selon la saison, et l'ecrire en dur rendrait le resultat
 * faux la moitie de l'annee. On cherche le premier instant dont le jour civil
 * parisien depasse le jour vise, a la minute pres.
 */
function debutDuJourSuivantEnUtc(jour: JourCivil): Date {
  const lendemain = ajouterJours(jour, 1);
  const { annee, mois, quantieme } = partiesDuJour(lendemain);

  // Minuit a Paris tombe entre 22h00 UTC la veille (ete) et 00h00 UTC (hiver).
  // On part de la veille a 21h00 UTC, avant toute possibilite, et on avance.
  const depart = Date.UTC(annee, mois - 1, quantieme, 21, 0, 0) - 86_400_000;

  for (let minute = 0; minute <= 300; minute += 1) {
    const candidat = new Date(depart + minute * 60_000);
    if (jourCivilParisien(candidat) === lendemain) {
      return candidat;
    }
  }

  /* c8 ignore next 3 */
  throw new Error(
    `Debut du jour parisien introuvable pour ${lendemain}, fuseau incoherent`,
  );
}

/** Valide un instant et rend le jour civil parisien correspondant. */
function jourDeReception(instant: Date): JourCivil {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new DateReceptionInvalideError(
      "Date de reception invalide, aucune echeance de retractation calculable",
    );
  }
  return jourCivilParisien(instant);
}

/**
 * Echeance du droit de retractation, article L221-19.
 *
 * ACCEPTE UNE DATE OU PLUSIEURS. En livraison echelonnee le delai part de la
 * reception du DERNIER bien, article L221-18 : la fonction retient le maximum
 * plutot que de laisser chaque appelant le calculer, ce qui est precisement la
 * divergence que cette story existe pour empecher.
 *
 * NE REND JAMAIS D'ECHEANCE PAR DEFAUT. Sans date de reception, la fonction
 * leve : inventer une date eteindrait un droit ou l'ouvrirait a tort, et le
 * repli en l'absence de suivi appartient a LS-131, qui ALLONGE le delai.
 */
export function calculerEcheanceRetractation(
  reception: Date | readonly Date[],
): EcheanceRetractation {
  const receptions = Array.isArray(reception) ? reception : [reception as Date];

  if (receptions.length === 0) {
    throw new DateReceptionInvalideError(
      "Il faut au moins une date de reception pour calculer une echeance",
    );
  }

  // Le dernier bien recu, article L221-18. Compare sur les jours civils
  // parisiens et non sur les instants : deux receptions du meme jour a des
  // heures differentes ouvrent le meme delai, regle 1 de L221-19.
  const jours = receptions.map(jourDeReception);
  const jourDepart = jours.reduce((tardif, jour) =>
    jour > tardif ? jour : tardif,
  );

  // Regle 1 : le jour de reception n'est pas compte. Le delai court donc du
  // lendemain, et le quatorzieme jour est atteint a `jourDepart + 14`.
  let jourLimite = ajouterJours(jourDepart, DUREE_RETRACTATION_JOURS);

  // Regle 3 : prorogation jusqu'au premier jour ouvrable, iterativement. La
  // borne de huit tours couvre le plus long enchainement possible, un ferie
  // encadre d'un week-end n'excedant jamais quelques jours.
  let tours = 0;
  while (!estJourOuvrable(jourLimite)) {
    jourLimite = ajouterJours(jourLimite, 1);
    tours += 1;
    /* c8 ignore next 5 */
    if (tours > 8) {
      throw new Error(
        `Prorogation sans fin depuis ${jourDepart}, table de feries incoherente`,
      );
    }
  }

  return {
    jourLimite,
    // Regle 2 : le delai prend fin a l'expiration de la derniere heure du
    // dernier jour. La borne exclusive est donc le debut du jour suivant.
    finInclusive: debutDuJourSuivantEnUtc(jourLimite),
    jourReception: jourDepart,
  };
}
