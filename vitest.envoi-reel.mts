/**
 * Configuration a part pour l'envoi reel d'email, LS-82 critere 1.
 *
 * POURQUOI UNE CONFIGURATION SEPAREE ET NON UN PROJET DE PLUS.
 *
 * Un projet declare dans `vitest.config.mts` serait joue par `npm run test` :
 * chaque execution de la suite enverrait un vrai message et entamerait le quota
 * de 200 par heure de l'offre MX Plan, ADR-008. Le sortir par un `exclude`
 * marcherait aussi, mais laisserait le fichier a un `--project` distrait ou a
 * un futur elargissement de motif.
 *
 * Une configuration que rien n'importe ne peut etre jouee QUE volontairement,
 * par `npm run email:reel`. C'est le meme raisonnement que le defaut ferme des
 * routes internes : ce qui doit rester exceptionnel ne depend pas d'un filtre
 * qu'on peut oublier de maintenir.
 *
 * `tsconfigPaths` est repete ici : un projet Vitest n'herite pas du `resolve`
 * de la configuration englobante, et il n'y a de toute facon pas d'englobante.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: "envoi-reel",
    environment: "node",
    include: ["scripts/envoi-reel-email.test.ts"],
    // Un aller-retour SMTP depasse largement les cinq secondes par defaut,
    // surtout sur une premiere connexion qui negocie STARTTLS.
    testTimeout: 30_000,
  },
});
