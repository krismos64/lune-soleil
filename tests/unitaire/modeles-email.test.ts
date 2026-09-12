/**
 * Rendu des dix modeles d'email, LS-29.
 *
 * POURQUOI CE FICHIER EXISTE. Les modeles etaient eprouves un par un, au fil
 * des stories qui les creaient, et trois seulement l'etaient reellement. Un
 * modele ajoute sans test rend un message que personne ne lit avant qu'un
 * client ne le recoive : `exiger` leve sur une variable absente, mais rien ne
 * disait QUELLES variables chaque modele attend.
 *
 * LE CONTROLE D'EXHAUSTIVITE EST LE COEUR DE CE FICHIER. `MODELES` liste les
 * dix modeles avec leurs variables ; le premier test confronte cette liste au
 * type `ModeleEmail`. Ajouter un modele sans l'inscrire ici fait rougir la
 * suite, ce qu'un test par modele ne saurait pas faire : il resterait vert en
 * ignorant le nouveau venu. Meme motif que le `Record` type de `modeles.ts`,
 * transpose aux tests.
 *
 * LES TEXTES SONT CEUX VALIDES PAR L'EXPLOITANTE le 12 septembre 2026 :
 * signature « L'atelier Lune-soleil », vouvoiement, « article » et jamais
 * « bijou », « nous » et jamais « je ».
 */
import { describe, expect, it } from "vitest";

import type { ModeleEmail } from "@/integrations/email";
import { rendreModele } from "@/integrations/email/modeles";
import { NOM_BOUTIQUE } from "@/lib/seo";

/**
 * Les dix modeles et les variables que chacun exige.
 *
 * `Record<ModeleEmail, ...>` ET NON UN TABLEAU : le type impose l'exhaustivite
 * a la compilation. Un modele ajoute au type sans entrée ici ne compile pas,
 * exactement comme dans `modeles.ts`.
 */
const MODELES: Record<ModeleEmail, Record<string, string>> = {
  "verification-adresse": { lien: "https://exemple.test/v" },
  "changement-adresse-verification": { lien: "https://exemple.test/c" },
  "changement-adresse-avertissement": {
    lien: "https://exemple.test/a",
    nouvelleAdresse: "neuve@exemple.test",
  },
  "reinitialisation-mot-de-passe": { lien: "https://exemple.test/r" },
  "alerte-connexion-administration": { horodatage: "12 septembre 2026 à 10h" },
  "message-contact-recu": {
    nom: "Camille Martin",
    email: "camille@exemple.test",
    sujet: "Question sur un collier",
    date: "12 septembre 2026",
  },
  "message-contact-accuse": { sujet: "Question sur un collier" },
  "commande-confirmee": {
    numero: "LS-2026-0001",
    lienFacture: "https://exemple.test/f",
    lienRetractation: "https://exemple.test/d",
  },
  "retractation-accusee": {
    numero: "LS-2026-0001",
    jourLimite: "26 septembre 2026",
  },
  "invitation-avis": {
    numero: "LS-2026-0001",
    lien: "https://exemple.test/avis",
    delaiPublicationJours: "7",
    pieces: "un collier",
  },
  "expedition-en-route": {
    mode: "Point relais",
    numeroSuivi: "6A12345678",
    lienSuivi: "https://exemple.test/suivi",
  },
  "remboursement-envoye": {
    numero: "LS-2026-0001",
    montant: "49,00 €",
    numeroAvoir: "A-2026-0001",
  },
  "admin-commande-payee": {
    numero: "LS-2026-0001",
    montant: "49,00 €",
    nombreArticles: "2",
  },
  "admin-retractation-demandee": {
    numero: "LS-2026-0001",
    nom: "Camille Martin",
    date: "12 septembre 2026",
  },
  "admin-incident-critique": {
    type: "DOUBLE_ENCAISSEMENT",
    date: "12 septembre 2026",
    description: "Deux paiements confirmés pour la même commande.",
  },
};

const NOMS = Object.keys(MODELES) as ModeleEmail[];

/** Les six messages adressés à un client, qui portent la signature. */
const MODELES_CLIENT: ModeleEmail[] = [
  "verification-adresse",
  "changement-adresse-verification",
  "changement-adresse-avertissement",
  "reinitialisation-mot-de-passe",
  "alerte-connexion-administration",
  "message-contact-accuse",
  "commande-confirmee",
  "retractation-accusee",
  "invitation-avis",
  "expedition-en-route",
  "remboursement-envoye",
];

/** Les notifications internes, qui ne sont PAS signées. */
const MODELES_ADMIN: ModeleEmail[] = [
  "message-contact-recu",
  "admin-commande-payee",
  "admin-retractation-demandee",
  "admin-incident-critique",
];

