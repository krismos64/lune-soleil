/**
 * Nom affiche et initiales de la barre laterale, LS-180.
 *
 * AUCUNE BASE DE DONNEES : les deux fonctions sous test sont pures, `lireEntete`
 * etant la seule du module a toucher le depot. Ce sont pourtant elles qui
 * decident ce qui s'affiche en tete de l'espace client sur NEUF ecrans.
 *
 * LE MODULE TESTE EST `lib/nom-affiche`, PAS LE SERVICE, et le premier jet de ce
 * fichier a etabli pourquoi : importer ces fonctions depuis `services/` tirait
 * `lib/prisma`, donc reclamait une `DATABASE_URL` pour verifier un decoupage de
 * chaine. Le test a echoue a l import, avant sa premiere assertion, et c est le
 * code qui a bouge.
 *
 * CE QUE CES TESTS FERMENT, ET QUI A ETE TROUVE PAR LA REVUE D'INTERFACE. Un
 * nom ne valant que des separateurs, `"..."` ou `"---"`, passait `trim` sans
 * etre vide : il s'affichait tel quel, puis `initialesClient` le decoupait sur
 * ces memes caracteres, n'obtenait aucun mot et rendait `"?"` dans la pastille.
 * Le layout affirme au contraire refuser « un nom vide ou un `?` » parce que
 * cela masquerait une anomalie derriere un affichage plausible.
 *
 * LE COMMENTAIRE AVAIT RAISON CONTRE LE CODE, et ces tests tiennent la promesse
 * du commentaire.
 */
import { describe, expect, it } from "vitest";

import { initialesClient, nomAffichable } from "@/lib/nom-affiche";

describe("nomAffichable", () => {
  it("rend le nom du profil quand il en porte un", () => {
    expect(nomAffichable("Marie Dupont", "marie@exemple.test")).toBe(
      "Marie Dupont",
    );
  });

  it("retire les espaces de bordure sans toucher au reste", () => {
    expect(nomAffichable("  Marie Dupont  ", "marie@exemple.test")).toBe(
      "Marie Dupont",
    );
  });

  /*
   * `nom` EST NULLABLE EN BASE, et le schema le dit : « la route d'inscription
   * en exige toujours un, donc aucune ligne ecrite par Better Auth ne le laisse
   * vide », mais un compte cree par un autre chemin n'a rien a y mettre. C'est
   * un cas nominal, pas une anomalie.
   */
  it("se rabat sur la partie locale de l'adresse quand le nom est absent", () => {
    expect(nomAffichable(null, "marie.dupont@exemple.test")).toBe(
      "marie.dupont",
    );
  });

  it("se rabat aussi sur une chaine vide ou faite d'espaces", () => {
    expect(nomAffichable("", "marie@exemple.test")).toBe("marie");
    expect(nomAffichable("   ", "marie@exemple.test")).toBe("marie");
  });

  /*
   * LE CAS TROUVE PAR LA REVUE. Ces quatre valeurs passent toutes `trim` en
   * restant non vides, et c'est ce qui rendait le defaut invisible : la garde
   * paraissait suffisante.
   *
   * `\p{L}` ET `\p{N}` PLUTOT QUE `[a-z0-9]`, et ce n'est pas de la coquetterie :
   * un nom francais porte des accents, et « Élodie » commence justement par un
   * caractere hors de l'alphabet ASCII. Une classe ASCII ferait basculer ce nom
   * sur le repli, c'est-a-dire afficherait l'adresse email de quelqu'un qui a
   * pourtant saisi son nom.
   */
  it("se rabat sur un nom ne portant aucune lettre ni chiffre", () => {
    expect(nomAffichable("...", "marie@exemple.test")).toBe("marie");
    expect(nomAffichable("---", "marie@exemple.test")).toBe("marie");
    expect(nomAffichable("_", "marie@exemple.test")).toBe("marie");
    expect(nomAffichable(" . - _ ", "marie@exemple.test")).toBe("marie");
  });

  it("garde un nom accentue, qu'une classe ASCII aurait rejete", () => {
    expect(nomAffichable("Élodie", "e@exemple.test")).toBe("Élodie");
    expect(nomAffichable("Éric-Noël", "e@exemple.test")).toBe("Éric-Noël");
  });

  /*
   * UN NOM D'UN SEUL CHIFFRE RESTE UN NOM. La fonction n'a pas a juger de la
   * vraisemblance de ce que la personne a saisi : elle ecarte ce qui ne peut
   * produire aucune initiale, rien de plus.
   */
  it("garde un nom reduit a un chiffre", () => {
    expect(nomAffichable("4", "marie@exemple.test")).toBe("4");
  });

  /*
   * UNE ADRESSE SANS ARROBASE NE DEVRAIT PAS EXISTER, la validation la refusant
   * en amont. Le repli rend alors l'adresse entiere plutot qu'une chaine vide :
   * afficher quelque chose de faux se remarque, afficher rien ne se remarque
   * pas.
   */
  it("rend l'adresse entiere si elle ne porte pas d'arrobase", () => {
    expect(nomAffichable(null, "adresse-sans-arobase")).toBe(
      "adresse-sans-arobase",
    );
  });
});

describe("initialesClient", () => {
  it("prend la premiere lettre des deux premiers mots", () => {
    expect(initialesClient("Marie Dupont")).toBe("MD");
  });

  it("s'arrete a deux lettres, quel que soit le nombre de mots", () => {
    expect(initialesClient("Marie Anne Claire Dupont")).toBe("MA");
  });

  it("rend une seule lettre sur un nom d'un seul mot", () => {
    expect(initialesClient("Marie")).toBe("M");
  });

  /*
   * LES TROIS AUTRES SEPARATEURS SERVENT LE REPLI SUR L'ADRESSE. Une partie
   * locale s'ecrit `marie.dupont`, `marie-dupont` ou `marie_dupont`, et doit
   * rendre « MD » plutot que « M ».
   *
   * C'EST L'ECART AVEC LA FONCTION JUMELLE DE L'ADMINISTRATION, dont le
   * commentaire dit que « le separateur n'est PAS l'espace » puisqu'elle ne
   * recoit jamais qu'une partie locale. Ici l'espace est au contraire le cas
   * le plus frequent, et les deux fonctions restent donc distinctes.
   */
  it("decoupe aussi sur le point, le tiret et le souligne", () => {
    expect(initialesClient("marie.dupont")).toBe("MD");
    expect(initialesClient("marie-dupont")).toBe("MD");
    expect(initialesClient("marie_dupont")).toBe("MD");
  });

  it("met les initiales en capitales", () => {
    expect(initialesClient("marie dupont")).toBe("MD");
  });

  it("garde l'accent d'une initiale accentuee", () => {
    expect(initialesClient("Élodie Renard")).toBe("ÉR");
  });

  /*
   * LE `?` RESTE LE CONTRAT DE CETTE FONCTION, et il est desormais INATTEIGNABLE
   * DEPUIS LE LAYOUT : `nomAffichable` ne lui passe plus jamais une chaine sans
   * lettre ni chiffre. Le garder protege un futur appelant qui n'aurait pas ce
   * filtre en amont, et le test dit lequel des deux porte la garantie.
   */
  it("rend un point d'interrogation sur une entree sans aucun mot", () => {
    expect(initialesClient("")).toBe("?");
    expect(initialesClient("   ")).toBe("?");
    expect(initialesClient("...")).toBe("?");
  });
});
