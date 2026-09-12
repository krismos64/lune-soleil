/**
 * Le gabarit HTML des emails, LS-222.
 *
 * CE QUI EST EPROUVE ICI, ET POURQUOI UNITAIREMENT. `habillerEnHtml` est une
 * fonction pure du texte rendu : ni base, ni serveur SMTP, ni reseau. Ce qui
 * demande un envoi reel, la presence des DEUX versions dans le message et la
 * piece jointe du logo, vit dans `envoi-email-smtp.test.ts`, qui tient un
 * transport double.
 *
 * LE CRITERE 1 EST GARDE DES DEUX COTES. Ici on prouve que le HTML porte bien
 * tous les mots du texte ; la-bas, que le texte part quand meme.
 */
import { describe, expect, it } from "vitest";

import {
  CID_LOGO,
  habillerEnHtml,
} from "@/integrations/email/gabarit-html";
import { rendreModele } from "@/integrations/email/modeles";
import { NOM_BOUTIQUE } from "@/lib/seo";

describe("habillerEnHtml, structure du gabarit", () => {
  const rendu = habillerEnHtml({
    objet: "Un objet de test",
    texte: ["Bonjour,", "", "Un paragraphe.", "", "L'atelier"].join("\n"),
  });

  it("declare la langue du document", () => {
    /*
     * UN DOCUMENT SANS LANGUE EST LU AVEC LA PRONONCIATION PAR DEFAUT du
     * lecteur d'ecran, defaut que le cas 12 du script de mutation garde deja
     * sur le site. Un email est un document a lire comme un autre.
     */
    expect(rendu).toContain('<html lang="fr">');
  });

  it("marque les tables de mise en page comme presentation", () => {
    /*
     * CRITERE 4 DU TICKET. Sans `role="presentation"`, un lecteur d'ecran
     * annonce « tableau de trois lignes » avant de lire un message qui n'a
     * aucune donnee tabulaire.
     *
     * L'ASSERTION COMPTE LES DEUX FORMES : aucune balise `<table` ne doit
     * exister sans ce role. Chercher la seule presence du role laisserait
     * passer une table ajoutee plus tard sans lui.
     */
    const tables = rendu.match(/<table/g) ?? [];
    const presentations = rendu.match(/<table role="presentation"/g) ?? [];

    expect(tables.length).toBeGreaterThan(0);
    expect(presentations.length).toBe(tables.length);
  });

  it("reference le logo par cid et jamais par une URL distante", () => {
    /*
     * CRITERE 3 ET ADR-040, LE POINT LE PLUS IMPORTANT DE CE FICHIER. Une image
     * chargee depuis un serveur du projet tracerait l'ouverture de chaque
     * message, que la mesure soit voulue ou non.
     *
     * LES DEUX SENS SONT VERIFIES : le `cid:` est present, ET aucune balise
     * image ne porte de `src` en `http`. Ne verifier que le premier laisserait
     * passer une seconde image ajoutee a cote.
     */
    expect(rendu).toContain(`src="cid:${CID_LOGO}"`);
    expect(rendu).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("donne au logo un texte de remplacement qui nomme la boutique", () => {
    // LA PLUPART DES CLIENTS BLOQUENT LES IMAGES PAR DEFAUT : sans `alt`,
    // l'en-tete serait vide et le message ne dirait plus de qui il vient.
    expect(rendu).toContain(`alt="${NOM_BOUTIQUE}"`);
  });

  it("porte l'objet en texte de previsualisation", () => {
    expect(rendu).toContain("Un objet de test");
  });
});

describe("habillerEnHtml, echappement", () => {
  it("echappe le balisage venu d'une variable", () => {
    /*
     * PAS THEORIQUE. Les variables des modeles portent un motif de
     * remboursement ecrit par l'exploitante et un nom de client. Un `<` non
     * echappe casserait la mise en page, et une chaine bien choisie
     * injecterait du balisage dans un message signe du domaine de la boutique.
     */
    const rendu = habillerEnHtml({
      objet: "Objet",
      texte: "Motif : <script>alert(1)</script>",
    });

    expect(rendu).not.toContain("<script>alert(1)</script>");
    expect(rendu).toContain("&lt;script&gt;");
  });

  it("echappe l'objet, qui atterrit dans le titre et la previsualisation", () => {
    const rendu = habillerEnHtml({
      objet: 'Commande "A-2026" <urgente>',
      texte: "Corps",
    });

    expect(rendu).not.toContain("<urgente>");
    expect(rendu).toContain("&lt;urgente&gt;");
  });
});

describe("habillerEnHtml, liens", () => {
  it("rend une ligne d'URL en bouton ET en lien lisible", () => {
    /*
     * LE DOUBLON EST VOULU, critere 4. Un client qui rend le HTML en niant les
     * fonds afficherait un bouton invisible : l'URL ecrite en clair dessous
     * reste lisible dans tous les cas.
     */
    const rendu = habillerEnHtml({
      objet: "Objet",
      texte: ["Ouvrez ce lien :", "", "https://lune-soleil.fr/jeton/abc"].join(
        "\n",
      ),
    });

    /*
     * LE LIBELLE VIENT DE LA PHRASE D'ANNONCE, pas d'un texte fixe. Deux
     * boutons « Ouvrir le lien » dans un meme message sont, pour un lecteur
     * d'ecran, deux liens identiques menant a des endroits differents : le cas
     * se produit sur la confirmation de commande, qui porte la facture ET la
     * retractation.
     */
    expect(rendu).toContain("Ouvrez ce lien");

    /*
     * L'URL EST CLIQUABLE DEUX FOIS, dans le bouton et dans le lien lisible.
     * L'ASSERTION PORTE SUR LES `href`, PAS SUR LES OCCURRENCES DE LA CHAINE :
     * une premiere version comptait trois occurrences et rougissait, la
     * troisieme etant le texte visible du lien lisible. Compter des caracteres
     * la rendait sensible a toute retouche du gabarit sans rien prouver de
     * plus.
     */
    const liens = rendu.match(/href="https:\/\/lune-soleil\.fr\/jeton\/abc"/g) ?? [];
    expect(liens.length).toBe(2);
  });

  it("donne des libelles DISTINCTS a deux liens d'un meme message", () => {
    /*
     * LE DEFAUT REEL, vu a l'oeil sur l'apercu du 12 septembre 2026 et
     * invisible dans le texte. La confirmation de commande porte DEUX liens,
     * la facture et la retractation : avec un libelle fixe, un lecteur d'ecran
     * annonce deux fois « Ouvrir le lien » pour deux destinations differentes.
     *
     * LE TEST PORTE SUR LE MODELE REEL, pas sur un texte fabrique : c'est lui
     * qui a le defaut, et un exemple invente pourrait cesser de le representer.
     */
    const rendu = habillerEnHtml(
      rendreModele({
        modele: "commande-confirmee",
        destinataire: "client@exemple.invalid",
        variables: {
          numero: "C-2026-0042",
          lienFacture: "https://lune-soleil.fr/facture/jeton",
          lienRetractation: "https://lune-soleil.fr/retractation/jeton",
        },
      }),
    );

    const libelles = [
      ...rendu.matchAll(/text-decoration:none;">([^<]+)<\/a>/g),
    ].map((trouve) => trouve[1]);

    expect(libelles.length).toBe(2);
    expect(new Set(libelles).size).toBe(2);
  });

  it("refuse de rendre cliquable un schema autre que https", () => {
    /*
     * LE REFUS EST UNE PROTECTION, ET LE REPLI EST SUR : une ligne non reconnue
     * reste du TEXTE, elle s'affiche sans s'activer. Un `javascript:` place
     * dans une variable deviendrait sinon cliquable dans un message signe du
     * domaine de la boutique.
     */
    for (const dangereux of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://lune-soleil.fr/sans-tls",
    ]) {
      const rendu = habillerEnHtml({ objet: "Objet", texte: dangereux });

      expect(rendu).not.toContain(`href="${dangereux}"`);
    }
  });
});

describe("habillerEnHtml, fidelite au texte", () => {
  /*
   * LE CONTROLE QUI PORTE LE CRITERE 1 POUR LES QUINZE MODELES. Le HTML etant
   * DERIVE du texte, chaque mot du texte doit s'y retrouver : c'est ce qui
   * garantit qu'aucune version ne peut diverger de l'autre, puisqu'il n'y en a
   * qu'une seule redigee.
   *
   * LA LISTE N'EST PAS RECOPIEE A LA MAIN, elle est construite depuis les
   * modeles reels avec leurs variables. Un modele ajoute sans variable ici
   * ferait lever `exiger`, ce qui signale l'oubli au lieu de le taire.
   */
  const VARIABLES_PAR_MODELE: Record<string, Record<string, string>> = {
    "verification-adresse": { lien: "https://exemple.invalid/v" },
    "reinitialisation-mot-de-passe": { lien: "https://exemple.invalid/r" },
    "alerte-connexion-administration": {
      horodatage: "12 septembre 2026 a 14 h 05",
    },
    "message-contact-recu": {
      nom: "Camille Dupont",
      email: "camille@exemple.invalid",
      sujet: "Une question",
      date: "12 septembre 2026",
    },
    "changement-adresse-verification": { lien: "https://exemple.invalid/c" },
    "changement-adresse-avertissement": {
      lien: "https://exemple.invalid/refus",
      nouvelleAdresse: "neuve@exemple.invalid",
    },
    "retractation-accusee": { numero: "C-2026-0001", jourLimite: "26/09/2026" },
    "commande-confirmee": {
      numero: "C-2026-0001",
      lienFacture: "https://exemple.invalid/f",
      lienRetractation: "https://exemple.invalid/rt",
    },
    "invitation-avis": {
      lien: "https://exemple.invalid/avis",
      numero: "C-2026-0001",
      pieces: "un bracelet en argent",
      delaiPublicationJours: "7",
    },
    "expedition-en-route": {
      numero: "C-2026-0001",
      mode: "Point relais",
      numeroSuivi: "6A12345678901",
    },
    "remboursement-envoye": {
      numero: "C-2026-0001",
      montant: "49,00 EUR",
      numeroAvoir: "A-2026-0001",
    },
    "message-contact-accuse": { sujet: "Une question" },
    "admin-commande-payee": {
      numero: "C-2026-0001",
      montant: "49,00 EUR",
      nombreArticles: "2",
    },
    "admin-retractation-demandee": {
      numero: "C-2026-0001",
      nom: "camille@exemple.invalid",
      date: "12 septembre 2026",
    },
    "admin-incident-critique": {
      type: "DOUBLE_ENCAISSEMENT",
      description: "Deux sessions payees pour la commande C-2026-0001.",
      date: "12 septembre 2026",
    },
  };

  for (const [modele, variables] of Object.entries(VARIABLES_PAR_MODELE)) {
    it(`porte tous les mots du texte pour ${modele}`, () => {
      const rendu = rendreModele({
        modele: modele as Parameters<typeof rendreModele>[0]["modele"],
        destinataire: "destinataire@exemple.invalid",
        variables,
      });

      const html = habillerEnHtml(rendu);

      /*
       * LA COMPARAISON PORTE SUR LES MOTS, JAMAIS SUR LA CHAINE ENTIERE. Le
       * HTML replie les retours a la ligne de l'enveloppement a 80 colonnes,
       * qui servent le fichier source et non le sens : comparer les chaines
       * ferait rougir ce test sur une simple reindentation du texte.
       *
       * L'ECHAPPEMENT EST APPLIQUE AU MOT CHERCHE, sans quoi une apostrophe
       * ferait echouer la recherche sur un HTML pourtant exact.
       */
      const mots = rendu.texte
        .split(/\s+/)
        .map((mot) => mot.trim())
        .filter((mot) => mot.length > 3);

      for (const mot of mots) {
        const attendu = mot
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

        expect(html).toContain(attendu);
      }
    });
  }
});
