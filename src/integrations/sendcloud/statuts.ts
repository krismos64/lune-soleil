/**
 * Correspondance des statuts de suivi Sendcloud, LS-131. ADR-042.
 *
 * CE MODULE PORTE LA REGLE LA PLUS COUTEUSE DU PROJET SI ELLE EST FAUSSE.
 * `Expedition.livreA` ouvre le delai de retractation, article L221-18, et
 * l'article L221-20 le porte a DOUZE MOIS quand l'information sur ce droit est
 * incorrecte. Un statut mal classe ne se voit pas a l'ecran, il se voit dans un
 * litige, des mois plus tard.
 *
 * LES IDENTIFIANTS VIENNENT DE L'API REELLE, releves le 10 septembre 2026 sur
 * `GET /api/v2/parcels/statuses`, TRENTE-CINQ statuts. La table de
 * `.claude/rules/legal.md` en decrivait quatre, ecrits en juillet sur le
 * vocabulaire Mondial Relay avant qu'ADR-035 ne fasse passer l'integration par
 * Sendcloud.
 *
 * IL NE FAIT AUCUN APPEL RESEAU et ne connait ni Prisma ni la base : c'est une
 * table de correspondance pure, ce qui la rend testable sans rien monter.
 */

/**
 * Les deux statuts qui constatent la prise de possession physique.
 *
 * DEUX ET NON UN, et c'est la correction centrale d'ADR-042. `Delivered` vise
 * la remise au client final a son adresse, `Shipment collected by customer` le
 * retrait dans un point de service. La description de LS-131 disait « remis au
 * destinataire, les trois modes », formulation qui suggerait un statut unique :
 * s'y tenir aurait laisse TOUTE livraison a domicile sans `livreA`, donc sans
 * delai de retractation ouvert et sans invitation a deposer un avis.
 */
export const STATUTS_LIVRES: ReadonlySet<number> = new Set([
  11, // Delivered, domicile
  93, // Shipment collected by customer, Point Relais et Locker
]);

/**
 * Les statuts qui constatent qu'un colis n'arrivera pas.
 *
 * ILS ALERTENT L'EXPLOITANTE, decision 3 d'ADR-042, arbitrage de Christophe du
 * 10 septembre 2026. Aucun statut de commande n'est cree et AUCUN mouvement de
 * stock n'est ecrit, ADR-030 : le traitement depend de faits que le site
 * ignore, l'exploitante arbitrant entre rembourser, reexpedier ou remettre en
 * vente selon l'etat reel de la piece.
 *
 * `Delivery attempt failed` N'EN FAIT PAS PARTIE, et la nuance compte : une
 * tentative echouee est suivie d'une seconde ou d'un report en relais. Alerter
 * dessus noierait l'exploitante sous des incidents qui se resolvent seuls.
 */
export const STATUTS_ECHEC_DEFINITIF: ReadonlySet<number> = new Set([
  80, // Unable to deliver
  62991, // Refused by recipient
  62992, // Returned to sender
  62997, // Address invalid
]);

/**
 * Ce statut constate-t-il que le client detient le colis ?
 *
 * LISTE BLANCHE ET JAMAIS LISTE NOIRE, decision 2 d'ADR-042. Un statut inconnu
 * ne livre pas, ce qui est le sens sur : les 35 statuts d'aujourd'hui peuvent
 * devenir 40, et un statut neuf qui livrerait par defaut resterait invisible
 * jusqu'au litige. Ne rien conclure allonge le delai du client, l'inverse
 * l'eteint trop tot.
 *
 * LES FAUX AMIS SONT DES STATUTS ORDINAIRES POUR CETTE FONCTION : ils rendent
 * `false` parce qu'ils ne sont pas dans la liste, sans traitement particulier.
 * `Awaiting customer pickup` dit que le colis attend au relais, `Delivery
 * attempt failed` que personne n'etait la, et un colis peut rester une semaine
 * en relais avant retrait.
 */
export function estLivre(statut: number): boolean {
  return STATUTS_LIVRES.has(statut);
}

/** Ce statut constate-t-il un echec dont l'exploitante doit etre avertie ? */
export function estEchecDefinitif(statut: number): boolean {
  return STATUTS_ECHEC_DEFINITIF.has(statut);
}

/**
 * Le colis se trouve dans un point de service, LS-131.
 *
 * SUR UNE EXPEDITION `DOMICILE`, IL SIGNALE LE REBASCULEMENT d'ADR-025 : un
 * colis prevu au domicile ne se trouve dans un relais que parce que le
 * transporteur l'y a reporte apres une tentative infructueuse. Aucun autre
 * chemin ne produit cette combinaison.
 *
 * LA DEFINITION OFFICIELLE NE PARLE PAS DU MODE PREVU, et c'est ce qui rend la
 * deduction sure : « The parcel has been delivered to a service point and is
 * awaiting collection by the end customer ». Elle decrit ou EST le colis, pas
 * ou il devait aller.
 *
 * IL SIGNALE, IL N'ECRIT PAS `Expedition.mode`, et c'est une limite du
 * FOURNISSEUR et non un choix. `chk_expedition_mode_point_relais` est une
 * EQUIVALENCE : un mode `POINT_RELAIS` exige un `pointRelaisId`, que Sendcloud
 * ne fournit pas dans ce scenario. Verifie sur la documentation officielle le
 * 10 septembre 2026 : `to_service_point` porte le point CHOISI A LA CREATION,
 * et aucun champ documente ne porte celui d'un report. Ecrire un identifiant
 * invente pour satisfaire la contrainte mettrait une fausse adresse sur une
 * expedition reelle.
 *
 * CE QU'IL SERT DONC : afficher « deposee en point de retrait » a l'exploitante,
 * LS-216, sans rien ecrire que la base ne puisse garantir.
 *
 * `Delivery method changed`, 62993, N'EST PAS UTILISE. Sa definition officielle
 * est « The method of delivery has been modified » : elle ne dit ni quel mode,
 * ni dans quel sens, ni pourquoi.
 *
 * IL NE LIVRE PAS, et les deux notions ne se confondent jamais : le client n'a
 * pas encore son colis, seul `estLivre` ouvre le delai de retractation.
 */
export function estDeposeEnPointRetrait(statut: number): boolean {
  return statut === STATUT_ATTENTE_RETRAIT;
}

/** `Awaiting customer pickup`, le colis attend au point de service. */
const STATUT_ATTENTE_RETRAIT = 12;
