/**
 * Correspondance des statuts Sendcloud, LS-131. ADR-042.
 *
 * CE FICHIER PORTE LA REGLE LA PLUS COUTEUSE DU PROJET SI ELLE EST FAUSSE.
 * `livreA` ouvre le delai de retractation, article L221-18, et l'article
 * L221-20 porte ce delai a DOUZE MOIS quand l'information sur ce droit est
 * incorrecte. Un statut mal classe ne se voit pas a l'ecran : il se voit dans
 * un litige, des mois plus tard.
 *
 * ECRIT AVANT L'IMPLEMENTATION, exigence du plan directeur en zone critique.
 *
 * LES IDENTIFIANTS SONT CEUX DE L'API REELLE, releves le 10 septembre 2026 sur
 * `GET /api/v2/parcels/statuses`, 35 statuts. Aucun n'est invente.
 */
import { describe, expect, it } from "vitest";

import {
  STATUTS_LIVRES,
  STATUTS_ECHEC_DEFINITIF,
  estLivre,
  estEchecDefinitif,
} from "@/integrations/sendcloud/statuts";

describe("estLivre, les deux statuts qui valent livraison", () => {
  /*
   * DEUX STATUTS ET NON UN, decision 1 d'ADR-042.
   *
   * `Delivered` vise la remise au client final a son adresse, `Shipment
   * collected by customer` le retrait dans un point de service. Ecrire la regle
   * sur le seul retrait en relais aurait laisse TOUTE livraison a domicile sans
   * `livreA`, defaut invisible jusqu'a la premiere vente livree a domicile.
   */
  it("11, Delivered, vaut livraison a domicile", () => {
    expect(estLivre(11)).toBe(true);
  });

  it("93, Shipment collected by customer, vaut retrait en relais", () => {
    expect(estLivre(93)).toBe(true);
  });

  it("n'admet que ces deux valeurs", () => {
    expect([...STATUTS_LIVRES].sort((a, b) => a - b)).toEqual([11, 93]);
  });
});

describe("estLivre, les faux amis qui ne livrent pas", () => {
  /*
   * CHAQUE CAS EST UN TEST NOMME, et non une boucle sur un tableau.
   *
   * Une boucle rend un seul echec quand un statut bascule, sans dire lequel.
   * Ici le nom du test qui rougit designe le statut fautif, ce qui compte sur
   * une regle dont l'erreur se paie en mois de retractation.
   */
  it("12, Awaiting customer pickup, ne livre pas : le colis attend au relais", () => {
    expect(estLivre(12)).toBe(false);
  });

  it("8, Delivery attempt failed, ne livre pas : personne n'etait la", () => {
    expect(estLivre(8)).toBe(false);
  });

  it("91, Parcel en route, ne livre pas : en acheminement", () => {
    expect(estLivre(91)).toBe(false);
  });

  it("92, Driver en route, ne livre pas : en tournee", () => {
    expect(estLivre(92)).toBe(false);
  });

  /*
   * UN COLIS PEUT RESTER UNE SEMAINE EN RELAIS avant retrait. Prendre
   * `Awaiting customer pickup` pour une livraison eteindrait le droit du client
   * avant terme, et c'est le defaut que `legal.md` nomme depuis juillet.
   */
  it("ne confond jamais l'arrivee au relais avec le retrait", () => {
    expect(estLivre(12)).toBe(false);
    expect(estLivre(93)).toBe(true);
  });
});

describe("estLivre, liste blanche et non liste noire", () => {
  /*
   * UN STATUT INCONNU NE LIVRE PAS, decision 2 d'ADR-042.
   *
   * Les 35 statuts d'aujourd'hui peuvent devenir 40 : un statut neuf qui
   * livrerait par defaut serait invisible jusqu'au litige. Le sens sur est de
   * ne rien conclure.
   */
  it("un statut inconnu ne livre pas", () => {
    expect(estLivre(99999)).toBe(false);
  });

  it("un statut d'annulation ne livre pas", () => {
    expect(estLivre(2000)).toBe(false);
  });

  it("le statut « Unknown status » de Sendcloud ne livre pas", () => {
    expect(estLivre(1337)).toBe(false);
  });
});

describe("estEchecDefinitif, les quatre cas qui alertent", () => {
  it("80, Unable to deliver", () => {
    expect(estEchecDefinitif(80)).toBe(true);
  });

  it("62991, Refused by recipient", () => {
    expect(estEchecDefinitif(62991)).toBe(true);
  });

  it("62992, Returned to sender", () => {
    expect(estEchecDefinitif(62992)).toBe(true);
  });

  it("62997, Address invalid", () => {
    expect(estEchecDefinitif(62997)).toBe(true);
  });

  it("n'admet que ces quatre valeurs", () => {
    expect([...STATUTS_ECHEC_DEFINITIF].sort((a, b) => a - b)).toEqual([
      80, 62991, 62992, 62997,
    ]);
  });
});

describe("estEchecDefinitif, ce qui n'est pas un echec", () => {
  /*
   * UN ECHEC DE TENTATIVE N'EST PAS UN ECHEC DEFINITIF, et la nuance porte la
   * decision 3 d'ADR-042 : `Delivery attempt failed` sera suivi d'une seconde
   * tentative ou d'un report en relais. Alerter dessus noierait l'exploitante
   * sous des incidents qui se resolvent seuls.
   */
  it("8, Delivery attempt failed, n'est PAS un echec definitif", () => {
    expect(estEchecDefinitif(8)).toBe(false);
  });

  it("un colis livre n'est pas un echec", () => {
    expect(estEchecDefinitif(11)).toBe(false);
    expect(estEchecDefinitif(93)).toBe(false);
  });

  it("un colis en route n'est pas un echec", () => {
    expect(estEchecDefinitif(91)).toBe(false);
  });
});

describe("les deux ensembles ne se recouvrent jamais", () => {
  /*
   * UN STATUT QUI SERAIT DANS LES DEUX ECRIRAIT `livreA` ET alerterait sur un
   * colis non recu, deux affirmations contradictoires sur le meme fait. Ce test
   * garde les listes l'une contre l'autre a mesure qu'elles grossiront.
   */
  it("aucun statut n'est a la fois livre et en echec", () => {
    const communs = [...STATUTS_LIVRES].filter((statut) =>
      STATUTS_ECHEC_DEFINITIF.has(statut),
    );

    expect(communs).toEqual([]);
  });
});
