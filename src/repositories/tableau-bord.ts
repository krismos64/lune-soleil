/**
 * Comptages du tableau de bord et des pastilles de navigation, LS-181.
 *
 * CE FICHIER NE LIT QUE DES NOMBRES, il ne projette aucune ligne metier. C'est
 * ce qui le distingue des autres repositories du dossier : `commande.ts` sait
 * lire une commande, celui-ci sait combien il y en a dans un etat. Les deux
 * gestes se ressemblent assez pour qu'on soit tente de les fondre, et ils ne
 * doivent pas l'etre : une pastille affichee sur TOUS les ecrans ne peut pas se
 * payer le chargement des lignes qu'elle compte.
 *
 * UNE SEULE REQUETE POUR TOUS LES COMPTAGES, et c'est la raison d'etre du
 * fichier. La barre laterale est rendue par le layout, donc sur chaque
 * navigation : sept requetes separees a chaque clic couteraient sept
 * allers-retours la ou une agregation en fait un. Le geste est ecrit une fois
 * ici plutot que reparti dans sept services qui l'ignoreraient les uns des
 * autres.
 *
 * AUCUNE DECISION METIER ICI, conformement au README du dossier. Le seuil qui
 * definit un stock faible est un JUGEMENT, il vit dans le service ; ce fichier
 * recoit ce seuil en parametre et se contente de compter. Ecrire `<= 1` dans le
 * SQL rendrait la regle invisible depuis la couche qui la porte.
 */
import { Prisma } from "@/generated/prisma/client";

/**
 * Client utilisable par ces fonctions : le client principal ou le client
 * transactionnel remis par `$transaction`.
 */
export type ClientBase = Prisma.TransactionClient;

/**
 * Les comptages alimentant les pastilles et les tuiles.
 *
 * TOUS LES CHAMPS SONT DES `number`, jamais des `bigint`. `count(*)` rend du
 * `bigint` en PostgreSQL et le pilote le transmet tel quel : le laisser passer
 * ferait echouer la serialisation vers un composant client, defaut deja
 * rencontre en LS-104, LS-105 et sur `listerEtatStock`.
 */
export type ComptagesAdministration = {
  /** Commandes payees restant a preparer. */
  commandesAPreparer: number;
  /** Commandes preparees, en attente de remise au transporteur. */
  commandesPretesAExpedier: number;
  /** Commandes confirmees ou en preparation, la pastille de la rubrique. */
  commandesEnCours: number;
  /** Variantes vivantes dont le disponible est sous le seuil. */
  variantesStockFaible: number;
  /** Variantes vivantes dont le disponible est nul. */
  variantesIndisponibles: number;
  /** Colis remis au transporteur et pas encore livres. */
  expeditionsEnTransit: number;
  /** Messages de contact jamais ouverts. */
  messagesNonLus: number;
  /** Demandes de retractation non encore closes. */
  retractationsEnCours: number;
  /**
   * Encaisse du jour, en centimes, LES DEUX CANAUX REUNIS.
   *
   * LA VENTE DE MARCHE COMPTE AUTANT QUE LA VENTE WEB. La fiche memoire
   * « statistiques et vente externe » porte precisement ce defaut : un montant
   * non capture est perdu, et un chiffre du jour qui n'additionnerait que le
   * web sous-estimerait une journee de marche jusqu'a la rendre invisible.
   */
  encaisseDuJourCentimes: number;
};

/**
 * Compte en une requete tout ce qu'affichent la barre et les tuiles, LS-181.
 *
 * POURQUOI `$queryRaw` ET NON HUIT `count` PRISMA. Prisma n'exprime pas
 * plusieurs agregats independants en une requete : `groupBy` compte sur une
 * seule table, et huit `count` sont huit allers-retours. Le SQL les reunit en
 * une passe, ce qui compte pour une requete jouee a chaque navigation.
 *
 * LES SOUS-REQUETES SONT SCALAIRES ET NON DES JOINTURES. Une jointure entre
 * commande, variante et message multiplierait les lignes avant de les compter,
 * et chaque comptage serait faux du facteur des autres. C'est le defaut
 * classique du tableau de bord agrege, et il ne se voit pas sur un jeu de
 * donnees ou une seule ligne existe par table.
 *
 * LE STOCK FAIBLE EXCLUT LES VARIANTES ARCHIVEES, meme regle que
 * `listerEtatStock` : une piece retiree du commerce n'est pas en rupture, elle
 * n'est plus vendue. C13.
 *
 * `quantite_physique - quantite_reservee` EST LE DISPONIBLE, jamais le
 * physique seul : l'invariant 6 distingue les deux, et une piece reservee par
 * un paiement en cours n'est pas vendable. `greatest(..., 0)` protege d'un
 * negatif transitoire, comme ailleurs.
 *
 * TROIS CHOIX PORTENT L'ENCAISSE DU JOUR, et aucun ne se devine en lisant le
 * SQL. Les commentaires vivent ici et non dans la requete : un backtick dans
 * un commentaire fermerait le template et casserait la compilation.
 *
 * 1. LE WEB SE DATE SUR `paiement.confirme_a`, PAS SUR `commande.cree_a`. Une
 *    commande d'hier payee ce matin appartient a la recette d'aujourd'hui.
 *    Dater sur la commande decalerait le montant d'un jour, et l'ecart
 *    passerait inapercu tant que les deux dates coincident, c'est-a-dire tout
 *    le temps sauf la nuit.
 *
 * 2. `montant_centimes - montant_rembourse_centimes`, ET NON LE MONTANT NU. Un
 *    remboursement doit reduire la recette, sans quoi l'ecran annonce un
 *    encaissement que la banque ne verra jamais.
 *
 * 3. LA VENTE DE MARCHE COMPTE, avec `abs(quantite)` : le schema dit « signe
 *    selon le type » et une sortie est negative, la multiplier telle quelle
 *    rendrait une recette negative. Le prix est celui FIGE sur le mouvement,
 *    jamais celui du catalogue, S13 interdisant de reconstruire une vente
 *    passee depuis le prix actuel, une remise de stand etant courante.
 */
