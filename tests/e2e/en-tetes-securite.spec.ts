/**
 * Les en-tetes de securite, mesures sur des reponses REELLES. ADR-038, LS-139.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE FICHIER EXISTE A COTE D'UN CONTROLE TEXTUEL.
 *
 * `verifier-en-tetes-securite.sh` verifie que les en-tetes sont DECLARES. Il ne
 * peut pas verifier qu'ils sont SERVIS, et l'ecart entre les deux est
 * exactement le piege de nginx : `add_header` dans un `location` REMPLACE le jeu
 * herite du bloc serveur au lieu de s'y ajouter. Une declaration parfaite peut
 * donc ne jamais atteindre le navigateur.
 *
 * CE FICHIER MESURE LA REPONSE. Les deux sont necessaires et aucun ne remplace
 * l'autre : le script attrape la declaration manquante des son ecriture, ce
 * fichier prouve que le client la recoit.
 *
 * CE QU'IL NE COUVRE PAS, ET IL FAUT LE DIRE : les quatre en-tetes de nginx ne
 * sont PAS servis ici, la suite s'adressant a `next start` sans proxy devant.
 * Seule la CSP, posee par l'application, est mesurable en test. Les quatre
 * autres se verifient sur la production, et LS-139 le fait dans son critere 1.
 * ------------------------------------------------------------------
 */
import { expect, test } from "@playwright/test";

/**
 * Les pages qui comptent, et pourquoi celles-la.
 *
 * Une par famille de rendu : l'accueil et le catalogue portent du JSON-LD, le
 * panier et le tunnel portent de l'interaction, l'administration porte un
 * formulaire d'authentification. Une CSP qui casserait n'en casserait pas
 * forcement plus d'une.
 */
const PAGES = [
  "/",
  "/catalogue",
  "/aide",
  "/informations-legales",
  "/panier",
  "/administration/connexion",
];

test.describe("En-tetes de securite", () => {
  test("la CSP est servie sur chaque page publique", async ({ request }) => {
    for (const chemin of PAGES) {
      const reponse = await request.get(chemin);
      expect(reponse.status(), `statut de ${chemin}`).toBe(200);

      const csp = reponse.headers()["content-security-policy"];
      expect(csp, `CSP absente sur ${chemin}`).toBeTruthy();

      /*
       * LES DIRECTIVES QUI FERMENT QUELQUE CHOSE, et non la seule presence de
       * l'en-tete : une CSP reduite a `default-src 'self'` passerait un test qui
       * verifie juste qu'elle existe, en laissant ouvert tout ce qui compte.
       */
      expect(csp, `frame-ancestors sur ${chemin}`).toContain(
        "frame-ancestors 'none'",
      );
      expect(csp, `object-src sur ${chemin}`).toContain("object-src 'none'");
      expect(csp, `base-uri sur ${chemin}`).toContain("base-uri 'self'");
      expect(csp, `form-action sur ${chemin}`).toContain("form-action 'self'");
    }
  });

  test("script-src porte un nonce et jamais unsafe-inline", async ({
    request,
  }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"];
    expect(csp, "CSP absente sur l'accueil").toBeTruthy();

    /*
     * LA DIRECTIVE EST ISOLEE AVANT D'ETRE JUGEE. Chercher `unsafe-inline` dans
     * toute la politique accuserait `style-src`, qui le porte legitimement : les
     * attributs `style=` que React pose sur les images n'executent rien.
     */
    const scriptSrc = (csp ?? "")
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));

    expect(scriptSrc, "script-src absente").toBeTruthy();
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(
      scriptSrc,
      "unsafe-inline sur script-src annule l'essentiel de la protection",
    ).not.toContain("unsafe-inline");

    /*
     * `unsafe-eval` N'A RIEN A FAIRE EN PRODUCTION. React ne l'emploie qu'en
     * developpement, pour reconstruire les piles d'erreur serveur. La suite
     * tourne sur un build de production, `next start` : le trouver ici
     * signifierait que la condition d'environnement ne joue pas.
     */
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  test("le nonce change a chaque requete", async ({ request }) => {
    /*
     * C'EST LA PROPRIETE QUI FAIT TENIR TOUTE LA POLITIQUE. Un nonce fige est
     * devinable, donc reutilisable par un script injecte : la CSP resterait
     * ecrite, parfaitement visible, et ne protegerait plus rien.
     *
     * Le defaut serait invisible autrement : la page fonctionne, l'en-tete est
     * la, et seule une comparaison entre deux reponses le montre.
     */
    const lire = async () => {
      const csp = (await request.get("/")).headers()["content-security-policy"];
      return /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp ?? "")?.[1];
    };

    const premier = await lire();
    const second = await lire();

    expect(premier, "aucun nonce dans la politique").toBeTruthy();
    expect(second).toBeTruthy();
    expect(premier, "le nonce est fige entre deux requetes").not.toBe(second);
  });

  test("le nonce de l'en-tete est celui des scripts inline", async ({
    request,
  }) => {
    /*
     * UN NONCE QUI NE CORRESPOND PAS EST PIRE QU'ABSENT : le navigateur bloque
     * les scripts, la page ne s'hydrate plus, et l'en-tete donne l'impression
     * que tout est en place. La correspondance se mesure donc sur UNE SEULE
     * reponse, jamais entre deux appels, chaque requete ayant son nonce.
     */
    const reponse = await request.get("/");
    const csp = reponse.headers()["content-security-policy"];
    const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp ?? "")?.[1];
    expect(nonce).toBeTruthy();

    const html = await reponse.text();

    /*
     * TOUT SCRIPT INLINE DOIT PORTER LE NONCE. Le JSON-LD des donnees
     * structurees en fait partie, et son blocage serait INVISIBLE a l'oeil :
     * aucune page ne change, le referencement se degrade des semaines plus tard
     * sans qu'on relie les deux.
     */
    const inlines = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)].map(
      (m) => m[1] ?? "",
    );

    expect(
      inlines.length,
      "aucun script inline trouve dans la page",
    ).toBeGreaterThan(0);

    for (const attributs of inlines) {
      expect(
        attributs,
        `un script inline ne porte pas le nonce : ${attributs.slice(0, 60)}`,
      ).toContain(`nonce="${nonce}"`);
    }
  });

  test("le JSON-LD reste lisible par les moteurs", async ({ request }) => {
    /*
     * LA CONSEQUENCE METIER DU BLOC PRECEDENT, verifiee pour elle-meme : la CSP
     * ne doit pas avoir fait disparaitre les donnees structurees. Un test qui
     * regarde le nonce sans regarder le CONTENU passerait sur une page dont le
     * JSON-LD aurait ete supprime pour contourner le probleme.
     */
    const html = await (await request.get("/")).text();

    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@context":"https://schema.org"');
  });
});
