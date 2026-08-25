/**
 * Reservation du stock d'un panier, LS-50.
 *
 * Ce service porte les deux garanties que la primitive SQL ne peut pas donner
 * seule, parce qu'elles portent sur l'ORDRE et la REPETITION des instructions,
 * pas sur leur contenu :
 *
 * 1. LE TRI DETERMINISTE. L'`UPDATE` conditionnel prend un verrou de ligne
 *    implicite qu'il tient jusqu'au `COMMIT`. Deux paniers portant les memes
 *    variantes dans un ordre oppose se bloquent mutuellement, reproduit sur
 *    PostgreSQL 18 par `docs/prototypes/interblocage-panier.sh`. Trier par
 *    identifiant croissant rend l'ordre de prise identique pour tous : l'un
 *    attend l'autre au lieu de l'interbloquer.
 *
 * 2. LE REJEU BORNE. Le tri elimine les cycles entre deux reservations de
 *    panier, pas ceux qu'une transaction concurrente cree par un autre chemin,
 *    vente externe ou liberation de reservations expirees. La reponse est de
 *    rejouer, jamais d'ignorer.
 *
 * CE QUE LE TRI NE FAIT PAS. Il ne serialise rien et n'evite aucune attente :
 * deux paniers portant la meme piece se disputent toujours la meme ligne. Il
 * garantit uniquement que cette attente se resout au lieu de tourner en cycle.
 *
 * POURQUOI PAS `SELECT ... FOR UPDATE`, alternative ecartee par ADR-006 : elle
 * aggraverait le probleme en serialisant les acces a une variante unique, cas
 * central du projet ou chaque bijou est fait main.
 */
import { prisma } from "@/lib/prisma";
import { schemaPanier, valider } from "@/lib/validation";
import { reserverVariante } from "@/repositories/stock";

/** Duree de vie d'une reservation, alignee sur la tache de liberation. */
export const DUREE_RESERVATION_MINUTES = 30;

/**
 * Nombre total de tentatives, la premiere comprise.
 *
 * BORNE ET NON INFINI. Un rejeu sans borne transforme un interblocage
 * systematique en boucle qui tient une connexion pour toujours. Trois
 * tentatives couvrent le cas reel, un cycle avec une transaction concurrente
 * qui se resout des que l'autre valide ; au-dela, l'echec est structurel et
 * doit remonter pour etre vu.
 */
export const TENTATIVES_MAXIMUM = 3;

/** Une ligne de panier : quelle variante, en quelle quantite. */
export type LignePanier = {
  varianteId: string;
  quantite: number;
};

/**
 * Issue d'une tentative de reservation de panier.
 *
 * `SERVI` : toutes les lignes sont reservees, la transaction est validee.
 * `REFUSE` : au moins une ligne n'est pas disponible. La transaction entiere est
 *   annulee, aucune reservation partielle ne subsiste. `varianteRefusee` designe
 *   la premiere ligne en echec, de quoi nommer la piece au client.
 */
export type IssueReservationPanier =
  { statut: "SERVI" } | { statut: "REFUSE"; varianteRefusee: string };

/**
 * Erreur levee quand l'interblocage persiste apres toutes les tentatives.
 *
 * Distincte d'un refus metier : le stock etait peut-etre disponible, c'est la
 * contention qui a empeche de conclure. L'appelant peut inviter a reessayer,
 * la ou un refus demande de retirer la piece du panier.
 */
export class InterblocagePersistantError extends Error {
  constructor(
    readonly tentatives: number,
    options?: { cause?: unknown },
  ) {
    super(
      `Reservation abandonnee apres ${tentatives} tentatives, interblocage persistant.`,
      options,
    );
    this.name = "InterblocagePersistantError";
  }
}

