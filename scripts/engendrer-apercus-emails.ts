/**
 * Engendre un apercu HTML de chaque email, LS-222.
 *
 * A QUOI CELA SERT. L'exploitante doit voir ses messages avant qu'ils partent,
 * et elle n'a ni terminal ni base de donnees. Ce script ecrit des fichiers HTML
 * autonomes qu'un double-clic ouvre, et le dossier entier s'envoie par email ou
 * se pose sur une cle.
 *
 * POURQUOI DES FICHIERS ET NON UNE ROUTE. Une route `/apercu-emails`
 * demanderait de lancer l'application ET la base, et il faudrait garantir
 * qu'elle n'existe pas en production. Des fichiers statiques n'ont ni l'une ni
 * l'autre de ces contraintes. Arbitrage de Christophe du 12 septembre 2026.
 *
 * POURQUOI IL EST LANCE PAR VITEST, ce qui surprend pour un script. Il importe
 * le code applicatif, qui emploie l'alias `@/`. Node ne le resout pas, et
 * `vite-node` n'est pas installe : le lancer par Vitest evite d'ajouter une
 * dependance et une configuration de resolution pour un outil d'apercu.
 * `npm run apercus-emails` cache cette mecanique.
 *
 * LE LOGO EST EN BASE64 DANS L'APERCU, ET SEULEMENT LA. Les vrais emails le
 * portent en piece jointe `cid:`, qu'un navigateur ne sait pas resoudre dans un
 * fichier isole : sans cette substitution, l'exploitante verrait une image
 * cassee sur les quinze apercus et croirait a un defaut. C'est une
 * transformation d'AFFICHAGE, elle ne touche ni le gabarit ni l'envoi.
 *
 * LES DONNEES SONT FICTIVES ET LE DISENT. Aucun nom, aucune commande ni aucun
 * montant reel n'entre ici. Les domaines sont en `.invalid`, reserve par la
 * RFC 2606 et qui ne peut pas exister : un apercu qui porterait une vraie
 * adresse finirait recopie.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { CID_LOGO, habillerEnHtml } from "@/integrations/email/gabarit-html";
import { NOM_BOUTIQUE } from "@/lib/seo";
import { MODELES_RENDUS, rendreModele } from "@/integrations/email/modeles";
import type { ModeleEmail } from "@/integrations/email";

const SORTIE = join(process.cwd(), "apercus-emails");

/**
 * Les variables d'exemple, un jeu par modele, avec le titre que lit
 * l'exploitante.
 *
 * LE TITRE N'EST PAS L'OBJET DU MESSAGE. Il decrit QUAND le message part, ce
 * que l'objet ne dit pas : « Changement d'adresse, message a la NOUVELLE
 * adresse » et « a l'ANCIENNE » se distinguent ainsi, alors que leurs objets
 * se ressemblent.
 */
const EXEMPLES: Record<
  ModeleEmail,
  { titre: string; variables: Record<string, string> }
> = {
  "verification-adresse": {
    titre: "Vérification de l'adresse email, à l'inscription",
    variables: { lien: "https://lune-soleil.fr/verifier/jeton-exemple" },
  },
  "reinitialisation-mot-de-passe": {
    titre: "Réinitialisation du mot de passe",
    variables: { lien: "https://lune-soleil.fr/reinitialiser/jeton-exemple" },
  },
  "alerte-connexion-administration": {
    titre: "Alerte de connexion à l'administration",
    variables: { horodatage: "12 septembre 2026 à 14 h 05" },
  },
  "message-contact-recu": {
    titre: "Un visiteur écrit par le formulaire, message à l'atelier",
    variables: {
      nom: "Camille Dupont",
      email: "camille.dupont@exemple.invalid",
      sujet: "Une question sur un bracelet",
      date: "12 septembre 2026",
    },
  },
  "message-contact-accuse": {
    titre: "Accusé de réception au visiteur qui a écrit",
    variables: { sujet: "Une question sur un bracelet" },
  },
  "changement-adresse-verification": {
    titre: "Changement d'adresse, message à la NOUVELLE adresse",
    variables: { lien: "https://lune-soleil.fr/changement/jeton-exemple" },
  },
  "changement-adresse-avertissement": {
    titre: "Changement d'adresse, avertissement à l'ANCIENNE adresse",
    variables: {
      lien: "https://lune-soleil.fr/refuser/jeton-exemple",
      nouvelleAdresse: "nouvelle.adresse@exemple.invalid",
    },
  },
  "commande-confirmee": {
    titre: "Confirmation de commande, après le paiement",
    variables: {
      numero: "C-2026-0042",
      lienFacture: "https://lune-soleil.fr/facture/jeton-exemple",
      lienRetractation: "https://lune-soleil.fr/retractation/jeton-exemple",
    },
  },
  "expedition-en-route": {
    titre: "Le colis est parti, avec son suivi",
    variables: {
      numero: "C-2026-0042",
      mode: "Point relais",
      numeroSuivi: "6A12345678901",
    },
  },
  "retractation-accusee": {
    titre: "Accusé de réception d'une rétractation",
    variables: { numero: "C-2026-0042", jourLimite: "26/09/2026" },
  },
  "remboursement-envoye": {
    titre: "Remboursement effectué, avec son avoir",
    variables: {
      numero: "C-2026-0042",
      montant: "49,00 €",
      numeroAvoir: "A-2026-0007",
    },
  },
  "invitation-avis": {
    titre: "Invitation à déposer un avis, après la livraison",
    variables: {
      lien: "https://lune-soleil.fr/avis/jeton-exemple",
      numero: "C-2026-0042",
      pieces: "un bracelet en argent martelé",
      delaiPublicationJours: "7",
    },
  },
  "admin-commande-payee": {
    titre: "Une commande vient d'être payée",
    variables: {
      numero: "C-2026-0042",
      montant: "49,00 €",
      nombreArticles: "2",
    },
  },
  "admin-retractation-demandee": {
    titre: "Un client demande à se rétracter",
    variables: {
      numero: "C-2026-0042",
      nom: "camille.dupont@exemple.invalid",
      date: "12 septembre 2026",
    },
  },
  "admin-incident-critique": {
    titre: "Incident critique à traiter",
    variables: {
      type: "DOUBLE_ENCAISSEMENT",
      description:
        "Deux sessions de paiement ont abouti pour la commande C-2026-0042.",
      date: "12 septembre 2026",
    },
  },
};

