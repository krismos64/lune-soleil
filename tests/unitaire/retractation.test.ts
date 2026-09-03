/**
 * Calcul du delai de retractation, LS-133. Socle de tout le parcours 5.
 *
 * CES TESTS SONT ECRITS AVANT L'IMPLEMENTATION. Une echeance fausse est une
 * information incorrecte sur le droit de retractation, et l'article L221-20
 * sanctionne ce defaut par un delai porte a DOUZE MOIS : le cout d'une erreur
 * ici n'est pas de quelques jours, il est d'un an de retractation ouverte sur
 * toutes les commandes concernees.
 *
 * LES DATES DE REFERENCE SONT VERIFIEES HORS DU CODE TESTE, jamais engendrees
 * par lui : un test qui appellerait `paques()` pour construire son attendu
 * validerait l'implementation par elle-meme et resterait vert sur un algorithme
 * faux. Les valeurs viennent de service-public.gouv.fr, consulte le 3 septembre
 * 2026, et sont ecrites en clair.
 *
 * AUCUNE BASE DE DONNEES : le module sous test est une fonction pure.
 */
import { describe, expect, it } from "vitest";

import {
  DUREE_RETRACTATION_JOURS,
  calculerEcheanceRetractation,
  estJourFerie,
  joursFeriesFrance,
  lundiDePaques,
} from "@/lib/retractation";

/**
 * Construit un instant UTC, comme la base le stocke, invariant 8.
 *
 * LES TESTS N'ECRIVENT JAMAIS UNE DATE LOCALE : `new Date("2026-05-15")` sans
 * suffixe se lirait dans le fuseau de la machine, et la suite passerait a Paris
 * en echouant sur un executeur en UTC. Le `Z` est explicite partout.
 */
