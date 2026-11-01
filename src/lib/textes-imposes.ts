/**
 * Textes dont le Code de la consommation impose la formulation, LS-28.
 *
 * CE MODULE NE CONTIENT QUE DES TEXTES RECOPIÉS MOT POUR MOT de Légifrance, lus
 * le 1er novembre 2026. NE RIEN Y REFORMULER : une « amélioration » de style
 * ferait sortir le texte du modèle que la loi exige. Seule exception, la
 * capitale accentuée « À », que Légifrance écrit « A ».
 *
 * IL EST HORS DE PORTÉE DU CONTRÔLE DU « NOUS » de marque,
 * `verifier-redaction-francaise.sh` sens 3, et c'est voulu : le formulaire type
 * porte « Je/nous » parce que le décret l'écrit ainsi. Le cadratin et l'accord
 * au féminin, eux, restent contrôlés sur ce fichier comme sur tout `src/`.
 *
 * UNE SOURCE UNIQUE POUR DEUX EMPLOIS : les conditions générales de
 * `/informations-legales`, et l'email de confirmation, auquel l'article L221-13
 * impose de joindre le formulaire type. Deux copies divergeraient.
 */

/**
 * Encadré des garanties légales, article D211-2, modèle A de l'annexe à
 * l'article D211-2, « biens (hors animaux domestiques) ». En vigueur depuis le
 * 1er octobre 2022, décret n° 2022-946 du 29 juin 2022.
 *
 * LES DEUX PARAGRAPHES SUR LE CONTENU NUMÉRIQUE RESTENT, bien qu'un bijou n'en
 * comporte aucun : le modèle n'existe pas sans eux, et D211-2 exige le modèle.
 */
export const ENCADRE_GARANTIES_LEGALES: readonly string[] = [
  "Le consommateur dispose d'un délai de deux ans à compter de la délivrance du bien pour obtenir la mise en œuvre de la garantie légale de conformité en cas d'apparition d'un défaut de conformité. Durant ce délai, le consommateur n'est tenu d'établir que l'existence du défaut de conformité et non la date d'apparition de celui-ci.",
  "Lorsque le contrat de vente du bien prévoit la fourniture d'un contenu numérique ou d'un service numérique de manière continue pendant une durée supérieure à deux ans, la garantie légale est applicable à ce contenu numérique ou ce service numérique tout au long de la période de fourniture prévue. Durant ce délai, le consommateur n'est tenu d'établir que l'existence du défaut de conformité affectant le contenu numérique ou le service numérique et non la date d'apparition de celui-ci.",
  "La garantie légale de conformité emporte obligation pour le professionnel, le cas échéant, de fournir toutes les mises à jour nécessaires au maintien de la conformité du bien.",
  "La garantie légale de conformité donne au consommateur droit à la réparation ou au remplacement du bien dans un délai de trente jours suivant sa demande, sans frais et sans inconvénient majeur pour lui.",
  "Si le bien est réparé dans le cadre de la garantie légale de conformité, le consommateur bénéficie d'une extension de six mois de la garantie initiale.",
  "Si le consommateur demande la réparation du bien, mais que le vendeur impose le remplacement, la garantie légale de conformité est renouvelée pour une période de deux ans à compter de la date de remplacement du bien.",
  "Le consommateur peut obtenir une réduction du prix d'achat en conservant le bien ou mettre fin au contrat en se faisant rembourser intégralement contre restitution du bien, si :",
  "1° Le professionnel refuse de réparer ou de remplacer le bien ;",
  "2° La réparation ou le remplacement du bien intervient après un délai de trente jours ;",
  "3° La réparation ou le remplacement du bien occasionne un inconvénient majeur pour le consommateur, notamment lorsque le consommateur supporte définitivement les frais de reprise ou d'enlèvement du bien non conforme, ou s'il supporte les frais d'installation du bien réparé ou de remplacement ;",
  "4° La non-conformité du bien persiste en dépit de la tentative de mise en conformité du vendeur restée infructueuse.",
  "Le consommateur a également droit à une réduction du prix du bien ou à la résolution du contrat lorsque le défaut de conformité est si grave qu'il justifie que la réduction du prix ou la résolution du contrat soit immédiate. Le consommateur n'est alors pas tenu de demander la réparation ou le remplacement du bien au préalable.",
  "Le consommateur n'a pas droit à la résolution de la vente si le défaut de conformité est mineur.",
  "Toute période d'immobilisation du bien en vue de sa réparation ou de son remplacement suspend la garantie qui restait à courir jusqu'à la délivrance du bien remis en état.",
  "Les droits mentionnés ci-dessus résultent de l'application des articles L. 217-1 à L. 217-32 du code de la consommation.",
  "Le vendeur qui fait obstacle de mauvaise foi à la mise en œuvre de la garantie légale de conformité encourt une amende civile d'un montant maximal de 300 000 euros, qui peut être porté jusqu'à 10 % du chiffre d'affaires moyen annuel (article L. 241-5 du code de la consommation).",
  "Le consommateur bénéficie également de la garantie légale des vices cachés en application des articles 1641 à 1649 du code civil, pendant une durée de deux ans à compter de la découverte du défaut. Cette garantie donne droit à une réduction de prix si le bien est conservé ou à un remboursement intégral contre restitution du bien.",
];

/**
 * Modèle de formulaire de rétractation, annexe à l'article R221-1, en vigueur
 * depuis le 28 mai 2022, décret n° 2022-424 du 25 mars 2022.
 *
 * `destinataire` remplit le seul crochet du modèle, « le professionnel insère
 * ici son nom, son adresse géographique et son adresse électronique ».
 */
export const FORMULAIRE_RETRACTATION = {
  titre: "Modèle de formulaire de rétractation",
  avertissement:
    "(Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du contrat.)",
  destinataire: (coordonnees: string) => `À l'attention de ${coordonnees} :`,
  lignes: [
    "Je/nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la vente du bien (*)/pour la prestation de services (*) ci-dessous :",
    "Commandé le (*)/reçu le (*) :",
    "Nom du (des) consommateur(s) :",
    "Adresse du (des) consommateur(s) :",
    "Signature du (des) consommateur(s) (uniquement en cas de notification du présent formulaire sur papier) :",
    "Date :",
  ],
  note: "(*) Rayez la mention inutile.",
} as const;
