/**
 * Consultation et acquittement des alertes critiques, LS-98.
 *
 * ------------------------------------------------------------------
 * POURQUOI CE SERVICE EXISTE, ET CE QU'IL FERME.
 *
 * SEPT services levent des alertes depuis LS-131 et avant, dont
 * `DOUBLE_ENCAISSEMENT` et `MONTANT_DIVERGENT`. AUCUN code ne les lisait avant
 * le 11 septembre 2026 : l'exploitante n'avait aucun moyen de savoir qu'un
 * incident financier avait ete signale.
 *
 * LE MECANISME ETAIT COMPLET par ailleurs, gravite, cible, index d'unicite et
 * colonnes d'acquittement comprises. Il manquait l'ecran, ce qui rendait tout
 * le reste inutile : une alerte que personne ne voit est un incident non traite.
 * ------------------------------------------------------------------
 *
 * L'ACQUITTEMENT N'EST PAS UNE ACTION SENSIBLE, et la question a ete posee
 * plutot que laissee implicite. Il ne touche ni l'argent, ni une configuration
 * d'exploitation, ni une donnee client : il dit « j'ai vu ». La regle E7 rend
 * l'alerte IMMUABLE par ailleurs, elle ne se supprime jamais, et l'appelant
 * doit deja etre `ADMINISTRATRICE`. Etirer `PARAMETRES_BOUTIQUE` pour couvrir
 * ce geste serait le defaut de LS-99 en sens oppose.
 */
import { prisma } from "@/lib/prisma";
import {
  type AlerteLue,
  type ClientBase,
  acquitterAlerte,
  listerAlertesAcquittees,
  listerAlertesOuvertes,
} from "@/repositories/alerte";

export type { AlerteLue } from "@/repositories/alerte";

/**
 * Combien d'alertes acquittees l'ecran garde a l'affichage.
 *
 * VINGT, ET LA BORNE EST UN JUGEMENT : l'historique sert a se souvenir d'un
 * incident recent, jamais a auditer. Une alerte plus ancienne reste en base,
 * regle E7, et se relit par la console si besoin.
 *
 * LES OUVERTES NE SONT PAS BORNEES, contrairement a celles-ci : en rater une
 * serait manquer un incident.
 */
export const ALERTES_ACQUITTEES_AFFICHEES = 20;

/** Ce que l'ecran d'alertes affiche. */
export type EtatAlertes = {
  ouvertes: AlerteLue[];
  acquittees: AlerteLue[];
};

/** Lit les deux listes en une passe. */
export async function lireAlertes(
  client: ClientBase = prisma,
): Promise<EtatAlertes> {
  const [ouvertes, acquittees] = await Promise.all([
    listerAlertesOuvertes(client),
    listerAlertesAcquittees(client, ALERTES_ACQUITTEES_AFFICHEES),
  ]);

  return { ouvertes, acquittees };
}

/** Ce qu'un acquittement produit. */
export type IssueAcquittement =
  | { statut: "ACQUITTEE" }
  /**
   * L'alerte etait deja acquittee, ou n'existe pas.
   *
   * LES DEUX CAS SE CONFONDENT DELIBEREMENT, et c'est une decision de securite
   * plutot qu'une approximation : distinguer « introuvable » de « deja
   * acquittee » revelerait l'existence d'un identifiant a qui le devine. Meme
   * regle que le 404 de la route de facture.
   *
   * CE N'EST PAS UN ECHEC POUR AUTANT. Un double clic tombe ici, et l'ecran
   * doit le presenter comme un fait sans gravite : l'alerte est traitee.
   */
  | { statut: "DEJA_TRAITEE" };

/**
 * Acquitte une alerte au nom de l'appelant.
 *
 * `acquitteeParId` VIENT DE LA SESSION, jamais d'un parametre, invariant 2.
 * Cette signature n'accepte aucun identifiant d'utilisateur : l'adaptateur lui
 * remet l'identite que `exigerRole` a rendue.
 *
 * LE PREMIER ACQUITTEMENT GAGNE, le repository posant `acquitteeA: null` dans
 * son `WHERE` : un second geste n'ecrase ni la date ni le nom du premier, et
 * l'historique continue de dire qui a reellement traite l'incident.
 */
export async function acquitter(
  parametres: { alerteId: string; acquitteeParId: string },
  client: ClientBase = prisma,
): Promise<IssueAcquittement> {
  const { acquittee } = await acquitterAlerte(client, parametres);

  return acquittee ? { statut: "ACQUITTEE" } : { statut: "DEJA_TRAITEE" };
}