function instantUtc(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Date de test invalide : ${iso}`);
  }
  return date;
}

/** L'echeance rendue, en date civile parisienne, pour comparer lisiblement. */
function echeance(receptionIso: string): string {
  return calculerEcheanceRetractation(instantUtc(receptionIso)).jourLimite;
}

describe("lundiDePaques", () => {
  /*
   * DEUX ANNEES AU MOINS, critere 5. Une seule annee laisserait passer un
   * algorithme qui rend une constante, et le test resterait vert.
   *
   * Paques 2026 tombe le 5 avril, donc le lundi le 6. Paques 2027 tombe le
   * 28 mars, donc le lundi le 29. Verifie a la source, pas deduit.
   */
  it("calcule le lundi de Paques sur plusieurs annees", () => {
    expect(lundiDePaques(2024)).toBe("2024-04-01");
    expect(lundiDePaques(2025)).toBe("2025-04-21");
    expect(lundiDePaques(2026)).toBe("2026-04-06");
    expect(lundiDePaques(2027)).toBe("2027-03-29");
    expect(lundiDePaques(2028)).toBe("2028-04-17");
  });
});

describe("joursFeriesFrance", () => {
  it("rend les onze feries legaux de metropole", () => {
    const feries = joursFeriesFrance(2026);
    expect(feries.size).toBe(11);
  });

  /*
   * LES TROIS MOBILES SUR DEUX ANNEES, critere 5. Ascension a Paques plus
   * 39 jours, lundi de Pentecote a Paques plus 50.
   */
  it("place les trois feries mobiles depuis Paques, sur deux annees", () => {
    const en2026 = joursFeriesFrance(2026);
    expect(en2026.has("2026-04-06")).toBe(true); // lundi de Paques
    expect(en2026.has("2026-05-14")).toBe(true); // Ascension
    expect(en2026.has("2026-05-25")).toBe(true); // lundi de Pentecote

    const en2027 = joursFeriesFrance(2027);
    expect(en2027.has("2027-03-29")).toBe(true); // lundi de Paques
    expect(en2027.has("2027-05-06")).toBe(true); // Ascension
    expect(en2027.has("2027-05-17")).toBe(true); // lundi de Pentecote
  });

  it("place les huit feries fixes", () => {
    const feries = joursFeriesFrance(2026);
    for (const jour of [
      "2026-01-01",
      "2026-05-01",
      "2026-05-08",
      "2026-07-14",
      "2026-08-15",
      "2026-11-01",
      "2026-11-11",
      "2026-12-25",
    ]) {
      expect(estJourFerie(jour)).toBe(true);
      expect(feries.has(jour)).toBe(true);
    }
  });

  /*
   * LES FERIES REGIONAUX NE SONT PAS RETENUS. Le Vendredi saint et le
   * 26 decembre sont feries en Alsace-Moselle seulement. Le site vend en France
   * metropolitaine sans distinction de departement, et retenir un ferie local
   * ALLONGERAIT le delai pour tout le monde, ce qui est sans risque juridique,
   * mais l'inverse ne l'est pas : la liste retenue est celle de L3133-1.
   */
  it("ne retient aucun ferie regional", () => {
    expect(estJourFerie("2026-04-03")).toBe(false); // Vendredi saint 2026
    expect(estJourFerie("2026-12-26")).toBe(false); // Saint-Etienne
  });
});

describe("calculerEcheanceRetractation", () => {
  /*
   * CRITERE 1. Le jour de reception n'est pas compte, L221-19 1°. Les deux
   * horaires extremes du meme jour civil doivent rendre LA MEME echeance : si
   * l'implementation ajoutait simplement quatorze fois vingt-quatre heures,
   * la reception a 23h59 basculerait au lendemain et les deux differeraient.
   */
  it("ne compte pas le jour de reception, quel que soit l'horaire", () => {
    // 15 mai 2026, un vendredi. J+14 tombe le 29 mai, un vendredi ouvrable.
    const tot = echeance("2026-05-15T00:01:00+02:00");
    const tard = echeance("2026-05-15T23:59:00+02:00");

    expect(tot).toBe(tard);
    expect(tot).toBe("2026-05-29");
  });

  /*
   * CRITERE 6. Une reception a 23h30 heure de Paris appartient a CE jour-la.
   * Stockee en UTC, elle vaut 21h30 le meme jour en ete : c'est le cas facile.
   * Le cas qui casse une implementation naive est l'inverse, ci-dessous.
   */
  it("rattache une reception de 23h30 heure de Paris a ce jour-la", () => {
    // 23h30 a Paris le 15 mai (ete, UTC+2) vaut 21h30 UTC le 15 mai.
    expect(echeance("2026-05-15T21:30:00Z")).toBe("2026-05-29");
  });

  /*
   * LE PIEGE REEL DE L'UTC, et il n'est pas dans les criteres : un instant UTC
   * qui appartient DEJA au lendemain a Paris. Le 15 mai a 22h30 UTC est le
   * 16 mai a 00h30 a Paris. Un calcul mene en UTC daterait la reception du 15
   * et rendrait une echeance trop precoce d'un jour, ce que L221-20 sanctionne.
   */
  it("rattache un instant UTC du soir au jour parisien suivant", () => {
    // 22h30 UTC le 15 mai = 00h30 le 16 mai a Paris. Reception le 16.
    expect(echeance("2026-05-15T22:30:00Z")).toBe("2026-06-01");
  });

  /*
   * CRITERE 2. Samedi et dimanche proroges au lundi, L221-19 3°.
   */
  it("proroge une echeance du samedi au lundi", () => {
    // Reception le 1er mai 2026 : J+14 tombe le 15 mai, un vendredi. On vise
    // un samedi, donc reception le 2 mai, J+14 au samedi 16 mai.
    expect(echeance("2026-05-02T10:00:00+02:00")).toBe("2026-05-18");
  });

  it("proroge une echeance du dimanche au lundi", () => {
    // Reception le 3 mai 2026, J+14 au dimanche 17 mai.
    expect(echeance("2026-05-03T10:00:00+02:00")).toBe("2026-05-18");
  });

  /*
   * CRITERE 3. Le 1er mai, cas cite par `legal.md`. En 2026 le 1er mai est un
   * vendredi : l'echeance qui y tombe doit sauter au lundi 4 mai, le samedi et
   * le dimanche suivants etant eux aussi non ouvrables. La prorogation est donc
   * ITERATIVE et non un simple decalage d'un jour.
   */
  it("proroge une echeance tombant le 1er mai, week-end inclus", () => {
    // Reception le 17 avril 2026, J+14 au vendredi 1er mai.
    expect(echeance("2026-04-17T10:00:00+02:00")).toBe("2026-05-04");
  });

  /*
   * CRITERE 4. Le 25 decembre, Y COMPRIS quand le 26 est un week-end. En 2026
   * le 25 decembre est un vendredi, donc le 26 un samedi et le 27 un dimanche :
   * l'echeance saute au lundi 28. C'est le cas qui distingue une prorogation
   * repetee d'une prorogation unique.
   */
  it("proroge une echeance du 25 decembre quand le 26 est un samedi", () => {
    // Reception le 11 decembre 2026, J+14 au vendredi 25 decembre.
    expect(echeance("2026-12-11T10:00:00+01:00")).toBe("2026-12-28");
  });

  /*
   * LE 1er JANVIER, qui traverse une frontiere d'annee. La table des feries est
   * construite par annee : une echeance au 1er janvier doit consulter la table
   * de l'annee SUIVANTE, ce qu'une implementation ne consultant que l'annee de
   * reception raterait en silence.
   */
  it("proroge une echeance du 1er janvier de l'annee suivante", () => {
    // Reception le 18 decembre 2026, J+14 au vendredi 1er janvier 2027.
    // Le 2 est un samedi, le 3 un dimanche : echeance au lundi 4 janvier.
    expect(echeance("2026-12-18T10:00:00+01:00")).toBe("2027-01-04");
  });

  /*
   * LE CHANGEMENT D'HEURE. Le 25 octobre 2026 la France repasse a UTC+1. Un
   * calcul qui ajouterait quatorze fois 86 400 000 millisecondes derive d'une
   * heure en traversant cette frontiere, et peut basculer de jour civil.
   */
  it("reste juste en traversant le passage a l'heure d'hiver", () => {
    // Reception le 20 octobre 2026, J+14 au mardi 3 novembre.
    expect(echeance("2026-10-20T10:00:00+02:00")).toBe("2026-11-03");
  });

  it("expose la duree legale de quatorze jours", () => {
    expect(DUREE_RETRACTATION_JOURS).toBe(14);
  });

  /*
   * L'ECHEANCE EST UN INSTANT, pas seulement un jour. Le delai prend fin a
   * l'expiration de la DERNIERE heure du dernier jour, L221-19 2°. Une demande
   * deposee a 23h59 heure de Paris le jour limite est donc dans les temps, et
   * l'instant rendu doit etre le tout debut du jour suivant, en UTC.
   */
  it("rend un instant de fin au dernier instant du jour limite", () => {
    const resultat = calculerEcheanceRetractation(
      instantUtc("2026-05-15T10:00:00Z"),
    );

    expect(resultat.jourLimite).toBe("2026-05-29");
    // Minuit a Paris le 30 mai (ete, UTC+2) vaut 22h00 UTC le 29 mai.
    expect(resultat.finInclusive.toISOString()).toBe(
      "2026-05-29T22:00:00.000Z",
    );
  });

  /*
   * CRITERE 7. Livraison echelonnee : le delai part de la reception du DERNIER
   * bien, L221-18. La fonction dediee prend l'instant le plus TARDIF, et un
   * ordre d'entree quelconque ne doit pas changer le resultat.
   */
  it("part du dernier bien recu en livraison echelonnee", () => {
    const receptions = [
      instantUtc("2026-05-03T10:00:00Z"),
      instantUtc("2026-05-15T10:00:00Z"),
      instantUtc("2026-05-11T10:00:00Z"),
    ];

    const resultat = calculerEcheanceRetractation(receptions);
    expect(resultat.jourLimite).toBe("2026-05-29");

    // L'ordre d'entree n'a aucun effet : le maximum ne depend pas du tri.
    const inverse = calculerEcheanceRetractation([...receptions].reverse());
    expect(inverse.jourLimite).toBe("2026-05-29");
  });

  it("refuse une liste de receptions vide", () => {
    // AUCUN REPLI SILENCIEUX : sans date de reception, il n'y a pas d'echeance
    // calculable, et en inventer une eteindrait un droit ou l'ouvrirait a tort.
    expect(() => calculerEcheanceRetractation([])).toThrow(
      /au moins une date de reception/i,
    );
  });

  it("refuse une date invalide", () => {
    expect(() =>
      calculerEcheanceRetractation(new Date("pas une date")),
    ).toThrow(/invalide/i);
  });
});
