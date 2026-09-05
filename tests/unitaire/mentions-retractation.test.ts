/**
 * Les mentions obligatoires sur le droit de retractation, LS-136.
 *
 * ------------------------------------------------------------------
 * CE QUE CES TESTS PROTEGENT, ET POURQUOI C'EST DISPROPORTIONNE.
 *
 * L'article L221-20 porte le delai de retractation a DOUZE MOIS quand
 * l'information est absente ou incorrecte, sur toutes les commandes concernees.
 * Une mention retiree par inadvertance lors d'une refonte de gabarit ne casse
 * aucun test de rendu et ne se voit sur aucun ecran : la page reste belle, elle
 * est simplement devenue illegale.
 *
 * L'enjeu n'est pas proportionnel a la taille du texte protege.
 * ------------------------------------------------------------------
 *
 * AUCUNE BASE DE DONNEES : le module sous test ne porte que des constantes.
 */
import { describe, expect, it } from "vitest";

import {
  DUREE_RETRACTATION_JOURS,
  MENTION_FORMULAIRE,
  MENTION_TUNNEL,
} from "@/lib/mentions-retractation";

/**
 * Les nombres ecrits en toutes lettres, du delai legal jusqu'a une valeur
 * voisine plausible.
 *
 * La table s'arrete a seize et non a quatorze : un contrôle qui ne connaitrait
 * que le nombre attendu ne saurait pas dire qu'un AUTRE nombre est ecrit.
 * Motif « table de nombres trop courte », en fiche sur ce depot.
 */
const NOMBRES_EN_LETTRES: Record<number, string> = {
  7: "sept",
  10: "dix",
  13: "treize",
  14: "quatorze",
  15: "quinze",
  16: "seize",
  30: "trente",
};

describe("MENTION_TUNNEL, emplacement 1", () => {
  /*
   * ------------------------------------------------------------------
   * LE TEST CENTRAL DE CE FICHIER.
   *
   * Le texte ecrit « quatorze jours » en toutes lettres, ce qui le DECOUPLE de
   * `DUREE_RETRACTATION_JOURS`. Si le delai changeait, dans le calcul de
   * LS-133 ou par une evolution de la loi, la mention continuerait d'annoncer
   * quatorze sans que rien ne rougisse : le client lirait une date, le service
   * en appliquerait une autre, et c'est L'AFFICHAGE qui engage.
   *
   * Ce test raccroche les deux. Ecrire le nombre en chiffres dans le texte
   * aurait ete plus simple a verifier, mais « 14 jours » se lit moins bien
   * qu'« quatorze jours » dans une phrase, et une mention legale doit d'abord
   * etre lue.
   * ------------------------------------------------------------------
   */
  it("annonce le delai que le calcul applique reellement", () => {
    const attendu = NOMBRES_EN_LETTRES[DUREE_RETRACTATION_JOURS];

    expect(
      attendu,
      `Le delai vaut ${DUREE_RETRACTATION_JOURS} jours, absent de la table des ` +
        "nombres en lettres de ce test. Completer la table, puis verifier que " +
        "MENTION_TUNNEL.droit annonce bien ce nombre.",
    ).toBeDefined();

    expect(MENTION_TUNNEL.droit).toContain(`${attendu} jours`);
  });

  /*
   * LE POINT DE DEPART EST LA RECEPTION, JAMAIS L'EXPEDITION, article L221-18.
   * Partir de l'expedition eteint le droit trop tot : expedie le 1er, recu le
   * 4, un delai parti du 1er expire le 15 quand le minimum legal court jusqu'au
   * 18. Motif « repli de retractation fautif », en fiche.
   */
  it("annonce la reception comme point de depart, jamais l'expedition", () => {
    expect(MENTION_TUNNEL.droit).toContain("réception");
    expect(MENTION_TUNNEL.droit).not.toContain("expédition");
  });

  /*
   * LE DROIT EST INCONDITIONNEL, article L221-18 : aucun motif n'est exigible.
   * Une formulation qui suggererait le contraire dissuade d'exercer un droit,
   * ce qui est le defaut que l'article L221-20 vise.
   */
  it("dit que le client n'a pas a se justifier", () => {
    expect(MENTION_TUNNEL.droit).toMatch(/justifier|motif|sans avoir/i);
  });

  /*
   * SANS CETTE MENTION, LES FRAIS DE RETOUR REVIENNENT AU VENDEUR, article
   * L221-23, la charge de la preuve pesant sur lui. Elle porte la decision
   * commerciale du 28 juillet 2026, LS-27 : la retirer, c'est la renverser.
   */
  it("annonce que les frais de retour sont a la charge du client", () => {
    expect(MENTION_TUNNEL.fraisRetour).toContain("frais de retour");
    expect(MENTION_TUNNEL.fraisRetour).toMatch(/à votre charge/i);
  });

  /*
   * UNE FORMULE VAGUE NE SUFFIT PAS, `legal.md`. Ce test nomme les tournures
   * qui donnent l'apparence d'informer sans rien dire : elles passeraient le
   * test precedent si elles portaient les bons mots autour.
   */
  it("ne se contente pas d'une formule conditionnelle", () => {
    const texte = `${MENTION_TUNNEL.droit} ${MENTION_TUNNEL.fraisRetour}`;

    for (const vague of [
      "peuvent s'appliquer",
      "peuvent être",
      "le cas échéant",
      "sous certaines conditions",
      "susceptible",
    ]) {
      expect(texte.toLowerCase()).not.toContain(vague);
    }
  });
});