/**
 * Echappe pour la page d'accueil, qui affiche des objets de message.
 *
 * ELLE EST NECESSAIRE MEME SUR DES DONNEES QUE J'ECRIS : un objet de modele
 * porte des variables, et le jour ou l'un d'eux contiendra un chevron, la page
 * d'index se casserait en silence.
 */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

it("engendre les apercus de tous les emails", () => {
  const logoBase64 = readFileSync(
    join(process.cwd(), "public", "habillage", "icone-512.png"),
  ).toString("base64");

  /*
   * LE DOSSIER EST RECREE A CHAQUE EXECUTION. Sans cela, un modele retire du
   * code laisserait son apercu sur le disque, et l'exploitante validerait un
   * message qui ne part plus.
   */
  rmSync(SORTIE, { recursive: true, force: true });
  mkdirSync(SORTIE, { recursive: true });

  const engendres: { modele: string; titre: string; objet: string }[] = [];

  for (const modele of MODELES_RENDUS) {
    const exemple = EXEMPLES[modele];

    /*
     * UN MODELE SANS EXEMPLE FAIT ECHOUER, il ne s'ignore pas. Le sauter
     * produirait un dossier incomplet que rien ne signale, et l'exploitante
     * validerait quatorze messages sur quinze en croyant les avoir tous vus.
     *
     * LA LISTE VIENT DE `MODELES_RENDUS`, relevee sur la table qui rend : un
     * modele ajoute au code sans exemple ici arrete ce script, ce qui est le
     * seul moyen de garder l'apercu complet sans le recompter a la main.
     */
    expect(
      exemple,
      `Le modele « ${modele} » n'a aucun exemple dans ce script : l'ajouter a EXEMPLES, sinon l'apercu serait incomplet en silence.`,
    ).toBeDefined();

    const rendu = rendreModele({
      modele,
      destinataire: "destinataire@exemple.invalid",
      variables: exemple.variables,
    });

    const html = habillerEnHtml(rendu).replace(
      `cid:${CID_LOGO}`,
      `data:image/png;base64,${logoBase64}`,
    );

    writeFileSync(join(SORTIE, `${modele}.html`), html, "utf8");

    engendres.push({ modele, titre: exemple.titre, objet: rendu.objet });
  }

  const carte = (entree: (typeof engendres)[number]): string =>
    `<li><a href="${entree.modele}.html">${echapper(entree.titre)}</a>
<span class="objet">Objet du message : <strong>${echapper(entree.objet)}</strong></span></li>`;

  const index = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aperçu des emails, ${echapper(NOM_BOUTIQUE)}</title>
<style>
  body { margin:0; padding:24px 16px; background:#f2eadf; color:#3b2f2a;
         font-family:Georgia,'Times New Roman',serif; line-height:1.6; }
  main { max-width:760px; margin:0 auto; }
  h1 { font-size:28px; margin:0 0 8px; }
  .chapeau { color:#7a6a5d; margin:0 0 32px; }
  h2 { font-size:18px; margin:32px 0 12px; padding-bottom:6px;
       border-bottom:1px solid #d9cdba; }
  ul { list-style:none; padding:0; margin:0; }
  li { background:#fff; border:1px solid #d9cdba; border-radius:8px;
       padding:16px; margin:0 0 12px; }
  a { color:#5f4519; font-size:18px; text-decoration:none; font-weight:bold; }
  a:hover { text-decoration:underline; }
  .objet { display:block; margin-top:6px; color:#7a6a5d; font-size:15px; }
  .objet strong { color:#3b2f2a; font-weight:normal; }
  footer { margin-top:40px; color:#7a6a5d; font-size:14px; }
</style>
</head>
<body>
<main>
<h1>Les emails de la boutique</h1>
<p class="chapeau">
Voici tous les messages que la boutique peut envoyer. Cliquez sur un titre pour
voir le message tel qu'il arrivera dans la boîte du destinataire. Les noms,
numéros et montants sont inventés.
</p>

<h2>Messages envoyés au client</h2>
<ul>
${engendres
  .filter((entree) => !entree.modele.startsWith("admin-"))
  .map(carte)
  .join("\n")}
</ul>

<h2>Messages envoyés à l'atelier</h2>
<ul>
${engendres
  .filter((entree) => entree.modele.startsWith("admin-"))
  .map(carte)
  .join("\n")}
</ul>

<footer>
<p>
${engendres.length} messages. La facture n'a pas de message à elle : elle est
jointe par un lien dans la confirmation de commande.
</p>
</footer>
</main>
</body>
</html>`;

  writeFileSync(join(SORTIE, "index.html"), index, "utf8");

  // Le chemin est imprime pour qu'il soit copiable depuis le terminal.
  console.info(`${engendres.length} apercus engendres dans apercus-emails/`);
  console.info(`Ouvrir : ${join(SORTIE, "index.html")}`);

  expect(engendres.length).toBe(MODELES_RENDUS.length);
});
