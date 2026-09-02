/**
 * Expedition d'une commande, LS-130. Etape 11 du parcours 1.
 *
 * CE QUE CE SERVICE PORTE : la declaration par l'exploitante qu'un colis est
 * parti. Il ecrit l'expedition, horodate `expedieA` et fait avancer la commande,
 * les trois dans UNE transaction.
 *
 * LES DEUX MODES SONT DEUX FAITS DISTINCTS, ADR-025 et `PARCOURS.md`.
 * `Commande.modeLivraison` est ce que le client a choisi et paye ;
 * `Expedition.mode` est ce que le transporteur a execute. Un echec de livraison
 * a domicile rebascule vers un Point Relais change le second et JAMAIS le
 * premier : reecrire la commande ferait mentir la facture sur ce qui a ete
 * vendu.
 *
 * `livreA` N'EST ATTEIGNABLE PAR AUCUN CHEMIN D'ICI, et c'est une regle et non
 * un oubli. Cette date fait courir le delai de retractation, `legal.md` : elle
 * vient du suivi automatique de LS-131, et l'inventer d'un clic la ferait partir
 * d'une date fausse. Meme motif que `LIVREE`, ecarte des transitions manuelles
 * par LS-121.
 *
 * LA TRANSITION DE STATUT N'EST PAS REECRITE ICI : ce service consulte
 * `TRANSITIONS_ADMINISTRATRICE`, seule source de ce qui est permis. Une seconde
 * liste divergerait de la premiere, et l'ecran afficherait alors un bouton que
 * le service refuse, ou l'inverse.
 */
import { Prisma } from "@/generated/prisma/client";
import type { StatutCommande } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  EntreeInvalideError,
  schemaIdentifiant,
  schemaSaisieExpedition,
  valider,
} from "@/lib/validation";
import { historiserTransition } from "@/repositories/confirmation";
import {
  creerExpedition,
  lireExpeditionDeCommande,
  listerAExpedier,
  type CommandeAExpedier,
  type ExpeditionDeclaree,
  type SaisieExpedition,
} from "@/repositories/expedition";
import { TRANSITIONS_ADMINISTRATRICE } from "@/services/administration-commandes";

export type { CommandeAExpedier, ExpeditionDeclaree, SaisieExpedition };

/** Ce qu'une declaration d'expedition rend. L'ecran choisit les mots. */
export type IssueExpedition =
  | { statut: "EXPEDIEE" }
  /** Aucune commande sous cet identifiant. */
  | { statut: "INTROUVABLE" }
  /**
   * La commande n'est pas dans un etat d'ou l'on expedie.
   *
   * ELLE PORTE L'ETAT REEL, pour que l'ecran puisse dire « elle est deja
   * expediee » plutot qu'un refus opaque : entre l'affichage et le clic, un
   * autre onglet a pu faire avancer la commande.
   */
  | { statut: "STATUT_INCOMPATIBLE"; statutActuel: StatutCommande }
  /** Cette commande porte deja une expedition, `commande_id` etant unique. */
  | { statut: "DEJA_EXPEDIEE" }
  /** Saisie refusee, le message dit lequel des champs. */
  | { statut: "INVALIDE"; message: string };

/** Nombre de colis affiches dans la file de preparation. */
const LIMITE_LISTE = 100;

/**
 * Les commandes en attente de depart.
 *
 * ELLE NE LIT QUE `EN_PREPARATION`, seul etat d'ou une expedition peut naitre.
 * Y melanger les commandes confirmees ferait preparer un colis avant que
 * l'exploitante ait declare s'en occuper, et la file cesserait de dire ce qui
 * reste a faire.
 */
export async function listerCommandesAExpedier(
  client: typeof prisma = prisma,
): Promise<CommandeAExpedier[]> {
  return listerAExpedier(client, LIMITE_LISTE);
}

/** Relit l'expedition d'une commande, `null` tant qu'aucune n'existe. */
export async function lireExpedition(
  commandeId: string,
  client: typeof prisma = prisma,
): Promise<ExpeditionDeclaree | null> {
  const identifiant = valider(schemaIdentifiant, commandeId);

  return lireExpeditionDeCommande(client, identifiant);
}

/**
 * Declare qu'un colis est parti, sur geste de l'exploitante.
 *
 * `acteurId` VIENT DE LA SESSION, jamais d'un parametre d'interface,
 * invariant 2 : l'appelant a deja etabli l'identite par `exigerRole`.
 *
 * L'ECRITURE ET LA TRANSITION SONT DANS LA MEME TRANSACTION, et c'est ce qui
 * empeche l'etat le plus penible : une expedition ecrite sur une commande
 * restee « en preparation », ou l'inverse, une commande annoncee expediee sans
 * qu'aucun numero de suivi n'existe. Une panne entre les deux ecritures
 * laisserait sinon l'un des deux faits sans l'autre.
 *
 * LE STATUT DE PAIEMENT N'EST PAS TOUCHE, axes distincts de `payments.md` :
 * expedier ne dit rien de l'encaissement, qui a eu lieu bien avant.
 */