describe("MENTION_FORMULAIRE, emplacement 3", () => {
  it("annonce les frais de retour a la charge du client", () => {
    expect(MENTION_FORMULAIRE.fraisRetour).toContain("frais de retour");
    expect(MENTION_FORMULAIRE.fraisRetour).toMatch(/à votre charge/i);
  });

  /*
   * ------------------------------------------------------------------
   * LES DEUX EMPLACEMENTS NE SE CONTREDISENT PAS.
   *
   * C'est la raison d'etre du module. Une information CONTRADICTOIRE est
   * sanctionnee comme une information absente : un tunnel qui annoncerait des
   * frais a la charge du client et un formulaire qui les dirait offerts vaut
   * une absence de mention, donc douze mois.
   *
   * Les deux textes different volontairement en longueur, ils ne peuvent pas
   * differer sur le FOND.
   * ------------------------------------------------------------------
   */
  it("dit la meme chose que le tunnel sur la charge des frais", () => {
    const chargeClient = (texte: string) => /à votre charge/i.test(texte);

    expect(chargeClient(MENTION_TUNNEL.fraisRetour)).toBe(true);
    expect(chargeClient(MENTION_FORMULAIRE.fraisRetour)).toBe(true);
  });

  /*
   * NI L'UN NI L'AUTRE N'ANNONCE DE MONTANT. Ces frais sont ceux que le client
   * paie a SON transporteur : la boutique ne les fixe pas et ne peut pas les
   * connaitre. Annoncer un montant serait une information precontractuelle
   * fausse, sanctionnee bien au-dela de l'ecart de prix.
   *
   * A ne pas confondre avec les frais de livraison INITIAUX, que la boutique a
   * encaisses et rembourse en entier, article L221-24.
   */
  it("n'annonce aucun montant de frais de retour", () => {
    for (const texte of [
      MENTION_TUNNEL.fraisRetour,
      MENTION_FORMULAIRE.fraisRetour,
    ]) {
      expect(texte).not.toMatch(/\d+[.,]\d{2}|\d+\s*€|euros?/i);
    }
  });
});

describe("rédaction, règles du projet", () => {
  const TOUS = [
    MENTION_TUNNEL.droit,
    MENTION_TUNNEL.fraisRetour,
    MENTION_FORMULAIRE.fraisRetour,
  ];

  /*
   * AUCUN TIRET CADRATIN NI DEMI-CADRATIN, regle de redaction du projet. Ces
   * textes sont visibles par les acheteurs, la regle s'y applique pleinement.
   */
  it("ne porte aucun tiret cadratin ni demi-cadratin", () => {
    for (const texte of TOUS) {
      expect(texte).not.toMatch(/[–—]/);
    }
  });

  /*
   * AUCUN ACCORD AU FEMININ PAR DEFAUT. « Le client », jamais « la cliente » :
   * une part notable des acheteurs est masculine, un homme qui offre un bijou.
   */
  it("n'accorde pas au feminin par defaut", () => {
    for (const texte of TOUS) {
      expect(texte.toLowerCase()).not.toMatch(
        /\bcliente\b|\bacheteuse\b|\bvisiteuse\b/,
      );
    }
  });
});