/**
 * Refus metier, transporte par une exception POUR ANNULER LA TRANSACTION.
 *
 * ELLE NE SORT JAMAIS DE CE MODULE : `reserverPanier` la capture et la traduit
 * en `{ statut: "REFUSE" }`. Un refus reste un resultat pour l'appelant, pas une
 * panne.
 *
 * POURQUOI UNE EXCEPTION PLUTOT QU'UN `return`, et c'est le coeur du sujet :
 * `$transaction` VALIDE des que la fonction rend une valeur, et n'annule que si
 * elle LEVE. La premiere version de ce service sortait par un `return` en
 * croyant l'inverse. Mesure sur base reelle : panier de deux pieces dont une
 * indisponible, issue `REFUSE` rendue au client, et la piece disponible restait
 * a `quantite_reservee = 1` avec sa ligne de reservation committee.
 *
 * Consequence concrete de ce defaut, sur un catalogue de pieces uniques : la
 * piece disponible etait gelee trente minutes pour une commande refusee que
 * personne ne paierait, et le client suivant essuyait un refus sur une piece
 * physiquement en stock. ADR-024 l'interdit, « un refus annule la transaction
 * entiere plutot que de laisser une commande sans stock ».
 */
class RefusReservation extends Error {
  constructor(readonly varianteRefusee: string) {
    super(`Variante ${varianteRefusee} indisponible.`);
    this.name = "RefusReservation";
  }
}

/**
 * Ordonne les lignes d'un panier par identifiant de variante croissant.
 *
 * FONCTION EXPORTEE POUR ETRE TESTEE SEULE, et cible de la mutation exigee par
 * le critere d'acceptation : la neutraliser doit faire rougir le test de
 * concurrence multi-articles.
 *
 * `localeCompare` est ecarte volontairement : son ordre depend de la locale
 * d'execution, donc de la machine. Deux processus applicatifs qui trieraient
 * differemment reintroduiraient exactement le cycle que ce tri supprime. La
 * comparaison binaire de `<` est stable partout.
 *
 * Les doublons sont conserves tels quels : deux lignes sur la meme variante
 * restent adjacentes apres tri, donc prises dans la foulee sous le meme verrou.
 */
export function ordonnerLignes(
  lignes: readonly LignePanier[],
): readonly LignePanier[] {
  return [...lignes].sort((gauche, droite) => {
    if (gauche.varianteId < droite.varianteId) return -1;
    if (gauche.varianteId > droite.varianteId) return 1;
    return 0;
  });
}

/**
 * Vrai si l'erreur est un interblocage detecte par PostgreSQL.
 *
 * EXPORTEE POUR `services/commande.ts`, LS-117, qui porte le rejeu du chemin de
 * production. La recopier la-bas creerait deux definitions d'un meme fait dont
 * l'une pourrait manquer une des trois formes, ce qui est precisement le defaut
 * mesure en LS-71.
 *
 * TROIS FORMES POUR LE MEME EVENEMENT, selon le chemin d'acces. Mesure sur ce
 * depot, PostgreSQL 18 et Prisma 7.9, contre une transaction adverse reelle :
 *
 * - `40P01` : le `SQLSTATE` brut, rendu par le pilote `pg` en acces direct.
 * - `P2034` : la traduction de Prisma pour l'API TYPEE.
 * - `P2010` : ce que rend reellement une requete BRUTE, `$queryRawUnsafe`, code
 *   generique d'echec de requete brute. Le `SQLSTATE` d'origine n'est pas dans
 *   `code` mais enterre dans `meta.driverAdapterError.cause.code`.
 *
 * LE TROISIEME CAS EST CELUI DE CE SERVICE, dont la reservation passe par
 * `$queryRawUnsafe`. Ne tester que les deux premiers, ce que faisait la premiere
 * version, laissait le rejeu inatteignable par le seul chemin qu'il emprunte :
 * l'interblocage remontait alors brut a l'appelant sans qu'aucune tentative
 * supplementaire ait lieu. Trouve par une sonde qui provoque un vrai
 * interblocage, jamais par un double de test qui simule le code d'erreur.
 *
 * L'inspection descend donc dans la cause au lieu de se fier au code de surface.
 */
export function estInterblocage(erreur: unknown): boolean {
  const cible = erreur as {
    code?: string;
    meta?: { driverAdapterError?: { cause?: { code?: string } } };
  } | null;

  if (cible?.code === "40P01" || cible?.code === "P2034") {
    return true;
  }

  return cible?.meta?.driverAdapterError?.cause?.code === "40P01";
}

