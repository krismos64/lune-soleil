/**
 * Lecture de l'issue d'une tentative de connexion. LS-80.
 *
 * CE MODULE EST PUR ET N'IMPORTE NI PRISMA NI LE SERVICE, ce qui est la raison
 * meme de son existence separee : la suite unitaire doit rester lancable sans
 * base ni Docker. La premiere version de ce test importait le hook, donc le
 * service, donc `DATABASE_URL` ; le script de mutation l'a attrape en etablissant
 * son etat de reference sans base.
 *
 * POURQUOI CES CAS MERITENT UN TEST UNITAIRE alors que les tests d'integration
 * couvrent deja reussite et echec : sur un parcours nominal, inverser les deux
 * branches de `lireResultat` produit le meme EFFET VISIBLE, une ligne dans le
 * journal. Seule la valeur de `issue` les separe, et seuls les cas limites,
 * session absente sans erreur, exposent le defaut ferme.
 *
 * C'est le motif rencontre en LS-70 sur `normaliserRole`, ou une mutation est
 * restee verte sur quinze tests parce qu'aucun n'observait la difference.
 */
import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";

import { lireResultat } from "@/lib/issue-connexion";

describe("lireResultat", () => {
  it("une APIError rendue par la route est un echec", () => {
    const resultat = lireResultat({
      returned: new APIError("UNAUTHORIZED", { message: "Invalid" }),
      newSession: { user: { id: "u1", email: "a@exemple.fr" } },
    });

    // L'ERREUR L'EMPORTE SUR LA SESSION. Si l'ordre des deux branches etait
    // inverse, ce cas passerait pour une reussite alors que la route a refuse.
    expect(resultat.issue).toBe("ECHEC");
    expect(resultat.utilisateurId).toBeNull();
  });

  it("une session neuve sans erreur est une reussite, et porte le compte", () => {
    const resultat = lireResultat({
      newSession: { user: { id: "u1", email: "a@exemple.fr" } },
    });

    expect(resultat.issue).toBe("REUSSITE");
    expect(resultat.utilisateurId).toBe("u1");
    expect(resultat.emailConfirme).toBe("a@exemple.fr");
  });

  /**
   * LE DEFAUT FERME, et le cas qu'aucun parcours nominal ne montre.
   *
   * Sans erreur ni session, la connexion n'est PAS acquise : c'est l'etat que
   * produit un defi a deux facteurs, qui remet `newSession` a null sans lever.
   * Le traiter en reussite ecrirait une connexion qui n'a pas eu lieu.
   */
  it("ni erreur ni session vaut echec, jamais reussite", () => {
    expect(lireResultat({}).issue).toBe("ECHEC");
    expect(lireResultat({ newSession: null }).issue).toBe("ECHEC");
    expect(lireResultat({ newSession: { user: undefined } }).issue).toBe(
      "ECHEC",
    );
  });

  it("un identifiant non textuel ne fabrique pas une reussite", () => {
    // Une base corrompue ou un greffon fautif pourrait rendre autre chose
    // qu'une chaine. Le defaut reste ferme plutot que d'ecrire un identifiant
    // inexploitable en croyant a une reussite.
    const resultat = lireResultat({
      newSession: { user: { id: 42 as unknown as string } },
    });

    expect(resultat.issue).toBe("ECHEC");
    expect(resultat.utilisateurId).toBeNull();
  });

  it("une reussite sans email lisible reste une reussite", () => {
    const resultat = lireResultat({ newSession: { user: { id: "u1" } } });

    expect(resultat.issue).toBe("REUSSITE");
    expect(resultat.utilisateurId).toBe("u1");
    // L'appelant retombera sur l'adresse saisie dans le corps de la requete.
    expect(resultat.emailConfirme).toBeNull();
  });
});