export async function compterPourAdministration(
  client: ClientBase,
  seuilStockFaible: number,
): Promise<ComptagesAdministration> {
  const [ligne] = await client.$queryRaw<
    {
      commandesAPreparer: bigint;
      commandesPretesAExpedier: bigint;
      commandesEnCours: bigint;
      variantesStockFaible: bigint;
      variantesIndisponibles: bigint;
      expeditionsEnTransit: bigint;
      messagesNonLus: bigint;
      retractationsEnCours: bigint;
      encaisseDuJourCentimes: bigint | number | null;
    }[]
  >`
    SELECT
      (SELECT count(*) FROM commande
        WHERE statut = 'CONFIRMEE')            AS "commandesAPreparer",
      (SELECT count(*) FROM commande
        WHERE statut = 'EN_PREPARATION')       AS "commandesPretesAExpedier",
      (SELECT count(*) FROM commande
        WHERE statut IN ('CONFIRMEE', 'EN_PREPARATION'))
                                               AS "commandesEnCours",
      (SELECT count(*) FROM variante
        WHERE archivee_a IS NULL
          AND greatest(quantite_physique - quantite_reservee, 0) <= ${seuilStockFaible})
                                               AS "variantesStockFaible",
      (SELECT count(*) FROM variante
        WHERE archivee_a IS NULL
          AND greatest(quantite_physique - quantite_reservee, 0) = 0)
                                               AS "variantesIndisponibles",
      (SELECT count(*) FROM commande
        WHERE statut = 'EXPEDIEE')             AS "expeditionsEnTransit",
      (SELECT count(*) FROM message
        WHERE statut = 'NOUVEAU')              AS "messagesNonLus",
      (SELECT count(*) FROM demande_retractation
        WHERE statut NOT IN ('REMBOURSEE', 'REFUSEE'))
                                               AS "retractationsEnCours",
      (
        SELECT coalesce(sum(montant_centimes - montant_rembourse_centimes), 0)
        FROM paiement
        WHERE statut IN ('REUSSI', 'PARTIELLEMENT_REMBOURSE')
          AND confirme_a >= date_trunc('day', now())
      )
      +
      (
        SELECT coalesce(sum(abs(quantite) * prix_unitaire_fige_centimes), 0)
        FROM mouvement_stock
        WHERE type = 'VENTE_EXTERNE'
          AND prix_unitaire_fige_centimes IS NOT NULL
          AND cree_a >= date_trunc('day', now())
      )                                        AS "encaisseDuJourCentimes"
  `;

  /*
   * UNE REQUETE D'AGREGATS SANS `FROM` REND TOUJOURS UNE LIGNE, et pourtant ce
   * cas se traite. TypeScript a raison de le signaler : l'index d'un tableau
   * n'est pas garanti par son type. Lever plutot que rendre des zeros, car des
   * zeros seraient indiscernables d'une boutique au repos et l'ecran
   * annoncerait « rien a faire » sur une base injoignable. Un ecran en erreur
   * se remarque, un tableau de bord faussement calme ne se remarque pas.
   */
  if (!ligne) {
    throw new Error(
      "Comptages d'administration : la requête n'a rendu aucune ligne",
    );
  }

  return {
    commandesAPreparer: Number(ligne.commandesAPreparer),
    commandesPretesAExpedier: Number(ligne.commandesPretesAExpedier),
    commandesEnCours: Number(ligne.commandesEnCours),
    variantesStockFaible: Number(ligne.variantesStockFaible),
    variantesIndisponibles: Number(ligne.variantesIndisponibles),
    expeditionsEnTransit: Number(ligne.expeditionsEnTransit),
    messagesNonLus: Number(ligne.messagesNonLus),
    retractationsEnCours: Number(ligne.retractationsEnCours),
    encaisseDuJourCentimes: Number(ligne.encaisseDuJourCentimes ?? 0),
  };
}