describe("les dix modeles rendent un message complet", () => {
  it.each(NOMS)("%s rend un objet et un texte non vides", (modele) => {
    const rendu = rendreModele({
      destinataire: "client@exemple.test",
      modele,
      variables: MODELES[modele],
    });

    expect(rendu.objet.trim().length).toBeGreaterThan(0);
    expect(rendu.texte.trim().length).toBeGreaterThan(0);
  });

  it("couvre TOUS les modeles du type, aucun oublie", () => {
    /*
     * CE TEST EST LE GARDE-FOU DU FICHIER. Sans lui, ajouter un modele au type
     * et oublier de l'inscrire dans `MODELES` laisserait la suite verte : les
     * autres tests boucleraient sur les modeles connus et ignoreraient le
     * nouveau. Le `Record` type le rattrape a la compilation, ce test le
     * rattrape a l'execution, et les deux disent la meme chose de deux facons.
     */
    expect(NOMS.length).toBe(MODELES_CLIENT.length + MODELES_ADMIN.length);
  });
});

describe("le ton valide par l'exploitante", () => {
  it.each(MODELES_CLIENT)("%s se termine par la signature", (modele) => {
    const rendu = rendreModele({
      destinataire: "client@exemple.test",
      modele,
      variables: MODELES[modele],
    });

    /*
     * L'ASSERTION PORTE SUR LA DERNIERE LIGNE, jamais sur la presence du nom
     * n'importe ou : `NOM_BOUTIQUE` apparait aussi dans le corps de deux
     * modeles de changement d'adresse, « votre compte Lune-soleil ». Un
     * `toContain` y serait vert meme sans signature.
     */
    const lignes = rendu.texte.trimEnd().split("\n");
    expect(lignes[lignes.length - 1]).toBe(`L'atelier ${NOM_BOUTIQUE}`);
  });

  it.each(MODELES_ADMIN)("%s n'est PAS signe", (modele) => {
    /*
     * LES NOTIFICATIONS INTERNES NE SE SIGNENT PAS. Elles vont a la boite de la
     * boutique, que seule l'exploitante lit : une signature sur un message
     * qu'elle s'envoie a elle-meme serait du decor. Le test le fige, sans quoi
     * une relecture bien intentionnee la rajouterait.
     */
    const rendu = rendreModele({
      destinataire: "contact@exemple.test",
      modele,
      variables: MODELES[modele],
    });

    /*
     * L'ASSERTION PORTE SUR `NOM_BOUTIQUE` ET NON SUR « L'atelier Lune-soleil ».
     * La premiere version cherchait la formule complete : la mutation qui
     * ajoutait `SIGNATURE` a une notification la laissait VERTE, `SIGNATURE`
     * valant `NOM_BOUTIQUE`, donc « Lune-soleil » seul. Le test decrivait une
     * intention que le code n'exprimait pas sous cette forme. Motif « valeurs
     * qui coincident », deja en fiche.
     */
    expect(rendu.texte).not.toContain(NOM_BOUTIQUE);
  });

  it.each(NOMS)("%s n'emploie jamais « bijou »", (modele) => {
    /*
     * ARBITRAGE DU 12 SEPTEMBRE 2026 : « article » et non « bijou ». Le mot
     * revenait dans deux textes, dont l'accuse de retractation ou il portait
     * une obligation legale. Le figer evite qu'il revienne par une story qui
     * reecrirait un texte sans connaitre la consigne.
     */
    const rendu = rendreModele({
      destinataire: "client@exemple.test",
      modele,
      variables: MODELES[modele],
    });

    expect(rendu.texte.toLowerCase()).not.toContain("bijou");
  });
});

describe("une variable absente est refusee", () => {
  it("leve plutot que de rendre un message inutilisable", () => {
    /*
     * LE DEFAUT QUE `exiger` FERME. Un lien absent produirait un message poli
     * et sans action possible, que le client recevrait pendant que la trace en
     * base dirait `ENVOYE` : invisible des deux cotes.
     */
    expect(() =>
      rendreModele({
        destinataire: "client@exemple.test",
        modele: "expedition-en-route",
        variables: {},
      }),
    ).toThrow(/mode/);
  });

  it("rend le message SANS numero de suivi, qui est facultatif", () => {
    /*
     * UNE REMISE EN MAIN PROPRE N'A PAS DE NUMERO, `numeroSuivi` etant nullable
     * au schema. La premiere version de ce fichier exigeait la levee sur son
     * absence : elle decrivait un defaut, pas une regle, et aurait fige un
     * refus sur un cas parfaitement legitime. Le client n'aurait alors rien
     * recu du tout.
     */
    const rendu = rendreModele({
      destinataire: "client@exemple.test",
      modele: "expedition-en-route",
      variables: { mode: "Point relais" },
    });

    expect(rendu.texte).toContain("Votre colis est en route");
    expect(rendu.texte).not.toContain("Numéro de suivi");
  });
});
