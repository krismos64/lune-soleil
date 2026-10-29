/**
 * Correspondance des methodes d'expedition Sendcloud, LS-218.
 *
 * CE QUI SE PAIE ICI EST DE L'ARGENT REEL. Une methode fausse cree une
 * etiquette au mauvais tarif, et Sendcloud n'a PAS de mode test : chaque
 * etiquette est facturee, 4,10 € en point relais et 7,49 € au domicile,
 * ADR-035. Un test qui laisse passer un identifiant faux ne se paie pas en
 * regression, il se paie sur la facture du mois.
 *
 * AUCUN APPEL RESEAU : ce module est une table de correspondance pure, comme
 * `statuts.ts`. Les identifiants viennent de l'API reelle, releves le
 * 10 septembre 2026, et ces tests les FIGENT.
 */
import { describe, expect, it } from "vitest";

import {
  OPTIONS_PAR_MODE,
  POIDS_COLIS_DEFAUT_GRAMMES,
  POIDS_COLIS_MAXIMUM_GRAMMES,
  methodeExigePointRetrait,
  optionPour,
} from "@/integrations/sendcloud/methodes";

describe("optionPour", () => {
  /*
   * LES TROIS CODES SONT FIGES, releves sur `POST /api/v3/shipping-options` le
   * 29 octobre 2026, LS-296. Les ecrire ici est ce qui rend un changement
   * VOLONTAIRE : modifier la table sans modifier ce test fait rougir, et c'est
   * le but.
   */
  it("rend l'option Mondial Relay Home Domestic au domicile", () => {
    expect(optionPour("DOMICILE")).toBe(
      "mondial_relay:home_domestic,dualapi/c2c",
    );
  });

  it("rend l'option Mondial Relay Point Relais en point de retrait", () => {
    expect(optionPour("POINT_RELAIS")).toBe(
      "mondial_relay:service_point,dualapi/size=l,c2c",
    );
  });

  it("rend l'option Mondial Relay Locker Delivery en locker", () => {
    expect(optionPour("LOCKER")).toBe("mondial_relay:locker_delivery,dualapi");
  });

  /*
   * TROIS OPTIONS DISTINCTES. Deux modes qui partageraient un code feraient
   * partir un colis sous le mauvais tarif sans qu'aucun autre test ne le voie :
   * la creation reussirait, l'etiquette sortirait, et l'ecart ne se lirait que
   * sur la facture.
   */
  it("rend un code distinct par mode", () => {
    const codes = Object.values(OPTIONS_PAR_MODE);
    expect(new Set(codes).size).toBe(codes.length);
  });

  /*
   * AUCUNE OPTION « QR » : elles remplacent l'etiquette collee par un code a
   * presenter, ce qui change le geste de l'exploitante et du client. Leur code
   * porte `labelless` ou `_qr`, et personne n'a pris cette decision.
   */
  it("n'emploie aucune option sans etiquette", () => {
    for (const code of Object.values(OPTIONS_PAR_MODE)) {
      expect(code.startsWith("mondial_relay:")).toBe(true);
      expect(code).not.toMatch(/labelless|_qr/);
    }
  });
});

describe("methodeExigePointRetrait", () => {
  /*
   * IL REFLETE `service_point_input` DE L'API, releve `required` sur les deux
   * modes de retrait et `none` au domicile. Envoyer un Point Relais sans point
   * fait echouer la creation chez Sendcloud.
   */
  it("exige un point de retrait en Point Relais et en Locker", () => {
    expect(methodeExigePointRetrait("POINT_RELAIS")).toBe(true);
    expect(methodeExigePointRetrait("LOCKER")).toBe(true);
  });

  /*
   * LE DOMICILE N'EN EXIGE AUCUN, et l'inverse serait couteux : exiger un point
   * au domicile rendrait toute expedition a domicile impossible, c'est-a-dire
   * le mode qui existe precisement pour qu'une panne du transporteur ne ferme
   * pas la vente, ADR-025.
   */
  it("n'exige aucun point de retrait au domicile", () => {
    expect(methodeExigePointRetrait("DOMICILE")).toBe(false);
  });
});

describe("les bornes de poids et le defaut", () => {
  /*
   * CE BLOC A CHANGE DE SUJET LE 12 SEPTEMBRE 2026, LS-218 critere 11, et le
   * changement est le coeur de la correction. Le poids EMPLOYE n'est plus une
   * constante : il vit sur `ParametreBoutique.poidsColisGrammes`, reglable sans
   * redeploiement, meme regle que le seuil de franco de LS-27. Ce qui reste ici
   * est sa BORNE, qui decoule de la table des methodes et non d'un arbitrage
   * commercial.
   *
   * CES TESTS GARDENT DONC LA BORNE ET NON LA VALEUR. Les faire porter sur un
   * reglage de base n'aurait aucun sens : une valeur que l'exploitante change
   * ne se verrouille pas par un test unitaire, elle se borne par un CHECK et un
   * schema Zod, ce que `verifier-schema.sh` et `validation` eprouvent.
   */

  /*
   * LA BORNE DE TRANCHE EST 251 g CHEZ SENDCLOUD, `max_weight` valant 0,251 kg
   * sur les trois methodes v2. La v3 ne decoupe plus l'option par poids,
   * LS-296, mais le tarif de 4,10 € annonce au client reste celui de cette
   * tranche : un poids au-dela partirait sous un tarif plus cher que celui
   * annonce, et le transporteur facturerait la difference.
   */
  it("tient dans la tranche la plus legere de Sendcloud", () => {
    expect(POIDS_COLIS_MAXIMUM_GRAMMES).toBeLessThan(251);
  });

  /*
   * LE DEFAUT GARDE SA MARGE, ET C'EST LE POINT DE L'ARBITRAGE. Christophe a
   * annonce des colis « de moins de 250 g » ; poser le defaut A 250 laisserait
   * UN gramme avant le basculement, donc aucune marge pour le carton, le papier
   * de soie et l'etiquette. Cinquante grammes les couvrent.
   *
   * Ce test rougit si quelqu'un « corrige » 200 en 250 au nom de la phrase de
   * Christophe, ce qui est exactement le raccourci a empecher.
   */
  it("garde une marge d'au moins quarante grammes sous la borne", () => {
    expect(251 - POIDS_COLIS_DEFAUT_GRAMMES).toBeGreaterThanOrEqual(40);
  });

  /*
   * LE DEFAUT RESTE PLAUSIBLE POUR UN COLIS REEL. Un defaut a 1 g passerait les
   * deux tests ci-dessus en declarant un poids que Sendcloud refuse :
   * `min_weight` vaut 0,015 kg sur la methode domicile, 0,011 sur le locker.
   */
  it("depasse le poids minimum accepte par les methodes retenues", () => {
    expect(POIDS_COLIS_DEFAUT_GRAMMES).toBeGreaterThan(15);
  });

  /*
   * LE DEFAUT TIENT DANS LES BORNES QUE LA BASE FAIT RESPECTER, et ce test
   * relie les deux moities de la correction. Un defaut de colonne hors des
   * bornes du CHECK rendrait la migration APPLICABLE mais toute ecriture
   * suivante impossible : la ligne existante passerait, la premiere
   * modification par l'ecran echouerait sans que rien n'ait prevenu.
   */
  it("le defaut de colonne respecte la borne haute du projet", () => {
    expect(POIDS_COLIS_DEFAUT_GRAMMES).toBeLessThanOrEqual(
      POIDS_COLIS_MAXIMUM_GRAMMES,
    );
  });
});
