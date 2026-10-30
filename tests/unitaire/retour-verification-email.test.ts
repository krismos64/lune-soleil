/**
 * Issue du lien de verification d'adresse email, LS-298.
 *
 * Better Auth ramene succes et echec sur le meme chemin, seul `error` les
 * distingue : ces cas fixent la lecture qu'en fait l'ecran.
 */
import { describe, expect, it } from "vitest";

import {
  issueVerification,
  RETOUR_APRES_VERIFICATION,
} from "@/lib/retour-verification-email";

describe("issueVerification", () => {
  it("ne dit rien hors retour de verification", () => {
    expect(issueVerification({})).toBeNull();
    expect(issueVerification({ error: "TOKEN_EXPIRED" })).toBeNull();
    expect(issueVerification({ verifie: "0" })).toBeNull();
  });

  it("annonce la reussite sans parametre d'erreur", () => {
    expect(issueVerification({ verifie: "1" })).toBe("REUSSIE");
  });

  it("fait passer l'erreur avant la reussite", () => {
    expect(issueVerification({ verifie: "1", error: "TOKEN_EXPIRED" })).toBe(
      "EXPIREE",
    );
    for (const code of ["INVALID_TOKEN", "USER_NOT_FOUND", "INVALID_USER"]) {
      expect(issueVerification({ verifie: "1", error: code })).toBe(
        "INVALIDE",
      );
    }
  });

  it("traite un code inconnu ou repete comme un echec", () => {
    expect(issueVerification({ verifie: "1", error: "" })).toBe("INVALIDE");
    expect(
      issueVerification({ verifie: "1", error: ["TOKEN_EXPIRED", "x"] }),
    ).toBe("INVALIDE");
  });

  it("ramene a un chemin relatif fixe", () => {
    expect(RETOUR_APRES_VERIFICATION).toBe("/compte?verifie=1");
  });
});
