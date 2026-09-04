/**
 * Bornes des periodes comptables, LS-184.
 *
 * AUCUNE BASE DE DONNEES : ce module ne fait que du calcul de dates, et c'est
 * precisement ce qui se prouve par test plutot que par lecture.
 *
 * LE FUSEAU EST LE SUJET DE CE FICHIER. « Le mois de juillet » ne veut rien
 * dire sans lui : un serveur en UTC, ce qu'est la production, ferait commencer
 * juillet a 2 h du matin le 1er juillet heure francaise, et une facture emise a
 * 00 h 30 ce jour-la tomberait dans le mois de juin. Les assertions portent
 * donc sur des instants UTC exacts, jamais sur des composants relus.
 *
 * `maintenant` EST INJECTE dans chaque test : « ce mois-ci » testé avec
 * `new Date()` serait un test dont le sens change chaque mois, et qui ne
 * couvrirait jamais ni janvier ni un changement d'heure.
 */
import { describe, expect, it } from "vitest";

import {
  PERIODES,
  PERIODE_PAR_DEFAUT,
  bornesDePeriode,
  reconnaitrePeriode,
} from "@/lib/periode-comptable";

describe("reconnaitrePeriode", () => {
  it("reconnait les quatre valeurs proposees", () => {
    for (const periode of PERIODES) {
      expect(reconnaitrePeriode(periode.valeur)).toBe(periode.valeur);
    }
  });

  /*
   * UNE VALEUR INCONNUE NE PRODUIT NI ERREUR NI PAGE VIDE. Un lien partage avec
   * un parametre perime, ou bricole a la main, doit montrer quelque chose :
   * l'invariant 7 veut que la chaine de l'URL n'atteigne jamais la requete, et
   * le repli sur « Tout » est la forme la plus sure de ce refus.
   */
  it("retombe sur la periode par defaut devant l'inconnu", () => {
    expect(reconnaitrePeriode("juillet-2026")).toBe(PERIODE_PAR_DEFAUT);
    expect(reconnaitrePeriode("")).toBe(PERIODE_PAR_DEFAUT);
    expect(reconnaitrePeriode(undefined)).toBe(PERIODE_PAR_DEFAUT);
    expect(reconnaitrePeriode("'; DROP TABLE facture; --")).toBe(
      PERIODE_PAR_DEFAUT,
    );
  });
});

describe("bornesDePeriode", () => {
  it("ne borne rien sur « Tout »", () => {
    const bornes = bornesDePeriode("tout", new Date("2026-07-15T10:00:00Z"));

    expect(bornes.depuis).toBeUndefined();
    expect(bornes.jusqua).toBeUndefined();
  });

  /*
   * JUILLET EST EN HEURE D'ETE, decalage de deux heures : minuit a Paris le
   * 1er juillet vaut 22 h UTC le 30 juin. C'est l'assertion qui echouerait si
   * le calcul se faisait dans le fuseau du serveur.
   */
  it("borne le mois courant sur l'heure de Paris, en ete", () => {
    const bornes = bornesDePeriode("mois", new Date("2026-07-15T10:00:00Z"));

    expect(bornes.depuis?.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(bornes.jusqua?.toISOString()).toBe("2026-07-31T21:59:59.999Z");
  });

  /*
   * FEVRIER EST EN HEURE D'HIVER, decalage d'une heure : le meme calcul rend
   * 23 h UTC. Une constante ecrite en dur passerait l'un des deux tests et
   * echouerait sur l'autre, ce qui est exactement le but de cette paire.
   */
  it("borne le mois courant sur l'heure de Paris, en hiver", () => {
    const bornes = bornesDePeriode("mois", new Date("2026-02-15T10:00:00Z"));

    expect(bornes.depuis?.toISOString()).toBe("2026-01-31T23:00:00.000Z");
    expect(bornes.jusqua?.toISOString()).toBe("2026-02-28T22:59:59.999Z");
  });

  it("borne le mois precedent", () => {
    const bornes = bornesDePeriode(
      "mois-precedent",
      new Date("2026-07-15T10:00:00Z"),
    );

    expect(bornes.depuis?.toISOString()).toBe("2026-05-31T22:00:00.000Z");
    expect(bornes.jusqua?.toISOString()).toBe("2026-06-30T21:59:59.999Z");
  });

  /*
   * LE PASSAGE D'ANNEE EST LE CAS QU'UNE CONDITION ECRITE A LA MAIN OUBLIE.
   * En janvier, le mois precedent est decembre de l'annee d'AVANT : `Date.UTC`
   * interprete le mois zero ainsi, ce qui evite d'ecrire le cas.
   */
  it("fait reculer l'annee quand le mois precedent est decembre", () => {
    const bornes = bornesDePeriode(
      "mois-precedent",
      new Date("2026-01-15T10:00:00Z"),
    );

    expect(bornes.depuis?.toISOString()).toBe("2025-11-30T23:00:00.000Z");
    expect(bornes.jusqua?.toISOString()).toBe("2025-12-31T22:59:59.999Z");
  });

  it("borne l'annee civile en heure de Paris", () => {
    const bornes = bornesDePeriode("annee", new Date("2026-07-15T10:00:00Z"));

    expect(bornes.depuis?.toISOString()).toBe("2025-12-31T23:00:00.000Z");
    expect(bornes.jusqua?.toISOString()).toBe("2026-12-31T22:59:59.999Z");
  });

  /*
   * DEUX PERIODES VOISINES NE SE RECOUVRENT PAS D'UNE MILLISECONDE.
   *
   * Le repository filtre en `lte`, borne haute INCLUSE : prendre minuit du jour
   * suivant ferait tomber une facture emise exactement a minuit dans les DEUX
   * periodes, donc comptee deux fois dans deux totaux differents. Sur des
   * pieces comptables, ce doublon se paie a la declaration.
   */
  it("ne laisse aucun recouvrement entre deux mois consecutifs", () => {
    const juin = bornesDePeriode(
      "mois-precedent",
      new Date("2026-07-15T10:00:00Z"),
    );
    const juillet = bornesDePeriode("mois", new Date("2026-07-15T10:00:00Z"));

    expect(juin.jusqua!.getTime()).toBeLessThan(juillet.depuis!.getTime());
    expect(juillet.depuis!.getTime() - juin.jusqua!.getTime()).toBe(1);
  });

  /*
   * LE MOIS DU CHANGEMENT D'HEURE, mars 2026 : l'heure d'ete commence le
   * dernier dimanche, donc la borne basse est en hiver et la borne haute en
   * ete. Un decalage suppose constant se tromperait d'une heure sur l'une des
   * deux, et c'est le cas que la reprise du calcul dans `minuitAParis` ferme.
   */
  it("borne un mois a cheval sur le changement d'heure", () => {
    const bornes = bornesDePeriode("mois", new Date("2026-03-15T10:00:00Z"));

    expect(bornes.depuis?.toISOString()).toBe("2026-02-28T23:00:00.000Z");
    expect(bornes.jusqua?.toISOString()).toBe("2026-03-31T21:59:59.999Z");
  });
});