export async function declarerExpedition({
  commandeId,
  saisie,
  acteurId,
  client = prisma,
}: {
  commandeId: string;
  saisie: unknown;
  acteurId: string;
  client?: typeof prisma;
}): Promise<IssueExpedition> {
  /*
   * L'IDENTIFIANT EST VALIDE AVANT TOUT, et il LEVE plutot que de rendre un
   * refus : un identifiant difforme ne vient pas d'une exploitante qui se
   * trompe de champ, il vient d'un appel forge. L'adaptateur le traduit.
   */
  const identifiant = valider(schemaIdentifiant, commandeId);

  /*
   * LA SAISIE, ELLE, REND UN REFUS PORTEUR DE SON MESSAGE. Un mode de retrait
   * sans point est une erreur que l'exploitante peut corriger a l'ecran, pas
   * une panne : lui rendre une exception l'obligerait a deviner.
   */
  let saisieValidee: SaisieExpedition;

  try {
    const brute = valider(schemaSaisieExpedition, saisie);

    saisieValidee = {
      ...brute,
      /*
       * UN NUMERO REDUIT A DES ESPACES DEVIENT NUL, jamais une chaine vide. Les
       * deux se ressemblent a l'ecran et se distinguent en base : `""` ferait
       * croire a un numero connu, et LS-131 construirait une URL de suivi vide.
       */
      numeroSuivi:
        brute.numeroSuivi === null || brute.numeroSuivi === ""
          ? null
          : brute.numeroSuivi,
    };
  } catch (erreur) {
    if (erreur instanceof EntreeInvalideError) {
      return { statut: "INVALIDE", message: erreur.message };
    }
    throw erreur;
  }

  try {
    return await client.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const commande = await transaction.commande.findUnique({
          where: { id: identifiant },
          select: { statut: true },
        });

        if (commande === null) {
          return { statut: "INTROUVABLE" as const };
        }

        /*
         * LA TABLE DE LS-121 DECIDE, PAS UNE LISTE LOCALE. `EXPEDIEE` n'y est
         * atteignable que depuis `EN_PREPARATION` : une commande non payee ou
         * deja partie est donc refusee par la meme source que celle qui
         * gouverne les boutons de l'ecran de detail.
         */
        const permises: readonly StatutCommande[] =
          TRANSITIONS_ADMINISTRATRICE[commande.statut];

        if (!permises.includes("EXPEDIEE")) {
          return {
            statut: "STATUT_INCOMPATIBLE" as const,
            statutActuel: commande.statut,
          };
        }

        /*
         * L'EXPEDITION EST ECRITE AVANT LA TRANSITION, et l'ordre compte : c'est
         * elle qui porte l'unicite. Si une seconde declaration concurrente
         * arrive, `P2002` leve ICI, avant que le statut ne bouge, et la
         * transaction entiere est annulee.
         */
        await creerExpedition(transaction, {
          commandeId: identifiant,
          saisie: saisieValidee,
        });

        /*
         * L'ECRITURE PORTE LE STATUT DE DEPART DANS SON `WHERE`, meme motif que
         * `changerStatutCommande` : entre la lecture et l'ecriture, une tache
         * peut avoir fait avancer la commande, et appliquer alors une transition
         * calculee sur un etat perime la ferait reculer.
         */
        const { count } = await transaction.commande.updateMany({
          where: { id: identifiant, statut: commande.statut },
          data: { statut: "EXPEDIEE" },
        });

        if (count === 0) {
          /*
           * LA COMMANDE A BOUGE ENTRE LA LECTURE ET L'ECRITURE. Lever annule la
           * transaction, donc l'expedition ecrite juste au-dessus : sans cela
           * un colis serait declare parti sur une commande annulee entre-temps.
           */
          throw new CommandeDeplaceeError();
        }

        /*
         * L'HISTORISATION EST DANS LA MEME TRANSACTION, regle S9. `origine:
         * ADMIN` et un acteur nomme, la ou les chemins automatiques ecrivent
         * `SYSTEME` : c'est cette distinction qui permet de savoir, six mois
         * plus tard, si un colis a ete declare parti par une personne.
         */
        await historiserTransition(transaction, {
          commandeId: identifiant,
          statutPrecedent: commande.statut,
          statutNouveau: "EXPEDIEE",
          origine: "ADMIN",
          acteurId,
        });

        return { statut: "EXPEDIEE" as const };
      },
    );
  } catch (erreur) {
    /*
     * `P2002` EST RATTRAPE ICI, HORS DE LA TRANSACTION, ET C'EST OBLIGATOIRE.
     * Une violation d'unicite avorte la transaction PostgreSQL entiere, `25P02`
     * : la rattraper DEDANS puis continuer echouerait a la requete suivante.
     * Verifie via Context7 sur Prisma 7, et deja mesure sur ce depot en LS-119.
     *
     * IL SIGNIFIE QU'UNE AUTRE DECLARATION A GAGNE, `commande_id` etant unique.
     * C'est le double clic et les deux onglets : le perdant sort en refus, et
     * rien de ce qu'il portait n'a ete ecrit.
     */
    if (
      erreur instanceof Prisma.PrismaClientKnownRequestError &&
      erreur.code === "P2002"
    ) {
      return { statut: "DEJA_EXPEDIEE" };
    }

    if (erreur instanceof CommandeDeplaceeError) {
      /*
       * LA COMMANDE A BOUGE, ET RIEN N'A ETE ECRIT. L'ecran relit son etat
       * reel : le dire « deja expediee » serait faux, elle peut avoir ete
       * annulee.
       */
      const commande = await client.commande.findUnique({
        where: { id: identifiant },
        select: { statut: true },
      });

      return commande === null
        ? { statut: "INTROUVABLE" }
        : { statut: "STATUT_INCOMPATIBLE", statutActuel: commande.statut };
    }

    throw erreur;
  }
}

/**
 * La commande a change d'etat entre la lecture et l'ecriture.
 *
 * ELLE EXISTE POUR ANNULER LA TRANSACTION, pas pour etre vue : `$transaction`
 * ne defait ses ecritures que sur une exception, un `return` la validerait.
 * C'est le piege « un return valide la transaction », deja rencontre ici.
 */
class CommandeDeplaceeError extends Error {
  constructor() {
    super("La commande a changé d'état pendant la déclaration d'expédition.");
    this.name = "CommandeDeplaceeError";
  }
}
