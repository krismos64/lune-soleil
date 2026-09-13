/**
 * La table de destinations de la reauthentification d'administration, LS-227.
 *
 * ------------------------------------------------------------------
 * CE QUE CE FICHIER GARDE, ET POURQUOI IL COMPTE PLUS QU'IL N'EN A L'AIR.
 *
 * `lireDestination` ferme une REDIRECTION OUVERTE. Sans elle, un lien vers
 * `/administration/reauthentification?retour=https://exemple-malveillant.fr`
 * partirait de notre domaine, donc avec sa confiance, et ramenerait ailleurs
 * apres une saisie de mot de passe ou une passkey.
 *
 * LA MEME DOCTRINE VIT COTE CLIENT DEPUIS LS-54 ET N'ETAIT TESTEE NULLE PART,
 * constate en ecrivant ce fichier. Une garde de securite jamais exercee n'est
 * pas une garde : elle a l'air juste, et rien ne dit qu'elle le reste.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from "vitest";

import {
  DESTINATIONS,
  DESTINATION_PAR_DEFAUT,
  MOTIFS,
  lireDestination,
} from "@/app/administration/reauthentification/destinations";

describe("lireDestination, la garde de redirection ouverte", () => {
  it("reconnait les cles de la table", () => {
    for (const cle of Object.keys(DESTINATIONS)) {
      expect(lireDestination(cle)).toBe(cle);
    }
  });

  /*
   * LE CAS QUI PORTE LA GARANTIE, et il se decline en cinq formes reelles
   * d'attaque. Chacune est une forme QUE LE NAVIGATEUR SUIT, pas une valeur
   * inventee pour faire nombre :
   *
   *   - l'URL absolue, la forme evidente
   *   - le SCHEMA RELATIF `//exemple.fr`, que « commence par / » laisserait
   *     passer et que le navigateur resout vers l'exterieur. C'est le piege
   *     precis que la table par cle existe pour fermer
   *   - `javascript:` et `data:`, qui ne naviguent pas mais executent
   *   - le chemin interne d'apparence anodine, qui prouve que la garde refuse
   *     TOUT chemin et non seulement les hostiles
   */
  it.each([
    ["une URL absolue", "https://exemple-malveillant.fr"],
    ["un schema relatif", "//exemple-malveillant.fr"],
    ["un schema relatif avec chemin", "//exemple.fr/administration"],
    ["un javascript:", "javascript:alert(1)"],
    ["un data:", "data:text/html,<script>alert(1)</script>"],
    ["un chemin interne non declare", "/administration/commandes/42"],
    ["un chemin vers la connexion", "/administration/connexion"],
    ["une remontee de repertoire", "../../etc/passwd"],
  ])("refuse %s et retombe sur le defaut", (_libelle, valeur) => {
    expect(lireDestination(valeur)).toBe(DESTINATION_PAR_DEFAUT);
  });

  it("retombe sur le defaut quand le parametre est absent", () => {
    expect(lireDestination(undefined)).toBe(DESTINATION_PAR_DEFAUT);
  });

  it("retombe sur le defaut sur une cle inconnue", () => {
    expect(lireDestination("inexistante")).toBe(DESTINATION_PAR_DEFAUT);
  });

  /*
   * UN PARAMETRE REPETE ARRIVE EN TABLEAU, `?retour=a&retour=b`. Sans le
   * traitement du premier element, le tableau tomberait dans le `in` ou il
   * serait faux SANS QUE LE DEFAUT SE VOIE : la valeur legitime serait ignoree
   * et l'exploitante renvoyee au tableau de bord sans raison apparente.
   */
  it("retient le premier element d'un parametre repete", () => {
    expect(lireDestination(["parametres", "commandes"])).toBe("parametres");
  });

  it("retombe sur le defaut si le premier element est hostile", () => {
    expect(lireDestination(["//exemple.fr", "parametres"])).toBe(
      DESTINATION_PAR_DEFAUT,
    );
  });

  it("retombe sur le defaut sur un tableau vide", () => {
    expect(lireDestination([])).toBe(DESTINATION_PAR_DEFAUT);
  });
});

describe("la table elle-meme", () => {
  /*
   * TOUTE DESTINATION EST UN CHEMIN INTERNE ABSOLU, et ce test garde la table
   * contre son propre auteur : la garde de `lireDestination` ne vaut que si les
   * valeurs qu'elle rend sont sures. Une entree ajoutee un jour avec une URL
   * complete contournerait toute la protection en amont.
   *
   * `//` EST REFUSE ICI AUSSI, pour la meme raison que dans la garde.
   */
  it.each(Object.entries(DESTINATIONS))(
    "%s designe un chemin interne absolu",
    (_cle, chemin) => {
      expect(chemin.startsWith("/")).toBe(true);
      expect(chemin.startsWith("//")).toBe(false);
      expect(chemin).not.toMatch(/^\/*[a-z]+:/i);
    },
  );

  /*
   * CHAQUE DESTINATION PORTE SON MOTIF, critere 3. Une cle ajoutee sans motif
   * ferait rendre `undefined` a l'ecran, donc la phrase « Confirmez votre
   * identite undefined ». Le `Record` du type l'empeche a la compilation, ce
   * test l'empeche aussi si le type venait a s'elargir.
   */
  it("chaque destination porte un motif non vide", () => {
    for (const cle of Object.keys(DESTINATIONS)) {
      expect(MOTIFS[cle as keyof typeof DESTINATIONS]).toBeTruthy();
    }
  });

  it("le defaut est une cle de la table", () => {
    expect(DESTINATION_PAR_DEFAUT in DESTINATIONS).toBe(true);
  });
});
