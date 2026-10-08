/**
 * Questions fréquentes de la page d'aide, LS-26.
 *
 * Ces tests gardent les règles qui ont un coût réel si elles se perdent :
 * tarifs lus en configuration et jamais écrits en dur, domicile jamais
 * annoncé offert (LS-249), un seul délai d'expédition lu dans la constante
 * (réponses de l'exploitante du 8 octobre 2026), aucun « nous » de marque (l'exploitante exerce seule), et un
 * balisage `FAQPage` identique au texte affiché.
 */
import { describe, expect, it } from "vitest";

import { questionsFrequentes } from "@/app/(boutique)/aide/questions-frequentes";
import { DELAI_EXPEDITION_JOURS_MAX } from "@/lib/livraison";
import { jsonLdQuestionsFrequentes } from "@/lib/seo";

/** Des valeurs volontairement éloignées des tarifs réels. */
const CONFIGURATION = {
  relaisCentimes: 523,
  domicileCentimes: 891,
  seuilFranchiseCentimes: 6100,
};

function tout(themes: ReturnType<typeof questionsFrequentes>) {
  return themes.flatMap((theme) => theme.questions);
}

function texte(themes: ReturnType<typeof questionsFrequentes>): string {
  return tout(themes)
    .map((entree) => `${entree.question} ${entree.reponse}`)
    .join("\n");
}

describe("questionsFrequentes, LS-26", () => {
  it("annonce les tarifs et le seuil lus en configuration, jamais en dur", () => {
    const contenu = texte(questionsFrequentes(CONFIGURATION));

    expect(contenu).toContain("5,23");
    expect(contenu).toContain("8,91");
    expect(contenu).toContain("61,00");
    // Les tarifs réels du 7 octobre 2026 ne doivent pas apparaître : ils
    // trahiraient une valeur recopiée au lieu d'être lue.
    expect(contenu).not.toMatch(/4,10|7,49|39,00/);
  });

  it("n'annonce jamais la livraison à domicile offerte, LS-249", () => {
    const reponse = tout(questionsFrequentes(CONFIGURATION)).find(
      (entree) => entree.id === "faq-livraison-offerte",
    )?.reponse;

    expect(reponse).toMatch(/en Point Relais et en Locker/);
    expect(reponse).toMatch(/domicile reste payante/);
    expect(reponse).not.toMatch(/quel que soit le mode|tous (les )?modes/i);
  });

  it("dit que la livraison n'est jamais offerte quand la franchise est désactivée", () => {
    const reponse = tout(
      questionsFrequentes({ ...CONFIGURATION, seuilFranchiseCentimes: null }),
    ).find((entree) => entree.id === "faq-livraison-offerte")?.reponse;

    expect(reponse).toMatch(/Pas en ce moment/);
    expect(reponse).not.toMatch(/0,00/);
  });

  it("retire les questions de tarif quand la configuration est invalide", () => {
    const identifiants = tout(questionsFrequentes(null)).map(
      (entree) => entree.id,
    );

    expect(identifiants).not.toContain("faq-modes-livraison");
    expect(identifiants).not.toContain("faq-livraison-offerte");
    expect(identifiants).toContain("faq-corse");
    expect(texte(questionsFrequentes(null))).not.toMatch(/\d+,\d{2}\s?€/);
  });

  it("n'annonce que les deux délais donnés par l'exploitante", () => {
    const contenu = texte(questionsFrequentes(CONFIGURATION));

    // Réponse aux messages et dépôt du colis, l'un et l'autre donnés par
    // l'exploitante : tout autre nombre d'heures ou de jours fait rougir, quel
    // que soit le verbe qui l'introduit, et aucun délai d'acheminement.
    expect(contenu.match(/\b\d+ ?(heures?|h|jours?)\b/gi)).toEqual([
      `${DELAI_EXPEDITION_JOURS_MAX} jours`,
      "24 heures",
    ]);
  });

  it("borne le dépôt du colis par la constante, jamais sa réception", () => {
    const reponse = tout(questionsFrequentes(CONFIGURATION)).find(
      (entree) => entree.id === "faq-delai-expedition",
    )?.reponse;

    expect(reponse).toContain(
      `au plus tard ${DELAI_EXPEDITION_JOURS_MAX} jours après la confirmation de votre paiement`,
    );
    expect(reponse).toMatch(/acheminement du transporteur s'y ajoute/);
    expect(reponse).not.toMatch(/livré|reçu|réception/i);
  });

  it("renvoie les retours vers la rétractation en ligne", () => {
    const retours = questionsFrequentes(CONFIGURATION).find(
      (theme) => theme.titre === "Retours",
    );

    const changement = retours?.questions.find(
      (entree) => entree.id === "faq-changer-avis",
    );
    expect(changement?.reponse).toMatch(
      /formulaire de rétractation est en ligne/,
    );
    expect(changement?.reponse).toMatch(/frais de retour sont à votre charge/);
    expect(changement?.lien?.href).toBe("/informations-legales#retractation");

    const defaut = retours?.questions.find(
      (entree) => entree.id === "faq-defaut",
    );
    expect(defaut?.reponse).toMatch(/garantie légale de conformité/);
  });

  it("n'emploie ni « nous » de marque ni tiret cadratin", () => {
    const contenu = texte(questionsFrequentes(CONFIGURATION));

    expect(contenu).not.toMatch(/\b(nous|notre|nos)\b/i);
    expect(contenu).not.toMatch(/[—–]/);
  });

  it("porte des identifiants uniques, ancres de la page", () => {
    const identifiants = tout(questionsFrequentes(CONFIGURATION)).map(
      (entree) => entree.id,
    );

    expect(new Set(identifiants).size).toBe(identifiants.length);
    for (const identifiant of identifiants) {
      expect(identifiant).toMatch(/^faq-[a-z-]+$/);
    }
  });
});

describe("jsonLdQuestionsFrequentes, LS-26", () => {
  it("balise chaque question avec la réponse affichée, mot pour mot", () => {
    const questions = tout(questionsFrequentes(CONFIGURATION));
    const balisage = jsonLdQuestionsFrequentes(questions) as {
      "@type": string;
      mainEntity: {
        "@type": string;
        name: string;
        acceptedAnswer: { "@type": string; text: string };
      }[];
    };

    expect(balisage["@type"]).toBe("FAQPage");
    expect(balisage.mainEntity).toHaveLength(questions.length);
    balisage.mainEntity.forEach((entree, rang) => {
      expect(entree["@type"]).toBe("Question");
      expect(entree.name).toBe(questions[rang]?.question);
      expect(entree.acceptedAnswer["@type"]).toBe("Answer");
      expect(entree.acceptedAnswer.text).toBe(questions[rang]?.reponse);
    });
  });
});
