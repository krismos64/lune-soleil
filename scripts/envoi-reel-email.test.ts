/**
 * Envoi d'un message vers une vraie boite, LS-82 critere 1. MANUEL.
 *
 * POURQUOI IL PORTE L'EXTENSION `.test.ts` SANS ETRE DANS LA SUITE.
 *
 * Il a besoin de Vitest pour deux choses que Node seul ne donne pas : la
 * resolution de l'alias `@/`, et la transpilation complete du TypeScript, dont
 * `smtp.ts` emploie une propriete de parametre que le mode strip-only de Node
 * refuse.
 *
 * Il vit dans `scripts/` et non dans `tests/`, donc HORS des deux motifs
 * `include` de `vitest.config.mts`, qui ne ramassent que `tests/unitaire/**` et
 * `tests/integration/**`. `npm run test` ne le jouera jamais. Sans cela, chaque
 * execution de la suite enverrait un vrai message et entamerait le quota de 200
 * par heure de l'offre MX Plan.
 *
 * POURQUOI IL N'AUTOMATISE PAS SA PROPRE VERIFICATION. Le critere 1 exige qu'un
 * email ARRIVE dans une boite reelle, sur deux fournisseurs differents. Rien
 * ici ne peut le constater : il faut regarder la boite. Ce fichier constate que
 * le serveur a ACCEPTE le message, ce qu'ADR-008 nomme explicitement comme
 * l'angle mort de la trace, et affiche ce qui reste a verifier de visu.
 *
 * C'EST LE SEUL CONTROLE QUI ATTRAPE UN DEFAUT D'AUTHENTIFICATION DE DOMAINE.
 * SPF, DKIM et DMARC sont publies et verifies par `dig` depuis le 8 aout 2026,
 * mais une configuration publiee n'est pas une configuration qui fonctionne :
 * les messages partent, la trace dit `ENVOYE`, et ils arrivent en indesirable.
 *
 * IL N'ECRIT RIEN EN BASE, volontairement. Il eprouve la chaine SMTP et le
 * rendu, pas l'outbox, qui a ses propres tests d'integration.
 *
 * Usage :
 *   EMAIL_TEST_DESTINATAIRE=quelquun@exemple.fr npm run email:reel
 *
 * Les identifiants viennent de `.env`, ne sont jamais affiches ni journalises,
 * invariant 9.
 */
import { describe, expect, it } from "vitest";

import {
  creerEnvoyeurSmtp,
  lireConfigurationSmtp,
} from "@/integrations/email/smtp";

/**
 * L'adresse vient d'une VARIABLE D'ENVIRONNEMENT et non d'un argument.
 *
 * Vitest valide sa propre ligne de commande et rejette toute option qu'il ne
 * connait pas : `--destinataire=...` le fait sortir en erreur avant meme de
 * charger ce fichier. Une valeur nue serait de son cote prise pour un motif de
 * nom de fichier. L'environnement est le seul canal qu'il laisse passer.
 */
const argumentDestinataire = process.env.EMAIL_TEST_DESTINATAIRE;

describe("envoi reel vers une boite de reception", () => {
  it("remet le message au serveur SMTP du domaine", async () => {
    if (!argumentDestinataire || !argumentDestinataire.includes("@")) {
      throw new Error(
        "Adresse manquante. Usage :\n" +
          "  EMAIL_TEST_DESTINATAIRE=quelquun@exemple.fr npm run email:reel",
      );
    }

    // LE NOM DES VARIABLES MANQUANTES REMONTE, JAMAIS LEUR VALEUR.
    const configuration = lireConfigurationSmtp();

    console.log(`Serveur    : ${configuration.hote}:${configuration.port}`);
    console.log(`Expediteur : ${configuration.expediteur}`);
    console.log(`Vers       : ${argumentDestinataire}`);

    const envoyeur = creerEnvoyeurSmtp(configuration);

    // LE MODELE D'ALERTE EST RETENU PARCE QU'IL NE PORTE AUCUN LIEN. Un lien de
    // verification pointerait vers un jeton inexistant, et un message de test
    // portant un lien mort ressemble a du hameconnage dans la boite
    // receptrice, ce qui fausserait justement l'observation du classement.
    const horodatage = new Date().toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
    });

    await expect(
      envoyeur.envoyer({
        destinataire: argumentDestinataire,
        modele: "alerte-connexion-administration",
        variables: { horodatage },
      }),
    ).resolves.toBeUndefined();

    console.log("");
    console.log("Le serveur a ACCEPTE le message.");
    console.log("Ce que cela ne prouve PAS, ADR-008 : qu'il soit arrive.");
    console.log("");
    console.log("Trois choses a constater dans la boite :");
    console.log("  1. le message est-il dans la boite de reception,");
    console.log("     ou dans le dossier indesirable ?");
    console.log("  2. l'expediteur s'affiche-t-il sans avertissement");
    console.log("     du type « expediteur non verifie » ?");
    console.log("  3. les accents sont-ils corrects ?");
  }, 30_000);
});
