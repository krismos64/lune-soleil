/**
 * Mise en forme d'une commande, LS-143.
 *
 * CE MODULE N'AVAIT AUCUN TEST avant cette story, alors que DIX fichiers
 * l'importent, dont l'espace client et six ecrans d'administration. Le critere 5
 * de LS-143 demandait « prouve par les tests d'affichage de LS-121 » : ces tests
 * n'existaient pas, et c'est ce qui a laisse le `default` de `formaterOrigine`
 * absorber une valeur inconnue pendant onze jours sans que rien ne rougisse.
 *
 * CE QUE CES TESTS NE PEUVENT PAS PROUVER, et c'est le point de la story :
 * l'exhaustivite d'une table de libelles ne se teste pas a l'execution, elle se
 * verifie a la COMPILATION. Un enum ajoute fait echouer `npm run type-check` sur
 * `LIBELLES_STATUT`, `LIBELLES_LIVRAISON` et `LIBELLES_ORIGINE`, jamais ici.
 * Les tests ci-dessous figent les libelles rendus ; le type ferme le trou.
 *
 * AUCUNE BASE DE DONNEES : ce module ne decide rien et ne lit rien.
 */
import { describe, expect, it } from "vitest";

import {
  LIBELLES_LIVRAISON,
  LIBELLES_ORIGINE,
  LIBELLES_STATUT,
  SEUIL_SUIVI_BLOQUE_MS,
  formaterDate,
  formaterOrigine,
  fraicheurSuivi,
  traduireStatut,
} from "@/lib/affichage-commande";

