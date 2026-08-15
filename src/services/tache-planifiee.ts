/**
 * Execution d'une tache planifiee sous verrou. LS-72, regle E8.
 *
 * CE QUE CE MODULE PROTEGE. Deux taches tourneront en production : la
 * liberation des reservations expirees toutes les cinq minutes, et la
 * reconciliation des paiements tous les quarts d'heure. Sans verrou, deux
 * instances de l'application les executeraient simultanement, et **pour la
 * liberation cela produirait une double decrementation de `quantiteReservee`**.
 * Du stock disparaitrait sans qu'aucune vente ne l'explique.
 *
 * POURQUOI EN BASE ET NON DANS REDIS. Le projet n'a pas Redis, section 5.3 du
 * cahier des charges l'ecarte faute de besoin demontre, et PostgreSQL est deja
 * la. L'ajouter pour cette seule fonction introduirait un service a exploiter
 * sur le VPS.
 *
 * POURQUOI UNE EXPIRATION. Sans elle, une instance qui meurt en cours de tache
 * laisserait le verrou pris pour toujours : la tache ne s'executerait plus
 * jamais, en silence, jusqu'a ce que quelqu'un le remarque. L'expiration borne
 * le degat a un cycle.
 *
 * CE MODULE N'EXECUTE AUCUNE LOGIQUE METIER, arbitrage du 30 juillet 2026 : le
 * squelette accueille, il n'execute pas. Les deux taches se remplissent en
 * phase 3 et 4.
 */
import { journaliser, journaliserErreur } from "@/lib/journal";
import { prisma } from "@/lib/prisma";
import { prendreVerrou, relacherVerrou } from "@/repositories/verrou";

/**
 * Les taches planifiees du projet, et leur duree de verrou.
 *
 * UNE TABLE ET NON DES CHAINES LIBRES. Le nom du verrou est une cle d'unicite
 * en base : une faute de frappe dans un appelant creerait un second verrou
 * portant un nom voisin, et les deux taches tourneraient en parallele en
 * croyant chacune detenir la sienne. Le type ferme la porte.
 *
 * LA DUREE DU VERROU N'EST PAS LA PERIODE DE LA TACHE. Elle borne le temps
 * pendant lequel une instance morte bloque la suivante, et doit donc rester
 * NETTEMENT SUPERIEURE a la duree d'execution normale, sinon une tache un peu
 * lente verrait son verrou expirer pendant qu'elle travaille et une seconde
 * instance demarrerait par-dessus. Elle doit aussi rester inferieure a
 * plusieurs periodes, sans quoi une instance morte ferait sauter de nombreux
 * cycles.
 *
 * Dix minutes pour une tache qui tourne toutes les cinq minutes et s'execute en
 * quelques secondes : deux cycles perdus au pire, et une marge de deux ordres
 * de grandeur sur la duree reelle.
 */
export const TACHES = {
  "liberation-reservations": { dureeVerrouSecondes: 600 },
  "reconciliation-paiements": { dureeVerrouSecondes: 900 },
  /**
   * Purge des journaux, LS-94. Une fois par jour, verrou d'une heure.
   *
   * LA DUREE DE VERROU EST PLUS LONGUE QUE CELLE DES DEUX AUTRES parce que
   * cette tache supprime des lignes plutot que d'en lire quelques-unes : un
   * `deleteMany` sur une table de plusieurs centaines de milliers de lignes
   * prend un temps que rien ne borne a l'avance. Une heure garde deux ordres
   * de grandeur au-dessus de la duree attendue, quelques secondes.
   *
   * SUR UNE TACHE QUOTIDIENNE, la regle « rester inferieure a plusieurs
   * periodes » se lit autrement que sur une tache de cinq minutes : une heure
   * ne represente qu'un vingt-quatrieme de la periode, donc une instance morte
   * ne fait sauter AUCUN cycle, contrairement aux deux autres taches qui en
   * perdent deux au pire.
   */
  "purge-journaux": { dureeVerrouSecondes: 3600 },
  /**
   * Purge de la quarantaine des medias, LS-102. ADR-007.
   *
   * CE QU'ELLE RAMASSE : les fichiers deposes en quarantaine dont le
   * televersement a ete interrompu avant le traitement. C'est le premier cas
   * d'erreur du parcours 3, et sans elle ces originaux resteraient sur le
   * volume indefiniment. Ils portent les metadonnees EXIF, position GPS du
   * domicile comprise : les laisser s'accumuler garde sur le disque
   * exactement la donnee que cette story existe pour retirer.
   *
   * ELLE NE TOUCHE JAMAIS AUX FICHIERS PUBLIES, qui vivent dans l'autre
   * dossier : `quarantaine/` et `public/` sont deux racines distinctes,
   * ADR-007, et c'est ce qui rend cette purge sans danger.
   *
   * DUREE DE VERROU D'UNE HEURE, comme `purge-journaux` et pour le meme motif :
   * elle supprime des fichiers plutot que d'en lire quelques-uns, et rien ne
   * borne a l'avance le temps que prend un parcours de dossier. Sur une tache
   * quotidienne, une heure ne represente qu'un vingt-quatrieme de la periode,
   * donc une instance morte ne fait sauter AUCUN cycle.
   */
  "purge-quarantaine-medias": { dureeVerrouSecondes: 3600 },
} as const;

