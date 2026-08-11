/**
 * Secret partage des routes internes. LS-72, invariant 2.
 *
 * TEST UNITAIRE ET NON D'INTEGRATION : `secret-cron.ts` n'importe rien du
 * projet, volontairement, et la suite unitaire doit rester lancable sans base
 * ni Docker. Meme motif que `mot-de-passe.ts` et `issue-connexion.ts`.
 *
 * LE SECRET UTILISE ICI EST UNE CONSTANTE DE TEST, jamais lue depuis `.env` :
 * un test qui dependrait de la vraie valeur echouerait sur une machine neuve
 * et, pire, ferait entrer le secret reel dans la sortie d'un test en echec.
 */
import { afterEach, describe, expect, it } from "vitest";

import { ENTETE_SECRET_CRON, secretCronValide } from "@/lib/secret-cron";

const SECRET_DE_TEST = "secret-de-test-uniquement-jamais-en-production";

const original = process.env.CRON_SHARED_SECRET;

afterEach(() => {
  if (original === undefined) {
    delete process.env.CRON_SHARED_SECRET;
  } else {
    process.env.CRON_SHARED_SECRET = original;
  }
});

function enTetes(valeur?: string): Headers {
  const h = new Headers();
  if (valeur !== undefined) {
    h.set(ENTETE_SECRET_CRON, valeur);
  }
  return h;
}

describe("secretCronValide", () => {
  it("accepte le secret exact", () => {
    process.env.CRON_SHARED_SECRET = SECRET_DE_TEST;

    expect(secretCronValide(enTetes(SECRET_DE_TEST))).toBe(true);
  });

  it("refuse un secret faux de meme longueur", () => {
    process.env.CRON_SHARED_SECRET = SECRET_DE_TEST;

    // MEME LONGUEUR, un seul caractere different : c'est le cas que
    // `timingSafeEqual` traite reellement, les longueurs differentes etant
    // ecartees avant lui.
    const faux = `${SECRET_DE_TEST.slice(0, -1)}X`;
    expect(faux).toHaveLength(SECRET_DE_TEST.length);
    expect(secretCronValide(enTetes(faux))).toBe(false);
  });

  it("refuse un secret plus court ou plus long", () => {
    process.env.CRON_SHARED_SECRET = SECRET_DE_TEST;

    expect(secretCronValide(enTetes(SECRET_DE_TEST.slice(0, -1)))).toBe(false);
    expect(secretCronValide(enTetes(`${SECRET_DE_TEST}X`))).toBe(false);
  });

  it("refuse un en-tete absent", () => {
    process.env.CRON_SHARED_SECRET = SECRET_DE_TEST;

    expect(secretCronValide(enTetes())).toBe(false);
  });

  it("refuse un en-tete vide", () => {
    process.env.CRON_SHARED_SECRET = SECRET_DE_TEST;

    expect(secretCronValide(enTetes(""))).toBe(false);
  });

  /**
   * LE DEFAUT FERME, et le cas qu'aucun parcours nominal ne montre.
   *
   * Sans secret configure, la fonction refuse TOUT LE MONDE, y compris le
   * cron. Une tache qui ne tourne pas se remarque ; une route interne ouverte
   * a tous ne se remarque pas.
   *
   * La formulation inverse, « pas de secret configure donc on laisse passer »,
   * marche parfaitement en developpement ou personne ne configure rien, et
   * publie deux routes internes le jour du deploiement.
   */
  it("refuse tout quand aucun secret n'est configure", () => {
    delete process.env.CRON_SHARED_SECRET;

    expect(secretCronValide(enTetes("n-importe-quoi"))).toBe(false);
    expect(secretCronValide(enTetes(""))).toBe(false);
    expect(secretCronValide(enTetes())).toBe(false);
  });

  it("refuse tout quand le secret configure est vide", () => {
    // Cas d'un `.env` ou la ligne existe sans valeur, ce qui est la forme
    // exacte de `.env.example` : recopier le fichier sans le remplir ne doit
    // pas ouvrir les routes.
    process.env.CRON_SHARED_SECRET = "";

    expect(secretCronValide(enTetes(""))).toBe(false);
    expect(secretCronValide(enTetes("n-importe-quoi"))).toBe(false);
  });

  it("l'en-tete est insensible a la casse, comme tout en-tete HTTP", () => {
    process.env.CRON_SHARED_SECRET = SECRET_DE_TEST;

    const h = new Headers();
    h.set("X-Cron-Secret", SECRET_DE_TEST);

    // `Headers` normalise les noms : ce test ancre le fait qu'un cron ecrivant
    // l'en-tete en majuscules est accepte, cas frequent des clients HTTP.
    expect(secretCronValide(h)).toBe(true);
  });
});