describe("formaterOrigine", () => {
  /*
   * LES TROIS VALEURS DE L'ENUM, critere 5 : aucun changement de comportement
   * visible sur ce qui existait avant la correction.
   */
  it("rend « Système » pour une ecriture automatique", () => {
    expect(formaterOrigine("SYSTEME")).toBe("Système");
  });

  it("rend « Administration » pour une ecriture de l'exploitante", () => {
    expect(formaterOrigine("ADMIN")).toBe("Administration");
  });

  it("rend « Réconciliation automatique » pour la tache de rattrapage", () => {
    expect(formaterOrigine("RECONCILIATION")).toBe(
      "Réconciliation automatique",
    );
  });

  /*
   * LA DISTINCTION EST LE POINT DE L'HISTORIQUE, regle S9. Savoir si une
   * commande a ete avancee par une personne ou par une tache est precisement ce
   * qu'on vient y chercher : les trois libelles doivent rester DISTINCTS.
   *
   * Ce test aurait rougi sur le code d'avant LS-143 si l'enum avait gagne une
   * quatrieme valeur, celle-ci tombant sur « Système » comme `SYSTEME`.
   */
  it("rend un libelle distinct pour chaque origine", () => {
    const libelles = Object.values(LIBELLES_ORIGINE);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  /*
   * AUCUN LIBELLE VIDE. Une origine sans libelle s'afficherait en chaine vide,
   * exactement le defaut mesure sur `LIBELLES_LIVRAISON` en LS-57.
   */
  it("ne rend jamais de libelle vide", () => {
    for (const libelle of Object.values(LIBELLES_ORIGINE)) {
      expect(libelle.trim()).not.toBe("");
    }
  });
});

describe("traduireStatut", () => {
  it("traduit les six statuts de commande", () => {
    expect(traduireStatut("EN_ATTENTE_PAIEMENT")).toBe(
      "En attente de paiement",
    );
    expect(traduireStatut("CONFIRMEE")).toBe("Confirmée");
    expect(traduireStatut("EN_PREPARATION")).toBe("En préparation");
    expect(traduireStatut("EXPEDIEE")).toBe("Expédiée");
    expect(traduireStatut("LIVREE")).toBe("Livrée");
    expect(traduireStatut("ANNULEE")).toBe("Annulée");
  });

  /*
   * LE REPLI SUR LA VALEUR BRUTE EST DELIBERE ET DOIT LE RESTER, a la
   * difference de celui que LS-143 vient de retirer de `formaterOrigine`. Les
   * colonnes d'historique sont typees `string` et conservent ce qui a ete
   * ecrit : un statut disparu doit s'afficher tel quel plutot que de rendre la
   * ligne muette.
   *
   * Ce test garde cette asymetrie : quelqu'un qui « harmoniserait » les deux
   * fonctions au nom de LS-143 le fait rougir.
   */
  it("rend la valeur brute d'un statut qui n'existe plus", () => {
    expect(traduireStatut("STATUT_RETIRE_EN_2027")).toBe(
      "STATUT_RETIRE_EN_2027",
    );
  });

  it("ne rend jamais une chaine vide sur une entree inconnue", () => {
    expect(traduireStatut("INCONNU")).not.toBe("");
  });
});

describe("tables de libelles", () => {
  it("ne porte aucun libelle vide", () => {
    const toutes = [
      ...Object.values(LIBELLES_STATUT),
      ...Object.values(LIBELLES_LIVRAISON),
      ...Object.values(LIBELLES_ORIGINE),
    ];
    for (const libelle of toutes) {
      expect(libelle.trim()).not.toBe("");
    }
  });

  /*
   * JAMAIS LA VALEUR BRUTE DE L'ENUM a l'ecran, regle enoncee par l'en-tete du
   * module. Un libelle egal a sa cle signale une table remplie a la hate.
   */
  it("ne rend jamais la valeur brute de l'enum", () => {
    for (const [cle, libelle] of Object.entries(LIBELLES_ORIGINE)) {
      expect(libelle).not.toBe(cle);
    }
    for (const [cle, libelle] of Object.entries(LIBELLES_STATUT)) {
      expect(libelle).not.toBe(cle);
    }
  });
});

describe("formaterDate", () => {
  /*
   * `Europe/Paris` EST EXPLICITE et non deduit du serveur, invariant 8. Ce test
   * choisit un instant UTC dont le rendu parisien tombe le JOUR SUIVANT : une
   * conversion oubliee afficherait « 31/12/2025 », et la commande passee a
   * 00h30 apparaitrait la veille.
   */
  it("convertit un instant UTC sur Europe/Paris a l'affichage", () => {
    const minuitTrenteAParis = new Date("2025-12-31T23:30:00.000Z");
    expect(formaterDate(minuitTrenteAParis)).toBe("01/01/2026 00:30");
  });

  /*
   * L'ECART EST DE DEUX HEURES EN ETE et d'une seule en hiver. Figer les deux
   * saisons empeche de « simplifier » la conversion en un decalage constant,
   * qui passerait la moitie de l'annee.
   */
  it("applique l'heure d'ete", () => {
    const midiEnJuillet = new Date("2026-07-15T10:00:00.000Z");
    expect(formaterDate(midiEnJuillet)).toBe("15/07/2026 12:00");
  });

  it("applique l'heure d'hiver", () => {
    const midiEnJanvier = new Date("2026-01-15T11:00:00.000Z");
    expect(formaterDate(midiEnJanvier)).toBe("15/01/2026 12:00");
  });
});

/**
 * Fraicheur du suivi, LS-58 critere 4 et LS-216 critere 4.
 *
 * CE QUI EST EPROUVE ICI EST UN SIGNALEMENT D'INCIDENT, pas une mise en forme.
 * Un seuil faux ne se voit pas a l'ecran : il se voit le jour ou un colis
 * bloque depuis trois jours s'affiche « a jour » a l'exploitante, qui ne
 * cherche donc pas ou il est passe.
 *
 * L'INSTANT EST FIXE ET JAMAIS `new Date()`. Un test qui dort mesurerait
 * l'ordonnanceur, piege deja rencontre sur le test de concurrence de ce depot.
 */
describe("fraicheurSuivi", () => {
  const maintenant = new Date("2026-09-10T12:00:00.000Z");

  /*
   * AUCUNE LECTURE N'A EU LIEU, cas NORMAL le jour ou le colis est remis au
   * transporteur : Sendcloud peut ne pas encore connaitre le numero, et
   * `synchroniserSuivi` sort alors sans rien ecrire. Le confondre avec un suivi
   * bloque ferait alerter sur toute expedition du jour meme.
   */
  it("distingue un suivi jamais lu d'un suivi bloque", () => {
    expect(
      fraicheurSuivi({ livreA: null, synchroniseA: null }, maintenant),
    ).toBe("jamais");
  });

  it("tient pour frais un suivi lu il y a une heure", () => {
    const uneHeureAvant = new Date(maintenant.getTime() - 60 * 60 * 1000);

    expect(
      fraicheurSuivi({ livreA: null, synchroniseA: uneHeureAvant }, maintenant),
    ).toBe("frais");
  });

  it("signale un suivi lu il y a plus de vingt-quatre heures", () => {
    const troisJoursAvant = new Date(
      maintenant.getTime() - 3 * SEUIL_SUIVI_BLOQUE_MS,
    );

    expect(
      fraicheurSuivi(
        { livreA: null, synchroniseA: troisJoursAvant },
        maintenant,
      ),
    ).toBe("bloque");
  });

  /*
   * LA BORNE EXACTE EST FIGEE DANS LES DEUX SENS. Un `>=` a la place du `>`
   * ferait basculer une expedition lue a la seconde pres, et les deux cas
   * ci-dessous sont ce qui empeche de « simplifier » la comparaison.
   */
  it("ne signale pas un suivi lu exactement au seuil", () => {
    const auSeuil = new Date(maintenant.getTime() - SEUIL_SUIVI_BLOQUE_MS);

    expect(
      fraicheurSuivi({ livreA: null, synchroniseA: auSeuil }, maintenant),
    ).toBe("frais");
  });

  it("signale un suivi lu une milliseconde au-dela du seuil", () => {
    const auDela = new Date(maintenant.getTime() - SEUIL_SUIVI_BLOQUE_MS - 1);

    expect(
      fraicheurSuivi({ livreA: null, synchroniseA: auDela }, maintenant),
    ).toBe("bloque");
  });

  /*
   * LE CAS QUI EVITE UNE FAUSSE ALERTE DE MASSE. `listerASuivre` exclut les
   * expeditions livrees, donc leur `synchroniseA` cesse d'avancer par
   * construction : sans cette garde, TOUTE commande livree serait signalee
   * « bloquee » vingt-quatre heures apres sa reception, c'est-a-dire la
   * totalite de l'historique de la boutique.
   */
  it("tient pour frais une expedition livree, meme synchronisee il y a un mois", () => {
    const unMoisAvant = new Date(
      maintenant.getTime() - 30 * SEUIL_SUIVI_BLOQUE_MS,
    );

    expect(
      fraicheurSuivi(
        {
          livreA: new Date("2026-08-11T09:00:00.000Z"),
          synchroniseA: unMoisAvant,
        },
        maintenant,
      ),
    ).toBe("frais");
  });

  /*
   * UNE EXPEDITION LIVREE DONT LE SUIVI N'A JAMAIS ETE LU reste fraiche. Le cas
   * parait theorique, il ne l'est pas : rien n'empeche une correction manuelle
   * en base d'ecrire `livreA` sans `synchroniseA`. L'ordre des deux conditions
   * dans la fonction est ce qui le decide, et ce test le fige.
   */
  it("tient pour fraiche une expedition livree sans aucune synchronisation", () => {
    expect(
      fraicheurSuivi(
        { livreA: new Date("2026-09-09T09:00:00.000Z"), synchroniseA: null },
        maintenant,
      ),
    ).toBe("frais");
  });
});