export type NomTache = keyof typeof TACHES;

/** Les noms connus, pour valider une entree venant d'une URL. */
export const NOMS_TACHES = Object.keys(TACHES) as NomTache[];

/**
 * Ce qu'une execution rend a l'appelant.
 *
 * `IGNOREE` N'EST PAS UNE ERREUR. Une instance qui n'obtient pas le verrou a
 * fait exactement ce qu'on attend d'elle : ne rien faire. La route repond 200,
 * et non 409 : un cron qui recevrait une erreur toutes les cinq minutes
 * apprendrait a l'ignorer, et l'alerte reelle se noierait dedans.
 */
export type ResultatTache =
  | { etat: "EXECUTEE" }
  | { etat: "IGNOREE"; motif: "verrou-detenu-ailleurs" }
  | { etat: "ECHOUEE" };

/**
 * Execute une tache en garantissant qu'une seule instance la joue a la fois.
 *
 * LE RELACHEMENT EST DANS UN `finally`, ET C'EST NON NEGOCIABLE. Si le travail
 * leve, le verrou doit partir quand meme : sinon une seule exception bloque la
 * tache jusqu'a l'expiration, et une exception recurrente la bloque pour
 * toujours, chaque cycle reprenant le verrou pour re-echouer. Le `finally`
 * transforme un incident en incident borne.
 *
 * LE JETON EST ENGENDRE ICI, une fois par prise. Il identifie CETTE execution
 * et permet a `relacherVerrou` de refuser de relacher le verrou d'une autre
 * instance qui l'aurait repris apres expiration, voir le repository.
 *
 * ELLE NE LEVE PAS. Une tache planifiee n'a personne devant elle : remonter une
 * exception jusqu'a la route ne ferait qu'ecrire une trace de moins bonne
 * qualite. L'echec est journalise et rendu en `ECHOUEE`, ce qui laisse
 * l'appelant choisir son code de reponse.
 */
export async function executerSousVerrou(
  nom: NomTache,
  travail: () => Promise<void>,
): Promise<ResultatTache> {
  const jeton = crypto.randomUUID();
  const { dureeVerrouSecondes } = TACHES[nom];

  let obtenu: boolean;

  try {
    obtenu = await prendreVerrou(prisma, jeton, nom, dureeVerrouSecondes);
  } catch (erreur) {
    // Base injoignable : NE PAS EXECUTER. Sauter un cycle est sans
    // consequence, executer sans verrou rouvrirait la double execution que ce
    // module existe pour empecher.
    journaliserErreur("Prise de verrou impossible", erreur, { tache: nom });
    return { etat: "ECHOUEE" };
  }

  if (!obtenu) {
    journaliser("info", "Tache ignoree, verrou detenu ailleurs", {
      tache: nom,
    });
    return { etat: "IGNOREE", motif: "verrou-detenu-ailleurs" };
  }

  try {
    await travail();
    return { etat: "EXECUTEE" };
  } catch (erreur) {
    journaliserErreur("Tache planifiee en echec", erreur, { tache: nom });
    return { etat: "ECHOUEE" };
  } finally {
    try {
      const relachees = await relacherVerrou(prisma, nom, jeton);

      if (relachees === 0) {
        // Le verrou avait expire et une autre instance l'a repris pendant que
        // celle-ci travaillait. Ce n'est pas une erreur, c'est le signe que la
        // tache a depasse `dureeVerrouSecondes` : information d'exploitation
        // qui doit se voir, la duree meritant alors d'etre revue.
        journaliser("warn", "Verrou deja repris par une autre instance", {
          tache: nom,
        });
      }
    } catch (erreur) {
      // Le verrou expirera de lui-meme. Lever ici masquerait le resultat du
      // travail, qui est l'information utile.
      journaliserErreur("Relachement de verrou impossible", erreur, {
        tache: nom,
      });
    }
  }
}