/**
 * Reserve toutes les lignes d'un panier, ou aucune.
 *
 * ATOMICITE, ADR-024 : les reservations s'ecrivent dans la meme transaction que
 * la commande qui les porte. Un refus sur une seule ligne annule l'ensemble,
 * aucune commande ne subsiste sans son stock et aucune piece ne reste bloquee
 * pour une commande qui n'existera jamais.
 *
 * LA SESSION DE PAIEMENT SE CREE APRES LE `COMMIT`, jamais dedans. Un appel
 * reseau a l'interieur tiendrait les verrous de ligne pendant tout
 * l'aller-retour, et son echec effacerait la commande par rollback. Ce service
 * ne fait donc aucun appel externe.
 *
 * Le niveau d'isolation reste `READ COMMITTED`, celui par defaut : le verrou de
 * ligne implicite de l'`UPDATE` conditionnel suffit a l'exclusion mutuelle, et
 * `Serializable` ajouterait des echecs de serialisation sans rien garantir de
 * plus ici.
 */
export async function reserverPanier(
  lignes: readonly LignePanier[],
  commandeId: string,
  options: { client?: typeof prisma } = {},
): Promise<IssueReservationPanier> {
  const base = options.client ?? prisma;

  // VALIDATION AU POINT D'ENTREE DU CAS D'USAGE, socle de LS-71. Elle remplace
  // la garde locale ecrite en LS-50, qui refusait deja zero, negatif et
  // decimal ; `schemaPanier` y ajoute la forme de l'identifiant et le refus
  // d'un panier vide.
  //
  // ELLE RESTE ICI MEME QUAND UN ADAPTATEUR VALIDE DEJA, et ce n'est pas une
  // redondance : un service s'appelle aussi depuis un autre service, chemin par
  // lequel aucun adaptateur ne passe. Le README de garde de `services/` porte
  // « la validation Zod des entrees non fiables ».
  //
  // Sans elle, une quantite a zero, negative ou decimale part jusqu'a
  // PostgreSQL et revient en erreur brute, `23514` ou `22P02`, donc en page
  // d'erreur serveur au lieu d'un refus lisible. Aucune corruption n'etait
  // possible, les CHECK tiennent : c'est la qualite du refus qui est en jeu,
  // pas l'invariant du stock.
  const validees = valider(schemaPanier, lignes);

  const ordonnees = ordonnerLignes(validees);

  let derniereErreur: unknown;

  for (let tentative = 1; tentative <= TENTATIVES_MAXIMUM; tentative += 1) {
    try {
      return await base.$transaction(async (transaction) => {
        for (const ligne of ordonnees) {
          const servie = await reserverVariante(transaction, {
            varianteId: ligne.varianteId,
            commandeId,
            quantite: ligne.quantite,
            dureeMinutes: DUREE_RESERVATION_MINUTES,
          });

          if (!servie) {
            // Sortie par une EXCEPTION, seule facon d'obtenir le rollback : un
            // `return` ferait valider la transaction avec les lignes deja
            // reservees. Voir `RefusReservation`.
            throw new RefusReservation(ligne.varianteId);
          }
        }

        return { statut: "SERVI" as const };
      });
    } catch (erreur) {
      // ORDRE CRITIQUE : le refus se traite AVANT l'interblocage et ne doit
      // jamais entrer dans la boucle de rejeu. Rejouer un refus repeterait trois
      // fois une transaction dont on sait qu'elle echouera, la piece manquante
      // ne reapparaissant pas entre deux tentatives.
      if (erreur instanceof RefusReservation) {
        return {
          statut: "REFUSE" as const,
          varianteRefusee: erreur.varianteRefusee,
        };
      }

      if (!estInterblocage(erreur)) {
        throw erreur;
      }
      // La transaction est deja annulee par PostgreSQL : la tentative suivante
      // repart d'un etat propre, sans reservation partielle a nettoyer.
      derniereErreur = erreur;
    }
  }

  throw new InterblocagePersistantError(TENTATIVES_MAXIMUM, {
    cause: derniereErreur,
  });
}
