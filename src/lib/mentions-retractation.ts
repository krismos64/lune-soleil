/**
 * Les mentions obligatoires sur le droit de retractation, LS-136.
 *
 * ------------------------------------------------------------------
 * POURQUOI UN MODULE ET NON TROIS TEXTES ECRITS SUR PLACE.
 *
 * L'article L221-23 impose la meme information a TROIS emplacements : avant la
 * validation de la commande, dans les conditions generales, et dans le
 * formulaire type de retractation. Trois textes ecrits separement divergent, et
 * la divergence est indetectable a la lecture : chaque page paraitrait correcte
 * isolement.
 *
 * Une information INCORRECTE est sanctionnee comme une information absente,
 * article L221-20 : delai porte a DOUZE MOIS sur toutes les commandes
 * concernees. Le risque ne vient donc pas seulement de l'oubli, il vient aussi
 * de la contradiction entre deux emplacements.
 *
 * Ce module est la source unique. `scripts/verifier-mentions-retractation.sh`
 * verifie que les trois emplacements la citent, et la preuve par mutation
 * l'exerce emplacement par emplacement.
 * ------------------------------------------------------------------
 *
 * AUCUN MONTANT DE FRAIS DE RETOUR N'EST ANNONCE, et c'est volontaire. Ces
 * frais sont ceux que le client paie a SON transporteur pour nous renvoyer le
 * bijou : la boutique ne les fixe pas et ne peut pas les connaitre. La loi
 * n'exige pas un montant, elle exige que le PRINCIPE soit explicite,
 * `legal.md` : « une formule vague ne suffit pas », ce qui vise « des frais
 * peuvent s'appliquer » et non l'absence de tarif.
 *
 * A NE PAS CONFONDRE avec les frais de livraison INITIAUX, que la boutique a
 * encaisses et rembourse en entier, article L221-24. Deux notions opposees que
 * le meme mot « frais » rapproche dangereusement.
 */

/**
 * Le delai de retractation, en jours, tel qu'il s'annonce au client.
 *
 * IL EST REPRIS DE `lib/retractation.ts` ET NON REECRIT. Le calcul de
 * l'echeance est la source de verite, LS-133 : annoncer quatorze ici pendant
 * qu'un service en applique un autre produirait exactement l'information
 * incorrecte que l'article L221-20 sanctionne, et c'est L'AFFICHAGE qui engage.
 */
export { DUREE_RETRACTATION_JOURS } from "@/lib/retractation";

/**
 * La mention affichee AVANT la validation de la commande, emplacement 1.
 *
 * C'EST L'EMPLACEMENT QUE LE PROJET N'AVAIT PAS, mesure le 5 septembre 2026 :
 * zero occurrence du mot « retractation » dans tout le tunnel, alors que les
 * conditions generales en portaient six. C'est aussi celui que `legal.md`
 * designe comme « le premier qu'on oublie », et il est le plus exigeant :
 * l'information doit atteindre le client AVANT qu'il s'engage, pas dans une
 * page qu'il pourrait consulter.
 *
 * ELLE TIENT EN DEUX PHRASES, et c'est delibere. Le recapitulatif est deja
 * dense, et un pave juridique s'y saute : une mention qu'on ne lit pas remplit
 * la lettre de l'obligation en ratant sa fonction. Le detail complet reste dans
 * les conditions generales, vers lesquelles le lien pointe.
 */
export const MENTION_TUNNEL = {
  /** Le droit lui-meme, son delai et son point de depart. */
  droit:
    "Vous disposez de quatorze jours après réception de votre commande pour changer d'avis, sans avoir à vous justifier.",
  /**
   * LES FRAIS DE RETOUR, SANS LESQUELS ILS REVIENNENT AU VENDEUR.
   *
   * Article L221-23 : le consommateur ne les supporte que s'il en a ete
   * informe, et la charge de la preuve pese sur le vendeur. Cette phrase ne se
   * retire pas sans retirer la decision commerciale du 28 juillet 2026, LS-27.
   */
  fraisRetour: "Les frais de retour du bijou sont à votre charge.",
} as const;

/**
 * La mention portee par le formulaire type de retractation, emplacement 3.
 *
 * ELLE EXISTAIT DEJA, ecrite en clair dans `formulaire-retractation.tsx` depuis
 * LS-134, et elle est correcte. Ce module ne l'ajoute pas, il la RAPATRIE :
 * tant qu'elle vivait seule dans un composant, rien ne l'empechait de diverger
 * du tunnel, et une information contradictoire entre deux emplacements est
 * sanctionnee comme une information absente.
 *
 * Mon premier releve l'avait crue absente : je cherchais « frais de retour »
 * quand le texte dit « frais de retour du bijou restent a votre charge », et je
 * cherchais dans la PAGE quand la mention vit dans le COMPOSANT. Un emplacement
 * declare manquant a tort aurait produit une seconde mention a cote de la
 * premiere.
 *
 * ELLE EST PLUS COURTE QUE CELLE DU TUNNEL : la personne qui atteint cet ecran
 * a deja decide, elle n'a pas besoin qu'on lui rappelle qu'elle a le droit. Ce
 * qu'elle doit savoir avant de valider est ce que le renvoi va lui couter.
 *
 * UN SEUL ECRAN LA PORTE POUR DEUX CHEMINS : `formulaire-retractation.tsx` sert
 * l'espace client ET le lien signe des acheteurs sans compte.
 */
export const MENTION_FORMULAIRE = {
  fraisRetour: "Les frais de retour du bijou restent à votre charge.",
} as const;
