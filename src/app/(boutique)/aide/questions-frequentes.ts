/**
 * Les questions fréquentes de la page d'aide, LS-26.
 *
 * UNE SEULE SOURCE POUR LE TEXTE AFFICHÉ ET LE BALISAGE `FAQPage` : les moteurs
 * comparent les deux, et une réponse balisée qui diffère de la page serait une
 * donnée structurée trompeuse.
 *
 * AUCUNE RÉPONSE N'EST INVENTÉE. Chacune reprend un fait déjà établi :
 *
 * | Fait | Source |
 * |---|---|
 * | modes, tarifs, gratuité | configuration, `resoudreConfigurationLivraison`, ADR-035 et ADR-043 |
 * | Corse comprise, suivi Mondial Relay | page d'aide et bandeau de réassurance |
 * | commande sans compte, aucun minimum | décisions commerciales du 28 juillet 2026, LS-27 |
 * | paiement par carte, Stripe | bandeau de réassurance |
 * | rétractation, garantie | pages légales, LS-134 et LS-28 |
 * | entretien, acier inoxydable | page L'atelier, validée avec l'exploitante, LS-25 |
 * | réponse sous 24 heures | réponse de l'exploitante du 3 septembre 2026, arbitrage du 7 octobre |
 *
 * LE DÉLAI D'EXPÉDITION N'Y FIGURE PAS : les questions 38 à 42 de la fiche
 * exploitante sont sans réponse, et la section Livraison le dit. Un délai
 * annoncé sans pouvoir être tenu serait une pratique commerciale trompeuse.
 *
 * L'EXPLOITANTE EXERCE SEULE : aucun « nous » de marque, `frontend-design.md`.
 * Les réponses sont tournées vers « vous » ou vers l'atelier.
 */
import type { ConfigurationLivraison } from "@/lib/livraison";
import { formaterMontant } from "@/lib/montant";

export type QuestionFrequente = {
  /** Ancre stable, `#faq-…`, pour qu'une réponse puisse être citée. */
  id: string;
  question: string;
  reponse: string;
  lien?: { href: string; libelle: string };
};

export type ThemeQuestions = {
  titre: string;
  questions: QuestionFrequente[];
};

/**
 * Les thèmes et leurs questions. `livraison` vaut `null` quand la
 * configuration est invalide : les deux questions de tarif disparaissent
 * plutôt que d'annoncer un montant de repli, information précontractuelle
 * fausse.
 */
export function questionsFrequentes(
  livraison: ConfigurationLivraison | null,
): ThemeQuestions[] {
  const questionsLivraison: QuestionFrequente[] = [];

  if (livraison !== null) {
    const relais = formaterMontant(livraison.relaisCentimes);
    const domicile = formaterMontant(livraison.domicileCentimes);

    questionsLivraison.push({
      id: "faq-modes-livraison",
      question: "Quels modes de livraison proposez-vous, et à quel prix ?",
      reponse: `Trois modes, au choix au moment de la commande : Point Relais à ${relais}, Locker à ${relais} et livraison à domicile à ${domicile}. Les colis partent avec Mondial Relay.`,
    });

    questionsLivraison.push({
      id: "faq-livraison-offerte",
      question: "La livraison peut-elle être offerte ?",
      /*
       * LS-249 : EN POINT RELAIS ET LOCKER SEULEMENT. Le domicile n'est jamais
       * offert, et l'avoir annoncé gratuit a déjà été une information
       * précontractuelle fausse sur ce site.
       */
      reponse:
        livraison.seuilFranchiseCentimes === null
          ? "Pas en ce moment : les frais de livraison s'appliquent à chaque commande."
          : `Oui, en Point Relais et en Locker, à partir de ${formaterMontant(livraison.seuilFranchiseCentimes)} d'achat. La livraison à domicile reste payante.`,
    });
  }

  questionsLivraison.push(
    {
      id: "faq-corse",
      question: "Livrez-vous en Corse ?",
      reponse:
        "Oui. Les commandes sont livrées dans toute la France métropolitaine, Corse comprise.",
    },
    {
      id: "faq-suivi",
      question: "Comment suivre mon colis ?",
      reponse:
        "Mondial Relay vous informe directement de l'avancement de votre colis.",
    },
  );

  return [
    { titre: "Livraison", questions: questionsLivraison },
    {
      titre: "Commande et paiement",
      questions: [
        {
          id: "faq-compte",
          question: "Faut-il créer un compte pour commander ?",
          reponse:
            "Non, la commande se passe sans compte. Un compte vous permet en plus de retrouver toutes vos commandes au même endroit.",
        },
        {
          id: "faq-paiement",
          question: "Comment payer ?",
          reponse: "Par carte bancaire, avec un paiement sécurisé par Stripe.",
        },
        {
          id: "faq-minimum",
          question: "Y a-t-il un montant minimum de commande ?",
          reponse: "Non, aucun.",
        },
      ],
    },
    {
      titre: "Retours",
      questions: [
        {
          id: "faq-changer-avis",
          question: "Puis-je changer d'avis après réception ?",
          reponse:
            "Oui, pendant quatorze jours à compter de la réception, sans avoir à vous justifier. Le formulaire de rétractation est en ligne, dans votre espace client ou par le lien personnel reçu avec la confirmation de commande. Les frais de retour sont à votre charge, et la totalité de la commande vous est remboursée, frais de livraison initiaux compris.",
          lien: {
            href: "/informations-legales#retractation",
            libelle: "Le détail du droit de rétractation",
          },
        },
        {
          id: "faq-defaut",
          question: "Mon bijou présente un défaut, que faire ?",
          reponse:
            "Ce n'est pas un changement d'avis : la garantie légale de conformité vous couvre pendant deux ans à compter de la remise du bijou, et les frais de retour ne sont alors pas à votre charge. Écrivez à l'atelier en décrivant le défaut.",
          lien: { href: "/contact", libelle: "Écrire à l'atelier" },
        },
      ],
    },
    {
      titre: "Entretien",
      questions: [
        {
          id: "faq-entretien",
          question: "Comment entretenir mon bijou ?",
          reponse:
            "Mettez-le en dernier, après le parfum, la laque et la crème, qui ternissent les couleurs et attaquent le vernis. Un chiffon doux, à peine humide, suffit à le nettoyer. Rangez-le à l'abri du soleil direct, à part des autres bijoux. L'alcool, l'acétone et les nettoyants pour bijoux dissolvent le vernis : à éviter.",
          lien: {
            href: "/atelier#entretien",
            libelle: "Les conseils d'entretien en détail",
          },
        },
        {
          id: "faq-peau-sensible",
          question: "Les bijoux conviennent-ils aux peaux sensibles ?",
          reponse:
            "Tout ce qui touche la peau, crochets, fermoirs, attaches et contours des bagues, est en acier inoxydable. Il libère très peu de nickel, ce qui le rend bien toléré par la plupart des peaux sensibles.",
          lien: { href: "/atelier#matieres", libelle: "Les matières" },
        },
      ],
    },
    {
      titre: "Contact",
      questions: [
        {
          id: "faq-delai-reponse",
          question: "Sous quel délai l'atelier répond-il aux messages ?",
          reponse:
            "Sous 24 heures au maximum. Pour une commande en cours, indiquez son numéro : la réponse ira plus vite.",
          lien: { href: "/contact", libelle: "Écrire à l'atelier" },
        },
      ],
    },
  ];
}
